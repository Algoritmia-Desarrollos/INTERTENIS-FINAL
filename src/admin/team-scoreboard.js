import { supabase } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

const TEAM_CATEGORY_NAME = "Equipos";

/**
 * Función principal y exportada. Renderiza el marcador completo de un torneo de equipos
 * dentro de un contenedor HTML proporcionado.
 * @param {HTMLElement} container - El elemento del DOM donde se renderizará el scoreboard.
 * @param {string} teamTournamentId - El ID del torneo de equipos a mostrar.
 */
export async function renderTeamScoreboard(container, teamTournamentId) {
    if (!container || !teamTournamentId) {
        if(container) container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '<p class="text-center p-8 text-gray-400">Calculando marcador de equipos...</p>';

    // --- 1. Obtener datos ---
    const { data: linked } = await supabase.from('linked_tournaments').select('source_tournament_id').eq('team_tournament_id', teamTournamentId);
    if (!linked) {
        container.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Error al cargar los torneos vinculados.</p></div>';
        return;
    }
    
    const sourceTournamentIds = linked.map(l => l.source_tournament_id);
    if (!sourceTournamentIds.includes(parseInt(teamTournamentId))) {
        sourceTournamentIds.push(parseInt(teamTournamentId));
    }

    const [{ data: matches }, { data: teams }] = await Promise.all([
        supabase.from('matches').select('*, player1:player1_id(team_id), player2:player2_id(team_id), player3:player3_id(team_id), player4:player4_id(team_id)').in('tournament_id', sourceTournamentIds).not('winner_id', 'is', null),
        supabase.from('teams').select('*')
    ]);

    if (!matches || !teams) {
        container.innerHTML = '<p class="text-red-500">Error al cargar datos de partidos o equipos.</p>';
        return;
    }

    // --- 2. Procesar y agrupar los datos ---
    const teamStats = teams.reduce((acc, team) => {
        acc[team.id] = { ...team, totalPoints: 0, byFortnight: {} };
        return acc;
    }, {});
    
    const matchDates = matches.map(m => new Date(m.match_date)).sort((a, b) => a - b);
    const fortnights = {};
    if (matchDates.length > 0) {
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
    }

    matches.forEach(match => {
        const matchDate = new Date(match.match_date);
        const fortnightLabel = Object.keys(fortnights).find(label => matchDate >= fortnights[label].start && matchDate <= fortnights[label].end);
        if (!fortnightLabel) return;

        const { p1_points, p2_points } = calculatePoints(match);
        const isDoubles = !!(match.player3_id && match.player4_id);

        const team1_id = match.player1?.team_id;
        const team2_id = match.player2?.team_id;

        if (team1_id && teamStats[team1_id]) {
            const team = teamStats[team1_id];
            if (!team.byFortnight[fortnightLabel]) team.byFortnight[fortnightLabel] = { singles: 0, doubles: 0, total: 0 };
            
            if (isDoubles) team.byFortnight[fortnightLabel].doubles += p1_points;
            else team.byFortnight[fortnightLabel].singles += p1_points;
        }

        if (team2_id && teamStats[team2_id]) {
            const team = teamStats[team2_id];
            if (!team.byFortnight[fortnightLabel]) team.byFortnight[fortnightLabel] = { singles: 0, doubles: 0, total: 0 };

            if (isDoubles) team.byFortnight[fortnightLabel].doubles += p2_points;
            else team.byFortnight[fortnightLabel].singles += p2_points;
        }
    });

    Object.values(teamStats).forEach(team => {
        let subTotal = 0;
        Object.values(team.byFortnight).forEach(fortnight => {
            fortnight.total = fortnight.singles + fortnight.doubles;
            subTotal += fortnight.total;
        });
        team.subTotal = subTotal;
        team.totalPoints = subTotal;
    });

    const sortedTeams = Object.values(teamStats).sort((a, b) => b.totalPoints - a.totalPoints);

    // --- 3. Renderizar el HTML ---
    container.innerHTML = generateScoreboardHTML(sortedTeams, fortnights);
}

function generateScoreboardHTML(sortedTeams, fortnights) {
    let gridHTML = `
        <style>
            .scoreboard-container { display: grid; gap: 2px; background-color: #4a4a4a; border-radius: 8px; overflow: hidden; border: 2px solid #4a4a4a; }
            .scoreboard-container > div { background-color: #18191b; padding: 6px 4px; }
            .grid-corner { background-color: #000 !important; }
            .team-header-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.1rem; line-height: 1.2; padding: 12px 8px; text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); }
            .team-pos { font-size: 0.8rem; opacity: 0.8; }
            .team-name { font-size: 1.2rem; }
            .sub-header-label { display: flex; align-items: center; justify-content: center; background-color: #000; font-weight: bold; font-size: 0.8rem; }
            .sub-header-group { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; padding: 0; background-color: #4a4a4a; font-size: 0.7rem; font-weight: 600; color: #9ca3af; text-transform: uppercase; }
            .sub-header-group > span { background-color: #000; display: flex; align-items: center; justify-content: center; padding: 4px 2px; }
            .date-label-cell { display: flex; align-items: center; justify-content: center; background-color: #000; font-weight: bold; color: #facc15; font-size: 0.8rem; }
            .data-cell-group { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; padding: 0; background-color: #4a4a4a; font-size: 0.9rem; text-align: center; gap: 1px; }
            .data-cell-group > span { background-color: #222222; display: flex; align-items: center; justify-content: center; padding: 8px 2px; }
            .data-cell-group > span.total-col { font-weight: 700; color: #f3f4f6; background-color: #111; }
            .footer-label, .footer-cell { display: flex; align-items: center; justify-content: center; font-weight: bold; }
            .footer-label { background-color: #000; font-size: 0.85rem; }
            .footer-cell { font-size: 1.2rem; }
            .footer-label.total { color: #facc15; font-size: 1rem; }
            .footer-cell.total { font-size: 1.5rem; color: #facc15; }
        </style>
        <div class="scoreboard-container" style="grid-template-columns: 120px repeat(${sortedTeams.length}, 1fr);">
    `;
    
    gridHTML += `<div class="grid-corner"></div>`;
    sortedTeams.forEach((team, index) => {
        gridHTML += `<div class="team-header-cell" style="background-color: ${team.color || '#333'};"><span class="team-pos">Pos. ${index + 1}</span><span class="team-name">${team.name}</span></div>`;
    });

    gridHTML += `<div class="sub-header-label">Fechas</div>`;
    sortedTeams.forEach(() => {
        gridHTML += `<div class="sub-header-group"><span>Singles</span><span>Dobles</span><span class="total-col">TOTAL</span></div>`;
    });

    Object.keys(fortnights).forEach(label => {
        gridHTML += `<div class="date-label-cell">${label}</div>`;
        sortedTeams.forEach(team => {
            const data = team.byFortnight[label] || { singles: 0, doubles: 0, total: 0 };
            gridHTML += `<div class="data-cell-group"><span>${data.singles}</span><span>${data.doubles}</span><span class="total-col font-bold">${data.total}</span></div>`;
        });
    });

    gridHTML += `<div class="footer-label">Sub Total</div>`;
    sortedTeams.forEach(team => gridHTML += `<div class="footer-cell subtotal">${team.subTotal}</div>`);
    gridHTML += `<div class="footer-label">Pts. Extras</div>`;
    sortedTeams.forEach(() => gridHTML += `<div class="footer-cell">0</div>`);
    gridHTML += `<div class="footer-label total">TOTAL</div>`;
    sortedTeams.forEach(team => gridHTML += `<div class="footer-cell total">${team.totalPoints}</div>`);

    gridHTML += `</div>`;
    return gridHTML;
}