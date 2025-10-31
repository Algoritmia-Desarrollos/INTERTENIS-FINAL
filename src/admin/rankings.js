import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
import { renderTeamScoreboard } from './team-scoreboard.js';
import { calculatePoints } from './calculatePoints.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const tournamentFilter = document.getElementById('tournament-filter');
const rankingsContainer = document.getElementById('rankings-container');
const viewSwitcherContainer = document.getElementById('view-switcher-container');
const filterLabel = document.getElementById('filter-label');
const pageTitle = document.querySelector('h1');
const saveChangesContainer = document.getElementById('save-changes-container');
const saveRankingChangesBtn = document.getElementById('save-ranking-changes-btn');

// --- ESTADO GLOBAL ---
let allTournaments = [];
let currentView = 'category';
let currentRankingData = []; // Guardará los stats calculados
let currentRankingMetadata = new Map(); // Map(playerId -> { player_id, tournament_id, is_divider_after, tag_type })
let rankingDirty = false; // Flag para cambios pendientes

// --- PRESETS DE ETIQUETAS (Tipos de Tag) ---
const TAG_PRESETS = {
    'ASCENSO_SEGURO': { prefix: 'A', color: '#22c55e', textColor: '#ffffff', title: 'Ascenso Seguro' }, // green-500
    'PROMO_ASCENSO': { prefix: 'PA', color: '#a3e635', textColor: '#000000', title: 'Promo Ascenso' }, // lime-400
    'PROMO_DESCENSO': { prefix: 'PD', color: '#f97316', textColor: '#ffffff', title: 'Promo Descenso' }, // orange-500
    'DESCENSO_SEGURO': { prefix: 'D', color: '#ef4444', textColor: '#ffffff', title: 'Descenso Seguro' }  // red-500
};
const TAG_TYPES = Object.keys(TAG_PRESETS);

// --- Helper de Color ---
function isColorLight(hex) {
    if (!hex || typeof hex !== 'string') return false;
    let c = hex.startsWith('#') ? hex.slice(1) : hex;
    if (c.length === 3) c = c.split('').map(char => char + char).join('');
    if (c.length !== 6) return false; // Fallback
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6; // Aumentado umbral para seguridad
};

// --- Lógica de Vistas y Filtros ---

function setupViewSwitcher() {
    viewSwitcherContainer.innerHTML = `
        <div class="flex border-b border-gray-700 mb-4">
            <button id="btn-view-category" class="btn-view active">Singles</button>
            <button id="btn-view-teams" class="btn-view">SuperLiga</button>
        </div>
        <style>
            .btn-view { padding: 8px 16px; border-bottom: 2px solid transparent; color: #9ca3af; font-weight: 600; cursor: pointer; }
            .btn-view.active { color: #facc15; border-bottom-color: #facc15; }
            
            /* --- INICIO: NUEVOS ESTILOS PARA POPUP DE ETIQUETAS --- */
            .admin-actions {
                position: relative; /* Contenedor para el popup */
            }
            .tag-editor-popup {
                position: absolute;
                left: 100%;
                top: 0;
                background-color: #374151; /* gray-700 */
                border: 1px solid #6b7280; /* gray-500 */
                border-radius: 6px;
                padding: 4px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                z-index: 50;
                width: 150px; /* Ancho fijo para el menú */
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }
            .tag-selection-btn { 
                display: flex; 
                align-items: center; 
                gap: 8px; 
                background-color: #4b5563; /* gray-600 */
                color: white; 
                border: none; 
                padding: 5px 8px; 
                border-radius: 4px; 
                cursor: pointer; 
                text-align: left; 
                font-size: 11px; 
                font-weight: 600; 
                transition: background-color 0.15s;
            }
            .tag-selection-btn:hover { background-color: #6b7280; } /* gray-500 */
            .tag-selection-btn .tag-preview { 
                width: 16px; 
                height: 16px; 
                border-radius: 3px; 
                border: 1px solid #374151; /* gray-700 */
                flex-shrink: 0;
            }
            .tag-selection-btn.cancel { background-color: #374151; } /* gray-700 */
            .tag-selection-btn.cancel:hover { background-color: #4b5563; } /* gray-600 */
            /* --- FIN: NUEVOS ESTILOS --- */
        </style>
    `;

    // --- CORRECCIÓN: Se mueven los listeners a `handleDocumentClick` y `loadInitialData` ---
}

