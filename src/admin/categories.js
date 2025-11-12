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

// --- ** INICIO DE LA MODIFICACIÓN: Skeleton Loader ** ---

/**
 * Genera el HTML para el "skeleton loader" de la lista de categorías.
 */
function renderCategoriesSkeleton() {
    let skeletonHTML = '<div class="skeleton-list-container">'; // Contenedor
    
    // Generar 3 filas de esqueleto
    for (let i = 0; i < 3; i++) {
        skeletonHTML += `
            <div class="skeleton-list-item" style="padding: 1rem 0.75rem;"> <div class="skeleton-item-content" style="gap: 0.75rem;"> <div class="skeleton-loader skeleton-avatar" style="width: 1.25rem; height: 1.25rem; flex-shrink: 0;"></div> <div class="skeleton-text-container">
                        <div class="skeleton-loader skeleton-text skeleton-text-long" style="width: 60%;"></div>
                    </div>
                </div>
                <div class="skeleton-actions">
                    <div class="skeleton-loader skeleton-icon"></div>
                    <div class="skeleton-loader skeleton-icon"></div>
                </div>
            </div>
        `;
    }
    
    skeletonHTML += '</div>';
    return skeletonHTML;
}
// --- ** FIN DE LA MODIFICACIÓN ** ---


// --- Funciones de Renderizado ---

async function renderCategories() {
    // --- ** MODIFICACIÓN: Mostrar skeleton en lugar de texto ** ---
    categoriesList.innerHTML = renderCategoriesSkeleton();
    
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
        // --- (Esto lo hicimos en el paso anterior, lo mantenemos) ---
        categoriesList.innerHTML = `
            <div class="text-center py-10 px-6">
                <span class="material-icons text-6xl text-gray-500" style="font-size: 6rem;">category</span>
                <h3 class="text-2xl font-bold text-gray-100 mt-4">No hay categorías creadas</h3>
                <p class="text-gray-400 mt-2 mb-6">Puedes crear categorías como "1ra", "2da", "Equipos", etc.</p>
                <button id="btn-create-first-category" class="btn btn-primary">
                    <span class="material-icons">add</span>
                    Crear tu primera categoría
                </button>
            </div>
        `;

        const createFirstBtn = document.getElementById('btn-create-first-category');
        if (createFirstBtn) {
            createFirstBtn.addEventListener('click', () => {
                form.scrollIntoView({ behavior: 'smooth' });
                categoryNameInput.focus(); 
            });
        }
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