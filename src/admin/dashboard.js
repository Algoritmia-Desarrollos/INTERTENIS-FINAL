import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

requireRole('admin');

let lastMatchesData = []; // Guardar los datos de los partidos para el modal
let allPlayers = []; // Guardar todos los jugadores para los selects del modal
let allTournaments = []; // Guardar todos los torneos

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
        { data: players, error: playersError },
        { data: tournaments } // Cargar torneos para el gráfico
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
        supabase.from('players').select('*, category:category_id(name)').order('name'),
        supabase.from('tournaments').select('*, category:category_id(name)') // Cargar categorías
    ]);
    
    lastMatchesData = lastMatches || [];
    allPlayers = players || [];
    allTournaments = tournaments || []; // Guardar torneos

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

    if (matchesError || lastMatchesData.length === 0) {
        matchesContainer.innerHTML = '<div class="bg-[#222222] rounded-xl shadow-lg p-4"><p class="text-center text-gray-400 py-4">No hay partidos registrados.</p></div>';
    } else {
        renderLastMatches(lastMatchesData);
    }

    // --- ** LLAMADA A LOS GRÁFICOS ** ---
    // Procesar datos para los gráficos
    const activeTournaments = allTournaments.filter(t => t.category && t.category.name !== 'Equipos');
    const categoryData = {};
    activeTournaments.forEach(t => {
        const catName = t.category.name || 'Sin Categoría';
        categoryData[catName] = (categoryData[catName] || 0) + 1;
    });

    const statusData = { 'Pendientes': 0, 'Completados': 0, 'Suspendidos': 0 };
    // Usar 'allMatches' para el gráfico de estado (no solo los últimos 15)
    const { data: allMatchesForChart } = await supabase.from('matches').select('winner_id, status');
    (allMatchesForChart || []).forEach(m => {
        if (m.status === 'suspendido') statusData['Suspendidos']++;
        else if (m.winner_id) statusData['Completados']++;
        else statusData['Pendientes']++;
    });

    renderCategoryChart(categoryData);
    renderStatusChart(statusData);
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

        for(const sede in groupedBySede) {
            const matchesInSede = groupedBySede[sede];
            const dateObj = new Date(date + 'T00:00:00');
            
            let formattedDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj);
            formattedDate = formattedDate.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').replace(' De ', ' de ');

            const headerBgColor = sede.toLowerCase() === 'centro' ? '#222222' : '#fdc100';
            const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';

            tableHTML += `
               <tr class="sede-fecha-row">
                    <td colspan="2" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0 !important; letter-spacing: 1px;">
                        ${sede.toUpperCase()}
                    </td>
                    <td colspan="7" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0 !important; letter-spacing: 1px;">
                        ${formattedDate}
                    </td>
                </tr>`;

            for (const match of matchesInSede) {
                const { p1_points, p2_points } = calculatePoints(match);
                const p1_class = match.player1.id === match.winner_id ? 'winner' : '';
                const p2_class = match.player2.id === match.winner_id ? 'winner' : '';
                let hora = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                
                const winnerIsSide1 = match.player1.id === match.winner_id || (match.player3 && match.player3.id === match.winner_id);
                const setsDisplayRaw = (match.sets || []).map(s => {
                    if (match.winner_id && !winnerIsSide1) {
                        return `${s.p2}/${s.p1}`;
                    }
                    return `${s.p1}/${s.p2}`;
                }).join(' ');

                let resultadoDisplay = '';
                if (match.status === 'suspendido') {
                    resultadoDisplay = '<span style="color:#fff;font-weight:700;text-decoration:none !important;">Suspendido</span>';
                } else if (match.status === 'completado_wo') {
                    resultadoDisplay = '<span style="font-weight:700;">W.O.</span>';
                } else if (match.status === 'completado_ret') {
                    resultadoDisplay = `<span style="font-weight:700;">${setsDisplayRaw} ret.</span>`;
                } else {
                    resultadoDisplay = setsDisplayRaw;
                }

                const p1TeamColor = match.player1.team?.color;
                const p2TeamColor = match.player2.team?.color;
                const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                const played = !!(match.winner_id);
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

                const suspendedClass = match.status === 'suspendido' ? 'suspended-row' : '';
                tableHTML += `
                    <tr class="clickable-row data-row ${suspendedClass}" data-match-id="${match.id}">
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td style="background:#000;color:#fff;">${hora}</td>
                        <td class="player-name player-name-right ${p1_class}" style='background:#000;color:#fff;${p1NameStyle};font-size:12pt;'>${match.player1.name}</td>
                        <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${p1CellContent}</td>
                        <td class="font-mono" style="background:#000;color:#fff;">${resultadoDisplay}</td>
                        <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${p2CellContent}</td>
                        <td class="player-name player-name-left ${p2_class}" style='background:#000;color:#fff;${p2NameStyle};font-size:12pt;'>${match.player2.name}</td>
                        <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${match.category?.name || 'N/A'}</td>
                        <td class="action-cell"><button class="p-1 rounded-full hover:bg-gray-700" data-action="edit" title="Editar / Cargar Resultado"><span class="material-icons text-base" style="color:#fff;">edit</span></button></td>
                    </tr>`;
            }
        }
    }
    
    matchesContainer.innerHTML = `
    <div class="bg-[#18191b] p-4 sm:p-6 rounded-xl shadow-lg overflow-x-auto">
        <style>
            .matches-report-style { min-width: 800px; width: 100%; border-collapse: separate; border-spacing: 0; }
            .matches-report-style td {
                padding: 6px 4px; font-size: 9pt; border-bottom: 3px solid #4a4a4a;
                text-align: center; vertical-align: middle; background: #222222;
                color: #ffffff; white-space: nowrap; border-right: 3px solid #4a4a4a;
            }
            .matches-report-style tr td:first-child { border-left: 3px solid #4a4a4a; }
            .matches-report-style tbody tr:last-child td { border-bottom: none; }
            /* --- INICIO DE LA MODIFICACIÓN --- */
            .matches-report-style .sede-fecha-row td { 
                border-left: none; 
                border-right: none; 
                border-top: none;
                border-bottom: 3px solid #4a4a4a;
            }
            /* --- FIN DE LA MODIFICACIÓN --- */
            .matches-report-style thead th { background: #000; font-size: 8pt; color: #a0a0a0; text-transform: uppercase; font-weight: 600; padding-top: 8px; padding-bottom: 8px; border: none; }
            .matches-report-style .winner { font-weight: 700 !important; color: #f4ec05 !important; }
            .matches-report-style .player-name { font-weight: 700; font-size: 10pt; }
            .matches-report-style .player-name-right { text-align: right; padding-right: 8px; }
            .matches-report-style .player-name-left { text-align: left; padding-left: 8px; }
            .matches-report-style .font-mono { font-family: 'Consolas', 'Menlo', 'Courier New', monospace; font-size: 10pt; }
            .matches-report-style .pts-col { font-weight: 700; text-align: center; font-size: 12pt;}
            .matches-report-style .cat-col { font-family: 'Segoe UI Black', 'Arial Black', sans-serif; font-weight: 900; font-size: 10pt; text-align: center; }
            .matches-report-style .action-cell button { color: #9ca3af; }
            .matches-report-style .action-cell button:hover { color: #ffffff; }
            .matches-report-style .suspended-row td { text-decoration: none !important; color: #ff4d4f !important; background: #2a1a1a !important; opacity: 0.85; font-weight: 700; }
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

function openScoreModal(match) {
    const modalContainer = document.getElementById('score-modal-container');
    const sets = match.sets || [];
    const isPlayed = !!match.winner_id;
    const playersInCategory = allPlayers.filter(p => p.category_id === match.category_id);

    modalContainer.innerHTML = `
        <div id="score-modal-overlay" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-2 z-50">
            <div id="score-modal-content" class="bg-[#232323] rounded-xl shadow-lg w-full max-w-lg border border-[#444] mx-2 sm:mx-0 flex flex-col max-h-[90vh]">
                
                <style>
                    .modal-player-name { font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
                    @media (max-width: 640px) { .modal-player-name { font-size: 0.75rem; } }
                </style>

                <div class="p-4 sm:p-6 border-b border-[#333] flex-shrink-0">
                    <h3 class="text-lg sm:text-xl font-bold text-yellow-400">Editar Partido / Resultado</h3>
                </div>

                <div class="overflow-y-auto">
                    <form id="score-form" class="p-4 sm:p-6 space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <div class="grid grid-cols-3 gap-2 sm:gap-4 items-center pt-4 border-t border-gray-700 mt-4">
                            <span class="font-semibold text-gray-200">SET</span>
                            <span class="font-semibold text-center text-gray-200 modal-player-name">${match.player1.name}</span>
                            <span class="font-semibold text-center text-gray-200 modal-player-name">${match.player2.name}</span>
                        </div>
                        ${[1, 2, 3].map(i => `
                            <div class="grid grid-cols-3 gap-2 sm:gap-4 items-center">
                                <span class="text-gray-300">Set ${i}</span>
                                <input type="number" id="p1_set${i}" class="input-field text-center bg-[#181818] text-gray-100 border-[#444]" value="${sets[i-1]?.p1 ?? ''}" min="0" max="9">
                                <input type="number" id="p2_set${i}" class="input-field text-center bg-[#181818] text-gray-100 border-[#444]" value="${sets[i-1]?.p2 ?? ''}" min="0" max="9">
                            </div>
                        `).join('')}
                    </form>

                    ${!isPlayed ? `
                        <div id="wo-section" class="p-4 bg-[#1d1d1d] border-y border-[#333] text-center"></div>
                        <div id="ret-section" class="p-4 bg-[#1d1d1d] border-b border-[#333] text-center"></div>
                    ` : ''}
                </div>

                <div class="p-4 bg-[#181818] flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 rounded-b-xl border-t border-[#333] flex-shrink-0">
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

    document.getElementById('btn-save-score').onclick = () => saveScores(match.id);
    document.getElementById('btn-cancel-modal').onclick = closeModal;
    document.getElementById('btn-delete-match').onclick = () => deleteMatch(match.id);
    document.getElementById('btn-suspend-match').onclick = () => suspendMatch(match.id);
    if (match.winner_id) document.getElementById('btn-clear-score').onclick = () => clearScore(match.id);
    document.getElementById('score-modal-overlay').onclick = (e) => { if (e.target.id === 'score-modal-overlay') closeModal(); };

    if (!isPlayed) {
        const woSection = document.getElementById('wo-section');
        const retSection = document.getElementById('ret-section');

        if(woSection) {
            woSection.innerHTML = `
                <p class="text-sm font-medium text-gray-400 mb-2">Si un jugador no se presenta (Walkover):</p>
                <div class="flex flex-col sm:flex-row justify-center gap-2 sm:gap-4">
                     <button id="btn-wo-p1" class="btn btn-secondary !py-1 !px-3 !text-sm !text-yellow-300">Gana ${match.player1.name} por WO</button>
                     <button id="btn-wo-p2" class="btn btn-secondary !py-1 !px-3 !text-sm !text-yellow-300">Gana ${match.player2.name} por WO</button>
                </div>
            `;
            document.getElementById('btn-wo-p1').onclick = () => handleWoWin(match.id, match.player1_id, match.player2_id);
            document.getElementById('btn-wo-p2').onclick = () => handleWoWin(match.id, match.player2_id, match.player1_id);
        }
        
        if(retSection) {
            retSection.innerHTML = `
                <p class="text-sm font-medium text-gray-400 mb-2">Si un jugador se retira a mitad de partido:</p>
                <div class="flex flex-col sm:flex-row justify-center gap-2 sm:gap-4">
                     <button id="btn-ret-p1" class="btn btn-secondary !py-1 !px-3 !text-sm !text-orange-400">Se retira ${match.player1.name}</button>
                     <button id="btn-ret-p2" class="btn btn-secondary !py-1 !px-3 !text-sm !text-orange-400">Se retira ${match.player2.name}</button>
                </div>
            `;
            document.getElementById('btn-ret-p1').onclick = () => handleRetirement(match, 'p1');
            document.getElementById('btn-ret-p2').onclick = () => handleRetirement(match, 'p2');
        }
    }
}


