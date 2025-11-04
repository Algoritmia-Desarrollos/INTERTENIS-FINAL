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
const CONSECUTIVE_WEEKS_FOR_HABITUAL = 3; 
const HABITUAL_SLOTS_CONFIG = {
    'Vie-mañana': { dayUTC: 5, slot: 'mañana', text: 'Viernes Mañana' },
    'Vie-tarde': { dayUTC: 5, slot: 'tarde', text: 'Viernes Tarde' },
    'Sab-mañana': { dayUTC: 6, slot: 'mañana', text: 'Sábado Mañana' },
    'Sab-tarde': { dayUTC: 6, slot: 'tarde', text: 'Sábado Tarde' },
    'Dom-mañana': { dayUTC: 0, slot: 'mañana', text: 'Domingo Mañana' },
    'Dom-tarde': { dayUTC: 0, slot: 'tarde', text: 'Domingo Tarde' }
};

// --- ELEMENTOS DEL DOM ---
const header = document.getElementById('header');
const categoryFilter = document.getElementById('category-filter');
const playerSearchInput = document.getElementById('player-search-input');
const habitualFilter = document.getElementById('habitual-filter');
// --- INICIO DE LA MODIFICACIÓN (1/5) ---
const playerSourceFilter = document.getElementById('player-source-filter');
// --- FIN DE LA MODIFICACIÓN (1/5) ---
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
let displayedPlayers = []; // <-- Esta es la lista filtrada
let selectedPlayerIds = new Set();
let currentWeekStartDate = getStartOfWeek(new Date()); 
let habitualAvailabilityPatterns = new Map(); 
// --- INICIO DE LA MODIFICACIÓN (2/5) ---
let playersWithPlayerAvailability = new Set(); // Jugadores que cargaron (source='player')
let playersWithAnyAvailability = new Set();    // Jugadores que tienen CUALQUIER carga (admin O player)
// --- FIN DE LA MODIFICACIÓN (2/5) ---
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

function getWeekIdentifier(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

function getPreviousWeekIdentifiers(currentMonday, numberOfWeeks) {
    const weekIds = [];
    let tempDate = new Date(currentMonday);
    for (let i = 0; i < numberOfWeeks; i++) {
        tempDate.setDate(tempDate.getDate() - 7);
        weekIds.push(getWeekIdentifier(tempDate));
    }
    return weekIds.reverse();
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
            .select('player_id, available_date, time_slot, zone, source') 
            .gte('available_date', startStr)
            .lte('available_date', endStr);

        if (error) throw error;

        availabilityForCurrentWeek = (data || []).map(item => ({
            ...item,
            available_date: item.available_date.split('T')[0],
            source: item.source || 'admin' 
        }));

        initialAvailabilityForCurrentWeek.clear();
        
        // --- INICIO DE LA MODIFICACIÓN (3/5) ---
        playersWithPlayerAvailability.clear(); // Limpiar el set (solo 'player')
        playersWithAnyAvailability.clear();    // Limpiar el set (CUALQUIERA)
        // --- FIN DE LA MODIFICACIÓN (3/5) ---

        availabilityForCurrentWeek.forEach(a => {
            initialAvailabilityForCurrentWeek.add(`${a.player_id}-${a.available_date}-${a.time_slot}-${a.zone || DEFAULT_ZONE}-${a.source}`);
            
            // --- INICIO DE LA MODIFICACIÓN (3/5) ---
            // 1. Añadir a CUALQUIERA que tenga al menos una entrada
            playersWithAnyAvailability.add(a.player_id);

            // 2. Añadir solo si la fuente es 'player'
            if (a.source === 'player') {
                playersWithPlayerAvailability.add(a.player_id);
            }
            // --- FIN DE LA MODIFICACIÓN (3/5) ---
        });

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

    const historyEndDate = new Date(currentWeekStartDate);
    historyEndDate.setDate(historyEndDate.getDate() - 1); 

    const historyStartDate = new Date(historyEndDate);
    historyStartDate.setDate(historyStartDate.getDate() - (CONSECUTIVE_WEEKS_FOR_HABITUAL * 7) + 1);

    const startStr = formatDateYYYYMMDD(historyStartDate);
    const endStr = formatDateYYYYMMDD(historyEndDate);

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

        calculateHabitualAvailability(historicalData || [], historyStartDate, historyEndDate);
        updateHabitualFilterOptions();

    } catch (error) {
        console.error("Excepción al calcular disponibilidad habitual:", error);
        showToast("Error inesperado al calcular patrones.", "error");
    } finally {
        isLoadingHabitual = false;
    }
}

