import { calculatePoints } from './calculatePoints.js';
import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { importMatchesFromFile } from '../common/excel-importer.js';
import { setupMassMatchLoader } from './mass-match-loader.js';

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
const massLoaderContainer = document.getElementById('mass-match-loader-container');
const filterDateRangeInput = document.getElementById('filter-date-range');
let filterDateRange = [null, null];
let lastDateRangeStr = '';

// Crear botón Limpiar Filtros

// --- Limpiar Filtros ---
// Usar el botón existente en el HTML
const clearFiltersBtn = document.getElementById('btn-clear-all-filters');

function anyFilterActive() {
    return filterTournamentSelect.value || filterStatusSelect.value || filterSedeSelect.value || filterCanchaSelect.value || searchInput.value || (filterDateRange && filterDateRange[0] && filterDateRange[1]) || quickFilterMode;
}


clearFiltersBtn.onclick = function() {
    filterTournamentSelect.value = '';
    filterStatusSelect.value = '';
    filterSedeSelect.value = '';
    filterCanchaSelect.value = '';
    searchInput.value = '';
    filterDateRange = [null, null];
    filterDateRangeInput.value = '';
    filterDateRangeInput.style.color = '';
    lastDateRangeStr = '';
    quickFilterMode = null;
    applyFiltersAndSort();
};

// --- Estado Global ---
let allMatches = [];
let allPlayers = [];
let allTournaments = [];
let tournamentPlayersMap = new Map();
let selectedMatches = new Set();
let isMassLoaderInitialized = false;

// --- Funciones Auxiliares ---
function isColorLight(hex) {
    if (!hex) return false;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substr(0, 2), 16),
          g = parseInt(c.substr(2, 2), 16),
          b = parseInt(c.substr(4, 2), 16);
    return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
}

function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Carga de Datos ---
async function loadInitialData() {
    matchesContainer.innerHTML = '<p class="text-center p-8 text-white">Cargando datos...</p>';
    const [
        { data: playersData },
        { data: tournamentsData },
        { data: matchesData },
        { data: tournamentPlayersData }
    ] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('tournaments').select('*, category:category_id(id, name)').order('name'),
        supabase.from('matches').select(`*, category:category_id(id, name, color), player1:player1_id(*, team:team_id(name, image_url, color)), player2:player2_id(*, team:team_id(name, image_url, color)), winner:winner_id(name)`).order('match_date', { ascending: true, nullsFirst: false }).order('match_time', { ascending: true, nullsFirst: false }),
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
    // Inicializar flatpickr para el filtro de fechas si no está ya hecho
    if (filterDateRangeInput && !filterDateRangeInput._flatpickr) {
        flatpickr(filterDateRangeInput, {
            mode: 'range',
            dateFormat: 'Y-m-d',
            allowInput: true,
            onChange: function(selectedDates, dateStr) {
                if (selectedDates.length === 2) {
                    filterDateRange = [selectedDates[0], selectedDates[1]];
                    // Mostrar el rango en formato d/M a d/M
                    const d1 = selectedDates[0];
                    const d2 = selectedDates[1];
                    const str = `${d1.getDate()}/${d1.getMonth()+1} a ${d2.getDate()}/${d2.getMonth()+1}`;
                    filterDateRangeInput.value = str;
                    filterDateRangeInput.style.color = '#000';
                    lastDateRangeStr = str;
                } else {
                    filterDateRange = [null, null];
                    filterDateRangeInput.value = '';
                    filterDateRangeInput.style.color = '';
                    lastDateRangeStr = '';
                }
                applyFiltersAndSort();
            },
            onOpen: function() {
                // Si hay un rango, mostrarlo en negro
                if (filterDateRange[0] && filterDateRange[1]) {
                    filterDateRangeInput.value = lastDateRangeStr;
                    filterDateRangeInput.style.color = '#000';
                }
            }
        });
    }
    applyFiltersAndSort();
}

