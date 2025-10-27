import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
import { generateMatchSuggestions } from './matchmaking_logic.js';

requireRole('admin');

// --- CONSTANTES ---
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HORARIOS = {
    'mañana': ['09:00', '10:30', '12:30'],
    'tarde': ['14:30', '16:00']
};
const SEDES = ['funes', 'centro'];

// --- ELEMENTOS DEL DOM ---
const header = document.getElementById('header');
const tournamentMultiSelect = document.getElementById('tournament-multiselect');
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
const oddPlayersSection = document.getElementById('odd-players-section');
const oddPlayersListUl = document.getElementById('odd-players-list');
const slotsFunesDiv = document.getElementById('slots-funes');
const slotsCentroDiv = document.getElementById('slots-centro');

// --- ESTADO ---
let allPlayers = new Map();
let allTournaments = [];
let allCategories = [];
let currentWeekStartDate = getStartOfWeek(new Date());
let currentSuggestions = [];
let playersByTournament = new Map();
let activeEditingCell = null;

// --- FUNCIONES AUXILIARES ---
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
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
function getPlayerName(playerId) {
    // Convertir a número por si acaso viene como string
    const id = Number(playerId);
    return allPlayers.get(id)?.name || 'N/A';
}
function getPlayerCategoryName(playerId) {
    const id = Number(playerId); // Convertir
    const player = allPlayers.get(id);
    const category = allCategories.find(c => c.id === player?.category_id);
    return category?.name || 'N/A';
}

// --- CARGA INICIAL ---
async function loadInitialData() {
    try {
        const [
            { data: tournamentsData, error: tError },
            { data: playersData, error: pError },
            { data: inscriptionsData, error: iError }
         ] = await Promise.all([
             supabase.from('tournaments')
                .select('id, name, category:category_id(id, name)')
                .not('category.name', 'eq', 'Equipos'),
             supabase.from('players').select('id, name, category_id'),
             supabase.from('tournament_players').select('player_id, tournament_id')
         ]);
        if (tError) throw tError; if (pError) throw pError; if (iError) throw iError;

        const categoriesMap = new Map();
        allTournaments = sortTournaments(
            (tournamentsData || []).filter(t => t.category != null).map(t => {
                categoriesMap.set(t.category.id, { id: t.category.id, name: t.category.name });
                return { id: t.id, name: t.name, category_id: t.category.id, categoryName: t.category.name };
            })
        );
        allCategories = Array.from(categoriesMap.values());
        allPlayers = new Map((playersData || []).map(p => [p.id, { ...p, matchesPlayed: 0 }]));

        playersByTournament.clear();
        inscriptionsData.forEach(ins => {
            if (!playersByTournament.has(ins.tournament_id)) {
                playersByTournament.set(ins.tournament_id, new Set());
            }
            playersByTournament.get(ins.tournament_id).add(ins.player_id);
        });

        if (tournamentMultiSelect) {
            tournamentMultiSelect.innerHTML = '';
            allTournaments.forEach(t => {
                tournamentMultiSelect.innerHTML += `<option value="${t.id}">${t.name} (${t.categoryName})</option>`;
            });
        }
        displayWeek(currentWeekStartDate);
    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar datos iniciales", "error");
        if (tournamentMultiSelect) tournamentMultiSelect.innerHTML = '<option value="">Error al cargar</option>';
    }
}