async function populateTournamentFilter() {
    if (allTournaments.length === 0) {
        const { data } = await supabase.from('tournaments').select('*, category:category_id(name)');
        allTournaments = data || [];
    }

    let tournamentsToShow = [];
    if (currentView === 'category') {
        filterLabel.textContent = 'Seleccionar Categoría';
        tournamentsToShow = allTournaments.filter(t => t.category && t.category.name !== 'Equipos');
    } else {
        filterLabel.textContent = 'Seleccionar SuperLiga';
        tournamentsToShow = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
    }
    
    tournamentsToShow.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { numeric: true });
    });

    tournamentFilter.innerHTML = '<option value="" disabled selected>Seleccione un torneo...</option>';
    tournamentsToShow.forEach(t => {
        tournamentFilter.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

// --- RANKING POR EQUIPOS ---
function renderTeamRankings() {
    const tournamentId = tournamentFilter.value;
    renderTeamScoreboard(rankingsContainer, tournamentId, { isAdmin: true });
}


// --- RANKING POR CATEGORÍA (Modificado) ---

/**
 * Función 1: Obtiene los datos del torneo y los guarda en el estado global
 */
async function fetchAndRenderRankings(playerToHighlight = null) {
    const tournamentId = tournamentFilter.value;
    rankingsContainer.innerHTML = '<p class="text-center p-8 text-gray-400">Calculando POSICIONES...</p>';
    setRankingDirty(false); // Ocultar botón guardar al cargar

    if (!tournamentId) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione una categoría para ver las posiciones.</p></div>';
        return;
    }

    // 1. Cargar 'tournamentPlayersLinks' PRIMERO
    const { data: tournamentPlayersLinks, error: tpError } = await supabase
        .from('tournament_players')
        .select('player_id')
        .eq('tournament_id', tournamentId);
    
    if (tpError) {
         rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-red-500">Error al cargar jugadores.</p></div>';
         return;
    }
    if (!tournamentPlayersLinks || tournamentPlayersLinks.length === 0) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Este torneo no tiene jugadores inscritos.</p></div>';
        return;
    }

    // 2. Crear 'playerIds' AHORA
    const playerIds = tournamentPlayersLinks.map(link => link.player_id);

    // 3. Cargar el resto de datos en un 'Promise.all'
    const [
        { data: playersInTournament, error: pError },
        { data: matchesInTournament, error: mError },
        { data: metadataData, error: metaError }
    ] = await Promise.all([
        supabase.from('players').select('*, teams(name, image_url), categories(id, name)').in('id', playerIds),
        supabase.from('matches').select('*, status, sets, winner_id, bonus_loser, player1_id, player2_id, player3_id, player4_id').eq('tournament_id', tournamentId).not('winner_id', 'is', null),
        supabase.from('player_ranking_metadata').select('player_id, is_divider_after, special_tag, tag_color').eq('tournament_id', tournamentId) // Cargar metadata
    ]);

    if (pError || mError) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-red-500">Error al cargar datos del torneo.</p></div>';
        return;
    }
    if (metaError) {
        console.error("Error al cargar la metadata del ranking", metaError); // Loguear el error real
        showToast("Error al cargar la metadata del ranking", "error");
    }

    // 4. Guardar metadata en el estado global
    currentRankingMetadata.clear();
    (metadataData || []).forEach(meta => {
        let tag_type = null;
        if (meta.special_tag) {
            if (meta.special_tag.startsWith(TAG_PRESETS.ASCENSO_SEGURO.prefix)) tag_type = 'ASCENSO_SEGURO';
            else if (meta.special_tag.startsWith(TAG_PRESETS.PROMO_ASCENSO.prefix)) tag_type = 'PROMO_ASCENSO';
            else if (meta.special_tag.startsWith(TAG_PRESETS.PROMO_DESCENSO.prefix)) tag_type = 'PROMO_DESCENSO';
            else if (meta.special_tag.startsWith(TAG_PRESETS.DESCENSO_SEGURO.prefix)) tag_type = 'DESCENSO_SEGURO';
        }
        currentRankingMetadata.set(meta.player_id, {
            player_id: meta.player_id,
            tournament_id: Number(tournamentId), 
            is_divider_after: meta.is_divider_after,
            tag_type: tag_type 
        });
    });


    // 5. Calcular estadísticas y guardarlas en estado global
    const stats = calculateCategoryStats(playersInTournament || [], matchesInTournament || []);
    currentRankingData = stats; // Guardar datos calculados en el estado
    
    // 6. Llamar a la función que dibuja la tabla
    drawRankingTables(playerToHighlight);
}

/**
 * Función 2: Dibuja las tablas en el DOM usando los datos del estado global
 */
function drawRankingTables(playerToHighlight = null) {
    // Busca las categorías únicas directamente desde los stats calculados
    const categoriesInTournament = [...new Map(currentRankingData.map(s => {
        // Encontrar la info del torneo (que tiene la info de la categoría)
        const tour = allTournaments.find(t => t.category_id === s.categoryId);
        // Devolver un objeto {id, name} de la categoría
        return [s.categoryId, { id: s.categoryId, name: tour?.category?.name || 'Categoría Desconocida' }];
    })).values()];
    
    rankingsContainer.innerHTML = '';
    if (currentRankingData.length === 0 || categoriesInTournament.length === 0) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">No hay jugadores con categoría en este torneo.</p></div>';
        return;
    }

    // Renderizar cada categoría
    categoriesInTournament.forEach(category => {
        if (!category || !category.id) return; // Saltear si no se encontró info de la categoría
        let categoryStats = currentRankingData.filter(s => s.categoryId === category.id);
        
        const tableContainer = document.createElement('div');
        tableContainer.className = 'bg-[#222222] p-4 rounded-xl shadow-lg overflow-x-auto mb-8';
        
        // Pasar la metadata DEL ESTADO al generador HTML
        tableContainer.innerHTML = generateCategoryRankingsHTML(category, categoryStats, playerToHighlight, currentRankingMetadata);
        rankingsContainer.appendChild(tableContainer);
    });
}


