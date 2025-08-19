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

// --- Funciones Auxiliares ---

// <-- CAMBIO AQUÍ: Función añadida para calcular el contraste del texto -->
/**
 * Devuelve un color de texto (blanco o negro) que contraste con el color de fondo.
 * @param {string} hexcolor - El color de fondo en formato hexadecimal (ej: '#RRGGBB').
 * @returns {string} '#ffffff' (blanco) o '#1f2937' (negro).
 */
function getContrastYIQ(hexcolor) {
    if (!hexcolor) return '#1f2937'; // Color de texto por defecto si no hay color de fondo
    let hex = hexcolor.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(x => x + x).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#1f2937' : '#ffffff';
}

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
        // <-- CAMBIO AQUÍ: Se añade `color` a la consulta de la categoría -->
supabase.from('matches').select(`*, category:category_id(id, name, color), player1:player1_id(*, team:team_id(name, image_url, color)), player2:player2_id(*, team:team_id(name, image_url, color)), winner:winner_id(name)`).order('match_date', { ascending: false }),
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
    // Últimos 7 días EXACTAMENTE como el filtro visual (incluye status y rango de fechas)
    const now = new Date();
    const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
    const finDelDia = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const recientes = allMatches.filter(m => {
        if (!m.winner_id) return false;
        // Acepta tanto 'YYYY-MM-DD' como 'DD/MM/YYYY'
        let matchDate;
        if (m.match_date.includes('-')) {
            const [y, mth, d] = m.match_date.split('-');
            matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
        } else if (m.match_date.includes('/')) {
            const [d, mth, y] = m.match_date.split('/');
            matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
        } else {
            return false;
        }
        return matchDate >= sieteDiasAtras && matchDate <= finDelDia;
    }).length;
    const pendientesEl = document.getElementById('count-pendientes');
    const recientesEl = document.getElementById('count-recientes');
    if (pendientesEl) pendientesEl.textContent = pendientes;
    if (recientesEl) recientesEl.textContent = recientes;
}

