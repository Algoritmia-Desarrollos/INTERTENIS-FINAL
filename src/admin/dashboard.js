import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

requireRole('admin');

let lastMatchesData = []; // Guardar los datos de los partidos para el modal
let allPlayers = []; // Guardar todos los jugadores para los selects del modal

// --- Funciones Auxiliares ---
function isColorLight(hex) {
    if (!hex) return false;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substr(0, 2), 16),
          g = parseInt(c.substr(2, 2), 16),
          b = parseInt(c.substr(4, 2), 16);
    return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
}

// --- Carga Inicial ---
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('header').innerHTML = renderHeader();
    await loadDashboardData();
});

async function loadDashboardData() {
    const summaryContainer = document.getElementById('dashboard-summary');
    const matchesContainer = document.getElementById('matches-container');

    summaryContainer.innerHTML = '<p class="text-gray-400">Cargando estadísticas...</p>';
    matchesContainer.innerHTML = '<p class="text-gray-400">Cargando partidos...</p>';

    const [
        { count: tournamentCount },
        { count: playerCount },
        { count: matchCount },
        { data: lastMatches, error: matchesError },
        { data: players, error: playersError }
    ] = await Promise.all([
        supabase.from('tournaments').select('*', { count: 'exact', head: true }),
        supabase.from('players').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select(`*, 
            category:category_id(id, name, color),
            player1:player1_id(*, team:team_id(name, image_url, color)), 
            player2:player2_id(*, team:team_id(name, image_url, color)), 
            winner:winner_id(name)`)
        .order('match_date', { ascending: false, nullsFirst: false })
        .order('match_time', { ascending: false, nullsFirst: false })
        .limit(15),
        supabase.from('players').select('*').order('name')
    ]);
    
    lastMatchesData = lastMatches || [];
    allPlayers = players || [];

    // --- Renderizar Tarjetas de Resumen (Estilo Oscuro) ---
    summaryContainer.innerHTML = `
        <a href="tournaments.html" class="block bg-[#222222] p-6 rounded-xl shadow-lg border border-transparent flex items-center gap-4 transition hover:shadow-md hover:border-yellow-400">
            <span class="material-icons text-4xl text-yellow-500">emoji_events</span>
            <div>
                <p class="text-gray-400">Torneos Activos</p>
                <p class="text-2xl font-bold text-gray-100">${tournamentCount ?? 0}</p>
            </div>
        </a>
        <a href="players.html" class="block bg-[#222222] p-6 rounded-xl shadow-lg border border-transparent flex items-center gap-4 transition hover:shadow-md hover:border-yellow-400">
            <span class="material-icons text-4xl text-yellow-500">groups</span>
            <div>
                <p class="text-gray-400">Jugadores Registrados</p>
                <p class="text-2xl font-bold text-gray-100">${playerCount ?? 0}</p>
            </div>
        </a>
        <a href="matches.html" class="block bg-[#222222] p-6 rounded-xl shadow-lg border border-transparent flex items-center gap-4 transition hover:shadow-md hover:border-yellow-400">
            <span class="material-icons text-4xl text-yellow-500">sports_tennis</span>
            <div>
                <p class="text-gray-400">Partidos Jugados</p>
                <p class="text-2xl font-bold text-gray-100">${matchCount ?? 0}</p>
            </div>
        </a>
         <a href="rankings.html" class="block bg-[#222222] p-6 rounded-xl shadow-lg border border-transparent flex items-center gap-4 transition hover:shadow-md hover:border-yellow-400">
            <span class="material-icons text-4xl text-yellow-500">leaderboard</span>
            <div>
                <p class="text-gray-400">Rankings</p>
                <p class="text-2xl font-bold text-gray-100">Ver</p>
            </div>
        </a>
    `;

    // --- Renderizar Tabla de Últimos Partidos ---
    if (matchesError || lastMatchesData.length === 0) {
        matchesContainer.innerHTML = '<div class="bg-[#222222] rounded-xl shadow-lg border p-4"><p class="text-center text-gray-400 py-4">No hay partidos registrados.</p></div>';
        return;
    }
    
    renderLastMatches(lastMatchesData);
}


