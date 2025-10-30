import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
import { generateMatchSuggestions } from './matchmaking_logic.js';

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
// Nuevos elementos para slots dinámicos
const slotsListContainer = document.getElementById('slots-list-container');
const btnAddSlotRow = document.getElementById('btn-add-slot-row');


// --- ESTADO ---
let allPlayers = new Map();
let allTournaments = [];
let allCategories = [];
let currentWeekStartDate = getStartOfWeek(new Date());
let currentWeekDaysOptions = []; // Opciones para el select de día
let currentSuggestions = [];
let playersByTournament = new Map();
let activeEditingCell = null;
let playerMatchCounts = new Map();
let playerPendingCounts = new Map();

// --- FUNCIONES AUXILIARES ---
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

// --- INICIO DE LA MODIFICACIÓN (Lógica de Turno) ---
/**
 * Determina si una hora (HH:MM) pertenece al turno "mañana" o "tarde".
 * Mañana: 07:00 a 13:00 inclusive.
 * Tarde: 13:01 en adelante (y horas de madrugada).
 */
function getTurno(timeString) {
    if (!timeString) return 'tarde'; // Default si está vacío
    try {
        const parts = timeString.split(':');
        const hour = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);

        // Regla: "7 de la mañana hasta la 1" (13:00) es MAÑANA.
        if (hour >= 7 && hour < 13) {
            // (7:00 - 12:59) -> Mañana
            return 'mañana';
        }
        if (hour === 13 && minutes === 0) {
            // (13:00 exactas) -> Mañana
            return 'mañana';
        }
        
        // Regla: "pasadas las 13 horas" es TARDE.
        // (13:01 en adelante, y 00:00-06:59)
        return 'tarde';

    } catch (e) {
        return 'tarde'; // Default en caso de error
    }
}
// --- FIN DE LA MODIFICACIÓN ---


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
        allCategories = Array.from(categoriesMap.values());
        allPlayers = new Map((playersData || []).map(p => [p.id, { ...p }]));

        playersByTournament.clear();
        inscriptionsData.forEach(ins => {
            if (!playersByTournament.has(ins.tournament_id)) {
                playersByTournament.set(ins.tournament_id, new Set());
            }
            playersByTournament.get(ins.tournament_id).add(ins.player_id);
        });

        if (tournamentCheckboxList) {
            if (allTournaments.length > 0) {
                tournamentCheckboxList.innerHTML = allTournaments.map(t => `
                    <div class="tournament-checkbox-item">
                        <label>
                            <input type="checkbox" class="tournament-checkbox" value="${t.id}">
                            ${t.name} <span class="tournament-category-span">(${t.categoryName})</span>
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

        // Llama a displayWeek, que ahora también inicializa el editor de slots
        displayWeek(currentWeekStartDate);
        showStep('configuration');
    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar datos iniciales", "error");
        if (tournamentCheckboxList) tournamentCheckboxList.innerHTML = '<p class="text-red-500 text-sm p-4 text-center">Error al cargar torneos.</p>';
    }
}

// --- NAVEGACIÓN SEMANAL Y EDITOR DE SLOTS ---
function displayWeek(startDate) {
    currentWeekStartDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    if (currentWeekDisplay) currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;
    
    // Generar las opciones de día para TODA la semana (7 días)
    const weekDates = getWeekDates(startDate);
    currentWeekDaysOptions = weekDates
        .map(date => {
            const dateStr = formatDateYYYYMMDD(date);
            const dayName = DAYS_OF_WEEK[date.getDay()];
            const dateLabel = formatDateDDMM(date);
            return { value: dateStr, text: `${dayName} ${dateLabel}` };
        });

    // Inicializar (o reiniciar) el editor de slots
    initSlotEditor();
    clearResults(true);
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

/**
 * Inicializa el editor de slots: limpia el contenedor y añade una fila en blanco.
 */
function initSlotEditor() {
    if (!slotsListContainer) return;
    slotsListContainer.innerHTML = '';
    addSlotRow(); // Añadir la primera fila por defecto
}

/**
 * Añade una nueva fila de slot al DOM.
 * @param {object} [data] - Datos opcionales para pre-rellenar la fila (para duplicar).
 * @param {HTMLElement} [insertAfterRow] - Fila opcional después de la cual insertar la nueva.
 */
function addSlotRow(data = {}, insertAfterRow = null) {
    if (!slotsListContainer) return;

    const slotRow = document.createElement('div');
    slotRow.className = 'slot-row';

    const dayOptions = currentWeekDaysOptions
        .map(opt => `<option value="${opt.value}">${opt.text}</option>`)
        .join('');

    // --- INICIO DE LA MODIFICACIÓN (Botón Duplicar) ---
    slotRow.innerHTML = `
        <div>
            <label for="slot-sede">Sede</label>
            <select class="slot-row-input slot-sede">
                <option value="Funes">Funes</option>
                <option value="Centro">Centro</option>
            </select>
        </div>
        <div>
            <label for="slot-date">Día</label>
            <select class="slot-row-input slot-date">
                ${dayOptions || '<option value="">No hay días</option>'}
            </select>
        </div>
        <div>
            <label for="slot-time">Hora</label>
            <input type="time" class="slot-row-input slot-time" step="900" value="09:00">
        </div>
        <div>
            <label for="slot-canchas">Canchas</label>
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
    
    // Pre-rellenar valores si se pasaron datos (para duplicar)
    slotRow.querySelector('.slot-sede').value = data.sede || 'Funes';
    slotRow.querySelector('.slot-date').value = data.date || currentWeekDaysOptions[0]?.value || '';
    slotRow.querySelector('.slot-time').value = data.time || '08:00';
    slotRow.querySelector('.slot-canchas').value = data.canchas || 6;

    if (insertAfterRow) {
        insertAfterRow.after(slotRow);
    } else {
        slotsListContainer.appendChild(slotRow);
    }
    // --- FIN DE LA MODIFICACIÓN ---
}

/**
 * Manejador de clics para el contenedor de slots (eliminar y duplicar).
 */
function handleSlotListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const row = button.closest('.slot-row');
    if (!row) return;

    if (action === 'remove-slot') {
        row.remove();
        if (slotsListContainer.children.length === 0) {
            addSlotRow();
        }
    } else if (action === 'duplicate-slot') {
        handleSlotDuplicate(row);
    }
}

/**
 * Duplica una fila de slot.
 * @param {HTMLElement} row - La fila a duplicar.
 */
function handleSlotDuplicate(row) {
    const data = {
        sede: row.querySelector('.slot-sede').value,
        date: row.querySelector('.slot-date').value,
        time: row.querySelector('.slot-time').value,
        canchas: row.querySelector('.slot-canchas').value
    };
    addSlotRow(data, row); // Pasa la fila actual para insertar después
}
// --- FIN LÓGICA DE DUPLICAR ---


/**
 * Recopila todos los slots definidos por el usuario desde el DOM.
 */
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
                date: date, // YYYY-MM-DD
                time: time, // HH:MM
                turno: getTurno(time), // 'mañana' or 'tarde'
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

        const [
            { data: inscriptionsData, error: iError },
            { data: availabilityData, error: aError },
            { data: allSelectedTournamentMatches, error: tMatchesError },
            { data: programmedOutsideData, error: mError }
        ] = await Promise.all([
            supabase.from('tournament_players').select('player_id, zone_name, tournament_id').in('tournament_id', selectedTournamentIds),
            supabase.from('player_availability').select('player_id, available_date, time_slot, zone').gte('available_date', startStr).lte('available_date', endStr),
            supabase.from('matches').select('player1_id, player2_id, player3_id, player4_id, match_date, winner_id').in('tournament_id', selectedTournamentIds),
            supabase.from('matches').select('match_date, match_time, location').gte('match_date', startStr).lte('match_date', endStr).is('winner_id', null).not('tournament_id', 'in', `(${selectedTournamentIds.join(',')})`)
        ]);
        if (iError) throw iError; if (aError) throw aError; if (tMatchesError) throw tMatchesError;
        if (mError) throw mError;

        playerMatchCounts.clear();
        playerPendingCounts.clear();
        (allSelectedTournamentMatches || []).forEach(match => {
            if (!match.match_date) return;
            const matchDateStr = match.match_date.split('T')[0];
            const isPast = matchDateStr < todayStr;
            const isPlayed = !!match.winner_id;
            const playersInMatch = [match.player1_id, match.player2_id, match.player3_id, match.player4_id].filter(p => p !== null && p !== undefined);

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

        const inputs = {
            allPlayers, playerMatchCounts,
            inscriptions: inscriptionsData || [],
            availability: (availabilityData || []).map(item => ({ ...item, available_date: item.available_date.split('T')[0] })),
            history: historyDataPlayedOnly || [],
            programmedMatches: (programmedOutsideData || []).map(item => ({...item, match_date: item.match_date.split('T')[0]})),
            availableSlots: definedSlots,
            categories: allCategories.filter(c => selectedCategoryIds.includes(c.id)),
            tournaments: allTournaments.filter(t => selectedTournamentIds.includes(t.id))
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
/**
 * APLANA EL OBJETO DE SUGERENCIAS Y BUSCA LOS COLORES CORRECTOS
 */
function flattenSuggestions(suggestionsBySlot) {
    let flatList = []; let matchCounter = 0;
    for (const slotKey in suggestionsBySlot) {
        const [sede, date, time] = slotKey.split('|');
        const matches = suggestionsBySlot[slotKey];
        matches.forEach((match) => { // 'match' here is { playerA_id, playerB_id, categoryName, isRevancha, ... }
            const playerA = getPlayerInfo(match.playerA_id);
            const playerB = getPlayerInfo(match.playerB_id);
            
            // Buscar el torneo (y color) que coincida con el categoryName
            let tournament = allTournaments.find(t => t.categoryName === match.categoryName);
            // Fallback: si no se encuentra (raro), buscar por el category_id del jugador A
            if (!tournament && playerA) {
                tournament = allTournaments.find(t => t.category_id === playerA.category_id);
            }

            const categoryColor = tournament?.categoryColor || '#b45309';
            const tournamentId = tournament?.id || null;

            flatList.push({
                _id: `match_${matchCounter++}`,
                sede, date, time,
                canchaNum: match.canchaNum,
                player1_id: match.playerA_id,
                player2_id: match.playerB_id,
                player1_info: playerA,
                player2_info: playerB,
                tournament_id: tournamentId, // Usar el ID encontrado
                categoryName: match.categoryName,
                categoryColor: categoryColor, // Usar el color encontrado
                isRevancha: match.isRevancha
            });
        });
    } return flatList;
}

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
                matchesInSede.sort((a, b) => a.canchaNum - b.canchaNum || a.time.localeCompare(b.time));

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

/**
 * RENDERIZA UNA FILA <tr> DE SUGERENCIA
 */
function renderSuggestionRow(match) {
    const player1 = match.player1_info;
    const player2 = match.player2_info;
    const player1Name = player1?.name || 'N/A';
    const player2Name = player2?.name || 'N/A';
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
    
    const isRevancha = match.isRevancha;
    const resultadoDisplay = isRevancha ? '<span style="color: #ef4444; font-weight: 900; font-size: 1.1rem;">R</span>' : '';

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

// --- LÓGICA DE EDICIÓN DE TABLA ---
function getCellContent(match, field) {
    const player1 = match.player1_info;
    const player2 = match.player2_info;
    switch(field) {
        case 'canchaNum': return match.canchaNum || '?';
        case 'time': return match.time ? match.time.substring(0, 5) : 'HH:MM';
        case 'player1_id': return player1?.name || 'N/A';
        case 'player2_id': return player2?.name || 'N/A';
        case 'tournament_id': return match.categoryName || 'N/A'; // Usamos categoryName para mostrar
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
            // Resetear jugadores
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
                // Actualizar celdas de jugador a N/A
                const player1Cell = rowElement.querySelector(`td[data-field="player1_id"]`);
                if (player1Cell) player1Cell.innerHTML = getCellContent(match, 'player1_id'); // Mostrará N/A

                const player2Cell = rowElement.querySelector(`td[data-field="player2_id"]`);
                if (player2Cell) player2Cell.innerHTML = getCellContent(match, 'player2_id'); // Mostrará N/A

                // Actualizar color de la celda de categoría
                const catCell = rowElement.querySelector(`td[data-field="tournament_id"]`);
                if(catCell) catCell.style.color = match.categoryColor;

                 // Resetear también los logos/fondos de las celdas Pts
                 const pts1Cell = rowElement.querySelector('td.pts-col:nth-of-type(1)');
                 const pts2Cell = rowElement.querySelector('td.pts-col:nth-of-type(2)');
                 if(pts1Cell) {
                     pts1Cell.style.background = '#3a3838'; // Color por defecto
                     pts1Cell.innerHTML = ''; // Limpiar logo
                 }
                 if(pts2Cell) {
                    pts2Cell.style.background = '#3a3838'; // Color por defecto
                    pts2Cell.innerHTML = ''; // Limpiar logo
                 }
            }
             else if (field === 'player1_id' || field === 'player2_id') {
                 // Actualizar colores/logos de equipo al cambiar jugador
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
        } else { // type === 'tournament'
             allTournaments.forEach(t => {
                options += `<option value="${t.id}" ${Number(t.id) === Number(currentValue) ? 'selected' : ''}>${t.name}</option>`;
             });
        }
        inputElement.innerHTML = options;

    } else if (type === 'time') {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue || '';

    } else { // type === 'number' (canchaNum)
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

    if (type === 'time') {
        flatpickr(inputElement, {
            enableTime: true, noCalendar: true, dateFormat: "H:i",
            time_24hr: true, defaultDate: currentValue,
            onClose: (selectedDates, dateStr, instance) => {
                closeActiveEditor(true, dateStr);
            }
        }).open();
    } else {
        inputElement.focus();
        if (inputElement.tagName === 'SELECT' && typeof inputElement.showPicker === 'function') {
            try { inputElement.showPicker(); } catch(e) {}
        }
    }
}


function closeActiveEditor(save = false, newValue = null) {
    if (!activeEditingCell) return;

    const input = activeEditingCell.querySelector('.editing-input-cell');
    let needsUpdate = false;

    if (input) {
        if (input._flatpickr) {
            input._flatpickr.destroy();
             needsUpdate = save && newValue !== null;
        }
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

// --- MANEJO DE ELIMINACIÓN DE SUGERENCIA ---
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

// --- PROGRAMACIÓN FINAL ---
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

// --- Lógica de Pasos (Mostrar/Ocultar) ---
function showStep(stepName) {
    if (stepName === 'configuration') {
        configurationStepDiv?.classList.remove('hidden');
        resultsStepDiv?.classList.add('hidden');
    } else if (stepName === 'results') {
        configurationStepDiv?.classList.add('hidden');
        resultsStepDiv?.classList.remove('hidden');
    }
}

// --- EVENT LISTENERS GENERALES ---
document.addEventListener('DOMContentLoaded', () => {
    if (header) { try { header.innerHTML = renderHeader(); } catch (e) { console.error("Error renderizando header:", e); } }
    loadInitialData(); // Esto llamará a displayWeek, que a su vez llama a initSlotEditor

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

    // Listeners para el editor de slots dinámico
    if (btnAddSlotRow) btnAddSlotRow.addEventListener('click', () => addSlotRow());
    if (slotsListContainer) slotsListContainer.addEventListener('click', handleSlotListClick);

    // Listeners para la tabla de resultados
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