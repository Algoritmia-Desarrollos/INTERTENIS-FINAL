import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const tournamentFilter = document.getElementById('tournament-filter');
const scoreboardContainer = document.getElementById('scoreboard-container');
const TEAM_CATEGORY_NAME = "Equipos";

// --- Lógica Principal ---
async function initialize() {
    header.innerHTML = renderHeader();
    await populateTournamentFilter();

    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('id');
    if (tournamentId) {
        tournamentFilter.value = tournamentId;
        renderScoreboard();
    }
}

async function populateTournamentFilter() {
    const { data: category } = await supabase.from('categories').select('id').eq('name', TEAM_CATEGORY_NAME).single();
    if (!category) return;

    const { data: teamTournaments } = await supabase.from('tournaments').select('id, name').eq('category_id', category.id);
    if (!teamTournaments) return;

    tournamentFilter.innerHTML = '<option value="">Seleccione un torneo...</option>';
    teamTournaments.forEach(t => {
        tournamentFilter.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

async function renderScoreboard() {
    const teamTournamentId = tournamentFilter.value;
    if (!teamTournamentId) {
        scoreboardContainer.innerHTML = '';
        return;
    }
    
    scoreboardContainer.innerHTML = '<p class="text-center p-8 text-gray-400">Calculando marcador de equipos...</p>';

    // --- 1. Obtener datos ---
    const { data: linked } = await supabase.from('linked_tournaments').select('source_tournament_id').eq('team_tournament_id', teamTournamentId);
    if (!linked) {
        scoreboardContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Error al cargar los torneos vinculados.</p></div>';
        return;
    }
    
    const sourceTournamentIds = linked.map(l => l.source_tournament_id);
    // Añadir el ID del propio torneo de equipos para incluir sus partidos de dobles
    if (!sourceTournamentIds.includes(parseInt(teamTournamentId))) {
        sourceTournamentIds.push(parseInt(teamTournamentId));
    }

    const [{ data: matches }, { data: teams }] = await Promise.all([
        supabase.from('matches').select('*, player1:player1_id(team_id), player2:player2_id(team_id), player3:player3_id(team_id), player4:player4_id(team_id)').in('tournament_id', sourceTournamentIds).not('winner_id', 'is', null),
        supabase.from('teams').select('*')
    ]);

    if (!matches || !teams) {
        scoreboardContainer.innerHTML = '<p class="text-red-500">Error al cargar datos de partidos o equipos.</p>';
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

        // Asignar puntos al equipo del Lado 1
        if (team1_id && teamStats[team1_id]) {
            const team = teamStats[team1_id];
            if (!team.byFortnight[fortnightLabel]) team.byFortnight[fortnightLabel] = { singles: 0, doubles: 0, total: 0 };
            
            if (isDoubles) team.byFortnight[fortnightLabel].doubles += p1_points;
            else team.byFortnight[fortnightLabel].singles += p1_points;
        }

        // Asignar puntos al equipo del Lado 2
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
    let gridHTML = '';
    gridHTML += `<div class="grid-corner"></div>`;
    sortedTeams.forEach((team, index) => {
        gridHTML += `<div class="team-header-cell" style="background-color: ${team.color || '#333'}; text-shadow: 1px 1px 3px rgba(0,0,0,0.6);"><span class="team-pos">Pos. ${index + 1}</span><span class="team-name">${team.name}</span></div>`;
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

    scoreboardContainer.innerHTML = `<div class="scoreboard-container" style="grid-template-columns: 120px repeat(${sortedTeams.length}, 1fr);">${gridHTML}</div>`;
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initialize);
tournamentFilter.addEventListener('change', renderScoreboard);