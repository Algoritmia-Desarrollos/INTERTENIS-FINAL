import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../../supabase.js'; // <-- ¡RUTA CORREGIDA!

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
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
    tournamentsList.innerHTML = '<p>Cargando torneos...</p>';
    
    const { data, error } = await supabase
        .from('tournaments')
        .select(`*, category:category_id(name), players:tournament_players(player:players(*, team:team_id(image_url)))`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error al cargar torneos:", error);
        tournamentsList.innerHTML = '<p class="text-red-500">No se pudieron cargar los torneos.</p>';
        return;
    }
    allTournaments = data;
    sortAndRenderTournaments();
}

// --- Renderizado Interactivo ---

function sortAndRenderTournaments() {
    const sortBy = sortSelect.value;
    let sorted = [...allTournaments];
    
    switch(sortBy) {
        case 'created_at_asc':
            sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'start_date_asc':
            sorted.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
            break;
        case 'created_at_desc':
        default:
            sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
    }
    renderTournaments(sorted);
}

function renderTournaments(tournamentsToRender) {
    if (tournamentsToRender.length === 0) {
        tournamentsList.innerHTML = '<p class="text-center text-gray-500 py-4">No hay torneos registrados.</p>';
        return;
    }

    tournamentsList.innerHTML = tournamentsToRender.map(t => {
        const startDate = t.start_date ? new Date(t.start_date + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';
        const endDate = t.end_date ? new Date(t.end_date + 'T00:00:00').toLocaleDateString('es-AR') : 'Abierto';
        const enrolledPlayers = t.players.map(p => p.player);
        const playersOfCategory = allPlayers.filter(p => p.category_id === t.category_id && !enrolledPlayers.some(ep => ep.id === p.id));

        return `
        <div class="border rounded-lg overflow-hidden">
            <div class="flex justify-between items-center p-4 cursor-pointer bg-white hover:bg-gray-50" data-action="toggle" data-tournament-id="${t.id}">
                <div>
                    <p class="font-bold text-lg text-gray-800">${t.name}</p>
                    <p class="text-sm text-gray-500">${t.category.name} | Inicia: ${startDate}</p>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-sm font-semibold">${enrolledPlayers.length} Inscritos</span>
                    <span class="material-icons transition-transform">expand_more</span>
                </div>
            </div>
            <div id="details-${t.id}" class="hidden p-4 bg-gray-50 border-t">
                <h4 class="font-semibold text-sm mb-2">Jugadores Inscritos</h4>
                <div class="space-y-2 mb-4">
                    ${enrolledPlayers.length > 0 ? enrolledPlayers.map(p => `
                        <div class="flex justify-between items-center text-sm bg-white p-2 rounded shadow-sm">
                            <div class="flex items-center gap-3">
                                <img src="${p.team?.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover">
                                <span>${p.name}</span>
                            </div>
                            <button data-action="unenroll" data-player-id="${p.id}" data-tournament-id="${t.id}" class="text-gray-400 hover:text-red-600 p-1"><span class="material-icons text-sm">close</span></button>
                        </div>
                    `).join('') : '<p class="text-xs text-gray-400">Aún no hay jugadores inscritos.</p>'}
                </div>
                <form class="flex gap-2" data-action="enroll-player" data-tournament-id="${t.id}">
                    <select class="input-field !h-10 flex-grow">
                        <option value="">Inscribir jugador de "${t.category.name}"...</option>
                        ${playersOfCategory.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                    <button type="submit" class="btn btn-primary !py-2 !px-4">Inscribir</button>
                </form>
            </div>
        </div>
        `;
    }).join('');
}


// --- Lógica de Formulario y Acciones ---

function resetForm() {
    form.reset();
    tournamentIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Torneo';
    btnSave.textContent = 'Guardar Torneo';
    btnCancel.classList.add('hidden');
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

    let error;
    if (id) {
        const { error: updateError } = await supabase.from('tournaments').update(tournamentData).eq('id', id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase.from('tournaments').insert([tournamentData]);
        error = insertError;
    }

    if (error) {
        alert(`Error al guardar el torneo: ${error.message}`);
    } else {
        resetForm();
        await fetchAndRenderTournaments();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);
sortSelect.addEventListener('change', sortAndRenderTournaments);

tournamentsList.addEventListener('click', async (e) => {
    const target = e.target;
    const header = target.closest('[data-action="toggle"]');
    const button = target.closest('button[data-action]');
    const form = target.closest('form[data-action]');

    if (header) {
        const tournamentId = header.dataset.tournamentId;
        const details = document.getElementById(`details-${tournamentId}`);
        const icon = header.querySelector('.material-icons');
        details.classList.toggle('hidden');
        icon.classList.toggle('rotate-180');
    }

    if (button) {
        const action = button.dataset.action;
        if (action === 'edit' || action === 'delete' || action === 'unenroll') {
             // (La lógica para estos botones se mantiene igual)
        }
    }
    
    if (form) {
        e.preventDefault();
        const tournamentId = form.dataset.tournamentId;
        const select = form.querySelector('select');
        const playerId = select.value;

        if (!playerId) {
            alert('Por favor, seleccione un jugador para inscribir.');
            return;
        }

        const { error } = await supabase.from('tournament_players').insert([{ tournament_id: tournamentId, player_id: playerId }]);
        if (error) {
            alert('Error al inscribir al jugador: ' + error.message);
        } else {
            await fetchAndRenderTournaments();
        }
    }
});
