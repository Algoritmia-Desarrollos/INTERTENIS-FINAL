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
// ▼▼▼ INICIO CONSTANTES MODIFICADAS ▼▼▼
const CONSECUTIVE_WEEKS_FOR_HABITUAL = 3; // Número de semanas CONSECUTIVAS requeridas
// Mapeo revisado para cálculo y filtro (con día UTC para consistencia)
const HABITUAL_SLOTS_CONFIG = {
    'Vie-mañana': { dayUTC: 5, slot: 'mañana', text: 'Viernes Mañana' }, // dayUTC: 0=Dom,..., 5=Vie, 6=Sab
    'Vie-tarde': { dayUTC: 5, slot: 'tarde', text: 'Viernes Tarde' },
    'Sab-mañana': { dayUTC: 6, slot: 'mañana', text: 'Sábado Mañana' },
    'Sab-tarde': { dayUTC: 6, slot: 'tarde', text: 'Sábado Tarde' },
    'Dom-mañana': { dayUTC: 0, slot: 'mañana', text: 'Domingo Mañana' },
    'Dom-tarde': { dayUTC: 0, slot: 'tarde', text: 'Domingo Tarde' }
};
// ▲▲▲ FIN CONSTANTES MODIFICADAS ▲▲▲

// --- ELEMENTOS DEL DOM ---
const header = document.getElementById('header');
const categoryFilter = document.getElementById('category-filter');
const playerSearchInput = document.getElementById('player-search-input');
const habitualFilter = document.getElementById('habitual-filter');
const tableContainer = document.getElementById('availability-table-container');
const loadingIndicator = document.getElementById('loading-indicator');
const btnApplyAvailability = document.getElementById('btn-apply-availability');
const btnClearAvailability = document.getElementById('btn-clear-availability');
const btnSaveAll = document.getElementById('btn-save-all');
const btnPrevWeek = document.getElementById('btn-prev-week');
const btnNextWeek = document.getElementById('btn-next-week');
const btnCurrentWeek = document.getElementById('btn-current-week');
const currentWeekDisplay = document.getElementById('current-week-display');

// --- ESTADO ---
let allPlayers = [];
let allCategories = [];
let availabilityForCurrentWeek = [];
let initialAvailabilityForCurrentWeek = new Set();
let displayedPlayers = [];
let selectedPlayerIds = new Set();
let currentWeekStartDate = getStartOfWeek(new Date()); // Lunes de la semana actual
let habitualAvailabilityPatterns = new Map(); // Map<playerId, Set<habitualSlotKey>>
let selectedHabitualSlot = '';
let isLoadingHabitual = false;

// --- FUNCIONES ---

function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

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

