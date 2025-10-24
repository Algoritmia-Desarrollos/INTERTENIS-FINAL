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
// Ya no se necesita referencia global a timeSelectCheckboxes
const btnPrevWeek = document.getElementById('btn-prev-week');
const btnNextWeek = document.getElementById('btn-next-week');
const btnCurrentWeek = document.getElementById('btn-current-week');
const currentWeekDisplay = document.getElementById('current-week-display');


// --- ESTADO ---
let allPlayers = [];
let allCategories = [];
// Guarda disponibilidad por fecha específica
let availabilityForCurrentWeek = []; // { player_id, available_date (YYYY-MM-DD), time_slot, zone }
let initialAvailabilityForCurrentWeek = new Set(); // Set de "player_id-YYYY-MM-DD-slot-zone"
let displayedPlayers = [];
let selectedPlayerIds = new Set();
let currentWeekStartDate = getStartOfWeek(new Date()); // Lunes de la semana actual

// --- FUNCIONES ---

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes como inicio de semana
  return new Date(d.setDate(diff));
}

// Formato YYYY-MM-DD para Supabase y claves
function formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateDDMM(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}`;
}

// Carga solo la disponibilidad de la semana actual
async function loadAvailabilityForWeek(startDate) {
    loadingIndicator.textContent = 'Cargando disponibilidad de la semana...';
    loadingIndicator.classList.remove('hidden');
    tableContainer.innerHTML = ''; // Limpiar tabla mientras carga

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // Domingo de esa semana

    const startStr = formatDateYYYYMMDD(startDate);
    const endStr = formatDateYYYYMMDD(endDate);

    try {
        // Filtrar por el rango de fechas de la semana actual
        const { data, error } = await supabase
            .from('player_availability')
            .select('player_id, available_date, time_slot, zone')
            .gte('available_date', startStr)
            .lte('available_date', endStr);

        if (error) throw error;

        // Guardar solo la disponibilidad de ESTA semana
        availabilityForCurrentWeek = (data || []).map(item => ({
            ...item,
            // Asegurarse que la fecha esté en formato YYYY-MM-DD
            available_date: item.available_date.split('T')[0]
        }));

        // Actualizar el estado inicial para comparar cambios DENTRO de esta semana
        initialAvailabilityForCurrentWeek.clear();
        availabilityForCurrentWeek.forEach(a =>
            initialAvailabilityForCurrentWeek.add(`${a.player_id}-${a.available_date}-${a.time_slot}-${a.zone}`)
        );

        // Ahora renderizar la tabla con los datos cargados para la semana
        filterAndRenderTable(); // Llama a renderAvailabilityTable internamente

    } catch (error) {
        console.error("Error loading availability for week:", error);
        showToast("Error al cargar disponibilidad de la semana", "error");
        tableContainer.innerHTML = '<p class="text-center text-red-500 py-16">Error al cargar datos de disponibilidad.</p>';
        loadingIndicator.classList.add('hidden'); // Ocultar indicador si hay error
    }
}


async function loadInitialData() {
    loadingIndicator.textContent = 'Cargando jugadores y categorías...';
    try {
        const [
            { data: playersData, error: playersError },
            { data: categoriesData, error: categoriesError }
        ] = await Promise.all([
            supabase.from('players').select('id, name, category_id').order('name'),
            supabase.from('categories').select('id, name').order('name')
        ]);

        if (playersError) throw playersError;
        if (categoriesError) throw categoriesError;

        allPlayers = playersData || [];
        allCategories = categoriesData || [];

        // --- Ordenar categorías numéricamente ---
        const getCategoryNumber = (name) => {
            if (!name) return Infinity; const match = name.match(/^(\d+)/); return match ? parseInt(match[1], 10) : Infinity;
        };
        allCategories.sort((a, b) => {
            const numA = getCategoryNumber(a.name); const numB = getCategoryNumber(b.name);
            if (numA !== Infinity && numB !== Infinity) { if (numA !== numB) { return numA - numB; } return a.name.localeCompare(b.name); }
            if (numA !== Infinity) return -1; if (numB !== Infinity) return 1; return a.name.localeCompare(b.name);
        });
        categoryFilter.innerHTML = '<option value="all">Todas las Categorías</option>';
        allCategories.forEach(cat => categoryFilter.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
        // --- Fin Ordenar ---

        await displayWeek(currentWeekStartDate); // Carga dispo y renderiza

    } catch (error) {
        console.error("Error loading players/categories:", error);
        showToast("Error al cargar jugadores o categorías", "error");
        loadingIndicator.textContent = 'Error al cargar datos.';
    }
}


async function displayWeek(startDate) {
    currentWeekStartDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;
    await loadAvailabilityForWeek(currentWeekStartDate); // Carga antes de renderizar
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
    renderAvailabilityTable(); // Renderiza con datos ya cargados para la semana
    // No limpiar selectedPlayerIds para persistir selección si se desea
    updateSelectedPlayerVisuals(); // Asegura visualización correcta
}

// Renderiza tabla con checkboxes en la segunda fila del header
function renderAvailabilityTable() {
    if (displayedPlayers.length === 0) {
        tableContainer.innerHTML = '<p class="text-center text-gray-400 py-16">No hay jugadores en esta categoría.</p>';
        loadingIndicator.classList.add('hidden');
        return;
    }

    let tableHTML = '<table class="availability-table">';
    tableHTML += '<thead>';
    // Fila 1: Días y Fechas
    tableHTML += '<tr>';
    tableHTML += '<th class="player-name-cell !bg-gray-900"><input type="checkbox" id="select-all-players" title="Seleccionar Todos"> Jugador</th>';
    const datesOfWeek = []; const dateStringsOfWeek = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStartDate); date.setDate(currentWeekStartDate.getDate() + i);
        datesOfWeek.push(date); dateStringsOfWeek.push(formatDateYYYYMMDD(date));
    }
    datesOfWeek.forEach(date => {
         const dayCode = DAY_CODES[date.getDay()];
         tableHTML += `<th colspan="2" class="day-header">${dayCode} ${formatDateDDMM(date)}</th>`;
    });
    tableHTML += '</tr>';
    // Fila 2: Checkboxes M / T
    tableHTML += '<tr>';
    tableHTML += '<th class="player-name-cell !bg-gray-900"></th>'; // Esquina
    datesOfWeek.forEach(date => {
         const dayOfWeek = date.getDay();
         TIME_SLOTS.forEach((slot, index) => {
             const code = TIME_SLOT_CODES[index];
             tableHTML += `<th class="slot-header">
                             <label class="hover:text-white" title="Seleccionar ${DAYS[dayOfWeek]} ${slot}">
                                 <input type="checkbox" class="column-select-cb" data-day="${dayOfWeek}" data-slot="${slot}"> ${code}
                             </label>
                           </th>`;
         });
    });
    tableHTML += '</tr>';
    tableHTML += '</thead>';

    // Cuerpo
    tableHTML += '<tbody>';
    displayedPlayers.forEach(player => {
        tableHTML += `<tr class="player-row" data-player-id="${player.id}">`;
        tableHTML += `<td class="player-name-cell">
                        <input type="checkbox" class="player-select-cb mr-2" data-player-id="${player.id}" ${selectedPlayerIds.has(String(player.id)) ? 'checked' : ''}>
                        ${player.name}
                      </td>`;
        dateStringsOfWeek.forEach(dateStr => {
            TIME_SLOTS.forEach(slot => {
                const isAvailable = isPlayerAvailableOnDate(player.id, dateStr, slot);
                tableHTML += `<td class="slot-cell ${isAvailable ? 'available' : ''}" data-player-id="${player.id}" data-date="${dateStr}" data-slot="${slot}"></td>`;
            });
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    tableContainer.innerHTML = tableHTML;
    loadingIndicator.classList.add('hidden');
    updateSelectedPlayerVisuals();
}


// Verifica disponibilidad por fecha específica
function isPlayerAvailableOnDate(playerId, dateStr, timeSlot) {
    return availabilityForCurrentWeek.some(a =>
        a.player_id == playerId && a.available_date === dateStr && a.time_slot === timeSlot
    );
}

// Maneja clic en celda de slot usando data-date
function handleCellClick(event) {
    const cell = event.target.closest('.slot-cell');
    if (!cell) return;
    const playerId = cell.dataset.playerId;
    const dateStr = cell.dataset.date;
    const slot = cell.dataset.slot;

    const availabilityIndex = availabilityForCurrentWeek.findIndex(a =>
        a.player_id == playerId && a.available_date === dateStr && a.time_slot === slot
    );

    if (availabilityIndex !== -1) {
        availabilityForCurrentWeek.splice(availabilityIndex, 1);
        cell.classList.remove('available');
    } else {
        availabilityForCurrentWeek.push({
            player_id: parseInt(playerId), available_date: dateStr, time_slot: slot, zone: DEFAULT_ZONE
        });
        cell.classList.add('available');
    }
}

// Obtiene checkboxes seleccionados DEL HEADER
function getSelectedTimeSlots() {
    const slots = [];
    const checkboxesInHeader = tableContainer.querySelectorAll('thead .column-select-cb'); // Busca en thead
    checkboxesInHeader.forEach(cb => {
        if (cb.checked) {
            if (cb.dataset.slot === 'mañana' || cb.dataset.slot === 'tarde') {
                slots.push({ dayOfWeek: parseInt(cb.dataset.day), slot: cb.dataset.slot });
            }
        }
    });
    return slots;
}

// Aplica masivamente usando fechas específicas
function applyMassAvailability(makeAvailable) {
    const selectedPlayers = Array.from(selectedPlayerIds); // El Set guarda strings
    const selectedDaySlots = getSelectedTimeSlots();
    if (selectedPlayers.length === 0 || selectedDaySlots.length === 0) {
         showToast("Selecciona jugadores y horarios (M/T) para aplicar la acción.", "error");
        return;
    }

    selectedPlayers.forEach(playerIdStr => {
        const playerId = parseInt(playerIdStr);
        selectedDaySlots.forEach(daySlot => {
            const targetDayOfWeek = daySlot.dayOfWeek;
            const slot = daySlot.slot;

            let targetDate = null;
            for (let i = 0; i < 7; i++) { /* ... calcula targetDate ... */
                 const date = new Date(currentWeekStartDate); date.setDate(currentWeekStartDate.getDate() + i);
                 if (date.getDay() === targetDayOfWeek) { targetDate = date; break; }
            }
            if (!targetDate) return;
            const dateStr = formatDateYYYYMMDD(targetDate);

            const cell = tableContainer.querySelector(`.slot-cell[data-player-id="${playerIdStr}"][data-date="${dateStr}"][data-slot="${slot}"]`);
            const availabilityIndex = availabilityForCurrentWeek.findIndex(a =>
                a.player_id === playerId && a.available_date === dateStr && a.time_slot === slot
            );

            if (makeAvailable) {
                // Marcar como disponible (añadir si no existe para esta FECHA)
                if (availabilityIndex === -1) {
                    availabilityForCurrentWeek.push({
                        player_id: playerId, available_date: dateStr, time_slot: slot, zone: DEFAULT_ZONE
                    });
                }
                if (cell) cell.classList.add('available');
            } else {
                // Marcar como NO disponible (quitar si existe para esta FECHA)
                if (availabilityIndex !== -1) {
                    availabilityForCurrentWeek.splice(availabilityIndex, 1);
                }
                if (cell) cell.classList.remove('available');
            }
        });
    });

    // Desmarcar checkboxes del encabezado después de aplicar
    const checkboxesInHeader = tableContainer.querySelectorAll('thead .column-select-cb');
    checkboxesInHeader.forEach(cb => cb.checked = false);
}


// Guarda cambios SOLO para la semana actual
async function saveAllChanges() {
    btnSaveAll.disabled = true;
    btnSaveAll.innerHTML = '<div class="spinner inline-block mr-2"></div> Guardando...';

    const currentWeekSet = new Set();
    availabilityForCurrentWeek
        .filter(a => a.time_slot === 'mañana' || a.time_slot === 'tarde')
        .forEach(a => currentWeekSet.add(`${a.player_id}-${a.available_date}-${a.time_slot}-${a.zone}`) );

    const toInsert = [];
    const toDeleteConditions = [];

    const parseKey = (key) => { /* ... (función parseKey corregida con player_id) ... */
        const parts = key.split('-'); if (parts.length < 6) return null;
        const playerId = parts[0]; const dateStr = `${parts[1]}-${parts[2]}-${parts[3]}`; const timeSlot = parts[4]; const zone = parts[5];
        if (!playerId || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || !timeSlot || !zone) { console.warn("Clave inválida:", key); return null; }
        return { player_id: parseInt(playerId), available_date: dateStr, time_slot: timeSlot, zone: zone };
    };

    currentWeekSet.forEach(key => { /* ... cálculo toInsert ... */
        if (!initialAvailabilityForCurrentWeek.has(key)) {
            const parsed = parseKey(key);
            if (parsed && (parsed.time_slot === 'mañana' || parsed.time_slot === 'tarde')) { toInsert.push(parsed); }
        }
    });
    initialAvailabilityForCurrentWeek.forEach(key => { /* ... cálculo toDeleteConditions ... */
        if (!currentWeekSet.has(key)) {
             const parsed = parseKey(key);
             if (parsed && (parsed.time_slot === 'mañana' || parsed.time_slot === 'tarde')) {
                toDeleteConditions.push({ player_id: parsed.player_id, available_date: parsed.available_date, time_slot: parsed.time_slot, zone: parsed.zone });
             }
        }
    });

    if (toInsert.length === 0 && toDeleteConditions.length === 0) { /* ... sin cambios ... */
        showToast("No hay cambios para guardar.", "success"); btnSaveAll.disabled = false;
        btnSaveAll.innerHTML = '<span class="material-icons text-base">save</span> Guardar Cambios'; return;
    }

    try {
        let deleteError = null; let insertError = null;
        if (toDeleteConditions.length > 0) { /* ... ejecución deletes ... */
             console.log("Borrando:", toDeleteConditions);
             const deletePromises = toDeleteConditions.map(cond => supabase.from('player_availability').delete().match(cond) );
             const deleteResults = await Promise.all(deletePromises);
             deleteError = deleteResults.find(res => res.error)?.error;
             if (deleteError) { console.error("Error borrado:", deleteError); throw new Error(`Error al borrar ${toDeleteConditions.length}. Detalle: ${deleteError.message}`); }
        }
        if (toInsert.length > 0) { /* ... ejecución inserts ... */
            console.log("Insertando:", toInsert);
            const { error } = await supabase.from('player_availability').insert(toInsert);
            insertError = error;
            if (insertError) { console.error("Error inserción:", insertError); throw new Error(`Error al insertar ${toInsert.length}. Detalle: ${insertError.message}`); }
        }
        initialAvailabilityForCurrentWeek = new Set(currentWeekSet); // Actualizar estado inicial
        showToast(`Cambios guardados: ${toInsert.length} añadidos, ${toDeleteConditions.length} quitados.`, "success");
    } catch (error) { /* ... manejo de error y recarga ... */
        console.error("Error saveAllChanges:", error); showToast("Error al guardar: " + (error.message || "Error desconocido"), "error");
        await loadAvailabilityForWeek(currentWeekStartDate);
    } finally { /* ... restaurar botón ... */
        btnSaveAll.disabled = false; btnSaveAll.innerHTML = '<span class="material-icons text-base">save</span> Guardar Cambios';
    }
}


function handlePlayerSelection(event) {
    const checkbox = event.target;
    const playerId = checkbox.dataset.playerId; // String
    if (!playerId) return;
    if (checkbox.checked) { selectedPlayerIds.add(playerId); }
    else { selectedPlayerIds.delete(playerId); }
    updateSelectedPlayerVisuals();
}

function handleSelectAllPlayers(event) {
    const isChecked = event.target.checked;
    const playerCheckboxes = tableContainer.querySelectorAll('tbody .player-select-cb');
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
        const playerId = row.dataset.playerId; // String
        const checkbox = row.querySelector('.player-select-cb');
        if (selectedPlayerIds.has(playerId)) { // Comparar strings
            row.style.backgroundColor = '#4b5563';
            if (checkbox && !checkbox.checked) checkbox.checked = true;
        } else {
            row.style.backgroundColor = '';
            if (checkbox && checkbox.checked) checkbox.checked = false;
        }
    });

     const selectAllCheckbox = document.getElementById('select-all-players');
     if (selectAllCheckbox) { /* ... lógica indeterminate ... */
         const displayedPlayerCheckboxes = tableContainer.querySelectorAll('tbody .player-select-cb');
         const numDisplayed = displayedPlayerCheckboxes.length; let numSelectedDisplayed = 0;
         displayedPlayerCheckboxes.forEach(cb => { if(selectedPlayerIds.has(cb.dataset.playerId)) numSelectedDisplayed++; });
         if (numDisplayed === 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; }
         else if (numSelectedDisplayed === numDisplayed) { selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false; }
         else if (numSelectedDisplayed > 0) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true; }
         else { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; }
     }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    header.innerHTML = renderHeader();
    loadInitialData(); // Carga inicial y muestra semana actual
});

categoryFilter.addEventListener('change', filterAndRenderTable);
btnPrevWeek.addEventListener('click', goToPreviousWeek);
btnNextWeek.addEventListener('click', goToNextWeek);
btnCurrentWeek.addEventListener('click', goToCurrentWeek);

tableContainer.addEventListener('click', (event) => {
    const target = event.target;

    // Clic en celda de slot -> Toggle Disponibilidad
    const slotCell = target.closest('.slot-cell');
    if (slotCell) {
        handleCellClick(event); // Usar event original
        return; // Detener si fue un clic en slot
    }

    // Clic en checkbox de selección de columna (en thead)
    const columnCheckbox = target.closest('.column-select-cb');
    if (columnCheckbox) {
        // No necesita lógica específica aquí, getSelectedTimeSlots() los leerá al aplicar acción
        return;
    }

    // Clic en checkbox "Seleccionar Todos"
    if (target.id === 'select-all-players') {
         handleSelectAllPlayers(event);
         return;
    }

    // Clic DENTRO de la celda del nombre del jugador (TD) o EN EL CHECKBOX del jugador
    const playerNameCell = target.closest('.player-name-cell');
    if (playerNameCell && playerNameCell.tagName === 'TD') {
        const checkbox = playerNameCell.querySelector('.player-select-cb');
        if (checkbox) {
            // Si el clic NO fue directamente en el checkbox, invertir su estado
            // Esto asegura que el clic en la celda funcione Y el clic directo también
            if (target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            // Llamar a la función de manejo de selección,
            // pasando el checkbox como si hubiera sido el target original
            handlePlayerSelection({ target: checkbox });
        }
        return; // Detener propagación
    }

});


btnApplyAvailability.addEventListener('click', () => applyMassAvailability(true));
// --- CORRECCIÓN: Llamar a applyMassAvailability con false ---
btnClearAvailability.addEventListener('click', () => applyMassAvailability(false));
// -----------------------------------------------------------
btnSaveAll.addEventListener('click', saveAllChanges);