import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

// No es necesario requireRole aquí si los jugadores también pueden ver su propio dashboard.
// Si es solo para admins, mantenlo.
// requireRole('admin'); 

const container = document.getElementById('player-dashboard-container');

async function loadPlayerData() {
    container.innerHTML = '<p class="text-center p-8 text-gray-400">Cargando datos del jugador...</p>';
    const urlParams = new URLSearchParams(window.location.search);
    const playerId = urlParams.get('id');

    if (!playerId) {
        container.innerHTML = '<p class="text-red-500 text-center p-8">No se especificó un ID de jugador.</p>';
        return;
    }

    // Cargar todos los datos en paralelo
    const [
        { data: player, error: playerError },
        { data: matches, error: matchesError },
        { data: tournaments, error: tournamentsError }
    ] = await Promise.all([
        supabase.from('players').select(`*, category:category_id(name), team:team_id(name, image_url)`).eq('id', playerId).single(),
        supabase.from('matches').select(`*, tournament:tournament_id(name), player1:player1_id(name), player2:player2_id(name), winner:winner_id(name)`).or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`).order('match_date', { ascending: false }),
        supabase.from('tournament_players').select(`tournament:tournaments(*, category:category_id(name))`).eq('player_id', playerId)
    ]);
    
    if (playerError || !player) {
        container.innerHTML = '<p class="text-red-500 text-center p-8">No se pudo encontrar al jugador.</p>';
        return;
    }

    const stats = calculatePlayerStats(player.id, matches || []);
    const enrolledTournaments = tournaments.map(t => t.tournament);

    renderDashboard(player, matches || [], stats, enrolledTournaments);
}

function calculatePlayerStats(playerId, matches) {
    const stats = { pj: 0, pg: 0, pp: 0, sg: 0, sp: 0, gg: 0, gp: 0 };
    matches.forEach(m => {
        if (!m.winner_id) return;
        stats.pj++;
        const isPlayer1 = m.player1_id === playerId;
        
        (m.sets || []).forEach(set => {
            stats.sg += isPlayer1 ? (set.p1 > set.p2 ? 1 : 0) : (set.p2 > set.p1 ? 1 : 0);
            stats.sp += isPlayer1 ? (set.p2 > set.p1 ? 1 : 0) : (set.p1 > set.p2 ? 1 : 0);
            stats.gg += isPlayer1 ? set.p1 : set.p2;
            stats.gp += isPlayer1 ? set.p2 : set.p1;
        });

        if (m.winner_id === playerId) stats.pg++;
        else stats.pp++;
    });
    return stats;
}

function renderDashboard(player, matches, stats, tournaments) {
    container.innerHTML = `
        <div class="bg-[#222222] p-6 rounded-xl shadow-lg flex items-center gap-6">
            <img src="${player.team?.image_url || 'https://via.placeholder.com/80'}" alt="Logo" class="h-20 w-20 rounded-full object-cover border-4 border-gray-700">
            <div>
                <h1 class="text-4xl font-bold text-gray-100">${player.name}</h1>
                <p class="text-lg text-gray-400">${player.category?.name || 'Sin Categoría'} | ${player.team?.name || 'Sin Equipo'}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-8">
                <div class="bg-[#222222] p-6 rounded-xl shadow-lg">
                    <h2 class="text-xl font-semibold mb-4 text-gray-100">Estadísticas Generales</h2>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div class="bg-gray-800 p-4 rounded-lg">
                            <p class="text-3xl font-bold text-gray-100">${stats.pj}</p>
                            <p class="text-sm text-gray-400">Partidos Jugados</p>
                        </div>
                        <div class="bg-green-900/50 p-4 rounded-lg">
                            <p class="text-3xl font-bold text-green-400">${stats.pg}</p>
                            <p class="text-sm text-green-500">Victorias</p>
                        </div>
                        <div class="bg-red-900/50 p-4 rounded-lg">
                            <p class="text-3xl font-bold text-red-400">${stats.pp}</p>
                            <p class="text-sm text-red-500">Derrotas</p>
                        </div>
                        <div class="bg-yellow-900/50 p-4 rounded-lg">
                            <p class="text-3xl font-bold text-yellow-400">${stats.pj > 0 ? ((stats.pg / stats.pj) * 100).toFixed(0) : 0}%</p>
                            <p class="text-sm text-yellow-500">Efectividad</p>
                        </div>
                    </div>
                </div>
                <div class="bg-[#222222] p-6 rounded-xl shadow-lg">
                    <h2 class="text-xl font-semibold mb-4 text-gray-100">Historial de Partidos</h2>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-black">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Fecha</th>
                                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Torneo</th>
                                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Oponente</th>
                                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Resultado</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-700">
                                ${matches.length > 0 ? matches.map(m => {
                                    const oponente = m.player1_id === player.id ? m.player2.name : m.player1.name;
                                    const gano = m.winner_id === player.id;
                                    const resultado = m.winner_id ? (gano ? 'Victoria' : 'Derrota') : 'Pendiente';
                                    const resultadoClass = m.winner_id ? (gano ? 'text-green-400' : 'text-red-400') : 'text-gray-500';

                                    return `
                                    <tr>
                                        <td class="px-4 py-3 whitespace-nowrap text-gray-300">${new Date(m.match_date + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                                        <td class="px-4 py-3 whitespace-nowrap text-gray-300">${m.tournament.name}</td>
                                        <td class="px-4 py-3 whitespace-nowrap text-gray-300">${oponente}</td>
                                        <td class="px-4 py-3 whitespace-nowrap font-bold ${resultadoClass}">${resultado}</td>
                                    </tr>
                                    `
                                }).join('') : '<tr><td colspan="4" class="text-center p-4 text-gray-400">No hay partidos registrados.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="bg-[#222222] p-6 rounded-xl shadow-lg">
                <h2 class="text-xl font-semibold mb-4 text-gray-100">Torneos Inscritos</h2>
                <div class="space-y-4">
                    ${tournaments.length > 0 ? tournaments.map(t => `
                        <a href="rankings.html?tournamentId=${t.id}&highlightPlayerId=${player.id}" class="block p-4 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-yellow-400 transition group">
                            <p class="font-bold text-gray-100 group-hover:text-yellow-400">${t.name}</p>
                            <p class="text-sm text-gray-400">${t.category.name}</p>
                            <div class="flex items-center text-xs text-yellow-500 font-semibold mt-2">
                                <span>Ver mi posición en el ranking</span>
                                <span class="material-icons text-sm ml-1">arrow_forward</span>
                            </div>
                        </a>
                    `).join('') : '<p class="text-center text-sm text-gray-400 py-4">No está inscrito en ningún torneo.</p>'}
                </div>
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('header').innerHTML = renderHeader();
    loadPlayerData();
});