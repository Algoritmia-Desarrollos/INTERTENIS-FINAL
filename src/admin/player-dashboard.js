import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';
// import { calculatePoints } from './calculatePoints.js'; // ELIMINADO
import { renderMatchesTable } from '../common/components/matchesTable.js'; // AÑADIDO

const header = document.getElementById('header');
const container = document.getElementById('player-dashboard-container');

/*
// --- FUNCIÓN isColorLight ELIMINADA ---
function isColorLight(hex) {
    // ... (código eliminado)
}
*/

async function loadPlayerData() {
    container.innerHTML = '<div class="flex justify-center items-center p-8"><div class="spinner"></div></div>';
    const urlParams = new URLSearchParams(window.location.search);
    const playerId = urlParams.get('id');

    if (!playerId) {
        container.innerHTML = '<p class="text-red-500 text-center p-8">No se especificó un ID de jugador.</p>';
        return;
    }

    const { data: player, error: playerError } = await supabase.from('players').select(`*, category:category_id(name), team:team_id(id, name, image_url)`).eq('id', playerId).single();
    
    if (playerError || !player) {
        container.innerHTML = '<p class="text-red-500 text-center p-8">No se pudo encontrar al jugador.</p>';
        return;
    }

    const [{ data: matches }, { data: enrolledTournamentsData }] = await Promise.all([
        supabase.from('matches').select(`*, status, tournament:tournament_id(name), category:category_id(name, color), player1:player1_id(id, name, team:team_id(color, image_url)), player2:player2_id(id, name, team:team_id(color, image_url)), player3:player3_id(id, name), player4:player4_id(id, name), winner:winner_id(id, name)`)
            .or(`player1_id.eq.${playerId},player2_id.eq.${playerId},player3_id.eq.${playerId},player4_id.eq.${playerId}`)
            .order('match_date', { ascending: true }),
        supabase.from('tournament_players').select(`tournament:tournaments(*, category:category_id(name))`).eq('player_id', playerId)
    ]);
    
    const allMatches = matches || [];
    const pendingMatches = allMatches.filter(m => !m.winner_id);
    const matchHistory = allMatches.filter(m => m.winner_id).reverse();
    const stats = calculatePlayerStats(player.id, matchHistory);

    const enrolledTournaments = enrolledTournamentsData.map(t => t.tournament);
    const individualTournament = enrolledTournaments.find(t => t.category.name !== 'Equipos');
    const teamTournament = enrolledTournaments.find(t => t.category.name === 'Equipos');
    
    renderDashboard(player, stats, pendingMatches, matchHistory, individualTournament, teamTournament);
}

function calculatePlayerStats(playerId, playedMatches) {
    const stats = { pj: 0, pg: 0, pp: 0 };
    playedMatches.forEach(m => {
        stats.pj++;
        const isPlayerInSide1 = m.player1_id === playerId || m.player3_id === playerId;
        const winnerIsSide1 = m.winner_id === m.player1_id || m.winner_id === m.player3_id;
        if (isPlayerInSide1 === winnerIsSide1) stats.pg++;
        else stats.pp++;
    });
    return stats;
}

function renderDashboard(player, stats, pendingMatches, matchHistory, individualTournament, teamTournament) {
    const efectividad = stats.pj > 0 ? ((stats.pg / stats.pj) * 100).toFixed(0) : 0;
    
    let buttonsHTML = '<div class="flex flex-row flex-wrap justify-center sm:justify-end gap-2 mt-4 sm:mt-0">';
    if (individualTournament) {
        buttonsHTML += `<a href="/src/admin/rankings.html?tournamentId=${individualTournament.id}&highlightPlayerId=${player.id}" class="btn btn-secondary !py-2 !px-4 text-sm">Ver Ranking Individual</a>`;
    }
    if (teamTournament && player.team) {
        buttonsHTML += `<a href="/src/admin/rankings.html?tournamentId=${teamTournament.id}&highlightTeamId=${player.team.id}" class="btn btn-secondary !py-2 !px-4 text-sm">Ver Ranking de Equipo</a>`;
    }
    buttonsHTML += '</div>';

    container.innerHTML = `
        <div class="bg-[#222222] p-4 sm:p-6 rounded-xl shadow-lg">
            <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <img src="${player.team?.image_url || 'https://via.placeholder.com/80'}" alt="Logo" class="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border-4 border-gray-700 flex-shrink-0">
                <div class="flex-grow w-full text-center sm:text-left">
                    <h1 class="text-3xl sm:text-4xl font-bold text-gray-100">${player.name}</h1>
                    <p class="text-md text-gray-400">${player.category?.name || 'Sin Categoría'} | ${player.team?.name || 'Sin Equipo'}</p>
                </div>
                ${buttonsHTML}
            </div>
            <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold">${stats.pj}</p><p class="text-xs text-gray-400">Jugados</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold text-green-400">${stats.pg}</p><p class="text-xs text-gray-400">Victorias</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold text-red-400">${stats.pp}</p><p class="text-xs text-gray-400">Derrotas</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold text-yellow-400">${efectividad}%</p><p class="text-xs text-gray-400">Efectividad</p></div>
            </div>
        </div>
        <div>
            <h2 class="text-2xl font-bold text-gray-100 mb-4">Partidos Pendientes</h2>
            <div id="pending-matches-container"></div>
        </div>
        <div>
            <h2 class="text-2xl font-bold text-gray-100 mb-4">Historial de Partidos</h2>
            <div id="history-matches-container"></div>
        </div>
    `;

    // AHORA LLAMA A LA FUNCIÓN IMPORTADA
    renderMatchesTable(pendingMatches, document.getElementById('pending-matches-container'), 'No hay partidos pendientes.');
    renderMatchesTable(matchHistory, document.getElementById('history-matches-container'), 'No hay partidos en el historial.');
}

// --- FUNCIÓN renderMatchesTable ELIMINADA DE AQUÍ ---

document.addEventListener('DOMContentLoaded', () => {
    header.innerHTML = renderHeader();
    loadPlayerData();
});