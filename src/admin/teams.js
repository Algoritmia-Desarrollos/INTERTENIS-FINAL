import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { login } from '../common/auth.js'; // <-- RUTA CORREGIDA

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const form = document.getElementById('form-team');
const formTitle = document.getElementById('form-title');
const teamIdInput = document.getElementById('team-id');
const teamNameInput = document.getElementById('team-name');
const teamImageInput = document.getElementById('team-image');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const teamsList = document.getElementById('teams-list');

// --- Funciones de Renderizado ---

async function renderTeams() {
    teamsList.innerHTML = '<p>Cargando equipos...</p>';
    
    const { data, error } = await supabase
        .from('teams')
        .select(`*`)
        .order('name', { ascending: true });

    if (error) {
        console.error("Error al cargar equipos:", error);
        teamsList.innerHTML = '<p class="text-red-500">No se pudieron cargar los equipos.</p>';
        return;
    }

    if (data.length === 0) {
        teamsList.innerHTML = '<p class="text-center text-gray-500 py-4">No hay equipos registrados.</p>';
        return;
    }

    teamsList.innerHTML = data.map(team => `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
            <div class="flex items-center gap-4">
                <img src="${team.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-10 w-10 rounded-full object-cover bg-gray-200">
                <div>
                    <p class="font-semibold text-gray-800">${team.name}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-team='${JSON.stringify(team)}' class="text-blue-600 hover:text-blue-800 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${team.id}" class="text-red-600 hover:text-red-800 p-1">
                    <span class="material-icons text-base">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Lógica de Formulario ---

function resetForm() {
    form.reset();
    teamIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Equipo';
    btnSave.textContent = 'Guardar Equipo';
    btnCancel.classList.add('hidden');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = teamIdInput.value;
    const name = teamNameInput.value.trim();
    const image_url = teamImageInput.value.trim() || null;

    if (!name) {
        alert("El nombre del equipo es obligatorio.");
        return;
    }

    const teamData = { name, image_url };

    let error;
    if (id) { // Modo Edición
        const { error: updateError } = await supabase.from('teams').update(teamData).eq('id', id);
        error = updateError;
    } else { // Modo Creación
        const { error: insertError } = await supabase.from('teams').insert([teamData]);
        error = insertError;
    }

    if (error) {
        alert(`Error al guardar el equipo: ${error.message}`);
    } else {
        resetForm();
        await renderTeams();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await renderTeams();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);

teamsList.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    if (action === 'edit') {
        const team = JSON.parse(button.dataset.team);
        teamIdInput.value = team.id;
        teamNameInput.value = team.name;
        teamImageInput.value = team.image_url;
        
        formTitle.textContent = 'Editar Equipo';
        btnSave.textContent = 'Actualizar Equipo';
        btnCancel.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (action === 'delete') {
        const id = button.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar este equipo?')) {
            const { error } = await supabase.from('teams').delete().eq('id', id);
            if (error) {
                alert('Error al eliminar el equipo. Es posible que tenga jugadores asociados.');
            } else {
                await renderTeams();
            }
        }
    }
});