async function handleRetirement(match, retiringSide) {
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

    if (sets.length === 0) {
        return showToast("Por favor, ingrese el resultado de al menos un game antes de registrar un retiro.", "error");
    }

    const winner_id = retiringSide === 'p1' ? match.player2_id : match.player1_id;
    const bonus_loser = (retiringSide === 'p1' && p1SetsWon >= 1) || (retiringSide === 'p2' && p2SetsWon >= 1);

    const retiringPlayerName = retiringSide === 'p1' ? match.player1.name : match.player2.name;
    if (!confirm(`¿Confirmas que ${retiringPlayerName} se retira del partido?`)) {
        return;
    }

    const updateData = {
        winner_id,
        sets,
        status: 'completado_ret',
        bonus_loser
    };

    const { error } = await supabase.from('matches').update(updateData).eq('id', match.id);

    if (error) {
        showToast("Error al registrar el retiro: " + error.message, "error");
    } else {
        showToast("Retiro registrado con éxito.", "success");
        closeModal();
        await loadDashboardData();
    }
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
    if (p1_id === p2_id) {
        showToast("Los jugadores no pueden ser los mismos.", "error");
        return;
    }

    let winner_id = null;
    if (sets.length > 0) {
        if (sets.length < 2 || (p1SetsWon < 2 && p2SetsWon < 2)) {
            showToast("El resultado no es válido. Un jugador debe ganar al menos 2 sets.", "error");
            return;
        }
        winner_id = p1SetsWon > p2SetsWon ? p1_id : p2_id;
    }
    
    const { error } = await supabase.from('matches').update({ 
            sets: sets.length > 0 ? sets : null, 
            winner_id,
            status: winner_id ? 'completado' : 'programado',
            player1_id: p1_id,
            player2_id: p2_id,
            bonus_loser: (p1SetsWon === 1 && winner_id == p2_id) || (p2SetsWon === 1 && winner_id == p1_id)
        }).eq('id', matchId);
    
    if (error) {
        showToast("Error al guardar: " + error.message, "error");
    } else { 
        showToast(winner_id ? "Resultado guardado." : "Partido actualizado.", "success");
        closeModal(); 
        await loadDashboardData(); 
    }
}