function updateSummaryCards() {
    const pendientes = allMatches.filter(m => !m.winner_id && m.status !== 'suspendido').length;
    const now = new Date();
    const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
    const finDelDia = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const recientes = allMatches.filter(m => {
        if (!m.winner_id || !m.match_date) return false;
        let matchDate;
        if (m.match_date.includes('-')) {
            const [y, mth, d] = m.match_date.split('-');
            matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
        } else if (m.match_date.includes('/')) {
            const [d, mth, y] = m.match_date.split('/');
            matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
        } else { return false; }
        return matchDate >= sieteDiasAtras && matchDate <= finDelDia;
    }).length;
    document.getElementById('count-pendientes').textContent = pendientes;
    document.getElementById('count-recientes').textContent = recientes;
}

function populateFilterSelects() {
    filterTournamentSelect.innerHTML = '<option value="">Todos los Torneos</option>';
    allTournaments.forEach(t => filterTournamentSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
    updateClearFiltersBtn();
}

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
    if (tournamentFilter) processedMatches = processedMatches.filter(m => m.tournament_id == tournamentFilter);
    if (sedeFilter) processedMatches = processedMatches.filter(m => m.location && m.location.toLowerCase().startsWith(sedeFilter.toLowerCase()));
    if (canchaFilter) processedMatches = processedMatches.filter(m => m.location && m.location.toLowerCase().includes(canchaFilter.toLowerCase()));
    if (statusFilter) {
        if (statusFilter === 'pendiente') processedMatches = processedMatches.filter(m => !m.winner_id && m.status !== 'suspendido');
        else if (statusFilter === 'completado') processedMatches = processedMatches.filter(m => !!m.winner_id);
        else if (statusFilter === 'suspendido') processedMatches = processedMatches.filter(m => m.status === 'suspendido');
    }
    // Filtro por rango de fechas
    if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
        processedMatches = processedMatches.filter(m => {
            if (!m.match_date) return false;
            let matchDateObj = null;
            if (m.match_date.includes('-')) {
                const [y, mth, d] = m.match_date.split('-');
                matchDateObj = new Date(Number(y), Number(mth) - 1, Number(d));
            } else if (m.match_date.includes('/')) {
                const [d, mth, y] = m.match_date.split('/');
                matchDateObj = new Date(Number(y), Number(mth) - 1, Number(d));
            }
            if (!matchDateObj) return false;
            return matchDateObj >= filterDateRange[0] && matchDateObj <= filterDateRange[1];
        });
    }

    // Filtros rápidos por tarjetas
    if (quickFilterMode === 'pendientes') {
        processedMatches = processedMatches.filter(m => !m.winner_id && m.status !== 'suspendido');
    } else if (quickFilterMode === 'recientes') {
        const now = new Date();
        const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
        const finDelDia = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        processedMatches = processedMatches.filter(m => {
            if (!m.winner_id || !m.match_date) return false;
            let matchDate;
            if (m.match_date.includes('-')) {
                const [y, mth, d] = m.match_date.split('-');
                matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
            } else if (m.match_date.includes('/')) {
                const [d, mth, y] = m.match_date.split('/');
                matchDate = new Date(Number(y), Number(mth) - 1, Number(d));
            } else { return false; }
            return matchDate >= sieteDiasAtras && matchDate <= finDelDia;
        });
    }

    // Ordenar por fecha (match_date) según sortOrderDesc
    processedMatches.sort((a, b) => {
        if (!a.match_date) return 1;
        if (!b.match_date) return -1;
        const da = new Date(a.match_date);
        const db = new Date(b.match_date);
        return sortOrderDesc ? db - da : da - db;
    });
    renderMatches(processedMatches);
    updateBulkActionBar();
    updateClearFiltersBtn();
}


function updateClearFiltersBtn() {
    if (anyFilterActive()) {
        clearFiltersBtn.classList.remove('hidden');
    } else {
        clearFiltersBtn.classList.add('hidden');
    }
}

clearFiltersBtn.onclick = function() {
    filterTournamentSelect.value = '';
    filterStatusSelect.value = '';
    filterSedeSelect.value = '';
    filterCanchaSelect.value = '';
    searchInput.value = '';
    filterDateRange = [null, null];
    filterDateRangeInput.value = '';
    filterDateRangeInput.style.color = '';
    lastDateRangeStr = '';
    quickFilterMode = null;
    applyFiltersAndSort();
};

