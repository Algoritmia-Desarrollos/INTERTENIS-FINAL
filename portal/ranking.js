// Ruta: portal/ranking.js

import { supabase } from '../src/common/supabase.js';
import { renderPortalHeader } from './portal_header.js'; // CAMBIADO
import { requirePlayer, getPlayer } from './portal_router.js'; // CAMBIADO
import { renderTeamScoreboard } from '../src/admin/team-scoreboard.js';
// IMPORTACIÓN MODIFICADA: calculatePoints ya no es necesaria aquí
// IMPORTACIÓN NUEVA: Se importa la lógica centralizada
import { calculateCategoryStats, generateCategoryRankingsHTML } from '../src/common/components/rankingTable.js';


// --- PROTEGER PÁGINA ---
requirePlayer();

// --- Elementos del DOM ---
const header = document.getElementById('header');
const tournamentFilter = document.getElementById('tournament-filter');
const rankingsContainer = document.getElementById('rankings-container');
const viewSwitcherContainer = document.getElementById('view-switcher-container');
const filterLabel = document.getElementById('filter-label');
const pageTitle = document.querySelector('h1');

// --- Estado Global ---
let allTournaments = [];
let currentView = 'category';
let currentRankingMetadata = new Map(); 

// --- Lógica de Vistas y Filtros ---
// (Las funciones setupViewSwitcher, populateTournamentFilter, renderTeamRankings,
// son idénticas a las de public.js. Las copiamos aquí)