function renderLastMatches(matchesToRender) {
    const matchesContainer = document.getElementById('matches-container');

    const groupedByDate = matchesToRender.reduce((acc, match) => {
        const date = match.match_date || 'Sin fecha';
        if (!acc[date]) acc[date] = [];
        acc[date].push(match);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
    
    let tableHTML = '';

    for (const [dateIdx, date] of sortedDates.entries()) {
        if (dateIdx > 0) tableHTML += `<tr><td colspan="9" style="height: 18px; background: #000; border: none;"></td></tr>`;
        
        const groupedBySede = groupedByDate[date].reduce((acc, match) => {
            const sede = (match.location ? match.location.split(' - ')[0] : 'Sede no definida').trim();
            if(!acc[sede]) acc[sede] = [];
            acc[sede].push(match);
            return acc;
        }, {});

        let sedeIdx = 0;
        for(const sede in groupedBySede) {
            if (sedeIdx > 0) tableHTML += `<tr><td colspan="9" style="height: 14px; background: #000; border: none;"></td></tr>`;
            sedeIdx++;
            
            const matchesInSede = groupedBySede[sede];
            const dateObj = new Date(date + 'T00:00:00');
            const weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('es-AR', { month: 'long' });
            let formattedDate = `${weekday} ${day} de ${month}`;
            formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
            
            const headerBgColor = sede.toLowerCase() === 'centro' ? '#222222' : '#fdc100';
            const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';

            tableHTML += `
                <tr>
                    <td colspan="3" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-right: none;">
                        ${sede.toUpperCase()}
                    </td>
                    <td colspan="6" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-left: none;">
                        ${formattedDate}
                    </td>
                </tr>`;

            for (const match of matchesInSede) {
                const { p1_points, p2_points } = calculatePoints(match);
                const p1_class = match.player1.id === match.winner_id ? 'winner' : '';
                const p2_class = match.player2.id === match.winner_id ? 'winner' : '';
                let hora = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                const setsDisplay = (match.sets || []).map(s => `${s.p1}/${s.p2}`).join(' ');
                const p1TeamColor = match.player1.team?.color;
                const p2TeamColor = match.player2.team?.color;
                const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                const played = !!(match.sets && match.sets.length > 0);
                let p1NameStyle = played && !p1_class ? 'color:#888;' : '';
                let p2NameStyle = played && !p2_class ? 'color:#888;' : '';
                
                let p1CellContent = '';
                let p2CellContent = '';

                if (played) {
                    p1CellContent = p1_points;
                    p2CellContent = p2_points;
                } else {
                    if (match.player1.team?.image_url) {
                        p1CellContent = `<img src="${match.player1.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    }
                    if (match.player2.team?.image_url) {
                        p2CellContent = `<img src="${match.player2.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    }
                }

                let cancha = 'N/A';
                if (match.location) {
                    const parts = match.location.split(' - ');
                    cancha = parts[1] || parts[0];
                }
                const matchNum = cancha.match(/\d+/);
                if (matchNum) cancha = matchNum[0];
                const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
                const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';

                tableHTML += `
                    <tr class="clickable-row data-row" data-match-id="${match.id}">
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td style="background:#000;color:#fff;">${hora}</td>
                        <td class="player-name player-name-right ${p1_class}" style='background:#000;color:#fff;${p1NameStyle};font-size:12pt;'>${match.player1.name}</td>
                        <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${p1CellContent}</td>
                        <td class="font-mono" style="background:#000;color:#fff;">${setsDisplay}</td>
                        <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${p2CellContent}</td>
                        <td class="player-name player-name-left ${p2_class}" style='background:#000;color:#fff;${p2NameStyle};font-size:12pt;'>${match.player2.name}</td>
                        <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${match.category?.name || 'N/A'}</td>
                        <td class="action-cell" style="background:#000;"><button class="p-1 rounded-full hover:bg-gray-700" data-action="edit" title="Editar / Cargar Resultado"><span class="material-icons text-base" style="color:#fff;">edit</span></button></td>
                    </tr>`;
            }
        }
    }
    
    matchesContainer.innerHTML = `
        <div class="bg-[#222222] p-6 rounded-xl shadow-lg">
             <style>
                .matches-report-style { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 8px; overflow: hidden; }
                .matches-report-style th, .matches-report-style td { padding: 6px 4px; font-size: 9pt; border-bottom: 1px solid #4a4a4a; text-align: center; vertical-align: middle; background: #222222; color: #ffffff; }
                .matches-report-style tr td { border-right: 1px solid #4a4a4a; }
                .matches-report-style tr td:first-child { border-left: 1px solid #4a4a4a; }
                .matches-report-style tbody tr:last-child td { border-bottom: none; }
                .matches-report-style thead th { font-size: 8pt; color: #a0a0a0; text-transform: uppercase; font-weight: 600; padding-top: 8px; padding-bottom: 8px; border: none; background: #000; }
                .matches-report-style .winner { font-weight: 700 !important; color: #f4ec05 !important; }
                .matches-report-style .player-name { font-weight: 700; }
                .matches-report-style .player-name-right { text-align: right; padding-right: 8px; }
                .matches-report-style .player-name-left { text-align: left; padding-left: 8px; }
                .matches-report-style .font-mono { font-family: 'Consolas', 'Menlo', 'Courier New', monospace; font-size: 10pt; }
                .matches-report-style .pts-col { font-weight: 700; text-align: center; }
                .matches-report-style .cat-col { font-family: 'Segoe UI Black', 'Arial Black', sans-serif; font-weight: 900; font-size: 10pt; text-align: center; }
                .matches-report-style .action-cell button { color: #9ca3af; }
                .matches-report-style .action-cell button:hover { color: #ffffff; }
            </style>
            <table class="matches-report-style">
                <colgroup><col style="width: 5%"><col style="width: 8%"><col style="width: 26%"><col style="width: 5%"><col style="width: 13%"><col style="width: 5%"><col style="width: 26%"><col style="width: 6%"><col style="width: 6%"></colgroup>
                <thead><tr>
                    <th>Cancha</th><th>Hora</th><th style="text-align: right; padding-right: 8px;">Jugador 1</th><th>Pts</th><th>Resultado</th><th>Pts</th><th style="text-align: left; padding-left: 8px;">Jugador 2</th><th>Cat.</th><th>Editar</th>
                </tr></thead>
                <tbody>${tableHTML}</tbody>
            </table>
        </div>`;
}

// --- Lógica del Modal (sin cambios, pero necesaria) ---
function openScoreModal(match) {
    const modalContainer = document.getElementById('score-modal-container');
    const sets = match.sets || [];
    const isPlayed = !!match.winner_id;
    const playersInCategory = allPlayers.filter(p => p.category_id === match.category_id);


    modalContainer.innerHTML = `
        <div id="score-modal-overlay" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-2 z-50">
            <div id="score-modal-content" class="bg-[#232323] rounded-xl shadow-lg w-full max-w-lg border border-[#444] mx-2 sm:mx-0">
                <div class="p-6 border-b border-[#333]"><h3 class="text-xl font-bold text-yellow-400">Editar Partido / Resultado</h3></div>
                <form id="score-form" class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Jugador A</label>
                            <select id="player1-select-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" ${isPlayed ? 'disabled' : ''}>
                                ${playersInCategory.map(p => `<option value="${p.id}" ${p.id === match.player1_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300">Jugador B</label>
                            <select id="player2-select-modal" class="input-field mt-1 bg-[#181818] text-gray-100 border-[#444]" ${isPlayed ? 'disabled' : ''}>
                                ${playersInCategory.map(p => `<option value="${p.id}" ${p.id === match.player2_id ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 items-center pt-4">
                        <span class="font-semibold text-gray-200">SET</span>
                        <span class="font-semibold text-center text-gray-200" style="font-size:14px;">${match.player1.name}</span>
                        <span class="font-semibold text-center text-gray-200" style="font-size:14px;">${match.player2.name}</span>
                    </div>
                    ${[1, 2, 3].map(i => `
                        <div class="grid grid-cols-3 gap-4 items-center">
                            <span class="text-gray-300">Set ${i}</span>
                            <input type="number" id="p1_set${i}" class="input-field text-center bg-[#181818] text-gray-100 border-[#444]" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9">
                            <input type="number" id="p2_set${i}" class="input-field text-center bg-[#181818] text-gray-100 border-[#444]" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9">
                        </div>
                    `).join('')}
                </form>
                <div class="p-4 bg-[#181818] flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 rounded-b-xl border-t border-[#333]">
                    <div class="flex flex-row flex-wrap items-center gap-2 justify-center sm:justify-start mb-2 sm:mb-0">
                        <button id="btn-delete-match" class="btn btn-secondary !p-2" title="Eliminar Partido"><span class="material-icons !text-red-600">delete_forever</span></button>
                        ${isPlayed ? `<button id="btn-clear-score" class="btn btn-secondary !p-2" title="Limpiar Resultado"><span class="material-icons !text-yellow-600">cleaning_services</span></button>` : ''}
                        <button id="btn-suspend-match" class="btn btn-secondary !p-2" title="Marcar como Suspendido"><span class="material-icons !text-red-500">cancel</span></button>
                    </div>
                    <div class="flex flex-row flex-wrap gap-2 justify-center sm:justify-end">
                        <button id="btn-cancel-modal" class="btn btn-secondary w-full sm:w-auto">Cancelar</button>
                        <button id="btn-save-score" class="btn btn-primary w-full sm:w-auto">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    // ...existing code...

    document.getElementById('btn-save-score').onclick = () => saveScores(match.id);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('btn-delete-match').onclick = () => deleteMatch(match.id);
    document.getElementById('btn-suspend-match').onclick = () => suspendMatch(match.id);
    if (isPlayed) document.getElementById('btn-clear-score').onclick = () => clearScore(match.id);
    document.getElementById('score-modal-overlay').onclick = (e) => { if (e.target.id === 'score-modal-overlay') closeModal(); };
}

function closeModal() {
    document.getElementById('score-modal-container').innerHTML = '';
}

async function saveScores(matchId) {
    const sets = [];
    let p1SetsWon = 0, p2SetsWon = 0;
    
    for (let i = 1; i <= 3; i++) {
        const p1Score = document.getElementById(`p1_set${i}`).value;
        const p2Score = document.getElementById(`p2_set${i}`).value;
        if (p1Score && p2Score && p1Score !== '' && p2Score !== '') {
            const p1 = parseInt(p1Score, 10);
            const p2 = parseInt(p2Score, 10);
            sets.push({ p1, p2 });
            if (p1 > p2) p1SetsWon++;
            if (p2 > p1) p2SetsWon++;
        }
    }
    
    const p1_id = document.getElementById('player1-select-modal').value;
    const p2_id = document.getElementById('player2-select-modal').value;
    if (p1_id === p2_id) return alert("Los jugadores no pueden ser los mismos.");

    let winner_id = null;
    if (sets.length > 0) {
        if (sets.length < 2 || (p1SetsWon < 2 && p2SetsWon < 2)) return alert("El resultado no es válido. Un jugador debe ganar al menos 2 sets.");
        winner_id = p1SetsWon > p2SetsWon ? p1_id : p2_id;
    }
    
    const { error } = await supabase.from('matches').update({ 
            sets: sets.length > 0 ? sets : null, 
            winner_id, 
            player1_id: p1_id,
            player2_id: p2_id,
            bonus_loser: (p1SetsWon === 1 && winner_id == p2_id) || (p2SetsWon === 1 && winner_id == p1_id)
        }).eq('id', matchId);
    
    if (error) alert("Error al guardar: " + error.message);
    else { closeModal(); await loadDashboardData(); }
}

async function clearScore(matchId) {
    if (confirm("¿Limpiar el resultado de este partido?")) {
        const { error } = await supabase.from('matches').update({ sets: null, winner_id: null, bonus_loser: false }).eq('id', matchId);
        if (error) alert("Error: " + error.message);
        else { closeModal(); await loadDashboardData(); }
    }
}

async function deleteMatch(matchId) {
    if (confirm("¿ELIMINAR este partido permanentemente?")) {
        const { error } = await supabase.from('matches').delete().eq('id', matchId);
        if (error) alert("Error: " + error.message);
        else { closeModal(); await loadDashboardData(); }
    }
}

// --- Event Listeners ---
document.getElementById('matches-container').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-match-id]');
    if (!row) return;

    const matchId = Number(row.dataset.matchId);
    const matchData = lastMatchesData.find(m => m.id === matchId);

    if (e.target.closest('button[data-action="edit"]')) {
        if (matchData) openScoreModal(matchData);
    } else {
        if (matchData) openScoreModal(matchData);
    }
});