// Obtener identificador único para una semana (Año-NúmeroDeSemanaISO)
function getWeekIdentifier(date) {
    // Copia la fecha para no modificar la original
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Ajusta al jueves más cercano
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Obtiene el inicio del año
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calcula el número de semana ISO
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

// Obtiene los identificadores de las N semanas anteriores a una fecha dada
function getPreviousWeekIdentifiers(currentMonday, numberOfWeeks) {
    const weekIds = [];
    let tempDate = new Date(currentMonday);
    for (let i = 0; i < numberOfWeeks; i++) {
        tempDate.setDate(tempDate.getDate() - 7); // Retrocede una semana
        weekIds.push(getWeekIdentifier(tempDate));
    }
    return weekIds.reverse(); // Devuelve en orden cronológico [semana -3, semana -2, semana -1]
}


async function loadAvailabilityForWeek(startDate) {
    loadingIndicator.textContent = 'Cargando disponibilidad de la semana...';
    loadingIndicator.classList.remove('hidden');
    tableContainer.innerHTML = '';

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const startStr = formatDateYYYYMMDD(startDate);
    const endStr = formatDateYYYYMMDD(endDate);

    try {
        const { data, error } = await supabase
            .from('player_availability')
            .select('player_id, available_date, time_slot, zone')
            .gte('available_date', startStr)
            .lte('available_date', endStr);

        if (error) throw error;

        availabilityForCurrentWeek = (data || []).map(item => ({
            ...item,
            available_date: item.available_date.split('T')[0]
        }));

        initialAvailabilityForCurrentWeek.clear();
        availabilityForCurrentWeek.forEach(a =>
            initialAvailabilityForCurrentWeek.add(`${a.player_id}-${a.available_date}-${a.time_slot}-${a.zone || DEFAULT_ZONE}`)
        );
        // console.log("Initial Availability Loaded:", initialAvailabilityForCurrentWeek);

        filterAndRenderTable();

    } catch (error) {
        console.error("Error loading availability for week:", error);
        showToast("Error al cargar disponibilidad de la semana", "error");
        tableContainer.innerHTML = '<p class="text-center text-red-500 py-16">Error al cargar datos de disponibilidad.</p>';
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

async function loadAndCalculateHabitualAvailability() {
    if (isLoadingHabitual) return;
    isLoadingHabitual = true;
    console.log("Iniciando cálculo de disponibilidad habitual consecutiva...");

    // Calcular el rango de fechas para las N semanas ANTERIORES
    const historyEndDate = new Date(currentWeekStartDate);
    historyEndDate.setDate(historyEndDate.getDate() - 1); // Domingo de la semana anterior

    const historyStartDate = new Date(historyEndDate);
    // Retrocede N semanas (menos 1 día para empezar en lunes)
    historyStartDate.setDate(historyStartDate.getDate() - (CONSECUTIVE_WEEKS_FOR_HABITUAL * 7) + 1);

    const startStr = formatDateYYYYMMDD(historyStartDate);
    const endStr = formatDateYYYYMMDD(historyEndDate);

    console.log(`Rango histórico para patrones (${CONSECUTIVE_WEEKS_FOR_HABITUAL} semanas): ${startStr} a ${endStr}`);

    try {
        const { data: historicalData, error } = await supabase
            .from('player_availability')
            .select('player_id, available_date, time_slot')
            .gte('available_date', startStr)
            .lte('available_date', endStr);

        if (error) {
            console.error("Error cargando historial de disponibilidad:", error);
            showToast("Error al calcular patrones habituales.", "error");
            return;
        }

        // Pasar las fechas de inicio/fin no es estrictamente necesario ahora, pero mantenemos por si acaso
        calculateHabitualAvailability(historicalData || [], historyStartDate, historyEndDate);
        console.log("Patrones habituales (consecutivos) calculados:", habitualAvailabilityPatterns);
        updateHabitualFilterOptions(); // Actualizar texto de opciones después de calcular

    } catch (error) {
        console.error("Excepción al calcular disponibilidad habitual:", error);
        showToast("Error inesperado al calcular patrones.", "error");
    } finally {
        isLoadingHabitual = false;
    }
}


/**
 * Procesa los datos históricos para determinar los patrones de disponibilidad habitual CONSECUTIVA.
 * @param {Array} historicalData - Array de objetos {player_id, available_date, time_slot}
 * @param {Date} historyStartDate - Fecha de inicio del período histórico (Lunes)
 * @param {Date} historyEndDate - Fecha de fin del período histórico (Domingo)
 */
function calculateHabitualAvailability(historicalData, historyStartDate, historyEndDate) {
    habitualAvailabilityPatterns.clear();
    // Mapa para agrupar disponibilidad por jugador -> habitualSlotKey -> Set<weekIdentifier>
    const availabilityByPlayerSlotWeek = new Map();

    // 1. Agrupar la disponibilidad histórica
    historicalData.forEach(avail => {
        const date = new Date(avail.available_date + 'T00:00:00Z');
        const dayOfWeekUTC = date.getUTCDay();
        const slot = avail.time_slot;
        const weekId = getWeekIdentifier(date); // YYYY-W##

        const habitualSlotKey = Object.keys(HABITUAL_SLOTS_CONFIG).find(key =>
            HABITUAL_SLOTS_CONFIG[key].dayUTC === dayOfWeekUTC && HABITUAL_SLOTS_CONFIG[key].slot === slot
        );

        if (habitualSlotKey) {
            if (!availabilityByPlayerSlotWeek.has(avail.player_id)) {
                availabilityByPlayerSlotWeek.set(avail.player_id, new Map());
            }
            const playerSlots = availabilityByPlayerSlotWeek.get(avail.player_id);
            if (!playerSlots.has(habitualSlotKey)) {
                playerSlots.set(habitualSlotKey, new Set());
            }
            playerSlots.get(habitualSlotKey).add(weekId);
        }
    });

    // 2. Determinar las semanas objetivo (las N anteriores a la actual)
    const targetWeekIds = getPreviousWeekIdentifiers(currentWeekStartDate, CONSECUTIVE_WEEKS_FOR_HABITUAL);
    console.log("Semanas objetivo para consecutividad:", targetWeekIds);

    // 3. Verificar consecutividad para cada jugador y slot
    availabilityByPlayerSlotWeek.forEach((playerSlots, playerId) => {
        const habitualSlotsForPlayer = new Set();
        playerSlots.forEach((weeksAvailableSet, habitualSlotKey) => {
            // Verificar si el jugador estuvo disponible en TODAS las semanas objetivo para ESTE slot
            const isConsecutive = targetWeekIds.every(targetWeekId => weeksAvailableSet.has(targetWeekId));

            if (isConsecutive) {
                // console.log(`Jugador ${playerId} CUMPLE consecutividad para ${habitualSlotKey}`); // Log depuración
                habitualSlotsForPlayer.add(habitualSlotKey);
            } else {
                 // console.log(`Jugador ${playerId} NO cumple consecutividad para ${habitualSlotKey}. Disponibles: ${Array.from(weeksAvailableSet)}`); // Log depuración
            }
        });

        if (habitualSlotsForPlayer.size > 0) {
            habitualAvailabilityPatterns.set(playerId, habitualSlotsForPlayer);
        }
    });
}


function updateHabitualFilterOptions() {
    if (!habitualFilter) return;

    const habitualSlotCounts = new Map();
    Object.keys(HABITUAL_SLOTS_CONFIG).forEach(key => habitualSlotCounts.set(key, 0));

    habitualAvailabilityPatterns.forEach((playerSlots) => {
        playerSlots.forEach(slotKey => {
            if (habitualSlotCounts.has(slotKey)) {
                habitualSlotCounts.set(slotKey, habitualSlotCounts.get(slotKey) + 1);
            }
        });
    });

    const options = habitualFilter.options;
    for (let i = 1; i < options.length; i++) {
        const option = options[i];
        const slotKey = option.value;
        if (HABITUAL_SLOTS_CONFIG[slotKey]) {
            const count = habitualSlotCounts.get(slotKey) || 0;
            const originalText = HABITUAL_SLOTS_CONFIG[slotKey].text;
            option.textContent = `${originalText} (${count})`;
        }
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

        await loadAndCalculateHabitualAvailability();
        await displayWeek(currentWeekStartDate);
        // updateHabitualFilterOptions(); // Ya se llama dentro de loadAndCalculateHabitualAvailability

    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar jugadores o categorías", "error");
        loadingIndicator.textContent = 'Error al cargar datos.';
        loadingIndicator.classList.remove('hidden');
    }
}


async function displayWeek(startDate) {
    currentWeekStartDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;
    // Recalcular patrones habituales basado en la nueva semana
    await loadAndCalculateHabitualAvailability();
    // Cargar disponibilidad para la nueva semana actual
    await loadAvailabilityForWeek(currentWeekStartDate);
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
    const searchTerm = normalizeText(playerSearchInput.value);
    selectedHabitualSlot = habitualFilter.value;

    console.log(`Filtrando: Cat=${selectedCategoryId}, Search='${searchTerm}', Habitual='${selectedHabitualSlot}'`);

    let playersToDisplay = allPlayers;

    if (selectedCategoryId !== 'all') {
        playersToDisplay = playersToDisplay.filter(p => p.category_id == selectedCategoryId);
    }

    if (searchTerm) {
        playersToDisplay = playersToDisplay.filter(p => normalizeText(p.name).includes(searchTerm));
    }

    if (selectedHabitualSlot) {
        playersToDisplay = playersToDisplay.filter(p => {
            const habitualSlots = habitualAvailabilityPatterns.get(p.id);
            return habitualSlots && habitualSlots.has(selectedHabitualSlot);
        });
    }

    displayedPlayers = playersToDisplay;
    renderAvailabilityTable();
    updateSelectedPlayerVisuals();
}

function renderAvailabilityTable() {
     if (displayedPlayers.length === 0) {
        const searchTerm = playerSearchInput.value;
        const categorySelected = categoryFilter.value !== 'all';
        const habitualSelected = selectedHabitualSlot !== '';
        let message = "No hay jugadores ";
        if(categorySelected) message += `en la categoría seleccionada `;
        if(habitualSelected) {
            const slotText = HABITUAL_SLOTS_CONFIG[selectedHabitualSlot]?.text.toLowerCase() || selectedHabitualSlot.replace('-', ' ');
            message += `que jueguen habitualmente los ${slotText} `;
        }
        if(searchTerm) message += `que coincidan con "${searchTerm}"`;
        else if (!categorySelected && !habitualSelected) message += `registrados.`
        else message += `.`;

        tableContainer.innerHTML = `<p class="text-center text-gray-400 py-16">${message}</p>`;
        loadingIndicator.classList.add('hidden');
        return;
    }

    let tableHTML = '<table class="availability-table">';
    tableHTML += '<thead>';
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
    tableHTML += '<tr>';
    tableHTML += '<th class="player-name-cell !bg-gray-900"></th>';
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

function isPlayerAvailableOnDate(playerId, dateStr, timeSlot) {
    return availabilityForCurrentWeek.some(a =>
        a.player_id == playerId &&
        a.available_date === dateStr &&
        a.time_slot === timeSlot &&
        (a.zone || DEFAULT_ZONE)
    );
}

function handleCellClick(event) {
    const cell = event.target.closest('.slot-cell');
    if (!cell) return;
    const playerId = cell.dataset.playerId;
    const dateStr = cell.dataset.date;
    const slot = cell.dataset.slot;
    const currentZone = DEFAULT_ZONE;

    const availabilityIndex = availabilityForCurrentWeek.findIndex(a =>
        a.player_id == playerId &&
        a.available_date === dateStr &&
        a.time_slot === slot &&
        (a.zone || DEFAULT_ZONE) === currentZone
    );

    if (availabilityIndex !== -1) {
        availabilityForCurrentWeek.splice(availabilityIndex, 1);
        cell.classList.remove('available');
    } else {
        availabilityForCurrentWeek.push({
            player_id: parseInt(playerId),
            available_date: dateStr,
            time_slot: slot,
            zone: currentZone
        });
        cell.classList.add('available');
    }
}

function getSelectedTimeSlots() {
    const slots = [];
    const checkboxesInHeader = tableContainer.querySelectorAll('thead .column-select-cb');
    checkboxesInHeader.forEach(cb => {
        if (cb.checked) {
            if (cb.dataset.slot === 'mañana' || cb.dataset.slot === 'tarde') {
                slots.push({ dayOfWeek: parseInt(cb.dataset.day), slot: cb.dataset.slot });
            }
        }
    });
    return slots;
}

function applyMassAvailability(makeAvailable) {
    const selectedPlayers = Array.from(selectedPlayerIds);
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
            const currentZone = DEFAULT_ZONE;

            let targetDate = null;
            for (let i = 0; i < 7; i++) {
                 const date = new Date(currentWeekStartDate); date.setDate(currentWeekStartDate.getDate() + i);
                 if (date.getDay() === targetDayOfWeek) { targetDate = date; break; }
            }
            if (!targetDate) return;
            const dateStr = formatDateYYYYMMDD(targetDate);

            const cell = tableContainer.querySelector(`.slot-cell[data-player-id="${playerIdStr}"][data-date="${dateStr}"][data-slot="${slot}"]`);
            const availabilityIndex = availabilityForCurrentWeek.findIndex(a =>
                a.player_id === playerId &&
                a.available_date === dateStr &&
                a.time_slot === slot &&
                (a.zone || DEFAULT_ZONE) === currentZone
            );

            if (makeAvailable) {
                if (availabilityIndex === -1) {
                    availabilityForCurrentWeek.push({
                        player_id: playerId,
                        available_date: dateStr,
                        time_slot: slot,
                        zone: currentZone
                    });
                }
                if (cell) cell.classList.add('available');
            } else {
                if (availabilityIndex !== -1) {
                    availabilityForCurrentWeek.splice(availabilityIndex, 1);
                }
                if (cell) cell.classList.remove('available');
            }
        });
    });

    const checkboxesInHeader = tableContainer.querySelectorAll('thead .column-select-cb');
    checkboxesInHeader.forEach(cb => cb.checked = false);
}

