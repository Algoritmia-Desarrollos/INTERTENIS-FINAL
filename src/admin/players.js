import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const formContainer = document.getElementById('form-container');
const btnShowForm = document.getElementById('btn-show-form');
const form = document.getElementById('form-player');
const formTitle = document.getElementById('form-title');
const playerIdInput = document.getElementById('player-id');
const playerNameInput = document.getElementById('player-name');
const playerDniInput = document.getElementById('player-dni'); // Nuevo
const categorySelect = document.getElementById('category-select');
const teamSelect = document.getElementById('team-select');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const playersList = document.getElementById('players-list');
const sortSelect = document.getElementById('sort-players');
const filterTeamSelect = document.getElementById('filter-team');
const filterCategorySelect = document.getElementById('filter-category');
const searchInput = document.getElementById('search-player');

// --- Campos de Login ---
const loginFieldsContainer = document.getElementById('login-fields-container');
const loginTitle = document.getElementById('login-title');
const loginHelpText = document.getElementById('login-help-text');
const playerEmailInput = document.getElementById('player-email');
const playerPasswordInput = document.getElementById('player-password');
const resetPasswordContainer = document.getElementById('reset-password-container');
const btnResetPassword = document.getElementById('btn-reset-password');
const linkedEmailSpan = document.getElementById('linked-email');

let allPlayers = []; // Combinará players + auth info
let allCategories = [];
let allTeams = [];
let allTournaments = []; 
let currentEditingPlayer = null; // Para guardar el user_id al resetear pass

// --- Función Auxiliar para Búsqueda sin Acentos ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Carga de Datos (MODIFICADA) ---
async function loadInitialData() {
    const [
        { data: categories },
        { data: teams },
        { data: playersData, error: playersError }, // Datos de 'players'
        { data: authData, error: authError },     // Datos de 'auth.users'
        { data: tournaments } 
    ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('players').select(`*, category:category_id(name), team:team_id(name, image_url)`), // Sin orden aquí
        supabase.rpc('get_all_user_emails'), // Llama a la nueva RPC
        supabase.from('tournaments').select('id, name, category_id')
    ]);

    if (playersError) throw playersError;
    if (authError) throw new Error(`Error al cargar emails (RPC): ${authError.message}`);

    allCategories = categories || [];
    allTeams = teams || [];
    allTournaments = tournaments || []; 

    // Mapear emails a user_id para un merge rápido
    const emailMap = new Map(authData.map(auth => [auth.user_id, auth.email]));

    // Combinar datos de 'players' con 'auth.users'
    allPlayers = (playersData || []).map(player => ({
        ...player,
        email: emailMap.get(player.user_id) || null // Añadir el email si existe
    }));

    // Poblar selects del formulario
    categorySelect.innerHTML = '<option value="">Sin categoría</option>';
    categories.forEach(cat => categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
    teamSelect.innerHTML = '<option value="">Sin equipo</option>';
    teams.forEach(team => teamSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`);
    
    // Poblar selects de los filtros
    filterCategorySelect.innerHTML = '<option value="">Todas las Categorías</option>';
    categories.forEach(cat => filterCategorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
    filterTeamSelect.innerHTML = '<option value="">Todos los Equipos</option>';
    teams.forEach(team => filterTeamSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`);

    applyFiltersAndSort(); // Aplicar orden y filtros
}

