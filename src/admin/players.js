import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../../supabase.js'; // <-- ¡RUTA CORREGIDA!

// Proteger la página
requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const form = document.getElementById('form-player');
const formTitle = document.getElementById('form-title');
const playerIdInput = document.getElementById('player-id');
const playerNameInput = document.getElementById('player-name');
const categorySelect = document.getElementById('category-select');
const teamSelect = document.getElementById('team-select');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const playersList = document.getElementById('players-list');

// --- Carga de Datos para Selects ---

async function populateSelects() {
    const [
        { data: categories, error: catError },
        { data: teams, error: teamError }
    ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('teams').select('*').order('name')
    ]);

    if (catError) console.error("Error al cargar categorías:", catError);
    if (teamError) console.error("Error al cargar equipos:", teamError);

    categorySelect.innerHTML = '<option value="">Seleccione categoría</option>';
    categories.forEach(cat => {
        categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    });

    teamSelect.innerHTML = '<option value="">Seleccione equipo</option>';
    teams.forEach(team => {
        teamSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`;
    });
}

// --- Funciones de Renderizado ---

async function renderPlayers() {
    playersList.innerHTML = '<p>Cargando jugadores...</p>';
    
    const { data, error } = await supabase
        .from('players')
        .select(`*, category:category_id(name), team:team_id(name)`)
        .order('name', { ascending: true });

    if (error) {
        console.error("Error al cargar jugadores:", error);
        playersList.innerHTML = '<p class="text-red-500">No se pudieron cargar los jugadores.</p>';
        return;
    }

    if (data.length === 0) {
        playersList.innerHTML = '<p class="text-center text-gray-500 py-4">No hay jugadores registrados.</p>';
        return;
    }

    playersList.innerHTML = data.map(player => `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
            <div>
                <p class="font-semibold text-gray-800">${player.name}</p>
                <p class="text-sm text-gray-500">
                    Categoría: ${player.category?.name || 'N/A'} | Equipo: ${player.team?.name || 'N/A'}
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-player='${JSON.stringify(player)}' class="text-blue-600 hover:text-blue-800 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${player.id}" class="text-red-600 hover:text-red-800 p-1">
                    <span class="material-icons text-base">delete</span>
                </button>
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
    btnCancel.classList.add('hidden');
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

    let error;
    if (id) { // Modo Edición
        const { error: updateError } = await supabase.from('players').update(playerData).eq('id', id);
        error = updateError;
    } else { // Modo Creación
        const { error: insertError } = await supabase.from('players').insert([playerData]);
        error = insertError;
    }

    if (error) {
        alert(`Error al guardar el jugador: ${error.message}`);
    } else {
        resetForm();
        await renderPlayers();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await populateSelects();
    await renderPlayers();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);

playersList.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    if (action === 'edit') {
        const player = JSON.parse(button.dataset.player);
        playerIdInput.value = player.id;
        playerNameInput.value = player.name;
        categorySelect.value = player.category_id;
        teamSelect.value = player.team_id;
        
        formTitle.textContent = 'Editar Jugador';
        btnSave.textContent = 'Actualizar Jugador';
        btnCancel.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (action === 'delete') {
        const id = button.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar este jugador?')) {
            const { error } = await supabase.from('players').delete().eq('id', id);
            if (error) {
                alert('Error al eliminar el jugador. Es posible que esté asignado a un torneo o partido.');
            } else {
                await renderPlayers();
            }
        }
    }
});