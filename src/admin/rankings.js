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
// Nuevos elementos para guardar metadata
const saveChangesContainer = document.getElementById('save-changes-container');
const saveRankingChangesBtn = document.getElementById('save-ranking-changes-btn');

// --- Estado Global ---
let allTournaments = [];
let currentView = 'category';
let currentRankingData = []; // Guardará los stats calculados
let currentRankingMetadata = new Map(); // Map(playerId -> { id, tournament_id, player_id, is_divider_after, special_tag, tag_color })
let rankingDirty = false; // Flag para cambios pendientes

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
        </style>
    `;

    const btnCategory = document.getElementById('btn-view-category');
    const btnTeams = document.getElementById('btn-view-teams');

    btnCategory.addEventListener('click', () => {
        if (currentView === 'category') return;
        currentView = 'category';
        if(pageTitle) pageTitle.textContent = "Categorías";
        btnCategory.classList.add('active');
        btnTeams.classList.remove('active');
        populateTournamentFilter();
        rankingsContainer.innerHTML = '';
        setRankingDirty(false); // Ocultar botón de guardar
    });

    btnTeams.addEventListener('click', async () => {
        if (currentView === 'teams') return;
        currentView = 'teams';
        if(pageTitle) pageTitle.textContent = "SuperLiga";
        btnTeams.classList.add('active');
        btnCategory.classList.remove('active');
        setRankingDirty(false); // Ocultar botón de guardar
        
        await populateTournamentFilter();
        
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
async function renderCategoryRankings(playerToHighlight = null) {
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
        supabase.from('player_ranking_metadata').select('*').eq('tournament_id', tournamentId) // Cargar metadata
    ]);

    if (pError || mError) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-red-500">Error al cargar datos del torneo.</p></div>';
        return;
    }
    if (metaError) {
        showToast("Error al cargar la metadata del ranking", "error");
    }

    // Guardar metadata en el estado global
    currentRankingMetadata.clear();
    (metadataData || []).forEach(meta => {
        currentRankingMetadata.set(meta.player_id, meta);
    });

    // 4. Calcular estadísticas
    const stats = calculateCategoryStats(playersInTournament || [], matchesInTournament || []);
    currentRankingData = stats; // Guardar datos calculados en el estado
    
    const categoriesInTournament = [...new Map(playersInTournament.map(p => p && [p.category_id, p.categories]).filter(Boolean)).values()];

    rankingsContainer.innerHTML = '';
    if (categoriesInTournament.length === 0) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">No hay jugadores con categoría en este torneo.</p></div>';
        return;
    }

    // 5. Renderizar cada categoría
    categoriesInTournament.forEach(category => {
        let categoryStats = stats.filter(s => s.categoryId === category.id);
        
        const tableContainer = document.createElement('div');
        tableContainer.className = 'bg-[#222222] p-4 rounded-xl shadow-lg overflow-x-auto mb-8';
        // Pasar la metadata al generador HTML
        tableContainer.innerHTML = generateCategoryRankingsHTML(category, categoryStats, playerToHighlight, currentRankingMetadata);
        rankingsContainer.appendChild(tableContainer);
    });
}

function calculateCategoryStats(players, matches) {
    const stats = players.map(player => ({
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
    
    // Función helper para la etiqueta (para no repetir código)
    const renderTag = (meta) => {
        if (meta && meta.special_tag) {
            const tagColor = meta.tag_color || '#374151';
            const textColor = isColorLight(tagColor) ? '#000' : '#fff';
            return `<span class="special-tag" style="background-color: ${tagColor}; color: ${textColor};">${meta.special_tag}</span>`;
        }
        return '';
    };

    // Función helper para el color de texto de la etiqueta
    const isColorLight = (hex) => {
        if (!hex || typeof hex !== 'string') return false;
        let c = hex.startsWith('#') ? hex.slice(1) : hex;
        if (c.length === 3) c = c.split('').map(char => char + char).join('');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luminance > 0.5;
    };
    
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
            const hasPlayed = s.pj > 0;
            const difPClass = 'text-[#e8b83a]';
            const difSClass = 'text-[#e8b83a]';
            const difGClass = 'text-[#e8b83a]';
            const highlightClass = s.playerId == playerToHighlight ? 'bg-yellow-900/50' : '';

            // Obtener metadata para este jugador
            const meta = metadataMap.get(s.playerId) || { is_divider_after: false, special_tag: null, tag_color: null };
            const isDividerActive = meta.is_divider_after;
            const isTagActive = meta.special_tag && meta.special_tag !== '';
            
            // Renderizar la etiqueta especial si existe
            const tagHTML = renderTag(meta);

            // Renderizar la fila del jugador
            tableHTML += `
                <tr class="${highlightClass}" data-player-id="${s.playerId}">
                    <td class="admin-actions" style="border-width: 0 0 2px 1px; border-color: #4b556352;">
                        <button class="admin-btn toggle-divider-btn ${isDividerActive ? 'active' : ''}" data-action="toggle-divider" data-player-id="${s.playerId}" title="Poner/Quitar línea divisoria">
                            <span class="material-icons">horizontal_rule</span>
                        </button>
                        <button class="admin-btn edit-tag-btn ${isTagActive ? 'active' : ''}" data-action="edit-tag" data-player-id="${s.playerId}" title="Editar etiqueta">
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

