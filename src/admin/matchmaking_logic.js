// --- CONSTANTES ---
// Mapea los horarios específicos a los turnos (mañana/tarde)
// Esto es crucial para cruzar la disponibilidad (ej: "mañana") con los slots (ej: "09:00")
const HORARIOS_TURNOS = {
    '09:00': 'mañana',
    '10:30': 'mañana',
    '12:30': 'mañana',
    '14:30': 'tarde',
    '16:00': 'tarde'
};
// Configuración de revancha
const ALLOW_REMATCH_IF_NEEDED = true;

/**
 * Función principal (El Cerebro). Exportada para ser usada por match_suggester.js
 * Recibe todos los datos de entrada y devuelve la grilla de sugerencias y los jugadores sobrantes.
 * @param {object} inputs - Un objeto grande con todos los datos de la UI y de Supabase.
 * @returns {Promise<object>} - { suggestionsBySlot, oddPlayers }
 */
export async function generateMatchSuggestions(inputs) {
    const {
        allPlayers, // Map(id, {name, category_id})
        inscriptions, // [{player_id, zone_name, tournament_id}, ...]
        availability, // [{player_id, available_date, time_slot, zone}, ...]
        history, // [{player1_id, player2_id, ...}, ...]
        programmedMatches, // [{match_date, match_time, location}, ...]
        availableSlots, // [{sede, date, time, turno, canchasDisponibles}, ...]
        categories, // [{id, name}, ...]
        tournaments // [{id, name, category_id, categoryName}, ...]
    } = inputs;

    console.log("Iniciando generación de sugerencias con:", inputs);

    // 1. Preparar "Pool de Jugadores"
    // Crea un Map(player_id -> PlayerData) con info de dispo, historial, categoría, etc.
    const playerPool = preparePlayerPool(inscriptions, availability, history, allPlayers, tournaments);
    
    // 2. Preparar "Cola de Slots"
    // Crea una lista de canchas individuales libres, descontando las ya programadas.
    const slotQueue = prepareSlotQueue(availableSlots, programmedMatches);

    // 3. Inicializar
    const suggestionsBySlot = {}; // Objeto para agrupar partidos por slot (Key: "sede|fecha|hora")
    const assignedPlayers = new Set(); // IDs de jugadores ya asignados en esta ronda
    
    // 4. Llenar Slots (Primera Pasada: Sin Revanchas)
    // Ordenar el pool por prioridad (menos jugados primero)
    const sortedPlayerPool = [...playerPool.values()].sort((a, b) => a.matchesPlayed - b.matchesPlayed);
    
    // La función fillSlots MODIFICA assignedPlayers y suggestionsBySlot
    fillSlots(slotQueue, sortedPlayerPool, assignedPlayers, suggestionsBySlot, false);
    
    // 5. Llenar Slots (Segunda Pasada: Revanchas para sobrantes)
    if (ALLOW_REMATCH_IF_NEEDED) {
        // Volver a calcular slots libres y jugadores sobrantes
        const remainingSlots = slotQueue.filter(slot => !slot.filledBy); // Slots que no se llenaron
        const remainingPlayers = sortedPlayerPool.filter(p => !assignedPlayers.has(p.id)); // Jugadores no asignados
        
        if (remainingSlots.length > 0 && remainingPlayers.length > 1) {
            console.log(`Buscando revanchas para ${remainingPlayers.length} jugadores en ${remainingSlots.length} slots...`);
            // Se llama con 'allowRevancha = true'
            fillSlots(remainingSlots, remainingPlayers, assignedPlayers, suggestionsBySlot, true);
        }
    }

    // 6. Recopilar Sobrantes Finales
    const oddPlayers = [];
    playerPool.forEach(player => {
        if (!assignedPlayers.has(player.id)) {
            // Determinar razón por la que sobró
            let reason = "Sin coincidencias";
            if (!player.isAvailableThisWeek) {
                reason = "Sin disponibilidad cargada";
            }
            // Asegurarnos que el jugador pertenecía a las categorías seleccionadas
            if (categories.find(c => c.id === player.category_id)) {
                oddPlayers.push({
                    player_id: player.id,
                    categoryName: player.categoryName,
                    reason: reason
                });
            }
        }
    });

    console.log("Sugerencias Generadas:", suggestionsBySlot);
    console.log("Sobrantes:", oddPlayers);

    return { suggestionsBySlot, oddPlayers };
}

