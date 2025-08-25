import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const formContainer = document.getElementById('form-container');
const btnShowForm = document.getElementById('btn-show-form');
const form = document.getElementById('form-player');
const formTitle = document.getElementById('form-title');
const playerIdInput = document.getElementById('player-id');
const playerNameInput = document.getElementById('player-name');
const categorySelect = document.getElementById('category-select');
const teamSelect = document.getElementById('team-select');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const playersList = document.getElementById('players-list');
const sortSelect = document.getElementById('sort-players');
const filterTeamSelect = document.getElementById('filter-team');
const filterCategorySelect = document.getElementById('filter-category');
const searchInput = document.getElementById('search-player');

let allPlayers = [];
let allCategories = [];
let allTeams = [];
let allTournaments = []; // Almacenaremos los torneos para la nueva lógica

// --- Función Auxiliar para Búsqueda sin Acentos ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Carga de Datos ---
async function loadInitialData() {
    const [
        { data: categories },
        { data: teams },
        { data: players },
        { data: tournaments } // Cargamos los torneos también
    ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('players').select(`*, category:category_id(name), team:team_id(name, image_url)`).order('created_at', { ascending: false }),
        supabase.from('tournaments').select('id, name, category_id')
    ]);

    allCategories = categories || [];
    allTeams = teams || [];
    allPlayers = players || [];
    allTournaments = tournaments || []; // Guardamos los torneos

    // Poblar selects del formulario
    categorySelect.innerHTML = '<option value="">Sin categoría</option>';
    categories.forEach(cat => categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
    teamSelect.innerHTML = '<option value="">Sin equipo</option>';
    teams.forEach(team => teamSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`);
    
    // Poblar selects de los filtros
    filterCategorySelect.innerHTML = '<option value="">Todas las Categorías</option>';
    categories.forEach(cat => filterCategorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
    filterTeamSelect.innerHTML = '<option value="">Todos los Equipos</option>';
    teams.forEach(team => filterTeamSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`);

    applyFiltersAndSort();
}

