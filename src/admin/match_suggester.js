import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
// Importamos el "cerebro" (Asegúrate de tener matchmaking_logic.js)
import { generateMatchSuggestions } from './matchmaking_logic.js'; 

requireRole('admin');

// --- CONSTANTES ---
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Horarios fijos como en el PDF de ejemplo
const HORARIOS = {
    'mañana': ['09:00', '10:30', '12:30'],
    'tarde': ['14:30', '16:00']
};
const SEDES = ['funes', 'centro']; // IDs/nombres de las sedes

// --- ELEMENTOS DEL DOM ---
const header = document.getElementById('header');
const categoryMultiSelect = document.getElementById('category-multiselect');
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
let allCategories = [];
let allPlayers = new Map(); // Map[id, {name, category_id}]
let allTournaments = []; // Guardará {id, name, category_id}
let currentWeekStartDate = getStartOfWeek(new Date());

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

// Ordenar categorías numéricamente
function sortCategories(categories) {
    const getCategoryNumber = (name) => {
        if (!name) return Infinity; const match = name.match(/^(\d+)/); return match ? parseInt(match[1], 10) : Infinity;
    };
    return [...categories].sort((a, b) => { // Crear copia antes de ordenar
        const numA = getCategoryNumber(a.name); const numB = getCategoryNumber(b.name);
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
             supabase.from('tournaments').select('id, name, category:category_id(id, name)'),
             supabase.from('players').select('id, name, category_id') // Cargar todos los jugadores
         ]);
        if (tError) throw tError;
        if (pError) throw pError;

        // Guardar torneos y extraer/ordenar categorías únicas
        allTournaments = (tournamentsData || []).map(t => ({
            id: t.id, name: t.name, category_id: t.category.id, categoryName: t.category.name
        }));
        const categoriesMap = new Map();
        allTournaments.forEach(t => {
            if (t.category && t.category.name.toLowerCase() !== 'equipos') {
                categoriesMap.set(t.category.id, { id: t.category.id, name: t.category.name });
            }
        });
        allCategories = sortCategories(Array.from(categoriesMap.values()));

        // Guardar jugadores en el Map
        allPlayers = new Map((playersData || []).map(p => [p.id, p]));

        // Poblar selector múltiple de categorías
        if (categoryMultiSelect) {
            categoryMultiSelect.innerHTML = '';
            allCategories.forEach(cat => {
                categoryMultiSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            });
        } else {
            console.error("Elemento 'category-multiselect' no encontrado al poblar.");
        }

        displayWeek(currentWeekStartDate); // Muestra semana y renderiza slots

    } catch (error) {
        console.error("Error loading initial data:", error);
        showToast("Error al cargar datos iniciales", "error");
        if (categoryMultiSelect) categoryMultiSelect.innerHTML = '<option value="">Error al cargar</option>';
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

// Recopila las categorías que el admin seleccionó
function getSelectedCategories() {
    if (!categoryMultiSelect) return []; // Comprobación de seguridad
    return Array.from(categoryMultiSelect.selectedOptions).map(opt => Number(opt.value)); // Convertir a números
}

// --- LÓGICA PRINCIPAL: GENERACIÓN DE SUGERENCIAS ---

async function handleFindSuggestions() {
    const selectedCategoryIds = getSelectedCategories();
    const definedSlots = getDefinedSlots();

    if (selectedCategoryIds.length === 0) { showToast("Debes seleccionar al menos una categoría.", "error"); return; }
    if (definedSlots.length === 0) { showToast("Debes habilitar al menos un slot (horario y N° de canchas > 0).", "error"); return; }

    if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.remove('hidden');
    clearResults(true);

    try {
        // 1. Obtener TODOS los datos necesarios
        const weekDates = getWeekDates(currentWeekStartDate);
        const startStr = formatDateYYYYMMDD(weekDates[0]);
        const endStr = formatDateYYYYMMDD(weekDates[6]);

        const tournamentIds = allTournaments
            .filter(t => selectedCategoryIds.includes(t.category_id))
            .map(t => t.id);

        if (tournamentIds.length === 0) {
            showToast("No se encontraron torneos activos para las categorías seleccionadas.", "warning");
            if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
            return;
        }

        console.log("Buscando datos para torneos:", tournamentIds, "en fechas:", startStr, "-", endStr);

        const [
            { data: inscriptionsData, error: iError },
            { data: availabilityData, error: aError },
            { data: historyData, error: hError },
            { data: programmedData, error: mError }
        ] = await Promise.all([
            supabase.from('tournament_players').select('player_id, zone_name, tournament_id')
                .in('tournament_id', tournamentIds),
            supabase.from('player_availability').select('player_id, available_date, time_slot, zone')
                .gte('available_date', startStr).lte('available_date', endStr),
            supabase.from('matches').select('player1_id, player2_id, category_id, winner_id') // Historial
                .in('category_id', selectedCategoryIds).not('winner_id', 'is', null),
            supabase.from('matches').select('match_date, match_time, location') // Ya programados
                 .gte('match_date', startStr).lte('match_date', endStr)
                 .is('winner_id', null)
        ]);
        
        if (iError) throw new Error(`Error fetching inscriptions: ${iError.message}`);
        if (aError) throw new Error(`Error fetching availability: ${aError.message}`);
        if (hError) throw new Error(`Error fetching history: ${hError.message}`);
        if (mError) throw new Error(`Error fetching programmed matches: ${mError.message}`);

        // 2. Preparar datos para el "cerebro"
        const inputs = {
            allPlayers: allPlayers, // El Map[id, {name, category_id}]
            inscriptions: inscriptionsData || [],
            availability: (availabilityData || []).map(item => ({ ...item, available_date: item.available_date.split('T')[0] })),
            history: historyData || [],
            programmedMatches: (programmedData || []).map(item => ({...item, match_date: item.match_date.split('T')[0]})),
            availableSlots: definedSlots, // Los slots que el admin definió
            categories: allCategories.filter(c => selectedCategoryIds.includes(c.id)),
            tournaments: allTournaments.filter(t => tournamentIds.includes(t.id))
        };

        // 3. Llamar al "Cerebro" (matchmaking_logic.js)
        const { suggestionsBySlot, oddPlayers } = await generateMatchSuggestions(inputs);

        // 4. Renderizar Resultados
        renderResults(suggestionsBySlot, oddPlayers);

    } catch (error) {
        console.error("Error finding suggestions:", error);
        showToast("Error al buscar sugerencias: " + (error.message || "Error desconocido"), "error");
        clearResults(true); // Ocultar secciones si hay error
    } finally {
        if (loadingSuggestionsDiv) loadingSuggestionsDiv.classList.add('hidden');
    }
}

// --- RENDERIZADO DE RESULTADOS ---

function renderResults(suggestionsBySlot, oddPlayerIds) {
    
    if (suggestionsGridDiv) {
        if (Object.keys(suggestionsBySlot).length > 0) {
            let gridHTML = '';
            const sortedSlots = Object.keys(suggestionsBySlot).sort((a, b) => a.localeCompare(b)); // Ordenar Sede|Fecha|Hora

            for (const slotKey of sortedSlots) {
                const matches = suggestionsBySlot[slotKey];
                if (!matches || matches.length === 0) continue; // Saltar si no hay partidos para este slot

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
                    </div>
                `;
            }
            suggestionsGridDiv.innerHTML = gridHTML;
            if(suggestionsSection) suggestionsSection.classList.remove('hidden');
        } else {
            suggestionsGridDiv.innerHTML = '<p class="text-gray-500 italic px-4 py-6">No se generaron sugerencias de partidos con los criterios y slots seleccionados.</p>';
            if(suggestionsSection) suggestionsSection.classList.remove('hidden');
        }
    }


    if (oddPlayersListUl) {
        if (oddPlayerIds.length > 0) {
            const oddByCategory = oddPlayerIds.reduce((acc, p) => {
                const catName = p.categoryName || 'Categoría Desconocida';
                if (!acc[catName]) acc[catName] = { players: [], reason: p.reason };
                acc[catName].players.push(getPlayerName(p.player_id));
                return acc;
            }, {});

            oddPlayersListUl.innerHTML = Object.entries(oddByCategory).map(([catName, data]) => `
                <li class="col-span-full md:col-span-1">
                    <strong class="text-yellow-400 text-sm">${catName}:</strong>
                    <span class="text-xs text-gray-300">${data.players.join(', ')}</span>
                    <em class="text-xs text-gray-500 block">(Motivo: ${data.reason})</em>
                </li>
            `).join('');

        } else {
            oddPlayersListUl.innerHTML = '<li class="text-gray-500 italic col-span-full">No quedaron jugadores sobrantes.</li>';
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
    if (suggestionsGridDiv) suggestionsGridDiv.innerHTML = '';
    if (oddPlayersListUl) oddPlayersListUl.innerHTML = '';
    if (hideSections) {
        if (suggestionsSection) suggestionsSection.classList.add('hidden');
        if (oddPlayersSection) oddPlayersSection.classList.add('hidden');
    }
}

// --- EVENT LISTENERS GENERALES ---
    
// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Renderizar header
    if (header) {
        try {
            header.innerHTML = renderHeader();
        } catch (e) {
            console.error("Error renderizando header:", e);
        }
    } else {
        console.error("Elemento 'header' no encontrado.");
    }
    
    // Cargar datos iniciales (torneos, jugadores, etc.)
    loadInitialData();

    // --- CORRECCIÓN: Usar 'categoryMultiSelect' en lugar de 'categoryFilter' ---
    if (categoryMultiSelect) {
        categoryMultiSelect.addEventListener('change', clearResults);
    } else {
        console.error("Elemento 'category-multiselect' no encontrado.");
    }
    // --- FIN CORRECCIÓN ---

    if (btnPrevWeek) {
        btnPrevWeek.addEventListener('click', goToPreviousWeek);
    } else {
        console.error("Elemento 'btn-prev-week' no encontrado.");
    }

    if (btnNextWeek) {
        btnNextWeek.addEventListener('click', goToNextWeek);
    } else {
         console.error("Elemento 'btn-next-week' no encontrado.");
    }

    if (btnCurrentWeek) {
        btnCurrentWeek.addEventListener('click', goToCurrentWeek);
    } else {
         console.error("Elemento 'btn-current-week' no encontrado.");
    }

    if (btnFindSuggestions) {
        btnFindSuggestions.addEventListener('click', handleFindSuggestions);
    } else {
         console.error("Elemento 'btn-find-suggestions' no encontrado.");
    }

}); // Fin DOMContentLoaded