// --- NAVEGACIÓN SEMANAL ---
function displayWeek(startDate) {
    currentWeekStartDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    if (currentWeekDisplay) currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;
    renderSlotDefiners(getWeekDates(startDate));
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

// --- LÓGICA DE LA INTERFAZ (Slots y Selección Torneos) ---
function renderSlotDefiners(weekDates) {
    let funesHTML = ''; let centroHTML = '';
    const relevantDays = weekDates.filter(date => [0, 5, 6].includes(date.getDay()));
    for (const date of relevantDays) {
        const dayName = DAYS[date.getDay()]; const dateStr = formatDateYYYYMMDD(date);
        const dayHTML = (sede) => `
            <div class="slot-day-container !bg-gray-900 !border-gray-700 mb-3">
                <h4 class="slot-day-header !border-gray-600">${dayName} ${formatDateDDMM(date)}</h4>
                <div class="space-y-2">
                    ${Object.entries(HORARIOS).flatMap(([turno, horas]) =>
                        horas.map(hora => `
                            <div class="slot-time-group">
                                <label>
                                    <input type="checkbox" class="slot-checkbox" data-sede="${sede}" data-date="${dateStr}" data-time="${hora}" data-turno="${turno}">
                                    ${hora} hs (${turno})
                                </label>
                                <input type="number" class="slot-canchas-input dark-input" value="6" min="0" max="6" data-sede="${sede}" data-date="${dateStr}" data-time="${hora}" disabled>
                            </div>`)
                    ).join('')}
                </div></div>`;
        funesHTML += dayHTML('funes'); centroHTML += dayHTML('centro');
    }
    if (slotsFunesDiv) slotsFunesDiv.innerHTML = funesHTML || '<p class="text-sm text-gray-400">No hay días programables (Vie/Sáb/Dom) en esta semana.</p>';
    if (slotsCentroDiv) slotsCentroDiv.innerHTML = centroHTML || '<p class="text-sm text-gray-400">No hay días programables (Vie/Sáb/Dom) en esta semana.</p>';
    addSlotDefinerListeners();
}
function handleSlotCheckboxChange(event) {
    const checkbox = event.target;
    const numberInput = checkbox.closest('.slot-time-group').querySelector('.slot-canchas-input');
    if (numberInput) {
        numberInput.disabled = !checkbox.checked;
        if (!checkbox.checked) numberInput.value = 0; else if (numberInput.value === '0') numberInput.value = 6;
    }
}
function addSlotDefinerListeners() {
    document.querySelectorAll('.slot-checkbox').forEach(cb => {
        cb.removeEventListener('change', handleSlotCheckboxChange); cb.addEventListener('change', handleSlotCheckboxChange);
    });
}
function getDefinedSlots() {
    const slots = [];
    document.querySelectorAll('.slot-checkbox:checked').forEach(cb => {
        const numberInput = cb.closest('.slot-time-group').querySelector('.slot-canchas-input');
        const count = parseInt(numberInput.value, 10) || 0;
        if (count > 0) {
            slots.push({ sede: cb.dataset.sede, date: cb.dataset.date, time: cb.dataset.time, turno: cb.dataset.turno, canchasDisponibles: count });
        }
    }); return slots;
}
function getSelectedTournaments() {
    if (!tournamentMultiSelect) return [];
    return Array.from(tournamentMultiSelect.selectedOptions).map(opt => Number(opt.value));
}

// --- LÓGICA PRINCIPAL: GENERACIÓN DE SUGERENCIAS ---
async function handleFindSuggestions() {
    const selectedTournamentIds = getSelectedTournaments();
    const definedSlots = getDefinedSlots();
    if (selectedTournamentIds.length === 0) { showToast("Debes seleccionar al menos un torneo.", "error"); return; }
    if (definedSlots.length === 0) { showToast("Debes habilitar al menos un slot.", "error"); return; }

    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.remove('hidden');
    clearResults(true);

    try {
        const weekDates = getWeekDates(currentWeekStartDate);
        const startStr = formatDateYYYYMMDD(weekDates[0]);
        const endStr = formatDateYYYYMMDD(weekDates[6]);

        const [ { data: inscriptionsData, error: iError }, { data: availabilityData, error: aError },
                { data: historyData, error: hError }, { data: programmedData, error: mError } ] = await Promise.all([
            supabase.from('tournament_players').select('player_id, zone_name, tournament_id').in('tournament_id', selectedTournamentIds),
            supabase.from('player_availability').select('player_id, available_date, time_slot, zone').gte('available_date', startStr).lte('available_date', endStr),
            supabase.from('matches').select('player1_id, player2_id, tournament_id, winner_id').in('tournament_id', selectedTournamentIds).not('winner_id', 'is', null),
            supabase.from('matches').select('match_date, match_time, location').gte('match_date', startStr).lte('match_date', endStr).is('winner_id', null)
        ]);
        if (iError) throw iError; if (aError) throw aError; if (hError) throw hError; if (mError) throw mError;

        const selectedCategoryIds = [...new Set(allTournaments.filter(t => selectedTournamentIds.includes(t.id)).map(t => t.category_id))];
        const inputs = {
            allPlayers, inscriptions: inscriptionsData || [], availability: (availabilityData || []).map(item => ({ ...item, available_date: item.available_date.split('T')[0] })),
            history: historyData || [], programmedMatches: (programmedData || []).map(item => ({...item, match_date: item.match_date.split('T')[0]})),
            availableSlots: definedSlots, categories: allCategories.filter(c => selectedCategoryIds.includes(c.id)),
            tournaments: allTournaments.filter(t => selectedTournamentIds.includes(t.id))
        };

        const { suggestionsBySlot, oddPlayers, playerMatchCounts } = await generateMatchSuggestions(inputs);

        // --- CORRECCIÓN AQUÍ ---
        // Resetear contador antes de actualizar
        allPlayers.forEach(player => player.matchesPlayed = 0);
        // Verificar si playerMatchCounts existe antes de iterar
        if (playerMatchCounts && typeof playerMatchCounts.forEach === 'function') {
            playerMatchCounts.forEach((count, playerId) => {
                 const player = allPlayers.get(playerId);
                 if(player) player.matchesPlayed = count;
            });
        } else {
             console.warn("playerMatchCounts no fue devuelto o no es iterable.");
             // Opcional: Mostrar un toast si quieres notificar al usuario
             // showToast("No se pudo obtener el historial de partidos jugados para priorizar.", "warning");
        }
        // --- FIN CORRECCIÓN ---

        currentSuggestions = flattenSuggestions(suggestionsBySlot);
        renderResults(currentSuggestions, oddPlayers);

    } catch (error) { // ESTA ERA LA LÍNEA 259
        console.error("Error finding suggestions:", error);
        showToast("Error al buscar sugerencias: " + (error.message || "Error desconocido"), "error");
        clearResults(true);
    } finally {
        if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    }
}


// --- RENDERIZADO DE RESULTADOS ---
function flattenSuggestions(suggestionsBySlot) {
    let flatList = []; let matchCounter = 0;
    for (const slotKey in suggestionsBySlot) {
        const [sede, date, time] = slotKey.split('|');
        const matches = suggestionsBySlot[slotKey];
        matches.forEach((match, index) => {
            const playerA = allPlayers.get(match.playerA_id);
            const playerB = allPlayers.get(match.playerB_id);
            const tournament = allTournaments.find(t => t.category_id === playerA?.category_id);
            let priority = 'medium';
            // Asegurarse que playerA y playerB existen antes de leer matchesPlayed
            if (match.isRevancha) priority = 'high';
            else if (playerA?.matchesPlayed === 0 || playerB?.matchesPlayed === 0) priority = 'low';

            flatList.push({
                _id: `match_${matchCounter++}`, sede, date, time,
                canchaNum: index + 1,
                player1_id: match.playerA_id, player2_id: match.playerB_id,
                tournament_id: tournament?.id || null, categoryName: match.categoryName,
                isRevancha: match.isRevancha, priority
            });
        });
    } return flatList;
}

function renderResults(suggestionsList, oddPlayerIds) {
    if (suggestionsGridContainer) {
        if (suggestionsList.length > 0) {
            const grouped = suggestionsList.reduce((acc, match) => {
                const key = `${match.sede}|${match.date}|${match.time}`;
                if (!acc[key]) acc[key] = []; acc[key].push(match); return acc;
            }, {});
            let tableHTML = `<table class="suggestion-program-table"><thead><tr>
                <th class="!text-left">Prioridad</th><th>Cancha</th><th>Hora</th>
                <th class="!text-right">Jugador 1</th><th>vs</th><th class="!text-left">Jugador 2</th>
                <th class="!text-left">Torneo</th><th>Eliminar</th>
                </tr></thead><tbody>`;
            const sortedSlotKeys = Object.keys(grouped).sort();
            for (const slotKey of sortedSlotKeys) {
                const matches = grouped[slotKey];
                matches.sort((a, b) => {
                    const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                });
                const [sede, date, time] = slotKey.split('|');
                const dateObj = new Date(date + 'T00:00:00'); // Asegurar UTC para evitar problemas de zona horaria
                const headerText = `${sede.toUpperCase()} - ${DAYS[dateObj.getUTCDay()]} ${formatDateDDMM(dateObj)} - ${time} hs`; // Usar getUTCDay
                tableHTML += `<tr class="group-header-row"><td colspan="8">${headerText} (${matches.length} Partidos)</td></tr>`;
                matches.forEach(match => { tableHTML += renderSuggestionRow(match); });
            }
            tableHTML += '</tbody></table>';
            suggestionsGridContainer.innerHTML = tableHTML;
            if (suggestionsSection) suggestionsSection.classList.remove('hidden');
        } else {
            suggestionsGridContainer.innerHTML = '<p class="text-gray-500 italic px-4 py-6 text-center">No se generaron sugerencias.</p>';
            if (suggestionsSection) suggestionsSection.classList.add('hidden');
        }
    }
    if (oddPlayersListUl) {
         if (oddPlayerIds && oddPlayerIds.length > 0) {
            const oddByCategory = oddPlayerIds.reduce((acc, p) => {
                const playerInfo = allPlayers.get(p.player_id);
                const category = allCategories.find(c => c.id === playerInfo?.category_id);
                const catName = category?.name || 'Categoría Desconocida';
                if (!acc[catName]) acc[catName] = { players: [], reason: p.reason };
                acc[catName].players.push(getPlayerName(p.player_id));
                return acc;
             }, {});
            oddPlayersListUl.innerHTML = Object.entries(oddByCategory).map(([catName, data]) => `
                <li><strong class="text-yellow-400 text-sm">${catName}:</strong>
                <span class="text-xs text-gray-300">${data.players.join(', ')}</span>
                <em class="text-xs text-gray-500 block">(Motivo: ${data.reason})</em></li>`
            ).join('');
        } else {
            oddPlayersListUl.innerHTML = '<li class="text-gray-500 italic">No quedaron jugadores sobrantes.</li>';
        }
        if(oddPlayersSection) oddPlayersSection.classList.remove('hidden');
    }
    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    updateProgramButtonState();
}

function renderSuggestionRow(match) {
    const playerA_name = getPlayerName(match.player1_id);
    const playerB_name = getPlayerName(match.player2_id);
    const tournament = allTournaments.find(t => t.id === match.tournament_id);
    const priorityTitle = { high: 'Alta (Revancha)', medium: 'Media (Normal)', low: 'Baja (Jugador nuevo)' };

    return `
        <tr class="data-row" data-match-id="${match._id}">
            <td class="!text-left">
                <span class="priority-indicator priority-${match.priority}" title="${priorityTitle[match.priority]}"></span>
                ${match.isRevancha ? '<span class="material-icons text-red-400 text-sm" title="Revancha">history</span>' : ''}
            </td>
            <td class="editable-cell" data-field="canchaNum" data-type="number">${match.canchaNum}</td>
            <td class="editable-cell" data-field="time" data-type="time">${match.time}</td>
            <td class="player-name player-name-right editable-cell" data-field="player1_id" data-type="player">
                ${playerA_name || 'Seleccionar...'}
                <div class="category-name">${getPlayerCategoryName(match.player1_id)}</div>
            </td>
            <td class="vs">vs</td>
            <td class="player-name player-name-left editable-cell" data-field="player2_id" data-type="player">
                ${playerB_name || 'Seleccionar...'}
                <div class="category-name">${getPlayerCategoryName(match.player2_id)}</div>
            </td>
            <td class="!text-left editable-cell" data-field="tournament_id" data-type="tournament">
                ${tournament?.name || 'Seleccionar...'}
            </td>
            <td>
                <button class="action-btn" data-action="delete-suggestion" title="Eliminar Sugerencia">
                    <span class="material-icons text-base">delete</span>
                </button>
            </td>
        </tr>`;
}

function clearResults(hideSections = false) {
    currentSuggestions = [];
    if (suggestionsGridContainer) suggestionsGridContainer.innerHTML = '<p class="text-gray-500 italic px-4 py-6 text-center">Genera sugerencias para ver la grilla editable.</p>';
    if (oddPlayersListUl) oddPlayersListUl.innerHTML = '';
    if (hideSections) {
        if (suggestionsSection) suggestionsSection.classList.add('hidden');
        if (oddPlayersSection) oddPlayersSection.classList.add('hidden');
    }
    updateProgramButtonState();
}

// --- LÓGICA DE EDICIÓN DE TABLA ---
function handleCellDoubleClick(e) {
    const cell = e.target.closest('.editable-cell');
    if (!cell || cell === activeEditingCell) return;
    if (activeEditingCell) closeActiveEditor(false);

    activeEditingCell = cell;
    const matchId = cell.closest('tr').dataset.matchId;
    const match = currentSuggestions.find(m => m._id === matchId);
    if (!match) { activeEditingCell = null; return; }

    const field = cell.dataset.field;
    const type = cell.dataset.type;
    const currentValue = match[field];
    cell.dataset.originalContent = cell.innerHTML;

    let inputElement;
    if (type === 'player' || type === 'tournament') {
        inputElement = document.createElement('select');
        let options = '<option value="">Seleccionar...</option>';
        if (type === 'player') {
            const tournamentId = match.tournament_id;
            const otherPlayerId = (field === 'player1_id') ? match.player2_id : match.player1_id;
            const enrolledPlayerIds = playersByTournament.get(tournamentId) || new Set();
            enrolledPlayerIds.forEach(playerId => {
                if (playerId !== otherPlayerId) { // No mostrar al oponente (comparar como números)
                    options += `<option value="${playerId}" ${Number(playerId) === Number(currentValue) ? 'selected' : ''}>${getPlayerName(playerId)}</option>`;
                }
            });
        } else {
            const player1Id = Number(match.player1_id); // Asegurar número
            const categoryId = allPlayers.get(player1Id)?.category_id;
            if(categoryId) {
                 allTournaments.filter(t => t.category_id === categoryId).forEach(t => {
                     options += `<option value="${t.id}" ${Number(t.id) === Number(currentValue) ? 'selected' : ''}>${t.name}</option>`;
                 });
            } else { options = '<option value="">Error: Jugador 1 sin categoría</option>'; }
        }
        inputElement.innerHTML = options;
    } else if (type === 'time') {
        inputElement = document.createElement('input'); inputElement.type = 'text'; inputElement.value = currentValue || '';
    } else {
        inputElement = document.createElement('input'); inputElement.type = type === 'number' ? 'number' : 'text';
        inputElement.value = currentValue || ''; if(type === 'number') inputElement.min = "1";
    }

    inputElement.className = 'editing-input-cell'; inputElement.dataset.field = field; inputElement.dataset.matchId = matchId;
    cell.innerHTML = ''; cell.appendChild(inputElement);

    if (type === 'time') {
        flatpickr(inputElement, { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, defaultDate: currentValue,
            onClose: (selectedDates, dateStr) => { closeActiveEditor(true, dateStr); }
        }).open();
    } else {
        inputElement.focus();
        if (inputElement.tagName === 'SELECT' && typeof inputElement.showPicker === 'function') { try { inputElement.showPicker(); } catch(e) {} }
    }
}

function closeActiveEditor(save = false, newValue = null) {
    if (!activeEditingCell) return;
    const input = activeEditingCell.querySelector('.editing-input-cell');
    let needsUpdate = false; // Flag para saber si se debe actualizar estado/UI

    if (input) {
        // Solo guardar si 'save' es true Y no es el input de flatpickr (onClose se encarga)
        if (save && !input._flatpickr) {
           needsUpdate = true; // Indicar que se debe guardar el valor del input
        }

        // Si había flatpickr, destruirlo
        if (input._flatpickr) input._flatpickr.destroy();
    }

    // Actualizar estado y UI (si needsUpdate es true) o restaurar (si save es false)
    if (needsUpdate) {
         const valueToSave = newValue !== null ? newValue : input.value;
         updateMatchData(input.dataset.matchId, input.dataset.field, valueToSave);
         // updateMatchData ahora se encarga de re-renderizar la fila
    } else if (!save && activeEditingCell.dataset.originalContent) {
         // Restaurar HTML original si no se guardó (Escape o clic afuera sin cambio)
         activeEditingCell.innerHTML = activeEditingCell.dataset.originalContent;
         delete activeEditingCell.dataset.originalContent;
    } else if (!save) {
         // Fallback si no hay originalContent: intentar reconstruir desde estado (menos fiable)
         const field = activeEditingCell.dataset.field;
         const rowId = activeEditingCell.closest('tr')?.dataset.matchId;
         const match = currentSuggestions.find(m => m._id === rowId);
         if(match) {
             let displayValue = match[field] ?? '---';
             if(field === 'player1_id' || field === 'player2_id') displayValue = `${getPlayerName(match[field])}<div class="category-name">${getPlayerCategoryName(match[field])}</div>`;
             else if (field === 'tournament_id') displayValue = allTournaments.find(t=> t.id == match[field])?.name || '---';
             activeEditingCell.innerHTML = displayValue;
         } else {
             activeEditingCell.innerHTML = 'Error'; // fallback extremo
         }
    }

    if(activeEditingCell) activeEditingCell.classList.remove('is-editing'); // Quitar clase si aún existe
    activeEditingCell = null; // Marcar que ya no hay celda activa
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
        if (field === 'tournament_id' && finalValue !== null) { match.player1_id = null; match.player2_id = null; }
    }

    // Siempre re-renderizar la fila para quitar el input y mostrar valor (nuevo o corregido/original)
    const tableBody = suggestionsGridContainer.querySelector('tbody');
    const rowElement = tableBody?.querySelector(`tr[data-match-id="${matchId}"]`);
    if (rowElement) {
         const newRowHTML = renderSuggestionRow(match);
         const temp = document.createElement('tbody'); temp.innerHTML = newRowHTML;
         const newRowElement = temp.firstChild;
         rowElement.parentNode.replaceChild(newRowElement, rowElement);
    } else {
        console.warn("No se encontró fila para re-renderizar:", matchId); renderResults(currentSuggestions, []);
    }
    updateProgramButtonState();
}