function calculateHabitualAvailability(historicalData, historyStartDate, historyEndDate) {
    habitualAvailabilityPatterns.clear();
    const availabilityByPlayerSlotWeek = new Map();

    historicalData.forEach(avail => {
        const date = new Date(avail.available_date + 'T00:00:00Z');
        const dayOfWeekUTC = date.getUTCDay();
        const slot = avail.time_slot;
        const weekId = getWeekIdentifier(date); 

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

    const targetWeekIds = getPreviousWeekIdentifiers(currentWeekStartDate, CONSECUTIVE_WEEKS_FOR_HABITUAL);

    availabilityByPlayerSlotWeek.forEach((playerSlots, playerId) => {
        const habitualSlotsForPlayer = new Set();
        playerSlots.forEach((weeksAvailableSet, habitualSlotKey) => {
            const isConsecutive = targetWeekIds.every(targetWeekId => weeksAvailableSet.has(targetWeekId));
            if (isConsecutive) {
                habitualSlotsForPlayer.add(habitualSlotKey);
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
    await loadAndCalculateHabitualAvailability();
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

    // --- INICIO DE LA MODIFICACIÓN (4/5) ---
    const sourceFilter = playerSourceFilter.value; 
    // --- FIN DE LA MODIFICACIÓN (4/5) ---

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

    // --- INICIO DE LA MODIFICACIÓN (4/5) ---
    // Aplicar el filtro de fuente (quién cargó)
    if (sourceFilter === 'any') {
        // Mostrar solo jugadores que tienen CUALQUIER disponibilidad (admin o player)
        playersToDisplay = playersToDisplay.filter(p => playersWithAnyAvailability.has(p.id));
    } else if (sourceFilter === 'none') {
        // Mostrar solo jugadores que NO tienen NINGUNA disponibilidad
        playersToDisplay = playersToDisplay.filter(p => !playersWithAnyAvailability.has(p.id));
    } else if (sourceFilter === 'player_only') {
        // Mostrar solo jugadores que cargaron ELLOS MISMOS (amarillo)
        playersToDisplay = playersToDisplay.filter(p => playersWithPlayerAvailability.has(p.id));
    }
    // Si es 'all', no se aplica filtro
    // --- FIN DE LA MODIFICACIÓN (4/5) ---

    displayedPlayers = playersToDisplay; // <-- Guarda la lista filtrada
    renderAvailabilityTable();
    updateSelectedPlayerVisuals(); // Asegura que los checkboxes se actualicen
}

function renderAvailabilityTable() {
     if (displayedPlayers.length === 0) {
        const searchTerm = playerSearchInput.value;
        const categorySelected = categoryFilter.value !== 'all';
        const habitualSelected = selectedHabitualSlot !== '';
        // --- INICIO DE LA MODIFICACIÓN (5/5) ---
        const sourceFilter = playerSourceFilter.value;
        // --- FIN DE LA MODIFICACIÓN (5/5) ---
        
        let message = "No hay jugadores ";
        if(categorySelected) message += `en la categoría seleccionada `;
        if(habitualSelected) {
            const slotText = HABITUAL_SLOTS_CONFIG[selectedHabitualSlot]?.text.toLowerCase() || selectedHabitualSlot.replace('-', ' ');
            message += `que jueguen habitualmente los ${slotText} `;
        }
        // --- INICIO DE LA MODIFICACIÓN (5/5) ---
        if(sourceFilter === 'any') {
            message += `con disponibilidad cargada `;
        } else if (sourceFilter === 'none') {
            message += `sin disponibilidad cargada `;
        } else if (sourceFilter === 'player_only') {
            message += `que hayan cargado (jugador) `;
        }
        // --- FIN DE LA MODIFICACIÓN (5/5) ---
        if(searchTerm) message += `que coincidan con "${searchTerm}"`;
        else if (!categorySelected && !habitualSelected && sourceFilter === 'all') message += `registrados.`
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
        // --- INICIO DE LA MODIFICACIÓN (5/5) ---
        // Añadir un ícono si el jugador cargó su disponibilidad
        let playerIndicator = '';
        if (playersWithPlayerAvailability.has(player.id)) {
            // Si el jugador cargó (source=player), ícono amarillo
            playerIndicator = '<span class="material-icons !text-sm text-yellow-400" title="Disponibilidad cargada por jugador">person_check</span>';
        } else if (playersWithAnyAvailability.has(player.id)) {
            // Si no cargó el jugador, PERO tiene carga (source=admin), ícono verde
            playerIndicator = '<span class="material-icons !text-sm text-green-500" title="Disponibilidad cargada por admin">admin_panel_settings</span>';
        }
        // --- FIN DE LA MODIFICACIÓN (5/5) ---

        tableHTML += `<tr class="player-row" data-player-id="${player.id}">`;
        
        // --- INICIO DE LA MODIFICACIÓN (5/5) ---
        tableHTML += `<td class="player-name-cell">
                        <div class="flex items-center gap-1"> <input type="checkbox" class="player-select-cb mr-1 flex-shrink-0" data-player-id="${player.id}" ${selectedPlayerIds.has(String(player.id)) ? 'checked' : ''}>
                            <span class="flex-grow truncate" title="${player.name}">${player.name}</span> ${playerIndicator} </div>
                      </td>`;
        // --- FIN DE LA MODIFICACIÓN (5/5) ---
                      
        dateStringsOfWeek.forEach(dateStr => {
            TIME_SLOTS.forEach(slot => {
                const avail = getPlayerAvailability(player.id, dateStr, slot);
                let cellClass = '';
                if (avail) {
                    cellClass = avail.source === 'player' ? 'available-player' : 'available-admin';
                }
                
                tableHTML += `<td 
                                class="slot-cell ${cellClass}" 
                                data-player-id="${player.id}" 
                                data-date="${dateStr}" 
                                data-slot="${slot}"
                                data-source="${avail ? avail.source : ''}"
                              ></td>`;
            });
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    tableContainer.innerHTML = tableHTML;
    loadingIndicator.classList.add('hidden');
    updateSelectedPlayerVisuals();
}

/**
 * Busca una entrada de disponibilidad específica.
 * @returns {object|null} La entrada de disponibilidad o null.
 */
function getPlayerAvailability(playerId, dateStr, timeSlot) {
    return availabilityForCurrentWeek.find(a =>
        a.player_id == playerId &&
        a.available_date === dateStr &&
        a.time_slot === timeSlot &&
        (a.zone || DEFAULT_ZONE)
    ) || null;
}

function handleCellClick(event) {
    const cell = event.target.closest('.slot-cell');
    if (!cell) return;

    if (cell.classList.contains('available-player')) {
        showToast("Disponibilidad cargada por jugador. Use 'Acciones' para anular.", "error");
        return;
    }

    const playerId = cell.dataset.playerId;
    const dateStr = cell.dataset.date;
    const slot = cell.dataset.slot;
    const currentZone = DEFAULT_ZONE;
    const currentSource = 'admin'; 

    const availabilityIndex = availabilityForCurrentWeek.findIndex(a =>
        a.player_id == playerId &&
        a.available_date === dateStr &&
        a.time_slot === slot
    );

    if (availabilityIndex !== -1) {
        availabilityForCurrentWeek.splice(availabilityIndex, 1);
        cell.classList.remove('available-admin', 'available-player'); 
        cell.dataset.source = '';
    } else {
        availabilityForCurrentWeek.push({
            player_id: parseInt(playerId),
            available_date: dateStr,
            time_slot: slot,
            zone: currentZone,
            source: currentSource 
        });
        cell.classList.add('available-admin'); 
        cell.dataset.source = currentSource;
    }
    
    // --- INICIO DE LA MODIFICACIÓN (5/5) ---
    // Actualizar el estado de "any" y el ícono al hacer clic
    const allAvailForPlayer = availabilityForCurrentWeek.filter(a => a.player_id == playerId);
    const iconCell = cell.closest('tr').querySelector('.player-name-cell .material-icons');
    
    if (allAvailForPlayer.length === 0) {
        playersWithAnyAvailability.delete(parseInt(playerId));
        if (iconCell) iconCell.remove(); // Quitar ícono si ya no tiene disponibilidad
    } else {
        playersWithAnyAvailability.add(parseInt(playerId));
        // Si no tenía ícono y la fuente no es 'player', agregar el de 'admin'
        if (!iconCell && !playersWithPlayerAvailability.has(parseInt(playerId))) {
             const nameSpan = cell.closest('tr').querySelector('.player-name-cell .flex-grow');
             if (nameSpan) {
                 nameSpan.insertAdjacentHTML('afterend', '<span class="material-icons !text-sm text-green-500" title="Disponibilidad cargada por admin">admin_panel_settings</span>');
             }
        }
    }
    // --- FIN DE LA MODIFICACIÓN (5/5) ---
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
    const selectedPlayersToShow = displayedPlayers.filter(p => 
        selectedPlayerIds.has(String(p.id))
    );

    if (selectedPlayersToShow.length === 0) {
         showToast("No hay jugadores seleccionados *en la vista actual*.", "error");
        return;
    }

    const selectedDaySlots = getSelectedTimeSlots();
    if (selectedDaySlots.length === 0) {
         showToast("Selecciona al menos un horario (M/T) en el encabezado de la tabla.", "error");
        return;
    }

    let skippedCount = 0; 

    selectedPlayersToShow.forEach(player => {
        const playerId = player.id;
        const playerIdStr = String(playerId);
        
        selectedDaySlots.forEach(daySlot => {
            const targetDayOfWeek = daySlot.dayOfWeek;
            const slot = daySlot.slot;
            const currentZone = DEFAULT_ZONE;
            const currentSource = 'admin'; 

            let targetDate = null;
            for (let i = 0; i < 7; i++) {
                 const date = new Date(currentWeekStartDate); date.setDate(currentWeekStartDate.getDate() + i);
                 if (date.getDay() === targetDayOfWeek) { targetDate = date; break; }
            }
            if (!targetDate) return;
            const dateStr = formatDateYYYYMMDD(targetDate);

            const cell = tableContainer.querySelector(`.slot-cell[data-player-id="${playerIdStr}"][data-date="${dateStr}"][data-slot="${slot}"]`);
            
            if (cell && cell.classList.contains('available-player')) {
                skippedCount++;
                return; // Saltar esta celda, está bloqueada
            }

            const availabilityIndex = availabilityForCurrentWeek.findIndex(a =>
                a.player_id === playerId &&
                a.available_date === dateStr &&
                a.time_slot === slot
            );

            if (makeAvailable) {
                if (availabilityIndex === -1) {
                    availabilityForCurrentWeek.push({
                        player_id: playerId,
                        available_date: dateStr,
                        time_slot: slot,
                        zone: currentZone,
                        source: currentSource 
                    });
                } else {
                    availabilityForCurrentWeek[availabilityIndex].source = currentSource;
                    availabilityForCurrentWeek[availabilityIndex].zone = currentZone;
                }
                if (cell) {
                    cell.classList.remove('available-player');
                    cell.classList.add('available-admin'); 
                    cell.dataset.source = currentSource;
                }
                
                // --- INICIO DE LA MODIFICACIÓN (5/5) ---
                // Asegurarse de que el jugador esté en el set 'any' y tenga el ícono correcto
                playersWithAnyAvailability.add(playerId);
                const iconCell = cell?.closest('tr').querySelector('.player-name-cell .material-icons');
                if (!iconCell && !playersWithPlayerAvailability.has(playerId)) {
                    const nameSpan = cell?.closest('tr').querySelector('.player-name-cell .flex-grow');
                    if (nameSpan) {
                         nameSpan.insertAdjacentHTML('afterend', '<span class="material-icons !text-sm text-green-500" title="Disponibilidad cargada por admin">admin_panel_settings</span>');
                    }
                }
                // --- FIN DE LA MODIFICACIÓN (5/5) ---
                
            } else { // (makeAvailable = false, o sea, borrar)
                if (availabilityIndex !== -1) {
                    availabilityForCurrentWeek.splice(availabilityIndex, 1);
                }
                if (cell) {
                    cell.classList.remove('available-admin', 'available-player');
                    cell.dataset.source = '';
                }
                
                // --- INICIO DE LA MODIFICACIÓN (5/5) ---
                // Revisar si el jugador AÚN tiene disponibilidad
                const allAvailForPlayer = availabilityForCurrentWeek.filter(a => a.player_id == playerId);
                if (allAvailForPlayer.length === 0) {
                    playersWithAnyAvailability.delete(playerId); // Quitar del set
                    const iconCell = cell?.closest('tr').querySelector('.player-name-cell .material-icons');
                    if (iconCell) iconCell.remove(); // Quitar ícono
                }
                // --- FIN DE LA MODIFICACIÓN (5/5) ---
            }
        });
    });

    if (skippedCount > 0) {
        showToast(`${skippedCount} celdas fueron omitidas por estar cargadas por jugadores.`, "info");
    }

    const checkboxesInHeader = tableContainer.querySelectorAll('thead .column-select-cb');
    checkboxesInHeader.forEach(cb => cb.checked = false);
}

async function saveAllChanges() {
    btnSaveAll.disabled = true;
    btnSaveAll.innerHTML = '<div class="spinner inline-block mr-2"></div> Guardando...';

    const currentWeekSet = new Set();
    availabilityForCurrentWeek
        .filter(a => a.time_slot === 'mañana' || a.time_slot === 'tarde')
        .forEach(a => currentWeekSet.add(`${a.player_id}-${a.available_date}-${a.time_slot}-${a.zone || DEFAULT_ZONE}-${a.source || 'admin'}`) );

    const toInsert = [];
    const toDeleteConditions = [];

    const parseKey = (key) => {
        const parts = key.split('-');
        
        if (parts.length !== 7) { 
            console.warn("Clave inválida (partes incorrectas):", key, "Se esperaban 7, se obtuvieron", parts.length); 
            return null; 
        }
        
        const playerId = parseInt(parts[0], 10);
        
        // Reconstruir la fecha desde parts[1], parts[2], y parts[3]
        const dateStr = `${parts[1]}-${parts[2]}-${parts[3]}`;
        
        // Validar que la fecha reconstruida tenga el formato YYYY-MM-DD
        if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
             console.warn("Formato de fecha no reconocido en clave:", key);
             return null;
        }

        const timeSlot = parts[4];
        const zone = parts[5];
        const source = parts[6];
        
        if (isNaN(playerId) || !dateStr || !timeSlot || !zone || !source) {
            console.warn("Clave inválida (datos nulos):", key, {playerId, dateStr, timeSlot, zone, source}); 
            return null;
        }
        
        return { player_id: playerId, available_date: dateStr, time_slot: timeSlot, zone: zone, source: source };
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
                    zone: parsed.zone,
                    source: parsed.source
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
    
    if (checkbox.checked) { 
        selectedPlayerIds.add(playerId); 
    } else { 
        selectedPlayerIds.delete(playerId); 
    }
    updateSelectedPlayerVisuals();
}

function handleSelectAllPlayers(event) {
    const isChecked = event.target.checked;
    
    if (isChecked) {
        displayedPlayers.forEach(p => selectedPlayerIds.add(String(p.id)));
    } else {
        displayedPlayers.forEach(p => selectedPlayerIds.delete(String(p.id)));
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
         const numDisplayed = displayedPlayers.length;
         let numSelectedDisplayed = 0;
         
         displayedPlayers.forEach(p => {
             if (selectedPlayerIds.has(String(p.id))) {
                 numSelectedDisplayed++;
             }
         });

         if (numDisplayed === 0) {
             selectAllCheckbox.checked = false;
             selectAllCheckbox.indeterminate = false;
         } else if (numSelectedDisplayed === numDisplayed) {
             selectAllCheckbox.checked = true;
             selectAllCheckbox.indeterminate = false;
         } else if (numSelectedDisplayed > 0) {
             selectAllCheckbox.checked = false;
             selectAllCheckbox.indeterminate = true;
         } else {
             selectAllCheckbox.checked = false;
             selectAllCheckbox.indeterminate = false;
         }
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
// --- INICIO DE LA MODIFICACIÓN (5/5) ---
playerSourceFilter.addEventListener('change', filterAndRenderTable); // Añadir listener
// --- FIN DE LA MODIFICACIÓN (5/5) ---
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
            if (target !== checkbox && !target.closest('.player-select-cb') && !target.closest('.material-icons')) {
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