/**
 * Prepara el pool de jugadores con toda la información necesaria para el matchmaking.
 * @returns {Map<number, object>} Un Map donde la clave es player_id y el valor es un objeto con info del jugador.
 */
function preparePlayerPool(inscriptions, availability, history, allPlayers, tournaments) {
    const playerPool = new Map();
    const historySet = new Set(); // Set de "id1-id2"
    const matchesPlayedCount = {}; // Map de playerId -> count

    // Contar partidos jugados
    history.forEach(match => {
        // Asumimos singles por ahora (player1 vs player2)
        const p1 = match.player1_id;
        const p2 = match.player2_id;
        if (p1 && p2) {
            // Solo contar si ambos jugadores están en el pool de 'allPlayers' (por si acaso)
            if (allPlayers.has(p1) && allPlayers.has(p2)) {
                const pairKey = [p1, p2].sort().join('-');
                historySet.add(pairKey);
                matchesPlayedCount[p1] = (matchesPlayedCount[p1] || 0) + 1;
                matchesPlayedCount[p2] = (matchesPlayedCount[p2] || 0) + 1;
            }
        }
    });

    // Crear entrada para cada jugador inscrito
    inscriptions.forEach(ins => {
        const playerInfo = allPlayers.get(ins.player_id);
        const tournamentInfo = tournaments.find(t => t.id === ins.tournament_id);
        
        if (!playerInfo || !tournamentInfo) return; // Ignorar si falta info

        // Usar la primera inscripción encontrada para los datos base
        if (!playerPool.has(ins.player_id)) {
            playerPool.set(ins.player_id, {
                id: ins.player_id,
                category_id: tournamentInfo.category_id,
                categoryName: tournamentInfo.categoryName,
                zone_name: ins.zone_name || null,
                tournament_id: ins.tournament_id,
                matchesPlayed: matchesPlayedCount[ins.player_id] || 0,
                playedOpponents: new Set(), // Se llenará abajo
                availability: new Map(), // Map de "YYYY-MM-DD|turno" -> Set(['funes', 'centro', 'ambas'])
                isAvailableThisWeek: false,
                isInSelectedCategories: true // Marcamos que sí está en las categorías seleccionadas
            });
        }
        // Podríamos añadir lógica para manejar múltiples inscripciones, pero por ahora usamos la primera.
    });

    // Llenar disponibilidad y oponentes jugados
    playerPool.forEach(player => {
        // Llenar disponibilidad
        availability.forEach(avail => {
            if (avail.player_id === player.id) {
                // Clave: "2025-10-25|mañana"
                const key = `${avail.available_date}|${avail.time_slot}`;
                if (!player.availability.has(key)) {
                    player.availability.set(key, new Set());
                }
                player.availability.get(key).add(avail.zone.toLowerCase()); // Guardar 'funes', 'centro' o 'ambas'
                player.isAvailableThisWeek = true;
            }
        });

        // Llenar oponentes jugados
        historySet.forEach(pairKey => {
            const [p1_id, p2_id] = pairKey.split('-').map(Number);
            if (p1_id === player.id) {
                player.playedOpponents.add(p2_id);
            } else if (p2_id === player.id) {
                player.playedOpponents.add(p1_id);
            }
        });
    });

    return playerPool;
}

/**
 * Prepara la cola de slots de canchas disponibles, descontando los ya programados.
 * @returns {Array<object>} Una lista de objetos, cada uno es un slot de cancha individual.
 */
