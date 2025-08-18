
import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { login } from '../common/auth.js'; // <-- RUTA CORREGIDA
import { supabase } from '../common/supabase.js';
import { uploadTeamLogo } from './upload-team-logo.js';

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
const teamColorInput = document.getElementById('team-color');

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

    // Asignar color por defecto si el equipo es uno de los conocidos
    const defaultColors = {
        lakemo: '#ffcc06',
        melabanko: '#c25b19',
        muro: '#312533',
        nunkafuera: '#33511b'
    };
    teamsList.innerHTML = data.map(team => {
        let color = team.color;
        const name = team.name ? team.name.toLowerCase() : '';
        if (!color) {
            if (name.includes('lakemo')) color = defaultColors.lakemo;
            else if (name.includes('melabanko')) color = defaultColors.melabanko;
            else if (name.includes('muro')) color = defaultColors.muro;
            else if (name.includes('nunkafuera')) color = defaultColors.nunkafuera;
            else color = '#cccccc';
        }
        return `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
            <div class="flex items-center gap-4">
                <span class="inline-block w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center" style="background:${color}">
                    <img src="${team.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover bg-gray-200">
                </span>
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
        `;
    }).join('');
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
    const color = teamColorInput.value;
    const file = teamImageInput.files[0];
    let image_url = null;
    if (!name) {
        alert("El nombre del equipo es obligatorio.");
        return;
    }
    if (file) {
        try {
            image_url = await uploadTeamLogo(file);
        } catch (err) {
            alert("Error al subir la imagen: " + err);
            return;
        }
    }
    const teamData = { name, color, image_url };
    let error;
    if (id) {
        const { error: updateError } = await supabase.from('teams').update(teamData).eq('id', id);
        error = updateError;
    } else {
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
        teamColorInput.value = team.color || '#ffcc06';
        teamImageInput.value = '';
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