async function saveAllChanges() {
    btnSaveAll.disabled = true;
    btnSaveAll.innerHTML = '<div class="spinner inline-block mr-2"></div> Guardando...';

    const currentWeekSet = new Set();
    availabilityForCurrentWeek
        .filter(a => a.time_slot === 'mañana' || a.time_slot === 'tarde')
        .forEach(a => currentWeekSet.add(`${a.player_id}-${a.available_date}-${a.time_slot}-${a.zone || DEFAULT_ZONE}`) );

    const toInsert = [];
    const toDeleteConditions = [];

    const parseKey = (key) => {
        const parts = key.split('-');
        if (parts.length < 4) { console.warn("Clave inválida:", key); return null; }
        const playerId = parseInt(parts[0], 10);
        let dateStr = ''; let timeSlot = ''; let zone = '';
        if (parts[1].match(/^\d{4}-\d{2}-\d{2}$/) && parts.length === 4) {
             dateStr = parts[1]; timeSlot = parts[2]; zone = parts[3];
        } else if (parts.length >= 5 && parts[1].match(/^\d{4}$/) && parts[2].match(/^\d{2}$/) && parts[3].match(/^\d{2}$/)) {
             dateStr = `${parts[1]}-${parts[2]}-${parts[3]}`; timeSlot = parts[4]; zone = parts[5] || DEFAULT_ZONE;
        } else { console.warn("Clave inválida:", key); return null; }
        if (isNaN(playerId) || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || !timeSlot || !zone) {
            console.warn("Clave inválida:", key); return null;
        }
        return { player_id: playerId, available_date: dateStr, time_slot: timeSlot, zone: zone };
    };

    currentWeekSet.forEach(key => {
        if (!initialAvailabilityForCurrentWeek.has(key)) {
            const parsed = parseKey(key);
            if (parsed && (parsed.time_slot === 'mañana' || parsed.time_slot === 'tarde')) {
                 toInsert.push(parsed);
             }
        }
    });
    initialAvailabilityForCurrentWeek.forEach(key => {
        if (!currentWeekSet.has(key)) {
             const parsed = parseKey(key);
             if (parsed && (parsed.time_slot === 'mañana' || parsed.time_slot === 'tarde')) {
                toDeleteConditions.push({
                    player_id: parsed.player_id,
                    available_date: parsed.available_date,
                    time_slot: parsed.time_slot,
                    zone: parsed.zone
                });
             }
        }
    });

    if (toInsert.length === 0 && toDeleteConditions.length === 0) {
        showToast("No hay cambios para guardar.", "success");
        btnSaveAll.disabled = false;
        btnSaveAll.innerHTML = '<span class="material-icons !text-base">save</span> Guardar';
        return;
    }

    try {
        if (toDeleteConditions.length > 0) {
             const BATCH_SIZE = 100;
             for (let i = 0; i < toDeleteConditions.length; i += BATCH_SIZE) {
                 const batch = toDeleteConditions.slice(i, i + BATCH_SIZE);
                 const deletePromises = batch.map(cond => supabase.from('player_availability').delete().match(cond));
                 const deleteResults = await Promise.all(deletePromises);
                 const batchError = deleteResults.find(res => res.error)?.error;
                 if (batchError) { throw new Error(`Error al borrar. Detalle: ${batchError.message}`); }
             }
        }
        if (toInsert.length > 0) {
            const { error } = await supabase.from('player_availability').insert(toInsert);
            if (error) { throw new Error(`Error al insertar. Detalle: ${error.message}`); }
        }
        initialAvailabilityForCurrentWeek = new Set(currentWeekSet);
        showToast(`Cambios guardados: ${toInsert.length} añadidos, ${toDeleteConditions.length} quitados.`, "success");
    } catch (error) {
        console.error("Error saveAllChanges:", error); showToast("Error al guardar: " + (error.message || "Error desconocido"), "error");
        await loadAvailabilityForWeek(currentWeekStartDate);
    } finally {
        btnSaveAll.disabled = false;
        btnSaveAll.innerHTML = '<span class="material-icons !text-base">save</span> Guardar';
    }
}