async function handleWoWin(matchId, winnerId, loserId) {
    const winner = allPlayers.find(p => p.id === winnerId);
    const loser = allPlayers.find(p => p.id === loserId);

    if (!confirm(`¿Confirmas que ${winner?.name} gana por no presentación de ${loser?.name}?`)) {
        return;
    }

    const { error } = await supabase.from('matches').update({
        winner_id: winnerId,
        sets: null,
        status: 'completado_wo',
        bonus_loser: false
    }).eq('id', matchId);

    if (error) {
        showToast("Error al registrar el WO: " + error.message, "error");
    } else {
        showToast("Walkover registrado con éxito.", "success");
        closeModal();
        await loadDashboardData();
    }
}

async function clearScore(matchId) {
    if (confirm("¿Limpiar el resultado de este partido?")) {
        const { error } = await supabase.from('matches').update({ sets: null, winner_id: null, bonus_loser: false, status: 'programado' }).eq('id', matchId);
        if (error) {
            showToast("Error: " + error.message, "error");
        } else { 
            showToast("Resultado limpiado.", "success");
            closeModal(); 
            await loadDashboardData(); 
        }
    }
}

async function deleteMatch(matchId) {
    if (confirm("¿ELIMINAR este partido permanentemente?")) {
        const { error } = await supabase.from('matches').delete().eq('id', matchId);
        if (error) {
            showToast("Error: " + error.message, "error");
        } else { 
            showToast("Partido eliminado.", "success");
            closeModal(); 
            await loadDashboardData(); 
        }
    }
}