// --- Renderizado y Lógica de UI (sin cambios) ---
function applyFiltersAndSort() {
    let processedPlayers = [...allPlayers];
    const teamFilter = filterTeamSelect.value;
    const categoryFilter = filterCategorySelect.value;
    const sortBy = sortSelect.value;
    const searchTerm = normalizeText(searchInput.value.toLowerCase());

    if (searchTerm) {
        processedPlayers = processedPlayers.filter(p => normalizeText(p.name.toLowerCase()).includes(searchTerm));
    }
    if (teamFilter) {
        processedPlayers = processedPlayers.filter(p => p.team_id == teamFilter);
    }
    if (categoryFilter) {
        processedPlayers = processedPlayers.filter(p => p.category_id == categoryFilter);
    }

    switch(sortBy) {
        case 'created_at_desc': processedPlayers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
        case 'created_at_asc': processedPlayers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
        case 'name_asc': default: processedPlayers.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    renderPlayers(processedPlayers);
}

function renderPlayers(playersToRender) {
    if (playersToRender.length === 0) {
        playersList.innerHTML = '<p class="text-center text-gray-400 py-8">No hay jugadores que coincidan con la búsqueda o los filtros.</p>';
        return;
    }
    playersList.innerHTML = playersToRender.map(player => `
        <div class="player-row grid grid-cols-[auto,1fr,auto] items-center gap-4 px-3 py-2 rounded-lg hover:bg-black border-b border-gray-800 last:border-b-0 transition-colors duration-200 cursor-pointer" data-player-id="${player.id}">
            <img src="${player.team?.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover bg-gray-700">
            <div>
                <p class="font-bold text-sm text-gray-100">${player.name}</p>
                <p class="text-xs text-gray-400">${player.category?.name || 'N/A'} | ${player.team?.name || 'Sin equipo'}</p>
            </div>
            <div class="flex items-center gap-1" data-no-navigate="true">
                 <button data-action="edit" data-player='${JSON.stringify(player)}' class="text-blue-400 hover:text-blue-300 p-1 rounded-full hover:bg-gray-800"><span class="material-icons text-base">edit</span></button>
                 <button data-action="delete" data-id="${player.id}" class="text-red-400 hover:text-red-300 p-1 rounded-full hover:bg-gray-800"><span class="material-icons text-base">delete</span></button>
            </div>
        </div>
    `).join('');
}

// --- Lógica de Formulario ---
function resetForm() {
    form.reset();
    playerIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Jugador';
    btnSave.textContent = 'Guardar Jugador';
    formContainer.classList.add('hidden');
    btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Jugador';
}

// --- INICIO DE LA MODIFICACIÓN: Lógica de guardado mejorada ---
async function handleFormSubmit(e) {
    e.preventDefault();
    const id = playerIdInput.value;
    const name = playerNameInput.value.trim();
    const category_id = categorySelect.value ? Number(categorySelect.value) : null;
    const team_id = teamSelect.value ? Number(teamSelect.value) : null;

    if (!name) {
        alert("El nombre del jugador es obligatorio.");
        return;
    }

    const originalPlayer = id ? allPlayers.find(p => p.id == id) : null;
    const playerData = { name, category_id, team_id };
    
    let savedPlayer, error;

    if (id) { // --- MODO EDICIÓN ---
        const { data, error: updateError } = await supabase.from('players').update(playerData).eq('id', id).select().single();
        savedPlayer = data;
        error = updateError;
    } else { // --- MODO CREACIÓN ---
        const { data, error: insertError } = await supabase.from('players').insert([playerData]).select().single();
        savedPlayer = data;
        error = insertError;
    }

    if (error) {
        alert(`Error al guardar el jugador: ${error.message}`);
        return;
    }

    // --- LÓGICA DE INSCRIPCIÓN A TORNEO ---
    const categoryChanged = originalPlayer && originalPlayer.category_id !== savedPlayer.category_id;
    const isNewPlayer = !originalPlayer;

    if ((isNewPlayer && savedPlayer.category_id) || categoryChanged) {
        const relevantTournaments = allTournaments.filter(t => t.category_id === savedPlayer.category_id);

        if (relevantTournaments.length > 0) {
            const newTournament = relevantTournaments[0];
            const message = isNewPlayer
                ? `Jugador "${savedPlayer.name}" creado con éxito.\n\n¿Quieres inscribirlo en el torneo "${newTournament.name}"?`
                : `Has cambiado la categoría del jugador.\n\n¿Quieres inscribirlo en el torneo "${newTournament.name}" y eliminarlo de sus torneos anteriores?`;

            if (confirm(message)) {
                if (categoryChanged) {
                    await supabase.from('tournament_players').delete().eq('player_id', savedPlayer.id);
                }
                await supabase.from('tournament_players').insert({ player_id: savedPlayer.id, tournament_id: newTournament.id });
                alert(`${savedPlayer.name} ha sido inscrito en ${newTournament.name}.`);
            }
        }
    }

    resetForm();
    await loadInitialData();
}
// --- FIN DE LA MODIFICACIÓN ---


// --- Event Listeners (sin cambios) ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);

btnShowForm.addEventListener('click', () => {
    formContainer.classList.toggle('hidden');
    if (formContainer.classList.contains('hidden')) {
        btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Jugador';
        resetForm();
    } else {
        btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

[sortSelect, filterTeamSelect, filterCategorySelect].forEach(el => {
    el.addEventListener('change', applyFiltersAndSort);
});
searchInput.addEventListener('input', applyFiltersAndSort);

playersList.addEventListener('click', async (e) => {
    const row = e.target.closest('.player-row');
    if (!row) return;

    if (e.target.closest('[data-no-navigate]')) {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        
        if (action === 'edit') {
            const player = JSON.parse(button.dataset.player);
            playerIdInput.value = player.id;
            playerNameInput.value = player.name;
            categorySelect.value = player.category_id || "";
            teamSelect.value = player.team_id || "";
            formTitle.textContent = 'Editar Jugador';
            btnSave.textContent = 'Actualizar Jugador';
            formContainer.classList.remove('hidden');
            btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (action === 'delete') {
            const id = button.dataset.id;
            if (confirm('¿Está seguro de que desea eliminar este jugador?')) {
                await supabase.from('tournament_players').delete().eq('player_id', id);
                const { error } = await supabase.from('players').delete().eq('id', id);

                if (error) {
                    alert('Error al eliminar el jugador: ' + error.message);
                } else {
                    await loadInitialData();
                }
            }
        }
    } else {
        const playerId = row.dataset.playerId;
        window.location.href = `player-dashboard.html?id=${playerId}`;
    }
});