function calculateCategoryStats(players, matches) {
    
    // *** INICIO DE LA CORRECCIÓN ***
    // Filtrar jugadores que no tienen ID o no existen (jugadores fantasma)
    const validPlayers = players.filter(p => p && p.id);
    
    const stats = validPlayers.map(player => ({
    // *** FIN DE LA CORRECCIÓN ***
        playerId: player.id, name: player.name, categoryId: player.category_id, 
        teamName: player.teams ? player.teams.name : 'N/A',
        teamImageUrl: player.teams ? player.teams.image_url : null,
        pj: 0, pg: 0, pp: 0, sg: 0, sp: 0, gg: 0, gp: 0, bonus: 0, puntos: 0,
    }));

    matches.forEach(match => {
        const p1Stat = stats.find(s => s.playerId === match.player1_id);
        const p2Stat = stats.find(s => s.playerId === match.player2_id);
        if (!p1Stat || !p2Stat) return;
        
        p1Stat.pj++; 
        p2Stat.pj++;
        
        let p1SetsWon = 0, p2SetsWon = 0;
        let p1TotalGames = 0, p2TotalGames = 0;
        (match.sets || []).forEach(set => {
            p1TotalGames += set.p1;
            p2TotalGames += set.p2;
            if(set.p1 > set.p2) p1SetsWon++; else p2SetsWon++;
        });

        p1Stat.gg += p1TotalGames;
        p1Stat.gp += p2TotalGames;
        p2Stat.gg += p2TotalGames;
        p2Stat.gp += p1TotalGames;

        p1Stat.sg += p1SetsWon; 
        p1Stat.sp += p2SetsWon;
        p2Stat.sg += p2SetsWon; 
        p2Stat.sp += p1SetsWon;
        
        const { p1_points, p2_points } = calculatePoints(match);
        p1Stat.puntos += p1_points;
        p2Stat.puntos += p2_points;

        const winnerIsSide1 = match.winner_id === match.player1_id || match.winner_id === match.player3_id;

        if (winnerIsSide1) {
            p1Stat.pg++; 
            p2Stat.pp++;
        } else {
            p2Stat.pg++; 
            p1Stat.pp++;
        }

        if (match.status !== 'completado_wo') {
            if (winnerIsSide1) {
                if (p2TotalGames <= 3) p1Stat.bonus++;
                if (p2SetsWon === 1) p2Stat.bonus++;
            } else {
                if (p1TotalGames <= 3) p2Stat.bonus++;
                if (p1SetsWon === 1) p1Stat.bonus++;
            }
        }
    });

    stats.forEach(s => {
        s.difP = s.pg - s.pp;
        s.difS = s.sg - s.sp;
        s.difG = s.gg - s.gp;
        s.parcial = s.pj > 0 ? (s.puntos / s.pj) : 0;
        s.partidosParaPromediar = Math.max(s.pj, 8);
        s.promedio = s.pj > 0 ? (s.puntos / s.partidosParaPromediar) : 0;
    });

    stats.sort((a, b) => {
        if (a.pj === 0 && b.pj > 0) return 1;
        if (b.pj === 0 && a.pj > 0) return -1;
        if (b.promedio !== a.promedio) return b.promedio - a.promedio;
        if (b.difP !== a.difP) return b.difP - a.difP;
        if (b.difS !== a.difS) return b.difS - a.difS;
        if (b.difG !== a.difG) return b.difG - a.difG;
        return b.puntos - a.puntos;
    });

    return stats;
}

/**
 * Genera el HTML para la tabla de ranking (MODIFICADO)
 * @param {object} category - La categoría
 * @param {Array} stats - Los stats de los jugadores
 * @param {string} playerToHighlight - ID del jugador a resaltar
 * @param {Map} metadataMap - Map(playerId -> metadata)
 */
