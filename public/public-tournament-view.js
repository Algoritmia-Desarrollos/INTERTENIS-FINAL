import { supabase } from '../src/common/supabase.js';
import { renderPublicHeader } from './public-header.js';

// --- ELEMENTOS DEL DOM ---
const headerContainer = document.getElementById('header-container');
const tournamentTitleEl = document.getElementById('tournament-title');
const tournamentCategoryEl = document.getElementById('tournament-category');
const rankingsContainer = document.getElementById('rankings-container');
const matchesContainer = document.getElementById('matches-container');

// --- LÓGICA DE RANKING (Adaptada de admin/rankings.js) ---
function calculateStats(players, matches) {
    const stats = players.map(player => ({
        playerId: player.id, name: player.name,
        teamName: player.team?.name || 'N/A', teamImageUrl: player.team?.image_url,
        pj: 0, pg: 0, pp: 0, sg: 0, sp: 0, gg: 0, gp: 0, bonus: 0, puntos: 0,
    }));
    matches.forEach(match => {
        const p1Stat = stats.find(s => s.playerId === match.player1_id);
        const p2Stat = stats.find(s => s.playerId === match.player2_id);
        if (!p1Stat || !p2Stat) return;
        p1Stat.pj++; p2Stat.pj++;
        let p1SetsWon = 0, p2SetsWon = 0;
        (match.sets || []).forEach(set => {
            p1Stat.gg += set.p1; p1Stat.gp += set.p2;
            p2Stat.gg += set.p2; p2Stat.gp += set.p1;
            if (set.p1 > set.p2) p1SetsWon++; else p2SetsWon++;
        });
        p1Stat.sg += p1SetsWon; p1Stat.sp += p2SetsWon;
        p2Stat.sg += p2SetsWon; p2Stat.sp += p1SetsWon;
        if (match.winner_id === p1Stat.playerId) {
            p1Stat.pg++; p2Stat.pp++; p1Stat.puntos += 2;
            if (match.bonus_loser) p2Stat.bonus += 1;
        } else {
            p2Stat.pg++; p1Stat.pp++; p2Stat.puntos += 2;
            if (match.bonus_loser) p1Stat.bonus += 1;
        }
    });
    stats.forEach(s => {
        s.puntos += s.bonus;
        s.difS = s.sg - s.sp;
        s.difG = s.gg - s.gp;
    });
    stats.sort((a, b) => b.puntos - a.puntos || b.difS - a.difS || b.difG - a.difG || a.pp - b.pp);
    return stats;
}

function generateRankingsHTML(stats) {
    let tableHTML = `<table class="min-w-full text-sm text-gray-200">
        <thead class="bg-black"><tr>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Pos.</th>
            <th class="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Jugador</th>
            <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">PJ</th>
            <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">PG</th>
            <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">PP</th>
            <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase">Pts</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-700">`;
    if (stats.length === 0) {
        tableHTML += '<tr><td colspan="6" class="text-center p-8 text-gray-400">No hay datos de POSICIONES para mostrar.</td></tr>';
    } else {
        stats.forEach((s, index) => {
            tableHTML += `<tr>
                <td class="px-3 py-3 font-bold text-yellow-400 text-base">${index + 1}°</td>
                <td class="px-3 py-3 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <img src="${s.teamImageUrl || 'https://via.placeholder.com/40'}" alt="${s.teamName}" class="h-8 w-8 rounded-full object-cover">
                        <span class="font-bold text-gray-100">${s.name}</span>
                    </div>
                </td>
                <td class="px-3 py-3 text-center">${s.pj}</td>
                <td class="px-3 py-3 text-center text-green-400">${s.pg}</td>
                <td class="px-3 py-3 text-center text-red-400">${s.pp}</td>
                <td class="px-3 py-3 text-center font-bold text-lg text-yellow-300">${s.puntos}</td>
            </tr>`;
        });
    }
    tableHTML += '</tbody></table>';
    return tableHTML;
}

function isColorLight(hex) {
    if (!hex) return false;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
}