function handleEditorChange(e) {
    if (e.target.classList.contains('editing-input-cell') && e.target.tagName === 'SELECT') {
        closeActiveEditor(true);
    }
}
function handleEditorKeyDown(e) {
    if (e.target.classList.contains('editing-input-cell')) {
        if (e.key === 'Enter') { e.preventDefault(); closeActiveEditor(true); }
        else if (e.key === 'Escape') { closeActiveEditor(false); }
    }
}
function handleDocumentClick(e) {
    if (activeEditingCell && !activeEditingCell.contains(e.target) && !e.target.closest('.flatpickr-calendar')) {
        const input = activeEditingCell.querySelector('.editing-input-cell');
        if (input && (input.type === 'text' || input.type === 'number') && !input._flatpickr) {
            closeActiveEditor(true);
        } else { closeActiveEditor(false); }
    }
}
function handleDeleteSuggestion(e) {
    const button = e.target.closest('[data-action="delete-suggestion"]');
    if (!button) return;
    const row = button.closest('tr'); const matchId = row.dataset.matchId;
    currentSuggestions = currentSuggestions.filter(m => m._id !== matchId);
    row.remove(); showToast("Sugerencia eliminada", "info"); updateProgramButtonState();
}

// --- PROGRAMACIÓN FINAL ---
async function handleProgramAll() {
    if (currentSuggestions.length === 0) { showToast("No hay partidos para programar.", "warning"); return; }
    btnProgramAll.disabled = true; btnProgramAll.innerHTML = '<div class="spinner inline-block mr-2"></div> Programando...';

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

        if (errors.length > 0) {
            validationFailed = true;
            invalidRowsInfo.push(`Partido ${getPlayerName(match.player1_id)} vs ${getPlayerName(match.player2_id)} (Falta: ${errors.join(', ')})`);
        } else {
            const tournament = allTournaments.find(t => t.id === match.tournament_id);
            matchesToInsert.push({
                tournament_id: match.tournament_id, category_id: tournament?.category_id || null,
                player1_id: match.player1_id, player2_id: match.player2_id,
                match_date: match.date, match_time: match.time,
                location: `${match.sede.charAt(0).toUpperCase() + match.sede.slice(1)} - Cancha ${match.canchaNum}`
            });
        }
    });

    if (validationFailed) {
        showToast(`Error: ${invalidRowsInfo.length} partido(s) con datos incompletos. Revísalos.`, "error");
        console.error("Partidos inválidos:", invalidRowsInfo);
        btnProgramAll.disabled = false; updateProgramButtonState();
        return;
    }

    try {
        const { error } = await supabase.from('matches').insert(matchesToInsert); if (error) throw error;
        showToast(`${matchesToInsert.length} partidos programados. Redirigiendo...`, "success");
        clearResults(true); currentSuggestions = [];
        setTimeout(() => { window.location.href = '/src/admin/matches.html'; }, 1500);
    } catch (error) {
        console.error("Error al programar:", error); showToast("Error al guardar: " + error.message, "error");
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

// --- EVENT LISTENERS GENERALES ---
document.addEventListener('DOMContentLoaded', () => {
    if (header) { try { header.innerHTML = renderHeader(); } catch (e) { console.error("Error renderizando header:", e); } }
    loadInitialData();

    if (tournamentMultiSelect) tournamentMultiSelect.addEventListener('change', () => clearResults(true));
    if (btnSelectAllTournaments) btnSelectAllTournaments.addEventListener('click', () => {
        if (tournamentMultiSelect) { Array.from(tournamentMultiSelect.options).forEach(opt => opt.selected = true); clearResults(true); }
    });
    if (btnPrevWeek) btnPrevWeek.addEventListener('click', goToPreviousWeek);
    if (btnNextWeek) btnNextWeek.addEventListener('click', goToNextWeek);
    if (btnCurrentWeek) btnCurrentWeek.addEventListener('click', goToCurrentWeek);
    if (btnFindSuggestions) btnFindSuggestions.addEventListener('click', handleFindSuggestions);

    // Listeners para tabla editable
    if (suggestionsGridContainer) {
        suggestionsGridContainer.addEventListener('dblclick', handleCellDoubleClick);
        suggestionsGridContainer.addEventListener('change', handleEditorChange);
        suggestionsGridContainer.addEventListener('keydown', handleEditorKeyDown);
        suggestionsGridContainer.addEventListener('click', handleDeleteSuggestion);
    }
    document.addEventListener('click', handleDocumentClick); // Clic afuera

    if (btnProgramAll) btnProgramAll.addEventListener('click', handleProgramAll);
    updateProgramButtonState();
});