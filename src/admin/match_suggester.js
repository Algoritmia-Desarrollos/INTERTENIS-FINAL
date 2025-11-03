import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
import { generateMatchSuggestions } from './matchmaking_logic.js';
import { calculatePoints } from './calculatePoints.js'; // Importar la función

requireRole('admin');

// --- CONSTANTES ---
const DAYS_OF_WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// --- ELEMENTOS DEL DOM ---
const header = document.getElementById('header');
const configurationStepDiv = document.getElementById('configuration-step');
const resultsStepDiv = document.getElementById('results-step');
const btnBackToConfig = document.getElementById('btn-back-to-config');
const tournamentCheckboxList = document.getElementById('tournament-checkbox-list');
const btnSelectAllTournaments = document.getElementById('btn-select-all-tournaments');
const btnPrevWeek = document.getElementById('btn-prev-week');
const btnNextWeek = document.getElementById('btn-next-week');
const btnCurrentWeek = document.getElementById('btn-current-week');
const currentWeekDisplay = document.getElementById('current-week-display');
const btnFindSuggestions = document.getElementById('btn-find-suggestions');
const loadingSuggestionsDiv = document.getElementById('loading-suggestions');
const suggestionsSection = document.getElementById('suggestions-section');
const suggestionsGridContainer = document.getElementById('suggestions-grid-container');
const btnProgramAll = document.getElementById('btn-program-all');
const programCountSpan = document.getElementById('program-count');
const slotsListContainer = document.getElementById('slots-list-container');
const btnAddSlotRow = document.getElementById('btn-add-slot-row');
// INICIO MODIFICACIÓN: Nuevos selectores
const playersJuegaDosList = document.getElementById('players-juega-dos-list'); // Cambiado de Select a List
const juegaDosCategoryFilter = document.getElementById('juega-dos-category-filter');
const juegaDosSearchInput = document.getElementById('juega-dos-search-input');
const juegaDosCounter = document.getElementById('juega-dos-counter');
const btnClearJuegaDos = document.getElementById('btn-clear-juega-dos');
// FIN MODIFICACIÓN


// --- ESTADO ---
let allPlayers = new Map();
let allPlayersArray = []; // Array de jugadores para filtrar
let allTournaments = [];
let allCategories = [];
let currentWeekStartDate = getStartOfWeek(new Date());
let currentWeekDaysOptions = [];
let currentSuggestions = [];
let playersByTournament = new Map();
let activeEditingCell = null;
let playerMatchCounts = new Map();
let playerPendingCounts = new Map();
let playerMatchCountInSuggestions = new Map();
// NUEVO ESTADO: Set para guardar selecciones de "Juega 2"
let juegaDosSelectedPlayerIds = new Set();

// --- FUNCIONES AUXILIARES ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0,0,0,0);
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
function getWeekDates(startDate) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        dates.push(date);
    }
    return dates;
}
function sortTournaments(tournaments) {
    const getTournamentNumber = (name) => {
        if (!name) return Infinity; const match = name.match(/^(\d+)/); return match ? parseInt(match[1], 10) : Infinity;
    };
    return [...tournaments].sort((a, b) => {
        const numA = getTournamentNumber(a.name); const numB = getTournamentNumber(b.name);
        if (numA !== Infinity && numB !== Infinity) { if (numA !== numB) { return numA - numB; } return a.name.localeCompare(b.name); }
        if (numA !== Infinity) return -1; if (numB !== Infinity) return 1; return a.name.localeCompare(b.name);
    });
}
function getPlayerInfo(playerId) {
    const id = Number(playerId);
    return allPlayers.get(id) || null;
}
function isColorLight(hex) {
    if (!hex) return false;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substr(0, 2), 16),
          g = parseInt(c.substr(2, 2), 16),
          b = parseInt(c.substr(4, 2), 16);
    return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
}
function getTurno(timeString) {
    if (!timeString) return 'tarde';
    try {
        const parts = timeString.split(':');
        const hour = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (hour >= 7 && hour < 13) return 'mañana';
        if (hour === 13 && minutes === 0) return 'mañana';
        return 'tarde';
    } catch (e) {
        return 'tarde';
    }
}
// Función de cálculo de ranking (copiada de rankings.js y adaptada)
function calculateCategoryStats(players, matches) {
    const stats = players.map(player => ({
        playerId: player.id, name: player.name, categoryId: player.category_id, 
        pj: 0, pg: 0, pp: 0, sg: 0, sp: 0, gg: 0, gp: 0, bonus: 0, puntos: 0,
    }));

    matches.forEach(match => {
        // Solo procesar partidos de singles para el ranking de singles
        if (match.player3_id || match.player4_id) return;

        const p1Stat = stats.find(s => s.playerId === match.player1_id);
        const p2Stat = stats.find(s => s.playerId === match.player2_id);
        if (!p1Stat || !p2Stat) return;
        
        p1Stat.pj++; 
        p2Stat.pj++;
        
        let p1SetsWon = 0, p2SetsWon = 0;
        let p1TotalGames = 0, p2TotalGames = 0;
        (match.sets || []).forEach(set => {
            p1TotalGames += set.p1;
            p2TotalGames += set.p2;
            if(set.p1 > set.p2) p1SetsWon++; else p2SetsWon++;
        });

        p1Stat.gg += p1TotalGames;
        p1Stat.gp += p2TotalGames;
        p2Stat.gg += p2TotalGames;
        p2Stat.gp += p1TotalGames;

        p1Stat.sg += p1SetsWon; 
        p1Stat.sp += p2SetsWon;
        p2Stat.sg += p2SetsWon; 
        p2Stat.sp += p1SetsWon;
        
        const { p1_points, p2_points } = calculatePoints(match);
        p1Stat.puntos += p1_points;
        p2Stat.puntos += p2_points;

        const winnerIsSide1 = match.winner_id === match.player1_id;

        if (winnerIsSide1) {
            p1Stat.pg++; 
            p2Stat.pp++;
        } else {
            p2Stat.pg++; 
            p1Stat.pp++;
        }

        if (match.status !== 'completado_wo') {
            if (winnerIsSide1) {
                if (p2TotalGames <= 3) p1Stat.bonus++;
                if (p2SetsWon === 1) p2Stat.bonus++;
            } else {
                if (p1TotalGames <= 3) p2Stat.bonus++;
                if (p1SetsWon === 1) p1Stat.bonus++;
            }
        }
    });

    stats.forEach(s => {
        s.difP = s.pg - s.pp;
        s.difS = s.sg - s.sp;
        s.difG = s.gg - s.gp;
        s.parcial = s.pj > 0 ? (s.puntos / s.pj) : 0;
        s.partidosParaPromediar = Math.max(s.pj, 8);
        s.promedio = s.pj > 0 ? (s.puntos / s.partidosParaPromediar) : 0;
    });

    stats.sort((a, b) => {
        if (a.pj === 0 && b.pj > 0) return 1;
        if (b.pj === 0 && a.pj > 0) return -1;
        if (b.promedio !== a.promedio) return b.promedio - a.promedio;
        if (b.difP !== a.difP) return b.difP - a.difP;
        if (b.difS !== a.difS) return b.difS - a.difS;
        if (b.difG !== a.difG) return b.difG - a.difG;
        return b.puntos - a.puntos;
    });

    return stats;
}

