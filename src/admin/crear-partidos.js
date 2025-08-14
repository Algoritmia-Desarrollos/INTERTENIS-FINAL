import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { importMatchesFromFile } from '../common/excel-importer.js';
import { setupMassMatchLoader } from './mass-match-loader.js'; // <-- ¡IMPORTANTE!

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

    populateFilterSelects();
    applyFiltersAndSort();
}

function populateFilterSelects() {
    filterTournamentSelect.innerHTML = '<option value="">Todos los Torneos</option>';
    allTournaments.forEach(t => filterTournamentSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
}

// --- Renderizado, Filtros y Ordenamiento (sin cambios) ---
function applyFiltersAndSort() {
    // ... (Esta función no necesita cambios, la mantenemos como está en tu archivo original)
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
    if (tournamentFilter) {
        processedMatches = processedMatches.filter(m => m.tournament_id == tournamentFilter);
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
    // ... (Esta función no necesita cambios, la mantenemos como está en tu archivo original)
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
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Encuentro</th>
                    <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Resultado</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Torneo</th>
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
                    const result_string = match.status === 'suspendido' ? 'SUSP' : (sets.length > 0 ? sets.map(s => `${s.p1}-${s.p2}`).join(',') : '-');
                    const time_string = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                    
                    return `
                    <tr class="clickable-row ${selectedMatches.has(match.id) ? 'bg-yellow-50' : 'bg-white'} hover:bg-gray-100 ${match.status === 'suspendido' ? '!bg-red-50' : ''}" data-match-id="${match.id}">
                        <td class="p-4"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''}></td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${new Date(match.match_date).toLocaleDateString('es-AR')}
                            <span class="block text-xs text-gray-400">${time_string} hs - ${match.location || 'A definir'}</span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <div class="${p1_class}">${match.player1.name}</div>
                            <div class="${p2_class}">${match.player2.name}</div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-center font-mono font-semibold">${result_string}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${match.category.name}</td>
                        <td class="px-4 py-3 text-center">
                            <button class="p-1 rounded-full hover:bg-gray-200" data-action="edit" title="Editar / Cargar Resultado">
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


// --- Lógica del Modal para editar (sin cambios) ---
function openScoreModal(match) {
    // ... (Esta función no necesita cambios)
}
async function saveMatch(matchId) {
    // ... (Esta función no necesita cambios)
}

// --- Lógica de Acciones Masivas (sin cambios) ---
function updateBulkActionBar() {
    selectedCountSpan.textContent = selectedMatches.size;
    if (selectedMatches.size > 0) {
        bulkActionBar.classList.remove('translate-y-24', 'opacity-0');
    } else {
        bulkActionBar.classList.add('translate-y-24', 'opacity-0');
    }
}
async function handleBulkDelete() {
    // ... (Esta función no necesita cambios)
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
    
    // Inicializar el cargador masivo SOLO la primera vez que se muestra
    if (!isHidden && !isMassLoaderInitialized) {
        setupMassMatchLoader({
            container: document.getElementById('table-wrapper'),
            btnAddRow: document.getElementById('btn-add-row'),
            btnSave: document.getElementById('btn-save-all'),
            allTournaments,
            allPlayers,
            tournamentPlayersMap,
            loadInitialData // Pasamos la función para que el módulo pueda recargar la lista
        });
        isMassLoaderInitialized = true;
    }
});


// ... (Mantener los listeners para filtros, clicks en la tabla y acciones masivas de tu archivo original)
[filterTournamentSelect, filterStatusSelect, searchInput].forEach(el => {
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
});

document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
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