function renderMatches(matchesToRender) {
    const container = document.createElement('div');
    container.className = 'bg-[#222222] p-6 rounded-xl shadow-lg overflow-x-auto';
    
    if (matchesToRender.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-8">No hay partidos programados en este torneo.</p>';
        matchesContainer.appendChild(container);
        return;
    }

    const groupedByDate = matchesToRender.reduce((acc, match) => {
        const date = match.match_date || 'Sin fecha';
        if (!acc[date]) acc[date] = [];
        acc[date].push(match);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
    let tableHTML = '';

    for (const [dateIdx, date] of sortedDates.entries()) {
        if (dateIdx > 0) tableHTML += `<tr><td colspan="9" style="height: 18px; background: transparent; border: none;"></td></tr>`;
        
        const matchesInDate = groupedByDate[date];
        const dateObj = new Date(date + 'T00:00:00');
        const formattedDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj);

        tableHTML += `
            <tr>
                <td colspan="9" style="background-color: #111; color: #fff; font-weight: 700; text-align: center; padding: 10px 0; font-size: 14pt;">
                    ${formattedDate}
                </td>
            </tr>`;

        for (const match of matchesInDate) {
            const p1_class = match.winner_id === match.player1_id ? 'winner' : '';
            const p2_class = match.winner_id === match.player2_id ? 'winner' : '';
            const setsDisplay = (match.sets || []).map(s => `${s.p1}/${s.p2}`).join(' ');

            tableHTML += `
                <tr class="data-row">
                    <td style="background:#000;color:#fff; text-align: right; padding-right: 1rem;" class="player-name ${p1_class}">${match.player1.name}</td>
                    <td style="background:${match.player1.team?.color || '#3a3838'};">
                        ${match.winner_id ? '' : `<img src="${match.player1.team?.image_url || ''}" style="height:20px; object-fit:contain; margin:auto;" />`}
                    </td>
                    <td class="font-mono" style="background:#000;color:#fff; font-weight: bold;">${setsDisplay}</td>
                    <td style="background:${match.player2.team?.color || '#3a3838'};">
                        ${match.winner_id ? '' : `<img src="${match.player2.team?.image_url || ''}" style="height:20px; object-fit:contain; margin:auto;" />`}
                    </td>
                    <td style="background:#000;color:#fff; text-align: left; padding-left: 1rem;" class="player-name ${p2_class}">${match.player2.name}</td>
                </tr>`;
        }
    }
    
    container.innerHTML = `
        <style>
            .matches-public-style { min-width: 600px; width: 100%; border-collapse: separate; border-spacing: 0; }
            .matches-public-style td { padding: 8px 6px; font-size: 11pt; border-bottom: 1px solid #4a4a4a; text-align: center; vertical-align: middle; white-space: nowrap; }
            .matches-public-style .winner { font-weight: 700 !important; color: #f4ec05 !important; }
        </style>
        <table class="matches-public-style">
            <colgroup><col style="width: 40%"><col style="width: 5%"><col style="width: 10%"><col style="width: 5%"><col style="width: 40%"></colgroup>
            <tbody>${tableHTML}</tbody>
        </table>
    `;
    matchesContainer.appendChild(container);
}


// --- CARGA DE DATOS PRINCIPAL ---
async function loadTournamentData() {
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('id');

    if (!tournamentId) {
        tournamentTitleEl.textContent = "Torneo no encontrado";
        return;
    }

    const [
        { data: tournament, error: tError },
        { data: tournamentPlayersLinks, error: pError },
        { data: matchesInTournament, error: mError }
    ] = await Promise.all([
        supabase.from('tournaments').select(`*, category:category_id(name)`).eq('id', tournamentId).single(),
        supabase.from('tournament_players').select(`player:players(*, team:team_id(name, image_url))`).eq('tournament_id', tournamentId),
        supabase.from('matches').select(`*, category:category_id(name, color), player1:player1_id(name, team:team_id(image_url, color)), player2:player2_id(name, team:team_id(image_url, color)), winner:winner_id(name)`).eq('tournament_id', tournamentId).order('match_date', { ascending: false })
    ]);

    if (tError) {
        tournamentTitleEl.textContent = "Error al cargar el torneo";
        return;
    }
    
    tournamentTitleEl.textContent = tournament.name;
    tournamentCategoryEl.textContent = tournament.category.name;

    const playersInTournament = tournamentPlayersLinks.map(link => link.player);
    const playedMatches = matchesInTournament.filter(m => m.winner_id);

    // Renderizar Posiciones
    const stats = calculateStats(playersInTournament, playedMatches);
    rankingsContainer.innerHTML = `
        <h2 class="text-3xl font-bold text-gray-100">POSICIONES</h2>
        <div class="bg-[#222222] p-6 rounded-xl shadow-lg overflow-x-auto">
            ${generateRankingsHTML(stats)}
        </div>
    `;

    // Renderizar Programación
    matchesContainer.innerHTML = `<h2 class="text-3xl font-bold text-gray-100 mt-8">PROGRAMACION</h2>`;
    renderMatches(matchesInTournament);
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    headerContainer.innerHTML = renderPublicHeader();
    loadTournamentData();
});