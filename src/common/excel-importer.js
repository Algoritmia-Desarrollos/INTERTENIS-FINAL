import { supabase } from './supabase.js';

/**
 * Orquesta el proceso de importación de partidos desde un archivo Excel.
 * - Detecta automáticamente el tipo de partido (individual/dobles).
 * - Permite la corrección interactiva de TODOS los campos.
 * - Ofrece listas de jugadores contextuales basadas en el torneo seleccionado.
 * - Impide la selección de jugadores duplicados dentro del mismo partido.
 * - Permite agregar nuevas filas de partidos manualmente.
 */
export async function importMatchesFromFile(allPlayers, allTournaments, tournamentPlayersMap) {
    try {
        const file = await selectFile();
        if (!file) return false;

        const jsonData = await readFileToJSON(file);
        const sheetType = detectSheetType(jsonData?.[0] || {});
        
        const parsedMatches = (jsonData && jsonData.length > 0) 
            ? (sheetType === 'doubles'
                ? parseDoublesMatches(jsonData, allPlayers, allTournaments)
                : parseSinglesMatches(jsonData, allPlayers, allTournaments))
            : [];
        
        const matchesToSave = await showReviewModal(parsedMatches, sheetType, allPlayers, allTournaments, tournamentPlayersMap);
        
        if (matchesToSave && matchesToSave.length > 0) {
            await saveMatchesToDB(matchesToSave, sheetType);
            alert(`${matchesToSave.length} partidos importados con éxito.`);
            return true;
        } else if (matchesToSave) { // El usuario confirmó pero no había filas válidas
             alert("No se importó ningún partido.");
        }

    } catch (error) {
        console.error("Error en el proceso de importación:", error);
        alert("Ocurrió un error inesperado: " + error.message);
    }
    return false;
}

// --- Lógica de Ordenamiento de Torneos ---
function sortTournamentsNumerically(tournaments) {
    const getNumber = (name) => {
        if (!name) return Infinity;
        const match = name.match(/^(\d+)/);
        return match ? parseInt(match[0], 10) : Infinity;
    };
    return [...tournaments].sort((a, b) => {
        const numA = getNumber(a.name);
        const numB = getNumber(b.name);
        if (numA !== Infinity && numB !== Infinity) {
            if (numA !== numB) return numA - numB;
        }
        return a.name.localeCompare(b.name); // Fallback alfabético
    });
}

// --- Funciones de Lectura y Detección ---

function selectFile() {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ".xlsx, .xls";
        input.onchange = e => resolve(e.target.files[0]);
        input.click();
    });
}

function readFileToJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(worksheet, { defval: "" }));
            } catch (e) { reject(new Error("Error al leer el archivo Excel.")); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function detectSheetType(firstRow) {
    const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim().replace(/\s+/g, ' '));
    if (headers.includes('jugador a1') || headers.includes('equipo a')) return 'doubles';
    return 'singles';
}

// --- Funciones de Parseo y Validación ---

const normalize = (text) => text?.toString().trim().toLowerCase() ?? '';
const findByName = (list, name) => list.find(item => normalize(item.name) === normalize(name));
const SEDES = ['Centro', 'Funes'];
const CANCHAS = ['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4', 'Cancha 5', 'Cancha 6'];

