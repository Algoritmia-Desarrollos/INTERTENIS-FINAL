import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../../supabase.js'; // <-- ¡RUTA CORREGIDA!

// Proteger la página
requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const form = document.getElementById('form-tournament');
const formTitle = document.getElementById('form-title');
const tournamentIdInput = document.getElementById('tournament-id');
const tournamentNameInput = document.getElementById('tournament-name');
const categorySelect = document.getElementById('category-select');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const tournamentsList = document.getElementById('tournaments-list');

let allCategories = [];

// --- Funciones de Renderizado ---

async function populateCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) {
        console.error("Error al cargar categorías:", error);
        categorySelect.innerHTML = '<option value="">No se pudieron cargar las categorías</option>';
        return;
    }
    allCategories = data;
    
    categorySelect.innerHTML = '<option value="">Seleccione una categoría</option>';
    allCategories.forEach(cat => {
        categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    });
}

async function renderTournaments() {
    tournamentsList.innerHTML = '<p>Cargando torneos...</p>';
    
    // Obtenemos los torneos y la categoría asociada
    const { data, error } = await supabase
        .from('tournaments')
        .select(`*, category:category_id(name)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error al cargar torneos:", error);
        tournamentsList.innerHTML = '<p class="text-red-500">No se pudieron cargar los torneos.</p>';
        return;
    }

    if (data.length === 0) {
        tournamentsList.innerHTML = '<p class="text-center text-gray-500 py-4">No hay torneos registrados.</p>';
        return;
    }

    tournamentsList.innerHTML = data.map(tournament => `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
            <div>
                <p class="font-semibold text-gray-800">${tournament.name}</p>
                <p class="text-sm text-gray-500">${tournament.category.name}</p>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-tournament='${JSON.stringify(tournament)}' class="text-blue-600 hover:text-blue-800 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${tournament.id}" class="text-red-600 hover:text-red-800 p-1">
                    <span class="material-icons text-base">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Lógica de Formulario ---

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

    if (!name || !category_id) {
        alert("Por favor, complete todos los campos.");
        return;
    }

    let error;
    if (id) { // Modo Edición
        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ name, category_id })
            .eq('id', id);
        error = updateError;
    } else { // Modo Creación
        const { error: insertError } = await supabase
            .from('tournaments')
            .insert([{ name, category_id }]);
        error = insertError;
    }

    if (error) {
        alert(`Error al guardar el torneo: ${error.message}`);
    } else {
        resetForm();
        await renderTournaments();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await populateCategories();
    await renderTournaments();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);

tournamentsList.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    if (action === 'edit') {
        const tournament = JSON.parse(button.dataset.tournament);
        tournamentIdInput.value = tournament.id;
        tournamentNameInput.value = tournament.name;
        categorySelect.value = tournament.category_id;
        
        formTitle.textContent = 'Editar Torneo';
        btnSave.textContent = 'Actualizar Torneo';
        btnCancel.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (action === 'delete') {
        const id = button.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar este torneo? Esta acción no se puede deshacer.')) {
            const { error } = await supabase.from('tournaments').delete().eq('id', id);
            if (error) {
                alert('Error al eliminar el torneo. Es posible que tenga jugadores o partidos asociados.');
            } else {
                await renderTournaments();
            }
        }
    }
});