import { handleExcelMatchFormSubmit } from './create-match.js';
import { calculatePoints } from './calculatePoints.js';

import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { importMatchesFromFile } from '../common/excel-importer.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const formContainer = document.getElementById('form-container');
const btnShowForm = document.getElementById('btn-show-form');
// const btnCancelForm = document.getElementById('btn-cancel-form'); // Ya no se usa
const matchesContainer = document.getElementById('matches-container');
const filterTournamentSelect = document.getElementById('filter-tournament');
const filterStatusSelect = document.getElementById('filter-status');
const filterSedeSelect = document.getElementById('filter-sede');
const filterCanchaSelect = document.getElementById('filter-cancha');
const searchInput = document.getElementById('search-player');
const bulkActionBar = document.getElementById('bulk-action-bar');
const selectedCountSpan = document.getElementById('selected-count');
const modalContainer = document.getElementById('score-modal-container');


// --- Estado Global ---
let allMatches = [];
let allPlayers = [];
let allTournaments = [];
let tournamentPlayersMap = new Map();
let selectedMatches = new Set();
let clickTimer = null;

// --- Función Auxiliar ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Carga de Datos ---
async function loadInitialData() {
    matchesContainer.innerHTML = '<p class="text-center p-8">Cargando datos...</p>';
    const [
        { data: playersData },
        { data: tournamentsData },
        { data: matchesData },
        { data: tournamentPlayersData }
    ] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('tournaments').select('*, category:category_id(id, name)').order('name'),
        supabase.from('matches').select(`*, category:category_id(id, name), player1:player1_id(*, team:team_id(image_url)), player2:player2_id(*, team:team_id(image_url)), winner:winner_id(name)`).order('match_date', { ascending: false }),
        supabase.from('tournament_players').select('tournament_id, player_id')
    ]);

    allPlayers = playersData || [];
    allTournaments = tournamentsData || [];
    allMatches = matchesData || [];
    
    tournamentPlayersMap.clear();
    if (tournamentPlayersData) {
        tournamentPlayersData.forEach(link => {
            if (!tournamentPlayersMap.has(link.tournament_id)) {
                tournamentPlayersMap.set(link.tournament_id, new Set());
            }
            tournamentPlayersMap.get(link.tournament_id).add(link.player_id);
        });
    }

    updateSummaryCards();
    populateFilterSelects();
    applyFiltersAndSort();
}

// Actualiza los contadores de las tarjetas resumen
function updateSummaryCards() {
    const pendientes = allMatches.filter(m => !m.winner_id && m.status !== 'suspendido').length;
    // Últimos 7 días
    const now = new Date();
    const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    // Solo partidos jugados (completados) en los últimos 7 días
    const recientes = allMatches.filter(m => {
        if (!m.winner_id) return false;
        const matchDate = new Date(m.match_date);
        return matchDate >= sieteDiasAtras && matchDate <= now;
    }).length;
    const pendientesEl = document.getElementById('count-pendientes');
    const recientesEl = document.getElementById('count-recientes');
    if (pendientesEl) pendientesEl.textContent = pendientes;
    if (recientesEl) recientesEl.textContent = recientes;
}

// Listeners para las tarjetas resumen
document.addEventListener('DOMContentLoaded', () => {
    const cardPendientes = document.getElementById('card-pendientes');
    const cardRecientes = document.getElementById('card-recientes');
    if (cardPendientes) {
        cardPendientes.addEventListener('click', () => {
            filterStatusSelect.value = 'pendiente';
            applyFiltersAndSort();
            cardPendientes.classList.add('ring-2', 'ring-yellow-400');
            cardRecientes.classList.remove('ring-2', 'ring-green-400');
        });
    }
    if (cardRecientes) {
        cardRecientes.addEventListener('click', () => {
            filterStatusSelect.value = 'completado';
            // Filtro adicional: solo últimos 7 días
            const now = new Date();
            const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            // Guardar referencia original
            const originalApplyFiltersAndSort = applyFiltersAndSort;
            // Parche temporal para filtrar solo últimos 7 días
            window.applyFiltersAndSort = function() {
                let processedMatches = [...allMatches];
                const tournamentFilter = filterTournamentSelect.value;
                const statusFilter = filterStatusSelect.value;
                const sedeFilter = filterSedeSelect.value;
                const canchaFilter = filterCanchaSelect.value;
                const searchTerm = normalizeText(searchInput.value.toLowerCase());
                if (searchTerm) {
                    processedMatches = processedMatches.filter(m => 
                        (m.player1 && normalizeText(m.player1.name.toLowerCase()).includes(searchTerm)) || 
                        (m.player2 && normalizeText(m.player2.name.toLowerCase()).includes(searchTerm))
                    );
                }
                if (tournamentFilter) {
                    processedMatches = processedMatches.filter(m => m.tournament_id == tournamentFilter);
                }
                if (sedeFilter) {
                    processedMatches = processedMatches.filter(m => m.location && m.location.startsWith(sedeFilter));
                }
                if (canchaFilter) {
                    processedMatches = processedMatches.filter(m => m.location && m.location.endsWith(canchaFilter));
                }
                if (statusFilter === 'completado') {
                    processedMatches = processedMatches.filter(m => !!m.winner_id && new Date(m.match_date) >= sieteDiasAtras && new Date(m.match_date) <= now);
                } else if (statusFilter === 'pendiente') {
                    processedMatches = processedMatches.filter(m => !m.winner_id && m.status !== 'suspendido');
                } else if (statusFilter === 'suspendido') {
                    processedMatches = processedMatches.filter(m => m.status === 'suspendido');
                }
                renderMatches(processedMatches);
                updateBulkActionBar();
            };
            applyFiltersAndSort();
            cardRecientes.classList.add('ring-2', 'ring-green-400');
            cardPendientes.classList.remove('ring-2', 'ring-yellow-400');
        });
    }

    // Selección instantánea en selects del formulario de partido
});