// *** INICIO CORRECCIÓN DE BUG ***
// Mover funciones auxiliares (que se llaman antes) aquí
function updateProgramButtonState() {
    const count = currentSuggestions.length;
    if (programCountSpan) programCountSpan.textContent = count;
    if (btnProgramAll) {
        btnProgramAll.disabled = count === 0;
        if (!btnProgramAll.disabled && !btnProgramAll.innerHTML.includes('spinner')) {
             btnProgramAll.innerHTML = `<span class="material-icons">schedule_send</span> Programar Partidos (<span id="program-count">${count}</span>)`;
        } else if (count === 0) {
             btnProgramAll.innerHTML = `<span class="material-icons">schedule_send</span> Programar Partidos (<span id="program-count">0</span>)`;
        }
    }
}

function clearResults(hideSections = false) {
    currentSuggestions = [];
    playerMatchCounts.clear();
    playerPendingCounts.clear();
    if (suggestionsGridContainer) suggestionsGridContainer.innerHTML = '<p class="text-gray-500 italic px-4 py-6 text-center">Genera sugerencias para ver la grilla editable.</p>';
    if (hideSections && suggestionsSection) {
        suggestionsSection.classList.add('hidden');
    }
    updateProgramButtonState();
}

function showStep(stepName) {
    if (stepName === 'configuration') {
        configurationStepDiv?.classList.remove('hidden');
        resultsStepDiv?.classList.add('hidden');
    } else if (stepName === 'results') {
        configurationStepDiv?.classList.add('hidden');
        resultsStepDiv?.classList.remove('hidden');
    }
}
// *** FIN CORRECCIÓN DE BUG ***


// --- CARGA INICIAL ---
async function loadInitialData() {
    try {
        const [
            { data: tournamentsData, error: tError },
            { data: playersData, error: pError },
            { data: inscriptionsData, error: iError }
         ] = await Promise.all([
             supabase.from('tournaments')
                .select('id, name, category:category_id(id, name, color)')
                .not('category.name', 'eq', 'Equipos'),
             supabase.from('players')
                .select('id, name, category_id, team:team_id(name, image_url, color)')
                .order('name'),
             supabase.from('tournament_players').select('player_id, tournament_id')
         ]);
        if (tError) throw tError; if (pError) throw pError; if (iError) throw iError;

        const categoriesMap = new Map();
        allTournaments = sortTournaments(
            (tournamentsData || []).filter(t => t.category != null).map(t => {
                categoriesMap.set(t.category.id, { id: t.category.id, name: t.category.name, color: t.category.color });
                return { id: t.id, name: t.name, category_id: t.category.id, categoryName: t.category.name, categoryColor: t.category.color };
            })
        );
        allCategories = Array.from(categoriesMap.values()).sort((a,b) => a.name.localeCompare(b.name));
        allPlayers = new Map((playersData || []).map(p => [p.id, { ...p }]));
        allPlayersArray = playersData || []; // Guardar el array para filtrar

        playersByTournament.clear();
        inscriptionsData.forEach(ins => {
            if (!playersByTournament.has(ins.tournament_id)) {
                playersByTournament.set(ins.tournament_id, new Set());
            }
            playersByTournament.get(ins.tournament_id).add(ins.player_id);
        });

        // Popular lista de torneos
        if (tournamentCheckboxList) {
            if (allTournaments.length > 0) {
                tournamentCheckboxList.innerHTML = allTournaments.map(t => `
                    <div class="checkbox-list-item">
                        <label>
                            <input type="checkbox" class="tournament-checkbox" value="${t.id}">
                            ${t.name} <span class="category-span">(${t.categoryName})</span>
                        </label>
                    </div>
                `).join('');
                 tournamentCheckboxList.querySelectorAll('.tournament-checkbox').forEach(cb => {
                     cb.addEventListener('change', () => clearResults(true));
                 });
            } else {
                 tournamentCheckboxList.innerHTML = '<p class="text-gray-400 text-sm p-4 text-center">No hay torneos disponibles.</p>';
            }
        }
        
        // Popular filtro de categoría y lista de "Juega 2"
        if (juegaDosCategoryFilter) {
            juegaDosCategoryFilter.innerHTML = '<option value="all">Todas las Categorías</option>';
            allCategories.forEach(cat => {
                juegaDosCategoryFilter.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });
        }
        populateJuegaDosPlayerList(); // Popular la lista de jugadores
        updateJuegaDosCounter(); // Poner contador en 0

        displayWeek(currentWeekStartDate);
        showStep('configuration');
    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar datos iniciales", "error");
        if (tournamentCheckboxList) tournamentCheckboxList.innerHTML = '<p class="text-red-500 text-sm p-4 text-center">Error al cargar torneos.</p>';
    }
}

// --- INICIO MODIFICACIÓN: Lógica de "Juega 2 Partidos" ---

/**
 * Actualiza la lista de jugadores en "Juega 2" basado en los filtros.
 * Mantiene las selecciones guardadas en `juegaDosSelectedPlayerIds`.
 */
function populateJuegaDosPlayerList() {
    if (!playersJuegaDosList) return;

    const categoryId = juegaDosCategoryFilter.value;
    const searchTerm = normalizeText(juegaDosSearchInput.value);

    let filteredPlayers = allPlayersArray;

    if (categoryId !== 'all') {
        filteredPlayers = filteredPlayers.filter(p => p.category_id == categoryId);
    }

    if (searchTerm) {
        filteredPlayers = filteredPlayers.filter(p => normalizeText(p.name).includes(searchTerm));
    }

    // Regenerar HTML
    playersJuegaDosList.innerHTML = filteredPlayers
        .map(p => {
            const isChecked = juegaDosSelectedPlayerIds.has(p.id) ? 'checked' : ''; // Usar Set
            const categoryName = allCategories.find(c => c.id === p.category_id)?.name || 'N/A';
            return `
                <div class="checkbox-list-item">
                    <label>
                        <input type="checkbox" class="juega-dos-checkbox" value="${p.id}" ${isChecked}>
                        ${p.name} <span class="category-span">(${categoryName})</span>
                    </label>
                </div>
            `;
        })
        .join('');
    
    if (filteredPlayers.length === 0) {
        playersJuegaDosList.innerHTML = '<p class="text-gray-400 text-sm p-4 text-center">No hay jugadores que coincidan.</p>';
    }
}

/**
 * Actualiza el contador de jugadores seleccionados para "Juega 2".
 */
function updateJuegaDosCounter() {
    if (juegaDosCounter) {
        juegaDosCounter.textContent = `${juegaDosSelectedPlayerIds.size} seleccionados`;
    }
}

/**
 * Maneja el clic en un checkbox de la lista "Juega 2".
 * @param {Event} e
 */