// --- Renderizado y Lógica de UI (MODIFICADA) ---
function applyFiltersAndSort() {
    let processedPlayers = [...allPlayers];
    const teamFilter = filterTeamSelect.value;
    const categoryFilter = filterCategorySelect.value;
    const sortBy = sortSelect.value;
    const searchTerm = normalizeText(searchInput.value.toLowerCase());

    if (searchTerm) {
        processedPlayers = processedPlayers.filter(p => 
            normalizeText(p.name.toLowerCase()).includes(searchTerm) ||
            (p.email && normalizeText(p.email.toLowerCase()).includes(searchTerm)) ||
            (p.dni && normalizeText(p.dni).includes(searchTerm))
        );
    }
    if (teamFilter) {
        processedPlayers = processedPlayers.filter(p => p.team_id == teamFilter);
    }
    if (categoryFilter) {
        processedPlayers = processedPlayers.filter(p => p.category_id == categoryFilter);
    }

    switch(sortBy) {
        case 'created_at_desc': processedPlayers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
        case 'created_at_asc': processedPlayers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
        case 'name_asc': default: processedPlayers.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    renderPlayers(processedPlayers);
}

function renderPlayers(playersToRender) {
    if (playersToRender.length === 0) {
        playersList.innerHTML = '<p class="text-center text-gray-400 py-8">No hay jugadores que coincidan con la búsqueda o los filtros.</p>';
        return;
    }
    playersList.innerHTML = playersToRender.map(player => {
        // Icono de estado de login
        const loginIcon = player.user_id
            ? `<span class="material-icons text-green-500 text-base" title="Login vinculado: ${player.email}">verified_user</span>`
            : `<span class="material-icons text-gray-600 text-base" title="Sin login">no_accounts</span>`;

        return `
        <div class="player-row grid grid-cols-[auto,1fr,auto] items-center gap-4 px-3 py-2 rounded-lg hover:bg-black border-b border-gray-800 last:border-b-0 transition-colors duration-200 cursor-pointer" data-player-id="${player.id}">
            <img src="${player.team?.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover bg-gray-700">
            
            <div>
                <p class="font-bold text-sm text-gray-100 flex items-center gap-2">
                    ${loginIcon}
                    ${player.name}
                </p>
                <p class="text-xs text-gray-400">${player.category?.name || 'N/A'} | ${player.team?.name || 'Sin equipo'}</p>
                <p class="text-xs text-gray-500">${player.email || (player.dni ? `DNI: ${player.dni}` : 'Sin datos extra')}</p>
            </div>
            
            <div class="flex items-center gap-1" data-no-navigate="true">
                 <button data-action="edit" data-player='${JSON.stringify(player)}' class="text-blue-400 hover:text-blue-300 p-1 rounded-full hover:bg-gray-800"><span class="material-icons text-base">edit</span></button>
                 <button data-action="delete" data-id="${player.id}" class="text-red-400 hover:text-red-300 p-1 rounded-full hover:bg-gray-800"><span class="material-icons text-base">delete</span></button>
            </div>
        </div>
    `}).join('');
}

// --- Lógica de Formulario (MODIFICADA) ---
function resetForm() {
    form.reset();
    playerIdInput.value = '';
    currentEditingPlayer = null;
    formTitle.textContent = 'Añadir Nuevo Jugador';
    btnSave.textContent = 'Guardar Jugador';
    formContainer.classList.add('hidden');
    btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Jugador';
    
    // Mostrar campos de login para CREAR
    loginFieldsContainer.classList.remove('hidden');
    resetPasswordContainer.classList.add('hidden');
    loginTitle.textContent = 'Datos de Login (para crear nuevo)';
    loginHelpText.textContent = '* Rellena esto para crear un nuevo jugador con su login.';
    playerEmailInput.required = true;
    playerPasswordInput.required = true;
    
    btnSave.disabled = false;
}

// --- Lógica de guardado (MODIFICADA) ---
async function handleFormSubmit(e) {
    e.preventDefault();
    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    const id = playerIdInput.value;
    const name = playerNameInput.value.trim();
    const dni = playerDniInput.value.trim() || null;
    const category_id = categorySelect.value ? Number(categorySelect.value) : null;
    const team_id = teamSelect.value ? Number(teamSelect.value) : null;

    if (!name) {
        showToast("El nombre del jugador es obligatorio.", "error");
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar Jugador';
        return;
    }

    try {
        if (id) { 
            // --- MODO EDICIÓN ---
            const { data: updatedPlayer, error } = await supabase
                .from('players')
                .update({ name, category_id, team_id, dni }) // Añadido DNI
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            
            // Verificar si hay que VINCULAR un login (solo si no tiene uno ya)
            const email = playerEmailInput.value;
            const password = playerPasswordInput.value;
            
            if (!currentEditingPlayer?.user_id && email && password) {
                // El jugador no tenía login, pero se rellenaron los campos.
                // Llamar a la Edge Function para VINCULAR.
                showToast("Actualizando perfil... vinculando login...", "info");
                const { data: linkData, error: linkError } = await supabase.functions.invoke('link-player-auth', {
                    body: { player_id: id, email, password },
                });
                if (linkError) throw new Error(`Jugador actualizado, pero error al vincular login: ${linkError.message}`);
                if (linkData.error) throw new Error(`Jugador actualizado, pero error al vincular login: ${linkData.error}`);
            }

            // Lógica de cambio de torneo (como antes)
            const originalPlayer = allPlayers.find(p => p.id == id);
            if (originalPlayer && originalPlayer.category_id !== updatedPlayer.category_id && updatedPlayer.category_id) {
                const newTournament = allTournaments.find(t => t.category_id === updatedPlayer.category_id);
                if (newTournament) {
                    if (confirm(`Has cambiado la categoría del jugador.\n\n¿Quieres inscribirlo en el torneo "${newTournament.name}" y eliminarlo de sus torneos anteriores?`)) {
                        await supabase.from('tournament_players').delete().eq('player_id', updatedPlayer.id);
                        await supabase.from('tournament_players').insert({ player_id: updatedPlayer.id, tournament_id: newTournament.id });
                    }
                }
            }
            showToast("Jugador actualizado con éxito.", "success");

        } else { 
            // --- MODO CREACIÓN: Llama a la Edge Function ---
            const email = playerEmailInput.value;
            const password = playerPasswordInput.value;

            if (!email || !password) {
                throw new Error("El email y la contraseña son obligatorios para crear un nuevo jugador.");
            }

            // Llama a la Edge Function 'create-player-user'
            const { data, error } = await supabase.functions.invoke('create-player-user', {
                body: { name, email, password, category_id, team_id, dni }, // Añadido DNI
            });

            if (error) throw new Error(error.message || "Error desde la Edge Function.");
            if (data.error) throw new Error(data.error);

            // Lógica de inscripción a torneo
            const savedPlayer = data.player;
            if (savedPlayer && savedPlayer.category_id) {
                const newTournament = allTournaments.find(t => t.category_id === savedPlayer.category_id);
                if (newTournament) {
                    if (confirm(`Jugador "${savedPlayer.name}" creado con éxito.\n\n¿Quieres inscribirlo en el torneo "${newTournament.name}"?`)) {
                        await supabase.from('tournament_players').insert({ player_id: savedPlayer.id, tournament_id: newTournament.id });
                    }
                }
            }
            showToast("Jugador y login creados con éxito.", "success");
        }

        resetForm();
        await loadInitialData(); // Recarga todo

    } catch (error) {
        console.error("Error al guardar:", error);
        showToast(error.message, "error");
        btnSave.disabled = false;
        btnSave.textContent = id ? 'Actualizar Jugador' : 'Guardar Jugador';
    }
}

// --- Lógica de Reseteo de Contraseña ---
async function handleResetPassword() {
    if (!currentEditingPlayer || !currentEditingPlayer.user_id) {
        showToast("No hay un jugador vinculado seleccionado.", "error");
        return;
    }

    const newPassword = prompt("Ingresa la NUEVA contraseña para este jugador.\n(Debe tener al menos 6 caracteres)");
    
    if (!newPassword) {
        showToast("Reseteo cancelado.", "info");
        return;
    }
    
    if (newPassword.length < 6) {
        showToast("La contraseña es muy corta. Debe tener al menos 6 caracteres.", "error");
        return;
    }
    
    btnResetPassword.disabled = true;
    btnResetPassword.textContent = 'Reseteando...';

    try {
        // Llama a la Edge Function 'admin-reset-password'
        const { data, error } = await supabase.functions.invoke('admin-reset-password', {
            body: { user_id: currentEditingPlayer.user_id, new_password: newPassword },
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);
        
        showToast(`Contraseña actualizada para ${currentEditingPlayer.email}.`, "success");

    } catch (error) {
        console.error("Error al resetear contraseña:", error);
        showToast(error.message, "error");
    } finally {
        btnResetPassword.disabled = false;
        btnResetPassword.innerHTML = '<span class="material-icons">lock_reset</span> Resetear Contraseña';
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);
btnResetPassword.addEventListener('click', handleResetPassword);

btnShowForm.addEventListener('click', () => {
    formContainer.classList.toggle('hidden');
    if (formContainer.classList.contains('hidden')) {
        btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Jugador';
        resetForm();
    } else {
        btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
        resetForm(); // Llama a resetForm para asegurar el estado de "Crear"
        formContainer.classList.remove('hidden'); // Y luego lo muestra
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

[sortSelect, filterTeamSelect, filterCategorySelect].forEach(el => {
    el.addEventListener('change', applyFiltersAndSort);
});
searchInput.addEventListener('input', applyFiltersAndSort);

playersList.addEventListener('click', async (e) => {
    const row = e.target.closest('.player-row');
    if (!row) return;

    if (e.target.closest('[data-no-navigate]')) {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        
        if (action === 'edit') {
            const player = JSON.parse(button.dataset.player);
            currentEditingPlayer = player; // Guardar jugador en estado
            
            playerIdInput.value = player.id;
            playerNameInput.value = player.name;
            playerDniInput.value = player.dni || ""; // Cargar DNI
            categorySelect.value = player.category_id || "";
            teamSelect.value = player.team_id || "";
            formTitle.textContent = 'Editar Jugador';
            btnSave.textContent = 'Actualizar Jugador';

            // --- Lógica de UI para Login ---
            if (player.user_id) {
                // YA TIENE LOGIN: Ocultar campos de creación, mostrar botón de reseteo
                loginFieldsContainer.classList.add('hidden');
                resetPasswordContainer.classList.remove('hidden');
                linkedEmailSpan.textContent = player.email || 'Email no encontrado';
                playerEmailInput.required = false;
                playerPasswordInput.required = false;
            } else {
                // NO TIENE LOGIN: Mostrar campos para VINCULAR
                loginFieldsContainer.classList.remove('hidden');
                resetPasswordContainer.classList.add('hidden');
                loginTitle.textContent = 'Vincular Nuevo Login (Opcional)';
                loginHelpText.textContent = '* Rellena email y contraseña para VINCULAR un login a este jugador.';
                playerEmailInput.required = false;
                playerPasswordInput.required = false;
            }
            playerEmailInput.value = '';
            playerPasswordInput.value = '';

            formContainer.classList.remove('hidden');
            btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } else if (action === 'delete') {
            const id = button.dataset.id;
            const playerToDelete = allPlayers.find(p => p.id == id);
            
            let confirmMessage = `¿Está seguro de que desea eliminar a ${playerToDelete?.name}?`;
            if (playerToDelete?.user_id) {
                confirmMessage += `\n\n¡ATENCIÓN! Esto también eliminará su login (${playerToDelete.email}).`;
            }
            
            if (confirm(confirmMessage)) {
                btnSave.disabled = true; // Deshabilitar botones mientras se borra
                
                try {
                    // 1. Borrar de 'tournament_players'
                    await supabase.from('tournament_players').delete().eq('player_id', id);
                    
                    // 2. Borrar de 'players'
                    const { error: playerError } = await supabase.from('players').delete().eq('id', id);
                    if (playerError) throw playerError;

                    // 3. Borrar de 'auth.users' (si existe)
                    if (playerToDelete?.user_id) {
                        const { data, error: authError } = await supabase.functions.invoke('delete-auth-user', {
                            body: { user_id: playerToDelete.user_id },
                        });
                        if (authError) throw new Error(authError.message);
                        if (data.error) throw new Error(data.error);
                    }
                    
                    showToast("Jugador eliminado con éxito.", "success");
                    await loadInitialData(); // Recargar la lista

                } catch (err) {
                    showToast(`Error al eliminar: ${err.message}`, "error");
                } finally {
                    btnSave.disabled = false; // Reactivar
                }
            }
        }
    } else {
        const playerId = row.dataset.playerId;
        window.location.href = `player-dashboard.html?id=${playerId}`;
    }
});