// --- Lógica de Edición de Metadata (NUEVA) ---

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
 * Maneja el clic en el botón de la línea divisoria
 * @param {HTMLElement} btn - El botón que fue clickeado
 */
function handleToggleDivider(btn) {
    const playerId = Number(btn.dataset.playerId);
    const tournamentId = Number(tournamentFilter.value);
    
    // Obtener o crear la metadata para este jugador
    let meta = currentRankingMetadata.get(playerId) || {
        player_id: playerId,
        tournament_id: tournamentId,
        is_divider_after: false,
        special_tag: null,
        tag_color: null
    };

    // Alternar el estado
    meta.is_divider_after = !meta.is_divider_after;
    currentRankingMetadata.set(playerId, meta);

    // Actualizar UI
    btn.classList.toggle('active', meta.is_divider_after);
    const dividerRow = rankingsContainer.querySelector(`tr[data-divider-for-player-id="${playerId}"]`);
    if (meta.is_divider_after && !dividerRow) {
        // Añadir fila divisoria
        const playerRow = rankingsContainer.querySelector(`tr[data-player-id="${playerId}"]`);
        if (playerRow) { // Comprobación para evitar el error
            playerRow.insertAdjacentHTML('afterend', `<tr class="ranking-divider-row" data-divider-for-player-id="${playerId}"><td colspan="17"></td></tr>`);
        } else {
            console.error("No se encontró la fila del jugador para insertar el divisor");
        }
    } else if (!meta.is_divider_after && dividerRow) {
        // Quitar fila divisoria
        dividerRow.remove();
    }
    
    setRankingDirty(true);
}

/**
 * Maneja el clic en el botón de editar etiqueta
 * @param {HTMLElement} btn - El botón que fue clickeado
 */
function handleEditTag(btn) {
    const playerId = Number(btn.dataset.playerId);
    // INICIO MODIFICACIÓN: El contenedor de la etiqueta ahora está en la última celda
    const playerRow = rankingsContainer.querySelector(`tr[data-player-id="${playerId}"]`);
    const tagContainer = playerRow.querySelector(`.tag-container[data-player-id="${playerId}"]`);
    // FIN MODIFICACIÓN

    if (!tagContainer) return;

    // Si ya está en modo edición, no hacer nada
    if (tagContainer.querySelector('.tag-editor-inline')) return;
    
    const meta = currentRankingMetadata.get(playerId) || { special_tag: '', tag_color: '#facc15' };

    // Guardar HTML original para cancelar
    tagContainer.dataset.originalHtml = tagContainer.innerHTML;
    
    // Inyectar el editor inline
    tagContainer.innerHTML = `
        <span class="tag-editor-inline">
            <input type="text" class="tag-text-input" placeholder="Tag (ej: A1)" value="${meta.special_tag || ''}">
            <input type="color" class="tag-color-input" value="${meta.tag_color || '#facc15'}">
            <span class="material-icons action-icon icon-save" data-action="save-tag" data-player-id="${playerId}">check_circle</span>
            <span class="material-icons action-icon icon-cancel" data-action="cancel-tag" data-player-id="${playerId}">cancel</span>
        </span>
    `;
}

/**
 * Maneja clics dentro del contenedor de ranking para guardar/cancelar etiquetas
 * @param {Event} e
 */