function handleJuegaDosCheck(e) {
    const checkbox = e.target.closest('.juega-dos-checkbox');
    if (!checkbox) return;
    
    const playerId = Number(checkbox.value);
    if (checkbox.checked) {
        juegaDosSelectedPlayerIds.add(playerId);
    } else {
        juegaDosSelectedPlayerIds.delete(playerId);
    }
    updateJuegaDosCounter();
}

/**
 * Limpia la selección de jugadores "Juega 2".
 */
function handleClearJuegaDos() {
    juegaDosSelectedPlayerIds.clear();
    updateJuegaDosCounter();
    populateJuegaDosPlayerList(); // Re-renderizar para desmarcar todos los checkboxes visibles
}
// --- FIN MODIFICACIÓN ---


// --- NAVEGACIÓN SEMANAL Y EDITOR DE SLOTS ---
function displayWeek(startDate) {
    currentWeekStartDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    if (currentWeekDisplay) currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;
    
    const weekDates = getWeekDates(startDate);
    currentWeekDaysOptions = weekDates
        .map(date => {
            const dateStr = formatDateYYYYMMDD(date);
            const dayName = DAYS_OF_WEEK[date.getDay()];
            const dateLabel = formatDateDDMM(date);
            return { value: dateStr, text: `${dayName} ${dateLabel}` };
        });

    initSlotEditor();
    clearResults(true); // <-- BUG CORREGIDO: Esta función ahora existe
}
function goToPreviousWeek() {
    const prevWeek = new Date(currentWeekStartDate); prevWeek.setDate(prevWeek.getDate() - 7); displayWeek(prevWeek);
}
function goToNextWeek() {
    const nextWeek = new Date(currentWeekStartDate); nextWeek.setDate(nextWeek.getDate() + 7); displayWeek(nextWeek);
}
function goToCurrentWeek() {
    displayWeek(getStartOfWeek(new Date()));
}
function initSlotEditor() {
    if (!slotsListContainer) return;
    slotsListContainer.innerHTML = '';
    addSlotRow();
}

// --- INICIO: CAMBIO INPUT HORA (PUNTO 3) ---
function addSlotRow(data = {}, insertAfterRow = null) {
    if (!slotsListContainer) return;
    const slotRow = document.createElement('div');
    slotRow.className = 'slot-row';
    const dayOptions = currentWeekDaysOptions
        .map(opt => `<option value="${opt.value}">${opt.text}</option>`)
        .join('');

    // Crear opciones de hora
    let timeOptions = '';
    for (let h = 8; h <= 22; h++) {
        for (let m of ['00', '15', '30', '45']) {
            const timeValue = `${String(h).padStart(2, '0')}:${m}`;
            timeOptions += `<option value="${timeValue}">${timeValue}</option>`;
        }
    }
    // Añadir 23:00 por si acaso
    timeOptions += `<option value="23:00">23:00</option>`;

    slotRow.innerHTML = `
        <div>
            <label>Sede</label>
            <select class="slot-row-input slot-sede">
                <option value="Funes">Funes</option>
                <option value="Centro">Centro</option>
            </select>
        </div>
        <div>
            <label>Día</label>
            <select class="slot-row-input slot-date">
                ${dayOptions || '<option value="">No hay días</option>'}
            </select>
        </div>
        <div>
            <label>Hora</label>
            <select class="slot-row-input slot-time">
                ${timeOptions}
            </select>
        </div>
        <div>
            <label>Canchas</label>
            <input type="number" class="slot-row-input slot-canchas" value="6" min="1" max="10">
        </div>
        <div class="flex-grow-0 flex-shrink-0 flex items-center">
            <button class="slot-row-action-btn slot-row-duplicate-btn" data-action="duplicate-slot" title="Duplicar horario">
                <span class="material-icons">content_copy</span>
            </button>
            <button class="slot-row-action-btn slot-row-remove-btn" data-action="remove-slot" title="Eliminar horario">
                <span class="material-icons">delete</span>
            </button>
        </div>
    `;
    slotRow.querySelector('.slot-sede').value = data.sede || 'Funes';
    slotRow.querySelector('.slot-date').value = data.date || currentWeekDaysOptions[0]?.value || '';
    slotRow.querySelector('.slot-time').value = data.time || '09:00';
    slotRow.querySelector('.slot-canchas').value = data.canchas || 6;
    if (insertAfterRow) {
        insertAfterRow.after(slotRow);
    } else {
        slotsListContainer.appendChild(slotRow);
    }
}
// --- FIN: CAMBIO INPUT HORA (PUNTO 3) ---

// --- INICIO: NUEVA FUNCIÓN PARA PRESETS ---
/**
 * Añade una fila de slot pre-configurada basada en el preset clickeado.
 * @param {string} presetKey - Ej: "vie-m", "sab-t", etc.
 */
function addPresetSlot(presetKey) {
    const data = {
        sede: 'Funes', // Default
        canchas: 6     // Default
    };

    let dayOfWeekUTC = -1;
    let time = '09:00'; // Default mañana

    switch (presetKey) {
        case 'vie-m': dayOfWeekUTC = 5; time = '09:00'; break;
        case 'vie-t': dayOfWeekUTC = 5; time = '15:00'; break;
        case 'sab-m': dayOfWeekUTC = 6; time = '09:00'; break;
        case 'sab-t': dayOfWeekUTC = 6; time = '15:00'; break;
        case 'dom-m': dayOfWeekUTC = 0; time = '09:00'; break;
        case 'dom-t': dayOfWeekUTC = 0; time = '15:00'; break;
    }
    
    data.time = time;

    // Encontrar la fecha (value) para ese día de la semana en la semana actual
    const dayOption = currentWeekDaysOptions.find(opt => {
        // Parsear la fecha YYYY-MM-DD como UTC
        const [y, m, d] = opt.value.split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d));
        return dateObj.getUTCDay() === dayOfWeekUTC;
    });

    if (dayOption) {
        data.date = dayOption.value;
    } else {
        // Fallback al primer día de la semana si no se encuentra
        data.date = currentWeekDaysOptions[0]?.value || '';
    }

    // Llamar a la función existente para añadir la fila
    addSlotRow(data);
}
// --- FIN: NUEVA FUNCIÓN PARA PRESETS ---

function handleSlotListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const row = button.closest('.slot-row');
    if (!row) return;
    if (action === 'remove-slot') {
        row.remove();
        if (slotsListContainer.children.length === 0) addSlotRow();
    } else if (action === 'duplicate-slot') {
        handleSlotDuplicate(row);
    }
}
function handleSlotDuplicate(row) {
    const data = {
        sede: row.querySelector('.slot-sede').value,
        date: row.querySelector('.slot-date').value,
        time: row.querySelector('.slot-time').value,
        canchas: row.querySelector('.slot-canchas').value
    };
    addSlotRow(data, row);
}
function getDefinedSlots() {
    const slots = [];
    if (!slotsListContainer) return slots;
    document.querySelectorAll('#slots-list-container .slot-row').forEach(row => {
        const sede = row.querySelector('.slot-sede').value;
        const date = row.querySelector('.slot-date').value;
        const time = row.querySelector('.slot-time').value;
        const canchasDisponibles = parseInt(row.querySelector('.slot-canchas').value, 10);
        if (sede && date && time && canchasDisponibles > 0) {
            slots.push({
                sede: sede.toLowerCase(),
                date: date,
                time: time,
                turno: getTurno(time),
                canchasDisponibles: canchasDisponibles
            });
        }
    });
    return slots;
}
function getSelectedTournaments() {
    if (!tournamentCheckboxList) return [];
    const checkedBoxes = tournamentCheckboxList.querySelectorAll('.tournament-checkbox:checked');
    return Array.from(checkedBoxes).map(cb => Number(cb.value));
}

