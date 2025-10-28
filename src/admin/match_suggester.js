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
let playerMatchCounts = new Map(); // Partidos Jugados (PJ) = Jugados + Pendientes Pasados
let playerPendingCounts = new Map(); // Partidos Pendientes Futuros (P) = Pendientes con fecha >= hoy

// --- FUNCIONES AUXILIARES ---
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes como inicio de semana
    return new Date(d.setDate(diff));
}
function formatDateYYYYMMDD(date) {
    // Usar hora local para comparar con la fecha actual del navegador
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
    const id = Number(playerId);
    return allPlayers.get(id)?.name || 'N/A';
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

        displayWeek(currentWeekStartDate);
        showStep('configuration');
    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar datos iniciales", "error");
        if (tournamentCheckboxList) tournamentCheckboxList.innerHTML = '<p class="text-red-500 text-sm p-4 text-center">Error al cargar torneos.</p>';
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
    const relevantDays = weekDates.filter(date => [0, 5, 6].includes(date.getDay())); // Dom, Vie, Sab
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
    if (!tournamentCheckboxList) return [];
    const checkedBoxes = tournamentCheckboxList.querySelectorAll('.tournament-checkbox:checked');
    return Array.from(checkedBoxes).map(cb => Number(cb.value));
}

// --- LÓGICA PRINCIPAL: GENERACIÓN DE SUGERENCIAS ---
async function handleFindSuggestions() {
    const selectedTournamentIds = getSelectedTournaments();
    const definedSlots = getDefinedSlots();
    if (selectedTournamentIds.length === 0) { showToast("Debes seleccionar al menos un torneo.", "error"); return; }
    if (definedSlots.length === 0) { showToast("Debes habilitar al menos un slot.", "error"); return; }

    showStep('results');
    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.remove('hidden');
    clearResults(false);

    try {
        const weekDates = getWeekDates(currentWeekStartDate);
        const startStr = formatDateYYYYMMDD(weekDates[0]); // Inicio de la semana objetivo
        const endStr = formatDateYYYYMMDD(weekDates[6]);   // Fin de la semana objetivo
        const today = new Date(); today.setHours(0, 0, 0, 0); // Establecer a medianoche para comparar solo la fecha
        const todayStr = formatDateYYYYMMDD(today); // Fecha de hoy en YYYY-MM-DD local

        // Fetch de datos necesarios
        const [
            { data: inscriptionsData, error: iError },
            { data: availabilityData, error: aError },
            // Fetch TODOS los partidos (jugados y pendientes) de los TORNEOS SELECCIONADOS
            { data: allSelectedTournamentMatches, error: tMatchesError },
            // Fetch PENDIENTES matches OUTSIDE selected tournaments but WITHIN the target week (para slot checking)
            { data: programmedOutsideData, error: mError }
        ] = await Promise.all([
            supabase.from('tournament_players').select('player_id, zone_name, tournament_id').in('tournament_id', selectedTournamentIds),
            supabase.from('player_availability').select('player_id, available_date, time_slot, zone').gte('available_date', startStr).lte('available_date', endStr),
            supabase.from('matches').select('player1_id, player2_id, player3_id, player4_id, match_date, winner_id').in('tournament_id', selectedTournamentIds),
            supabase.from('matches').select('match_date, match_time, location').gte('match_date', startStr).lte('match_date', endStr).is('winner_id', null).not('tournament_id', 'in', `(${selectedTournamentIds.join(',')})`)
        ]);
        if (iError) throw iError; if (aError) throw aError; if (tMatchesError) throw tMatchesError;
        if (mError) throw mError;

        // Calcular PJ (Jugados + Pendientes Pasados) y P (Pendientes Futuros)
        playerMatchCounts.clear();
        playerPendingCounts.clear();
        (allSelectedTournamentMatches || []).forEach(match => {
            if (!match.match_date) return;

            const matchDateStr = match.match_date.split('T')[0];
            const isPast = matchDateStr < todayStr;
            const isPlayed = !!match.winner_id;
            const playersInMatch = [match.player1_id, match.player2_id, match.player3_id, match.player4_id].filter(Boolean);

            playersInMatch.forEach(playerId => {
                if (isPlayed || (!isPlayed && isPast)) {
                    playerMatchCounts.set(playerId, (playerMatchCounts.get(playerId) || 0) + 1);
                } else if (!isPlayed && !isPast) {
                    playerPendingCounts.set(playerId, (playerPendingCounts.get(playerId) || 0) + 1);
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
function flattenSuggestions(suggestionsBySlot) {
    let flatList = []; let matchCounter = 0;
    for (const slotKey in suggestionsBySlot) {
        const [sede, date, time] = slotKey.split('|');
        const matches = suggestionsBySlot[slotKey];
        matches.forEach((match, index) => {
            const playerA = allPlayers.get(match.playerA_id);
            const playerB = allPlayers.get(match.playerB_id);
            const tournament = allTournaments.find(t => t.category_id === playerA?.category_id);
            const player1_matchesPlayed = playerMatchCounts.get(match.playerA_id) || 0;
            const player2_matchesPlayed = playerMatchCounts.get(match.playerB_id) || 0;
            const player1_pendingCount = playerPendingCounts.get(match.playerA_id) || 0;
            const player2_pendingCount = playerPendingCounts.get(match.playerB_id) || 0;

            flatList.push({
                _id: `match_${matchCounter++}`, sede, date, time,
                canchaNum: match.canchaNum,
                player1_id: match.playerA_id,
                player2_id: match.playerB_id,
                player1_matchesPlayed: player1_matchesPlayed,
                player2_matchesPlayed: player2_matchesPlayed,
                player1_pendingCount: player1_pendingCount,
                player2_pendingCount: player2_pendingCount,
                tournament_id: tournament?.id || null,
                categoryName: match.categoryName,
                isRevancha: match.isRevancha
            });
        });
    } return flatList;
}

function renderResults(suggestionsList, oddPlayerInfo) {
    if (suggestionsGridContainer) {
        if (suggestionsList.length > 0) {
            const grouped = suggestionsList.reduce((acc, match) => {
                const key = `${match.sede}|${match.date}|${match.time}`;
                if (!acc[key]) acc[key] = []; acc[key].push(match); return acc;
            }, {});
            let tableHTML = `<table class="suggestion-program-table"><thead><tr>
                <th>Cancha</th><th>Hora</th>
                <th class="!text-right">Jugador 1</th><th>vs</th><th class="!text-left">Jugador 2</th>
                <th class="!text-left">Torneo</th><th>Eliminar</th>
                </tr></thead><tbody>`;
            const sortedSlotKeys = Object.keys(grouped).sort();
            for (const slotKey of sortedSlotKeys) {
                const matches = grouped[slotKey];
                matches.sort((a, b) => {
                    const totalA = a.player1_matchesPlayed + a.player1_pendingCount + a.player2_matchesPlayed + a.player2_pendingCount;
                    const totalB = b.player1_matchesPlayed + b.player1_pendingCount + b.player2_matchesPlayed + b.player2_pendingCount;
                    if (totalA !== totalB) return totalA - totalB;
                    return a.canchaNum - b.canchaNum;
                });
                const [sede, date, time] = slotKey.split('|');
                const dateObj = new Date(date + 'T00:00:00Z'); // Usar Z para indicar UTC
                const headerText = `${sede.toUpperCase()} - ${DAYS[dateObj.getUTCDay()]} ${formatDateDDMM(dateObj)} - ${time} hs`;
                tableHTML += `<tr class="group-header-row"><td colspan="7">${headerText} (${matches.length} Partidos)</td></tr>`;
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
    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    updateProgramButtonState();
}

function renderSuggestionRow(match) {
    const playerA_name = getPlayerName(match.player1_id);
    const playerB_name = getPlayerName(match.player2_id);
    const tournament = allTournaments.find(t => t.id === match.tournament_id);
    const pendingSpan1 = match.player1_pendingCount > 0 ? `<span class="player-pending-count">(+${match.player1_pendingCount} P)</span>` : '';
    const pendingSpan2 = match.player2_pendingCount > 0 ? `<span class="player-pending-count">(+${match.player2_pendingCount} P)</span>` : '';

    return `
        <tr class="data-row" data-match-id="${match._id}">
            <td class="editable-cell" data-field="canchaNum" data-type="number">${match.canchaNum}</td>
            <td class="editable-cell" data-field="time" data-type="time">${match.time}</td>
            <td class="player-name player-name-right editable-cell" data-field="player1_id" data-type="player">
                ${playerA_name || 'Seleccionar...'}
                <span class="player-match-count">(${match.player1_matchesPlayed} PJ)</span>
                ${pendingSpan1}
            </td>
            <td class="vs">vs</td>
            <td class="player-name player-name-left editable-cell" data-field="player2_id" data-type="player">
                ${playerB_name || 'Seleccionar...'}
                <span class="player-match-count">(${match.player2_matchesPlayed} PJ)</span>
                ${pendingSpan2}
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
    playerMatchCounts.clear();
    playerPendingCounts.clear();
    if (suggestionsGridContainer) suggestionsGridContainer.innerHTML = '<p class="text-gray-500 italic px-4 py-6 text-center">Genera sugerencias para ver la grilla editable.</p>';
    if (hideSections) {
        if (suggestionsSection) suggestionsSection.classList.add('hidden');
    }
    updateProgramButtonState();
}

// --- LÓGICA DE EDICIÓN DE TABLA ---
function getCellContent(match, field) {
    switch(field) {
        case 'canchaNum': return match.canchaNum;
        case 'time': return match.time;
        case 'player1_id':
            const pendingSpan1 = match.player1_pendingCount > 0 ? `<span class="player-pending-count">(+${match.player1_pendingCount} P)</span>` : '';
            return `${getPlayerName(match.player1_id) || 'Seleccionar...'}<span class="player-match-count">(${match.player1_matchesPlayed} PJ)</span>${pendingSpan1}`;
        case 'player2_id':
            const pendingSpan2 = match.player2_pendingCount > 0 ? `<span class="player-pending-count">(+${match.player2_pendingCount} P)</span>` : '';
            return `${getPlayerName(match.player2_id) || 'Seleccionar...'}<span class="player-match-count">(${match.player2_matchesPlayed} PJ)</span>${pendingSpan2}`;
        case 'tournament_id':
            const tournament = allTournaments.find(t => t.id === match.tournament_id);
            return tournament?.name || 'Seleccionar...';
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
        if (field === 'player1_id') {
            match.player1_matchesPlayed = playerMatchCounts.get(finalValue) || 0;
            match.player1_pendingCount = playerPendingCounts.get(finalValue) || 0;
        } else if (field === 'player2_id') {
            match.player2_matchesPlayed = playerMatchCounts.get(finalValue) || 0;
            match.player2_pendingCount = playerPendingCounts.get(finalValue) || 0;
        }
        if (field === 'tournament_id' && finalValue !== null) {
            match.player1_id = null; match.player2_id = null;
            match.player1_matchesPlayed = 0; match.player2_matchesPlayed = 0;
            match.player1_pendingCount = 0; match.player2_pendingCount = 0;
        }
    }

    const tableBody = suggestionsGridContainer.querySelector('tbody');
    const rowElement = tableBody?.querySelector(`tr[data-match-id="${matchId}"]`);
    if (rowElement) {
        const editedCell = rowElement.querySelector(`td[data-field="${field}"]`);
        if (editedCell) {
            editedCell.innerHTML = getCellContent(match, field);
        }
        if (field === 'tournament_id') {
            const player1Cell = rowElement.querySelector('td[data-field="player1_id"]');
            const player2Cell = rowElement.querySelector('td[data-field="player2_id"]');
            if(player1Cell) player1Cell.innerHTML = getCellContent(match, 'player1_id');
            if(player2Cell) player2Cell.innerHTML = getCellContent(match, 'player2_id');
        } else if (field === 'player1_id') {
             const player1Cell = rowElement.querySelector('td[data-field="player1_id"]');
             if(player1Cell) player1Cell.innerHTML = getCellContent(match, 'player1_id');
        } else if (field === 'player2_id') {
             const player2Cell = rowElement.querySelector('td[data-field="player2_id"]');
             if(player2Cell) player2Cell.innerHTML = getCellContent(match, 'player2_id');
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
    const matchId = cell.closest('tr').dataset.matchId;
    const match = currentSuggestions.find(m => m._id === matchId);
    if (!match) { activeEditingCell = null; return; }

    const field = cell.dataset.field;
    const type = cell.dataset.type;
    const currentValue = match[field];
    cell.dataset.originalContent = cell.innerHTML; // Guardar contenido actual

    let inputElement;
    if (type === 'player' || type === 'tournament') {
        inputElement = document.createElement('select');
        // *** INICIO MODIFICACIÓN: Estilo del Select ***
        inputElement.style.backgroundColor = '#ffffff'; // Fondo blanco
        inputElement.style.color = '#000000';           // Texto negro
        inputElement.style.border = '1px solid #ccc';   // Borde estándar
        inputElement.style.padding = '4px 6px';        // Padding interno
        inputElement.style.position = 'absolute';      // Para superponerse
        inputElement.style.left = '0';
        inputElement.style.top = '0';
        inputElement.style.width = '100%';
        inputElement.style.height = '100%';
        inputElement.style.fontSize = 'inherit';
        inputElement.style.fontFamily = 'inherit';
        inputElement.style.fontWeight = 'normal';
        // *** FIN MODIFICACIÓN: Estilo del Select ***

        let options = '<option value="">Seleccionar...</option>';
        if (type === 'player') {
            const tournamentId = match.tournament_id;
            const otherPlayerId = (field === 'player1_id') ? match.player2_id : match.player1_id;
            const enrolledPlayerIds = playersByTournament.get(tournamentId) || new Set();
            enrolledPlayerIds.forEach(playerId => {
                // Comprobar si el jugador está disponible para la selección
                const playerCanPlay = !otherPlayerId || playerId !== otherPlayerId;
                if (playerCanPlay) {
                    // *** INICIO MODIFICACIÓN: Añadir PJ ***
                    const pjCount = playerMatchCounts.get(playerId) || 0;
                    options += `<option value="${playerId}" ${Number(playerId) === Number(currentValue) ? 'selected' : ''}>${getPlayerName(playerId)} (${pjCount} PJ)</option>`;
                    // *** FIN MODIFICACIÓN: Añadir PJ ***
                }
            });
        } else { // type === 'tournament'
            const player1Id = Number(match.player1_id);
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
    } else { // type === 'number' (canchaNum)
        inputElement = document.createElement('input'); inputElement.type = 'number';
        inputElement.value = currentValue || ''; inputElement.min = "1";
    }

    // Aplicar clase DESPUÉS de aplicar estilos inline al select para que estos últimos prevalezcan si hay conflicto
    inputElement.className = 'editing-input-cell';
    inputElement.dataset.field = field; inputElement.dataset.matchId = matchId;
    cell.innerHTML = ''; cell.appendChild(inputElement);

    if (type === 'time') {
        flatpickr(inputElement, { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, defaultDate: currentValue,
            onClose: (selectedDates, dateStr) => { closeActiveEditor(true, dateStr); } // Flatpickr maneja el guardado
        }).open();
    } else {
        inputElement.focus();
        if (inputElement.tagName === 'SELECT' && typeof inputElement.showPicker === 'function') { try { inputElement.showPicker(); } catch(e) {} }
    }
}
function closeActiveEditor(save = false, newValue = null) {
    if (!activeEditingCell) return;
    const input = activeEditingCell.querySelector('.editing-input-cell, select'); // Buscar select también
    let needsUpdate = false;

    if (input) {
        if (save && !input._flatpickr) { // Guardar si 'save' es true y no es flatpickr
           needsUpdate = true;
        }
        if (input._flatpickr) { // Destruir instancia de flatpickr si existe
            input._flatpickr.destroy();
        }
    }

    const field = activeEditingCell.dataset.field;
    const rowId = activeEditingCell.closest('tr')?.dataset.matchId;

    if (needsUpdate) {
        const valueToSave = newValue !== null ? newValue : input.value;
        updateMatchData(rowId, field, valueToSave); // updateMatchData ahora maneja la actualización del DOM
    } else if (!save && rowId && field) { // Restaurar si no se guardó
        const match = currentSuggestions.find(m => m._id === rowId);
        if(match) {
            activeEditingCell.innerHTML = getCellContent(match, field); // Usar helper
        } else if (activeEditingCell.dataset.originalContent) {
             activeEditingCell.innerHTML = activeEditingCell.dataset.originalContent;
        } else {
            activeEditingCell.innerHTML = 'Error'; // Fallback extremo
        }
        if (activeEditingCell.dataset.originalContent) {
            delete activeEditingCell.dataset.originalContent;
        }
    }

    if(activeEditingCell) activeEditingCell.classList.remove('is-editing');
    activeEditingCell = null;
}
function handleEditorChange(e) {
    // Buscar select con o sin la clase, por si acaso
    if ((e.target.classList.contains('editing-input-cell') || e.target.tagName === 'SELECT') && e.target.tagName === 'SELECT') {
        closeActiveEditor(true);
    }
}
function handleEditorKeyDown(e) {
    // Buscar input/select con o sin la clase
    if (e.target.classList.contains('editing-input-cell') || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') {
        if (e.key === 'Enter') { e.preventDefault(); closeActiveEditor(true); }
        else if (e.key === 'Escape') { closeActiveEditor(false); }
    }
}
function handleDocumentClick(e) {
    if (activeEditingCell && !activeEditingCell.contains(e.target) && !e.target.closest('.flatpickr-calendar')) {
        const input = activeEditingCell.querySelector('.editing-input-cell, select'); // Buscar select también
        // Solo guardar si es input de texto/número (no select ni flatpickr que se guardan onChange/onClose)
        if (input && (input.type === 'text' || input.type === 'number') && !input._flatpickr) {
            closeActiveEditor(true);
        } else if (!input || (input.tagName !== 'SELECT' && !input._flatpickr)) {
            // Si no es un input (raro) o no es select/flatpickr, intenta restaurar
             closeActiveEditor(false);
        }
        // No hacer nada para selects o flatpickr (se manejan con sus eventos)
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
        showToast(`${matchesToInsert.length} partidos programados con éxito. Redirigiendo...`, "success");
        clearResults(true); currentSuggestions = [];
        setTimeout(() => { window.location.href = '/src/admin/matches.html'; }, 1500);
    } catch (error) {
        console.error("Error al programar:", error); showToast("Error al guardar los partidos directamente: " + error.message, "error");
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
        configurationStepDiv.classList.remove('hidden');
        resultsStepDiv.classList.add('hidden');
    } else if (stepName === 'results') {
        configurationStepDiv.classList.add('hidden');
        resultsStepDiv.classList.remove('hidden');
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
    if (suggestionsGridContainer) {
        suggestionsGridContainer.addEventListener('dblclick', handleCellDoubleClick);
        suggestionsGridContainer.addEventListener('change', handleEditorChange);
        suggestionsGridContainer.addEventListener('keydown', handleEditorKeyDown);
        suggestionsGridContainer.addEventListener('click', handleDeleteSuggestion);
    }
    document.addEventListener('click', handleDocumentClick);
    if (btnProgramAll) btnProgramAll.addEventListener('click', handleProgramAll);
    updateProgramButtonState();
});