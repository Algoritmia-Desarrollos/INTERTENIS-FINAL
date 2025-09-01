import { supabase } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

// --- ESTADO Y LÓGICA DE EDICIÓN ---
let isEditMode = false;
let originalTeamStats = {}; 
let currentMatches = [];

/**
 * Función principal y exportada. Renderiza el marcador completo de un torneo de equipos.
 * @param {HTMLElement} container - El elemento del DOM donde se renderizará el scoreboard.
 * @param {string} teamTournamentId - El ID del torneo de equipos a mostrar.
 * @param {object} options - Opciones de renderizado { isAdmin: boolean }.
 */
export async function renderTeamScoreboard(container, teamTournamentId, options = {}) {
    const { isAdmin = false } = options; // <--- NUEVO: Detecta si es admin

    if (!container) return;
    if (!teamTournamentId) {
        container.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione un torneo de equipos para ver el marcador.</p></div>';
        return;
    }
    
    isEditMode = false; 
    container.innerHTML = '<p class="text-center p-8 text-gray-400">Calculando marcador de equipos...</p>';

    // ... (El resto de la lógica de carga de datos no cambia) ...
    const [{ data: linked }, { data: teams }, { data: manualPointsData }] = await Promise.all([
        supabase.from('linked_tournaments').select('source_tournament_id').eq('team_tournament_id', teamTournamentId),
        supabase.from('teams').select('*'),
        supabase.from('team_tournament_manual_points').select('*').eq('team_tournament_id', teamTournamentId)
    ]);

    if (!linked || !teams) {
        container.innerHTML = '<p class="text-red-500">Error al cargar datos del torneo o equipos.</p>';
        return;
    }
    
    const manualPointsMap = (manualPointsData || []).reduce((acc, record) => {
        acc[`${record.team_id}-${record.fortnight_label}`] = record.manual_doubles_points;
        return acc;
    }, {});

    const sourceTournamentIds = linked.map(l => l.source_tournament_id);
    if (!sourceTournamentIds.includes(parseInt(teamTournamentId))) {
        sourceTournamentIds.push(parseInt(teamTournamentId));
    }

    const { data: matches } = await supabase.from('matches').select('*, player1:player1_id(team_id), player2:player2_id(team_id), player3:player3_id(team_id), player4:player4_id(team_id)').in('tournament_id', sourceTournamentIds).not('winner_id', 'is', null);
    
    currentMatches = matches || [];

    if (!matches) {
        container.innerHTML = '<p class="text-red-500">Error al cargar datos de partidos.</p>';
        return;
    }
    
    const teamStats = teams.reduce((acc, team) => {
        acc[team.id] = { ...team, totalPoints: 0, byFortnight: {} };
        return acc;
    }, {});
    
    const fortnights = getFortnights(matches);

    matches.filter(m => !m.player3_id).forEach(match => {
        const fortnightLabel = getFortnightLabelForDate(new Date(match.match_date), fortnights);
        if (!fortnightLabel) return;
        const { p1_points, p2_points } = calculatePoints(match);
        const team1_id = match.player1?.team_id;
        const team2_id = match.player2?.team_id;
        if (team1_id && teamStats[team1_id]) {
            const team = teamStats[team1_id];
            if (!team.byFortnight[fortnightLabel]) team.byFortnight[fortnightLabel] = { singles: 0, doubles: 0, total: 0 };
            team.byFortnight[fortnightLabel].singles += p1_points;
        }
        if (team2_id && teamStats[team2_id]) {
            const team = teamStats[team2_id];
            if (!team.byFortnight[fortnightLabel]) team.byFortnight[fortnightLabel] = { singles: 0, doubles: 0, total: 0 };
            team.byFortnight[fortnightLabel].singles += p2_points;
        }
    });

    Object.values(teamStats).forEach(team => {
        Object.keys(fortnights).forEach(label => {
            if (!team.byFortnight[label]) team.byFortnight[label] = { singles: 0, doubles: 0, total: 0 };
            const manualPoints = manualPointsMap[`${team.id}-${label}`];
            team.byFortnight[label].doubles = manualPoints !== undefined ? manualPoints : 0;
        });
    });

    calculateAllTotals(teamStats);
    
    originalTeamStats = JSON.parse(JSON.stringify(teamStats));
    const sortedTeams = Object.values(teamStats).sort((a, b) => b.totalPoints - a.totalPoints);
    
    // --- Renderizar HTML y Eventos ---
    container.innerHTML = generateScoreboardHTML(sortedTeams, fortnights, teamTournamentId, isAdmin);
    
    // --- NUEVO: Los eventos de edición solo se activan si es admin ---
    if (isAdmin) {
        setupEventListeners(container, teamTournamentId);
    }
}


