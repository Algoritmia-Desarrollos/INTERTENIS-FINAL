// --- CONSTANTES ---
const HORARIOS_TURNOS = {
    '09:00': 'mañana', '10:30': 'mañana', '12:30': 'mañana',
    '14:30': 'tarde', '16:00': 'tarde'
};
const ALLOW_REMATCH_IF_NEEDED = true;

/**
 * Función principal.
 * @param {object} inputs - { allPlayers, playerMatchCounts, inscriptions, availability, history, programmedMatches, availableSlots, categories, tournaments }
 * @returns {Promise<object>} - { suggestionsBySlot, oddPlayers }
 */
export async function generateMatchSuggestions(inputs) {
    const {
        allPlayers, // Map(id, {name, category_id})
        playerMatchCounts, // Map(playerId -> count) para torneos seleccionados
        inscriptions, // [{player_id, zone_name, tournament_id}, ...]
        availability, // [{player_id, available_date, time_slot, zone}, ...]
        history, // Historial COMPLETO de los torneos seleccionados [{player1_id, player2_id, ...}, ...]
        programmedMatches, // [{match_date, match_time, location}, ...]
        availableSlots, // [{sede, date, time, turno, canchasDisponibles}, ...]
        categories, // [{id, name}, ...]
        tournaments // [{id, name, category_id, categoryName}, ...]
    } = inputs;

    console.log("Iniciando generación con PJ:", playerMatchCounts);

    // 1. Preparar "Pool de Jugadores"
    const playerPool = preparePlayerPool(inscriptions, availability, history, allPlayers, tournaments, playerMatchCounts);

    // 2. Preparar "Cola de Slots"
    const slotQueue = prepareSlotQueue(availableSlots, programmedMatches);

    // 3. Inicializar
    const suggestionsBySlot = {};
    const assignedPlayers = new Set();

    // 4. Llenar Slots (Primera Pasada: Sin Revanchas)
    // Ordenar por PJ (menos jugados primero)
    const sortedPlayerPool = [...playerPool.values()].sort((a, b) => a.matchesPlayed - b.matchesPlayed);

    fillSlots(slotQueue, sortedPlayerPool, assignedPlayers, suggestionsBySlot, false); // allowRevancha = false

    // 5. Llenar Slots (Segunda Pasada: Revanchas si es necesario)
    if (ALLOW_REMATCH_IF_NEEDED) {
        const remainingSlots = slotQueue.filter(slot => !slot.filledBy);
        const remainingPlayers = sortedPlayerPool.filter(p => !assignedPlayers.has(p.id));

        if (remainingSlots.length > 0 && remainingPlayers.length > 1) {
            console.log(`Buscando revanchas para ${remainingPlayers.length} jugadores en ${remainingSlots.length} slots...`);
            // Se llama con 'allowRevancha = true'
            fillSlots(remainingSlots, remainingPlayers, assignedPlayers, suggestionsBySlot, true);
        }
    }

    // 6. Recopilar Sobrantes Finales
    const oddPlayers = []; // Ahora guardará { player_id, categoryName, reason }
    playerPool.forEach(player => {
        if (!assignedPlayers.has(player.id)) {
            let reason = "Sin coincidencias disponibles";
            if (!player.isAvailableThisWeek) {
                reason = "Sin disponibilidad cargada esta semana";
            }
            // Asegurar que el jugador pertenece a las categorías seleccionadas
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

    // No devolver playerMatchCounts aquí, ya está calculado en match_suggester.js
    return { suggestionsBySlot, oddPlayers };
}

/**
 * Prepara el pool de jugadores.
 * @param {Map<number, number>} playerMatchCounts - Map(playerId -> count) de partidos jugados en torneos seleccionados.
 * @returns {Map<number, object>}
 */
function preparePlayerPool(inscriptions, availability, history, allPlayers, tournaments, playerMatchCounts) {
    const playerPool = new Map();
    const historySet = new Set(); // Set de "id1-id2" para evitar revanchas

    // Crear Set de historial para búsqueda rápida
    history.forEach(match => {
        const p1 = match.player1_id;
        const p2 = match.player2_id;
        if (p1 && p2 && allPlayers.has(p1) && allPlayers.has(p2)) {
            historySet.add([p1, p2].sort().join('-'));
        }
    });

    // Crear entrada base para cada jugador inscrito
    inscriptions.forEach(ins => {
        const playerInfo = allPlayers.get(ins.player_id);
        const tournamentInfo = tournaments.find(t => t.id === ins.tournament_id);

        if (!playerInfo || !tournamentInfo) return;

        if (!playerPool.has(ins.player_id)) {
            playerPool.set(ins.player_id, {
                id: ins.player_id,
                category_id: tournamentInfo.category_id,
                categoryName: tournamentInfo.categoryName,
                zone_name: ins.zone_name || null,
                tournament_id: ins.tournament_id,
                matchesPlayed: playerMatchCounts.get(ins.player_id) || 0, // Usar PJ calculado externamente
                playedOpponents: new Set(), // Se llena abajo (historial para evitar revancha)
                availability: new Map(), // "YYYY-MM-DD|turno" -> Set(['funes', 'centro', 'ambas'])
                isAvailableThisWeek: false
            });
        }
    });

    // Llenar disponibilidad y oponentes jugados (para evitar revancha)
    playerPool.forEach(player => {
        availability.forEach(avail => {
            if (avail.player_id === player.id) {
                const key = `${avail.available_date}|${avail.time_slot}`;
                if (!player.availability.has(key)) player.availability.set(key, new Set());
                player.availability.get(key).add(avail.zone.toLowerCase());
                player.isAvailableThisWeek = true;
            }
        });

        historySet.forEach(pairKey => {
            const [p1_id, p2_id] = pairKey.split('-').map(Number);
            if (p1_id === player.id) player.playedOpponents.add(p2_id);
            else if (p2_id === player.id) player.playedOpponents.add(p1_id);
        });
    });

    return playerPool;
}


/**
 * Prepara la cola de slots de canchas disponibles.
 * @returns {Array<object>}
 */
function prepareSlotQueue(availableSlots, programmedMatches) {
    const slotQueue = [];
    const programmedCounts = programmedMatches.reduce((acc, match) => {
        if (!match.match_date || !match.match_time || !match.location) return acc;
        const date = match.match_date; // Ya viene como YYYY-MM-DD
        const time = match.match_time.substring(0, 5);
        const sede = (match.location || 'desconocida').split(' - ')[0].toLowerCase().trim();
        const key = `${sede}|${date}|${time}`;
        if (availableSlots.some(s => s.sede === sede && s.date === date && s.time === time)) {
             acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
    }, {});

    availableSlots.forEach(slot => {
        const key = `${slot.sede}|${slot.date}|${slot.time}`;
        const programmedCount = programmedCounts[key] || 0;
        const canchasLibres = slot.canchasDisponibles - programmedCount;
        for (let i = 1; i <= canchasLibres; i++) {
            slotQueue.push({
                key: key, sede: slot.sede, date: slot.date, time: slot.time,
                turno: HORARIOS_TURNOS[slot.time],
                canchaNum: programmedCount + i, // Asignar número de cancha secuencial
                filledBy: null
            });
        }
    });

    slotQueue.sort((a, b) => a.key.localeCompare(b.key));
    return slotQueue;
}

/**
 * Itera sobre los slots y los jugadores para llenarlos.
 */
function fillSlots(slotQueue, sortedPlayerPool, assignedPlayers, suggestionsBySlot, allowRevancha) {
    for (const slot of slotQueue) {
        if (slot.filledBy) continue;

        const availabilityKey = `${slot.date}|${slot.turno}`;

        // 1. Encontrar Jugador A (el que tenga menos PJ disponible)
        let playerA = null;
        for (const p of sortedPlayerPool) { // Ya está ordenado por PJ ascendente
            if (
                !assignedPlayers.has(p.id) &&
                p.availability.has(availabilityKey) &&
                (p.availability.get(availabilityKey).has(slot.sede) || p.availability.get(availabilityKey).has('ambas'))
            ) {
                playerA = p;
                break;
            }
        }
        if (!playerA) continue; // Siguiente slot

        // 2. Encontrar Jugador B (idealmente sin revancha)
        let playerB = null;
        let foundRevancha = null;

        for (const p of sortedPlayerPool) { // Iterar de nuevo buscando pareja para A
            if (p.id === playerA.id || assignedPlayers.has(p.id)) continue;

            if (
                p.availability.has(availabilityKey) &&
                (p.availability.get(availabilityKey).has(slot.sede) || p.availability.get(availabilityKey).has('ambas')) &&
                p.category_id === playerA.category_id &&
                p.zone_name === playerA.zone_name // Considerar zona si aplica
            ) {
                const alreadyPlayed = playerA.playedOpponents.has(p.id);

                if (!alreadyPlayed) {
                    playerB = p; // Encontrado sin revancha
                    break;
                } else if (allowRevancha && !foundRevancha) {
                    foundRevancha = p; // Guardar primera revancha posible
                }
            }
        }

        // Usar revancha si no se encontró otro y está permitido
        if (!playerB && foundRevancha) {
            playerB = foundRevancha;
        }

        // 3. Asignar si se encontró pareja
        if (playerB) {
            const slotKey = `${slot.sede}|${slot.date}|${slot.time}`;
            if (!suggestionsBySlot[slotKey]) suggestionsBySlot[slotKey] = [];

            const isRevancha = playerA.playedOpponents.has(playerB.id);

            suggestionsBySlot[slotKey].push({
                canchaNum: slot.canchaNum, // Usar el número de cancha del slot
                playerA_id: playerA.id,
                playerB_id: playerB.id,
                categoryName: playerA.categoryName,
                isRevancha: isRevancha
                // Ya no hay 'priority'
            });

            assignedPlayers.add(playerA.id);
            assignedPlayers.add(playerB.id);
            slot.filledBy = playerA.id; // Marcar slot como lleno
        }
    }
}