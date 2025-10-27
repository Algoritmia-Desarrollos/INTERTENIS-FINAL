import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
// Importamos el "cerebro" (Asegúrate de tener matchmaking_logic.js)
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
const btnSelectAllTournaments = document.getElementById('btn-select-all-tournaments'); // NUEVO
const btnPrevWeek = document.getElementById('btn-prev-week');
const btnNextWeek = document.getElementById('btn-next-week');
const btnCurrentWeek = document.getElementById('btn-current-week');
const currentWeekDisplay = document.getElementById('current-week-display');
const btnFindSuggestions = document.getElementById('btn-find-suggestions');
const loadingSuggestionsDiv = document.getElementById('loading-suggestions');
const suggestionsSection = document.getElementById('suggestions-section');
const suggestionsGridDiv = document.getElementById('suggestions-grid');
const oddPlayersSection = document.getElementById('odd-players-section');
const oddPlayersListUl = document.getElementById('odd-players-list');
const slotsFunesDiv = document.getElementById('slots-funes');
const slotsCentroDiv = document.getElementById('slots-centro');

// --- ESTADO ---
let allPlayers = new Map();
let allTournaments = [];
let currentWeekStartDate = getStartOfWeek(new Date());
let currentSuggestionsBySlot = {}; // Para guardar las sugerencias generadas y usarlas al programar

// --- FUNCIONES AUXILIARES ---