// --- LÓGICA PRINCIPAL: GENERACIÓN DE SUGERENCIAS ---
async function handleFindSuggestions() {
    const selectedTournamentIds = getSelectedTournaments();
    const definedSlots = getDefinedSlots();
    if (selectedTournamentIds.length === 0) { showToast("Debes seleccionar al menos un torneo.", "error"); return; }
    if (definedSlots.length === 0) { showToast("Debes definir al menos un horario con canchas disponibles.", "error"); return; }

    showStep('results');
    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.remove('hidden');
    clearResults(false);

    try {
        const weekDates = getWeekDates(currentWeekStartDate);
        const startStr = formatDateYYYYMMDD(weekDates[0]);
        const endStr = formatDateYYYYMMDD(weekDates[6]);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayStr = formatDateYYYYMMDD(today);
        
        // Req ⿧: Usar el Set global que se mantiene actualizado
        const playersWantingTwoMatches = juegaDosSelectedPlayerIds;

        // 1. Cargar 'inscriptionsData' PRIMERO
        const { data: inscriptionsData, error: iError } = await supabase
            .from('tournament_players')
            .select('player_id, zone_name, tournament_id')
            .in('tournament_id', selectedTournamentIds);
        
        if (iError) throw iError;
        
        // 2. Crear 'playerIds' AHORA
        const playerIdsInSelectedTournaments = (inscriptionsData || []).map(i => i.player_id);
        
        // Si no hay jugadores inscritos, no tiene sentido seguir
        if (playerIdsInSelectedTournaments.length === 0) {
            showToast("No hay jugadores inscritos en los torneos seleccionados.", "info");
            clearResults(false);
            loadingSuggestionsDiv.classList.add('hidden');
            return;
        }

        // 3. Cargar el resto de datos en un 'Promise.all'
        const [
            { data: availabilityData, error: aError },
            { data: allSelectedTournamentMatches, error: tMatchesError },
            { data: programmedOutsideData, error: mError },
            { data: metadataData, error: metaError },
            { data: allPlayersInTournaments, error: pError }
        ] = await Promise.all([
            supabase.from('player_availability').select('player_id, available_date, time_slot, zone').gte('available_date', startStr).lte('available_date', endStr),
            supabase.from('matches').select('*').in('tournament_id', selectedTournamentIds),
            supabase.from('matches').select('match_date, match_time, location').gte('match_date', startStr).lte('match_date', endStr).is('winner_id', null).not('tournament_id', 'in', `(${selectedTournamentIds.join(',')})`),
            // *** ESTA ES LA LÍNEA MODIFICADA ***
            supabase.from('ranking_position_metadata').select('tournament_id, rank_position, is_divider_after').in('tournament_id', selectedTournamentIds), // CAMBIADO
            supabase.from('players').select('id, name, category_id').in('id', playerIdsInSelectedTournaments)
        ]);

        if (aError || tMatchesError || mError || metaError || pError) {
            throw new Error(aError?.message || tMatchesError?.message || mError?.message || metaError?.message || pError?.message);
        }

        // --- INICIO DE LA LÓGICA DE CÁLCULO POR TORNEO ---
        
        // 4. Crear Maps para guardar datos por torneo
        const playerRanksPerTournament = new Map(); // Map(tournamentId -> Map(playerId -> rank))
        const playerZonesPerTournament = new Map(); // Map(tournamentId -> Map(playerId -> zone))
        const hasDividersPerTournament = new Map(); // Map(tournamentId -> boolean)

        // 5. Iterar por CADA torneo seleccionado para calcular sus datos
        for (const tournamentId of selectedTournamentIds) {
            // Filtrar datos solo para este torneo
            const playerIdsForThisTournament = new Set(inscriptionsData.filter(i => i.tournament_id === tournamentId).map(i => i.player_id));
            const playersForThisTournament = allPlayersInTournaments.filter(p => playerIdsForThisTournament.has(p.id));
            const matchesForThisTournament = (allSelectedTournamentMatches || []).filter(m => m.tournament_id === tournamentId);
            const metadataForThisTournament = (metadataData || []).filter(m => m.tournament_id === tournamentId);

            // Calcular stats y ranks para *este* torneo
            const playedMatches = matchesForThisTournament.filter(m => m.winner_id);
            const stats = calculateCategoryStats(playersForThisTournament, playedMatches);
            const playerRanks = new Map(stats.map((s, index) => [s.playerId, index + 1]));
            playerRanksPerTournament.set(tournamentId, playerRanks);

            // Calcular zonas SÓLO si hay divisores para *este* torneo
            // **** ESTA ES LA CORRECCIÓN CLAVE ****
            const hasDividers = metadataForThisTournament.some(m => m.is_divider_after === true);
            hasDividersPerTournament.set(tournamentId, hasDividers);

            const playerZones = new Map();
            if (hasDividers) {
                // --- CAMBIO: La metadata ahora se basa en POSICIÓN, no en player_id ---
                const metadataMap = new Map(metadataForThisTournament.map(m => [m.rank_position, m]));
                const sortedRankingForZones = stats.sort((a, b) => (playerRanks.get(a.playerId) || 999) - (playerRanks.get(b.playerId) || 999));
                
                let currentZone = 1;
                sortedRankingForZones.forEach((player, index) => {
                    const rank_position = index + 1; // La posición es 1-based
                    playerZones.set(player.playerId, currentZone);
                    
                    const meta = metadataMap.get(rank_position); // Buscar metadata por POSICIÓN
                    if (meta?.is_divider_after) {
                        currentZone++;
                    }
                });
                // --- FIN CAMBIO ---
            }
            playerZonesPerTournament.set(tournamentId, playerZones);
        }
        
        // *** NUEVO ***: Log para debug
        console.log("Datos de Zonas por Torneo:", hasDividersPerTournament);
        // --- FIN DE LA LÓGICA DE CÁLCULO POR TORNEO ---
        
        // 6. Procesar Partidos Jugados (Req ⿤)
        playerMatchCounts.clear();
        playerPendingCounts.clear();
        (allSelectedTournamentMatches || []).forEach(match => {
            if (!match.match_date) return;
            const matchDateStr = match.match_date.split('T')[0];
            const isPast = matchDateStr < todayStr;
            const isPlayed = !!match.winner_id;
            const playersInMatch = [match.player1_id, match.player2_id, match.player3_id, match.player4_id].filter(p => p != null);

            playersInMatch.forEach(playerId => {
                if (playerId) {
                    if (isPlayed || (!isPlayed && isPast)) {
                        playerMatchCounts.set(playerId, (playerMatchCounts.get(playerId) || 0) + 1);
                    } else if (!isPlayed && !isPast) {
                        playerPendingCounts.set(playerId, (playerPendingCounts.get(playerId) || 0) + 1);
                    }
                }
            });
        });

        const historyDataPlayedOnly = (allSelectedTournamentMatches || []).filter(m => m.winner_id);
        const selectedCategoryIds = [...new Set(allTournaments.filter(t => selectedTournamentIds.includes(t.id)).map(t => t.category_id))];

        // 7. Preparar inputs para el motor de lógica
        const inputs = {
            allPlayers, 
            playerMatchCounts,
            inscriptions: inscriptionsData || [],
            availability: (availabilityData || []).map(item => ({ ...item, available_date: item.available_date.split('T')[0] })),
            history: historyDataPlayedOnly || [],
            programmedMatches: (programmedOutsideData || []).map(item => ({...item, match_date: item.match_date.split('T')[0]})),
            availableSlots: definedSlots,
            categories: allCategories.filter(c => selectedCategoryIds.includes(c.id)),
            tournaments: allTournaments.filter(t => selectedTournamentIds.includes(t.id)),
            playersWantingTwoMatches,
            // Enviar los nuevos Maps
            playerRanksPerTournament,
            playerZonesPerTournament,
            hasDividersPerTournament
        };

        const { suggestionsBySlot, oddPlayers } = await generateMatchSuggestions(inputs);

        currentSuggestions = flattenSuggestions(suggestionsBySlot);
        renderResults(currentSuggestions, oddPlayers);

    } catch (error) {
        console.error("Error finding suggestions:", error);
        showToast("Error al buscar sugerencias: " + (error.message || "Error desconocido"), "error");
        clearResults(false);
    } finally {
        if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    }
}


