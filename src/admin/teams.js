import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
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
    teamsList.innerHTML = '<p class="text-gray-400">Cargando equipos...</p>';
    
    const { data, error } = await supabase
        .from('teams')
        .select(`*`)
        .order('name', { ascending: true });

    if (error) {
        console.error("Error al cargar equipos:", error);
        teamsList.innerHTML = '<p class="text-red-400">No se pudieron cargar los equipos.</p>';
        return;
    }

    if (data.length === 0) {
        // --- ** INICIO DE LA MODIFICACIÓN: EMPTY STATE ** ---
        teamsList.innerHTML = `
            <div class="text-center py-10 px-6">
                <span class="material-icons text-6xl text-gray-500" style="font-size: 6rem;">shield</span>
                <h3 class="text-2xl font-bold text-gray-100 mt-4">No hay equipos creados</h3>
                <p class="text-gray-400 mt-2 mb-6">Crea el primer equipo para empezar a asignar jugadores.</p>
                <button id="btn-create-first-team" class="btn btn-primary">
                    <span class="material-icons">add</span>
                    Crear tu primer equipo
                </button>
            </div>
        `;
        
        // Añadir listener al nuevo botón para que haga scroll al formulario
        const createFirstBtn = document.getElementById('btn-create-first-team');
        if (createFirstBtn) {
            createFirstBtn.addEventListener('click', () => {
                form.scrollIntoView({ behavior: 'smooth' });
                teamNameInput.focus(); // Poner foco en el input
            });
        }
        // --- ** FIN DE LA MODIFICACIÓN ** ---
        return;
    }

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
            else color = '#4b5563'; // gray-600
        }
        return `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-black">
            <div class="flex items-center gap-4">
                <span class="inline-block w-10 h-10 rounded-full border-2 border-gray-700 flex items-center justify-center" style="background:${color}">
                    <img src="${team.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover bg-gray-700">
                </span>
                <div>
                    <p class="font-semibold text-gray-100">${team.name}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-team='${JSON.stringify(team)}' class="text-blue-400 hover:text-blue-300 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${team.id}" class="text-red-400 hover:text-red-300 p-1">
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
    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    const id = teamIdInput.value;
    const name = teamNameInput.value.trim();
    const color = teamColorInput.value;
    const file = teamImageInput.files[0];
    
    let image_url = null;
    if (file) {
        try {
            image_url = await uploadTeamLogo(file);
        } catch (err) {
            showToast("Error al subir la imagen: " + err, "error");
            btnSave.disabled = false;
            btnSave.textContent = id ? 'Actualizar Equipo' : 'Guardar Equipo';
            return;
        }
    }
    
    const teamData = { name, color };
    if (image_url) {
        teamData.image_url = image_url;
    }

    let error;
    if (id) {
        const { error: updateError } = await supabase.from('teams').update(teamData).eq('id', id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase.from('teams').insert([teamData]);
        error = insertError;
    }

    if (error) {
        showToast(`Error al guardar el equipo: ${error.message}`, "error");
    } else {
        showToast(id ? 'Equipo actualizado con éxito.' : 'Equipo creado con éxito.', 'success');
        resetForm();
        await renderTeams();
    }

    btnSave.disabled = false;
    btnSave.textContent = id ? 'Actualizar Equipo' : 'Guardar Equipo';
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
                showToast('Error al eliminar el equipo. Es posible que tenga jugadores asociados.', "error");
            } else {
                showToast('Equipo eliminado.', 'success');
                await renderTeams();
            }
        }
    }
});