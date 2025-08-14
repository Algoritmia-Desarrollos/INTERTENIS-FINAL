import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

let lastMatchesData = []; // Guardar los datos de los partidos para el modal
let allPlayers = []; // Guardar todos los jugadores para los selects del modal

// --- Carga Inicial ---
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('header').innerHTML = renderHeader();
    await loadDashboardData();
});

async function loadDashboardData() {
    const summaryContainer = document.getElementById('dashboard-summary');
    const matchesContainer = document.getElementById('matches-container');

    summaryContainer.innerHTML = '<p>Cargando estadísticas...</p>';
    matchesContainer.innerHTML = '<p>Cargando partidos...</p>';

    const [
        { count: tournamentCount },
        { count: playerCount },
        { count: matchCount },
        { data: lastMatches, error: matchesError },
        { data: players, error: playersError }
    ] = await Promise.all([
        supabase.from('tournaments').select('*', { count: 'exact', head: true }),
        supabase.from('players').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select(`*, 
            category:category_id(id, name),
            player1:player1_id(*, team:team_id(image_url)), 
            player2:player2_id(*, team:team_id(image_url)), 
            winner:winner_id(name)`)
        .order('match_date', { ascending: false })
        .limit(15),
        supabase.from('players').select('*').order('name')
    ]);
    
    lastMatchesData = lastMatches || [];
    allPlayers = players || [];

    // --- Renderizar Tarjetas de Resumen como Enlaces ---
    summaryContainer.innerHTML = `
        <a href="tournaments.html" class="block bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4 transition hover:shadow-md hover:border-yellow-300">
            <span class="material-icons text-4xl text-yellow-500">emoji_events</span>
            <div>
                <p class="text-gray-500">Torneos Activos</p>
                <p class="text-2xl font-bold">${tournamentCount ?? 0}</p>
            </div>
        </a>
        <a href="players.html" class="block bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4 transition hover:shadow-md hover:border-yellow-300">
            <span class="material-icons text-4xl text-yellow-500">groups</span>
            <div>
                <p class="text-gray-500">Jugadores Registrados</p>
                <p class="text-2xl font-bold">${playerCount ?? 0}</p>
            </div>
        </a>
        <a href="matches.html" class="block bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4 transition hover:shadow-md hover:border-yellow-300">
            <span class="material-icons text-4xl text-yellow-500">sports_tennis</span>
            <div>
                <p class="text-gray-500">Partidos Jugados</p>
                <p class="text-2xl font-bold">${matchCount ?? 0}</p>
            </div>
        </a>
    `;

    // --- Renderizar Nueva Tabla de Últimos Partidos ---
    if (matchesError || lastMatchesData.length === 0) {
        matchesContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay partidos registrados.</p>';
        return;
    }

    matchesContainer.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Fecha y Hora</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cancha</th>
                        <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Jugador A</th>
                        <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Pts</th>
                        <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Resultado (Games)</th>
                        <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Pts</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador B</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${lastMatchesData.map(match => {
                        const { p1_points, p2_points } = calculatePoints(match);
                        const p1_winner = match.winner_id === match.player1_id;
                        const p2_winner = match.winner_id === match.player2_id;
                        const no_winner = !match.winner_id;

                        const p1_class = no_winner ? 'text-gray-800' : p1_winner ? 'text-yellow-600 font-bold' : 'text-gray-500';
                        const p2_class = no_winner ? 'text-gray-800' : p2_winner ? 'text-yellow-600 font-bold' : 'text-gray-500';
                        
                        const sets = match.sets || [];
                        const result_string = sets.length > 0 ? sets.map(s => `${s.p1}-${s.p2}`).join(', ') : '-';
                        const time_string = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';

                        return `
                        <tr class="hover:bg-gray-100 cursor-pointer" data-match-id="${match.id}">
                            <td class="px-4 py-3 whitespace-nowrap text-sm">
                                ${new Date(match.match_date).toLocaleDateString('es-AR')}
                                <span class="block text-xs text-gray-400">${time_string} hs</span>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${match.location || 'A definir'}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-right ${p1_class}">
                                <div class="flex items-center justify-end gap-2">
                                    <span>${match.player1.name}</span>
                                    <img src="${match.player1.team?.image_url || 'https://via.placeholder.com/24'}" class="h-6 w-6 rounded-full object-cover">
                                </div>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap text-center font-bold text-lg ${p1_class}">${p1_points}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-center font-mono font-semibold">${result_string}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-center font-bold text-lg ${p2_class}">${p2_points}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm ${p2_class}">
                                <div class="flex items-center gap-2">
                                    <img src="${match.player2.team?.image_url || 'https://via.placeholder.com/24'}" class="h-6 w-6 rounded-full object-cover">
                                    <span>${match.player2.name}</span>
                                </div>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${match.category.name}</td>
                        </tr>
                        `
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// --- Lógica del Modal ---
function openScoreModal(match) {
    const modalContainer = document.getElementById('score-modal-container');
    const sets = match.sets || [];
    const isPlayed = !!match.winner_id;
    const playersInCategory = allPlayers.filter(p => p.category_id === match.category_id);

    modalContainer.innerHTML = `
        <div id="score-modal-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div id="score-modal-content" class="bg-white rounded-xl shadow-lg w-full max-w-lg">
                <div class="p-6 border-b">
                    <h3 class="text-xl font-bold">Registrar Resultado</h3>
                </div>
                <form id="score-form" class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Jugador A</label>
                            <select id="player1-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>
                                ${playersInCategory.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Jugador B</label>
                            <select id="player2-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>
                                ${playersInCategory.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 items-center pt-4">
                        <span class="font-semibold">SET</span>
                        <span class="font-semibold text-center">${match.player1.name}</span>
                        <span class="font-semibold text-center">${match.player2.name}</span>
                    </div>
                    ${[1, 2, 3].map(i => `
                    <div class="grid grid-cols-3 gap-4 items-center">
                        <span class="text-gray-500">Set ${i}</span>
                        <input type="number" id="p1_set${i}" class="input-field text-center" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9">
                        <input type="number" id="p2_set${i}" class="input-field text-center" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9">
                    </div>
                    `).join('')}
                </form>
                <div class="p-4 bg-gray-50 flex justify-between gap-4 rounded-b-xl">
                    <div class="flex items-center gap-2">
                        <button id="btn-delete-match" class="btn btn-secondary !p-2" title="Eliminar Partido">
                            <span class="material-icons !text-red-600">delete_forever</span>
                        </button>
                        ${isPlayed ? `<button id="btn-clear-score" class="btn btn-secondary !p-2" title="Limpiar Resultado">
                            <span class="material-icons !text-yellow-600">cleaning_services</span>
                        </button>` : ''}
                    </div>
                    <div class="flex gap-4">
                        <button id="btn-cancel-modal" class="btn btn-secondary">Cancelar</button>
                        <button id="btn-save-score" class="btn btn-primary">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-save-score').onclick = () => saveScores(match.id);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('btn-delete-match').onclick = () => deleteMatch(match.id);
    if (isPlayed) {
        document.getElementById('btn-clear-score').onclick = () => clearScore(match.id);
    }
    document.getElementById('score-modal-overlay').onclick = (e) => {
        if (e.target.id === 'score-modal-overlay') closeModal();
    };
}

function closeModal() {
    document.getElementById('score-modal-container').innerHTML = '';
}

async function saveScores(matchId) {
    const sets = [];
    let p1SetsWon = 0, p2SetsWon = 0;
    
    for (let i = 1; i <= 3; i++) {
        const p1Score = document.getElementById(`p1_set${i}`).value;
        const p2Score = document.getElementById(`p2_set${i}`).value;
        if (p1Score !== '' && p2Score !== '') {
            const p1 = parseInt(p1Score, 10);
            const p2 = parseInt(p2Score, 10);
            sets.push({ p1, p2 });
            if (p1 > p2) p1SetsWon++;
            if (p2 > p1) p2SetsWon++;
        }
    }
    
    const p1_id = document.getElementById('player1-select-modal').value;
    const p2_id = document.getElementById('player2-select-modal').value;

    if (p1_id === p2_id) {
        alert("Los jugadores no pueden ser los mismos.");
        return;
    }

    let winner_id = null;
    if (sets.length > 0) {
        if (sets.length < 2 || (p1SetsWon < 2 && p2SetsWon < 2)) {
            alert("El resultado no es válido. Un jugador debe ganar al menos 2 sets para definir un ganador.");
            return;
        }
        winner_id = p1SetsWon > p2SetsWon ? p1_id : p2_id;
    }
    
    const { error } = await supabase
        .from('matches')
        .update({ 
            sets: sets.length > 0 ? sets : null, 
            winner_id: winner_id, 
            player1_id: p1_id,
            player2_id: p2_id,
            bonus_loser: (p1SetsWon === 1 && winner_id == p2_id) || (p2SetsWon === 1 && winner_id == p1_id)
        })
        .eq('id', matchId);
    
    if (error) {
        alert("Error al guardar el resultado: " + error.message);
    } else {
        closeModal();
        await loadDashboardData();
    }
}

async function clearScore(matchId) {
    if (confirm("¿Está seguro de que desea limpiar el resultado de este partido?")) {
        const { error } = await supabase
            .from('matches')
            .update({ sets: null, winner_id: null, bonus_loser: false })
            .eq('id', matchId);

        if (error) {
            alert("Error al limpiar el resultado: " + error.message);
        } else {
            closeModal();
            await loadDashboardData();
        }
    }
}

async function deleteMatch(matchId) {
    if (confirm("¿Está seguro de que desea ELIMINAR este partido permanentemente?")) {
        const { error } = await supabase.from('matches').delete().eq('id', matchId);
        if (error) {
            alert("Error al eliminar el partido: " + error.message);
        } else {
            closeModal();
            await loadDashboardData();
        }
    }
}

import { calculatePoints } from './calculatePoints.js';

// --- Event Listeners ---
document.getElementById('matches-container').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-match-id]');
    if (row) {
        const matchId = Number(row.dataset.matchId);
        const matchData = lastMatchesData.find(m => m.id === matchId);
        if (matchData) openScoreModal(matchData);
    }
});