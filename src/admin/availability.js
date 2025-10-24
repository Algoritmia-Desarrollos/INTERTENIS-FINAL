import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';

requireRole('admin');

// --- CONSTANTES ---
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_CODES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const TIME_SLOTS = ['mañana', 'tarde']; // Solo Mañana y Tarde
const TIME_SLOT_CODES = ['M', 'T'];     // Solo M y T
const DEFAULT_ZONE = 'Ambas'; // Define la zona por defecto aquí

// --- ELEMENTOS DEL DOM ---
const header = document.getElementById('header');
const categoryFilter = document.getElementById('category-filter');
const tableContainer = document.getElementById('availability-table-container');
const loadingIndicator = document.getElementById('loading-indicator');
const btnApplyAvailability = document.getElementById('btn-apply-availability');
const btnClearAvailability = document.getElementById('btn-clear-availability');
const btnSaveAll = document.getElementById('btn-save-all');
// Variable para los checkboxes de selección de horario (se asignará después de renderizar)
let timeSelectCheckboxes;
const btnPrevWeek = document.getElementById('btn-prev-week');
const btnNextWeek = document.getElementById('btn-next-week');
const btnCurrentWeek = document.getElementById('btn-current-week');
const currentWeekDisplay = document.getElementById('current-week-display');


// --- ESTADO ---
let allPlayers = [];
let allCategories = [];
let allAvailability = []; // { player_id, day_of_week, time_slot, zone }
let initialAvailability = new Set(); // Set de "player_id-day-slot-zone"
let displayedPlayers = [];
let selectedPlayerIds = new Set();
let currentWeekStartDate = getStartOfWeek(new Date());