// --- Filtros rápidos por tarjetas resumen ---
let quickFilterMode = null; // null | 'pendientes' | 'recientes'
let sortOrderDesc = true; // true: más recientes arriba (default)

function clearQuickFilter() {
    quickFilterMode = null;
    applyFiltersAndSort();
}

function applyQuickFilter(mode) {
    quickFilterMode = mode;
    applyFiltersAndSort();
}

function renderMatches(matchesToRender) {
    if (matchesToRender.length === 0) {
        matchesContainer.innerHTML = '<p class="text-center text-gray-400 py-8">No hay partidos que coincidan con los filtros.</p>';
        return;
    }

    const groupedByDate = matchesToRender.reduce((acc, match) => {
        const date = match.match_date || 'Sin fecha';
        if (!acc[date]) acc[date] = [];
        acc[date].push(match);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a) - new Date(b));
    let tableHTML = '';

    for (const [dateIdx, date] of sortedDates.entries()) {
    if (dateIdx > 0) tableHTML += `<tr><td colspan="10" style="height: 18px; background: #000; border: none;"></td></tr>`;
        const groupedBySede = groupedByDate[date].reduce((acc, match) => {
            const sede = (match.location ? match.location.split(' - ')[0] : 'Sede no definida').trim();
            if(!acc[sede]) acc[sede] = [];
            acc[sede].push(match);
            return acc;
        }, {});

        let sedeIdx = 0;
        for(const sede in groupedBySede) {
            if (sedeIdx > 0) tableHTML += `<tr><td colspan="10" style="height: 14px; background: #000; border: none;"></td></tr>`;
            sedeIdx++;
            const matchesInSede = groupedBySede[sede];
            // Header unificado sede + fecha
            const dateObj = new Date(date + 'T00:00:00');
            const weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('es-AR', { month: 'long' });
            let formattedDate = `${weekday} ${day} de ${month}`;
            formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
                        const headerBgColor = sede.toLowerCase() === 'centro' ? '#222222' : '#fdc100';
                        const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';
                        tableHTML += `
                            <tr>
                                <td colspan="3" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 8px 0 0 0; letter-spacing: 1px; border-right: none;">
                                    ${sede.toUpperCase()}
                                </td>
                                <td colspan="7" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0 8px 0 0; letter-spacing: 1px; border-left: none;">
                                    ${formattedDate}
                                </td>
                            </tr>`;

            for (const match of matchesInSede) {
                const { p1_points, p2_points } = calculatePoints(match);
                const p1_class = match.player1.id === match.winner_id ? 'winner' : '';
                const p2_class = match.player2.id === match.winner_id ? 'winner' : '';
                let hora = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                const setsDisplay = (match.sets || []).map(s => `${s.p1}/${s.p2}`).join(' ');
                const p1TeamColor = match.player1.team?.color;
                const p2TeamColor = match.player2.team?.color;
                const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                const played = !!(match.sets && match.sets.length > 0);
                let p1NameStyle = played && !p1_class ? 'color:#888;' : '';
                let p2NameStyle = played && !p2_class ? 'color:#888;' : '';
                const p1PointsDisplay = played ? p1_points : '';
                const p2PointsDisplay = played ? p2_points : '';
                let cancha = 'N/A';
                if (match.location) {
                    const parts = match.location.split(' - ');
                    cancha = parts[1] || parts[0];
                }
                const matchNum = cancha.match(/\d+/);
                if (matchNum) cancha = matchNum[0];
                const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
                const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';

                tableHTML += `
                    <tr class="clickable-row data-row" data-match-id="${match.id}">
                        <td style="padding: 4px; background-color: #1a1a1a;"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''} style="transform: scale(1.2);"></td>
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td style="background:#000;color:#fff;">${hora}</td>
                        <td class="player-name player-name-right ${p1_class}" style='background:#000;color:#fff;${p1NameStyle}'>${match.player1.name}</td>
                        <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${p1PointsDisplay}</td>
                        <td class="font-mono" style="background:#000;color:#fff;">${setsDisplay}</td>
                        <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${p2PointsDisplay}</td>
                        <td class="player-name player-name-left ${p2_class}" style='background:#000;color:#fff;${p2NameStyle}'>${match.player2.name}</td>
                        <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${match.category?.name || 'N/A'}</td>
                        <td class="action-cell" style="background:#000;"><button class="p-1 rounded-full hover:bg-gray-700" data-action="edit" title="Editar / Cargar Resultado"><span class="material-icons text-base" style="color:#fff;">edit</span></button></td>
                    </tr>`;
            }
        }
    }
    
    matchesContainer.innerHTML = `
        <table class="matches-report-style">
            <colgroup><col style="width: 4%"><col style="width: 5%"><col style="width: 8%"><col style="width: 25%"><col style="width: 5%"><col style="width: 13%"><col style="width: 5%"><col style="width: 25%"><col style="width: 5%"><col style="width: 5%"></colgroup>
            <thead><tr>
                <th><input type="checkbox" id="select-all-matches"></th>
                <th>Cancha</th><th>Hora</th><th style="text-align: right; padding-right: 8px;">Jugador 1</th><th>Pts</th><th>Resultado</th><th>Pts</th><th style="text-align: left; padding-left: 8px;">Jugador 2</th><th>Cat.</th><th>Editar</th>
            </tr></thead>
            <tbody>${tableHTML}</tbody>
        </table>`;

    // Seleccionar/Deseleccionar todos los partidos visibles
    const selectAllCheckbox = document.getElementById('select-all-matches');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = matchesContainer.querySelectorAll('.match-checkbox');
            if (this.checked) {
                checkboxes.forEach(cb => {
                    cb.checked = true;
                    selectedMatches.add(Number(cb.dataset.id));
                });
            } else {
                checkboxes.forEach(cb => {
                    cb.checked = false;
                    selectedMatches.delete(Number(cb.dataset.id));
                });
            }
            updateBulkActionBar();
        });
    }
}

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
        <div id="modal-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div id="modal-content" class="bg-white rounded-xl shadow-lg w-full max-w-lg">
            <div class="p-6 border-b"><h3 class="text-xl font-bold">Editar Partido / Resultado</h3></div>
            <form id="modal-form" class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-sm font-medium text-gray-700">Jugador A</label><select id="player1-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
                    <div><label class="block text-sm font-medium text-gray-700">Jugador B</label><select id="player2-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-sm font-medium text-gray-700">Fecha</label><input type="text" id="match-date-modal" class="input-field mt-1" value="${match.match_date || ''}" autocomplete="off"></div>
                    <div><label class="block text-sm font-medium text-gray-700">Hora</label><input type="time" id="match-time-modal" class="input-field mt-1" value="${match.match_time || ''}"></div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-sm font-medium text-gray-700">Sede</label><select id="match-sede-modal" class="input-field mt-1"><option value="Funes" ${match.location?.startsWith('Funes') ? 'selected' : ''}>Funes</option><option value="Centro" ${match.location?.startsWith('Centro') ? 'selected' : ''}>Centro</option></select></div>
                    <div><label class="block text-sm font-medium text-gray-700">Cancha</label><select id="match-cancha-modal" class="input-field mt-1">${[1,2,3,4,5,6].map(n => `<option value="Cancha ${n}" ${match.location?.includes(`Cancha ${n}`) ? 'selected' : ''}>Cancha ${n}</option>`).join('')}</select></div>
                </div>
                <div class="grid grid-cols-3 gap-4 items-center pt-4"><span class="font-semibold">SET</span><span class="font-semibold text-center">${match.player1.name}</span><span class="font-semibold text-center">${match.player2.name}</span></div>
                ${[1, 2, 3].map(i => `<div class="grid grid-cols-3 gap-4 items-center"><span>Set ${i}</span><input type="number" id="p1_set${i}" class="input-field text-center" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9"><input type="number" id="p2_set${i}" class="input-field text-center" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9"></div>`).join('')}
            </form>
            <div class="p-4 bg-gray-50 flex justify-between gap-4 rounded-b-xl">
                <div class="flex items-center gap-2"><button id="btn-delete-match" class="btn btn-secondary !p-2" title="Eliminar Partido"><span class="material-icons !text-red-600">delete_forever</span></button>${isPlayed ? `<button id="btn-clear-score" class="btn btn-secondary !p-2" title="Limpiar Resultado"><span class="material-icons !text-yellow-600">cleaning_services</span></button>` : ''}<button id="btn-suspend-match" class="btn btn-secondary !p-2" title="Marcar como Suspendido"><span class="material-icons !text-red-500">cancel</span></button></div>
                <div class="flex gap-4"><button id="btn-cancel-modal" class="btn btn-secondary">Cancelar</button><button id="btn-save-score" class="btn btn-primary">Guardar</button></div>
            </div>
        </div></div>`;
    flatpickr('#match-date-modal', {dateFormat: 'Y-m-d', allowInput: true});
    document.getElementById('btn-save-score').onclick = () => saveMatch(match.id);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('btn-delete-match').onclick = () => deleteMatch(match.id);
    document.getElementById('btn-suspend-match').onclick = () => suspendMatch(match.id);
    if (isPlayed) document.getElementById('btn-clear-score').onclick = () => clearScore(match.id);
    document.getElementById('modal-overlay').onclick = (e) => { if (e.target.id === 'modal-overlay') closeModal(); };
}

function closeModal() { modalContainer.innerHTML = ''; }

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
    if (p1_id === p2_id) return alert("Los jugadores no pueden ser los mismos.");
    let winner_id = null;
    if (sets.length > 0) {
        if (sets.length < 2 || (p1SetsWon < 2 && p2SetsWon < 2)) return alert("El resultado no es válido. Un jugador debe ganar al menos 2 sets.");
        winner_id = p1SetsWon > p2SetsWon ? p1_id : p2_id;
    }
    const match_date = document.getElementById('match-date-modal').value;
    const location = `${document.getElementById('match-sede-modal').value} - ${document.getElementById('match-cancha-modal').value}`;
    const { error } = await supabase.from('matches').update({ player1_id: p1_id, player2_id: p2_id, sets: sets.length > 0 ? sets : null, winner_id, status: 'programado', match_date, match_time: document.getElementById('match-time-modal').value, location }).eq('id', matchId);
    if (error) alert("Error al guardar el partido: " + error.message);
    else { closeModal(); await loadInitialData(); }
}

async function clearScore(matchId) { if (confirm("¿Limpiar el resultado de este partido?")) { const { error } = await supabase.from('matches').update({ sets: null, winner_id: null, status: 'programado' }).eq('id', matchId); if (error) alert("Error: " + error.message); else { closeModal(); await loadInitialData(); } } }
async function deleteMatch(matchId) { if (confirm("¿ELIMINAR este partido permanentemente?")) { const { error } = await supabase.from('matches').delete().eq('id', matchId); if (error) alert("Error: " + error.message); else { closeModal(); await loadInitialData(); } } }
async function suspendMatch(matchId) { if (confirm("¿Marcar este partido como suspendido?")) { const { error } = await supabase.from('matches').update({ status: 'suspendido', sets: null, winner_id: null }).eq('id', matchId); if (error) alert("Error: " + error.message); else { closeModal(); await loadInitialData(); } } }

function updateBulkActionBar() {
    selectedCountSpan.textContent = selectedMatches.size;
    bulkActionBar.classList.toggle('translate-y-24', selectedMatches.size === 0);
    bulkActionBar.classList.toggle('opacity-0', selectedMatches.size === 0);
}

async function handleBulkDelete() {
    if (selectedMatches.size === 0) return;
    if (confirm(`¿Eliminar ${selectedMatches.size} partidos seleccionados?`)) {
        const { error } = await supabase.from('matches').delete().in('id', Array.from(selectedMatches));
        if (error) alert("Error: " + error.message);
        else { selectedMatches.clear(); await loadInitialData(); }
    }
}

function handleBulkReport() {
    if (selectedMatches.size === 0) return alert("No hay partidos seleccionados.");
    const reportMatches = Array.from(selectedMatches).map(id => {
        const match = allMatches.find(m => m.id === id);
        if (!match) return null;
        const { p1_points, p2_points } = calculatePoints(match);
        return {
            date: match.match_date ? match.match_date.split('T')[0] : '', time: match.match_time || '', location: match.location || '',
            category: match.category?.name || '', category_color: match.category?.color || '#e5e7eb',
            player1: { name: match.player1?.name || '', points: p1_points ?? '', isWinner: match.winner_id === match.player1_id, teamColor: match.player1?.team?.color },
            player2: { name: match.player2?.name || '', points: p2_points ?? '', isWinner: match.winner_id === match.player2_id, teamColor: match.player2?.team?.color },
            sets: (match.sets && match.sets.length > 0) ? match.sets.map(s => `${s.p1}-${s.p2}`).join(', ') : ''
        };
    }).filter(Boolean);
    localStorage.setItem('reportMatches', JSON.stringify(reportMatches));
    window.open('reportes.html', '_blank');
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
    // Eventos para tarjetas resumen
    const cardPendientes = document.getElementById('card-pendientes');
    const cardRecientes = document.getElementById('card-recientes');
    if (cardPendientes) {
        cardPendientes.style.cursor = 'pointer';
        cardPendientes.onclick = () => applyQuickFilter('pendientes');
    }
    if (cardRecientes) {
        cardRecientes.style.cursor = 'pointer';
        cardRecientes.onclick = () => applyQuickFilter('recientes');
    }
    // Botón de orden
    const btnSortOrder = document.getElementById('btn-sort-order');
    if (btnSortOrder) {
        btnSortOrder.innerHTML = `<span class="material-icons mr-1" style="font-size:18px;">swap_vert</span> ${sortOrderDesc ? 'Más recientes arriba' : 'Más antiguos arriba'}`;
        btnSortOrder.onclick = () => {
            sortOrderDesc = !sortOrderDesc;
            btnSortOrder.innerHTML = `<span class=\"material-icons mr-1\" style=\"font-size:18px;\">swap_vert</span> ${sortOrderDesc ? 'Más recientes arriba' : 'Más antiguos arriba'}`;
            applyFiltersAndSort();
        };
    }
});