// --- LÓGICA DE CÁLCULO Y RENDERIZADO ---
// ... (Las funciones getFortnights, getFortnightLabelForDate, calculateAllTotals no cambian) ...
function getFortnights(matches) {
    const matchDates = matches.map(m => new Date(m.match_date)).sort((a, b) => a - b);
    const fortnights = {};
    if (matchDates.length === 0) return fortnights;
    
    const firstDay = matchDates[0];
    let currentFortnightStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() <= 15 ? 1 : 16);
    const lastDay = matchDates[matchDates.length - 1];

    while (currentFortnightStart <= lastDay) {
        let nextFortnightStart;
        if (currentFortnightStart.getDate() === 1) {
            nextFortnightStart = new Date(currentFortnightStart.getFullYear(), currentFortnightStart.getMonth(), 16);
        } else {
            nextFortnightStart = new Date(currentFortnightStart.getFullYear(), currentFortnightStart.getMonth() + 1, 1);
        }
        const startDateStr = currentFortnightStart.toLocaleDateString('es-AR', {day: 'numeric', month: 'numeric'});
        const endDate = new Date(nextFortnightStart.getTime() - 1);
        const endDateStr = endDate.toLocaleDateString('es-AR', {day: 'numeric', month: 'numeric'});
        const label = `${startDateStr} al ${endDateStr}`;
        fortnights[label] = { start: currentFortnightStart, end: endDate };
        currentFortnightStart = nextFortnightStart;
    }
    return fortnights;
}

function getFortnightLabelForDate(date, fortnights) {
    return Object.keys(fortnights).find(label => date >= fortnights[label].start && date <= fortnights[label].end);
}

function calculateAllTotals(teamStats) {
    Object.values(teamStats).forEach(team => {
        let subTotal = 0;
        Object.values(team.byFortnight).forEach(fortnight => {
            fortnight.total = (fortnight.singles || 0) + (fortnight.doubles || 0);
            subTotal += fortnight.total;
        });
        team.subTotal = subTotal;
        team.totalPoints = subTotal; // Aquí se podrían sumar puntos extras en el futuro
    });
}

function isColorLight(hex) {
    if (!hex) return false;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substr(0, 2), 16),
          g = parseInt(c.substr(2, 2), 16),
          b = parseInt(c.substr(4, 2), 16);
    return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
}

function generateScoreboardHTML(sortedTeams, fortnights, tournamentId, isAdmin) {
    // --- NUEVO: Los botones solo se generan si es admin ---
    const editButtonsHTML = isAdmin ? `
        <div class="flex justify-end gap-2 mb-4">
            <button id="edit-mode-btn" class="btn btn-secondary !py-1 !px-3 text-xs"><span class="material-icons !text-sm">edit</span> Editar Puntos de Dobles</button>
            <button id="save-changes-btn" class="btn btn-primary !py-1 !px-3 text-xs hidden"><span class="material-icons !text-sm">save</span> Guardar Cambios</button>
            <button id="cancel-changes-btn" class="btn btn-secondary !py-1 !px-3 text-xs hidden"><span class="material-icons !text-sm">cancel</span> Cancelar</button>
        </div>` : '';
        
    let gridHTML = `
       
        ${editButtonsHTML}
        <div class="overflow-x-auto">
            <div id="scoreboard-grid" class="scoreboard-container" style="grid-template-columns: 120px repeat(${sortedTeams.length}, 1fr);">
    `;
    
    // ... (El resto de la generación de la tabla no cambia) ...
    gridHTML += `<div class="grid-corner"></div>`;
    sortedTeams.forEach((team, index) => {
        const textColor = isColorLight(team.color) ? '#000' : '#fff';
        gridHTML += `<div class="team-header-cell" style="background-color: ${team.color || '#333'}; color: ${textColor};"><span class="team-pos">Pos. ${index + 1}</span>${team.image_url ? `<img src="${team.image_url}" alt="${team.name} logo" class="team-logo">` : ''}<span class="team-name">${team.name}</span></div>`;
    });

    gridHTML += `<div class="sub-header-label">Fechas</div>`;
    sortedTeams.forEach(() => {
        gridHTML += `<div class="sub-header-group"><span>Singles</span><span>Dobles</span><span class="total-col">TOTAL</span></div>`;
    });

    Object.keys(fortnights).forEach(label => {
        gridHTML += `<div class="date-label-cell">${label}</div>`;
        sortedTeams.forEach(team => {
            const data = team.byFortnight[label] || { singles: 0, doubles: 0, total: 0 };
            gridHTML += `
                <div class="data-cell-group" data-team-id="${team.id}" data-fortnight-label="${label}">
                    <span class="singles-val">${data.singles}</span>
                    <div class="doubles-cell">
                        <span class="display-val">${data.doubles}</span>
                        <input type="number" class="edit-input hidden" value="${data.doubles}" min="0">
                    </div>
                    <span class="total-col font-bold total-fortnight-val">${data.total}</span>
                </div>`;
        });
    });

    gridHTML += `<div class="footer-label">Sub Total</div>`;
    sortedTeams.forEach(team => gridHTML += `<div class="footer-cell subtotal-val" data-team-id="${team.id}">${team.subTotal}</div>`);
    gridHTML += `<div class="footer-label">Pts. Extras</div>`;
    sortedTeams.forEach(() => gridHTML += `<div class="footer-cell">0</div>`);
    gridHTML += `<div class="footer-label total">TOTAL</div>`;
    sortedTeams.forEach(team => gridHTML += `<div class="footer-cell total total-val" data-team-id="${team.id}">${team.totalPoints}</div>`);

    gridHTML += `</div></div>`;
    
    const style = `
        <style>
            .scoreboard-container { display: grid; gap: 2px; background-color: #4a4a4a; border-radius: 8px; border: 2px solid #4a4a4a; min-width: ${120 + (sortedTeams.length * 140)}px; }
            .scoreboard-container > div { background-color: #18191b; padding: 2px 4px; }
            .grid-corner, .sub-header-label, .date-label-cell, .footer-label { background-color: #000 !important; font-weight: bold; display:flex; align-items:center; justify-content:center; }
            .team-header-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: bold; padding: 12px 8px; }
            .team-header-cell .team-logo { width: 40px; height: 40px; object-fit: contain; margin-bottom: 4px; }
            .team-header-cell .team-name { font-size: 1.5rem; } /* Increased for better visibility */
            .sub-header-group { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; padding: 0; background-color: #4a4a4a; font-size: 0.7rem; font-weight: 600; color: #9ca3af; text-transform: uppercase; }
            .sub-header-group > span { background-color: #000; display: flex; align-items: center; justify-content: center; padding: 4px 2px; }
            .date-label-cell { color: #facc15; }
            .data-cell-group { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; padding: 0; background-color: #4a4a4a; text-align: center; }
            .data-cell-group > * { background-color: #222222; display: flex; align-items: center; justify-content: center; padding: 8px 2px; }
            .total-col, .footer-label.total { color: #facc15; font-weight: 700; }
            .footer-cell.total { color: #facc15; font-weight: 700; }
            .footer-cell { font-size: 1.2rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; text-align: center; }
            .total-val { font-size: 1.5rem; }
            .edit-input { width: 100%; height: 100%; background-color: #fff; color: #000; border: 2px solid #facc15; text-align: center; font-weight: bold; padding: 0; margin: 0; -moz-appearance: textfield; }
            .edit-input::-webkit-outer-spin-button, .edit-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .is-editing .display-val { display: none; }
            .is-editing .edit-input { display: flex; }
        </style>
    `;
    return style + gridHTML;
}

