// --- CONSTANTES ---
// INICIO MODIFICACIÓN: Reglas de negocio
const MIN_HOURS_BETWEEN_MATCHES = 4; // Req ⿧: Mínimo 4 horas de descanso
const RANK_DIFFERENCE_THRESHOLD = 8; // Req ⿥: Límite para "partido ideal"
const FORCED_MATCH_PRIORITY = 99; // Prioridad para partidos que rompen reglas
// FIN MODIFICACIÓN

/**
 * Función principal y exportada.
 */
export async function generateMatchSuggestions(inputs) {
    const {
        allPlayers,
        playerMatchCounts,
        inscriptions,
        availability,
        history,
        programmedMatches,
        availableSlots,
        categories,
        tournaments,
        playersWantingTwoMatches, // Set(playerId)
        // --- INICIO CAMBIO LÓGICA ZONAS ---
        playerRanksPerTournament,
        playerZonesPerTournament,
        hasDividersPerTournament
        // --- FIN CAMBIO LÓGICA ZONAS ---
    } = inputs;

    console.log("Iniciando generación con Prioridades Avanzadas...");
    console.log("Zonas de jugadores (por torneo):", playerZonesPerTournament);
    console.log("Jugadores para 2 partidos:", playersWantingTwoMatches);
    console.log("Torneos con divisores:", hasDividersPerTournament);

    // 1. Preparar "Pool de Jugadores"
    const playerPool = preparePlayerPool(
        inscriptions, 
        availability, 
        history, 
        allPlayers, 
        tournaments, 
        playerMatchCounts,
        playerRanksPerTournament, // Modificado
        playerZonesPerTournament  // Modificado
    );

    // 2. Preparar "Cola de Slots"
    const slotQueue = prepareSlotQueue(availableSlots, programmedMatches);

    // 3. Inicializar
    const suggestionsBySlot = {};
    const assignedPlayers = new Set(); // Jugadores asignados a UN partido
    
    playerPool.forEach(p => { 
        p.matchesAssignedThisWeek = 0; 
        p.lastMatchTime = null;
    });

    // 4. Llenar Slots (Iterativo para Múltiples Partidos)
    let matchesMade = true;
    let passNumber = 1;
    let forceCompatibility = false; // Flag para forzar cruces

    while (matchesMade) {
        matchesMade = false;
        
        const sortedPlayerPool = [...playerPool.values()].sort((a, b) => {
            const aAssigned = a.matchesAssignedThisWeek > 0;
            const bAssigned = b.matchesAssignedThisWeek > 0;
            if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
            if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed; // ⿤
            if (a.availabilityCount !== b.availabilityCount) return b.availabilityCount - a.availabilityCount; // ⿦
            return a.rank - b.rank; // ⿥
        });

        console.log(`--- Iniciando Pasada ${passNumber} (Forzar: ${forceCompatibility}) ---`);
        const result = fillSlots(
            slotQueue, 
            sortedPlayerPool, 
            assignedPlayers, 
            suggestionsBySlot,
            playersWantingTwoMatches,
            forceCompatibility, // Pasar el flag
            hasDividersPerTournament // --- INICIO CAMBIO LÓGICA ZONAS ---
        );
        
        matchesMade = result.matchesMade > 0;
        passNumber++;
        
        if (!matchesMade && !forceCompatibility) {
            // No se hicieron partidos y AÚN NO forzamos, activamos el flag
            // para la siguiente (y última) pasada.
            console.log("No se encontraron más partidos ideales. Forzando revanchas y cruces de zona...");
            forceCompatibility = true;
            matchesMade = true; // Forzar una pasada más
        } else if (!matchesMade && forceCompatibility) {
            // Si no se hicieron partidos y YA ESTÁBAMOS forzando, salir.
             console.log("No se pudieron asignar más partidos.");
             break;
        }
    }


    // 6. Recopilar Sobrantes Finales
    const oddPlayers = [];
    playerPool.forEach(player => {
        if (player.matchesAssignedThisWeek === 0) {
            let reason = "Sin coincidencias disponibles";
            if (!player.isAvailableThisWeek) {
                reason = "Sin disponibilidad cargada esta semana";
            }
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
 * Prepara el pool de jugadores, añadiendo ranking, zona y conteo de disponibilidad.
 */
function preparePlayerPool(inscriptions, availability, history, allPlayers, tournaments, playerMatchCounts, playerRanksPerTournament, playerZonesPerTournament) {
    const playerPool = new Map();
    const historySet = new Set(); 

    history.forEach(match => {
        const p1 = match.player1_id; const p2 = match.player2_id;
        if (p1 && p2 && allPlayers.has(p1) && allPlayers.has(p2)) {
            historySet.add([p1, p2].sort().join('-'));
        }
    });

    inscriptions.forEach(ins => {
        const playerInfo = allPlayers.get(ins.player_id);
        const tournamentInfo = tournaments.find(t => t.id === ins.tournament_id);
        if (!playerInfo || !tournamentInfo) return;

        // --- INICIO CAMBIO LÓGICA ZONAS ---
        // Buscar rank y zona en los maps específicos del torneo
        const ranksForThisTournament = playerRanksPerTournament.get(ins.tournament_id) || new Map();
        const zonesForThisTournament = playerZonesPerTournament.get(ins.tournament_id) || new Map();
        // --- FIN CAMBIO LÓGICA ZONAS ---

        if (!playerPool.has(ins.player_id)) {
            playerPool.set(ins.player_id, {
                id: ins.player_id,
                category_id: tournamentInfo.category_id,
                categoryName: tournamentInfo.categoryName,
                tournament_id: ins.tournament_id,
                matchesPlayed: playerMatchCounts.get(ins.player_id) || 0,
                // --- INICIO CAMBIO LÓGICA ZONAS ---
                rank: ranksForThisTournament.get(ins.player_id) || 999, // Usar rank por torneo
                zone: zonesForThisTournament.get(ins.player_id) || 1, // Usar zona por torneo
                // --- FIN CAMBIO LÓGICA ZONAS ---
                playedOpponents: new Set(),
                availability: new Map(),
                availabilityCount: 0,
                isAvailableThisWeek: false,
                matchesAssignedThisWeek: 0,
                lastMatchTime: null 
            });
        }
    });

    playerPool.forEach(player => {
        let availCount = 0;
        availability.forEach(avail => {
            if (avail.player_id === player.id) {
                const key = `${avail.available_date}|${avail.time_slot}`;
                if (!player.availability.has(key)) player.availability.set(key, new Set());
                player.availability.get(key).add(avail.zone.toLowerCase());
                player.isAvailableThisWeek = true;
                availCount++;
            }
        });
        player.availabilityCount = availCount;

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
 */
function prepareSlotQueue(availableSlots, programmedMatches) {
    const slotQueue = [];
    const programmedCounts = programmedMatches.reduce((acc, match) => {
        if (!match.match_date || !match.match_time || !match.location) return acc;
        const date = match.match_date;
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
                turno: slot.turno,
                canchaNum: programmedCount + i,
                filledBy: null
            });
        }
    });

    slotQueue.sort((a, b) => a.key.localeCompare(b.key));
    return slotQueue;
}

/**
 * Helper Req ⿢: Comprobar si dos zonas pueden jugar
 * @param {boolean} force - Si es true, permite cualquier cruce de zona (ej. 1 vs 3)
 */
function areZonesCompatible(zoneA, zoneB, force = false) {
    if (force) return true; // Si forzamos, siempre es compatible
    if (!zoneA || !zoneB) return true; // Si alguno no tiene zona (ej. torneo sin divisores), es compatible
    return Math.abs(zoneA - zoneB) <= 1; // No pueden jugar 1 vs 3
}

/**
 * Itera sobre los slots y los jugadores para llenarlos.
 * @param {boolean} forceCompatibility - Si es true, ignora reglas de revancha y zona.
 * @param {Map} hasDividersPerTournament - Map(tournamentId -> boolean)
 */
function fillSlots(slotQueue, sortedPlayerPool, assignedPlayers, suggestionsBySlot, playersWantingTwoMatches, forceCompatibility = false, hasDividersPerTournament = new Map()) {
    let matchesMade = 0;

    for (const slot of slotQueue) {
        if (slot.filledBy) continue;

        const availabilityKey = `${slot.date}|${slot.turno}`;
        const currentSlotDateTime = new Date(`${slot.date}T${slot.time}`);

        // 1. Encontrar Jugador A
        let playerA = null;
        for (const p of sortedPlayerPool) {
            const maxMatches = playersWantingTwoMatches.has(p.id) ? 2 : 1;
            if (
                p.matchesAssignedThisWeek < maxMatches && 
                !assignedPlayers.has(p.id) && 
                p.availability.has(availabilityKey) && 
                (p.availability.get(availabilityKey).has(slot.sede) || p.availability.get(availabilityKey).has('ambas'))
            ) {
                if (p.matchesAssignedThisWeek > 0 && p.lastMatchTime) {
                    const lastMatchDateTime = new Date(p.lastMatchTime);
                    const diffInHours = Math.abs(currentSlotDateTime - lastMatchDateTime) / (1000 * 60 * 60);
                    if (diffInHours < MIN_HOURS_BETWEEN_MATCHES) {
                        continue; 
                    }
                    // --- INICIO: NO JUGAR 2 VECES MISMO DÍA ---
                    const lastMatchDate = lastMatchDateTime.toISOString().split('T')[0];
                    if (lastMatchDate === slot.date) {
                        continue; // Ya jugó hoy
                    }
                    // --- FIN ---
                }
                playerA = p;
                break;
            }
        }
        if (!playerA) continue;

        // --- INICIO CAMBIO LÓGICA ZONAS ---
        // Obtener el flag de divisores para el torneo específico de PlayerA
        const tournamentId = playerA.tournament_id;
        const tournamentHasDividers = hasDividersPerTournament.get(tournamentId) || false;
        // --- FIN CAMBIO LÓGICA ZONAS ---
        
        // 2. Encontrar Jugador B
        const possibleOpponents = sortedPlayerPool.filter(p => {
            if (p.id === playerA.id) return false;
            const maxMatches = playersWantingTwoMatches.has(p.id) ? 2 : 1;
            if (p.matchesAssignedThisWeek >= maxMatches || assignedPlayers.has(p.id)) return false; 
            if (!p.availability.has(availabilityKey) || !(p.availability.get(availabilityKey).has(slot.sede) || p.availability.get(availabilityKey).has('ambas'))) return false; 
            
            // --- INICIO CAMBIO LÓGICA ZONAS ---
            // Asegurarse que el oponente es de la misma categoría Y torneo
            if (p.category_id !== playerA.category_id || p.tournament_id !== playerA.tournament_id) return false;
            
            // Regla de Zona: Comprobar compatibilidad SÓLO si ESE TORNEO tiene divisores
            if (tournamentHasDividers && !areZonesCompatible(playerA.zone, p.zone, forceCompatibility)) {
                return false;
            }
            // --- FIN CAMBIO LÓGICA ZONAS ---
            
            // Regla de 4 horas y Mismo Día
            if (p.matchesAssignedThisWeek > 0 && p.lastMatchTime) {
                const lastMatchDateTime = new Date(p.lastMatchTime);
                const diffInHours = Math.abs(currentSlotDateTime - lastMatchDateTime) / (1000 * 60 * 60);
                if (diffInHours < MIN_HOURS_BETWEEN_MATCHES) {
                    return false; 
                }
                // --- INICIO: NO JUGAR 2 VECES MISMO DÍA ---
                const lastMatchDate = lastMatchDateTime.toISOString().split('T')[0];
                if (lastMatchDate === slot.date) {
                    return false; // Ya jugó hoy
                }
                // --- FIN ---
            }
            
            return true;
        });

        if (possibleOpponents.length === 0) continue;

        // INICIO MODIFICACIÓN: Nuevo orden de prioridades
        possibleOpponents.sort((b1, b2) => {
            const b1_hasPlayed = playerA.playedOpponents.has(b1.id);
            const b2_hasPlayed = playerA.playedOpponents.has(b2.id);

            // Prioridad ⿣: Evitar revanchas (a menos que se fuerce)
            if (!forceCompatibility && b1_hasPlayed !== b2_hasPlayed) {
                return b1_hasPlayed ? 1 : -1; // No jugados (false) van primero
            }
            
            // Prioridad ⿤: Menos partidos jugados (del oponente)
            if (b1.matchesPlayed !== b2.matchesPlayed) {
                return b1.matchesPlayed - b2.matchesPlayed; // Menos PJ va primero
            }

            // Prioridad ⿦: Más disponibilidad (del oponente)
            if (b1.availabilityCount !== b2.availabilityCount) {
                return b2.availabilityCount - b1.availabilityCount; // Mayor disponibilidad va primero
            }
            
            // Prioridad ⿥: Cercanía en ranking
            const b1_rankDiff = Math.abs(playerA.rank - b1.rank);
            const b2_rankDiff = Math.abs(playerA.rank - b2.rank);
            return b1_rankDiff - b2_rankDiff; // Menor diferencia va primero
        });
        // FIN MODIFICACIÓN

        const playerB = possibleOpponents[0];
        
        // 3. Asignar si se encontró pareja
        if (playerB) {
            const slotKey = `${slot.sede}|${slot.date}|${slot.time}`;
            if (!suggestionsBySlot[slotKey]) suggestionsBySlot[slotKey] = [];

            const isRevancha = playerA.playedOpponents.has(playerB.id);
            const zoneDiff = Math.abs(playerA.zone - playerB.zone);

            // --- INICIO CAMBIO LÓGICA ZONAS ---
            // Asignar razón del cruce
            let reason = "NUEVO"; // Razón por defecto (Nunca jugaron)
            
            // Usar el flag específico del torneo
            if (tournamentHasDividers) { 
                if (zoneDiff > 1) {
                    reason = "ZONA_INCOMPATIBLE"; // Ej: 1 vs 3
                } else if (isRevancha && forceCompatibility) {
                    reason = "REVANCHA_FORZADA"; // Revancha forzada
                } else if (isRevancha) {
                    reason = "REVANCHA"; // Revancha normal
                } else if (zoneDiff === 1) {
                    reason = "PARTIDO_CLAVE"; // Zonas contiguas
                }
            } else { // Si NO hay divisores, solo chequear revancha
                if (isRevancha && forceCompatibility) {
                    reason = "REVANCHA_FORZADA";
                } else if (isRevancha) {
                    reason = "REVANCHA";
                }
            }
            // --- FIN CAMBIO LÓGICA ZONAS ---
            
            suggestionsBySlot[slotKey].push({
                canchaNum: slot.canchaNum,
                playerA_id: playerA.id,
                playerB_id: playerB.id,
                categoryName: playerA.categoryName,
                isRevancha: isRevancha,
                reason: reason // Añadir la razón
            });

            const matchDateTimeISO = currentSlotDateTime.toISOString();
            playerA.lastMatchTime = matchDateTimeISO;
            playerB.lastMatchTime = matchDateTimeISO;

            playerA.matchesAssignedThisWeek++;
            playerB.matchesAssignedThisWeek++;
            matchesMade++;
            
            const maxA = playersWantingTwoMatches.has(playerA.id) ? 2 : 1;
            const maxB = playersWantingTwoMatches.has(playerB.id) ? 2 : 1;

            if (playerA.matchesAssignedThisWeek >= maxA) {
                assignedPlayers.add(playerA.id);
            }
            if (playerB.matchesAssignedThisWeek >= maxB) {
                assignedPlayers.add(playerB.id);
            }
            
            slot.filledBy = playerA.id;
        }
    }
    
    return { matchesMade };
}