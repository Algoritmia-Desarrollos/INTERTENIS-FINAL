// Archivo eliminado: la gestión de programas ya no está disponible.
import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

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
        matchesSelect.innerHTML = '<option disabled>Error al cargar partidos</option>';
        return;
    }
    matchesSelect.innerHTML = data.map(match => {
        const date = new Date(match.match_date + 'T00:00:00').toLocaleDateString('es-AR');
        return `<option value="${match.id}">${date} - ${match.player1.name} vs ${match.player2.name}</option>`;
    }).join('');
}

// --- Renderizado ---
async function renderPrograms() {
    programsList.innerHTML = '<p class="col-span-full text-center">Cargando programas...</p>';
    const { data, error } = await supabase.from('programs').select(`*`).order('created_at', { ascending: false });

    if (error) {
        programsList.innerHTML = '<p class="col-span-full text-red-500">No se pudieron cargar los programas.</p>';
        return;
    }
    if (data.length === 0) {
        programsList.innerHTML = '<p class="col-span-full text-center text-gray-500 py-4">No hay programas creados.</p>';
        return;
    }
    programsList.innerHTML = data.map(program => {
        const adminUrl = `${window.location.origin}/src/admin/program-admin.html?id=${program.id}`;
        const publicUrl = `${window.location.origin}/src/admin/program-public.html?id=${program.id}`;
        return `
        <div class="bg-white rounded-xl shadow-lg border p-5 flex flex-col justify-between gap-4">
            <div>
                <p class="font-bold text-lg text-gray-800">${program.title}</p>
                <p class="text-sm text-gray-500">${program.match_ids?.length || 0} partidos</p>
            </div>
            <div class="border-t pt-4 flex flex-col gap-2">
                <a href="${adminUrl}" target="_blank" class="btn btn-primary w-full !justify-start !text-sm !py-2">
                    <span class="material-icons">edit_square</span> Vista Admin
                </a>
                <div class="flex gap-2">
                    <button data-action="copy-public" data-url="${publicUrl}" class="btn btn-secondary w-full !text-sm !py-2" title="Copiar enlace público">
                        <span class="material-icons">link</span> Público
                    </button>
                    <button data-action="edit" data-program='${JSON.stringify(program)}' class="btn btn-secondary !p-2" title="Editar Programa">
                        <span class="material-icons">edit</span>
                    </button>
                    <button data-action="delete" data-id="${program.id}" class="btn btn-secondary !p-2 !text-red-600" title="Eliminar Programa">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
}

// --- Lógica del Formulario ---
function resetForm() {
    form.reset();
    programIdInput.value = '';
    formTitle.textContent = 'Crear Nuevo Programa';
    btnSave.textContent = 'Guardar Programa';
    btnCancel.classList.add('hidden');
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
    const programData = { title, slug, match_ids, confirmations: {} }; // Inicializa confirmations vacío
    const { error } = id
        ? await supabase.from('programs').update(programData).eq('id', id)
        : await supabase.from('programs').insert([programData]);

    if (error) {
        alert(`Error al guardar el programa: ${error.message}`);
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
            await supabase.from('programs').delete().eq('id', id);
            await renderPrograms();
        }
    }

    if (action === 'copy-public' || action === 'copy-admin') {
        const url = button.dataset.url;
        navigator.clipboard.writeText(url).then(() => {
            alert('¡Enlace copiado al portapapeles!');
        }).catch(err => {
            alert('Error al copiar el enlace.');
        });
    }
});