function generateCategoryRankingsHTML(category, stats, playerToHighlight = null, metadataMap) {
    
    // --- INICIO: LÓGICA DE NÚMEROS DE ETIQUETA ---
    // 1. Filtrar solo jugadores que jugaron
    const playersWhoPlayed = stats.filter(s => s.pj > 0);
    
    // 2. Crear listas para cada tipo de tag, YA ORDENADAS POR RANKING
    const getTagType = (id) => metadataMap.get(id)?.tag_type;

    const ascensoSeguroPlayers = playersWhoPlayed
        .filter(p => getTagType(p.playerId) === 'ASCENSO_SEGURO');
        
    const promoAscensoPlayers = playersWhoPlayed
        .filter(p => getTagType(p.playerId) === 'PROMO_ASCENSO');
    
    // 3. Para descensos, crear las listas y LUEGO INVERTIRLAS
    const promoDescensoPlayers = playersWhoPlayed
        .filter(p => getTagType(p.playerId) === 'PROMO_DESCENSO')
        .slice() // Crear copia
        .reverse(); // Invertir (el último ahora es 0)
        
    const descensoSeguroPlayers = playersWhoPlayed
        .filter(p => getTagType(p.playerId) === 'DESCENSO_SEGURO')
        .slice() // Crear copia
        .reverse(); // Invertir (el último ahora es 0)
    // --- FIN: LÓGICA DE NÚMEROS DE ETIQUETA ---

    
    let tableHTML = `
        <table class="rankings-table min-w-full font-bold text-sm text-gray-200" style="border-spacing: 0; border-collapse: separate;">
            <thead class="bg-black]">
                <tr>
                    <th style="width: 80px;">Admin</th> 
                    <th colspan="2" class="category-header py-2 px-4 text-3xl font-bold text-white text-center" style=" border-width: 1px 0 3px 1px; background: #757170; border-color: black;">${category.name}</th>
                    <th class="col-p-plus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 2px; background: #757170; border-color: black;">P+</th>
                    <th class="col-p-minus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 0px; background: #757170; border-color: black;">P-</th>
                    <th class="col-p-diff px-1 py-3 text-center text-[14px] font-light text-white tracking-wider" style="border-width: 1px 2px 3px 0px; background: #757170; border-color: black;">Dif.</th>
                    <th class="col-s-plus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 1px; background: #757170; border-color: black;">S+</th>
                    <th class="col-s-minus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 0px; background: #757170; border-color: black;">S-</th>
                    <th class="col-s-diff px-1 py-3 text-center text-[14px] font-light text-white tracking-wider" style="border-width: 1px 2px 3px 0px; background: #757170; border-color: black;">Dif.</th>
                    <th class="col-g-plus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 1px; background: #757170; border-color: black;">G+</th>
                    <th class="col-g-minus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 0px; background: #757170; border-color: black;">G-</th>
                    <th class="col-g-diff px-1 py-3 text-center text-[14px] font-light text-white tracking-wider" style="border-width: 1px 2px 3px 0px; background: #757170; border-color: black;">Dif.</th>
                    <th class="col-bonus px-1 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Bon.</th>
                    <th class="col-points px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Pts.</th>
                    <th class="col-partial px-1 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Parcial</th>
                    <th class="col-prom px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Prom. %</th>
                    <th class="col-tag px-0 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 1px 3px 1px; background: black; border-color: black; width: 50px;"></th>
                    </tr>
            </thead>
            <tbody>`;
    
    if (stats.length === 0) {
        // Colspan aumentado a 17
        tableHTML += `<tr><td colspan="17" class="text-center font-bold p-8 text-gray-400">No hay jugadores en esta categoría para mostrar.</td></tr>`;
    } else {
        stats.forEach((s, index) => {
            // *** INICIO DE LA CORRECCIÓN ***
            // Si el jugador no tiene ID (es un fantasma), no dibujamos la fila
            if (!s.playerId) {
                console.warn("Se omitió un jugador 'fantasma' (ID nulo) en el ranking.");
                return; 
            }
            // *** FIN DE LA CORRECCIÓN ***

            const hasPlayed = s.pj > 0;
            const difPClass = 'text-[#e8b83a]';
            const difSClass = 'text-[#e8b83a]';
            const difGClass = 'text-[#e8b83a]';
            const highlightClass = s.playerId == playerToHighlight ? 'bg-yellow-900/50' : '';

            // Obtener metadata para este jugador
            const meta = metadataMap.get(s.playerId) || { is_divider_after: false, tag_type: null };
            const isDividerActive = meta.is_divider_after;
            const activeTagType = meta.tag_type;
            
            // --- INICIO: LÓGICA DE ETIQUETAS AUTOMÁTICAS ---
            let tagHTML = '';
            if (hasPlayed && activeTagType) {
                const preset = TAG_PRESETS[activeTagType];
                let rank = -1;

                if (activeTagType === 'ASCENSO_SEGURO') rank = ascensoSeguroPlayers.findIndex(p => p.playerId === s.playerId);
                else if (activeTagType === 'PROMO_ASCENSO') rank = promoAscensoPlayers.findIndex(p => p.playerId === s.playerId);
                else if (activeTagType === 'PROMO_DESCENSO') rank = promoDescensoPlayers.findIndex(p => p.playerId === s.playerId);
                else if (activeTagType === 'DESCENSO_SEGURO') rank = descensoSeguroPlayers.findIndex(p => p.playerId === s.playerId);
                
                if (rank !== -1 && preset) {
                    const tagText = `${preset.prefix}${rank + 1}`;
                    tagHTML = `<span class="special-tag" style="background-color: ${preset.color}; color: ${preset.textColor};">${tagText}</span>`;
                }
            }
            // --- FIN: LÓGICA DE ETIQUETAS AUTOMÁTICAS ---

            // Renderizar la fila del jugador
            tableHTML += `
                <tr class="${highlightClass}" data-player-id="${s.playerId}">
                    <td class="admin-actions" style="border-width: 0 0 2px 1px; border-color: #4b556352;">
                        <button class="admin-btn toggle-divider-btn ${isDividerActive ? 'active' : ''}" data-action="toggle-divider" data-player-id="${s.playerId}" title="Poner/Quitar línea divisoria">
                            <span class="material-icons">horizontal_rule</span>
                        </button>
                        <button class="admin-btn edit-tag-btn ${activeTagType ? 'active' : ''}" data-action="edit-tag" data-player-id="${s.playerId}" title="Editar etiqueta">
                            <span class="material-icons">sell</span>
                        </button>
                    </td>
                    <td class="col-rank px-2 py-0 text-xl font-bold text-white text-center" style="border-width: 0 0 3px 1px; background-color: #757170; border-color: black;">${index + 1}°</td>
                    <td class="col-player bg-black px-0 text-xl py-0 whitespace-nowrap" style="border-width: 0 0 2px 1px; border-color: #4b556352;">
                        <div class="flex items-center bg-black font-light player-cell-content">
                            <span class="flex-grow bg-black font-bold text-gray-100 player-name-container text-center">
                                ${s.name}
                                </span>
                            <img src="${s.teamImageUrl || 'https://via.placeholder.com/40'}" alt="${s.teamName}" class="h-10 w-10 object-cover bg-black team-logo ml-4">
                        </div>
                    </td>
                    <td class="col-p-plus px-2 py-0 text-center text-2xl font-bold bg-black" style="border-width: 0px 0 2px 1px;  border-color: #4b556352;">${hasPlayed ? s.pg : ''}</td>
                    <td class="col-p-minus px-2 py-0 text-center text-2xl font-bold bg-black" style="border-width: 0 0 2px 1px; border-color: #4b556352;">${hasPlayed ? s.pp : ''}</td>
                    <td class="col-p-diff px-2 py-0 text-center bg-black font-bold ${difPClass}" style="border-width: 0 1px 2px 1px; border-color: #4b556352;">${hasPlayed ? s.difP : ''}</td>
                    <td class="col-s-plus px-2 py-0 text-center text-2xl font-bold bg-black" style="border-width: 0 0 2px 1px; border-color: #4b556352;">${hasPlayed ? s.sg : ''}</td>
                    <td class="col-s-minus px-2 py-0 text-center text-2xl bg-black font-bold" style="border-width: 0 0 2px 1px; border-color: #4b556352;">${hasPlayed ? s.sp : ''}</td>
                    <td class="col-s-diff px-2 py-0 text-center bg-black font-bold ${difSClass}" style="border-width: 0 1px 2px 1px; border-color: #4b556352;">${hasPlayed ? s.difS : ''}</td>
                    <td class="col-g-plus px-2 py-0 text-center text-2xl bg-black font-bold" style="border-width: 0 0 2px 1px; border-color: #4b556352;">${hasPlayed ? s.gg : ''}</td>
                    <td class="col-g-minus px-2 py-0 text-center text-2xl bg-black font-bold" style="border-width: 0 0 2px 1px; border-color: #4b556352;">${hasPlayed ? s.gp : ''}</td>
                    <td class="col-g-diff px-2 py-0 text-center bg-black font-bold ${difGClass}" style="border-width: 0 1px 2px 1px; border-color: #4b556352;">${hasPlayed ? s.difG : ''}</td>
                    <td class="col-bonus px-1 py-0 text-center bg-black font-bold text-red-500" style="border-width: 0 1px 2px 1px; border-color: #4b556352;">${hasPlayed ? s.bonus : ''}</td>
                    <td class="col-points px-2 py-0 text-center text-2xl bg-black font-bold text-lg text-[#e8b83a]" style="border-width: 0 1px 2px 1px; border-color: #4b556352;">${hasPlayed ? s.puntos : '0'}</td>
                    <td class="col-partial px-1 py-0 text-center bg-black font-bold" style="border-width: 0 1px 2px 1px; border-color: #4b556352;">${hasPlayed ? s.parcial.toFixed(2) : ''}</td>
                    <td class="col-prom px-2 py-0 text-center text-2xl bg-black font-bold text-[yellow]" style="border-width: 0 1px 1px 1px; border-color: #4b556352;">
                        ${s.promedio.toFixed(2)}
                        <span class="text-xs text-gray-500">/${s.partidosParaPromediar}</span>
                    </td>
                    <td class="col-tag bg-black px-1 py-0 text-center" style="border-width: 0 1px 1px 1px; border-color: #4b556352;">
                        <span class="tag-container" data-player-id="${s.playerId}">${tagHTML}</span>
                    </td>
                    </tr>`;
            
            // Renderizar la fila divisoria si está activada
            if (isDividerActive) {
                // Colspan aumentado a 17
                tableHTML += `<tr class="ranking-divider-row" data-divider-for-player-id="${s.playerId}"><td colspan="17"></td></tr>`;
            }
        });
    }
    tableHTML += '</tbody></table>';
    return tableHTML;
}