function prepareSlotQueue(availableSlots, programmedMatches) {
    const slotQueue = [];

    // Contar partidos ya programados por slot (sede|fecha|hora)
    const programmedCounts = programmedMatches.reduce((acc, match) => {
        if (!match.match_date || !match.match_time || !match.location) return acc; // Ignorar partidos sin datos
        
        const date = match.match_date.split('T')[0];
        const time = match.match_time.substring(0, 5);
        const sede = (match.location || 'desconocida').split(' - ')[0].toLowerCase().trim();
        const key = `${sede}|${date}|${time}`;
        
        // Contar solo si el horario y sede coincide con los slots definidos por el admin
        if (availableSlots.some(s => s.sede === sede && s.date === date && s.time === time)) {
             acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
    }, {});

    // Crear la cola de canchas libres
    availableSlots.forEach(slot => {
        const key = `${slot.sede}|${slot.date}|${slot.time}`;
        const programmedCount = programmedCounts[key] || 0;
        const canchasLibres = slot.canchasDisponibles - programmedCount;

        // Añadir solo las canchas que QUEDAN LIBRES
        for (let i = 1; i <= canchasLibres; i++) {
            slotQueue.push({
                key: key, // "funes|2025-10-25|09:00"
                sede: slot.sede,
                date: slot.date,
                time: slot.time,
                turno: HORARIOS_TURNOS[slot.time], // 'mañana' o 'tarde'
                canchaNum: programmedCount + i, // Ej: Si hay 2 programados, empieza en Cancha 3
                filledBy: null // Para marcar si se llena
            });
        }
    });
    
    // Ordenar la cola de slots (ej. por fecha/hora, luego sede)
    slotQueue.sort((a, b) => a.key.localeCompare(b.key));
    
    return slotQueue;
}

/**
 * Itera sobre los slots y los jugadores para llenarlos.
 * Esta función MODIFICA los arrays/sets de entrada.
 */
function fillSlots(slotQueue, sortedPlayerPool, assignedPlayers, suggestionsBySlot, allowRevancha) {
    
    // Iterar sobre cada slot de cancha disponible
    for (const slot of slotQueue) {
        if (slot.filledBy) continue; // Slot ya llenado en una pasada anterior

        const availabilityKey = `${slot.date}|${slot.turno}`; // Ej: "2025-10-25|mañana"

        // 1. Encontrar Jugador A
        let playerA = null;
        for (const p of sortedPlayerPool) { // Itera sobre la lista ordenada por prioridad
            if (
                !assignedPlayers.has(p.id) && // No asignado esta ronda
                p.availability.has(availabilityKey) && // Puede en esta fecha/turno
                (p.availability.get(availabilityKey).has(slot.sede) || p.availability.get(availabilityKey).has('ambas')) // Puede en esta sede
            ) {
                playerA = p;
                break; // Encontramos al primer jugador prioritario disponible
            }
        }
        if (!playerA) continue; // No hay nadie disponible para este slot, pasar al siguiente slot

        // 2. Encontrar Jugador B
        let playerB = null;
        let foundRevancha = null; // Guardar la primera revancha posible como fallback

        for (const p of sortedPlayerPool) {
            if (p.id === playerA.id || assignedPlayers.has(p.id)) continue; // No él mismo, ni ya asignado

            // Verificar disponibilidad, categoría y zona
            if (
                p.availability.has(availabilityKey) &&
                (p.availability.get(availabilityKey).has(slot.sede) || p.availability.get(availabilityKey).has('ambas')) &&
                p.category_id === playerA.category_id &&
                p.zone_name === playerA.zone_name
            ) {
                // Verificar historial
                const alreadyPlayed = playerA.playedOpponents.has(p.id);
                
                if (!alreadyPlayed) {
                    // Opción ideal (sin revancha), lo tomamos y salimos
                    playerB = p;
                    break; 
                }
                // Si ya jugaron y estamos en modo revancha (y no hemos encontrado a nadie aún)
                else if (allowRevancha && !foundRevancha) {
                    foundRevancha = p; // Guardar esta revancha como opción de fallback
                    // No hacemos break, seguimos buscando por si hay otro (sin revancha)
                }
            }
        } // Fin for playerB

        // Si no encontramos a nadie nuevo (playerB es null), pero encontramos una revancha
        if (!playerB && foundRevancha) {
            playerB = foundRevancha; // Usar la revancha como último recurso
        }

        // 3. Asignar si se encontró pareja
        if (playerB) {
            const slotKey = `${slot.sede}|${slot.date}|${slot.time}`;
            if (!suggestionsBySlot[slotKey]) {
                suggestionsBySlot[slotKey] = [];
            }

            const isRevancha = playerA.playedOpponents.has(playerB.id);

            suggestionsBySlot[slotKey].push({
                canchaNum: slot.canchaNum,
                playerA_id: playerA.id,
                playerB_id: playerB.id,
                categoryName: playerA.categoryName,
                isRevancha: isRevancha
            });

            // Marcar como asignados
            assignedPlayers.add(playerA.id);
            assignedPlayers.add(playerB.id);
            slot.filledBy = playerA.id; // Marcar slot como lleno
        }
    } // Fin for slot
}