// --- RENDERIZADO DE RESULTADOS ---

// --- INICIO: FIX DEL ERROR `forEach is not a function` (PUNTO 0) ---
function flattenSuggestions(suggestionsBySlot) {
    let flatList = [];
    let matchCounter = 0;
    playerMatchCountInSuggestions.clear(); // Limpiar conteo para este renderizado

    // suggestionsBySlot es { "sede|date|time|cancha-N": { matchObject } }
    for (const slotKey in suggestionsBySlot) {
        // slotKey es "sede|date|time|cancha-N"
        const [sede, date, time] = slotKey.split('|'); // Parse key
        const match = suggestionsBySlot[slotKey]; // This is the single match OBJECT
        if (!match) continue; // Skip if slot wasn't filled (debería ser raro)

        const playerA = getPlayerInfo(match.playerA_id);
        const playerB = getPlayerInfo(match.playerB_id);
        
        let tournament = allTournaments.find(t => t.categoryName === match.categoryName);
        if (!tournament && playerA) {
            tournament = allTournaments.find(t => t.category_id === playerA.category_id);
        }

        const categoryColor = tournament?.categoryColor || '#b45309';
        const tournamentId = tournament?.id || null;

        const countA = (playerMatchCountInSuggestions.get(match.playerA_id) || 0) + 1;
        playerMatchCountInSuggestions.set(match.playerA_id, countA);
        const countB = (playerMatchCountInSuggestions.get(match.playerB_id) || 0) + 1;
        playerMatchCountInSuggestions.set(match.playerB_id, countB);

        flatList.push({
            _id: `match_${matchCounter++}`,
            sede, date, time, // <-- Get from parsed key
            canchaNum: match.canchaNum,
            player1_id: match.playerA_id,
            player2_id: match.playerB_id,
            player1_info: playerA,
            player2_info: playerB,
            player1_match_count: countA,
            player2_match_count: countB,
            tournament_id: tournamentId,
            categoryName: match.categoryName,
            categoryColor: categoryColor,
            isRevancha: match.isRevancha,
            reason: match.reason 
        });
    }
    return flatList;
}
// --- FIN: FIX DEL ERROR `forEach is not a function` (PUNTO 0) ---

function renderResults(suggestionsList, oddPlayerInfo) {
    if (!suggestionsGridContainer) return;

    if (suggestionsList.length > 0) {
        const groupedByDateSede = suggestionsList.reduce((acc, match) => {
            const date = match.date;
            const sede = match.sede || 'Sin Sede';
            if (!acc[date]) acc[date] = {};
            if (!acc[date][sede]) acc[date][sede] = [];
            acc[date][sede].push(match);
            return acc;
        }, {});

        const sortedDates = Object.keys(groupedByDateSede).sort((a, b) => new Date(a) - new Date(b));
        let tableHTML = '';

        for (const date of sortedDates) {
            const sedesInDate = groupedByDateSede[date];
            if (tableHTML !== '') {
                 tableHTML += `<tr><td colspan="10" style="height: 18px; background: #000; border: none;"></td></tr>`;
            }

            for (const sede in sedesInDate) {
                const matchesInSede = sedesInDate[sede];
                // --- INICIO: CAMBIO ORDEN (PUNTO 2) ---
                matchesInSede.sort((a, b) => a.time.localeCompare(b.time) || a.canchaNum - b.canchaNum);
                // --- FIN: CAMBIO ORDEN (PUNTO 2) ---

                const dateObj = new Date(date + 'T00:00:00Z');
                const weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
                const day = dateObj.getUTCDate();
                const month = dateObj.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
                let formattedDate = `${weekday} ${day} de ${month}`;
                formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

                const headerBgColor = sede.toLowerCase() === 'centro' ? '#222222' : '#fdc100';
                const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';

                tableHTML += `
                    <tr>
                        <td colspan="3" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-right: none;">
                            ${sede.toUpperCase()}
                        </td>
                        <td colspan="7" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-left: none;">
                            ${formattedDate} (${matchesInSede.length} Partidos)
                        </td>
                    </tr>`;

                matchesInSede.forEach(match => {
                    tableHTML += renderSuggestionRow(match);
                });
            }
        }

        suggestionsGridContainer.innerHTML = `
            <table class="matches-report-style">
                <colgroup>
                    <col style="width: 4%"> <col style="width: 5%"> <col style="width: 4%">
                    <col style="width: 25%"> <col style="width: 5%"> <col style="width: 13%">
                    <col style="width: 5%"> <col style="width: 25%"> <col style="width: 5%">
                    <col style="width: 5%">
                </colgroup>
                <thead>
                 <tr>
                    <th></th>
                    <th>Cancha</th><th>Hora</th><th style="text-align: right; padding-right: 8px;">Jugador 1</th>
                    <th>Pts</th><th>Resultado</th><th>Pts</th>
                    <th style="text-align: left; padding-left: 8px;">Jugador 2</th><th>Cat.</th><th>Acción</th>
                 </tr>
                </thead>
                <tbody>${tableHTML}</tbody>
            </table>
        `;
        if (suggestionsSection) suggestionsSection.classList.remove('hidden');
    } else {
        suggestionsGridContainer.innerHTML = '<p class="text-gray-500 italic px-4 py-6 text-center">No se generaron sugerencias.</p>';
        if (suggestionsSection) suggestionsSection.classList.add('hidden');
    }
    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    updateProgramButtonState();
}