function handleRankingContainerClick(e) {
    const target = e.target;
    const action = target.dataset.action;
    
    // Si el clic fue en los botones principales de la columna Admin, no hacer nada aquí.
    if (target.closest('.admin-btn')) {
        return;
    }

    // Lógica para guardar o cancelar
    const playerId = Number(target.closest('[data-player-id]')?.dataset.playerId);
    if (!action || !playerId) return;
    
    // INICIO MODIFICACIÓN: El contenedor de la etiqueta ahora está en la última celda
    const playerRow = rankingsContainer.querySelector(`tr[data-player-id="${playerId}"]`);
    const tagContainer = playerRow.querySelector(`.tag-container[data-player-id="${playerId}"]`);
    // FIN MODIFICACIÓN
    
    if (!tagContainer) return;
    
    if (action === 'save-tag') {
        const textInput = tagContainer.querySelector('.tag-text-input');
        const colorInput = tagContainer.querySelector('.tag-color-input');
        const newTag = textInput.value.trim() || null;
        const newColor = colorInput.value;

        // Actualizar el estado global
        let meta = currentRankingMetadata.get(playerId) || {
            player_id: playerId,
            tournament_id: Number(tournamentFilter.value),
            is_divider_after: false
        };
        meta.special_tag = newTag;
        meta.tag_color = newColor;
        currentRankingMetadata.set(playerId, meta);
        
        // Renderizar solo la etiqueta (modo display)
        if (newTag) {
            const isLight = (hex) => { // Helper local
                if (!hex) return false;
                let c = hex.startsWith('#') ? hex.slice(1) : hex;
                if (c.length === 3) c = c.split('').map(char => char + char).join('');
                const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
                return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
            };
            const textColor = isLight(newColor) ? '#000' : '#fff';
            tagContainer.innerHTML = `<span class="special-tag" style="background-color: ${newColor}; color: ${textColor};">${newTag}</span>`;
        } else {
            tagContainer.innerHTML = ''; // Limpiar si no hay tag
        }
        
        // Marcar el botón de "Editar Etiqueta" como activo/inactivo
        const editBtn = rankingsContainer.querySelector(`.edit-tag-btn[data-player-id="${playerId}"]`);
        if(editBtn) editBtn.classList.toggle('active', !!newTag);
        
        setRankingDirty(true);

    } else if (action === 'cancel-tag') {
        // Restaurar HTML original
        tagContainer.innerHTML = tagContainer.dataset.originalHtml || '';
    }
}

/**
 * Guarda todos los cambios de metadata (divisores y etiquetas) en Supabase
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

    const metadataToUpsert = [];
    
    // Obtener todos los playerIds del ranking actual
    const playerIdsInCurrentRanking = currentRankingData.map(s => s.playerId);
    // Crear un set de IDs que tienen metadata activa
    const playerIdsWithMetadata = new Set();

    currentRankingMetadata.forEach((meta, playerId) => {
        // Solo procesar metadata del torneo actual
        if (meta.tournament_id === tournamentId) {
            if (meta.is_divider_after || meta.special_tag) {
                // Si tiene datos, va al upsert
                metadataToUpsert.push({
                    tournament_id: meta.tournament_id,
                    player_id: meta.player_id,
                    is_divider_after: meta.is_divider_after || false,
                    special_tag: meta.special_tag || null,
                    tag_color: meta.tag_color || null
                });
                playerIdsWithMetadata.add(playerId);
            }
        }
    });
    
    // Lista final de IDs a borrar: todos los del ranking actual que NO están en la lista de upsert.
    const finalPlayerIdsToClear = playerIdsInCurrentRanking.filter(id => !playerIdsWithMetadata.has(id));

    try {
        // Borrar metadata que ya no es necesaria
        if (finalPlayerIdsToClear.length > 0) {
            const { error: deleteError } = await supabase
                .from('player_ranking_metadata')
                .delete()
                .eq('tournament_id', tournamentId)
                .in('player_id', finalPlayerIdsToClear);
            
            if (deleteError) throw deleteError;
        }
        
        // Insertar o actualizar la metadata
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
document.addEventListener('DOMContentLoaded', async () => {
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
        await (currentView === 'category' ? renderCategoryRankings(playerToHighlight) : renderTeamRankings());
    } else {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione un torneo para ver las posiciones.</p></div>';
    }
});

tournamentFilter.addEventListener('change', () => {
    if (currentView === 'category') {
        renderCategoryRankings(null);
    } else {
        renderTeamRankings();
    }
});

// Event listener delegado para los botones de admin
rankingsContainer.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.toggle-divider-btn');
    if (toggleBtn) {
        handleToggleDivider(toggleBtn); // <-- FIX: Pasar el BOTÓN
        return;
    }
    
    const editBtn = e.target.closest('.edit-tag-btn');
    if (editBtn) {
        handleEditTag(editBtn); // <-- FIX: Pasar el BOTÓN
        return;
    }
    
    // Listener para guardar o cancelar el editor inline
    handleRankingContainerClick(e);
});

// Listener para el botón principal de Guardar
saveRankingChangesBtn.addEventListener('click', handleSaveRankingChanges);