// Devuelve el Lunes (inicio de semana)
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Formato YYYY-MM-DD
function formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Formato DD/MM
function formatDateDDMM(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}`;
}

// Devuelve array de 7 objetos Date de la semana
function getWeekDates(startDate) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        dates.push(date);
    }
    return dates;
}

// Ordenar torneos numéricamente por nombre
function sortTournaments(tournaments) {
    const getTournamentNumber = (name) => {
        if (!name) return Infinity; const match = name.match(/^(\d+)/); return match ? parseInt(match[1], 10) : Infinity;
    };
    return [...tournaments].sort((a, b) => { // Crear copia antes de ordenar
        const numA = getTournamentNumber(a.name); const numB = getTournamentNumber(b.name);
        if (numA !== Infinity && numB !== Infinity) { if (numA !== numB) { return numA - numB; } return a.name.localeCompare(b.name); }
        if (numA !== Infinity) return -1; if (numB !== Infinity) return 1; return a.name.localeCompare(b.name);
    });
}

// Obtiene nombre del jugador desde el Map
function getPlayerName(playerId) {
    return allPlayers.get(playerId)?.name || `ID ${playerId}`;
}

// --- CARGA INICIAL ---
async function loadInitialData() {
    try {
        const [
            { data: tournamentsData, error: tError },
            { data: playersData, error: pError }
         ] = await Promise.all([
             supabase.from('tournaments')
                .select('id, name, category:category_id(id, name)')
                .not('category.name', 'eq', 'Equipos'),
             supabase.from('players').select('id, name, category_id')
         ]);
        if (tError) throw tError;
        if (pError) throw pError;

        allTournaments = sortTournaments(
            (tournamentsData || [])
            .filter(t => t.category != null)
            .map(t => ({
                id: t.id,
                name: t.name,
                category_id: t.category.id,
                categoryName: t.category.name
            }))
        );

        allPlayers = new Map((playersData || []).map(p => [p.id, p]));

        if (tournamentMultiSelect) {
            tournamentMultiSelect.innerHTML = '';
            // ESTA ERA LA LÍNEA 78:
            allTournaments.forEach(t => { 
                tournamentMultiSelect.innerHTML += `<option value="${t.id}">${t.name} (${t.categoryName})</option>`;
            });
        } else {
            console.error("Elemento 'tournament-multiselect' no encontrado al poblar.");
        }
        displayWeek(currentWeekStartDate);
    } catch (error) { // ESTA ERA LA LÍNEA 86
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
    if(currentWeekDisplay) currentWeekDisplay.textContent = `${formatDateDDMM(startDate)} - ${formatDateDDMM(endDate)}`;

    renderSlotDefiners(getWeekDates(startDate)); // Renderiza inputs para la nueva semana
    clearResults(true); // Limpia resultados viejos
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


// --- LÓGICA DE LA INTERFAZ ---

// Renderiza los checkboxes y inputs numéricos para definir slots
function renderSlotDefiners(weekDates) {
    let funesHTML = '';
    let centroHTML = '';

    // Considerar solo Vie, Sab, Dom
    const relevantDays = weekDates.filter(date => [0, 5, 6].includes(date.getDay()));

    for (const date of relevantDays) {
        const dayName = DAYS[date.getDay()];
        const dateStr = formatDateYYYYMMDD(date);

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
                            </div>
                        `)
                    ).join('')}
                </div>
            </div>
        `;
        funesHTML += dayHTML('funes');
        centroHTML += dayHTML('centro');
    }
    if (slotsFunesDiv) slotsFunesDiv.innerHTML = funesHTML || '<p class="text-sm text-gray-400">No hay días programables (Vie/Sáb/Dom) en esta semana.</p>';
    if (slotsCentroDiv) slotsCentroDiv.innerHTML = centroHTML || '<p class="text-sm text-gray-400">No hay días programables (Vie/Sáb/Dom) en esta semana.</p>';

    addSlotDefinerListeners();
}

// Habilita/deshabilita el input numérico
function handleSlotCheckboxChange(event) {
    const checkbox = event.target;
    const numberInput = checkbox.closest('.slot-time-group').querySelector('.slot-canchas-input');
    if (numberInput) {
        numberInput.disabled = !checkbox.checked;
        if (!checkbox.checked) numberInput.value = 0; // Resetear si se desmarca
        else if (numberInput.value === '0') numberInput.value = 6; // Poner 6 si estaba en 0
    }
}

function addSlotDefinerListeners() {
    // Asegurarse de quitar listeners viejos si se re-renderiza
    document.querySelectorAll('.slot-checkbox').forEach(cb => {
        cb.removeEventListener('change', handleSlotCheckboxChange); // Quitar anterior
        cb.addEventListener('change', handleSlotCheckboxChange); // Añadir nuevo
    });
}

// Recopila los slots que el admin habilitó
function getDefinedSlots() {
    const slots = [];
    document.querySelectorAll('.slot-checkbox:checked').forEach(cb => {
        const numberInput = cb.closest('.slot-time-group').querySelector('.slot-canchas-input');
        const count = parseInt(numberInput.value, 10) || 0;
        if (count > 0) {
            slots.push({
                sede: cb.dataset.sede,
                date: cb.dataset.date, // YYYY-MM-DD
                time: cb.dataset.time, // HH:MM
                turno: cb.dataset.turno, // 'mañana' o 'tarde'
                canchasDisponibles: count
            });
        }
    });
    return slots;
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
    currentSuggestionsBySlot = {}; // Limpiar sugerencias anteriores

    try {
        const weekDates = getWeekDates(currentWeekStartDate);
        const startStr = formatDateYYYYMMDD(weekDates[0]);
        const endStr = formatDateYYYYMMDD(weekDates[6]);

        console.log("Buscando datos para torneos:", selectedTournamentIds, "en fechas:", startStr, "-", endStr);

        const selectedCategoryIds = allTournaments
            .filter(t => selectedTournamentIds.includes(t.id))
            .map(t => t.category_id);
        const uniqueSelectedCategoryIds = [...new Set(selectedCategoryIds)];

        const [
            { data: inscriptionsData, error: iError },
            { data: availabilityData, error: aError },
            { data: historyData, error: hError },
            { data: programmedData, error: mError }
        ] = await Promise.all([
            supabase.from('tournament_players').select('player_id, zone_name, tournament_id')
                .in('tournament_id', selectedTournamentIds),
            supabase.from('player_availability').select('player_id, available_date, time_slot, zone')
                .gte('available_date', startStr).lte('available_date', endStr),
            supabase.from('matches').select('player1_id, player2_id, tournament_id, winner_id')
                .in('tournament_id', selectedTournamentIds).not('winner_id', 'is', null),
            supabase.from('matches').select('match_date, match_time, location')
                 .gte('match_date', startStr).lte('match_date', endStr)
                 .is('winner_id', null)
        ]);

        if (iError) throw new Error(`Error fetching inscriptions: ${iError.message}`);
        if (aError) throw new Error(`Error fetching availability: ${aError.message}`);
        if (hError) throw new Error(`Error fetching history: ${hError.message}`);
        if (mError) throw new Error(`Error fetching programmed matches: ${mError.message}`);

        const inputs = {
            allPlayers: allPlayers,
            inscriptions: inscriptionsData || [],
            availability: (availabilityData || []).map(item => ({ ...item, available_date: item.available_date.split('T')[0] })),
            history: historyData || [],
            programmedMatches: (programmedData || []).map(item => ({...item, match_date: item.match_date.split('T')[0]})),
            availableSlots: definedSlots,
            categories: allTournaments
                .filter(t => selectedTournamentIds.includes(t.id))
                .reduce((acc, t) => {
                    if (!acc.some(c => c.id === t.category_id)) {
                        acc.push({ id: t.category_id, name: t.categoryName });
                    }
                    return acc;
                }, []),
            tournaments: allTournaments.filter(t => selectedTournamentIds.includes(t.id))
        };

        const { suggestionsBySlot, oddPlayers } = await generateMatchSuggestions(inputs);

        currentSuggestionsBySlot = suggestionsBySlot; // Guardar para usar con el botón Programar
        renderResults(suggestionsBySlot, oddPlayers);

    } catch (error) {
        console.error("Error finding suggestions:", error);
        showToast("Error al buscar sugerencias: " + (error.message || "Error desconocido"), "error");
        clearResults(true);
    } finally {
        if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    }
}

// --- RENDERIZADO DE RESULTADOS ---
function renderResults(suggestionsBySlot, oddPlayerIds) {
    if (suggestionsGridDiv) {
        if (Object.keys(suggestionsBySlot).length > 0) {
            let gridHTML = '';
            const sortedSlots = Object.keys(suggestionsBySlot).sort((a, b) => a.localeCompare(b));

            for (const slotKey of sortedSlots) {
                const matches = suggestionsBySlot[slotKey];
                if (!matches || matches.length === 0) continue;

                const [sede, date, time] = slotKey.split('|');
                const dateObj = new Date(date + 'T00:00:00');

                gridHTML += `
                    <div class="suggestion-card">
                        <div class="suggestion-card-header">
                            ${sede.toUpperCase()} - ${DAYS[dateObj.getDay()]} ${formatDateDDMM(dateObj)} - ${time} hs (${matches.length} Partidos)
                        </div>
                        <div class="suggestion-card-body">
                            ${matches.map((match, index) => renderSuggestionMatch(match, index + 1)).join('')}
                        </div>
                        <div class="suggestion-card-footer">
                           <button class="btn btn-primary btn-program-slot" data-sede="${sede}" data-date="${date}" data-time="${time}">
                                <span class="material-icons text-sm">schedule_send</span> Programar este Horario
                           </button>
                        </div>
                    </div>
                `;
            }
            suggestionsGridDiv.innerHTML = gridHTML;
            if (suggestionsSection) suggestionsSection.classList.remove('hidden');
        } else {
             suggestionsGridDiv.innerHTML = '<p class="text-gray-500 italic px-4 py-6">No se generaron sugerencias de partidos con los criterios y slots seleccionados.</p>';
            if(suggestionsSection) suggestionsSection.classList.remove('hidden');
        }
    }

    if (oddPlayersListUl) {
        if (oddPlayerIds && oddPlayerIds.length > 0) {
            const oddByCategory = oddPlayerIds.reduce((acc, p) => {
                const playerInfo = allPlayers.get(p.player_id);
                const catId = playerInfo?.category_id;
                const tourney = allTournaments.find(t => t.category_id === catId);
                const catName = tourney?.categoryName || 'Categoría Desconocida';
                if (!acc[catName]) acc[catName] = { players: [], reason: p.reason };
                acc[catName].players.push(getPlayerName(p.player_id));
                return acc;
            }, {});

            oddPlayersListUl.innerHTML = Object.entries(oddByCategory).map(([catName, data]) => `
                <li>
                    <strong class="text-yellow-400 text-sm">${catName}:</strong>
                    <span class="text-xs text-gray-300">${data.players.join(', ')}</span>
                    <em class="text-xs text-gray-500 block">(Motivo: ${data.reason})</em>
                </li>
            `).join('');

        } else {
            oddPlayersListUl.innerHTML = '<li class="text-gray-500 italic">No quedaron jugadores sobrantes.</li>';
        }
        if(oddPlayersSection) oddPlayersSection.classList.remove('hidden');
    }
     if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
}

function renderSuggestionMatch(match, canchaNum) {
    const playerA_name = getPlayerName(match.playerA_id);
    const playerB_name = getPlayerName(match.playerB_id);
    const revanchaIcon = match.isRevancha ? `<span class="material-icons revancha-icon" title="REVANCHA (Ya jugaron)">history</span>` : '';

    return `
        <div class="suggestion-match">
            <span class="cancha-num">C${canchaNum}:</span>
            <div class="player-name p1">
                <span>${playerA_name} ${revanchaIcon}</span>
                <span class="category">${match.categoryName}</span>
            </div>
            <span class="vs">vs</span>
            <div class="player-name p2">
                 <span>${playerB_name}</span>
                 <span class="category">${match.categoryName}</span>
            </div>
        </div>
    `;
}

function clearResults(hideSections = false) {
    currentSuggestionsBySlot = {};
    if (suggestionsGridDiv) suggestionsGridDiv.innerHTML = '';
    if (oddPlayersListUl) oddPlayersListUl.innerHTML = '';
    if (hideSections) {
        if (suggestionsSection) suggestionsSection.classList.add('hidden');
        if (oddPlayersSection) oddPlayersSection.classList.add('hidden');
    }
}

// --- Lógica para el botón "Programar" ---
function handleProgramSlotClick(event) {
    const button = event.target.closest('.btn-program-slot');
    if (!button) return;

    const sede = button.dataset.sede;
    const date = button.dataset.date;
    const time = button.dataset.time;
    const slotKey = `${sede}|${date}|${time}`;

    const matchesToProgram = currentSuggestionsBySlot[slotKey];
    if (!matchesToProgram || matchesToProgram.length === 0) {
        showToast("No hay partidos en este bloque para programar.", "warning");
        return;
    }

    const preloadData = matchesToProgram.map((match, index) => {
        const playerAInfo = allPlayers.get(match.playerA_id);
        
        // Encontrar UN torneo correspondiente a la categoría del jugador A
        const relevantTournament = allTournaments.find(t => t.category_id === playerAInfo?.category_id);

        return {
            clientId: `suggested_${Date.now()}_${match.playerA_id}_${index}`, // ID temporal único
            tournament_id: relevantTournament?.id || null,
            player1_id: match.playerA_id,
            player2_id: match.playerB_id,
            match_date: date ? date.split('-').reverse().join('/') : null, // YYYY-MM-DD a DD/MM/YYYY
            match_time: time || null,
            sede: sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : null, // Capitalizar (ej: Funes)
            cancha: `Cancha ${index + 1}` // Asignar Cancha 1, 2, 3...
        };
    });

    sessionStorage.setItem('matchesToPreload', JSON.stringify(preloadData));
    window.location.href = '/src/admin/matches.html'; // Asegúrate que la ruta sea correcta
    showToast(`Redirigiendo para programar ${preloadData.length} partidos...`, "success");
}


// --- EVENT LISTENERS GENERALES ---
document.addEventListener('DOMContentLoaded', () => {
    if (header) { try { header.innerHTML = renderHeader(); } catch (e) { console.error("Error renderizando header:", e); } }
    else { console.error("Elemento 'header' no encontrado."); }

    loadInitialData();

    if (tournamentMultiSelect) {
        tournamentMultiSelect.addEventListener('change', () => clearResults(true));
    } else { console.error("Elemento 'tournament-multiselect' no encontrado."); }

    if (btnSelectAllTournaments) {
        btnSelectAllTournaments.addEventListener('click', () => {
            if (tournamentMultiSelect) {
                Array.from(tournamentMultiSelect.options).forEach(opt => opt.selected = true);
                clearResults(true);
            }
        });
    } else { console.error("Elemento 'btn-select-all-tournaments' no encontrado."); }

    if (btnPrevWeek) { btnPrevWeek.addEventListener('click', goToPreviousWeek); }
    else { console.error("Elemento 'btn-prev-week' no encontrado."); }

    if (btnNextWeek) { btnNextWeek.addEventListener('click', goToNextWeek); }
    else { console.error("Elemento 'btn-next-week' no encontrado."); }

    if (btnCurrentWeek) { btnCurrentWeek.addEventListener('click', goToCurrentWeek); }
    else { console.error("Elemento 'btn-current-week' no encontrado."); }

    if (btnFindSuggestions) { btnFindSuggestions.addEventListener('click', handleFindSuggestions); }
    else { console.error("Elemento 'btn-find-suggestions' no encontrado."); }

    // Listener delegado para los botones "Programar"
    if (suggestionsGridDiv) {
        suggestionsGridDiv.addEventListener('click', handleProgramSlotClick);
    } else { console.error("Elemento 'suggestions-grid' no encontrado.")}

}); // ESTA ES LA LÍNEA 340