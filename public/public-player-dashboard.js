import { supabase } from '../src/common/supabase.js';
import { renderPublicHeader } from './public-header.js';
import { calculatePoints } from '../src/admin/calculatePoints.js';

const headerContainer = document.getElementById('header-container');
const container = document.getElementById('player-dashboard-container');

async function loadPlayerData() {
    container.innerHTML = '<p class="text-center p-8 text-gray-400">Cargando dashboard del jugador...</p>';
    const urlParams = new URLSearchParams(window.location.search);
    const playerId = urlParams.get('id');

    if (!playerId) {
        container.innerHTML = '<p class="text-red-500 text-center p-8">No se especificó un ID de jugador.</p>';
        return;
    }

    const { data: player, error: playerError } = await supabase.from('players').select(`*, category:category_id(name), team:team_id(id, name, image_url)`).eq('id', playerId).single();
    
    if (playerError || !player) {
        container.innerHTML = '<p class="text-red-500 text-center p-8">No se pudo encontrar al jugador.</p>';
        return;
    }

    const [{ data: matches }, { data: enrolledTournamentsData }] = await Promise.all([
        supabase.from('matches').select(`*, tournament:tournament_id(name), category:category_id(name, color), player1:player1_id(id, name, team:team_id(color, image_url)), player2:player2_id(id, name, team:team_id(color, image_url)), player3:player3_id(id, name), player4:player4_id(id, name), winner:winner_id(id, name)`)
            .or(`player1_id.eq.${playerId},player2_id.eq.${playerId},player3_id.eq.${playerId},player4_id.eq.${playerId}`)
            .order('match_date', { ascending: true }),
        supabase.from('tournament_players').select(`tournament:tournaments(*, category:category_id(name))`).eq('player_id', playerId)
    ]);
    
    const allMatches = matches || [];
    const pendingMatches = allMatches.filter(m => !m.winner_id);
    const matchHistory = allMatches.filter(m => m.winner_id).reverse();
    const stats = calculatePlayerStats(player.id, matchHistory);

    const enrolledTournaments = enrolledTournamentsData.map(t => t.tournament);
    const individualTournament = enrolledTournaments.find(t => t.category.name !== 'Equipos');
    const teamTournament = enrolledTournaments.find(t => t.category.name === 'Equipos');
    
    renderDashboard(player, stats, pendingMatches, matchHistory, individualTournament, teamTournament);
}

function calculatePlayerStats(playerId, playedMatches) {
    const stats = { pj: 0, pg: 0, pp: 0 };
    playedMatches.forEach(m => {
        stats.pj++;
        const isPlayerInSide1 = m.player1_id === playerId || m.player3_id === playerId;
        const winnerIsSide1 = m.winner_id === m.player1_id || m.winner_id === m.player3_id;
        if (isPlayerInSide1 === winnerIsSide1) stats.pg++;
        else stats.pp++;
    });
    return stats;
}

function renderDashboard(player, stats, pendingMatches, matchHistory, individualTournament, teamTournament) {
    const efectividad = stats.pj > 0 ? ((stats.pg / stats.pj) * 100).toFixed(0) : 0;
    
    // --- INICIO DE LA MODIFICACIÓN ---
    // Se añade 'flex-wrap' para que los botones se ajusten si no hay espacio
    // y se quitan las clases de ancho para que se ajusten a su contenido.
    let buttonsHTML = '<div class="flex flex-row flex-wrap justify-center sm:justify-end gap-2 mt-4 sm:mt-0">';
    if (individualTournament) {
        buttonsHTML += `<a href="/index.html?tournamentId=${individualTournament.id}&highlightPlayerId=${player.id}" class="btn btn-secondary !py-2 !px-4 text-sm">Ver Ranking Individual</a>`;
    }
    if (teamTournament && player.team) {
        buttonsHTML += `<a href="/index.html?tournamentId=${teamTournament.id}&highlightTeamId=${player.team.id}" class="btn btn-secondary !py-2 !px-4 text-sm">Ver Ranking de Equipo</a>`;
    }
    buttonsHTML += '</div>';
    // --- FIN DE LA MODIFICACIÓN ---

    container.innerHTML = `
        <div class="bg-[#222222] p-4 sm:p-6 rounded-xl shadow-lg">
            <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <img src="${player.team?.image_url || 'https://via.placeholder.com/80'}" alt="Logo" class="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border-4 border-gray-700 flex-shrink-0">
                <div class="flex-grow w-full text-center sm:text-left">
                    <h1 class="text-3xl sm:text-4xl font-bold text-gray-100">${player.name}</h1>
                    <p class="text-md text-gray-400">${player.category?.name || 'Sin Categoría'} | ${player.team?.name || 'Sin Equipo'}</p>
                </div>
                ${buttonsHTML}
            </div>
            <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold">${stats.pj}</p><p class="text-xs text-gray-400">Jugados</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold text-green-400">${stats.pg}</p><p class="text-xs text-gray-400">Victorias</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold text-red-400">${stats.pp}</p><p class="text-xs text-gray-400">Derrotas</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p class="text-2xl font-bold text-yellow-400">${efectividad}%</p><p class="text-xs text-gray-400">Efectividad</p></div>
            </div>
        </div>
        <div>
            <h2 class="text-2xl font-bold text-gray-100 mb-4">Partidos Pendientes</h2>
            <div id="pending-matches-container"></div>
        </div>
        <div>
            <h2 class="text-2xl font-bold text-gray-100 mb-4">Historial de Partidos</h2>
            <div id="history-matches-container"></div>
        </div>
    `;

    renderMatchesTable(pendingMatches, document.getElementById('pending-matches-container'), 'No hay partidos pendientes.');
    renderMatchesTable(matchHistory, document.getElementById('history-matches-container'), 'No hay partidos en el historial.');
}