// --- FUNCIONES ---

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDateDDMM(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}`;
}

async function loadInitialData() {
    loadingIndicator.textContent = 'Cargando jugadores, categorías y disponibilidad...';
    tableContainer.innerHTML = '';
    loadingIndicator.classList.remove('hidden');
    try {
        const [
            { data: playersData, error: playersError },
            { data: categoriesData, error: categoriesError },
            { data: availabilityData, error: availabilityError }
        ] = await Promise.all([
            supabase.from('players').select('id, name, category_id').order('name'),
            supabase.from('categories').select('id, name').order('name'),
            supabase.from('player_availability').select('player_id, day_of_week, time_slot, zone')
        ]);

        if (playersError) throw playersError;
        if (categoriesError) throw categoriesError;
        if (availabilityError) throw availabilityError;

        allPlayers = playersData || [];
        allCategories = categoriesData || [];
        allAvailability = availabilityData || [];

        categoryFilter.innerHTML = '<option value="all">Todas las Categorías</option>';
        allCategories.forEach(cat => {
            // Ordenar numéricamente si es posible
            allCategories.sort((a, b) => {
                const numA = parseInt(a.name.match(/\d+/)?.[0] || Infinity);
                const numB = parseInt(b.name.match(/\d+/)?.[0] || Infinity);
                if (numA !== Infinity && numB !== Infinity) {
                    return numA - numB;
                }
                return a.name.localeCompare(b.name); // Fallback alfabético
            });
            categoryFilter.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });


        initialAvailability.clear();
        allAvailability.forEach(a => initialAvailability.add(`${a.player_id}-${a.day_of_week}-${a.time_slot}-${a.zone}`));

        displayWeek(currentWeekStartDate);

    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar datos iniciales", "error");
        loadingIndicator.textContent = 'Error al cargar datos.';
    }
}

function displayWeek(startDate) {
    currentWeekStartDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;
    filterAndRenderTable();
}

function goToPreviousWeek() {
    const prevWeek = new Date(currentWeekStartDate);
    prevWeek.setDate(prevWeek.getDate() - 7);
    displayWeek(prevWeek);
}

function goToNextWeek() {
    const nextWeek = new Date(currentWeekStartDate);
    nextWeek.setDate(nextWeek.getDate() + 7);
    displayWeek(nextWeek);
}

function goToCurrentWeek() {
    displayWeek(getStartOfWeek(new Date()));
}

function filterAndRenderTable() {
    const selectedCategoryId = categoryFilter.value;
    displayedPlayers = selectedCategoryId === 'all'
        ? allPlayers
        : allPlayers.filter(p => p.category_id == selectedCategoryId);
    renderAvailabilityTable();
    selectedPlayerIds.clear();
    updateSelectedPlayerVisuals();
}

function renderAvailabilityTable() {
    if (displayedPlayers.length === 0) {
        tableContainer.innerHTML = '<p class="text-center text-gray-400 py-16">No hay jugadores en esta categoría.</p>';
        loadingIndicator.classList.add('hidden');
        return;
    }

    let tableHTML = '<table class="availability-table">';

    // Encabezados
    tableHTML += '<thead>';
    // Fila 1: Días y Fechas
    tableHTML += '<tr>';
    tableHTML += '<th class="player-name-cell !bg-gray-900"><input type="checkbox" id="select-all-players" title="Seleccionar Todos"> Jugador</th>';
    const datesOfWeek = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStartDate);
        date.setDate(currentWeekStartDate.getDate() + i);
        datesOfWeek.push(date);
    }
    datesOfWeek.forEach(date => {
        const dayCode = DAY_CODES[date.getDay()];
        tableHTML += `<th colspan="2" class="day-header">${dayCode} ${formatDateDDMM(date)}</th>`; // Colspan 2
    });
    tableHTML += '</tr>';

    // Fila 2: M / T
    tableHTML += '<tr>';
    tableHTML += '<th class="player-name-cell !bg-gray-900"></th>'; // Celda vacía esquina
    datesOfWeek.forEach(() => {
        TIME_SLOT_CODES.forEach(code => tableHTML += `<th class="slot-header">${code}</th>`); // M, T
    });
    tableHTML += '</tr>';
    tableHTML += '</thead>';

    // Cuerpo
    tableHTML += '<tbody>';
    displayedPlayers.forEach(player => {
        tableHTML += `<tr class="player-row" data-player-id="${player.id}">`;
        tableHTML += `<td class="player-name-cell">
                        <input type="checkbox" class="player-select-cb mr-2" data-player-id="${player.id}">
                        ${player.name}
                      </td>`;
        datesOfWeek.forEach(date => {
            const dayOfWeek = date.getDay();
            TIME_SLOTS.forEach(slot => { // Itera solo sobre 'mañana', 'tarde'
                const isAvailable = isPlayerAvailable(player.id, dayOfWeek, slot);
                tableHTML += `<td class="slot-cell ${isAvailable ? 'available' : ''}" data-player-id="${player.id}" data-day="${dayOfWeek}" data-slot="${slot}"></td>`;
            });
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    tableContainer.innerHTML = tableHTML;
    loadingIndicator.classList.add('hidden');

    // Re-seleccionar los checkboxes de horario del panel superior
    timeSelectCheckboxes = document.querySelectorAll('.time-select-cb'); // Actualiza referencia global

    updateSelectedPlayerVisuals();
}


function isPlayerAvailable(playerId, dayOfWeek, timeSlot) {
    return allAvailability.some(a => a.player_id == playerId && a.day_of_week == dayOfWeek && a.time_slot === timeSlot);
}

function handleCellClick(event) {
    const cell = event.target.closest('.slot-cell');
    if (!cell) return;
    const playerId = cell.dataset.playerId;
    const day = parseInt(cell.dataset.day);
    const slot = cell.dataset.slot;
    const existingEntries = allAvailability.filter(a => a.player_id == playerId && a.day_of_week == day && a.time_slot === slot);

    if (existingEntries.length > 0) {
        allAvailability = allAvailability.filter(a => !(a.player_id == playerId && a.day_of_week == day && a.time_slot === slot));
        cell.classList.remove('available');
    } else {
        allAvailability.push({ player_id: parseInt(playerId), day_of_week: day, time_slot: slot, zone: DEFAULT_ZONE });
        cell.classList.add('available');
    }
}

function getSelectedTimeSlots() {
    const slots = [];
     // Asegurarse de usar la referencia actualizada
    if (!timeSelectCheckboxes) {
        timeSelectCheckboxes = document.querySelectorAll('.time-select-cb');
    }
    timeSelectCheckboxes.forEach(cb => {
        if (cb.checked && (cb.dataset.slot === 'mañana' || cb.dataset.slot === 'tarde')) {
            slots.push({ day: parseInt(cb.dataset.day), slot: cb.dataset.slot });
        }
    });
    return slots;
}

function applyMassAvailability(makeAvailable) {
    const selectedPlayers = Array.from(selectedPlayerIds);
    const selectedSlots = getSelectedTimeSlots();
    if (selectedPlayers.length === 0 || selectedSlots.length === 0) {
        showToast("Selecciona jugadores y horarios (Mañana/Tarde) para aplicar la acción masiva.", "error");
        return;
    }

    selectedPlayers.forEach(playerId => {
        selectedSlots.forEach(time => {
            const day = time.day;
            const slot = time.slot;
            const cell = tableContainer.querySelector(`.slot-cell[data-player-id="${playerId}"][data-day="${day}"][data-slot="${slot}"]`);
            const existingIndices = allAvailability
                .map((a, index) => (a.player_id == playerId && a.day_of_week == day && a.time_slot === slot) ? index : -1)
                .filter(index => index !== -1);

            if (makeAvailable) {
                if (existingIndices.length === 0) {
                    allAvailability.push({ player_id: parseInt(playerId), day_of_week: day, time_slot: slot, zone: DEFAULT_ZONE });
                }
                if (cell) cell.classList.add('available');
            } else {
                if (existingIndices.length > 0) {
                    for (let i = existingIndices.length - 1; i >= 0; i--) {
                        allAvailability.splice(existingIndices[i], 1);
                    }
                }
                if (cell) cell.classList.remove('available');
            }
        });
    });
    timeSelectCheckboxes.forEach(cb => cb.checked = false);
}

async function saveAllChanges() {
    btnSaveAll.disabled = true;
    btnSaveAll.innerHTML = '<div class="spinner inline-block mr-2"></div> Guardando...';

    const currentAvailabilitySet = new Set();
    allAvailability.forEach(a => currentAvailabilitySet.add(`${a.player_id}-${a.day_of_week}-${a.time_slot}-${a.zone}`));

    const toInsertMap = new Map();
    const toDeleteMap = new Map();

    currentAvailabilitySet.forEach(key => {
        if (!initialAvailability.has(key)) {
            const [playerId, dayOfWeek, timeSlot, zone] = key.split('-');
             if (!toInsertMap.has(key)) {
                 if (timeSlot === 'mañana' || timeSlot === 'tarde') {
                    toInsertMap.set(key, { player_id: parseInt(playerId), day_of_week: parseInt(dayOfWeek), time_slot: timeSlot, zone: zone });
                 }
             }
        }
    });

    initialAvailability.forEach(key => {
        if (!currentAvailabilitySet.has(key)) {
            const [playerId, dayOfWeek, timeSlot, zone] = key.split('-');
            if (!toDeleteMap.has(key)) {
                 if (timeSlot === 'mañana' || timeSlot === 'tarde') {
                    toDeleteMap.set(key, { player_id: parseInt(playerId), day_of_week: parseInt(dayOfWeek), time_slot: timeSlot, zone: zone });
                 }
            }
        }
    });

     const playersToUpdate = new Set([...Array.from(toInsertMap.values()).map(i => i.player_id), ...Array.from(toDeleteMap.values()).map(d => d.player_id)]);

    try {
        if (playersToUpdate.size > 0) {
             const playerIdsArray = Array.from(playersToUpdate);
             const { error: deleteError } = await supabase
                .from('player_availability')
                .delete()
                .in('player_id', playerIdsArray);
             if (deleteError) throw deleteError;

            const currentDataToInsert = allAvailability
                .filter(a => playersToUpdate.has(a.player_id))
                .filter(a => a.time_slot === 'mañana' || a.time_slot === 'tarde');

            if (currentDataToInsert.length > 0) {
                 const { error: insertError } = await supabase
                    .from('player_availability')
                    .insert(currentDataToInsert.map(a => ({
                        player_id: a.player_id,
                        day_of_week: a.day_of_week,
                        time_slot: a.time_slot,
                        zone: a.zone || DEFAULT_ZONE
                    })));
                 if (insertError) throw insertError;
             }
         }

        showToast(`Cambios guardados para ${playersToUpdate.size} jugadores.`, "success");
        initialAvailability.clear();
        allAvailability.forEach(a => initialAvailability.add(`${a.player_id}-${a.day_of_week}-${a.time_slot}-${a.zone}`));


    } catch (error) {
        console.error("Error saving changes:", error);
        showToast("Error al guardar cambios: " + error.message, "error");
        await loadInitialData();
    } finally {
        btnSaveAll.disabled = false;
        btnSaveAll.innerHTML = '<span class="material-icons text-base">save</span> Guardar Cambios';
    }
}

function handlePlayerSelection(event) {
    const checkbox = event.target;
    const playerId = checkbox.dataset.playerId;
    if (checkbox.checked) { selectedPlayerIds.add(playerId); }
    else { selectedPlayerIds.delete(playerId); }
    updateSelectedPlayerVisuals();
}
function handleSelectAllPlayers(event) {
    const isChecked = event.target.checked;
    const playerCheckboxes = tableContainer.querySelectorAll('.player-select-cb');
    selectedPlayerIds.clear();
    if (isChecked) {
        playerCheckboxes.forEach(cb => { cb.checked = true; selectedPlayerIds.add(cb.dataset.playerId); });
    } else {
         playerCheckboxes.forEach(cb => { cb.checked = false; });
    }
    updateSelectedPlayerVisuals();
}
function updateSelectedPlayerVisuals() {
     const rows = tableContainer.querySelectorAll('.player-row');
    rows.forEach(row => {
        const playerId = row.dataset.playerId;
        const checkbox = row.querySelector('.player-select-cb');
        if (selectedPlayerIds.has(playerId)) {
            row.style.backgroundColor = '#4b5563'; if(checkbox) checkbox.checked = true;
        } else {
            row.style.backgroundColor = ''; if(checkbox) checkbox.checked = false;
        }
    });
     const selectAllCheckbox = document.getElementById('select-all-players');
     if (selectAllCheckbox) {
         const displayedPlayerIds = displayedPlayers.map(p => String(p.id));
         const numDisplayed = displayedPlayerIds.length;
         const numSelectedDisplayed = displayedPlayerIds.filter(id => selectedPlayerIds.has(id)).length;
         if (numDisplayed === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; }
         else if (numSelectedDisplayed === numDisplayed) { selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false; }
         else if (numSelectedDisplayed > 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true; }
         else { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; }
     }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    header.innerHTML = renderHeader();
    loadInitialData();
});
categoryFilter.addEventListener('change', filterAndRenderTable);
btnPrevWeek.addEventListener('click', goToPreviousWeek);
btnNextWeek.addEventListener('click', goToNextWeek);
btnCurrentWeek.addEventListener('click', goToCurrentWeek);

tableContainer.addEventListener('click', (event) => {
    const target = event.target;

    // Clic en la celda del nombre del jugador
    const playerNameCell = target.closest('.player-name-cell');
    if (playerNameCell && playerNameCell.tagName === 'TD') {
        const checkbox = playerNameCell.querySelector('.player-select-cb');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            // Disparar evento change
            const changeEvent = new Event('change', { bubbles: true });
            checkbox.dispatchEvent(changeEvent);
            // O llamar directamente a handlePlayerSelection
            // handlePlayerSelection({ target: checkbox });
        }
        return;
    }

    // Clic en celda de slot
    if (target.classList.contains('slot-cell')) {
        handleCellClick(event);
    }
    // Clic en checkbox de jugador (ya cubierto por el clic en celda o directo)
    else if (target.classList.contains('player-select-cb')) {
        handlePlayerSelection({ target });
    }
    // Clic en checkbox "Seleccionar Todos"
    else if (target.id === 'select-all-players') {
         handleSelectAllPlayers(event);
    }
});


btnApplyAvailability.addEventListener('click', () => applyMassAvailability(true));
btnClearAvailability.addEventListener('click', () => applyMassAvailability(false));
btnSaveAll.addEventListener('click', saveAllChanges);