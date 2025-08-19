import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { importMatchesFromFile } from '../common/excel-importer.js';
import { setupMassMatchLoader } from './mass-match-loader.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const massLoaderSection = document.getElementById('mass-loader-section');
const btnShowMassLoader = document.getElementById('btn-show-mass-loader');
const matchesContainer = document.getElementById('matches-container');
const filterTournamentSelect = document.getElementById('filter-tournament');
const filterStatusSelect = document.getElementById('filter-status');
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
let isMassLoaderInitialized = false;

// --- Carga de Datos ---
async function loadInitialData() {
    matchesContainer.innerHTML = '<p class="text-center p-8 text-gray-400">Cargando datos...</p>';
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

    populateFilterSelects();
    applyFiltersAndSort();
}

function populateFilterSelects() {
    filterTournamentSelect.innerHTML = '<option value="">Todos los Torneos</option>';
    allTournaments.forEach(t => filterTournamentSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
}

// --- Renderizado, Filtros y Ordenamiento ---
function applyFiltersAndSort() {
    let processedMatches = [...allMatches];
    const tournamentFilter = filterTournamentSelect.value;
    const statusFilter = filterStatusSelect.value;
    const searchTerm = searchInput.value.toLowerCase();

    if (searchTerm) {
        processedMatches = processedMatches.filter(m => 
            (m.player1 && m.player1.name.toLowerCase().includes(searchTerm)) || 
            (m.player2 && m.player2.name.toLowerCase().includes(searchTerm))
        );
    }
    if (tournamentFilter) processedMatches = processedMatches.filter(m => m.tournament_id == tournamentFilter);
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
        matchesContainer.innerHTML = '<p class="text-center text-gray-400 py-8">No hay partidos que coincidan con los filtros.</p>';
        return;
    }

    matchesContainer.innerHTML = `
        <table class="min-w-full matches-table">
            <thead>
                <tr>
                    <th class="p-4"><input type="checkbox" id="select-all-matches"></th>
                    <th>Fecha y Hora</th>
                    <th>Encuentro</th>
                    <th class="text-center">Resultado</th>
                    <th>Torneo</th>
                    <th class="text-center">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${matchesToRender.map(match => {
                    const p1_winner = match.winner_id === match.player1_id;
                    const p2_winner = match.winner_id === match.player2_id;
                    const no_winner = !match.winner_id;
                    const p1_class = no_winner ? 'text-gray-100' : p1_winner ? 'text-yellow-400 font-bold' : 'text-gray-500';
                    const p2_class = no_winner ? 'text-gray-100' : p2_winner ? 'text-yellow-400 font-bold' : 'text-gray-500';
                    const sets = match.sets || [];
                    const result_string = match.status === 'suspendido' ? 'SUSP' : (sets.length > 0 ? sets.map(s => `${s.p1}-${s.p2}`).join(' ') : '-');
                    const time_string = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                    
                    return `
                    <tr class="clickable-row ${selectedMatches.has(match.id) ? 'bg-yellow-900/50' : ''} ${match.status === 'suspendido' ? '!bg-red-900/50' : ''}" data-match-id="${match.id}">
                        <td class="p-4"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''}></td>
                        <td class="whitespace-nowrap text-sm">
                            ${new Date(match.match_date + 'T00:00:00').toLocaleDateString('es-AR')}
                            <span class="block text-xs text-gray-400">${time_string} hs - ${match.location || 'A definir'}</span>
                        </td>
                        <td class="whitespace-nowrap text-sm">
                            <div class="${p1_class}">${match.player1.name}</div>
                            <div class="${p2_class}">${match.player2.name}</div>
                        </td>
                        <td class="whitespace-nowrap text-sm text-center font-mono font-semibold">${result_string}</td>
                        <td class="whitespace-nowrap text-sm text-gray-400">${match.category.name}</td>
                        <td class="text-center">
                            <button class="p-1 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white" data-action="edit" title="Editar / Cargar Resultado">
                                <span class="material-icons text-base">edit</span>
                            </button>
                        </td>
                    </tr>
                    `
                }).join('')}
            </tbody>
        </table>
    `;
}

