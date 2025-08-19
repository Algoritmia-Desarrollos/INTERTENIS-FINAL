import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const formContainer = document.getElementById('form-container');
const btnShowForm = document.getElementById('btn-show-form');
const form = document.getElementById('form-tournament');
const formTitle = document.getElementById('form-title');
const tournamentIdInput = document.getElementById('tournament-id');
const tournamentNameInput = document.getElementById('tournament-name');
const categorySelect = document.getElementById('category-select');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const tournamentsList = document.getElementById('tournaments-list');
const sortSelect = document.getElementById('sort-tournaments');

let allPlayers = [];
let allCategories = [];
let allTournaments = [];
let expandedTournaments = new Set();

// --- Carga de Datos ---
async function loadInitialData() {
    const [ { data: categories }, { data: players } ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('players').select('*, team:team_id(image_url)').order('name')
    ]);
    allCategories = categories || [];
    allPlayers = players || [];
    
    categorySelect.innerHTML = '<option value="">Seleccione una categoría</option>';
    allCategories.forEach(cat => {
        categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    });
    await fetchAndRenderTournaments();
}

async function fetchAndRenderTournaments() {
    tournamentsList.innerHTML = '<p class="text-gray-400">Cargando torneos...</p>';
    const { data, error } = await supabase
        .from('tournaments')
        .select(`*, category:category_id(name), players:tournament_players(player:players(*, team:team_id(image_url)))`)
        .order('created_at', { ascending: false });
    if (error) {
        console.error("Error al cargar torneos:", error);
        tournamentsList.innerHTML = '<p class="text-red-400">No se pudieron cargar los torneos.</p>';
        return;
    }
    allTournaments = data;
    sortAndRenderTournaments();
}

// --- Renderizado y Ordenamiento ---
function sortAndRenderTournaments() {
    const sortBy = sortSelect.value;
    let sorted = [...allTournaments];
    
    switch(sortBy) {
        case 'created_at_asc': sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
        case 'start_date_asc': sorted.sort((a, b) => new Date(a.start_date) - new Date(b.start_date)); break;
        case 'name_asc': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'created_at_desc': default: sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
    }
    renderTournaments(sorted);
}

