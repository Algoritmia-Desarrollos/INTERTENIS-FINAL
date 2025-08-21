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
    if (!linked || linked.length === 0) {
        scoreboardContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Este torneo no tiene torneos vinculados para sumar puntos.</p></div>';
        return;
    }
    const sourceTournamentIds = linked.map(l => l.source_tournament_id);

    const [{ data: matches }, { data: teams }] = await Promise.all([
        supabase.from('matches').select('*, player1:player1_id(team_id), player2:player2_id(team_id)').in('tournament_id', sourceTournamentIds).not('winner_id', 'is', null),
        supabase.from('teams').select('*')
    ]);

    if (!matches || !teams) {
        scoreboardContainer.innerHTML = '<p class="text-red-500">Error al cargar datos.</p>';
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
            const label = `Quincena del ${currentFortnightStart.toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'})}`;
            fortnights[label] = { start: currentFortnightStart, end: new Date(nextFortnightStart.getTime() - 1) };
            currentFortnightStart = nextFortnightStart;
        }
    }

    matches.forEach(match => {
        const matchDate = new Date(match.match_date);
        let fortnightLabel = Object.keys(fortnights).find(label => matchDate >= fortnights[label].start && matchDate <= fortnights[label].end);
        if (!fortnightLabel) return;

        const { p1_points, p2_points } = calculatePoints(match);
        const isDoubles = match.player3_id && match.player4_id;
        
        const processPoints = (player, points) => {
            if (player && player.team_id && teamStats[player.team_id]) {
                const team = teamStats[player.team_id];
                if (!team.byFortnight[fortnightLabel]) team.byFortnight[fortnightLabel] = { singles: 0, doubles: 0, total: 0 };
                
                if (isDoubles) team.byFortnight[fortnightLabel].doubles += points;
                else team.byFortnight[fortnightLabel].singles += points;
            }
        };
        processPoints(match.player1, p1_points);
        processPoints(match.player2, p2_points);
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
    // Fila 1: Vacío + Cabeceras de Equipos
    gridHTML += `<div class="grid-corner"></div>`;
    sortedTeams.forEach((team, index) => {
        gridHTML += `<div class="team-header-cell" style="background-color: ${team.color || '#333'};"><span class="team-pos">Pos. ${index + 1}</span><span class="team-name">${team.name}</span></div>`;
    });

    // Fila 2: "Fechas" + Sub-cabeceras
    gridHTML += `<div class="sub-header-label">Fechas</div>`;
    sortedTeams.forEach(() => {
        gridHTML += `<div class="sub-header-group"><span>Singles</span><span>Dobles</span><span class="total-col">TOTAL</span></div>`;
    });

    // Filas de Datos
    Object.keys(fortnights).forEach(label => {
        gridHTML += `<div class="date-label-cell">${label.replace('Quincena del ', '')}</div>`;
        sortedTeams.forEach(team => {
            const data = team.byFortnight[label] || { singles: 0, doubles: 0, total: 0 };
            gridHTML += `<div class="data-cell-group"><span>${data.singles}</span><span>${data.doubles}</span><span class="total-col font-bold">${data.total}</span></div>`;
        });
    });

    // Filas de Totales
    gridHTML += `<div class="footer-label">Sub Total</div>`;
    sortedTeams.forEach(team => gridHTML += `<div class="footer-cell subtotal">${team.subTotal}</div>`);
    gridHTML += `<div class="footer-label">Pts. Extras</div>`;
    sortedTeams.forEach(() => gridHTML += `<div class="footer-cell">0</div>`);
    gridHTML += `<div class="footer-label total">TOTAL</div>`;
    sortedTeams.forEach(team => gridHTML += `<div class="footer-cell total">${team.totalPoints}</div>`);

    scoreboardContainer.innerHTML = `<div class="scoreboard-container" style="grid-template-columns: 100px repeat(${sortedTeams.length}, 1fr);">${gridHTML}</div>`;
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initialize);
tournamentFilter.addEventListener('change', renderScoreboard);