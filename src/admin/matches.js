import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const formContainer = document.getElementById('form-container');
const btnShowForm = document.getElementById('btn-show-form');
const form = document.getElementById('form-match');
const tournamentSelectForm = document.getElementById('tournament-select-form');
const categoryDisplay = document.getElementById('category-display');
const player1SelectForm = document.getElementById('player1-select-form');
const player2SelectForm = document.getElementById('player2-select-form');
const matchDateForm = document.getElementById('match-date-form');
const matchTimeForm = document.getElementById('match-time-form');
const sedeSelectForm = document.getElementById('sede-select-form');
const canchaSelectForm = document.getElementById('cancha-select-form');
const btnCancelForm = document.getElementById('btn-cancel-form');
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

    populateFormSelects();
    populateFilterSelects();
    applyFiltersAndSort();
}

function populateFormSelects() {
    tournamentSelectForm.innerHTML = '<option value="">Seleccione Torneo</option>';
    allTournaments.forEach(t => tournamentSelectForm.innerHTML += `<option value="${t.id}">${t.name}</option>`);
    player1SelectForm.innerHTML = '<option value="">Seleccione un torneo primero</option>';
    player2SelectForm.innerHTML = '<option value="">Seleccione un torneo primero</option>';
}

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
                    <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Resultado</th>
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
                    
                    return `
                    <tr class="clickable-row ${selectedMatches.has(match.id) ? 'bg-yellow-50' : 'bg-white'} hover:bg-gray-100 ${match.status === 'suspendido' ? '!bg-red-50' : ''}" data-match-id="${match.id}">
                        <td class="p-4"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''}></td>
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
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-center font-mono font-semibold">${result_string}</td>
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
    
    let matchData = {
        player1_id: p1_id,
        player2_id: p2_id,
        sets: sets.length > 0 ? sets : null,
        winner_id: winner_id,
        status: 'programado'
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

    const matchData = {
        tournament_id: tournamentId,
        category_id: tournament.category.id,
        player1_id: player1SelectForm.value,
        player2_id: player2SelectForm.value,
        match_date: matchDateForm.value,
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
    alert("Función para generar reporte de partidos seleccionados en desarrollo.");
}

function handleImportExcel() {
    alert("Función para importar partidos desde Excel en desarrollo.");
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

btnShowForm.addEventListener('click', () => {
    formContainer.classList.toggle('hidden');
    btnShowForm.innerHTML = formContainer.classList.contains('hidden') 
        ? '<span class="material-icons">add</span> Crear Partido' 
        : '<span class="material-icons">close</span> Cancelar';
});

btnCancelForm.addEventListener('click', () => {
    formContainer.classList.add('hidden');
    btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Partido';
});

form.addEventListener('submit', handleCreateMatchSubmit);

tournamentSelectForm.addEventListener('change', () => {
    updatePlayerSelectsInForm();
});
player1SelectForm.addEventListener('change', () => {
    updatePlayerSelectsInForm();
});

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
document.getElementById('btn-import-excel').addEventListener('click', handleImportExcel);
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