// --- Lógica de Edición de Metadata (Híbrida) ---

/**
 * Activa/Desactiva el flag de "guardar cambios"
 * @param {boolean} isDirty
 */
function setRankingDirty(isDirty) {
    rankingDirty = isDirty;
    if (saveChangesContainer) {
        saveChangesContainer.classList.toggle('hidden', !isDirty);
        saveRankingChangesBtn.classList.toggle('animate-pulse', isDirty);
    }
}

/**
 * Cierra todos los popups de etiquetas abiertos
 */
function closeTagPopups() {
    document.querySelectorAll('.tag-editor-popup').forEach(el => el.remove());
}

/**
 * Maneja el clic en el botón de la línea divisoria
 * @param {HTMLElement} btn - El botón que fue clickeado
 */
function handleToggleDivider(btn) {
    closeTagPopups(); // Cerrar otros popups
    const playerId = Number(btn.dataset.playerId);
    if (!playerId) return; // Evitar si el ID es nulo o NaN
    
    const tournamentId = Number(tournamentFilter.value);
    
    // Obtener o crear la metadata para este jugador
    let meta = currentRankingMetadata.get(playerId) || {
        player_id: playerId,
        tournament_id: tournamentId,
        is_divider_after: false,
        tag_type: null
    };

    // Alternar el estado
    meta.is_divider_after = !meta.is_divider_after;
    currentRankingMetadata.set(playerId, meta);
    
    // Llamar a la función que redibuja la tabla desde el estado
    const playerToHighlight = document.querySelector('.bg-yellow-900\\/50')?.dataset.playerId || null;
    drawRankingTables(playerToHighlight);
    
    setRankingDirty(true);
}