async function suspendMatch(matchId) {
    if (confirm("¿Marcar este partido como suspendido?")) {
        const { error } = await supabase.from('matches').update({ status: 'suspendido', sets: null, winner_id: null, bonus_loser: false }).eq('id', matchId);
        if (error) {
            showToast("Error: " + error.message, "error");
        } else { 
            showToast("Partido marcado como suspendido.", "success");
            closeModal(); 
            await loadDashboardData(); 
        }
    }
}


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

// --- ** FUNCIONES Y LÓGICA PARA LOS GRÁFICOS ** ---

// Configuración global para los gráficos de Chart.js
Chart.defaults.color = '#e5e7eb'; // Color de fuente (etiquetas, ejes)
Chart.defaults.borderColor = '#4b5563'; // Color de las líneas de la cuadrícula

/**
 * Renderiza el gráfico de Torta (Doughnut) para "Torneos por Categoría".
 * @param {object} categoryData - Objeto con { "NombreCategoría": count, ... }
 */
function renderCategoryChart(categoryData) {
    const ctx = document.getElementById('categoryChart')?.getContext('2d');
    if (!ctx) return;

    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);

    // Paleta de colores más vibrante y oscura
    const backgroundColors = [
        '#facc15', // yellow-400
        '#fb923c', // orange-400
        '#60a5fa', // blue-400
        '#4ade80', // green-400
        '#f87171', // red-400
        '#a78bfa', // violet-400
        '#22d3ee', // cyan-400
        '#fb7185', // rose-400
    ];

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Torneos',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: '#222222',
                borderWidth: 3,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Torneos Activos por Categoría',
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 20 }
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

/**
 * Renderiza el gráfico de Barras para "Estado de Partidos".
 * @param {object} statusData - Objeto con { "Pendientes": count, "Completados": count, ... }
 */
function renderStatusChart(statusData) {
    const ctx = document.getElementById('statusChart')?.getContext('2d');
    if (!ctx) return;

    const labels = Object.keys(statusData);
    const data = Object.values(statusData);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total de Partidos',
                data: data,
                backgroundColor: [
                    '#fb923c', // orange-400 (Pendientes)
                    '#4ade80', // green-400 (Completados)
                    '#f87171', // red-400 (Suspendidos)
                ],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Hace el gráfico de barras horizontal
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: '#374151' // Líneas de cuadrícula más tenues
                    }
                },
                y: {
                    grid: {
                        display: false // Sin líneas de cuadrícula en el eje Y
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Estado General de Partidos',
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 20 }
                },
                legend: {
                    display: false // Ocultar leyenda, es obvio por las etiquetas
                }
            }
        }
    });
}