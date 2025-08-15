import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js'; // <-- ¡RUTA CORREGIDA!

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const form = document.getElementById('form-program');
const formTitle = document.getElementById('form-title');
const programIdInput = document.getElementById('program-id');
const programTitleInput = document.getElementById('program-title');
const matchesSelect = document.getElementById('matches-select');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const programsList = document.getElementById('programs-list');

// --- Carga de Datos ---

async function populateMatches() {
    const { data, error } = await supabase
        .from('matches')
        .select(`*, player1:player1_id(name), player2:player2_id(name)`)
        .order('match_date', { ascending: true });

    if (error) {
        console.error("Error al cargar partidos:", error);
        matchesSelect.innerHTML = '<option disabled>Error al cargar</option>';
        return;
    }

    matchesSelect.innerHTML = '';
    data.forEach(match => {
        const date = new Date(match.match_date).toLocaleDateString('es-AR');
        matchesSelect.innerHTML += `<option value="${match.id}">${date} - ${match.player1.name} vs ${match.player2.name}</option>`;
    });
}

// --- Renderizado ---

async function renderPrograms() {
    programsList.innerHTML = '<p>Cargando programas...</p>';
    
    const { data, error } = await supabase
        .from('programs')
        .select(`*`)
        .order('created_at', { ascending: false });

    if (error) {
        programsList.innerHTML = '<p class="text-red-500">No se pudieron cargar los programas.</p>';
        return;
    }

    if (data.length === 0) {
        programsList.innerHTML = '<p class="text-center text-gray-500 py-4">No hay programas creados.</p>';
        return;
    }

    programsList.innerHTML = data.map(program => `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
            <div>
                <p class="font-semibold text-gray-800">${program.title}</p>
                <p class="text-sm text-gray-500">${program.match_ids?.length || 0} partidos incluidos</p>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-program='${JSON.stringify(program)}' class="text-blue-600 hover:text-blue-800 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${program.id}" class="text-red-600 hover:text-red-800 p-1">
                    <span class="material-icons text-base">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Formulario ---

function resetForm() {
    form.reset();
    programIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Programa';
    btnSave.textContent = 'Guardar Programa';
    btnCancel.classList.add('hidden');
    // Deseleccionar todas las opciones en el select múltiple
    Array.from(matchesSelect.options).forEach(option => option.selected = false);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = programIdInput.value;
    const title = programTitleInput.value.trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const match_ids = Array.from(matchesSelect.selectedOptions).map(option => option.value);

    if (!title || match_ids.length === 0) {
        alert("El título y al menos un partido son obligatorios.");
        return;
    }

    const programData = { title, slug, match_ids };

    let error;
    if (id) {
        const { error: updateError } = await supabase.from('programs').update(programData).eq('id', id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase.from('programs').insert([programData]);
        error = insertError;
    }

    if (error) {
        if (error.message && error.message.includes('duplicate key value') && error.message.includes('programs_slug_key')) {
            alert('Ese nombre de programa ya existe, prueba con uno nuevo.');
        } else {
            alert(`Error al guardar el programa: ${error.message}`);
        }
    } else {
        resetForm();
        await renderPrograms();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await populateMatches();
    await renderPrograms();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);

programsList.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    if (action === 'edit') {
        const program = JSON.parse(button.dataset.program);
        programIdInput.value = program.id;
        programTitleInput.value = program.title;
        
        // Seleccionar los partidos correspondientes
        Array.from(matchesSelect.options).forEach(option => {
            option.selected = program.match_ids?.includes(Number(option.value));
        });
        
        formTitle.textContent = 'Editar Programa';
        btnSave.textContent = 'Actualizar Programa';
        btnCancel.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (action === 'delete') {
        const id = button.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar este programa?')) {
            const { error } = await supabase.from('programs').delete().eq('id', id);
            if (error) {
                alert('Error al eliminar el programa.');
            } else {
                await renderPrograms();
            }
        }
    }
});