// Listeners para las tarjetas resumen
document.addEventListener('DOMContentLoaded', () => {
    // Flatpickr para filtro de rango de fechas
    window.filterDateRangeSelected = [];
    function setupFlatpickrRange() {
        if (window.flatpickr) {
                        window.flatpickrInstance = flatpickr('#filter-date-range', {
                                mode: 'range',
                                dateFormat: 'd/m/Y',
                                altInput: true,
                                altFormat: 'd/m',
                                allowInput: true,
                                locale: {
                                    ...flatpickr.l10ns.es,
                                    rangeSeparator: ' a '
                                },
                                onChange: function(selectedDates) {
                                        window.filterDateRangeSelected = selectedDates;
                                        applyFiltersAndSort();
                                }
                        });
        } else {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
            document.head.appendChild(link);
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
            script.onload = setupFlatpickrRange;
            document.body.appendChild(script);
        }
    }
    setupFlatpickrRange();
    // Filtro por rango de fechas (un solo input)
    const filterDateRange = document.getElementById('filter-date-range');
    // Botón limpiar todos los filtros
    const btnClearAllFilters = document.getElementById('btn-clear-all-filters');
    function anyFilterActive() {
        return (
            filterTournamentSelect.value ||
            filterStatusSelect.value ||
            filterSedeSelect.value ||
            filterCanchaSelect.value ||
            searchInput.value ||
            document.getElementById('filter-date-range').value
        );
    }
    function updateClearFiltersBtn() {
        if (btnClearAllFilters) {
            if (anyFilterActive()) {
                btnClearAllFilters.classList.remove('hidden');
            } else {
                btnClearAllFilters.classList.add('hidden');
            }
        }
    }
    if (btnClearAllFilters) {
        btnClearAllFilters.addEventListener('click', () => {
            filterTournamentSelect.value = '';
            filterStatusSelect.value = '';
            filterSedeSelect.value = '';
            filterCanchaSelect.value = '';
            searchInput.value = '';
            if (window.flatpickr && window.flatpickrInstance) {
                window.flatpickrInstance.clear();
            }
            document.getElementById('filter-date-range').value = '';
            window.filterDateRangeSelected = [];
            applyFiltersAndSort();
            updateClearFiltersBtn();
        });
        [filterTournamentSelect, filterStatusSelect, filterSedeSelect, filterCanchaSelect, searchInput, document.getElementById('filter-date-range')].forEach(el => {
            el.addEventListener('input', updateClearFiltersBtn);
        });
        updateClearFiltersBtn();
    }
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
            const now = new Date();
            const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            const pad = n => n.toString().padStart(2, '0');
            const formatDMY = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
            const desdeDMY = formatDMY(sieteDiasAtras);
            const hastaDMY = formatDMY(now);
            if (window.flatpickrInstance) {
                window.flatpickrInstance.setDate([sieteDiasAtras, now], true);
            } else {
                const filterDateRange = document.getElementById('filter-date-range');
                filterDateRange.value = `${desdeDMY} a ${hastaDMY}`;
            }
            window.filterDateRangeSelected = [sieteDiasAtras, now];
            applyFiltersAndSort();
            cardRecientes.classList.add('ring-2', 'ring-green-400');
            cardPendientes.classList.remove('ring-2', 'ring-yellow-400');
        });
    }

});

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
    const filterDateRange = document.getElementById('filter-date-range');
    let fromDate = null, toDate = null;
    if (window.filterDateRangeSelected && Array.isArray(window.filterDateRangeSelected) && window.filterDateRangeSelected.length === 2) {
        fromDate = window.filterDateRangeSelected[0];
        toDate = window.filterDateRangeSelected[1];
    } else if (filterDateRange && filterDateRange.value) {
        const parts = filterDateRange.value.split(' a ');
        if (parts.length === 2) {
            const [from, to] = parts;
            const [d1, m1, y1] = from.split('/');
            const [d2, m2, y2] = to.split('/');
            fromDate = new Date(Number(y1), Number(m1) - 1, Number(d1));
            toDate = new Date(Number(y2), Number(m2) - 1, Number(d2));
        }
    }
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
    if (fromDate || toDate) {
        processedMatches = processedMatches.filter(m => {
            if (!m.match_date) return false;
            let matchDate;
            if (m.match_date.includes('-')) {
                const [y, mth, d] = m.match_date.split('-');
                matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
            } else if (m.match_date.includes('/')) {
                const [d, mth, y] = m.match_date.split('/');
                matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
            } else {
                return false;
            }
            if (fromDate && matchDate < fromDate) return false;
            if (toDate && matchDate > toDate) return false;
            return true;
        });
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
        <table class="min-w-full table-fixed">
            <colgroup>
                <col style="width: 48px;">
                <col style="width: 120px;">
                <col style="width: 140px;">
                <col style="width: 180px;">
                <col style="width: 48px;">
                <col style="width: 120px;">
                <col style="width: 48px;">
                <col style="width: 180px;">
                <col style="width: 80px;">
                <col style="width: 90px;">
            </colgroup>
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
                    const result_string = match.status === 'suspendido' ? 'SUSPENDIDO' : (sets.length > 0 ? sets.map(s => `${s.p1}/${s.p2}`).join(' ') : '-');
                    const time_string = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                    const { p1_points, p2_points } = calculatePoints(match);
                    
                    return `
                    <tr class="clickable-row ${selectedMatches.has(match.id) ? 'bg-yellow-50' : 'bg-white'} hover:bg-gray-100 ${match.status === 'suspendido' ? '!bg-red-50' : ''}" data-match-id="${match.id}">
                        <td class="p-4"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''}></td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${(() => {
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
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full align-middle font-extrabold text-xs"
                                style="background:transparent; color:${match.category.color || '#e5e7eb'};">
                                ${match.category.name}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <button class="p-1 hover:bg-gray-100 rounded transition" data-action="edit" title="Editar / Cargar Resultado">
                                <span class="material-icons text-blue-600" style="font-size: 22px;">edit</span>
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
// (El resto de las funciones como openScoreModal, closeModal, saveMatch, etc. no necesitan cambios)

// --- Mantenemos el resto del archivo sin cambios ---
// ... (openScoreModal, closeModal, saveMatch, handleCreateMatchSubmit, clearScore, deleteMatch, suspendMatch)
// ... (updateBulkActionBar, handleBulkDelete, handleBulkProgram, handleBulkReport, etc.)
// ... (Todos los Event Listeners)

// --- COPIA Y PEGA DESDE AQUÍ HACIA ABAJO EN TU ARCHIVO ---

function openScoreModal(match) {
    const sets = match.sets || [];
    const isPlayed = !!match.winner_id;
    let playersInTournament = [];
    if (tournamentPlayersMap.has(match.tournament_id)) {
        const playerIds = tournamentPlayersMap.get(match.tournament_id);
        playersInTournament = allPlayers.filter(p => playerIds.has(p.id));
    } else {
        playersInTournament = allPlayers.filter(p => p.category_id === match.category_id);
    }

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
                                ${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Jugador B</label>
                            <select id="player2-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>
                                ${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}
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
    
    const match_date = document.getElementById('match-date-modal').value;
    const match_time = document.getElementById('match-time-modal').value;
    const sede = document.getElementById('match-sede-modal').value;
    const cancha = document.getElementById('match-cancha-modal').value;
    let location = '';
    if (sede && cancha) location = `${sede} - ${cancha}`;
    else if (sede) location = sede;
    else if (cancha) location = cancha;

    let formattedDate = match_date;
    if (match_date) {
        let parts;
        if (match_date.includes('-')) {
            parts = match_date.split('-');
            formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (match_date.includes('/')) {
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

    let rawDate = matchDateForm.value;
    let formattedDate = rawDate;
    if (rawDate) {
        let dateObj;
        if (rawDate.includes('-')) {
            const parts = rawDate.split('-');
            dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else if (rawDate.includes('/')) {
            const parts = rawDate.split('/');
            dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
        if (dateObj) {
            dateObj.setDate(dateObj.getDate() + 1);
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
        if (error.message && error.message.includes('duplicate key value') && error.message.includes('nombre de programa ya existente')) {
            alert('Ese nombre de programa ya existe, prueba con uno nuevo.');
        } else {
            alert(`Error al crear el partido: ${error.message}`);
        }
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
    const reportMatches = Array.from(selectedMatches).map(id => {
        const match = allMatches.find(m => m.id === id);
        if (!match) return null;
        const { p1_points, p2_points } = calculatePoints(match);
        return {
            date: match.match_date ? match.match_date.split('T')[0] : '',
            time: match.match_time || '',
            location: match.location || '',
            category: match.category?.name || '',
            category_color: match.category?.color || '#e5e7eb',
            player1: {
                name: match.player1?.name || '',
                points: p1_points ?? '',
                isWinner: match.winner_id === match.player1_id,
        image: match.player1?.team?.image_url || '',
        teamColor: match.player1?.team?.color // <-- AÑADE ESTA LÍNEA

            },
            player2: {
                name: match.player2?.name || '',
                points: p2_points ?? '',
                isWinner: match.winner_id === match.player2_id,
        image: match.player2?.team?.image_url || '',
        teamColor: match.player2?.team?.color // <-- AÑADE ESTA LÍNEA
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

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
    if (formContainer) formContainer.classList.add('hidden');
    const massLoaderContainer = document.getElementById('mass-match-loader-container');
    if (massLoaderContainer) massLoaderContainer.classList.add('hidden');
});

import { setupMassMatchLoader } from './mass-match-loader.js';

let showFormOpen = false;
btnShowForm.addEventListener('click', () => {
    if (formContainer) formContainer.classList.add('hidden');
    const massLoaderContainer = document.getElementById('mass-match-loader-container');
    if (!showFormOpen) {
        if (massLoaderContainer) {
            massLoaderContainer.classList.remove('hidden');
            let btnAddRow = document.getElementById('btn-add-mass-row');
            let btnSave = document.getElementById('btn-save-mass-matches');
            if (!btnAddRow) {
                btnAddRow = document.createElement('button');
                btnAddRow.id = 'btn-add-mass-row';
                btnAddRow.className = 'btn btn-secondary';
                btnAddRow.textContent = 'Agregar Fila';
                massLoaderContainer.prepend(btnAddRow);
            }
            if (!btnSave) {
                btnSave = document.createElement('button');
                btnSave.id = 'btn-save-mass-matches';
                btnSave.className = 'btn btn-primary';
                btnSave.textContent = 'Guardar Partidos';
                massLoaderContainer.prepend(btnSave);
            }
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
        if (massLoaderContainer) massLoaderContainer.classList.add('hidden');
        btnShowForm.innerHTML = '✚ Crear Partido';
        showFormOpen = false;
    }
});

[filterTournamentSelect, filterStatusSelect, filterSedeSelect, filterCanchaSelect, searchInput].forEach(el => {
    if(el) el.addEventListener('input', applyFiltersAndSort);
});

matchesContainer.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-match-id]');
    if (!row) return;

    const matchId = Number(row.dataset.matchId);
    
    if (e.target.closest('button[data-action="edit"]')) {
        const matchData = allMatches.find(m => m.id === matchId);
        if (matchData) openScoreModal(matchData);
        return;
    }
    
    const checkbox = e.target.closest('.match-checkbox');
    if (checkbox) {
        e.stopPropagation();
        checkbox.checked ? selectedMatches.add(matchId) : selectedMatches.delete(matchId);
        row.classList.toggle('bg-yellow-50', checkbox.checked);
        updateBulkActionBar();
        return;
    }
    
    if (!e.target.closest('button[data-action="edit"]') && !e.target.closest('.match-checkbox')) {
        const checkboxInRow = row.querySelector('.match-checkbox');
        checkboxInRow.checked = !checkboxInRow.checked;
        checkboxInRow.checked ? selectedMatches.add(matchId) : selectedMatches.delete(matchId);
        row.classList.toggle('bg-yellow-50', checkboxInRow.checked);
        updateBulkActionBar();
    }

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
        selectedMatches.clear();
        visibleRows.forEach(r => {
            const cb = r.querySelector('.match-checkbox');
            cb.checked = isChecked;
            const id = Number(cb.dataset.id);
            if (isChecked) {
                selectedMatches.add(id);
                r.classList.add('bg-yellow-50');
            } else {
                r.classList.remove('bg-yellow-50');
            }
        });
        updateBulkActionBar();
    }
});

document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
document.getElementById('bulk-report').addEventListener('click', handleBulkReport);
document.getElementById('btn-import-excel').addEventListener('click', () => {
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
    document.querySelectorAll('.match-checkbox').forEach(cb => {
        cb.checked = false;
        const row = cb.closest('tr[data-match-id]');
        if (row) row.classList.remove('bg-yellow-50');
    });
    updateBulkActionBar();
});