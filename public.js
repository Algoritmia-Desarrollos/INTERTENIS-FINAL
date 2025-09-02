import { supabase } from './src/common/supabase.js';
import { renderPublicHeader } from './public/public-header.js';
import { renderTeamScoreboard } from './src/admin/team-scoreboard.js';
import { calculatePoints } from './src/admin/calculatePoints.js'; // <-- MODIFICACIÓN: Importar la función central

// --- Elementos del DOM ---
const header = document.getElementById('header');
const tournamentFilter = document.getElementById('tournament-filter');
const rankingsContainer = document.getElementById('rankings-container');
const viewSwitcherContainer = document.getElementById('view-switcher-container');
const filterLabel = document.getElementById('filter-label');

// --- Estado Global ---
let allTournaments = [];
let currentView = 'category';

// --- Lógica de Vistas y Filtros ---

function setupViewSwitcher() {
    viewSwitcherContainer.innerHTML = `
        <div class="flex border-b border-gray-700 mb-4">
            <button id="btn-view-category" class="btn-view active">Por Categoría</button>
            <button id="btn-view-teams" class="btn-view">SuperLiga</button>
        </div>
        <style>
            .btn-view { padding: 8px 16px; border-bottom: 2px solid transparent; color: #9ca3af; font-weight: 600; cursor: pointer;}
            .btn-view.active { color: #facc15; border-bottom-color: #facc15; }
        </style>
    `;

    const btnCategory = document.getElementById('btn-view-category');
    const btnTeams = document.getElementById('btn-view-teams');

    btnCategory.addEventListener('click', () => {
        if (currentView === 'category') return;
        currentView = 'category';
        btnCategory.classList.add('active');
        btnTeams.classList.remove('active');
        populateTournamentFilter();
        rankingsContainer.innerHTML = '';
    });

    btnTeams.addEventListener('click', async () => {
        if (currentView === 'teams') return;
        currentView = 'teams';
        btnTeams.classList.add('active');
        btnCategory.classList.remove('active');
        
        await populateTournamentFilter();
        
        const teamTournaments = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
        if (teamTournaments.length > 0) {
            teamTournaments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const latestTournament = teamTournaments[0];
            
            tournamentFilter.value = latestTournament.id;
            
            renderTeamRankings();
        } else {
            rankingsContainer.innerHTML = '';
        }
    });
}

async function populateTournamentFilter() {
    if (allTournaments.length === 0) {
        const { data } = await supabase.from('tournaments').select('*, category:category_id(name)');
        allTournaments = data || [];
    }

    let tournamentsToShow = [];
    if (currentView === 'category') {
        filterLabel.textContent = 'Seleccionar Categoría';
        tournamentsToShow = allTournaments.filter(t => t.category && t.category.name !== 'Equipos');
    } else {
        filterLabel.textContent = 'Seleccionar SuperLiga';
        tournamentsToShow = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
    }
    
    tournamentsToShow.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { numeric: true });
    });

    tournamentFilter.innerHTML = '<option value="" disabled selected>Seleccione una categoría...</option>';
    tournamentsToShow.forEach(t => {
        tournamentFilter.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

// --- RANKING POR EQUIPOS ---
function renderTeamRankings(teamToHighlight = null) {
    const tournamentId = tournamentFilter.value;
    renderTeamScoreboard(rankingsContainer, tournamentId, { isAdmin: false, teamToHighlight });
}


// --- RANKING POR CATEGORÍA ---
async function renderCategoryRankings(playerToHighlight = null) {
    const tournamentId = tournamentFilter.value;
    rankingsContainer.innerHTML = '<p class="text-center p-8 text-gray-400">Calculando POSICIONES...</p>';

    if (!tournamentId) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione una categoría para ver las POSICIONES.</p></div>';
        return;
    }

    const { data: tournamentPlayersLinks } = await supabase.from('tournament_players').select('player_id').eq('tournament_id', tournamentId);
    if (!tournamentPlayersLinks || tournamentPlayersLinks.length === 0) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Este torneo no tiene jugadores inscritos.</p></div>';
        return;
    }
    const playerIds = tournamentPlayersLinks.map(link => link.player_id);

    const { data: playersInTournament } = await supabase.from('players').select('*, teams(name, image_url), categories(id, name)').in('id', playerIds);
    const { data: matchesInTournament } = await supabase.from('matches').select('*, status, sets, winner_id, bonus_loser, player1_id, player2_id, player3_id, player4_id').eq('tournament_id', tournamentId).not('winner_id', 'is', null);

    const stats = calculateCategoryStats(playersInTournament || [], matchesInTournament || []);
    const categoriesInTournament = [...new Map(playersInTournament.map(p => p && [p.category_id, p.categories]).filter(Boolean)).values()];

    rankingsContainer.innerHTML = '';
    if (categoriesInTournament.length === 0) {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">No hay jugadores con categoría en este torneo.</p></div>';
        return;
    }

    categoriesInTournament.forEach(category => {
        let categoryStats = stats.filter(s => s.categoryId === category.id);
        
        const categoryTitle = document.createElement('h3');
        categoryTitle.className = 'text-2xl font-bold text-gray-100';
        categoryTitle.textContent = `Categoría: ${category.name}`;
        rankingsContainer.appendChild(categoryTitle);

        const phraseDiv = document.createElement('div');
      
        rankingsContainer.appendChild(phraseDiv);

        const tableContainer = document.createElement('div');
        tableContainer.className = 'bg-[#222222] p-6 rounded-xl shadow-lg overflow-x-auto';
        tableContainer.innerHTML = generateCategoryRankingsHTML(categoryStats, playerToHighlight);
        rankingsContainer.appendChild(tableContainer);
    });
}