function renderSuggestionRow(match) {
    const player1 = match.player1_info;
    const player2 = match.player2_info;
    
    // Usar el Set global para chequear
    const p1NameSuffix = juegaDosSelectedPlayerIds.has(match.player1_id) ? ` (${match.player1_match_count})` : '';
    const p2NameSuffix = juegaDosSelectedPlayerIds.has(match.player2_id) ? ` (${match.player2_match_count})` : '';

    const player1Name = (player1?.name || 'N/A') + p1NameSuffix;
    const player2Name = (player2?.name || 'N/A') + p2NameSuffix;
    
    const p1TeamColor = player1?.team?.color;
    const p2TeamColor = player2?.team?.color;
    const p1TeamImage = player1?.team?.image_url;
    const p2TeamImage = player2?.team?.image_url;
    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
    const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
    const sede = match.sede || '';
    const cancha = match.canchaNum || '?';
    const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
    const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';
    const hora = match.time ? match.time.substring(0, 5) : 'HH:MM';
    const categoryName = match.categoryName || 'N/A';
    const categoryColor = match.categoryColor || '#b45309';
    const team1PointsDisplay = p1TeamImage ? `<img src="${p1TeamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">` : '';
    const team2PointsDisplay = p2TeamImage ? `<img src="${p2TeamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">` : '';
    
    // INICIO MODIFICACIÓN: Mostrar Razón del cruce
    let resultadoDisplay = '';
    if (match.reason === 'ZONA_INCOMPATIBLE') {
        resultadoDisplay = '<span style="color: #f87171; font-weight: 900; font-size: 0.9rem;" title="Zonas no contiguas (Ej: 1 vs 3)">ZONA!</span>';
    } else if (match.reason === 'REVANCHA_FORZADA') {
        resultadoDisplay = '<span style="color: #ef4444; font-weight: 900; font-size: 1.1rem;" title="Revancha (forzada)">R!</span>';
    } else if (match.isRevancha) {
        resultadoDisplay = '<span style="color: #f59e0b; font-weight: 900; font-size: 1.1rem;" title="Revancha">R</span>';
    } else if (match.reason === 'PARTIDO_CLAVE') {
        resultadoDisplay = '<span style="color: #facc15; font-weight: 900; font-size: 0.9rem;" title="Partido Clave (Zonas Contiguas)">ZONA</span>';
    } else if (match.reason === 'NUEVO') {
        resultadoDisplay = '<span style="color: #22c55e; font-weight: 900; font-size: 0.9rem;" title="Nunca jugaron">N</span>';
    }
    // FIN MODIFICACIÓN

    return `
        <tr class="data-row" data-match-id="${match._id}">
            <td style="padding: 4px; background-color: #1a1a1a;">
                <input type="checkbox" disabled class="match-checkbox" style="transform: scale(1.2); opacity: 0.3;">
            </td>
            <td class="editable-cell" data-field="canchaNum" data-type="number" style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold; font-size: 12pt">${cancha}</td>
            <td class="editable-cell" data-field="time" data-type="time" style="background:#000;color:#fff;">${hora}</td>
            <td class="player-name player-name-right editable-cell" data-field="player1_id" data-type="player" style='background:#000;color:#fff;font-size:12pt;'>${player1Name}</td>
            <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${team1PointsDisplay}</td>
            <td class="font-mono" style="background:#000;color:#fff;">${resultadoDisplay}</td>
            <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${team2PointsDisplay}</td>
            <td class="player-name player-name-left editable-cell" data-field="player2_id" data-type="player" style='background:#000;color:#fff;font-size:12pt;'>${player2Name}</td>
            <td class="cat-col editable-cell" data-field="tournament_id" data-type="tournament" style="background:#000;color:${categoryColor};">${categoryName}</td>
            <td class="action-cell" style="background:#000;">
                <button class="p-1 rounded-full hover:bg-gray-700" data-action="delete-suggestion" title="Eliminar Sugerencia">
                    <span class="material-icons text-base" style="color:#f87171;">delete</span>
                </button>
            </td>
        </tr>`;
}

