import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Estado Global ---
let currentProgram = null;
let allPlayers = [];
let tournamentPlayersMap = new Map();

// --- Elementos del DOM ---
const header = document.getElementById('header');
const programTitleEl = document.getElementById('program-title');
const matchesListEl = document.getElementById('matches-list');

// --- Lógica Principal ---
async function loadProgramData() {
    const urlParams = new URLSearchParams(window.location.search);
    const programId = urlParams.get('id');
    if (!programId) {
        programTitleEl.textContent = "Error: ID de programa no encontrado.";
        return;
    }

    // Cargar programa, jugadores y partidos asociados en paralelo
    const { data: program, error: programError } = await supabase.from('programs').select('*').eq('id', programId).single();
    if (programError || !program) {
        programTitleEl.textContent = "Programa no encontrado.";
        return;
    }
    currentProgram = program;
    programTitleEl.textContent = currentProgram.title;

    const { data: matches, error: matchesError } = await supabase.from('matches')
        .select('*, player1:player1_id(*), player2:player2_id(*), tournament:tournament_id(name)')
        .in('id', currentProgram.match_ids);
    
    const { data: playersData } = await supabase.from('players').select('*');
    allPlayers = playersData || [];

    renderMatches(matches || []);
}

function renderMatches(matches) {
        if (matches.length === 0) {
                matchesListEl.innerHTML = '<p>No hay partidos en este programa.</p>';
                return;
        }

        matchesListEl.innerHTML = `
        <table class="min-w-full text-sm text-left border-separate border-spacing-y-1">
            <thead>
                <tr class="text-gray-700">
                    <th class="px-4 py-2">CANCHA</th>
                    <th class="px-4 py-2">HORA</th>
                    <th class="px-4 py-2">JUGADOR 1</th>
                    <th class="px-2 py-2">PTS</th>
                    <th class="px-2 py-2">RESULTADO</th>
                    <th class="px-2 py-2">PTS</th>
                    <th class="px-4 py-2">JUGADOR 2</th>
                    <th class="px-4 py-2">CATEG.</th>
                </tr>
            </thead>
            <tbody>
                ${matches.map(match => {
                    const confirmations = currentProgram.confirmations || {};
                    const matchConfirmations = confirmations[match.id] || {};
                    // Puedes ajustar los valores de pts, resultado, categoria según tu modelo
                    return `
                        <tr class="bg-white hover:bg-gray-50">
                            <td class="px-4 py-2">${match.court || ''}</td>
                            <td class="px-4 py-2">${match.time || (match.match_time || '00:00')}</td>
                            <td class="px-4 py-2 font-medium flex items-center gap-2">${match.player1?.name || ''}</td>
                            <td class="px-2 py-2 font-bold text-center">${match.player1_points ?? 0}</td>
                            <td class="px-2 py-2 text-center">-</td>
                            <td class="px-2 py-2 font-bold text-center">${match.player2_points ?? 0}</td>
                            <td class="px-4 py-2 font-medium flex items-center gap-2">${match.player2?.name || ''}</td>
                            <td class="px-4 py-2 text-center">${match.category || ''}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        `;
}

function renderConfirmationControls(match, player, status) {
    const statusClasses = {
        pending: 'bg-gray-200 text-gray-700',
        confirmed: 'bg-green-100 text-green-700',
        rejected: 'bg-red-100 text-red-700'
    };
    const statusTexts = { pending: 'Pendiente', confirmed: 'Confirmado', rejected: 'Rechazado' };

    return `
    <div class="flex items-center gap-2 mt-2">
        <span class="text-xs font-semibold px-2 py-1 rounded-full ${statusClasses[status]}">${statusTexts[status]}</span>
        <select data-action="change-status" data-match-id="${match.id}" data-player-id="${player.id}" class="input-field !h-8 !w-auto !text-xs">
            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pendiente</option>
            <option value="confirmed" ${status === 'confirmed' ? 'selected' : ''}>Confirmar</option>
            <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rechazar</option>
        </select>
        <button data-action="change-player" data-match-id="${match.id}" data-player-id="${player.id}" data-player-slot="${match.player1_id === player.id ? 'player1_id' : 'player2_id'}" class="btn btn-secondary !p-1.5" title="Cambiar Jugador">
            <span class="material-icons !text-sm">change_circle</span>
        </button>
    </div>
    `;
}

async function handleChangeStatus(matchId, playerId, newStatus) {
    const confirmations = currentProgram.confirmations || {};
    if (!confirmations[matchId]) {
        confirmations[matchId] = {};
    }
    confirmations[matchId][playerId] = newStatus;

    const { error } = await supabase.from('programs').update({ confirmations }).eq('id', currentProgram.id);
    if (error) {
        alert("Error al actualizar el estado.");
    } else {
        await loadProgramData(); // Recargar para reflejar el cambio
    }
}

async function handleChangePlayer(matchId, playerSlot, oldPlayerId) {
    const matchToUpdate = (await supabase.from('matches').select('*, tournament:tournament_id(*)').eq('id', matchId).single()).data;
    if (!matchToUpdate) return;
    
    // Obtener jugadores del mismo torneo
    const { data: tournamentPlayers } = await supabase.from('tournament_players').select('player_id').eq('tournament_id', matchToUpdate.tournament_id);
    const playerIds = tournamentPlayers.map(p => p.player_id);

    const availablePlayers = allPlayers.filter(p => playerIds.includes(p.id) && p.id !== matchToUpdate.player1_id && p.id !== matchToUpdate.player2_id);
    
    const newPlayerId = prompt("Selecciona el nuevo jugador:\n" + availablePlayers.map(p => `${p.id}: ${p.name}`).join('\n') + "\n\nIngresa el ID del jugador de reemplazo:");

    if (newPlayerId && availablePlayers.some(p => p.id == newPlayerId)) {
        const { error } = await supabase.from('matches').update({ [playerSlot]: newPlayerId }).eq('id', matchId);
        if (error) {
            alert("Error al cambiar el jugador.");
        } else {
            // Limpiar confirmación del jugador anterior
            if(currentProgram.confirmations[matchId]) delete currentProgram.confirmations[matchId][oldPlayerId];
            await supabase.from('programs').update({ confirmations: currentProgram.confirmations }).eq('id', currentProgram.id);
            await loadProgramData();
        }
    } else if (newPlayerId) {
        alert("ID de jugador no válido o no disponible.");
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    header.innerHTML = renderHeader();
    loadProgramData();
});

matchesListEl.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'change-status') {
        const matchId = e.target.dataset.matchId;
        const playerId = e.target.dataset.playerId;
        const newStatus = e.target.value;
        handleChangeStatus(matchId, playerId, newStatus);
    }
});

matchesListEl.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action="change-player"]');
    if (button) {
        const matchId = button.dataset.matchId;
        const playerSlot = button.dataset.playerSlot;
        const oldPlayerId = button.dataset.playerId;
        handleChangePlayer(matchId, playerSlot, oldPlayerId);
    }
});