import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

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

    // --- CORRECCIÓN: Se añaden todos los jugadores al select para identificar partidos de dobles ---
    const [
        { data: player, error: playerError },
        { data: matches, error: matchesError },
        { data: tournaments, error: tournamentsError }
    ] = await Promise.all([
        supabase.from('players').select(`*, category:category_id(name), team:team_id(name, image_url)`).eq('id', playerId).single(),
        supabase.from('matches').select(`*, 
            tournament:tournament_id(name), 
            player1:player1_id(id, name), 
            player2:player2_id(id, name), 
            player3:player3_id(id, name), 
            player4:player4_id(id, name), 
            winner:winner_id(id, name)`)
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId},player3_id.eq.${playerId},player4_id.eq.${playerId}`)
        .order('match_date', { ascending: false }),
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
        
        const isPlayerInSide1 = m.player1_id === playerId || m.player3_id === playerId;
        const winnerIsSide1 = m.winner_id === m.player1_id || m.winner_id === m.player3_id;

        (m.sets || []).forEach(set => {
            stats.sg += isPlayerInSide1 ? (set.p1 > set.p2 ? 1 : 0) : (set.p2 > set.p1 ? 1 : 0);
            stats.sp += isPlayerInSide1 ? (set.p2 > set.p1 ? 1 : 0) : (set.p1 > set.p2 ? 1 : 0);
            stats.gg += isPlayerInSide1 ? set.p1 : set.p2;
            stats.gp += isPlayerInSide1 ? set.p2 : set.p1;
        });

        if (isPlayerInSide1 === winnerIsSide1) stats.pg++;
        else stats.pp++;
    });
    return stats;
}

function renderDashboard(player, matches, stats, tournaments) {
    container.innerHTML = `
        <div class="bg-[#222222] p-6 rounded-xl shadow-lg flex flex-col sm:flex-row items-center gap-6">
            <img src="${player.team?.image_url || 'https://via.placeholder.com/80'}" alt="Logo" class="h-24 w-24 rounded-full object-cover border-4 border-gray-700">
            <div>
                <h1 class="text-4xl font-bold text-gray-100 text-center sm:text-left">${player.name}</h1>
                <p class="text-lg text-gray-400 text-center sm:text-left">${player.category?.name || 'Sin Categoría'} | ${player.team?.name || 'Sin Equipo'}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-8">
                <div class="bg-[#222222] p-6 rounded-xl shadow-lg">
                    <h2 class="text-xl font-semibold mb-4 text-gray-100">Estadísticas Generales</h2>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div class="bg-gray-800 p-4 rounded-lg"><p class="text-3xl font-bold text-gray-100">${stats.pj}</p><p class="text-sm text-gray-400">Jugados</p></div>
                        <div class="bg-green-900/50 p-4 rounded-lg"><p class="text-3xl font-bold text-green-400">${stats.pg}</p><p class="text-sm text-green-500">Victorias</p></div>
                        <div class="bg-red-900/50 p-4 rounded-lg"><p class="text-3xl font-bold text-red-400">${stats.pp}</p><p class="text-sm text-red-500">Derrotas</p></div>
                        <div class="bg-yellow-900/50 p-4 rounded-lg"><p class="text-3xl font-bold text-yellow-400">${stats.pj > 0 ? ((stats.pg / stats.pj) * 100).toFixed(0) : 0}%</p><p class="text-sm text-yellow-500">Efectividad</p></div>
                    </div>
                </div>
                <div class="bg-[#222222] p-6 rounded-xl shadow-lg">
                    <h2 class="text-xl font-semibold mb-4 text-gray-100">Historial de Partidos</h2>
                    <div class="space-y-4">
                        ${matches.length > 0 ? matches.map(m => {
                            const isDoubles = m.player3 && m.player4;
                            const isPlayerInSide1 = m.player1_id === player.id || m.player3_id === player.id;
                            const winnerIsSide1 = m.winner_id === m.player1_id || m.winner_id === m.player3_id;
                            const gano = m.winner_id ? (isPlayerInSide1 === winnerIsSide1) : false;

                            let myPartner = null;
                            let opponents = [];
                            if (isDoubles) {
                                if (isPlayerInSide1) {
                                    myPartner = m.player1_id === player.id ? m.player3 : m.player1;
                                    opponents = [m.player2, m.player4];
                                } else {
                                    myPartner = m.player2_id === player.id ? m.player4 : m.player2;
                                    opponents = [m.player1, m.player3];
                                }
                            } else {
                                opponents = [isPlayerInSide1 ? m.player2 : m.player1];
                            }

                            const resultadoClass = m.winner_id ? (gano ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') : 'bg-gray-700 text-gray-400';
                            const setsStr = (m.sets || []).map(s => isPlayerInSide1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`).join(' ');

                            return `
                            <div class="bg-gray-800 p-4 rounded-lg border-l-4 ${gano ? 'border-green-500' : 'border-red-500'}">
                                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                                    <div>
                                        <p class="font-bold text-gray-100">${m.tournament.name}</p>
                                        <p class="text-xs text-gray-400">${new Date(m.match_date + 'T00:00:00').toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })} - ${m.location || 'Lugar a definir'}</p>
                                    </div>
                                    <div class="text-sm font-bold px-3 py-1 rounded-full ${resultadoClass} mt-2 sm:mt-0">${m.winner_id ? (gano ? 'VICTORIA' : 'DERROTA') : 'PENDIENTE'}</div>
                                </div>
                                <div class="flex flex-col sm:flex-row items-center justify-between mt-3 pt-3 border-t border-gray-700">
                                    <div class="text-center sm:text-left">
                                        <p class="text-xs text-gray-500">${isDoubles ? 'Tu Pareja' : ''}</p>
                                        <p class="font-semibold text-gray-200">${myPartner ? myPartner.name : ''}</p>
                                    </div>
                                    <div class="text-3xl font-light text-gray-500 my-2 sm:my-0">vs</div>
                                    <div class="text-center sm:text-right">
                                        <p class="text-xs text-gray-500">Oponentes</p>
                                        <p class="font-semibold text-gray-200">${opponents.map(o => o.name).join(' / ')}</p>
                                    </div>
                                </div>
                                ${m.winner_id ? `<div class="text-center mt-3 font-mono text-lg text-yellow-400 tracking-wider">${setsStr}</div>` : ''}
                            </div>
                            `
                        }).join('') : '<p class="text-center p-4 text-gray-400">No hay partidos registrados.</p>'}
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