/**
 * Muestra el menú de selección de etiquetas
 * @param {HTMLElement} btn - El botón que fue clickeado
 */
function handleEditTag(btn) {
    closeTagPopups(); // Cerrar cualquier otro popup abierto
    
    const playerId = Number(btn.dataset.playerId);
    if (!playerId) return; // Evitar si el ID es nulo o NaN
    
    const cell = btn.closest('.admin-actions');
    const rect = btn.getBoundingClientRect(); // Posición del botón

    let menuHTML = `<div class="tag-selection-menu" data-player-id="${playerId}">`;
    
    // Añadir los 4 botones de tipo de tag
    TAG_TYPES.forEach(tagType => {
        const preset = TAG_PRESETS[tagType];
        menuHTML += `
            <button class="tag-selection-btn" data-action="set-tag" data-tag-type="${tagType}">
                <span class="tag-preview" style="background-color: ${preset.color}"></span>
                <span>${preset.title}</span>
            </button>`;
    });

    menuHTML += `<hr style="border-color: #6b7280; margin: 2px 0;">`;
    // Botón para "Quitar Etiqueta"
    menuHTML += `
        <button class="tag-selection-btn" data-action="set-tag" data-tag-type="null">
            <span class="material-icons !text-base" style="color: #9ca3af">block</span>
            <span>Quitar Etiqueta</span>
        </button>`;
    
    menuHTML += '</div>';

    // Crear el popup como un elemento flotante
    const menuPopup = document.createElement('div');
    menuPopup.className = 'tag-editor-popup no-print';
    menuPopup.style.position = 'fixed'; // Usar fixed para flotar sobre todo
    menuPopup.style.top = `${rect.top}px`;
    menuPopup.style.left = `${rect.right + 5}px`;
    menuPopup.style.zIndex = '100';
    menuPopup.innerHTML = menuHTML;
    
    document.body.appendChild(menuPopup); // Añadir al body para que flote
}

/**
 * Asigna el tipo de tag al jugador y re-renderiza la tabla
 * @param {HTMLElement} btn - El botón de tipo de tag que fue clickeado
 */
function handleSetTag(btn) {
    const popup = btn.closest('.tag-editor-popup');
    if (!popup) return;
    
    const playerId = Number(popup.dataset.playerId);
    if (!playerId) return; // Evitar si el ID es nulo o NaN

    let tagType = btn.dataset.tagType;
    if (tagType === 'null') {
        tagType = null;
    }

    const tournamentId = Number(tournamentFilter.value);

    // Actualizar el estado global
    let meta = currentRankingMetadata.get(playerId) || {
        player_id: playerId,
        tournament_id: tournamentId,
        is_divider_after: false,
    };
    meta.tag_type = tagType; // Guardar el TIPO de tag
    currentRankingMetadata.set(playerId, meta);
    
    setRankingDirty(true);
    closeTagPopups();
    
    // Llamar a la función que redibuja la tabla desde el estado
    const playerToHighlight = document.querySelector('.bg-yellow-900\\/50')?.dataset.playerId || null;
    drawRankingTables(playerToHighlight);
}