function renderMatchesTable(matchesToRender, containerElement, emptyMessage) {
    if (!matchesToRender || matchesToRender.length === 0) {
        containerElement.innerHTML = `<div class="bg-[#222222] p-6 rounded-xl"><p class="text-center text-gray-500 py-4">${emptyMessage}</p></div>`;
        return;
    }
    const groupedByDate = matchesToRender.reduce((acc, match) => {
        const date = match.match_date || 'Sin fecha';
        if (!acc[date]) acc[date] = [];
        acc[date].push(match);
        return acc;
    }, {});
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a) - new Date(b));
    let tableHTML = '';
    for (const date of sortedDates) {
        const groupedBySede = groupedByDate[date].reduce((acc, match) => {
            const sede = (match.location ? match.location.split(' - ')[0] : 'Sede no definida').trim();
            if(!acc[sede]) acc[sede] = [];
            acc[sede].push(match);
            return acc;
        }, {});
        for(const sede in groupedBySede) {
            const matchesInSede = groupedBySede[sede];
            const dateObj = new Date(date + 'T00:00:00');
            const formattedDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj);
            const headerBgColor = sede.toLowerCase() === 'centro' ? '#222222' : '#fdc100';
            const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';
            
            tableHTML += `
                <tr>
                    <td colspan="2" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0; font-size: 15pt; border-right: 1px solid #000;">${sede.toUpperCase()}</td>
                    <td colspan="6" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0; font-size: 15pt;">${formattedDate}</td>
                </tr>`;

            for (const match of matchesInSede) {
                const { p1_points, p2_points } = calculatePoints(match);
                const isDoubles = match.player3 && match.player4;
                const team1_winner = isDoubles ? (match.winner_id === match.player1.id || match.winner_id === match.player3.id) : (match.winner_id === match.player1.id);
                
                const team1_class = team1_winner ? 'winner' : '';
                const team2_class = !team1_winner && match.winner_id ? 'winner' : '';

                let team1_names = match.player1.name;
                if (isDoubles && match.player3) team1_names += ` / ${match.player3.name}`;

                let team2_names = match.player2.name;
                if (isDoubles && match.player4) team2_names += ` / ${match.player4.name}`;
                
                let hora = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                const setsDisplay = (match.sets || []).map(s => `${s.p1}/${s.p2}`).join(' ');
                
                const p1TeamColor = match.player1.team?.color;
                const p2TeamColor = match.player2.team?.color;

                let cancha = match.location ? (match.location.split(' - ')[1] || 'N/A') : 'N/A';
                const matchNum = cancha.match(/\d+/);
                if (matchNum) cancha = matchNum[0];

                const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
                const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';
                
                const categoryDisplay = match.category?.name || '';
                
                const played = !!match.winner_id;
                let team1PointsDisplay = '';
                let team2PointsDisplay = '';

                if (played) {
                    team1PointsDisplay = p1_points ?? '';
                    if (team1PointsDisplay === 0) team1PointsDisplay = '0';
                    team2PointsDisplay = p2_points ?? '';
                    if (team2PointsDisplay === 0) team2PointsDisplay = '0';
                } else {
                    if (match.player1.team?.image_url) {
                        team1PointsDisplay = `<img src="${match.player1.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    }
                    if (match.player2.team?.image_url) {
                        team2PointsDisplay = `<img src="${match.player2.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    }
                }

                tableHTML += `
                    <tr class="data-row">
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold; border-left: 1px solid #4a4a4a;">${cancha}</td>
                        <td style="background:#000;color:#fff;">${hora}</td>
                        <td class="player-name player-name-right ${team1_class}" style='background:#000; font-size:${isDoubles ? '9pt' : '11pt'};'>${team1_names}</td>
                        <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};'>${team1PointsDisplay}</td>
                        <td class="font-mono" style="background:#000;">${setsDisplay}</td>
                        <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};'>${team2PointsDisplay}</td>
                        <td class="player-name player-name-left ${team2_class}" style='background:#000; font-size:${isDoubles ? '9pt' : '11pt'};'>${team2_names}</td>
                        <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${categoryDisplay}</td>
                    </tr>`;
            }
        }
    }
    containerElement.innerHTML = `
        <div class="bg-[#18191b] p-2 sm:p-4 rounded-xl shadow-lg overflow-x-auto">
            <table class="matches-report-style">
                <colgroup><col style="width: 5%"><col style="width: 7%"><col style="width: 25%"><col style="width: 5%"><col style="width: 16%"><col style="width: 5%"><col style="width: 25%"><col style="width: 12%"></colgroup>
                <tbody>${tableHTML}</tbody>
            </table>
        </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    headerContainer.innerHTML = renderPublicHeader();
    loadPlayerData();
});