function parseCommonFields(raw) {
    let match_date = null;
    if (raw.date) {
        if (raw.date instanceof Date) {
            match_date = raw.date.toISOString().split('T')[0];
        } else if (typeof raw.date === 'number' && raw.date > 1) { 
            const date = new Date(Math.round((raw.date - 25569) * 86400 * 1000));
            if (!isNaN(date)) match_date = date.toISOString().split('T')[0];
        } else if (typeof raw.date === 'string') {
            const parts = raw.date.split(/[\/\-]/);
            if (parts.length === 3) {
                const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
                match_date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }
    }

    let match_time = null;
    if (raw.time) {
        if (raw.time instanceof Date) {
            match_time = raw.time.toTimeString().substring(0, 5);
        } else if (typeof raw.time === 'number' && raw.time > 0 && raw.time < 1) { 
            const totalSeconds = Math.round(raw.time * 86400);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            match_time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        } else if (typeof raw.time === 'string') {
            match_time = raw.time.toString().match(/\d{1,2}:\d{2}/)?.[0] || null;
        }
    }
    
    return { match_date, match_time, sede: raw.sede, cancha: raw.cancha };
}

function parseSinglesMatches(jsonData, allPlayers, allTournaments) {
    return jsonData.map((row, index) => {
        const raw = {
            player1: row['Jugador1'] || row['jugador1'],
            player2: row['Jugador2'] || row['jugador2'],
            tournament: row['Torneo'] || row['torneo'],
            date: row['Dia'] || row['Día'] || row['Fecha'],
            time: row['Hora'] || row['hora'],
            sede: row['Sede'] || row['sede'],
            cancha: row['Cancha'] || row['cancha']
        };
        const match = { _id: `row_${index}`,
            player1: findByName(allPlayers, raw.player1),
            player2: findByName(allPlayers, raw.player2),
            tournament: findByName(allTournaments, raw.tournament),
            ...parseCommonFields(raw) };
        return validateMatch(match, raw, 'singles');
    });
}

function parseDoublesMatches(jsonData, allPlayers, allTournaments) {
    return jsonData.map((row, index) => {
        const raw = {
            player1: row['Jugador A1'] || row['jugador a1'],
            player2: row['Jugador A2'] || row['jugador a2'],
            player3: row['Jugador B1'] || row['jugador b1'],
            player4: row['Jugador B2'] || row['jugador b2'],
            tournament: row['Torneo'] || row['torneo'],
            date: row['Dia'] || row['Día'] || row['Fecha'],
            time: row['Hora'] || row['hora'],
            sede: row['Sede'] || row['sede'],
            cancha: row['Cancha'] || row['cancha']
        };
        const match = { _id: `row_${index}`,
            player1: findByName(allPlayers, raw.player1),
            player2: findByName(allPlayers, raw.player2),
            player3: findByName(allPlayers, raw.player3),
            player4: findByName(allPlayers, raw.player4),
            tournament: findByName(allTournaments, raw.tournament),
            ...parseCommonFields(raw) };
        return validateMatch(match, raw, 'doubles');
    });
}

function validateMatch(match, raw, type) {
    match._raw = raw;
    match._errors = [];

    const check = (field, value, rawValue, msg) => { if (!rawValue || !value) match._errors.push({ field, message: msg }); };
    
    check('tournament', match.tournament, raw.tournament, 'Torneo no encontrado');
    check('player1', match.player1, raw.player1, 'Jugador no encontrado');
    check('player2', match.player2, raw.player2, 'Jugador no encontrado');
    if (type === 'doubles') {
        check('player3', match.player3, raw.player3, 'Jugador no encontrado');
        check('player4', match.player4, raw.player4, 'Jugador no encontrado');
    }
    if (!match.match_date) match._errors.push({ field: 'match_date', message: 'Fecha no válida' });
    if (raw.sede && !SEDES.includes(raw.sede)) match._errors.push({ field: 'sede', message: 'Sede no válida' });
    if (raw.cancha && !CANCHAS.includes(raw.cancha)) match._errors.push({ field: 'cancha', message: 'Cancha no válida' });
    
    // Validar jugadores duplicados
    const playerFields = type === 'doubles' ? ['player1', 'player2', 'player3', 'player4'] : ['player1', 'player2'];
    const playerIds = playerFields.map(f => match[f]?.id).filter(id => id); // Filtra nulos
    if (new Set(playerIds).size !== playerIds.length) {
        match._errors.push({ field: 'player_duplicate', message: 'Un jugador no puede ocupar dos puestos en el mismo partido.' });
    }

    match.status = match._errors.length > 0 ? 'error' : 'ok';
    return match;
}


// --- Modal Interactivo de Revisión (Versión Final) ---
function showReviewModal(matches, type, allPlayers, allTournaments, tournamentPlayersMap) {
    return new Promise(resolve => {
        let modalData = JSON.parse(JSON.stringify(matches)); 
        const sortedTournaments = sortTournamentsNumerically(allTournaments);

        const modalHTML = `
            <div id="review-modal-overlay" class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-2 sm:p-4 z-[100]">
                <style>
                    .review-control { width: 100%; padding: 6px 8px; border: 1px solid #9ca3af; border-radius: 6px; background-color: #f9fafb; font-size: 0.875rem; color-scheme: light; }
                    .review-control:focus { outline: 2px solid #3b82f6; border-color: #3b82f6; }
                    .review-cell-error { background-color: rgba(239, 68, 68, 0.1); }
                </style>
                <div class="bg-[#222222] text-gray-200 rounded-xl shadow-lg w-full max-w-7xl max-h-[95vh] flex flex-col border border-gray-700">
                    <div class="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                        <div>
                            <h3 class="text-lg font-bold text-yellow-400">Revisar y Corregir Partidos</h3>
                            <p class="text-sm text-gray-400">Edita cualquier campo, corrige las filas marcadas y añade nuevos partidos si es necesario.</p>
                        </div>
                        <button id="btn-cancel-review" class="text-gray-400 hover:text-white text-3xl">&times;</button>
                    </div>
                    <div id="review-table-container" class="p-4 overflow-auto flex-grow bg-black"></div>
                    <div class="p-3 bg-[#2d2d2d] flex flex-wrap justify-between items-center rounded-b-xl border-t border-gray-700 flex-shrink-0 gap-2">
                        <div class="flex items-center gap-2">
                           <button id="btn-add-row" class="btn btn-secondary">✚ Añadir Fila</button>
                           <div id="summary-text" class="text-sm font-semibold ml-2"></div>
                        </div>
                        <div>
                            <button id="btn-cancel-review-footer" class="btn btn-secondary">Cancelar</button>
                            <button id="btn-confirm-review" class="btn btn-primary ml-2">Importar Partidos Válidos</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const tableContainer = document.getElementById('review-table-container');
        const summaryText = document.getElementById('summary-text');
        const btnConfirm = document.getElementById('btn-confirm-review');
        let uniqueIdCounter = 0;

        function renderReviewTable() {
            const headers = (type === 'doubles')
                ? ['Torneo', 'Jugador A1', 'Jugador A2', 'Jugador B1', 'Jugador B2', 'Fecha', 'Hora', 'Sede', 'Cancha']
                : ['Torneo', 'Jugador 1', 'Jugador 2', 'Fecha', 'Hora', 'Sede', 'Cancha'];

            tableContainer.innerHTML = `
                <table class="min-w-full text-sm border-collapse">
                    <thead class="bg-[#333333] sticky top-0 z-10">
                        <tr>${headers.map(h => `<th class="px-3 py-3 text-left font-semibold text-gray-300 uppercase text-xs tracking-wider">${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">${modalData.map(renderRow).join('')}</tbody>
                </table>`;
            updateSummary();
        }

        function renderRow(match) {
            const rowStyle = match.status === 'error' ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500';
            const fields = (type === 'doubles')
                ? ['tournament', 'player1', 'player2', 'player3', 'player4', 'match_date', 'match_time', 'sede', 'cancha']
                : ['tournament', 'player1', 'player2', 'match_date', 'match_time', 'sede', 'cancha'];
            return `<tr id="${match._id}" class="${rowStyle}">${fields.map(field => `<td class="px-2 py-1 whitespace-nowrap align-top ${match._errors.some(e => e.field === field || e.field === 'player_duplicate') ? 'review-cell-error' : ''}">${renderCell(match, field)}</td>`).join('')}</tr>`;
        }

        function renderCell(match, field) {
            const error = match._errors.find(e => e.field === field || (field.startsWith('player') && e.field === 'player_duplicate'));
            let controlHTML = '';
            switch(field) {
                case 'tournament':
                    controlHTML = createSelect(match._id, field, sortedTournaments, match.tournament?.id);
                    break;
                case 'player1': case 'player2': case 'player3': case 'player4':
                    if (!match.tournament) {
                        controlHTML = `<select class="review-control text-gray-900" disabled><option>Primero elige un torneo válido</option></select>`;
                    } else {
                        const enrolledPlayerIds = tournamentPlayersMap.get(match.tournament.id) || new Set();
                        let eligiblePlayers = allPlayers.filter(p => enrolledPlayerIds.has(p.id));
                        const playerFields = type === 'doubles' ? ['player1', 'player2', 'player3', 'player4'] : ['player1', 'player2'];
                        const selectedIdsInRow = playerFields.filter(f => f !== field && match[f]).map(f => match[f].id);
                        eligiblePlayers = eligiblePlayers.filter(p => !selectedIdsInRow.includes(p.id));
                        controlHTML = createSelect(match._id, field, eligiblePlayers, match[field]?.id);
                    }
                    break;
                case 'sede':
                    controlHTML = createSelect(match._id, field, SEDES.map(s => ({id: s, name: s})), match.sede);
                    break;
                case 'cancha':
                    controlHTML = createSelect(match._id, field, CANCHAS.map(c => ({id: c, name: c})), match.cancha);
                    break;
                case 'match_date':
                    controlHTML = `<input type="date" class="review-control text-gray-900" data-id="${match._id}" data-field="match_date" value="${match.match_date || ''}">`;
                    break;
                case 'match_time':
                    controlHTML = `<input type="time" class="review-control text-gray-900" data-id="${match._id}" data-field="match_time" value="${match.match_time || ''}">`;
                    break;
            }
            return `<div class="p-1">${controlHTML}${error ? `<p class="text-red-400 font-semibold text-xs mt-1">${error.message}. Original: "${match._raw[field] || 'vacío'}"</p>` : ''}</div>`;
        }
        
        function createSelect(rowId, field, options, selectedId) {
            return `<select data-id="${rowId}" data-field="${field}" class="review-control text-gray-900"><option value="">-- Seleccionar --</option>${options.map(opt => `<option value="${opt.id}" ${opt.id == selectedId ? 'selected' : ''}>${opt.name}</option>`).join('')}</select>`;
        }

        function updateSummary() {
            const okCount = modalData.filter(m => m.status === 'ok').length;
            const errorCount = modalData.length - okCount;
            summaryText.textContent = `${okCount} listos para importar | ${errorCount} con errores.`;
            btnConfirm.disabled = okCount === 0;
            btnConfirm.textContent = `Importar ${okCount} Partidos`;
        }

        function handleTableChange(e) {
            if (e.target.matches('.review-control')) {
                const { id, field } = e.target.dataset;
                const value = e.target.value;
                const matchIndex = modalData.findIndex(m => m._id === id);
                if (matchIndex === -1) return;

                let list;
                if (field.startsWith('player')) list = allPlayers;
                else if (field === 'tournament') list = allTournaments;
                
                if (list) { 
                    modalData[matchIndex][field] = list.find(item => item.id == value) || null;
                } else {
                    modalData[matchIndex][field] = value || null;
                }
                
                modalData[matchIndex]._raw[field] = value;
                if (field === 'tournament') {
                    ['player1', 'player2', 'player3', 'player4'].forEach(p => { modalData[matchIndex][p] = null; });
                }
                
                modalData[matchIndex] = validateMatch(modalData[matchIndex], modalData[matchIndex]._raw, type);
                
                const rowElement = document.getElementById(id);
                if (rowElement) rowElement.outerHTML = renderRow(modalData[matchIndex]);
                
                updateSummary();
            }
        }
        
        function addRow() {
            uniqueIdCounter++;
            const newMatch = { _id: `new_${Date.now()}_${uniqueIdCounter}`, _raw: {}, status: 'error', _errors: [{ field: 'tournament', message: 'Fila nueva, complete los datos.' }] };
            modalData.push(newMatch);
            renderReviewTable();
        }

        function closeModal() { document.getElementById('review-modal-overlay').remove(); }

        tableContainer.addEventListener('change', handleTableChange);
        document.getElementById('btn-add-row').onclick = addRow;
        document.getElementById('btn-confirm-review').onclick = () => {
            const validMatches = modalData.filter(m => m.status === 'ok');
            closeModal(); resolve(validMatches);
        };
        document.getElementById('btn-cancel-review').onclick = closeModal;
        document.getElementById('btn-cancel-review-footer').onclick = closeModal;

        renderReviewTable();
    });
}


// --- Función para Guardar en la Base de Datos ---
async function saveMatchesToDB(matchesToSave, type) {
    const dataToInsert = matchesToSave.map(m => {
        const tournament = m.tournament;
        return {
            player1_id: m.player1.id,
            player2_id: type === 'doubles' ? m.player3.id : m.player2.id,
            player3_id: type === 'doubles' ? m.player2.id : null,
            player4_id: type === 'doubles' ? m.player4.id : null,
            tournament_id: tournament.id,
            category_id: tournament.category.id, 
            match_date: m.match_date,
            match_time: m.match_time,
            location: (m.sede && m.cancha) ? `${m.sede} - ${m.cancha}` : (m.sede || m.cancha)
        };
    });

    if (dataToInsert.length > 0) {
        const { error } = await supabase.from('matches').insert(dataToInsert);
        if (error) { throw new Error("Error al guardar los partidos: " + error.message); }
    }
}