/**
 * Guarda todos los cambios de metadata (divisores Y etiquetas) en Supabase
 */
async function handleSaveRankingChanges() {
    const tournamentId = Number(tournamentFilter.value);
    if (!tournamentId) {
        showToast("No hay un torneo seleccionado.", "error");
        return;
    }

    if (!rankingDirty) {
        showToast("No hay cambios para guardar.", "info");
        return;
    }

    saveRankingChangesBtn.disabled = true;
    saveRankingChangesBtn.innerHTML = '<div class="spinner inline-block mr-2"></div> Guardando...';

    // --- LÓGICA DE NÚMEROS DE ETIQUETA ---
    const playersWhoPlayed = currentRankingData.filter(s => s.pj > 0);
    const getTagType = (id) => currentRankingMetadata.get(id)?.tag_type;
    const ascensoSeguroPlayers = playersWhoPlayed.filter(p => getTagType(p.playerId) === 'ASCENSO_SEGURO');
    const promoAscensoPlayers = playersWhoPlayed.filter(p => getTagType(p.playerId) === 'PROMO_ASCENSO');
    const promoDescensoPlayers = playersWhoPlayed.filter(p => getTagType(p.playerId) === 'PROMO_DESCENSO').slice().reverse();
    const descensoSeguroPlayers = playersWhoPlayed.filter(p => getTagType(p.playerId) === 'DESCENSO_SEGURO').slice().reverse();
    // --- FIN LÓGICA ---

    const metadataToUpsert = [];
    const playerIdsWithMetadata = new Set();
    const playerIdsInCurrentRanking = currentRankingData.map(s => s.playerId);

    // 1. Encontrar todos los jugadores que tienen metadata (divisor o tag)
    currentRankingMetadata.forEach((meta, playerId) => {
        // *** INICIO DE LA CORRECCIÓN ***
        // Asegurarnos de que el playerID es válido antes de procesar
        if (!playerId || isNaN(playerId) || playerId === 0) {
            console.warn("Se omitió metadata con player_id inválido:", playerId, meta);
            return; // Saltar este ciclo
        }
        // *** FIN DE LA CORRECCIÓN ***

        const metaTournamentId = meta.tournament_id || tournamentId; // Asignar ID de torneo si falta
        
        if (metaTournamentId === tournamentId) {
            if (meta.is_divider_after || meta.tag_type) {
                
                let special_tag = null;
                let tag_color = null;

                // Calcular el tag (A1, D1, etc.) si hay un tipo
                if (meta.tag_type) {
                    const preset = TAG_PRESETS[meta.tag_type];
                    let rank = -1;
                    if (meta.tag_type === 'ASCENSO_SEGURO') rank = ascensoSeguroPlayers.findIndex(p => p.playerId === playerId);
                    else if (meta.tag_type === 'PROMO_ASCENSO') rank = promoAscensoPlayers.findIndex(p => p.playerId === playerId);
                    else if (meta.tag_type === 'PROMO_DESCENSO') rank = promoDescensoPlayers.findIndex(p => p.playerId === playerId);
                    else if (meta.tag_type === 'DESCENSO_SEGURO') rank = descensoSeguroPlayers.findIndex(p => p.playerId === playerId);

                    if (rank !== -1 && preset) {
                        special_tag = `${preset.prefix}${rank + 1}`;
                        tag_color = preset.color;
                    }
                }

                metadataToUpsert.push({
                    tournament_id: tournamentId,
                    player_id: playerId, // El 'playerId' aquí es la clave del Map, que ya filtramos
                    is_divider_after: meta.is_divider_after || false,
                    special_tag: special_tag, 
                    tag_color: tag_color      
                });
                playerIdsWithMetadata.add(playerId);
            }
        }
    });
    
    // 2. Encontrar todos los jugadores que NO tienen metadata (y están en el ranking actual)
    const playerIdsToClear = playerIdsInCurrentRanking.filter(id => id && !playerIdsWithMetadata.has(id));

    try {
        // 3. Borrar la metadata de los que ya no la necesitan
        if (playerIdsToClear.length > 0) {
            const { error: deleteError } = await supabase
                .from('player_ranking_metadata')
                .delete()
                .eq('tournament_id', tournamentId)
                .in('player_id', playerIdsToClear);
            
            if (deleteError) throw deleteError;
        }
        
        // 4. Insertar/Actualizar los que SÍ la necesitan
        if (metadataToUpsert.length > 0) {
            const { error: upsertError } = await supabase
                .from('player_ranking_metadata')
                .upsert(metadataToUpsert, { onConflict: 'tournament_id, player_id' });
            
            if (upsertError) throw upsertError;
        }

        showToast("Cambios del ranking guardados.", "success");
        setRankingDirty(false);

    } catch (error) {
        console.error("Error al guardar metadata:", error);
        showToast("Error al guardar: " + error.message, "error");
    } finally {
        saveRankingChangesBtn.disabled = false;
        saveRankingChangesBtn.innerHTML = '<span class="material-icons">save</span> Guardar Cambios en Ranking';
    }
}