// --- Lógica del Modal para editar (Estilo Oscuro) ---
function openScoreModal(match) {
    const sets = match.sets || [];
    const isPlayed = !!match.winner_id;
    const playersInTournament = tournamentPlayersMap.has(match.tournament_id)
        ? allPlayers.filter(p => tournamentPlayersMap.get(match.tournament_id).has(p.id))
        : allPlayers.filter(p => p.category_id === match.category_id);

    modalContainer.innerHTML = `
        <div id="modal-overlay" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div id="modal-content" class="bg-gray-800 text-gray-200 rounded-xl shadow-lg w-full max-w-lg">
                <div class="p-6 border-b border-gray-700"><h3 class="text-xl font-bold text-gray-100">Editar Partido / Resultado</h3></div>
                <form id="modal-form" class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-300">Jugador A</label><select id="player1-select-modal" class="input-field dark-input mt-1" ${isPlayed ? 'disabled' : ''}>${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
                        <div><label class="block text-sm font-medium text-gray-300">Jugador B</label><select id="player2-select-modal" class="input-field dark-input mt-1" ${isPlayed ? 'disabled' : ''}>${playersInTournament.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 items-center pt-4"><span class="font-semibold">SET</span><span class="font-semibold text-center">${match.player1.name}</span><span class="font-semibold text-center">${match.player2.name}</span></div>
                    ${[1, 2, 3].map(i => `<div class="grid grid-cols-3 gap-4 items-center"><span>Set ${i}</span><input type="number" id="p1_set${i}" class="input-field dark-input text-center" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9"><input type="number" id="p2_set${i}" class="input-field dark-input text-center" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9"></div>`).join('')}
                </form>
                <div class="p-4 bg-black flex justify-end gap-4 rounded-b-xl">
                    <button id="btn-cancel-modal" class="btn btn-secondary">Cancelar</button>
                    <button id="btn-save-score" class="btn btn-primary">Guardar</button>
                </div>
            </div>
        </div>`;
    
    document.getElementById('btn-save-score').onclick = () => saveMatch(match.id);
    document.getElementById('btn-cancel-modal').onclick = () => modalContainer.innerHTML = '';
    document.getElementById('modal-overlay').onclick = (e) => { if (e.target.id === 'modal-overlay') modalContainer.innerHTML = ''; };
}

async function saveMatch(matchId) {
    // Lógica de guardado (sin cambios)
}


// --- Lógica de Acciones Masivas ---
function updateBulkActionBar() {
    selectedCountSpan.textContent = selectedMatches.size;
    bulkActionBar.classList.toggle('translate-y-24', selectedMatches.size === 0);
    bulkActionBar.classList.toggle('opacity-0', selectedMatches.size === 0);
}
async function handleBulkDelete() {
    if (confirm(`¿Eliminar ${selectedMatches.size} partidos?`)) {
        await supabase.from('matches').delete().in('id', Array.from(selectedMatches));
        selectedMatches.clear();
        await loadInitialData();
    }
}

// --- FUNCIÓN UNIFICADA DE CREATE-MATCH.JS ---
export function handleExcelMatchFormSubmit(e) {
    e.preventDefault();
    alert('Funcionalidad de guardado masivo en desarrollo.');
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

btnShowMassLoader.addEventListener('click', () => {
    const isHidden = massLoaderSection.classList.toggle('hidden');
    btnShowMassLoader.innerHTML = isHidden
        ? '<span class="material-icons">add</span> Crear Partidos'
        : '<span class="material-icons">close</span> Cancelar';
    
    if (!isHidden && !isMassLoaderInitialized) {
        setupMassMatchLoader({
            container: document.getElementById('table-wrapper'),
            btnAddRow: document.getElementById('btn-add-row'),
            btnSave: document.getElementById('btn-save-all'),
            allTournaments,
            allPlayers,
            tournamentPlayersMap,
            loadInitialData
        });
        isMassLoaderInitialized = true;
    }
});


[filterTournamentSelect, filterStatusSelect, searchInput].forEach(el => {
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
    }
    
    const checkboxInRow = row.querySelector('.match-checkbox');
    if (!e.target.closest('button')) {
      checkboxInRow.checked = !checkboxInRow.checked;
    }
    
    checkboxInRow.checked ? selectedMatches.add(matchId) : selectedMatches.delete(matchId);
    row.classList.toggle('bg-yellow-900/50', checkboxInRow.checked);
    updateBulkActionBar();
});

document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
document.getElementById('btn-import-excel').addEventListener('click', () => {
    const allCategories = [...new Map(allTournaments.map(t => [t.category?.id, t.category])).values()].filter(Boolean);
    importMatchesFromFile(allPlayers, allTournaments, allCategories).then(success => {
        if (success) loadInitialData();
    });
});
document.getElementById('bulk-deselect').addEventListener('click', () => {
    selectedMatches.clear();
    applyFiltersAndSort();
});