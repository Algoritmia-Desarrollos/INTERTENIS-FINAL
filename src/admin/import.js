import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const uploadStep = document.getElementById('upload-step');
const reviewStep = document.getElementById('review-step');
const btnUpload = document.getElementById('btn-upload');
const fileInput = document.getElementById('file-input');
const reviewTableContainer = document.getElementById('review-table-container');
const btnCancelImport = document.getElementById('btn-cancel-import');
const btnSaveImport = document.getElementById('btn-save-import');
const saveButtonText = document.getElementById('save-button-text');

// --- Estado Global ---
let allPlayers = [];
let allTournaments = [];
let parsedMatches = [];

// --- Carga de Datos Inicial ---
async function loadInitialData() {
    const [ { data: playersData }, { data: tournamentsData } ] = await Promise.all([
        supabase.from('players').select('id, name'),
        supabase.from('tournaments').select('id, name, category_id')
    ]);
    allPlayers = playersData || [];
    allTournaments = tournamentsData || [];
}

// --- Lógica Principal de Importación ---

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    uploadStep.innerHTML = '<p class="text-lg font-semibold">Procesando archivo...</p>';

    try {
        const workbook = await readFile(file);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        parsedMatches = parseMatches(jsonData);

        if (parsedMatches.length === 0) {
            alert("No se encontraron partidos válidos en el archivo. Revisa que las columnas 'Torneo', 'Jugador1' y 'Jugador2' existan y sus nombres coincidan con los de la base de datos.");
            resetUI();
            return;
        }

        renderReviewTable(parsedMatches);
        uploadStep.classList.add('hidden');
        reviewStep.classList.remove('hidden');

    } catch (error) {
        console.error("Error al procesar el archivo:", error);
        alert("Error al leer el archivo. Asegúrate de que sea un formato de Excel válido.");
        resetUI();
    }
}

function parseMatches(jsonData) {
    const matches = [];
    for (const row of jsonData) {
        const player1Name = row['Jugador1']?.trim();
        const player2Name = row['Jugador2']?.trim();
        const tournamentName = row['Torneo']?.trim();
        
        const player1 = allPlayers.find(p => p.name.toLowerCase() === player1Name?.toLowerCase());
        const player2 = allPlayers.find(p => p.name.toLowerCase() === player2Name?.toLowerCase());
        const tournament = allTournaments.find(t => t.name.toLowerCase() === tournamentName?.toLowerCase());

        if (player1 && player2 && tournament) {
            matches.push({
                player1_id: player1.id,
                player2_id: player2.id,
                tournament_id: tournament.id,
                category_id: tournament.category_id,
                match_date: row['Fecha'] ? new Date((row['Fecha'] - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                match_time: row['Hora'] || null,
                location: row['Sede'] ? `${row['Sede']} - ${row['Cancha']}` : null,
                _p1Name: player1.name,
                _p2Name: player2.name,
                _tournamentName: tournament.name
            });
        }
    }
    return matches;
}

function renderReviewTable(matchesToReview) {
    reviewTableContainer.innerHTML = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="p-2 text-left text-xs font-semibold text-gray-500 uppercase">Torneo</th>
                    <th class="p-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador 1</th>
                    <th class="p-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador 2</th>
                    <th class="p-2 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                    <th class="p-2 text-left text-xs font-semibold text-gray-500 uppercase">Hora</th>
                    <th class="p-2 text-left text-xs font-semibold text-gray-500 uppercase">Ubicación</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                ${matchesToReview.map((match, index) => `
                    <tr data-index="${index}">
                        <td class="p-2"><select class="input-field !h-8 text-xs" data-field="tournament_id">${allTournaments.map(t => `<option value="${t.id}" ${t.id === match.tournament_id ? 'selected' : ''}>${t.name}</option>`).join('')}</select></td>
                        <td class="p-2"><select class="input-field !h-8 text-xs" data-field="player1_id">${allPlayers.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></td>
                        <td class="p-2"><select class="input-field !h-8 text-xs" data-field="player2_id">${allPlayers.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></td>
                        <td class="p-2"><input type="date" class="input-field !h-8 text-xs" data-field="match_date" value="${match.match_date}"></td>
                        <td class="p-2"><input type="time" class="input-field !h-8 text-xs" data-field="match_time" value="${match.match_time || ''}"></td>
                        <td class="p-2"><input type="text" class="input-field !h-8 text-xs" data-field="location" value="${match.location || ''}"></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    saveButtonText.textContent = `Importar ${matchesToReview.length} Partidos`;
}

async function saveImportedMatches() {
    btnSaveImport.disabled = true;
    saveButtonText.textContent = 'Guardando...';

    // Recolectar los datos finales de la tabla interactiva
    const finalMatchesData = [];
    document.querySelectorAll('#review-table-container tbody tr').forEach(row => {
        const index = row.dataset.index;
        const match = parsedMatches[index];

        const updatedMatch = {
            tournament_id: row.querySelector('[data-field="tournament_id"]').value,
            player1_id: row.querySelector('[data-field="player1_id"]').value,
            player2_id: row.querySelector('[data-field="player2_id"]').value,
            match_date: row.querySelector('[data-field="match_date"]').value,
            match_time: row.querySelector('[data-field="match_time"]').value || null,
            location: row.querySelector('[data-field="location"]').value || null,
            category_id: allTournaments.find(t => t.id == row.querySelector('[data-field="tournament_id"]').value).category_id
        };
        finalMatchesData.push(updatedMatch);
    });

    const { error } = await supabase.from('matches').insert(finalMatchesData);

    if (error) {
        alert("Error al guardar los partidos: " + error.message);
        btnSaveImport.disabled = false;
        saveButtonText.textContent = `Importar ${parsedMatches.length} Partidos`;
    } else {
        alert(`${finalMatchesData.length} partidos importados con éxito.`);
        window.location.href = 'matches.html';
    }
}

function resetUI() {
    uploadStep.classList.remove('hidden');
    reviewStep.classList.add('hidden');
    uploadStep.innerHTML = `
        <h2 class="text-xl font-semibold mb-2">Sube tu archivo de Excel</h2>
        <p class="text-gray-500 mb-4">El archivo debe contener columnas como 'Torneo', 'Jugador1', 'Jugador2', 'Fecha', etc.</p>
        <button id="btn-upload" class="btn btn-primary btn-lg">
            <span class="material-icons">upload</span>
            Seleccionar Archivo
        </button>
    `;
    document.getElementById('btn-upload').onclick = () => fileInput.click();
    fileInput.value = '';
}

// --- FileReader Promises ---
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

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

btnUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
btnCancelImport.addEventListener('click', resetUI);
btnSaveImport.addEventListener('click', saveImportedMatches);