// Selección instantánea en selects del formulario de partido (fuera del if principal)
document.addEventListener('DOMContentLoaded', () => {
    const player1SelectForm = document.getElementById('player1-select-form');
    const player2SelectForm = document.getElementById('player2-select-form');
    if (player1SelectForm) {
        player1SelectForm.addEventListener('mousedown', (e) => {
            setTimeout(() => {
                player1SelectForm.dispatchEvent(new Event('change', { bubbles: true }));
            }, 0);
        });
    }
    if (player2SelectForm) {
        player2SelectForm.addEventListener('mousedown', (e) => {
            setTimeout(() => {
                player2SelectForm.dispatchEvent(new Event('change', { bubbles: true }));
            }, 0);
        });
    }
});

// Función populateFormSelects eliminada: ya no se usa formulario antiguo

function populateFilterSelects() {
    filterTournamentSelect.innerHTML = '<option value="">Todos los Torneos</option>';
    allTournaments.forEach(t => filterTournamentSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
}

function updatePlayerSelectsInForm() {
    const tournamentId = tournamentSelectForm.value;
    const selectedPlayer1Id = player1SelectForm.value;
    const tournament = allTournaments.find(t => t.id == tournamentId);

    if (tournament) {
        categoryDisplay.textContent = tournament.category.name;
        const playerIds = tournamentPlayersMap.get(Number(tournamentId)) || new Set();
        const playersInTournament = allPlayers.filter(p => playerIds.has(p.id));

        // Guardar selección previa
        const prevPlayer1 = player1SelectForm.value;
        const prevPlayer2 = player2SelectForm.value;

        player1SelectForm.innerHTML = '<option value="">Seleccione Jugador 1</option>';
        playersInTournament.forEach(p => {
            player1SelectForm.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
        player1SelectForm.value = prevPlayer1;

        player2SelectForm.innerHTML = '<option value="">Seleccione Jugador 2</option>';
        playersInTournament.filter(p => p.id != player1SelectForm.value).forEach(p => {
            player2SelectForm.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
        player2SelectForm.value = prevPlayer2;
    } else {
        categoryDisplay.textContent = 'Seleccione un torneo...';
        player1SelectForm.innerHTML = '<option value="">Seleccione un torneo primero</option>';
        player2SelectForm.innerHTML = '<option value="">Seleccione un torneo primero</option>';
    }
}

// --- Renderizado, Filtros y Ordenamiento ---
function applyFiltersAndSort() {
    let processedMatches = [...allMatches];
    const tournamentFilter = filterTournamentSelect.value;
    const statusFilter = filterStatusSelect.value;
    const sedeFilter = filterSedeSelect.value;
    const canchaFilter = filterCanchaSelect.value;
    const searchTerm = normalizeText(searchInput.value.toLowerCase());

    if (searchTerm) {
        processedMatches = processedMatches.filter(m => 
            (m.player1 && normalizeText(m.player1.name.toLowerCase()).includes(searchTerm)) || 
            (m.player2 && normalizeText(m.player2.name.toLowerCase()).includes(searchTerm))
        );
    }
    if (tournamentFilter) {
        processedMatches = processedMatches.filter(m => m.tournament_id == tournamentFilter);
    }
    if (sedeFilter) {
        processedMatches = processedMatches.filter(m => m.location && m.location.startsWith(sedeFilter));
    }
    if (canchaFilter) {
        processedMatches = processedMatches.filter(m => m.location && m.location.endsWith(canchaFilter));
    }
    if (statusFilter) {
        if (statusFilter === 'pendiente') processedMatches = processedMatches.filter(m => !m.winner_id && m.status !== 'suspendido');
        else if (statusFilter === 'completado') processedMatches = processedMatches.filter(m => !!m.winner_id);
        else if (statusFilter === 'suspendido') processedMatches = processedMatches.filter(m => m.status === 'suspendido');
    }
    
    renderMatches(processedMatches);
    updateBulkActionBar();
}

function renderMatches(matchesToRender) {
    if (matchesToRender.length === 0) {
        matchesContainer.innerHTML = '<p class="text-center text-gray-500 py-8">No hay partidos que coincidan con los filtros.</p>';
        return;
    }

    matchesContainer.innerHTML = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="p-4 text-left"><input type="checkbox" id="select-all-matches"></th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Fecha y Hora</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cancha</th>
                    <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Jugador A</th>
                    <th class="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">PTS</th>
                    <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Resultado</th>
                    <th class="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">PTS</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador B</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                    <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                ${matchesToRender.map(match => {
                    const p1_winner = match.winner_id === match.player1_id;
                    const p2_winner = match.winner_id === match.player2_id;
                    const no_winner = !match.winner_id;
                    const p1_class = no_winner ? 'text-gray-800' : p1_winner ? 'text-yellow-600 font-bold' : 'text-gray-500';
                    const p2_class = no_winner ? 'text-gray-800' : p2_winner ? 'text-yellow-600 font-bold' : 'text-gray-500';
                    const sets = match.sets || [];
                    const result_string = match.status === 'suspendido' ? 'SUSPENDIDO' : (sets.length > 0 ? sets.map(s => `${s.p1}-${s.p2}`).join(', ') : '-');
                    const time_string = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                    // Calcular puntos usando la misma lógica que dashboard.js
                    const { p1_points, p2_points } = calculatePoints(match);
                    return `
                    <tr class="clickable-row ${selectedMatches.has(match.id) ? 'bg-yellow-50' : 'bg-white'} hover:bg-gray-100 ${match.status === 'suspendido' ? '!bg-red-50' : ''}" data-match-id="${match.id}">
                        <td class="p-4"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''}></td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${(() => {
                                // Parsear como fecha local (no UTC)
                                if (!match.match_date) return '';
                                const parts = match.match_date.split('-');
                                if (parts.length === 3) {
                                    const yyyy = Number(parts[0]);
                                    const mm = Number(parts[1]) - 1;
                                    const dd = Number(parts[2]);
                                    const localDate = new Date(yyyy, mm, dd);
                                    return localDate.toLocaleDateString('es-AR');
                                }
                                return match.match_date;
                            })()}
                            <span class="block text-xs text-gray-400">${time_string} hs</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${match.location || 'A definir'}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-right ${p1_class}">
                            <div class="flex items-center justify-end gap-2">
                                <span>${match.player1.name}</span>
                                <img src="${match.player1.team?.image_url || 'https://via.placeholder.com/24'}" class="h-6 w-6 rounded-full object-cover">
                            </div>
                        </td>
                        <td class="px-2 py-3 whitespace-nowrap text-center text-base font-bold">${p1_points}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-center font-mono font-semibold">${result_string}</td>
                        <td class="px-2 py-3 whitespace-nowrap text-center text-base font-bold">${p2_points}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm ${p2_class}">
                            <div class="flex items-center gap-2">
                                <img src="${match.player2.team?.image_url || 'https://via.placeholder.com/24'}" class="h-6 w-6 rounded-full object-cover">
                                <span>${match.player2.name}</span>
                            </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${match.category.name}</td>
                        <td class="px-4 py-3 text-center">
                            <button class="text-white bg-blue-600 hover:bg-blue-700 border border-blue-700 rounded-full px-2 py-1 transition-colors duration-150 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center justify-center" data-action="edit" style="min-width: 32px; min-height: 32px; width: 32px; height: 32px;">
                                <span class="material-icons" style="font-size: 18px;">edit</span>
                            </button>
                        </td>
                    </tr>
                    `
                }).join('')}
            </tbody>
        </table>
    `;
}

// --- Lógica de Modales ---
function openScoreModal(match) {
    const sets = match.sets || [];
    const isPlayed = !!match.winner_id;
    const playersInCategory = allPlayers.filter(p => p.category_id === match.category_id);

    modalContainer.innerHTML = `
        <div id="modal-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div id="modal-content" class="bg-white rounded-xl shadow-lg w-full max-w-lg">
                <div class="p-6 border-b">
                    <h3 class="text-xl font-bold">Editar Partido / Resultado</h3>
                </div>
                <form id="modal-form" class="p-6 space-y-4">
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
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Fecha</label>
                            <input type="text" id="match-date-modal" class="input-field mt-1" value="${match.match_date || ''}" autocomplete="off">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Hora</label>
                            <input type="time" id="match-time-modal" class="input-field mt-1" value="${match.match_time || ''}">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Sede</label>
                            <select id="match-sede-modal" class="input-field mt-1">
                                <option value="Funes" ${(match.location && match.location.split(' - ')[0] === 'Funes') ? 'selected' : ''}>Funes</option>
                                <option value="Centro" ${(match.location && match.location.split(' - ')[0] === 'Centro') ? 'selected' : ''}>Centro</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Cancha</label>
                            <select id="match-cancha-modal" class="input-field mt-1">
                                ${[1,2,3,4,5,6].map(n => {
                                    const cancha = `Cancha ${n}`;
                                    const selected = (match.location && match.location.split(' - ')[1] === cancha) ? 'selected' : '';
                                    return `<option value="${cancha}" ${selected}>${cancha}</option>`;
                                }).join('')}
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
                        <button id="btn-delete-match" class="btn btn-secondary !p-2" title="Eliminar Partido"><span class="material-icons !text-red-600">delete_forever</span></button>
                        ${isPlayed ? `<button id="btn-clear-score" class="btn btn-secondary !p-2" title="Limpiar Resultado"><span class="material-icons !text-yellow-600">cleaning_services</span></button>` : ''}
                        <button id="btn-suspend-match" class="btn btn-secondary !p-2" title="Marcar como Suspendido"><span class="material-icons !text-red-500">cancel</span></button>
                    </div>
                    <div class="flex gap-4">
                        <button id="btn-cancel-modal" class="btn btn-secondary">Cancelar</button>
                        <button id="btn-save-score" class="btn btn-primary">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Cargar flatpickr dinámicamente si no está presente
    if (!window.flatpickr) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
        script.onload = () => {
            flatpickr('#match-date-modal', {dateFormat: 'Y-m-d', allowInput: true});
        };
        document.body.appendChild(script);
    } else {
        flatpickr('#match-date-modal', {dateFormat: 'Y-m-d', allowInput: true});
    }

    document.getElementById('btn-save-score').onclick = () => saveMatch(match.id);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('btn-delete-match').onclick = () => deleteMatch(match.id);
    document.getElementById('btn-suspend-match').onclick = () => suspendMatch(match.id);
    if (isPlayed) {
        document.getElementById('btn-clear-score').onclick = () => clearScore(match.id);
    }
    document.getElementById('modal-overlay').onclick = (e) => {
        if (e.target.id === 'modal-overlay') closeModal();
    };
}

function closeModal() {
    modalContainer.innerHTML = '';
}

async function saveMatch(matchId) {
    const sets = [];
    let p1SetsWon = 0, p2SetsWon = 0;
    
    for (let i = 1; i <= 3; i++) {
        const p1Score = document.getElementById(`p1_set${i}`)?.value;
        const p2Score = document.getElementById(`p2_set${i}`)?.value;
        if (p1Score && p2Score && p1Score !== '' && p2Score !== '') {
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
    
    // Obtener los valores de los campos nuevos
    const match_date = document.getElementById('match-date-modal').value;
    const match_time = document.getElementById('match-time-modal').value;
    const sede = document.getElementById('match-sede-modal').value;
    const cancha = document.getElementById('match-cancha-modal').value;
    let location = '';
    if (sede && cancha) location = `${sede} - ${cancha}`;
    else if (sede) location = sede;
    else if (cancha) location = cancha;

    // Parse and format date as YYYY-MM-DD to avoid timezone issues
    let formattedDate = match_date;
    if (match_date) {
        // Handles both 'Y-m-d' and 'd/m/Y' formats
        let parts;
        if (match_date.includes('-')) {
            // 'Y-m-d'
            parts = match_date.split('-');
            formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (match_date.includes('/')) {
            // 'd/m/Y'
            parts = match_date.split('/');
            formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }

    let matchData = {
        player1_id: p1_id,
        player2_id: p2_id,
        sets: sets.length > 0 ? sets : null,
        winner_id: winner_id,
        status: 'programado',
        match_date: formattedDate,
        match_time,
        location
    };

    const { error } = await supabase.from('matches').update(matchData).eq('id', matchId);

    if (error) {
        alert("Error al guardar el partido: " + error.message);
    } else {
        closeModal();
        await loadInitialData();
    }
}

async function handleCreateMatchSubmit(e) {
    e.preventDefault();
    const tournamentId = tournamentSelectForm.value;
    const tournament = allTournaments.find(t => t.id == tournamentId);
    if (!tournament) {
        alert("Por favor, seleccione un torneo válido.");
        return;
    }


    // Formatear la fecha como YYYY-MM-DD para evitar desfase por zona horaria
    let rawDate = matchDateForm.value;
    let formattedDate = rawDate;
    if (rawDate) {
        let dateObj;
        if (rawDate.includes('-')) {
            // 'Y-m-d'
            const parts = rawDate.split('-');
            dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else if (rawDate.includes('/')) {
            // 'd/m/Y'
            const parts = rawDate.split('/');
            dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
        if (dateObj) {
            dateObj.setDate(dateObj.getDate() + 1); // Sumar un día
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            formattedDate = `${yyyy}-${mm}-${dd}`;
        }
    }

    const matchData = {
        tournament_id: tournamentId,
        category_id: tournament.category.id,
        player1_id: player1SelectForm.value,
        player2_id: player2SelectForm.value,
        match_date: formattedDate,
        match_time: matchTimeForm.value || null,
        location: `${sedeSelectForm.value} - ${canchaSelectForm.value}`
    };

    if (!matchData.player1_id || !matchData.player2_id || !matchData.match_date || !matchData.tournament_id) {
        alert("Por favor, complete todos los campos obligatorios.");
        return;
    }

    if (matchData.player1_id === matchData.player2_id) {
        alert("Un jugador no puede enfrentarse a sí mismo.");
        return;
    }
    const { error } = await supabase.from('matches').insert([matchData]);
    if (error) {
        alert(`Error al crear el partido: ${error.message}`);
    } else {
        player1SelectForm.value = "";
        player2SelectForm.value = "";
        await loadInitialData();
    }
}

async function clearScore(matchId) {
    if (confirm("¿Está seguro de que desea limpiar el resultado de este partido?")) {
        const { error } = await supabase.from('matches').update({ sets: null, winner_id: null, bonus_loser: false, status: 'programado' }).eq('id', matchId);
        if (error) { alert("Error: " + error.message); } 
        else { closeModal(); await loadInitialData(); }
    }
}

async function deleteMatch(matchId) {
    if (confirm("¿Está seguro de que desea ELIMINAR este partido permanentemente?")) {
        const { error } = await supabase.from('matches').delete().eq('id', matchId);
        if (error) { alert("Error: " + error.message); } 
        else { closeModal(); await loadInitialData(); }
    }
}

async function suspendMatch(matchId) {
    if (confirm("¿Marcar este partido como suspendido?")) {
        const { error } = await supabase.from('matches').update({ status: 'suspendido', sets: null, winner_id: null }).eq('id', matchId);
        if (error) { alert("Error: " + error.message); } 
        else { closeModal(); await loadInitialData(); }
    }
}

// --- Lógica de Acciones Masivas ---
function updateBulkActionBar() {
    selectedCountSpan.textContent = selectedMatches.size;
    if (selectedMatches.size > 0) {
        bulkActionBar.classList.remove('translate-y-24', 'opacity-0');
    } else {
        bulkActionBar.classList.add('translate-y-24', 'opacity-0');
    }
}

async function handleBulkDelete() {
    if (selectedMatches.size === 0) return;
    if (confirm(`¿Está seguro de que desea eliminar ${selectedMatches.size} partidos seleccionados?`)) {
        const { error } = await supabase.from('matches').delete().in('id', Array.from(selectedMatches));
        if (error) {
            alert("Error al eliminar los partidos: " + error.message);
        } else {
            selectedMatches.clear();
            await loadInitialData();
        }
    }
}

async function handleBulkProgram() {
    if (selectedMatches.size === 0) return;
    const programName = prompt("Ingrese un nombre para el nuevo programa:", "Programa de Partidos");
    if (!programName || programName.trim() === '') return;
    const slug = programName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const match_ids = Array.from(selectedMatches);
    const { error } = await supabase.from('programs').insert([{ title: programName, slug: slug, match_ids: match_ids }]);
    if (error) {
        alert("Error al crear el programa: " + error.message);
    } else {
        alert(`Programa "${programName}" creado con éxito.`);
        window.location.href = `programs.html`;
    }
}

function handleBulkReport() {
    if (selectedMatches.size === 0) {
        alert("No hay partidos seleccionados para el reporte.");
        return;
    }
    // Obtener los datos de los partidos seleccionados en el formato esperado por reportes.js
    const reportMatches = Array.from(selectedMatches).map(id => {
        const match = allMatches.find(m => m.id === id);
        if (!match) return null;
        const { p1_points, p2_points } = calculatePoints(match);
        return {
            date: match.match_date ? match.match_date.split('T')[0] : '',
            time: match.match_time || '',
            location: match.location || '',
            category: match.category?.name || '',
            player1: {
                name: match.player1?.name || '',
                points: p1_points ?? '',
                isWinner: match.winner_id === match.player1_id,
                image: match.player1?.team?.image_url || ''
            },
            player2: {
                name: match.player2?.name || '',
                points: p2_points ?? '',
                isWinner: match.winner_id === match.player2_id,
                image: match.player2?.team?.image_url || ''
            },
            sets: (match.sets && match.sets.length > 0) ? match.sets.map(s => `${s.p1}-${s.p2}`).join(', ') : ''
        };
    }).filter(Boolean);
    localStorage.setItem('reportMatches', JSON.stringify(reportMatches));
    window.location.href = 'reportes.html';
}

function handleImportExcel() {
    alert("Función para importar partidos desde Excel en desarrollo.");
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
    // Oculta el formulario Excel-like al cargar
    if (formContainer) formContainer.classList.add('hidden');
    // Oculta el loader masivo al cargar (si existe)
    const massLoaderContainer = document.getElementById('mass-match-loader-container');
    if (massLoaderContainer) massLoaderContainer.classList.add('hidden');
});



function renderExcelLikeMatchForm() {
    if (!formContainer) return;
    // Opciones
    const torneoOptions = `<option value="">Seleccionar torneo</option>` + allTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    // Helper para opciones de jugador según torneo
    function getJugadoresOptions(torneoId) {
        let options = '<option value="">Seleccionar jugador</option>';
        if (!torneoId) return options;
        const playerIds = tournamentPlayersMap.get(Number(torneoId)) || new Set();
        const jugadores = allPlayers.filter(p => playerIds.has(p.id));
        jugadores.forEach(p => {
            options += `<option value="${p.id}">${p.name}</option>`;
        });
        return options;
    }
    const jugadoresOptions = '<option value="">Seleccionar jugador</option>';
    const sedeOptions = ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
    const canchaOptions = [1,2,3,4,5,6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');
    formContainer.innerHTML = `
        <form id="excel-match-form" class="bg-[#f8f9fa] border border-[#e3e6ec] rounded-xl shadow p-4 flex flex-col gap-4 max-w-full">
            <h2 class="text-xl font-bold mb-2">Revisa los Partidos Encontrados</h2>
            <div class="flex flex-row items-center gap-4 w-full border rounded bg-white p-4">
                <div class="flex flex-col w-1/6 min-w-[150px]">
                    <span class="text-xs font-semibold mb-1">TORNEO</span>
                    <select id="torneo-select" class="input-field w-full">${torneoOptions}</select>
                </div>
                <div class="flex flex-col w-1/6 min-w-[150px]">
                    <span class="text-xs font-semibold mb-1">JUGADOR 1</span>
                    <select id="jugador1-select" class="input-field w-full">${jugadoresOptions}</select>
                </div>
                <div class="flex flex-col w-1/6 min-w-[150px]">
                    <span class="text-xs font-semibold mb-1">JUGADOR 2</span>
                    <select id="jugador2-select" class="input-field w-full">${jugadoresOptions}</select>
                </div>
                <div class="flex flex-col w-1/7 min-w-[120px]">
                    <span class="text-xs font-semibold mb-1">FECHA</span>
                    <div class="relative flex items-center">
                        <input id="fecha-input" type="text" class="input-field w-full pr-8" autocomplete="off" />
                        <span class="material-icons absolute right-2 text-gray-400 cursor-pointer" id="fecha-calendar-icon" style="font-size:20px;">calendar_today</span>
                    </div>
                </div>
                <div class="flex flex-col w-1/8 min-w-[100px]">
                    <span class="text-xs font-semibold mb-1">HORA</span>
                    <input id="hora-input" type="time" class="input-field w-full" />
                </div>
                <div class="flex flex-col w-1/8 min-w-[100px]">
                    <span class="text-xs font-semibold mb-1">SEDE</span>
                    <select id="sede-select" class="input-field w-full">${sedeOptions}</select>
                </div>
                <div class="flex flex-col w-1/8 min-w-[100px]">
                    <span class="text-xs font-semibold mb-1">CANCHA</span>
                    <select id="cancha-select" class="input-field w-full">${canchaOptions}</select>
                </div>
            </div>
            <div class="flex flex-row gap-4 justify-end mt-2">
                <button type="button" id="btn-cancel-form" class="bg-[#e3e6ec] text-[#4e5d6c] font-semibold rounded px-6 py-2">Cancelar</button>
                <button type="submit" class="bg-[#556b1e] hover:bg-[#405312] text-white font-semibold rounded px-6 py-2 flex items-center gap-2">
                    <span class="material-icons">save</span> Importar 1 Partidos
                </button>
            </div>
        </form>
    `;
    // Flatpickr para fecha y click en icono
    let fechaFlatpickr = null;
    if (window.flatpickr) {
        fechaFlatpickr = flatpickr('#fecha-input', {dateFormat: 'd/m/Y', allowInput: true});
    }
    const calendarIcon = document.getElementById('fecha-calendar-icon');
    const fechaInput = document.getElementById('fecha-input');
    if (calendarIcon && fechaInput && fechaFlatpickr) {
        calendarIcon.addEventListener('click', () => fechaFlatpickr.open());
    }
    // Filtrar jugadores por torneo
    const torneoSelect = document.getElementById('torneo-select');
    const jugador1Select = document.getElementById('jugador1-select');
    const jugador2Select = document.getElementById('jugador2-select');
    function updateJugadores() {
        const torneoId = torneoSelect.value;
        jugador1Select.innerHTML = getJugadoresOptions(torneoId);
        jugador2Select.innerHTML = getJugadoresOptions(torneoId);
    }
    torneoSelect.addEventListener('change', updateJugadores);
    // Inicializar selects de jugadores
    updateJugadores();
    document.getElementById('btn-cancel-form').onclick = () => formContainer.classList.add('hidden');
    document.getElementById('excel-match-form').onsubmit = handleExcelMatchFormSubmit;
}


function renderExcelMatchRows(count) {
    const tbody = document.getElementById('excel-match-tbody');
    if (!tbody) return;
    for (let i = 0; i < count; i++) {
        addExcelMatchRow();
    }
}


function addExcelMatchRow() {
    const tbody = document.getElementById('excel-match-tbody');
    if (!tbody) return;
    const torneoOptions = `<option value="">Seleccionar torneo</option>` + allTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const sedeOptions = ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
    const canchaOptions = [1,2,3,4,5,6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');
    const tr = document.createElement('tr');
    // Estado de la fila
    const state = {
        torneo: '', sede: 'Funes', cancha: 'Cancha 1', dia: '', hora: '', jugador1: '', jugador2: ''
    };
    // Helpers para mostrar nombres
    function getTorneoName(id) {
        if (!id) return '';
        const t = allTournaments.find(t => t.id == id);
        return t ? t.name : '';
    }
    function getJugadorName(id) {
        if (!id) return '';
        const j = allPlayers.find(j => j.id == id);
        return j ? j.name : '';
    }
    // Renderiza la fila en modo texto plano tipo Excel
    function renderRow() {
        tr.innerHTML = '';
        // Torneo
        let tdTorneo = document.createElement('td');
        tdTorneo.className = 'excel-cell';
        tdTorneo.dataset.col = 'torneo';
        tdTorneo.textContent = getTorneoName(state.torneo);
        tdTorneo.ondblclick = function() { editCell(tdTorneo); };
        tr.appendChild(tdTorneo);
        // Sede
        let tdSede = document.createElement('td');
        tdSede.className = 'excel-cell';
        tdSede.dataset.col = 'sede';
        tdSede.textContent = state.sede;
        tdSede.ondblclick = function() { editCell(tdSede); };
        tr.appendChild(tdSede);
        // Cancha
        let tdCancha = document.createElement('td');
        tdCancha.className = 'excel-cell';
        tdCancha.dataset.col = 'cancha';
        tdCancha.textContent = state.cancha;
        tdCancha.ondblclick = function() { editCell(tdCancha); };
        tr.appendChild(tdCancha);
        // Día
        let tdDia = document.createElement('td');
        tdDia.className = 'excel-cell';
        tdDia.dataset.col = 'dia';
        tdDia.textContent = state.dia;
        tdDia.ondblclick = function() { editCell(tdDia); };
        tr.appendChild(tdDia);
        // Hora
        let tdHora = document.createElement('td');
        tdHora.className = 'excel-cell';
        tdHora.dataset.col = 'hora';
        tdHora.textContent = state.hora;
        tdHora.ondblclick = function() { editCell(tdHora); };
        tr.appendChild(tdHora);
        // Jugador 1
        let tdJ1 = document.createElement('td');
        tdJ1.className = 'excel-cell';
        tdJ1.dataset.col = 'jugador1';
        tdJ1.textContent = getJugadorName(state.jugador1);
        tdJ1.ondblclick = function() { editCell(tdJ1); };
        tr.appendChild(tdJ1);
        // Jugador 2
        let tdJ2 = document.createElement('td');
        tdJ2.className = 'excel-cell';
        tdJ2.dataset.col = 'jugador2';
        tdJ2.textContent = getJugadorName(state.jugador2);
        tdJ2.ondblclick = function() { editCell(tdJ2); };
        tr.appendChild(tdJ2);
        // Acciones
        let tdAcc = document.createElement('td');
        tdAcc.className = 'flex gap-1 justify-center';
        let btnDup = document.createElement('button');
        btnDup.type = 'button';
        btnDup.className = 'btn btn-secondary btn-duplicate-row text-xs px-1 py-1';
        btnDup.title = 'Duplicar fila';
        btnDup.textContent = '⧉';
        btnDup.onclick = function(e) {
            const clone = tr.cloneNode(true);
            tbody.insertBefore(clone, tr.nextSibling);
            setTimeout(function() {
                // Reasignar listeners a la nueva fila
                Array.from(clone.querySelectorAll('.excel-cell')).forEach(function(cell) {
                    cell.ondblclick = function() { editCell(cell); };
                });
                clone.querySelector('.btn-remove-row').onclick = function(e) { e.target.closest('tr').remove(); };
                clone.querySelector('.btn-duplicate-row').onclick = btnDup.onclick;
            }, 0);
        };
        let btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-secondary btn-remove-row text-xs px-1 py-1';
        btnDel.title = 'Eliminar fila';
        btnDel.textContent = '✕';
        btnDel.onclick = function(e) { e.target.closest('tr').remove(); };
        tdAcc.appendChild(btnDup);
        tdAcc.appendChild(btnDel);
        tr.appendChild(tdAcc);
    }
    // Editar celda
    function editCell(cell) {
        const col = cell.dataset.col;
        let input;
        if (col === 'torneo') {
            input = document.createElement('select');
            input.innerHTML = torneoOptions;
            input.value = state.torneo;
        } else if (col === 'sede') {
            input = document.createElement('select');
            input.innerHTML = sedeOptions;
            input.value = state.sede;
        } else if (col === 'cancha') {
            input = document.createElement('select');
            input.innerHTML = canchaOptions;
            input.value = state.cancha;
        } else if (col === 'dia') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = state.dia;
            input.placeholder = 'dd/mm/aaaa';
            if (window.flatpickr) flatpickr(input, {dateFormat: 'd/m/Y', allowInput: true});
        } else if (col === 'hora') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = state.hora;
            input.placeholder = 'hh:mm';
            if (window.flatpickr) flatpickr(input, {enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true, allowInput: true});
        } else if (col === 'jugador1' || col === 'jugador2') {
            input = document.createElement('select');
            input.innerHTML = '<option value="">Seleccione jugador</option>';
            if (state.torneo) {
                const playerIds = tournamentPlayersMap.get(Number(state.torneo)) || new Set();
                const jugadores = allPlayers.filter(function(p) { return playerIds.has(p.id); });
                jugadores.forEach(function(j) {
                    input.innerHTML += `<option value="${j.id}">${j.name}</option>`;
                });
            }
            input.value = state[col];
        }
        input.className = 'input-field w-full text-xs';
        input.onblur = function() {
            state[col] = input.value;
            // Si se cambia el torneo, limpiar jugadores
            if (col === 'torneo') {
                state.jugador1 = '';
                state.jugador2 = '';
            }
            renderRow();
        };
        input.onkeydown = function(e) { if (e.key === 'Enter') { input.blur(); } };
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
    }
    renderRow();
    tbody.appendChild(tr);
}

import { setupMassMatchLoader } from './mass-match-loader.js';

let showFormOpen = false;
btnShowForm.addEventListener('click', () => {
    // Oculta el formulario Excel-like
    if (formContainer) formContainer.classList.add('hidden');
    const massLoaderContainer = document.getElementById('mass-match-loader-container');
    const btnAddRow = document.getElementById('btn-add-mass-row');
    const btnSave = document.getElementById('btn-save-mass-matches');
    if (!showFormOpen) {
        // Abrir modal
        if (massLoaderContainer && btnAddRow && btnSave) {
            massLoaderContainer.classList.remove('hidden');
            setupMassMatchLoader({
                container: massLoaderContainer,
                btnAddRow,
                btnSave,
                allTournaments,
                allPlayers,
                tournamentPlayersMap,
                loadInitialData
            });
        }
        btnShowForm.innerHTML = '✖ Cerrar';
        showFormOpen = true;
    } else {
        // Cerrar modal
        if (massLoaderContainer) massLoaderContainer.classList.add('hidden');
        btnShowForm.innerHTML = '✚ Crear Partido';
        showFormOpen = false;
    }
});
// Listeners del formulario antiguo eliminados

[filterTournamentSelect, filterStatusSelect, filterSedeSelect, filterCanchaSelect, searchInput].forEach(el => {
    if(el) el.addEventListener('input', applyFiltersAndSort);
});

matchesContainer.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-match-id]');
    if (!row) return;

    const matchId = Number(row.dataset.matchId);
    
    // Si se hizo clic en el botón de editar
    if (e.target.closest('button[data-action="edit"]')) {
        const matchData = allMatches.find(m => m.id === matchId);
        if (matchData) openScoreModal(matchData);
        return;
    }
    
    // Si se hizo clic en un checkbox
    const checkbox = e.target.closest('.match-checkbox');
    if (checkbox) {
        e.stopPropagation();
        checkbox.checked ? selectedMatches.add(matchId) : selectedMatches.delete(matchId);
        row.classList.toggle('bg-yellow-50', checkbox.checked);
        updateBulkActionBar();
        return;
    }
    
    // Click en la fila: selección instantánea
    if (!e.target.closest('button[data-action="edit"]') && !e.target.closest('.match-checkbox')) {
        const checkboxInRow = row.querySelector('.match-checkbox');
        checkboxInRow.checked = !checkboxInRow.checked;
        checkboxInRow.checked ? selectedMatches.add(matchId) : selectedMatches.delete(matchId);
        row.classList.toggle('bg-yellow-50', checkboxInRow.checked);
        updateBulkActionBar();
    }

    // Doble click en la fila: abrir modal (restaurar funcionalidad)
    row.addEventListener('dblclick', (ev) => {
        if (ev.target.closest('button[data-action="edit"]') || ev.target.closest('.match-checkbox')) return;
        const matchData = allMatches.find(m => m.id === matchId);
        if (matchData) openScoreModal(matchData);
    });
});

matchesContainer.addEventListener('change', (e) => {
    if (e.target.id === 'select-all-matches') {
        const isChecked = e.target.checked;
        const visibleRows = Array.from(matchesContainer.querySelectorAll('tr[data-match-id]'));
        visibleRows.forEach(r => {
            const cb = r.querySelector('.match-checkbox');
            cb.checked = isChecked;
            const id = Number(cb.dataset.id);
            isChecked ? selectedMatches.add(id) : selectedMatches.delete(id);
            r.classList.toggle('bg-yellow-50', isChecked);
        });
        updateBulkActionBar();
    }
});

// Listeners para la barra de acciones
document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
document.getElementById('bulk-program').addEventListener('click', handleBulkProgram);
document.getElementById('bulk-report').addEventListener('click', handleBulkReport);
document.getElementById('btn-import-excel').addEventListener('click', () => {
    // Obtener todas las categorías únicas de los torneos
    const allCategories = Array.from(new Set(allTournaments.map(t => t.category?.name))).map(name => {
        const t = allTournaments.find(tt => tt.category?.name === name);
        return t ? t.category : null;
    }).filter(Boolean);
    importMatchesFromFile(allPlayers, allTournaments, allCategories).then(success => {
        if (success) loadInitialData();
    });
});
document.getElementById('bulk-deselect').addEventListener('click', () => {
    selectedMatches.clear();
    // Desmarcar todos los checkboxes visibles
    document.querySelectorAll('.match-checkbox').forEach(cb => {
        cb.checked = false;
        const row = cb.closest('tr[data-match-id]');
        if (row) row.classList.remove('bg-yellow-50');
    });
    updateBulkActionBar();
});