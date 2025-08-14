import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const btnShowForm = document.getElementById('btn-show-form');
const matchesContainer = document.getElementById('matches-container');
const filterCategorySelect = document.getElementById('filter-category');
const filterTeamSelect = document.getElementById('filter-team');
const searchInput = document.getElementById('search-player');
const bulkActionBar = document.getElementById('bulk-action-bar');
const selectedCountSpan = document.getElementById('selected-count');
const modalContainer = document.getElementById('score-modal-container');

// --- Estado Global ---
let allMatches = [];
let allPlayers = [];
let allCategories = [];
let allTournaments = [];
let allTeams = [];
let selectedMatches = new Set();

// --- Función Auxiliar ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Carga de Datos ---
async function loadInitialData() {
    matchesContainer.innerHTML = '<p class="text-center p-8">Cargando datos...</p>';
    const [
        { data: categoriesData },
        { data: teamsData },
        { data: playersData },
        { data: tournamentsData },
        { data: matchesData }
    ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('players').select('*').order('name'),
        supabase.from('tournaments').select('*').order('name'),
        supabase.from('matches').select(`*, 
            category:category_id(id, name), 
            player1:player1_id(*, team:team_id(image_url)), 
            player2:player2_id(*, team:team_id(image_url)), 
            winner:winner_id(name)`)
        .order('match_date', { ascending: false })
    ]);

    allCategories = categoriesData || [];
    allTeams = teamsData || [];
    allPlayers = playersData || [];
    allTournaments = tournamentsData || [];
    allMatches = matchesData || [];

    populateFilterSelects();
    applyFiltersAndSort();
}

