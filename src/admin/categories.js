import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const form = document.getElementById('form-category');
const formTitle = document.getElementById('form-title');
const categoryIdInput = document.getElementById('category-id');
const categoryNameInput = document.getElementById('category-name');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const categoriesList = document.getElementById('categories-list');
const categoryColorInput = document.getElementById('category-color');

// --- Funciones de Renderizado ---

async function renderCategories() {
    categoriesList.innerHTML = '<p class="text-gray-400">Cargando categorías...</p>';
    
    const { data, error } = await supabase
        .from('categories')
        .select(`*`)
        .order('name', { ascending: true });

    if (error) {
        console.error("Error al cargar categorías:", error);
        categoriesList.innerHTML = '<p class="text-red-500">No se pudieron cargar las categorías.</p>';
        return;
    }

    if (data.length === 0) {
        categoriesList.innerHTML = '<p class="text-center text-gray-400 py-4">No hay categorías registradas.</p>';
        return;
    }

    categoriesList.innerHTML = data.map(category => `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-black">
            <div class="flex items-center gap-3">
                <span class="inline-block w-5 h-5 rounded-full border border-gray-600" style="background:${category.color || '#e5e7eb'}"></span>
                <p class="font-semibold text-gray-100">${category.name}</p>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-category='${JSON.stringify(category)}' class="text-blue-400 hover:text-blue-300 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${category.id}" class="text-red-400 hover:text-red-300 p-1">
                    <span class="material-icons text-base">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Lógica de Formulario ---

function resetForm() {
    form.reset();
    categoryIdInput.value = '';
    if (categoryColorInput) categoryColorInput.value = '#e5e7eb';
    formTitle.textContent = 'Añadir Nueva Categoría';
    btnSave.textContent = 'Guardar Categoría';
    btnCancel.classList.add('hidden');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = categoryIdInput.value;
    const name = categoryNameInput.value.trim();
    const color = categoryColorInput ? categoryColorInput.value : '#e5e7eb';

    if (!name) {
        showToast("El nombre de la categoría es obligatorio.", "error");
        return;
    }

    let error;
    if (id) { // Modo Edición
        const { error: updateError } = await supabase.from('categories').update({ name, color }).eq('id', id);
        error = updateError;
    } else { // Modo Creación
        const { error: insertError } = await supabase.from('categories').insert([{ name, color }]);
        error = insertError;
    }

    if (error) {
        showToast(`Error al guardar la categoría: ${error.message}`, "error");
    } else {
        showToast(id ? 'Categoría actualizada.' : 'Categoría creada.', 'success');
        resetForm();
        await renderCategories();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await renderCategories();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);

categoriesList.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    if (action === 'edit') {
        const category = JSON.parse(button.dataset.category);
        categoryIdInput.value = category.id;
        categoryNameInput.value = category.name;
        if (categoryColorInput) categoryColorInput.value = category.color || '#e5e7eb';
        formTitle.textContent = 'Editar Categoría';
        btnSave.textContent = 'Actualizar Categoría';
        btnCancel.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (action === 'delete') {
        const id = button.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar esta categoría?')) {
            const { error } = await supabase.from('categories').delete().eq('id', id);
            if (error) {
                showToast('Error al eliminar. Es posible que la categoría esté en uso.', 'error');
            } else {
                showToast('Categoría eliminada.', 'success');
                await renderCategories();
            }
        }
    }
});