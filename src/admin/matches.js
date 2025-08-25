import { calculatePoints } from './calculatePoints.js';
import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { importMatchesFromFile } from '../common/excel-importer.js';
import { setupMassMatchLoader } from './mass-match-loader.js';
import { setupDoublesMatchLoader } from './doubles-match-loader.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const btnShowSinglesForm = document.getElementById('btn-show-singles-form');
const btnShowDoublesForm = document.getElementById('btn-show-doubles-form');
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
const doublesLoaderContainer = document.getElementById('doubles-match-loader-container');
const filterDateRangeInput = document.getElementById('filter-date-range');
let filterDateRange = [null, null];
let lastDateRangeStr = '';

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
    if (filterDateRangeInput._flatpickr) {
        filterDateRangeInput._flatpickr.clear();
    }
    lastDateRangeStr = '';
    quickFilterMode = null;
    applyFiltersAndSort();
};

// --- Estado Global ---
let allMatches = [];
let allPlayers = [];
let allTeams = [];
let allTournaments = [];
let tournamentPlayersMap = new Map();
let selectedMatches = new Set();
let isSinglesLoaderInitialized = false;
let isDoublesLoaderInitialized = false;

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
        { data: teamsData },
        { data: matchesData },
        { data: tournamentPlayersData }
    ] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('tournaments').select('*, category:category_id(id, name)').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('matches').select(`*, 
            category:category_id(id, name, color), 
            player1:player1_id(*, team:team_id(name, image_url, color)), 
            player2:player2_id(*, team:team_id(name, image_url, color)), 
            player3:player3_id(*, team:team_id(name, image_url, color)),
            player4:player4_id(*, team:team_id(name, image_url, color)),
            winner:winner_id(name)`)
        .order('match_date', { ascending: true, nullsFirst: false })
        .order('match_time', { ascending: true, nullsFirst: false }),
        supabase.from('tournament_players').select('tournament_id, player_id')
    ]);

    allPlayers = playersData || [];
    allTournaments = tournamentsData || [];
    allTeams = teamsData || [];
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
    if (filterDateRangeInput && !filterDateRangeInput._flatpickr) {
        flatpickr(filterDateRangeInput, {
            mode: 'range',
            dateFormat: 'Y-m-d',
            allowInput: true,
            onChange: function(selectedDates, dateStr) {
                if (selectedDates.length === 2) {
                    filterDateRange = [selectedDates[0], selectedDates[1]];
                } else {
                    filterDateRange = [null, null];
                }
                applyFiltersAndSort();
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
        let matchDate = new Date(m.match_date);
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
            (m.player2 && normalizeText(m.player2.name.toLowerCase()).includes(searchTerm)) ||
            (m.player3 && normalizeText(m.player3.name.toLowerCase()).includes(searchTerm)) ||
            (m.player4 && normalizeText(m.player4.name.toLowerCase()).includes(searchTerm))
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
    if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
        processedMatches = processedMatches.filter(m => {
            if (!m.match_date) return false;
            let matchDateObj = new Date(m.match_date);
            return matchDateObj >= filterDateRange[0] && matchDateObj <= filterDateRange[1];
        });
    }

    if (quickFilterMode === 'pendientes') {
        processedMatches = processedMatches.filter(m => !m.winner_id && m.status !== 'suspendido');
    } else if (quickFilterMode === 'recientes') {
        const now = new Date();
        const sieteDiasAtras = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
        const finDelDia = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        processedMatches = processedMatches.filter(m => {
            if (!m.winner_id || !m.match_date) return false;
            let matchDate = new Date(m.match_date);
            return matchDate >= sieteDiasAtras && matchDate <= finDelDia;
        });
    }

    processedMatches.sort((a, b) => {
        const da = a.match_date ? new Date(a.match_date) : null;
        const db = b.match_date ? new Date(b.match_date) : null;
        if (!da) return 1;
        if (!db) return -1;
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

// --- Filtros rápidos por tarjetas resumen y orden ---
let quickFilterMode = null;
let sortOrderDesc = true; 

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

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return sortOrderDesc ? dateB - dateA : dateA - dateB;
    });
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
            const dateObj = new Date(date + 'T00:00:00');
            const weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('es-AR', { month: 'long' });
            let formattedDate = `${weekday} ${day} de ${month}`;
            formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
            let headerBgColor;
            if (sede.toLowerCase() === 'centro') {
                headerBgColor = '#222222';
            } else if (sede.toLowerCase() === 'muro') {
                headerBgColor = '#2e2f31';
            } else {
                headerBgColor = '#fdc100';
            }
            const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';
            tableHTML += `
                <tr>
                    <td colspan="3" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-right: none;">
                        ${sede.toUpperCase()}
                    </td>
                    <td colspan="7" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-left: none;">
                        ${formattedDate}
                    </td>
                </tr>`;

            for (const match of matchesInSede) {
                const { p1_points, p2_points } = calculatePoints(match);
                const isDoubles = match.player3_id && match.player4_id;
                const team1_winner = isDoubles ? (match.winner_id === match.player1_id || match.winner_id === match.player3_id) : (match.winner_id === match.player1_id);
                const team2_winner = isDoubles ? (match.winner_id === match.player2_id || match.winner_id === match.player4_id) : (match.winner_id === match.player2_id);

                const team1_class = team1_winner ? 'winner' : '';
                const team2_class = team2_winner ? 'winner' : '';

                let team1_names = match.player1.name;
                if (isDoubles && match.player3) team1_names += ` / ${match.player3.name}`;

                let team2_names = match.player2.name;
                if (isDoubles && match.player4) team2_names += ` / ${match.player4.name}`;

                let hora = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                const setsDisplay = (match.sets || []).map(s => `${s.p1}/${s.p2}`).join(' ');
                let resultadoDisplay = '';
                if (match.status === 'suspendido') {
                    resultadoDisplay = '<span style="color:#fff;font-weight:700;text-decoration:none !important;">Suspendido</span>';
                } else {
                    resultadoDisplay = setsDisplay;
                }
                const p1TeamColor = match.player1.team?.color;
                const p2TeamColor = match.player2.team?.color;
                const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';

                const played = !!(match.sets && match.sets.length > 0);
                let team1NameStyle = played && !team1_winner ? 'color:#888;' : '';
                let team2NameStyle = played && !team2_winner ? 'color:#888;' : '';

                let team1PointsDisplay = '';
                let team2PointsDisplay = '';
                if (played) {
                    team1PointsDisplay = (typeof p1_points !== 'undefined' && p1_points !== null) ? p1_points : '';
                    if (team1PointsDisplay === 0) team1PointsDisplay = '0';
                    team2PointsDisplay = (typeof p2_points !== 'undefined' && p2_points !== null) ? p2_points : '';
                    if (team2PointsDisplay === 0) team2PointsDisplay = '0';
                } else {
                    if (match.player1.team?.image_url) {
                        team1PointsDisplay = `<img src="${match.player1.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    }
                    if (match.player2.team?.image_url) {
                        team2PointsDisplay = `<img src="${match.player2.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    }
                }
                let cancha = 'N/A';
                if (match.location) {
                    const parts = match.location.split(' - ');
                    cancha = parts[1] || parts[0];
                }
                const matchNum = cancha.match(/\d+/);
                if (matchNum) cancha = matchNum[0];
                const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
                const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';

                const suspendedClass = match.status === 'suspendido' ? 'suspended-row' : '';

                tableHTML += `
                    <tr class="clickable-row data-row ${suspendedClass}" data-match-id="${match.id}">
                        <td style="padding: 4px; background-color: #1a1a1a;"><input type="checkbox" id="match-checkbox-${match.id}" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''} style="transform: scale(1.2);"></td>
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td style="background:#000;color:#fff;">${hora}</td>
                        <td class="player-name player-name-right ${team1_class}" style='background:#000;color:#fff;${team1NameStyle};font-size:${isDoubles ? '10pt' : '12pt'};'>${team1_names}</td>
                        <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${team1PointsDisplay}</td>
                        <td class="font-mono" style="background:#000;color:#fff;">${resultadoDisplay}</td>
                        <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${team2PointsDisplay}</td>
                        <td class="player-name player-name-left ${team2_class}" style='background:#000;color:#fff;${team2NameStyle};font-size:${isDoubles ? '10pt' : '12pt'};'>${team2_names}</td>
                        <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${match.category?.name || 'N/A'}</td>
                        <td class="action-cell" style="background:#000;"><button class="p-1 rounded-full hover:bg-gray-700" data-action="edit" title="Editar / Cargar Resultado"><span class="material-icons text-base" style="color:#fff;">edit</span></button></td>
                    </tr>`;
            }
        }
    }
    
    matchesContainer.innerHTML = `
    <div class="bg-[#18191b] p-4 sm:p-6 rounded-xl shadow-lg overflow-x-auto">
    <table class="matches-report-style">
            <colgroup><col style="width: 4%"><col style="width: 5%"><col style="width: 4%"><col style="width: 25%"><col style="width: 5%"><col style="width: 13%"><col style="width: 5%"><col style="width: 25%"><col style="width: 5%"><col style="width: 5%"></colgroup>
            <thead><tr>
                <th><input type="checkbox" id="select-all-matches"></th>
                <th>Cancha</th><th>Hora</th><th style="text-align: right; padding-right: 8px;">Jugador 1</th><th>Pts</th><th>Resultado</th><th>Pts</th><th style="text-align: left; padding-left: 8px;">Jugador 2</th><th>Cat.</th><th>Editar</th>
            </tr></thead>
            <tbody>${tableHTML}</tbody>
    </table>
    </div>`;

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

// --- MODAL Y ACCIONES (NUEVO CÓDIGO UNIFICADO) ---

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
    const isDoubles = match.player3_id && match.player4_id;

    // Parse location
    let sede = '';
    let cancha = '';
    if (match.location) {
        const parts = match.location.split(' - ');
        sede = parts[0]?.trim() || '';
        cancha = parts[1]?.trim() || '';
    }
    
    // Prepare options for selects
    const sedeOptions = ['Centro', 'Funes'].map(s => `<option value="${s}" ${sede === s ? 'selected' : ''}>${s}</option>`).join('');
    const canchaOptions = [1, 2, 3, 4, 5, 6].map(c => `<option value="Cancha ${c}" ${cancha === `Cancha ${c}` ? 'selected' : ''}>Cancha ${c}</option>`).join('');

    modalContainer.innerHTML = `
        <div id="score-modal-overlay" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-2 z-50">
            <div id="score-modal-content" class="bg-[#232323] rounded-xl shadow-lg w-full max-w-2xl border border-[#444] mx-2 sm:mx-0">
                <div class="p-6 border-b border-[#333]">
                    <h3 class="text-xl font-bold text-yellow-400">Editar Partido / Resultado</h3>
                </div>
                <form id="score-form" class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Jugador A1</label>
                            <select id="player1-select-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" ${isPlayed ? 'disabled' : ''}>
                                ${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Jugador B1</label>
                            <select id="player2-select-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" ${isPlayed ? 'disabled' : ''}>
                                ${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    ${isDoubles ? `
                    <div id="doubles-players-container" class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Jugador A2</label>
                            <select id="player3-select-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" ${isPlayed ? 'disabled' : ''}>
                                ${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player3_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Jugador B2</label>
                            <select id="player4-select-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" ${isPlayed ? 'disabled' : ''}>
                                ${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player4_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>` : ''}

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-700 mt-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Fecha</label>
                            <input type="date" id="match-date-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" value="${match.match_date || ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Hora</label>
                            <input type="time" id="match-time-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" value="${match.match_time ? match.match_time.substring(0, 5) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Sede</label>
                            <select id="match-sede-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]">
                                <option value="">Seleccionar Sede</option>
                                ${sedeOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Cancha</label>
                             <select id="match-cancha-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]">
                                <option value="">Seleccionar Cancha</option>
                                ${canchaOptions}
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-4 items-center pt-4 border-t border-gray-700 mt-4">
                        <span class="font-semibold text-gray-200">SET</span>
                        <span class="font-semibold text-center text-gray-200" style="font-size:14px;" id="teamA-name">${isDoubles ? `${match.player1.name} / ${match.player3?.name || '...'}` : match.player1.name}</span>
                        <span class="font-semibold text-center text-gray-200" style="font-size:14px;" id="teamB-name">${isDoubles ? `${match.player2.name} / ${match.player4?.name || '...'}` : match.player2.name}</span>
                    </div>
                    ${[1, 2, 3].map(i => `
                        <div class="grid grid-cols-3 gap-4 items-center">
                            <span class="text-gray-300">Set ${i}</span>
                            <input type="number" id="p1_set${i}" class="input-field text-center bg-[#181818] text-gray-100 border-[#444]" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9">
                            <input type="number" id="p2_set${i}" class="input-field text-center bg-[#181818] text-gray-100 border-[#444]" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9">
                        </div>
                    `).join('')}
                </form>
                <div class="p-4 bg-[#181818] flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 rounded-b-xl border-t border-[#333]">
                    <div class="flex flex-row flex-wrap items-center gap-2 justify-center sm:justify-start mb-2 sm:mb-0">
                        <button id="btn-delete-match" class="btn btn-secondary !p-2" title="Eliminar Partido"><span class="material-icons !text-red-600">delete_forever</span></button>
                        ${isPlayed ? `<button id="btn-clear-score" class="btn btn-secondary !p-2" title="Limpiar Resultado"><span class="material-icons !text-yellow-600">cleaning_services</span></button>` : ''}
                    </div>
                    <div class="flex flex-row flex-wrap gap-2 justify-center sm:justify-end">
                        <button id="btn-cancel-modal" class="btn btn-secondary w-full sm:w-auto">Cancelar</button>
                        <button id="btn-save-score" class="btn btn-primary w-full sm:w-auto">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('player1-select-modal').addEventListener('change', () => updateTeamNamesInModal(isDoubles));
    document.getElementById('player2-select-modal').addEventListener('change', () => updateTeamNamesInModal(isDoubles));
    if (isDoubles) {
        document.getElementById('player3-select-modal').addEventListener('change', () => updateTeamNamesInModal(isDoubles));
        document.getElementById('player4-select-modal').addEventListener('change', () => updateTeamNamesInModal(isDoubles));
    }

    document.getElementById('btn-save-score').onclick = () => saveScores(match);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('btn-delete-match').onclick = () => deleteMatch(match.id);
    if (isPlayed) document.getElementById('btn-clear-score').onclick = () => clearScore(match.id);
    document.getElementById('score-modal-overlay').onclick = (e) => { if (e.target.id === 'score-modal-overlay') closeModal(); };
}


function updateTeamNamesInModal(isDoubles) {
    const p1Select = document.getElementById('player1-select-modal');
    const p2Select = document.getElementById('player2-select-modal');
    
    const p1Name = p1Select.options[p1Select.selectedIndex].text;
    const p2Name = p2Select.options[p2Select.selectedIndex].text;

    let teamAName = p1Name;
    let teamBName = p2Name;

    if (isDoubles) {
        const p3Select = document.getElementById('player3-select-modal');
        const p4Select = document.getElementById('player4-select-modal');
        const p3Name = p3Select.options[p3Select.selectedIndex].text;
        const p4Name = p4Select.options[p4Select.selectedIndex].text;
        teamAName += ` / ${p3Name}`;
        teamBName += ` / ${p4Name}`;
    }

    document.getElementById('teamA-name').textContent = teamAName;
    document.getElementById('teamB-name').textContent = teamBName;
}


function closeModal() {
    modalContainer.innerHTML = '';
}

async function saveScores(match) {
    const matchId = match.id;
    const isDoubles = !!(match.player3_id && match.player4_id);

    const sets = [];
    let p1SetsWon = 0, p2SetsWon = 0;
    
    for (let i = 1; i <= 3; i++) {
        const p1Score = document.getElementById(`p1_set${i}`).value;
        const p2Score = document.getElementById(`p2_set${i}`).value;
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
    const p3_id = isDoubles ? document.getElementById('player3-select-modal').value : null;
    const p4_id = isDoubles ? document.getElementById('player4-select-modal').value : null;

    if (p1_id === p2_id || (isDoubles && (p1_id === p3_id || p1_id === p4_id || p2_id === p3_id || p2_id === p4_id || p3_id === p4_id))) {
        return alert("Los jugadores no pueden repetirse.");
    }
    
    let winner_id = null;
    if (sets.length > 0) {
        if (sets.length < 2 || (p1SetsWon < 2 && p2SetsWon < 2)) return alert("El resultado no es válido. Un equipo debe ganar al menos 2 sets.");
        winner_id = p1SetsWon > p2SetsWon ? p1_id : p2_id;
    }

    const newDate = document.getElementById('match-date-modal').value;
    const newTime = document.getElementById('match-time-modal').value;
    const newSede = document.getElementById('match-sede-modal').value;
    const newCancha = document.getElementById('match-cancha-modal').value;
    const newLocation = newSede && newCancha ? `${newSede} - ${newCancha}` : (newSede || newCancha || '');

    const matchData = { 
        sets: sets.length > 0 ? sets : null, 
        winner_id, 
        player1_id: p1_id,
        player2_id: p2_id,
        player3_id: p3_id,
        player4_id: p4_id,
        status: winner_id ? 'completado' : 'programado',
        bonus_loser: (p1SetsWon === 1 && winner_id == p2_id) || (p2SetsWon === 1 && winner_id == p1_id),
        match_date: newDate || null,
        match_time: newTime || null,
        location: newLocation || null
    };
    
    const { error } = await supabase.from('matches').update(matchData).eq('id', matchId);
    
    if (error) alert("Error al guardar: " + error.message);
    else { closeModal(); await loadInitialData(); }
}

async function clearScore(matchId) {
    if (confirm("¿Limpiar el resultado de este partido?")) {
        const { error } = await supabase.from('matches').update({ sets: null, winner_id: null, bonus_loser: false, status: 'programado' }).eq('id', matchId);
        if (error) alert("Error: " + error.message);
        else { closeModal(); await loadInitialData(); }
    }
}

async function deleteMatch(matchId) {
    if (confirm("¿ELIMINAR este partido permanentemente?")) {
        const { error } = await supabase.from('matches').delete().eq('id', matchId);
        if (error) alert("Error: " + error.message);
        else { closeModal(); await loadInitialData(); }
    }
}

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

async function handleBulkSuspend() {
    if (selectedMatches.size === 0) return;
    if (confirm(`¿Marcar ${selectedMatches.size} partidos seleccionados como suspendidos?`)) {
        const { error } = await supabase.from('matches')
            .update({ status: 'suspendido', sets: null, winner_id: null, bonus_loser: false })
            .in('id', Array.from(selectedMatches));

        if (error) {
            alert("Error al suspender los partidos: " + error.message);
        } else {
            selectedMatches.clear();
            await loadInitialData();
        }
    }
}

function handleBulkReport() {
    if (selectedMatches.size === 0) {
        alert("No hay partidos seleccionados.");
        return;
    }
    const matchIds = Array.from(selectedMatches);
    sessionStorage.setItem('reportMatchIds', JSON.stringify(matchIds));
    window.open('reportes.html', '_blank');
}


// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
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
    const btnSortOrder = document.getElementById('btn-sort-order');
    if (btnSortOrder) {
        const sortText = btnSortOrder.querySelector('span:last-child');
        if (sortText) sortText.textContent = sortOrderDesc ? 'Más recientes' : 'Más antiguos';
        
        btnSortOrder.onclick = () => {
            sortOrderDesc = !sortOrderDesc;
            if (sortText) sortText.textContent = sortOrderDesc ? 'Más recientes' : 'Más antiguos';
            applyFiltersAndSort();
        };
    }
});

btnShowSinglesForm.addEventListener('click', () => {
    doublesLoaderContainer.classList.add('hidden');
    btnShowDoublesForm.innerHTML = '<span class="material-icons">groups</span> Crear Partido Dobles';

    const isHidden = massLoaderContainer.classList.toggle('hidden');
    btnShowSinglesForm.innerHTML = isHidden
        ? '<span class="material-icons">person_add</span> Crear Partido Individual'
        : '<span class="material-icons">close</span> Cancelar';

    if (!isHidden && !isSinglesLoaderInitialized) {
        setupMassMatchLoader({
            container: massLoaderContainer,
            allTournaments,
            allPlayers,
            tournamentPlayersMap,
            loadInitialData
        });
        isSinglesLoaderInitialized = true;
    }
});

btnShowDoublesForm.addEventListener('click', () => {
    massLoaderContainer.classList.add('hidden');
    btnShowSinglesForm.innerHTML = '<span class="material-icons">person_add</span> Crear Partido Individual';

    const isHidden = doublesLoaderContainer.classList.toggle('hidden');
    btnShowDoublesForm.innerHTML = isHidden
        ? '<span class="material-icons">groups</span> Crear Partido Dobles'
        : '<span class="material-icons">close</span> Cancelar';

    if (!isHidden && !isDoublesLoaderInitialized) {
        setupDoublesMatchLoader({
            container: doublesLoaderContainer,
            allTournaments,
            allPlayers,
            allTeams,
            loadInitialData
        });
        isDoublesLoaderInitialized = true;
    }
});


[filterTournamentSelect, filterStatusSelect, filterSedeSelect, filterCanchaSelect, searchInput].forEach(el => {
    if (el) el.addEventListener('input', applyFiltersAndSort);
});

let lastClickTime = 0;
const DOUBLE_CLICK_INTERVAL = 200;
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
            const matchData = allMatches.find(m => m.id === matchId);
            if (matchData) openScoreModal(matchData);
            lastClickTime = 0;
        } else {
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
document.getElementById('bulk-suspend').addEventListener('click', handleBulkSuspend);
document.getElementById('btn-import-excel').addEventListener('click', () => {
    importMatchesFromFile(allPlayers, allTournaments, []).then(success => { if (success) loadInitialData(); });
});
document.getElementById('bulk-deselect').addEventListener('click', () => {
    selectedMatches.clear();
    applyFiltersAndSort();
});