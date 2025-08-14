import { supabase } from './supabase.js';

/**
 * Orquesta el proceso de importación de partidos desde un archivo.
 * 1. Pide al usuario que seleccione un archivo.
 * 2. Lee el archivo usando SheetJS.
 * 3. Parsea los datos para encontrar los partidos.
 * 4. Muestra un modal de confirmación con los partidos encontrados.
 * 5. Si el usuario confirma, guarda los partidos en la base de datos.
 */
export async function importMatchesFromFile(allPlayers, allTournaments, allCategories) {
    try {
        const file = await selectFile();
        if (!file) return;

        const workbook = await readFile(file);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const parsedMatches = parseMatches(jsonData, allPlayers, allTournaments, allCategories);

        // Permitir importar partidos aunque no tengan fecha válida
        const matchesWithInvalidDate = parsedMatches.filter(m => !m.match_date || m.match_date === '0000-00-00');
        if (parsedMatches.length === 0) {
            alert("No se encontraron partidos válidos en el archivo. Asegúrate de que las columnas 'Jugador1', 'Jugador2' y 'Torneo' existan y coincidan con los datos de la app.");
            return;
        }
        if (matchesWithInvalidDate.length > 0) {
            alert(`Atención: ${matchesWithInvalidDate.length} partido(s) no tienen fecha válida y serán importados con fecha vacía. Corrige la columna 'Dia' o 'Fecha' en el Excel si es necesario.`);
        }
        // Convertir '0000-00-00' a null para la base de datos
        const matchesToSave = parsedMatches.map(m => {
            let match_date = m.match_date;
            let match_time = m.match_time;
            let location = m.location;
            if (!match_date || match_date === '0000-00-00') match_date = '2099-12-31';
            if (!match_time || match_time === '00:00' || match_time === '0:00' || match_time === 'null' || match_time === null) match_time = 'A definir';
            if (!location || location.trim() === '' || location === 'null' || location === null) location = 'A definir';
            return {
                ...m,
                match_date,
                match_time,
                location
            };
        });
        const confirmed = await showConfirmationModal(matchesToSave);
        if (confirmed) {
            await saveMatchesToDB(matchesToSave);
            alert(`${matchesToSave.length} partidos importados con éxito.`);
            return true; // Indica que la importación fue exitosa
        }

    } catch (error) {
        console.error("Error durante el proceso de importación:", error);
        alert("Ocurrió un error al procesar el archivo: " + error.message);
    }
    return false; // Indica que la importación falló o fue cancelada
}

/**
 * Abre el selector de archivos del navegador y devuelve el archivo seleccionado.
 * @returns {Promise<File|null>}
 */
function selectFile() {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ".xlsx, .xls";
        input.onchange = e => {
            const file = e.target.files[0];
            resolve(file);
        };
        input.click();
    });
}

/**
 * Lee el contenido de un archivo Excel y devuelve un objeto de workbook.
 * @param {File} file - El archivo seleccionado por el usuario.
 * @returns {Promise<Object>}
 */
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(workbook);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Parsea los datos JSON del Excel para encontrar partidos válidos.
 */