function handlePlayerSelection(event) {
    const checkbox = event.target;
    const playerId = checkbox.dataset.playerId;
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
        const playerId = row.dataset.playerId;
        const checkbox = row.querySelector('.player-select-cb');
        if (selectedPlayerIds.has(playerId)) {
            row.style.backgroundColor = '#4b5563';
            if (checkbox && !checkbox.checked) checkbox.checked = true;
        } else {
            row.style.backgroundColor = '';
            if (checkbox && checkbox.checked) checkbox.checked = false;
        }
    });

     const selectAllCheckbox = document.getElementById('select-all-players');
     if (selectAllCheckbox) {
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
    loadInitialData();
});

categoryFilter.addEventListener('change', filterAndRenderTable);
playerSearchInput.addEventListener('input', filterAndRenderTable);
habitualFilter.addEventListener('change', filterAndRenderTable);
btnPrevWeek.addEventListener('click', goToPreviousWeek);
btnNextWeek.addEventListener('click', goToNextWeek);
btnCurrentWeek.addEventListener('click', goToCurrentWeek);

tableContainer.addEventListener('click', (event) => {
    const target = event.target;

    const slotCell = target.closest('.slot-cell');
    if (slotCell) {
        handleCellClick(event);
        return;
    }

    const columnCheckbox = target.closest('.column-select-cb');
    if (columnCheckbox) {
        return;
    }

    if (target.id === 'select-all-players') {
         handleSelectAllPlayers(event);
         return;
    }

    const playerNameCell = target.closest('.player-name-cell');
    if (playerNameCell && playerNameCell.tagName === 'TD') {
        const checkbox = playerNameCell.querySelector('.player-select-cb');
        if (checkbox) {
            if (target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            handlePlayerSelection({ target: checkbox });
        }
        return;
    }

});

btnApplyAvailability.addEventListener('click', () => applyMassAvailability(true));
btnClearAvailability.addEventListener('click', () => applyMassAvailability(false));
btnSaveAll.addEventListener('click', saveAllChanges);