function calculateCategoryStats(players, matches) {
    const stats = players.map(player => ({
        playerId: player.id, name: player.name, categoryId: player.category_id, 
        teamName: player.teams ? player.teams.name : 'N/A',
        teamImageUrl: player.teams ? player.teams.image_url : null,
        pj: 0, pg: 0, pp: 0, sg: 0, sp: 0, gg: 0, gp: 0, bonus: 0, puntos: 0,
    }));

    matches.forEach(match => {
        const p1Stat = stats.find(s => s.playerId === match.player1_id);
        const p2Stat = stats.find(s => s.playerId === match.player2_id);
        if (!p1Stat || !p2Stat) return;
        
        p1Stat.pj++; 
        p2Stat.pj++;
        
        let p1SetsWon = 0, p2SetsWon = 0;
        let p1TotalGames = 0, p2TotalGames = 0;
        (match.sets || []).forEach(set => {
            p1TotalGames += set.p1;
            p2TotalGames += set.p2;
            if(set.p1 > set.p2) p1SetsWon++; else p2SetsWon++;
        });

        p1Stat.gg += p1TotalGames;
        p1Stat.gp += p2TotalGames;
        p2Stat.gg += p2TotalGames;
        p2Stat.gp += p1TotalGames;

        p1Stat.sg += p1SetsWon; 
        p1Stat.sp += p2SetsWon;
        p2Stat.sg += p2SetsWon; 
        p2Stat.sp += p1SetsWon;
        
        const { p1_points, p2_points } = calculatePoints(match);
        p1Stat.puntos += p1_points;
        p2Stat.puntos += p2_points;

        const winnerIsSide1 = match.winner_id === match.player1_id || match.winner_id === match.player3_id;

        if (winnerIsSide1) {
            p1Stat.pg++; 
            p2Stat.pp++;
        } else {
            p2Stat.pg++; 
            p1Stat.pp++;
        }

        if (match.status !== 'completado_wo') {
            if (winnerIsSide1) {
                if (p2TotalGames <= 3) p1Stat.bonus++;
                if (p2SetsWon === 1) p2Stat.bonus++;
            } else {
                if (p1TotalGames <= 3) p2Stat.bonus++;
                if (p1SetsWon === 1) p1Stat.bonus++;
            }
        }
    });

    stats.forEach(s => {
        s.difP = s.pg - s.pp;
        s.difS = s.sg - s.sp;
        s.difG = s.gg - s.gp;
        s.parcial = s.pj > 0 ? (s.puntos / s.pj) : 0;
        s.partidosParaPromediar = Math.max(s.pj, 8);
        s.promedio = s.pj > 0 ? (s.puntos / s.partidosParaPromediar) : 0;
    });

    stats.sort((a, b) => {
        if (a.pj === 0 && b.pj > 0) return 1;
        if (b.pj === 0 && a.pj > 0) return -1;
        if (b.promedio !== a.promedio) return b.promedio - a.promedio;
        if (b.difP !== a.difP) return b.difP - a.difP;
        if (b.difS !== a.difS) return b.difS - a.difS;
        if (b.difG !== a.difG) return b.difG - a.difG;
        return b.puntos - a.puntos;
    });

    return stats;
}