btnShowForm.addEventListener('click', () => {
    const isHidden = massLoaderContainer.classList.toggle('hidden');
    btnShowForm.innerHTML = isHidden
        ? '<span class="material-icons">add</span> Crear Partido'
        : '<span class="material-icons">close</span> Cancelar Carga';

    if (!isHidden && !isMassLoaderInitialized) {
        setupMassMatchLoader({
            container: massLoaderContainer,
            allTournaments,
            allPlayers,
            tournamentPlayersMap,
            loadInitialData
        });
        isMassLoaderInitialized = true;
    }
});

[filterTournamentSelect, filterStatusSelect, filterSedeSelect, filterCanchaSelect, searchInput].forEach(el => {
    if (el) el.addEventListener('input', applyFiltersAndSort);
});

// Click para seleccionar, doble clic para editar
let lastClickTime = 0;
const DOUBLE_CLICK_INTERVAL = 200; // ms, mucho más rápido
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
        updateBulkActionBar();
        return;
    }
    if (!e.target.closest('button, input')) {
        const now = Date.now();
        if (now - lastClickTime < DOUBLE_CLICK_INTERVAL) {
            // Doble clic: abrir modal de edición
            const matchData = allMatches.find(m => m.id === matchId);
            if (matchData) openScoreModal(matchData);
            lastClickTime = 0;
        } else {
            // Simple clic: seleccionar/deseleccionar
            const checkboxInRow = row.querySelector('.match-checkbox');
            checkboxInRow.checked = !checkboxInRow.checked;
            checkboxInRow.checked ? selectedMatches.add(matchId) : selectedMatches.delete(matchId);
            updateBulkActionBar();
            lastClickTime = now;
        }
    }
});

document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
document.getElementById('bulk-report').addEventListener('click', handleBulkReport);
document.getElementById('btn-import-excel').addEventListener('click', () => {
    importMatchesFromFile(allPlayers, allTournaments, []).then(success => { if (success) loadInitialData(); });
});
document.getElementById('bulk-deselect').addEventListener('click', () => {
    selectedMatches.clear();
    applyFiltersAndSort();
});