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

// --- Función Auxiliar para Búsqueda sin Acentos ---
function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Carga de Datos ---
async function loadInitialData() {
    const [
        { data: categories },
        { data: teams },
        { data: players }
    ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('players').select(`*, category:category_id(name), team:team_id(name, image_url)`).order('created_at', { ascending: false })
    ]);

    allCategories = categories || [];
    allTeams = teams || [];
    allPlayers = players || [];

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

// --- Renderizado, Filtros y Ordenamiento ---
function applyFiltersAndSort() {
    let processedPlayers = [...allPlayers];

    const teamFilter = filterTeamSelect.value;
    const categoryFilter = filterCategorySelect.value;
    const sortBy = sortSelect.value;
    const searchTerm = normalizeText(searchInput.value.toLowerCase());

    // Aplicar filtro de búsqueda por nombre (ignorando acentos)
    if (searchTerm) {
        processedPlayers = processedPlayers.filter(p => normalizeText(p.name.toLowerCase()).includes(searchTerm));
    }
    // Aplicar filtros de select
    if (teamFilter) {
        processedPlayers = processedPlayers.filter(p => p.team_id == teamFilter);
    }
    if (categoryFilter) {
        processedPlayers = processedPlayers.filter(p => p.category_id == categoryFilter);
    }

    // Aplicar ordenamiento
    switch(sortBy) {
        case 'created_at_desc': processedPlayers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
        case 'created_at_asc': processedPlayers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
        case 'name_asc': default: processedPlayers.sort((a, b) => a.name.localeCompare(b.name)); break;
    }

    renderPlayers(processedPlayers);
}

function renderPlayers(playersToRender) {
    if (playersToRender.length === 0) {
        playersList.innerHTML = '<p class="text-center text-gray-500 py-8">No hay jugadores que coincidan con la búsqueda o los filtros.</p>';
        return;
    }

    playersList.innerHTML = playersToRender.map(player => `
        <div class="player-row grid grid-cols-[auto,1fr,auto] items-center gap-4 px-3 py-2 rounded-lg hover:bg-gray-100 border-b last:border-b-0 transition-colors duration-200 cursor-pointer" data-player-id="${player.id}">
            <img src="${player.team?.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover bg-gray-200">
            <div>
                <p class="font-bold text-sm text-gray-800">${player.name}</p>
                <p class="text-xs text-gray-500">${player.category?.name || 'N/A'} | ${player.team?.name || 'Sin equipo'}</p>
            </div>
            <div class="flex items-center gap-1" data-no-navigate="true">
                 <button data-action="edit" data-player='${JSON.stringify(player)}' class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-100"><span class="material-icons text-base">edit</span></button>
                 <button data-action="delete" data-id="${player.id}" class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-100"><span class="material-icons text-base">delete</span></button>
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

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = playerIdInput.value;
    const name = playerNameInput.value.trim();
    const category_id = categorySelect.value || null;
    const team_id = teamSelect.value || null;

    if (!name) {
        alert("El nombre del jugador es obligatorio.");
        return;
    }
    const playerData = { name, category_id, team_id };

    const { error } = id
        ? await supabase.from('players').update(playerData).eq('id', id)
        : await supabase.from('players').insert([playerData]);
    
    if (error) {
        alert(`Error al guardar el jugador: ${error.message}`);
    } else {
        resetForm();
        await loadInitialData();
    }
}


// --- Event Listeners ---
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

// Listeners para los filtros y búsqueda
[sortSelect, filterTeamSelect, filterCategorySelect].forEach(el => {
    el.addEventListener('change', applyFiltersAndSort);
});
searchInput.addEventListener('input', applyFiltersAndSort);

// Listener principal para la lista de jugadores
playersList.addEventListener('click', async (e) => {
    const row = e.target.closest('.player-row');
    if (!row) return;

    // Si se hizo clic en los botones de acción, no navegar
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
                await supabase.from('players').delete().eq('id', id);
                await loadInitialData();
            }
        }
    } else {
        // Si se hizo clic en cualquier otra parte de la fila, navegar al dashboard
        const playerId = row.dataset.playerId;
        window.location.href = `player-dashboard.html?id=${playerId}`;
    }
});