function generateCategoryRankingsHTML(stats, playerToHighlight = null) {
    let tableHTML = `
        <table class="min-w-full text-sm text-gray-200">
            <thead class="bg-black">
                <tr>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Pos.</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Jugador</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">P+</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">P-</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Dif.</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-l border-gray-700">S+</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">S-</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Dif.</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-l border-gray-700">G+</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">G-</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Dif.</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-l border-gray-700">Bon.</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-l border-gray-700">Pts.</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-l border-gray-700">Parcial</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-l border-gray-700">Prom. %</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-700">`;
    
    if (stats.length === 0) {
        tableHTML += '<tr><td colspan="15" class="text-center p-8 text-gray-400">No hay jugadores en esta categoría para mostrar.</td></tr>';
    } else {
        stats.forEach((s, index) => {
            const hasPlayed = s.pj > 0;
            const difPClass = s.difP < 0 ? 'text-red-500' : s.difP > 0 ? 'text-green-400' : 'text-gray-300';
            const difSClass = s.difS < 0 ? 'text-red-500' : s.difS > 0 ? 'text-green-400' : 'text-gray-300';
            const difGClass = s.difG < 0 ? 'text-red-500' : s.difG > 0 ? 'text-green-400' : 'text-gray-300';
            const highlightClass = s.playerId == playerToHighlight ? 'bg-yellow-900/50 border-l-4 border-yellow-500' : '';

            tableHTML += `
                <tr class="${highlightClass}">
                    <td class="px-3 py-3 font-bold text-yellow-400 text-base text-center">${index + 1}°</td>
                    <td class="px-3 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-3">
                            <img src="${s.teamImageUrl || 'https://via.placeholder.com/40'}" alt="${s.teamName}" class="h-8 w-8 rounded-full object-cover">
                            <span class="font-bold text-gray-100">${s.name}</span>
                        </div>
                    </td>
                    <td class="px-3 py-3 text-center">${hasPlayed ? s.pg : ''}</td>
                    <td class="px-3 py-3 text-center">${hasPlayed ? s.pp : ''}</td>
                    <td class="px-3 py-3 text-center font-semibold ${difPClass}">${hasPlayed ? s.difP : ''}</td>
                    <td class="px-3 py-3 text-center border-l border-gray-700">${hasPlayed ? s.sg : ''}</td>
                    <td class="px-3 py-3 text-center">${hasPlayed ? s.sp : ''}</td>
                    <td class="px-3 py-3 text-center font-semibold ${difSClass}">${hasPlayed ? s.difS : ''}</td>
                    <td class="px-3 py-3 text-center border-l border-gray-700">${hasPlayed ? s.gg : ''}</td>
                    <td class="px-3 py-3 text-center">${hasPlayed ? s.gp : ''}</td>
                    <td class="px-3 py-3 text-center font-semibold ${difGClass}">${hasPlayed ? s.difG : ''}</td>
                    <td class="px-3 py-3 text-center border-l border-gray-700">${hasPlayed ? s.bonus : ''}</td>
                    <td class="px-3 py-3 text-center border-l border-gray-700 font-bold text-lg text-yellow-300">${hasPlayed ? s.puntos : '0'}</td>
                    <td class="px-3 py-3 text-center border-l border-gray-700">${hasPlayed ? s.parcial.toFixed(2) : ''}</td>
                    <td class="px-3 py-3 text-center border-l border-gray-700 font-semibold">
                        ${s.promedio.toFixed(2)}
                        <span class="text-xs text-gray-500">/${s.partidosParaPromediar}</span>
                    </td>
                </tr>`;
        });
    }
    tableHTML += '</tbody></table>';
    return tableHTML;
}

// --- INICIALIZACIÓN Y EVENTOS ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderPublicHeader();
    setupViewSwitcher();
    await populateTournamentFilter();
    
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentIdToSelect = urlParams.get('tournamentId');
    const playerToHighlight = urlParams.get('highlightPlayerId');
    const teamToHighlight = urlParams.get('highlightTeamId');

    if (tournamentIdToSelect) {
        tournamentFilter.value = tournamentIdToSelect;
        const selectedTournament = allTournaments.find(t => t.id == tournamentIdToSelect);
        if (selectedTournament?.category?.name === 'Equipos') {
            document.getElementById('btn-view-teams').click();
            await renderTeamRankings(teamToHighlight);
        } else {
             await renderCategoryRankings(playerToHighlight);
        }
    } else {
        rankingsContainer.innerHTML = '<div class="bg-[#222222] p-8 rounded-xl"><p class="text-center text-gray-400">Seleccione una categoría para ver las posiciones.</p></div>';
    }
});

tournamentFilter.addEventListener('change', () => {
    if (currentView === 'category') {
        renderCategoryRankings();
    } else {
        renderTeamRankings();
    }
});