function setupViewSwitcher() {
    viewSwitcherContainer.innerHTML = `
        <div class="flex border-b border-gray-700 mb-4">
            <button id="btn-view-category" class="btn-view active">Singles</button>
            <button id="btn-view-teams" class="btn-view">SuperLiga</button>
        </div>
        <style>
            .btn-view { padding: 8px 16px; border-bottom: 2px solid transparent; color: #9ca3af; font-weight: 600; cursor: pointer;}
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
    });

    btnTeams.addEventListener('click', async () => {
        if (currentView === 'teams') return;
        currentView = 'teams';
        if(pageTitle) pageTitle.textContent = "SuperLiga";
        btnTeams.classList.add('active');
        btnCategory.classList.remove('active');
        
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

    tournamentFilter.innerHTML = '<option value="" disabled selected>Seleccione una categoría...</option>';
    tournamentsToShow.forEach(t => {
        tournamentFilter.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

// --- RANKING POR EQUIPOS ---
function renderTeamRankings(teamToHighlight = null) {
    const tournamentId = tournamentFilter.value;
    renderTeamScoreboard(rankingsContainer, tournamentId, { isAdmin: false, teamToHighlight });
}


// --- RANKING POR CATEGORÍA (Modificado) ---
async function renderCategoryRankings(playerToHighlight = null) {
    const tournamentId = tournamentFilter.value;
    rankingsContainer.innerHTML = '<p class="text-center p-8 text-gray-400">Calculando POSICIONES...</p>';

    if (!tournamentId) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione una categoría para ver las POSICIONES.</p></div>';
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
        supabase.from('ranking_position_metadata').select('rank_position, is_divider_after, special_tag, tag_color').eq('tournament_id', tournamentId) // Cargar metadata
    ]);

    if (pError || mError) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-red-500">Error al cargar datos del torneo.</p></div>';
        return;
    }
    if (metaError) {
        console.warn("Error al cargar la metadata del ranking", metaError);
    }

    // Guardar metadata en el estado global
    currentRankingMetadata.clear();
    (metadataData || []).forEach(meta => {
        currentRankingMetadata.set(meta.rank_position, meta);
    });

    // 4. Calcular estadísticas (USA LA FUNCIÓN IMPORTADA)
    const stats = calculateCategoryStats(playersInTournament || [], matchesInTournament || []);
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
        
        // Pasar la metadata al generador HTML (USA LA FUNCIÓN IMPORTADA)
        tableContainer.innerHTML = generateCategoryRankingsHTML(category, categoryStats, playerToHighlight, currentRankingMetadata);
        rankingsContainer.appendChild(tableContainer);
    });
}


// --- SE ELIMINARON LAS FUNCIONES `calculateCategoryStats` Y `generateCategoryRankingsHTML` DE AQUÍ ---


// --- INICIALIZACIÓN Y EVENTOS ---
document.addEventListener('DOMContentLoaded', async () => {
    // --- CAMBIO: Usar renderPortalHeader ---
    header.innerHTML = renderPortalHeader();
    if(pageTitle) pageTitle.textContent = "Categorías";
    setupViewSwitcher();
    await populateTournamentFilter();
    
    // --- CAMBIO: Lógica para obtener el jugador desde el portal ---
    const player = getPlayer();
    const playerToHighlight = player?.id || null;
    const teamToHighlight = player?.team?.id || null;
    let tournamentIdToSelect = null;
    
    // Auto-seleccionar el torneo del jugador
    if (playerToHighlight) {
        // 1. Buscar en qué torneos individuales está inscrito
        const { data: enrollments, error } = await supabase
            .from('tournament_players')
            .select('tournament:tournaments!inner(id, category:category_id(name))')
            .eq('player_id', playerToHighlight);
            
        if (enrollments && enrollments.length > 0) {
            // 2. Encontrar el primer torneo que NO sea de 'Equipos'
            const individualEnrollment = enrollments.find(e => e.tournament.category.name !== 'Equipos');
            if (individualEnrollment) {
                tournamentIdToSelect = individualEnrollment.tournament.id;
            }
        }
    }
    
    // Auto-seleccionar el torneo de SuperLiga (si no se encontró uno individual)
    if (!tournamentIdToSelect && teamToHighlight) {
        const teamTournaments = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
        if (teamTournaments.length > 0) {
            teamTournaments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            tournamentIdToSelect = teamTournaments[0].id; // Seleccionar el más nuevo
        }
    }
    // --- FIN DEL CAMBIO ---

    if (tournamentIdToSelect) {
        tournamentFilter.value = tournamentIdToSelect;
        const selectedTournament = allTournaments.find(t => t.id == tournamentIdToSelect);
        
        if (selectedTournament?.category?.name === 'Equipos') {
            document.getElementById('btn-view-teams').click();
            await renderTeamRankings(teamToHighlight); 
        } else {
             await renderCategoryRankings(playerToHighlight); 
        }
    } else {
        // Si el jugador no está en ningún torneo, simplemente no selecciona nada
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione una categoría para ver las posiciones.</p></div>';
    }
    
    // Listener para los botones de vista (Singles/SuperLiga)
    document.getElementById('view-switcher-container').addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.btn-view');
        if (viewBtn) {
            // Lógica de cambio de vista
            if (viewBtn.id === 'btn-view-category') {
                if (currentView === 'category') return;
                currentView = 'category';
                if(pageTitle) pageTitle.textContent = "Categorías";
                viewBtn.classList.add('active');
                document.getElementById('btn-view-teams')?.classList.remove('active');
                populateTournamentFilter();
                rankingsContainer.innerHTML = '';
            } else if (viewBtn.id === 'btn-view-teams') {
                if (currentView === 'teams') return;
                currentView = 'teams';
                if(pageTitle) pageTitle.textContent = "SuperLiga";
                viewBtn.classList.add('active');
                document.getElementById('btn-view-category')?.classList.remove('active');
                
                (async () => {
                    await populateTournamentFilter();
                    const teamTournaments = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
                    if (teamTournaments.length > 0) {
                        teamTournaments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                        const latestTournament = teamTournaments[0];
                        tournamentFilter.value = latestTournament.id;
                        renderTeamRankings(teamToHighlight); // Pasar el ID de highlight
                    } else {
                        rankingsContainer.innerHTML = '';
                    }
                })();
            }
        }
    });

    // Listener para el <select> de torneo
    tournamentFilter.addEventListener('change', () => {
        if (currentView === 'category') {
            renderCategoryRankings(playerToHighlight); // Pasar el ID de highlight
        } else {
            renderTeamRankings(teamToHighlight); // Pasar el ID de highlight
        }
    });
});