// --- INICIALIZACIÓN Y EVENTOS ---

// --- INICIO: CORRECCIÓN DE EVENTOS ---

/**
 * Función que carga los datos iniciales y prepara los listeners principales.
 */
async function loadInitialData() {
    header.innerHTML = renderHeader();
    if(pageTitle) pageTitle.textContent = "Categorías";
    setupViewSwitcher();
    await populateTournamentFilter();
    
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentIdToSelect = urlParams.get('tournamentId');
    const playerToHighlight = urlParams.get('highlightPlayerId');

    if (tournamentIdToSelect) {
        tournamentFilter.value = tournamentIdToSelect;
        const selectedTournament = allTournaments.find(t => t.id == tournamentIdToSelect);
        if (selectedTournament?.category?.name === 'Equipos') {
            document.getElementById('btn-view-teams').click();
        }
        await (currentView === 'category' ? fetchAndRenderRankings(playerToHighlight) : renderTeamRankings());
    } else {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione un torneo para ver las posiciones.</p></div>';
    }
}

/**
 * Maneja el cambio en el filtro de torneo.
 */
function handleFilterChange() {
    if (currentView === 'category') {
        fetchAndRenderRankings(null);
    } else {
        renderTeamRankings();
    }
}

/**
 * Maneja los clics en los botones de cambio de vista (Singles / SuperLiga).
 * @param {HTMLElement} btn - El botón clickeado.
 */
function handleViewChange(btn) {
    if (btn.id === 'btn-view-category' && currentView !== 'category') {
        currentView = 'category';
        if(pageTitle) pageTitle.textContent = "Categorías";
        btn.classList.add('active');
        document.getElementById('btn-view-teams').classList.remove('active');
        populateTournamentFilter();
        rankingsContainer.innerHTML = '';
        setRankingDirty(false);
        closeTagPopups();
    } else if (btn.id === 'btn-view-teams' && currentView !== 'teams') {
        currentView = 'teams';
        if(pageTitle) pageTitle.textContent = "SuperLiga";
        btn.classList.add('active');
        document.getElementById('btn-view-category').classList.remove('active');
        setRankingDirty(false);
        closeTagPopups();
        
        populateTournamentFilter().then(() => {
            const teamTournaments = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
            if (teamTournaments.length > 0) {
                teamTournaments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const latestTournament = teamTournaments[0];
                tournamentFilter.value = latestTournament.id;
                renderTeamRankings();
            } else {
                rankingsContainer.innerHTML = '';
            }
        });
    }
}

/**
 * Listener de clic global para manejar todas las interacciones.
 */
function handleDocumentClick(e) {
    const target = e.target;

    // 1. Clic en un botón para SETEAR la etiqueta (la acción más importante)
    const setTagBtn = target.closest('button[data-action="set-tag"]');
    if (setTagBtn) {
        handleSetTag(setTagBtn);
        return; // Acción completada
    }

    // 2. Clic en un botón para ABRIR el popup de etiqueta
    const openPopupBtn = target.closest('button[data-action="edit-tag"]');
    if (openPopupBtn) {
        // Si se hace clic en el mismo botón, se cierra. Si es en otro, se cierra el viejo y se abre el nuevo.
        const isAlreadyOpen = openPopupBtn.parentElement.querySelector('.tag-editor-popup');
        closeTagPopups(); // Siempre cerrar popups existentes
        if (!isAlreadyOpen) {
            handleEditTag(openPopupBtn); // Abrir el nuevo
        }
        return; // Acción completada
    }

    // 3. Clic en un botón para CAMBIAR EL DIVISOR
    const toggleDividerBtn = target.closest('button[data-action="toggle-divider"]');
    if (toggleDividerBtn) {
        handleToggleDivider(toggleDividerBtn);
        return; // Acción completada
    }

    // 4. Clic en un botón para CAMBIAR DE VISTA
    const viewBtn = target.closest('.btn-view');
    if (viewBtn) {
        handleViewChange(viewBtn);
        return; // Acción completada
    }

    // 5. Si no fue ninguna de las acciones de admin, verificar si fue un clic "afuera"
    const isInsidePopup = target.closest('.tag-editor-popup');
    const isAdminActionButton = target.closest('.admin-btn'); // Cualquier botón de admin
    
    // Si el clic NO fue en un popup Y NO fue en un botón de admin (para reabrirlo)
    if (!isInsidePopup && !isAdminActionButton) {
        closeTagPopups(); // Cerrar todos los popups abiertos
    }
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', loadInitialData);
tournamentFilter.addEventListener('change', handleFilterChange);
saveRankingChangesBtn.addEventListener('click', handleSaveRankingChanges);
document.addEventListener('click', handleDocumentClick);
// *** FIN: CORRECCIÓN DE EVENTOS ***