function parseMatches(jsonData, allPlayers, allTournaments, allCategories) {
    const matches = [];
    for (const row of jsonData) {
        const player1Name = row['Jugador1']?.trim();
        const player2Name = row['Jugador2']?.trim();
        const tournamentName = row['Torneo']?.trim();

        const player1 = allPlayers.find(p => p.name.toLowerCase() === player1Name?.toLowerCase());
        const player2 = allPlayers.find(p => p.name.toLowerCase() === player2Name?.toLowerCase());
        const tournament = allTournaments.find(t => t.name.toLowerCase() === tournamentName?.toLowerCase());

        // --- Robust Excel time parsing ---
        let matchTime = null;
        if (row['Hora'] !== undefined && row['Hora'] !== null && row['Hora'] !== '') {
            const hora = row['Hora'];
            if (typeof hora === 'number') {
                // Excel time serial (fraction of a day)
                const totalMinutes = Math.round(hora * 24 * 60);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                matchTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            } else if (typeof hora === 'string') {
                // Try to parse as HH:MM or H:MM
                const timeMatch = hora.match(/^(\d{1,2}):(\d{2})/);
                if (timeMatch) {
                    // Valid time string
                    matchTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
                } else {
                    // Try to parse as float string (e.g., '0.416...')
                    const asFloat = parseFloat(hora);
                    if (!isNaN(asFloat) && asFloat > 0 && asFloat < 1) {
                        const totalMinutes = Math.round(asFloat * 24 * 60);
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        matchTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                    } else {
                        matchTime = null;
                    }
                }
            } else {
                matchTime = null;
            }
        }

        // --- Parse match_date from 'Dia' column (DD/MM or D/M) ---
        let matchDate = null;
        if (row['Dia'] !== undefined && row['Dia'] !== null && row['Dia'] !== '') {
            let dia = row['Dia'];
            if (typeof dia === 'number' && dia > 20000) {
                // Excel date serial (should be > 20000 for any real date)
                const jsDate = new Date((dia - 25567 - 1) * 86400 * 1000);
                matchDate = jsDate.toISOString().split('T')[0];
            } else if (typeof dia === 'string') {
                dia = dia.trim();
                // Accept formats like 20/08/2025, 2/8/2025, 20/08, 2/8
                let dateMatch = dia.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (dateMatch) {
                    // DD/MM/YYYY or D/M/YYYY
                    const day = dateMatch[1].padStart(2, '0');
                    const month = dateMatch[2].padStart(2, '0');
                    const year = dateMatch[3];
                    matchDate = `${year}-${month}-${day}`;
                } else {
                    // Try DD/MM or D/M (no year)
                    dateMatch = dia.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
                    if (dateMatch) {
                        const day = dateMatch[1].padStart(2, '0');
                        const month = dateMatch[2].padStart(2, '0');
                        const year = new Date().getFullYear();
                        matchDate = `${year}-${month}-${day}`;
                    }
                }
            }
        } else if (row['Fecha']) {
            // Fallback to Excel serial date if present
            matchDate = new Date((row['Fecha'] - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
        }
        // Si no se pudo obtener una fecha válida, usar '0000-00-00' y advertir
        if (!matchDate) {
            matchDate = '0000-00-00';
            console.warn('No se pudo determinar la fecha del partido, se asigna 00/00/0000:', row);
        }

        // --- Parse location: combine 'Sede' and 'Cancha' if both present ---
        let location = null;
        if (row['Sede'] && row['Cancha']) {
            location = `${row['Sede']} - ${row['Cancha']}`;
        } else if (row['Cancha']) {
            location = row['Cancha'];
        } else if (row['Sede'] && row['cancha 1']) {
            location = `${row['Sede']} - ${row['cancha 1']}`;
        } else if (row['Sede']) {
            location = row['Sede'];
        } else if (row['cancha 1']) {
            location = row['cancha 1'];
        } else {
            location = null;
        }

        if (player1 && player2 && tournament) {
            matches.push({
                player1_id: player1.id,
                player2_id: player2.id,
                tournament_id: tournament.id,
                category_id: tournament.category.id,
                match_date: matchDate,
                match_time: matchTime,
                location: location,
                // Datos para mostrar en la confirmación
                _p1Name: player1.name,
                _p2Name: player2.name,
                _tournamentName: tournament.name,
                _categoryName: tournament.category.name,
            });
        }
    }
    return matches;
}

/**
 * Muestra un modal con los partidos parseados para que el usuario confirme.
 * @returns {Promise<boolean>}
 */
function showConfirmationModal(parsedMatches) {
    return new Promise(resolve => {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = `
            <div id="import-modal-overlay" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
                <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div class="p-6 border-b">
                        <h3 class="text-xl font-bold">Confirmar Importación</h3>
                        <p class="text-sm text-gray-600">Se encontraron ${parsedMatches.length} partidos válidos. Por favor, revísalos antes de importar.</p>
                    </div>
                    <div class="p-6 space-y-2 overflow-y-auto">
                        ${parsedMatches.map(m => `
                            <div class="p-2 bg-gray-50 rounded border">
                                <p class="font-semibold">${m._p1Name} vs ${m._p2Name}</p>
                                <p class="text-xs text-gray-500">${m._tournamentName} | ${m._categoryName}</p>
                            </div>
                        `).join('')}
                    </div>
                    <div class="p-4 bg-gray-50 flex justify-end gap-4 rounded-b-xl">
                        <button id="btn-cancel-import" class="btn btn-secondary">Cancelar</button>
                        <button id="btn-confirm-import" class="btn btn-primary">Importar ${parsedMatches.length} Partidos</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalContainer);

        document.getElementById('btn-confirm-import').onclick = () => {
            document.body.removeChild(modalContainer);
            resolve(true);
        };
        document.getElementById('btn-cancel-import').onclick = () => {
            document.body.removeChild(modalContainer);
            resolve(false);
        };
    });
}

/**
 * Guarda los partidos confirmados en la base de datos.
 */
async function saveMatchesToDB(matchesToSave) {
    const dataToInsert = matchesToSave.map(m => ({
        player1_id: m.player1_id,
        player2_id: m.player2_id,
        tournament_id: m.tournament_id,
        category_id: m.category_id,
        match_date: m.match_date,
        match_time: m.match_time,
        location: m.location,
    }));

    const { error } = await supabase.from('matches').insert(dataToInsert);
    if (error) {
        throw new Error("Error al guardar los partidos en la base de datos: " + error.message);
    }
}