// --- LÓGICA DE EDICIÓN DE TABLA ---
function getCellContent(match, field) {
    const player1 = match.player1_info;
    const player2 = match.player2_info;
    
    // Leer desde el Set global
    const p1NameSuffix = juegaDosSelectedPlayerIds.has(match.player1_id) ? ` (${match.player1_match_count})` : '';
    const p2NameSuffix = juegaDosSelectedPlayerIds.has(match.player2_id) ? ` (${match.player2_match_count})` : '';

    switch(field) {
        case 'canchaNum': return match.canchaNum || '?';
        case 'time': return match.time ? match.time.substring(0, 5) : 'HH:MM';
        case 'player1_id': return (player1?.name || 'N/A') + p1NameSuffix;
        case 'player2_id': return (player2?.name || 'N/A') + p2NameSuffix;
        case 'tournament_id': return match.categoryName || 'N/A';
        default: return match[field] ?? '---';
    }
}
function updateMatchData(matchId, field, value) {
    const matchIndex = currentSuggestions.findIndex(m => m._id === matchId);
    if (matchIndex === -1) return;
    const match = currentSuggestions[matchIndex];
    let conversionError = false;
    let valueChanged = false;
    let finalValue;

    if (field === 'player1_id' || field === 'player2_id' || field === 'tournament_id') {
        finalValue = value ? parseInt(value, 10) : null; if (isNaN(finalValue)) finalValue = null;
    } else if (field === 'canchaNum') {
        finalValue = parseInt(value, 10);
        if (isNaN(finalValue) || finalValue < 1) { conversionError = true; finalValue = match.canchaNum || 1; showToast("N° cancha inválido.", "warning");}
    } else { finalValue = value; }

    valueChanged = match[field] !== finalValue;

    if (valueChanged && !conversionError) {
        match[field] = finalValue;
        if (field === 'player1_id' && finalValue) match.player1_info = getPlayerInfo(finalValue);
        if (field === 'player2_id' && finalValue) match.player2_info = getPlayerInfo(finalValue);
        if (field === 'tournament_id' && finalValue) {
            const tournament = allTournaments.find(t => t.id === finalValue);
            match.categoryName = tournament?.categoryName || 'N/A';
            match.categoryColor = tournament?.categoryColor || '#b45309';
            match.player1_id = null; match.player1_info = null;
            match.player2_id = null; match.player2_info = null;
        }
    }

    const tableBody = suggestionsGridContainer?.querySelector('tbody');
    const rowElement = tableBody?.querySelector(`tr[data-match-id="${matchId}"]`);
    if (rowElement) {
        const editedCell = rowElement.querySelector(`td[data-field="${field}"]`);
        if (editedCell) {
            editedCell.innerHTML = getCellContent(match, field);
            if (field === 'tournament_id') {
                rowElement.querySelector(`td[data-field="player1_id"]`).innerHTML = getCellContent(match, 'player1_id');
                rowElement.querySelector(`td[data-field="player2_id"]`).innerHTML = getCellContent(match, 'player2_id');
                rowElement.querySelector(`td[data-field="tournament_id"]`).style.color = match.categoryColor;
                 const pts1Cell = rowElement.querySelector('td.pts-col:nth-of-type(1)');
                 const pts2Cell = rowElement.querySelector('td.pts-col:nth-of-type(2)');
                 if(pts1Cell) { pts1Cell.style.background = '#3a3838'; pts1Cell.innerHTML = ''; }
                 if(pts2Cell) { pts2Cell.style.background = '#3a3838'; pts2Cell.innerHTML = ''; }
            }
             else if (field === 'player1_id' || field === 'player2_id') {
                 const player1 = match.player1_info;
                 const player2 = match.player2_info;
                 const pts1Cell = rowElement.querySelector('td.pts-col:nth-of-type(1)');
                 const pts2Cell = rowElement.querySelector('td.pts-col:nth-of-type(2)');
                 if(pts1Cell && field === 'player1_id'){
                    const p1TeamColor = player1?.team?.color;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                    const p1TeamImage = player1?.team?.image_url;
                    pts1Cell.style.background = p1TeamColor || '#3a3838';
                    pts1Cell.style.color = p1TextColor;
                    pts1Cell.innerHTML = p1TeamImage ? `<img src="${p1TeamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">` : '';
                 }
                 if(pts2Cell && field === 'player2_id'){
                    const p2TeamColor = player2?.team?.color;
                    const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                    const p2TeamImage = player2?.team?.image_url;
                    pts2Cell.style.background = p2TeamColor || '#3a3838';
                    pts2Cell.style.color = p2TextColor;
                    pts2Cell.innerHTML = p2TeamImage ? `<img src="${p2TeamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">` : '';
                 }
            }
        }
    } else {
        console.warn("No se encontró fila/celda para actualizar:", matchId, field);
        renderResults(currentSuggestions, []);
    }
    updateProgramButtonState();
}
function handleCellDoubleClick(e) {
    const cell = e.target.closest('.editable-cell');
    if (!cell || cell === activeEditingCell) return;
    if (activeEditingCell) closeActiveEditor(false);
    activeEditingCell = cell;
    const matchId = cell.closest('tr')?.dataset.matchId;
    const match = currentSuggestions.find(m => m._id === matchId);
    if (!match) { activeEditingCell = null; return; }
    const field = cell.dataset.field;
    const type = cell.dataset.type;
    const currentValue = match[field];
    cell.dataset.originalContent = cell.innerHTML;
    cell.classList.add('is-editing');
    let inputElement;
    if (type === 'player' || type === 'tournament') {
        inputElement = document.createElement('select');
        let options = '<option value="">Seleccionar...</option>';
        if (type === 'player') {
            const tournamentId = match.tournament_id;
            if (!tournamentId) {
                options = '<option value="">Elija Torneo primero</option>';
                inputElement.disabled = true;
            } else {
                const otherPlayerId = (field === 'player1_id') ? match.player2_id : match.player1_id;
                const enrolledPlayerIds = playersByTournament.get(tournamentId) || new Set();
                enrolledPlayerIds.forEach(playerId => {
                    const playerCanPlay = !otherPlayerId || playerId !== otherPlayerId;
                    if (playerCanPlay) {
                        const playerInfo = getPlayerInfo(playerId);
                        if(playerInfo){
                            options += `<option value="${playerId}" ${Number(playerId) === Number(currentValue) ? 'selected' : ''}>${playerInfo.name}</option>`;
                        }
                    }
                });
            }
        } else {
             allTournaments.forEach(t => {
                options += `<option value="${t.id}" ${Number(t.id) === Number(currentValue) ? 'selected' : ''}>${t.name}</option>`;
             });
        }
        inputElement.innerHTML = options;
    } else if (type === 'time') {
        // --- INICIO: CAMBIO INPUT HORA (PUNTO 3) ---
        inputElement = document.createElement('select');
        let timeOptions = '';
        for (let h = 8; h <= 22; h++) {
            for (let m of ['00', '15', '30', '45']) {
                const timeValue = `${String(h).padStart(2, '0')}:${m}`;
                timeOptions += `<option value="${timeValue}" ${timeValue === currentValue ? 'selected' : ''}>${timeValue}</option>`;
            }
        }
        timeOptions += `<option value="23:00" ${"23:00" === currentValue ? 'selected' : ''}>23:00</option>`;
        inputElement.innerHTML = timeOptions;
        // --- FIN: CAMBIO INPUT HORA (PUNTO 3) ---
    } else {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.value = currentValue || '';
        inputElement.min = "1";
        inputElement.max = "10";
    }
    inputElement.className = 'editing-input-cell';
    inputElement.dataset.field = field;
    inputElement.dataset.matchId = matchId;
    cell.innerHTML = '';
    cell.appendChild(inputElement);
    
    // --- INICIO: CAMBIO INPUT HORA (PUNTO 3) ---
    // Quitar lógica de flatpickr
    // if (type === 'time') { ... }
    
    inputElement.focus();
    if (inputElement.tagName === 'SELECT' && typeof inputElement.showPicker === 'function') {
        try { inputElement.showPicker(); } catch(e) {}
    }
    // --- FIN: CAMBIO INPUT HORA (PUNTO 3) ---
}
function closeActiveEditor(save = false, newValue = null) {
    if (!activeEditingCell) return;
    const input = activeEditingCell.querySelector('.editing-input-cell');
    let needsUpdate = false;
    if (input) {
        // --- INICIO: CAMBIO INPUT HORA (PUNTO 3) ---
        // Quitar lógica de flatpickr
        if (input._flatpickr) {
            input._flatpickr.destroy();
             needsUpdate = save && newValue !== null;
        } // --- FIN: CAMBIO INPUT HORA (PUNTO 3) ---
        else if (save) {
            newValue = input.value;
            needsUpdate = true;
        }
    }
    const field = activeEditingCell.dataset.field;
    const rowId = activeEditingCell.closest('tr')?.dataset.matchId;
    activeEditingCell.classList.remove('is-editing');
    if (needsUpdate && rowId && field) {
        updateMatchData(rowId, field, newValue);
    } else if (!save && rowId && field) {
        const match = currentSuggestions.find(m => m._id === rowId);
        if(match) {
            activeEditingCell.innerHTML = getCellContent(match, field);
        } else if (activeEditingCell.dataset.originalContent) {
             activeEditingCell.innerHTML = activeEditingCell.dataset.originalContent;
        } else {
            activeEditingCell.innerHTML = 'Error';
        }
        if (activeEditingCell.dataset.originalContent) {
            delete activeEditingCell.dataset.originalContent;
        }
    }
    activeEditingCell = null;
}
function handleEditorChange(e) {
    const target = e.target;
    if (target.tagName === 'SELECT' && target.closest('.is-editing')) {
        closeActiveEditor(true);
    }
}
function handleEditorKeyDown(e) {
    const target = e.target;
    if ((target.classList.contains('editing-input-cell') || target.tagName === 'SELECT') && target.closest('.is-editing')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            closeActiveEditor(true);
        } else if (e.key === 'Escape') {
            closeActiveEditor(false);
        } else if (e.key === 'Tab') {
             setTimeout(() => closeActiveEditor(true), 0);
        }
    }
}
function handleDocumentClick(e) {
    if (activeEditingCell && !activeEditingCell.contains(e.target) && !e.target.closest('.flatpickr-calendar')) {
        const input = activeEditingCell.querySelector('.editing-input-cell');
        if (input && (input.type === 'text' || input.type === 'number') && !input._flatpickr) {
             closeActiveEditor(true);
        } else {
             closeActiveEditor(false);
        }
    }
}
function handleDeleteSuggestion(e) {
    const button = e.target.closest('button[data-action="delete-suggestion"]');
    if (!button) return;
    const row = button.closest('tr');
    const matchId = row?.dataset.matchId;
    if (!matchId) return;
    currentSuggestions = currentSuggestions.filter(m => m._id !== matchId);
    row.remove();
    showToast("Sugerencia eliminada", "info");
    updateProgramButtonState();
}
async function handleProgramAll() {
    if (currentSuggestions.length === 0) { showToast("No hay partidos para programar.", "warning"); return; }
    btnProgramAll.disabled = true;
    btnProgramAll.innerHTML = '<div class="spinner inline-block mr-2"></div> Programando...';
    const matchesToInsert = []; let validationFailed = false; let invalidRowsInfo = [];
    currentSuggestions.forEach((match) => {
        let errors = [];
        if (!match.tournament_id) errors.push("Torneo");
        if (!match.player1_id) errors.push("Jugador 1");
        if (!match.player2_id) errors.push("Jugador 2");
        if (!match.date) errors.push("Fecha");
        if (!match.time) errors.push("Hora");
        if (!match.sede) errors.push("Sede");
        if (!match.canchaNum || match.canchaNum < 1) errors.push("Cancha");
         const tournament = allTournaments.find(t => t.id === match.tournament_id);
         const player1 = getPlayerInfo(match.player1_id);
         const player2 = getPlayerInfo(match.player2_id);
         if (tournament && player1 && player1.category_id !== tournament.category_id) {
             errors.push(`Jugador 1 no pertenece a ${tournament.categoryName}`);
         }
         if (tournament && player2 && player2.category_id !== tournament.category_id) {
            errors.push(`Jugador 2 no pertenece a ${tournament.categoryName}`);
         }
        if (errors.length > 0) {
            validationFailed = true;
            const p1Name = player1?.name || '?';
            const p2Name = player2?.name || '?';
            invalidRowsInfo.push(`Partido ${p1Name} vs ${p2Name} (${match._id}) (Error: ${errors.join(', ')})`);
        } else {
            matchesToInsert.push({
                tournament_id: match.tournament_id, category_id: tournament?.category_id || null,
                player1_id: match.player1_id, player2_id: match.player2_id,
                player3_id: null, player4_id: null,
                match_date: match.date, match_time: match.time,
                location: `${match.sede.charAt(0).toUpperCase() + match.sede.slice(1)} - Cancha ${match.canchaNum}`,
                status: 'programado', sets: null, winner_id: null, bonus_loser: false
            });
        }
    });
    if (validationFailed) {
        showToast(`Error: ${invalidRowsInfo[0]}. Revísalo.`, "error");
        console.error("Partidos inválidos:", invalidRowsInfo);
        btnProgramAll.disabled = false; updateProgramButtonState();
        return;
    }
    try {
        console.log("Insertando partidos:", matchesToInsert);
        const { error } = await supabase.from('matches').insert(matchesToInsert); if (error) throw error;
        showToast(`${matchesToInsert.length} partidos programados con éxito. Redirigiendo...`, "success");
        clearResults(true); currentSuggestions = [];
        setTimeout(() => { window.location.href = '/src/admin/matches.html'; }, 1500);
    } catch (error) {
        console.error("Error al programar:", error); showToast("Error al guardar los partidos: " + error.message, "error");
        btnProgramAll.disabled = false; updateProgramButtonState();
    }
}
// --- EVENT LISTENERS GENERALES ---
document.addEventListener('DOMContentLoaded', () => {
    if (header) { try { header.innerHTML = renderHeader(); } catch (e) { console.error("Error renderizando header:", e); } }
    loadInitialData(); 
    if (btnSelectAllTournaments && tournamentCheckboxList) {
        btnSelectAllTournaments.addEventListener('click', () => {
            const checkboxes = tournamentCheckboxList.querySelectorAll('.tournament-checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => { cb.checked = !allChecked; });
            clearResults(true);
        });
    }
    if (btnPrevWeek) btnPrevWeek.addEventListener('click', goToPreviousWeek);
    if (btnNextWeek) btnNextWeek.addEventListener('click', goToNextWeek);
    if (btnCurrentWeek) btnCurrentWeek.addEventListener('click', goToCurrentWeek);
    if (btnFindSuggestions) btnFindSuggestions.addEventListener('click', handleFindSuggestions);
    if (btnBackToConfig) btnBackToConfig.addEventListener('click', () => showStep('configuration'));
    if (btnAddSlotRow) btnAddSlotRow.addEventListener('click', () => addSlotRow());
    if (slotsListContainer) slotsListContainer.addEventListener('click', handleSlotListClick);
    
    // --- INICIO DE LA MODIFICACIÓN: Listener para botones de preset ---
    const configStep = document.getElementById('configuration-step');
    if (configStep) {
        configStep.addEventListener('click', (e) => {
            const presetButton = e.target.closest('button[data-action="add-preset"]');
            if (presetButton) {
                e.preventDefault();
                const preset = presetButton.dataset.preset;
                addPresetSlot(preset);
            }
        });
    }
    // --- FIN DE LA MODIFICACIÓN ---
    
    // INICIO MODIFICACIÓN: Listeners para los nuevos filtros y lista de "Juega 2"
    if (juegaDosCategoryFilter) juegaDosCategoryFilter.addEventListener('change', populateJuegaDosPlayerList);
    if (juegaDosSearchInput) juegaDosSearchInput.addEventListener('input', populateJuegaDosPlayerList);
    if (playersJuegaDosList) playersJuegaDosList.addEventListener('click', handleJuegaDosCheck);
    if (btnClearJuegaDos) btnClearJuegaDos.addEventListener('click', handleClearJuegaDos);
    // FIN MODIFICACIÓN

    if (suggestionsGridContainer) {
        suggestionsGridContainer.addEventListener('dblclick', handleCellDoubleClick);
        suggestionsGridContainer.addEventListener('change', handleEditorChange);
        suggestionsGridContainer.addEventListener('keydown', handleEditorKeyDown);
        suggestionsGridContainer.addEventListener('click', handleDeleteSuggestion);
    }
    document.addEventListener('click', handleDocumentClick, true);
    if (btnProgramAll) btnProgramAll.addEventListener('click', handleProgramAll);
    updateProgramButtonState();
});