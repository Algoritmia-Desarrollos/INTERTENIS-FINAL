import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../../supabase.js'; // <-- ¡RUTA CORREGIDA!

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const form = document.getElementById('form-match');
const formTitle = document.getElementById('form-title');
const matchIdInput = document.getElementById('match-id');
const tournamentSelect = document.getElementById('tournament-select');
const categorySelect = document.getElementById('category-select');
const player1Select = document.getElementById('player1-select');
const player2Select = document.getElementById('player2-select');
const winnerSelect = document.getElementById('winner-select');
const matchDateInput = document.getElementById('match-date');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const matchesList = document.getElementById('matches-list');

let allPlayers = [];

// --- Carga de Datos para Selects ---

async function populateSelects() {
    const [
        { data: tournaments },
        { data: categories },
        { data: players }
    ] = await Promise.all([
        supabase.from('tournaments').select('*').order('name'),
        supabase.from('categories').select('*').order('name'),
        supabase.from('players').select('*').order('name')
    ]);

    allPlayers = players || [];

    tournamentSelect.innerHTML = '<option value="">Seleccione Torneo</option>';
    tournaments.forEach(t => tournamentSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);

    categorySelect.innerHTML = '<option value="">Seleccione Categoría</option>';
    categories.forEach(c => categorySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);

    player1Select.innerHTML = '<option value="">Seleccione Jugador 1</option>';
    player2Select.innerHTML = '<option value="">Seleccione Jugador 2</option>';
    players.forEach(p => {
        player1Select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        player2Select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
}

function updateWinnerOptions() {
    const p1 = allPlayers.find(p => p.id == player1Select.value);
    const p2 = allPlayers.find(p => p.id == player2Select.value);

    winnerSelect.innerHTML = '<option value="">Sin ganador</option>';
    if (p1) winnerSelect.innerHTML += `<option value="${p1.id}">${p1.name}</option>`;
    if (p2) winnerSelect.innerHTML += `<option value="${p2.id}">${p2.name}</option>`;
}

// --- Funciones de Renderizado ---

async function renderMatches() {
    matchesList.innerHTML = '<p>Cargando partidos...</p>';
    
    const { data, error } = await supabase
        .from('matches')
        .select(`*, tournament:tournament_id(name), category:category_id(name), player1:player1_id(name), player2:player2_id(name), winner:winner_id(name)`)
        .order('match_date', { ascending: false });

    if (error) {
        console.error("Error al cargar partidos:", error);
        matchesList.innerHTML = '<p class="text-red-500">No se pudieron cargar los partidos.</p>';
        return;
    }

    if (data.length === 0) {
        matchesList.innerHTML = '<p class="text-center text-gray-500 py-4">No hay partidos registrados.</p>';
        return;
    }

    matchesList.innerHTML = data.map(match => `
        <div class="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
            <div>
                <p class="font-semibold">${match.player1.name} vs ${match.player2.name}</p>
                <p class="text-sm text-gray-500">${match.tournament.name} - ${match.category.name}</p>
                <p class="text-xs text-gray-400">Fecha: ${new Date(match.match_date).toLocaleDateString('es-AR')}</p>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit" data-match='${JSON.stringify(match)}' class="text-blue-600 hover:text-blue-800 p-1">
                    <span class="material-icons text-base">edit</span>
                </button>
                <button data-action="delete" data-id="${match.id}" class="text-red-600 hover:text-red-800 p-1">
                    <span class="material-icons text-base">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Lógica de Formulario ---

function resetForm() {
    form.reset();
    matchIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Partido';
    btnSave.textContent = 'Guardar Partido';
    btnCancel.classList.add('hidden');
    winnerSelect.innerHTML = '<option value="">Sin ganador</option>';
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = matchIdInput.value;
    
    const matchData = {
        tournament_id: tournamentSelect.value,
        category_id: categorySelect.value,
        player1_id: player1Select.value,
        player2_id: player2Select.value,
        winner_id: winnerSelect.value || null,
        match_date: matchDateInput.value
    };

    if (matchData.player1_id === matchData.player2_id) {
        alert("Un jugador no puede enfrentarse a sí mismo.");
        return;
    }

    let error;
    if (id) { // Modo Edición
        const { error: updateError } = await supabase.from('matches').update(matchData).eq('id', id);
        error = updateError;
    } else { // Modo Creación
        const { error: insertError } = await supabase.from('matches').insert([matchData]);
        error = insertError;
    }

    if (error) {
        alert(`Error al guardar el partido: ${error.message}`);
    } else {
        resetForm();
        await renderMatches();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await populateSelects();
    await renderMatches();
});

form.addEventListener('submit', handleFormSubmit);
btnCancel.addEventListener('click', resetForm);
player1Select.addEventListener('change', updateWinnerOptions);
player2Select.addEventListener('change', updateWinnerOptions);

matchesList.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    
    if (action === 'edit') {
        const match = JSON.parse(button.dataset.match);
        matchIdInput.value = match.id;
        tournamentSelect.value = match.tournament_id;
        categorySelect.value = match.category_id;
        player1Select.value = match.player1_id;
        player2Select.value = match.player2_id;
        matchDateInput.value = match.match_date;
        
        updateWinnerOptions();
        winnerSelect.value = match.winner_id;
        
        formTitle.textContent = 'Editar Partido';
        btnSave.textContent = 'Actualizar Partido';
        btnCancel.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (action === 'delete') {
        const id = button.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar este partido?')) {
            const { error } = await supabase.from('matches').delete().eq('id', id);
            if (error) {
                alert('Error al eliminar el partido.');
            } else {
                await renderMatches();
            }
        }
    }
});