// ... (El resto del archivo, setupEventListeners y recalculateUITotals, no cambia) ...
function setupEventListeners(container, tournamentId) {
    const editBtn = container.querySelector('#edit-mode-btn');
    const saveBtn = container.querySelector('#save-changes-btn');
    const cancelBtn = container.querySelector('#cancel-changes-btn');
    const grid = container.querySelector('#scoreboard-grid');

    editBtn.addEventListener('click', () => {
        isEditMode = true;
        grid.classList.add('is-editing');
        editBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');
        cancelBtn.classList.remove('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        isEditMode = false;
        // Recargamos el componente para descartar cambios
        renderTeamScoreboard(container, tournamentId, { isAdmin: true });
    });

    saveBtn.addEventListener('click', async () => {
        const inputs = grid.querySelectorAll('.edit-input');
        const upsertData = [];
        inputs.forEach(input => {
            const cellGroup = input.closest('.data-cell-group');
            upsertData.push({
                team_tournament_id: tournamentId,
                team_id: cellGroup.dataset.teamId,
                fortnight_label: cellGroup.dataset.fortnightLabel,
                manual_doubles_points: parseInt(input.value, 10) || 0,
            });
        });
        
        const { error } = await supabase.from('team_tournament_manual_points').upsert(upsertData, {
            onConflict: 'team_tournament_id,team_id,fortnight_label'
        });

        if (error) {
            console.error("Error al guardar en Supabase:", error);
            alert('Error al guardar los puntos. Revisa los permisos de la tabla en Supabase. Detalles en la consola.');
        } else {
            alert('Puntos guardados correctamente.');
            isEditMode = false;
            // Recargar todo el componente para reflejar los datos guardados
            renderTeamScoreboard(container, tournamentId, { isAdmin: true });
        }
    });

    grid.addEventListener('input', (e) => {
        if (e.target.classList.contains('edit-input')) {
            recalculateUITotals(e.target);
        }
    });
}

function recalculateUITotals(changedInput) {
    const cellGroup = changedInput.closest('.data-cell-group');
    const teamId = cellGroup.dataset.teamId;

    const singlesVal = parseInt(cellGroup.querySelector('.singles-val').textContent, 10);
    const doublesVal = parseInt(changedInput.value, 10) || 0;
    cellGroup.querySelector('.total-fortnight-val').textContent = singlesVal + doublesVal;
    
    let newSubTotal = 0;
    const allFortnightsForTeam = document.querySelectorAll(`.data-cell-group[data-team-id="${teamId}"]`);
    allFortnightsForTeam.forEach(group => {
        newSubTotal += parseInt(group.querySelector('.total-fortnight-val').textContent, 10);
    });
    
    const subTotalCell = document.querySelector(`.subtotal-val[data-team-id="${teamId}"]`);
    const totalCell = document.querySelector(`.total-val[data-team-id="${teamId}"]`);
    subTotalCell.textContent = newSubTotal;
    totalCell.textContent = newSubTotal;
}