function tournamentCardTemplate(t) {
    const startDate = t.start_date ? new Date(t.start_date + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';
    const enrolledPlayers = t.players.map(p => p.player).filter(Boolean); // Filtrar nulos si los hubiera
    const isExpanded = expandedTournaments.has(t.id);
    const playersOfCategory = allPlayers.filter(p => p.category_id === t.category_id && !enrolledPlayers.some(ep => ep.id === p.id));

    return `
    <div class="border border-gray-700 rounded-lg overflow-hidden bg-[#222222]" data-tournament-card-id="${t.id}">
        <div class="flex justify-between items-center p-4">
            <div>
                <p class="font-bold text-lg text-gray-100">${t.name}</p>
                <p class="text-sm text-gray-400">${t.category.name} | Inicia: ${startDate}</p>
            </div>
            <div class="flex items-center gap-2">
                <a href="matches.html?tournamentId=${t.id}" class="btn btn-secondary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">sports_tennis</span>Ver Partidos</a>
                <a href="rankings.html?tournamentId=${t.id}" class="btn btn-secondary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">leaderboard</span>Ver Ranking</a>
                <div class="border-l border-gray-600 h-6 mx-2"></div>
                <button data-action="toggle" data-tournament-id="${t.id}" class="p-2 rounded-full hover:bg-gray-800">
                    <span class="material-icons transition-transform ${isExpanded ? 'rotate-180' : ''}">expand_more</span>
                </button>
            </div>
        </div>
        <div id="details-${t.id}" class="${isExpanded ? '' : 'hidden'} p-4 bg-black border-t border-gray-700">
            <div class="flex items-center gap-2 mb-4">
                <button data-action="edit" data-tournament='${JSON.stringify(t)}' class="btn btn-secondary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">edit</span>Editar Torneo</button>
                <button data-action="delete" data-id="${t.id}" class="btn btn-secondary !text-xs !py-1 !px-2 !text-red-400"><span class="material-icons !text-sm">delete</span>Eliminar</button>
            </div>
            <h4 class="font-semibold text-sm mb-2 text-gray-100">Jugadores Inscritos (${enrolledPlayers.length})</h4>
            <div class="space-y-2 mb-3">
                ${enrolledPlayers.length > 0 ? enrolledPlayers.map(p => `
                    <div class="flex justify-between items-center text-sm bg-gray-800 p-2 rounded-md">
                        <div class="flex items-center gap-3">
                            <img src="${p.team?.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover">
                            <span class="text-gray-200">${p.name}</span>
                        </div>
                        <button data-action="unenroll" data-player-id="${p.id}" data-tournament-id="${t.id}" class="text-gray-500 hover:text-red-400 p-1"><span class="material-icons text-sm">close</span></button>
                    </div>
                `).join('') : '<p class="text-xs text-gray-400">Aún no hay jugadores inscritos.</p>'}
            </div>
            <form class="flex gap-2" data-action="enroll-player" data-tournament-id="${t.id}">
                <select class="input-field dark-input !h-10 flex-grow">
                    <option value="">Inscribir jugador de "${t.category.name}"...</option>
                    ${playersOfCategory.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <button type="submit" class="btn btn-primary !py-2 !px-4">Inscribir</button>
            </form>
        </div>
    </div>
    `;
}

function renderTournaments(tournamentsToRender) {
    if (tournamentsToRender.length === 0) {
        tournamentsList.innerHTML = '<p class="text-center text-gray-400 py-4">No hay torneos registrados.</p>';
        return;
    }
    tournamentsList.innerHTML = tournamentsToRender.map(t => tournamentCardTemplate(t)).join('');
}

function resetForm() {
    form.reset();
    tournamentIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Torneo';
    btnSave.textContent = 'Guardar Torneo';
    formContainer.classList.add('hidden');
    btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Torneo';
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = tournamentIdInput.value;
    const name = tournamentNameInput.value.trim();
    const category_id = categorySelect.value;
    const start_date = startDateInput.value;
    const end_date = endDateInput.value || null;

    if (!name || !category_id || !start_date) {
        alert("Por favor, complete nombre, categoría y fecha de inicio.");
        return;
    }

    const tournamentData = { name, category_id, start_date, end_date };
    const { error } = id 
        ? await supabase.from('tournaments').update(tournamentData).eq('id', id)
        : await supabase.from('tournaments').insert([tournamentData]);
    
    if (error) {
        alert(`Error al guardar el torneo: ${error.message}`);
    } else {
        resetForm();
        await fetchAndRenderTournaments();
    }
}

async function updateSingleTournament(tournamentId) {
    const { data: tournament, error } = await supabase
        .from('tournaments')
        .select(`*, category:category_id(name), players:tournament_players(player:players(*, team:team_id(image_url)))`)
        .eq('id', tournamentId)
        .single();
    
    if (error) {
        console.error("Error al recargar torneo:", error);
        return;
    }

    const index = allTournaments.findIndex(t => t.id == tournamentId);
    if (index !== -1) allTournaments[index] = tournament;
    
    const cardElement = document.querySelector(`[data-tournament-card-id="${tournamentId}"]`);
    if (cardElement) {
        cardElement.outerHTML = tournamentCardTemplate(tournament);
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

form.addEventListener('submit', handleFormSubmit);
sortSelect.addEventListener('change', sortAndRenderTournaments);

btnShowForm.addEventListener('click', () => {
    formContainer.classList.toggle('hidden');
    if(formContainer.classList.contains('hidden')) {
        btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Torneo';
        resetForm();
    } else {
        btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
        form.scrollIntoView({ behavior: 'smooth' });
    }
});

btnCancel.addEventListener('click', () => {
    resetForm();
});

tournamentsList.addEventListener('click', async (e) => {
    const target = e.target;
    const header = target.closest('[data-action="toggle"]');
    const button = target.closest('button[data-action]');
    
    if (header) {
        const tournamentId = Number(header.dataset.tournamentId);
        if (expandedTournaments.has(tournamentId)) {
            expandedTournaments.delete(tournamentId);
        } else {
            expandedTournaments.add(tournamentId);
        }
        sortAndRenderTournaments();
    }

    if (button) {
        const action = button.dataset.action;
        if (action === 'edit') {
            const tournament = JSON.parse(button.dataset.tournament);
            tournamentIdInput.value = tournament.id;
            tournamentNameInput.value = tournament.name;
            categorySelect.value = tournament.category_id;
            startDateInput.value = tournament.start_date;
            endDateInput.value = tournament.end_date;
            formTitle.textContent = 'Editar Torneo';
            btnSave.textContent = 'Actualizar Torneo';
            formContainer.classList.remove('hidden');
            btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
            form.scrollIntoView({ behavior: 'smooth' });
        } else if (action === 'delete') {
            const id = button.dataset.id;
            if (confirm('¿Está seguro de que desea eliminar este torneo? Esto también eliminará todos los partidos asociados.')) {
                await supabase.from('tournament_players').delete().eq('tournament_id', id);
                await supabase.from('matches').delete().eq('tournament_id', id);
                await supabase.from('tournaments').delete().eq('id', id);
                await fetchAndRenderTournaments();
            }
        } else if (action === 'unenroll') {
            const playerId = button.dataset.playerId;
            const tournamentId = button.dataset.tournamentId;
            if (confirm('¿Quitar a este jugador del torneo?')) {
                await supabase.from('tournament_players').delete().match({ tournament_id: tournamentId, player_id: playerId });
                await updateSingleTournament(tournamentId);
            }
        }
    }
});

tournamentsList.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.action !== 'enroll-player') return;

    const tournamentId = form.dataset.tournamentId;
    const select = form.querySelector('select');
    const playerId = select.value;

    if (!playerId) return; 

    const { error } = await supabase.from('tournament_players').insert([{ tournament_id: tournamentId, player_id: playerId }]);
    if (error) {
        alert('Error al inscribir al jugador: ' + error.message);
    } else {
        await updateSingleTournament(tournamentId);
    }
});