function populateFilterSelects() {
    filterCategorySelect.innerHTML = '<option value="">Todas las Categorías</option>';
    allCategories.forEach(c => filterCategorySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    filterTeamSelect.innerHTML = '<option value="">Todos los Equipos</option>';
    allTeams.forEach(t => filterTeamSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
}

// --- Renderizado, Filtros y Ordenamiento ---
function applyFiltersAndSort() {
    let processedMatches = [...allMatches];
    const categoryFilter = filterCategorySelect.value;
    const teamFilter = filterTeamSelect.value;
    const searchTerm = normalizeText(searchInput.value.toLowerCase());

    if (searchTerm) {
        processedMatches = processedMatches.filter(m => 
            (m.player1 && normalizeText(m.player1.name.toLowerCase()).includes(searchTerm)) || 
            (m.player2 && normalizeText(m.player2.name.toLowerCase()).includes(searchTerm))
        );
    }
    if (categoryFilter) {
        processedMatches = processedMatches.filter(m => m.category_id == categoryFilter);
    }
    if (teamFilter) {
        processedMatches = processedMatches.filter(m => (m.player1 && m.player1.team_id == teamFilter) || (m.player2 && m.player2.team_id == teamFilter));
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
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cancha</th>
                    <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Jugador A</th>
                    <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Resultado</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador B</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Categoría</th>
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
                    const result_string = sets.length > 0 ? sets.map(s => `${s.p1}-${s.p2}`).join(', ') : '-';
                    
                    return `
                    <tr class="clickable-row hover:bg-gray-100" data-match-id="${match.id}">
                        <td class="p-4"><input type="checkbox" class="match-checkbox" data-id="${match.id}" ${selectedMatches.has(match.id) ? 'checked' : ''}></td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">${new Date(match.match_date).toLocaleDateString('es-AR')}</td>
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
                    </tr>
                    `
                }).join('')}
            </tbody>
        </table>
    `;
}

// --- Lógica de Modales ---
function openModal(match = null) {
    const isEditing = !!match;
    const sets = match?.sets || [];
    const isPlayed = !!match?.winner_id;

    modalContainer.innerHTML = `
        <div id="modal-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div id="modal-content" class="bg-white rounded-xl shadow-lg w-full max-w-lg">
                <div class="p-6 border-b">
                    <h3 class="text-xl font-bold">${isEditing ? 'Editar Partido / Resultado' : 'Crear Nuevo Partido'}</h3>
                </div>
                <form id="modal-form" class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Jugador A</label>
                            <select id="player1-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>
                                ${allPlayers.map(p => `<option value="${p.id}" ${isEditing && p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Jugador B</label>
                            <select id="player2-select-modal" class="input-field mt-1" ${isPlayed ? 'disabled' : ''}>
                                ${allPlayers.map(p => `<option value="${p.id}" ${isEditing && p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Torneo</label>
                            <select id="tournament-select-modal" class="input-field mt-1" ${isEditing ? 'disabled' : ''}>
                                ${allTournaments.map(t => `<option value="${t.id}" ${isEditing && t.id === match.tournament_id ? 'selected' : ''}>${t.name}</option>`).join('')}
                            </select>
                        </div>
                         <div>
                            <label class="block text-sm font-medium text-gray-700">Categoría</label>
                            <select id="category-select-modal" class="input-field mt-1" ${isEditing ? 'disabled' : ''}>
                                ${allCategories.map(c => `<option value="${c.id}" ${isEditing && c.id === match.category_id ? 'selected' : ''}>${c.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="border-t pt-4">
                        <h4 class="text-lg font-semibold mb-2">Resultado (Games)</h4>
                        <div class="grid grid-cols-3 gap-4 items-center">
                            <span class="font-semibold">SET</span>
                            <span class="font-semibold text-center">${isEditing ? match.player1.name : 'Jugador A'}</span>
                            <span class="font-semibold text-center">${isEditing ? match.player2.name : 'Jugador B'}</span>
                        </div>
                        ${[1, 2, 3].map(i => `
                        <div class="grid grid-cols-3 gap-4 items-center">
                            <span class="text-gray-500">Set ${i}</span>
                            <input type="number" id="p1_set${i}" class="input-field text-center" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9">
                            <input type="number" id="p2_set${i}" class="input-field text-center" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9">
                        </div>
                        `).join('')}
                    </div>
                </form>
                <div class="p-4 bg-gray-50 flex justify-end gap-4 rounded-b-xl">
                    <button id="btn-cancel-modal" class="btn btn-secondary">Cancelar</button>
                    <button id="btn-save-match" class="btn btn-primary">Guardar</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-save-match').onclick = () => saveMatch(match ? match.id : null);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('modal-overlay').onclick = (e) => {
        if (e.target.id === 'modal-overlay') closeModal();
    };
}

function closeModal() {
    modalContainer.innerHTML = '';
}

async function saveMatch(matchId) {
    const isEditing = !!matchId;
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
    
    let matchData = {
        player1_id: p1_id,
        player2_id: p2_id,
        sets: sets.length > 0 ? sets : null,
        winner_id: winner_id
    };

    if (!isEditing) {
        matchData.tournament_id = document.getElementById('tournament-select-modal').value;
        matchData.category_id = document.getElementById('category-select-modal').value;
        matchData.match_date = new Date().toISOString().split('T')[0]; // O un campo de fecha en el modal
    }

    const { error } = isEditing
        ? await supabase.from('matches').update(matchData).eq('id', matchId)
        : await supabase.from('matches').insert([matchData]);

    if (error) {
        alert("Error al guardar el partido: " + error.message);
    } else {
        closeModal();
        await loadInitialData();
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

    const { data, error } = await supabase
        .from('programs')
        .insert([{ title: programName, slug: slug, match_ids: match_ids }])
        .select()
        .single();
    
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
    openModal(null);
});

[filterCategorySelect, filterTeamSelect, searchInput].forEach(el => {
    el.addEventListener('input', applyFiltersAndSort);
});

matchesContainer.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-match-id]');
    const checkbox = e.target.closest('.match-checkbox');
    const selectAllCheckbox = e.target.closest('#select-all-matches');
    
    if (selectAllCheckbox) {
        const isChecked = selectAllCheckbox.checked;
        const visibleRows = Array.from(matchesContainer.querySelectorAll('tr[data-match-id]'));
        const visibleIds = visibleRows.map(r => Number(r.dataset.matchId));

        visibleRows.forEach(r => {
            r.querySelector('.match-checkbox').checked = isChecked;
        });

        if (isChecked) {
            visibleIds.forEach(id => selectedMatches.add(id));
        } else {
            visibleIds.forEach(id => selectedMatches.delete(id));
        }
        updateBulkActionBar();
        return;
    }

    if (checkbox) {
        e.stopPropagation(); // Evitar que el clic en el checkbox propague al 'row'
        const id = Number(checkbox.dataset.id);
        checkbox.checked ? selectedMatches.add(id) : selectedMatches.delete(id);
        updateBulkActionBar();
        return;
    }
    
    if (row) {
        const matchId = Number(row.dataset.matchId);
        const matchData = allMatches.find(m => m.id === matchId);
        if (matchData) {
            openModal(matchData);
        }
    }
});

// Listeners para la barra de acciones
document.getElementById('bulk-delete').addEventListener('click', handleBulkDelete);
document.getElementById('bulk-program').addEventListener('click', handleBulkProgram);
document.getElementById('bulk-report').addEventListener('click', handleBulkReport);
document.getElementById('btn-import-excel').addEventListener('click', handleImportExcel);