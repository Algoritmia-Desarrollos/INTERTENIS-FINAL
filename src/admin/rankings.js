import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const tournamentFilter = document.getElementById('tournament-filter');
const rankingsContainer = document.getElementById('rankings-container');

// --- Lógica Principal ---

async function populateTournamentFilter() {
    tournamentFilter.innerHTML = '<option value="" disabled selected>Seleccione un torneo...</option>';
    const { data: tournaments } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    if (tournaments) {
        tournaments.forEach(t => {
            tournamentFilter.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });
    }
}

async function renderRankings() {
    const tournamentId = tournamentFilter.value;
    rankingsContainer.innerHTML = '<p class="text-center p-8">Calculando rankings...</p>';

    if (!tournamentId) {
        rankingsContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Seleccione un torneo para ver los rankings.</p>';
        return;
    }

    const { data: tournamentPlayersLinks } = await supabase.from('tournament_players').select('player_id').eq('tournament_id', tournamentId);
    if (!tournamentPlayersLinks || tournamentPlayersLinks.length === 0) {
        rankingsContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Este torneo no tiene jugadores inscritos.</p>';
        return;
    }
    const playerIds = tournamentPlayersLinks.map(link => link.player_id);

    const { data: playersInTournament } = await supabase.from('players').select('*, teams(name, image_url), categories(id, name)').in('id', playerIds);
    const { data: matchesInTournament } = await supabase.from('matches').select('*').eq('tournament_id', tournamentId).not('winner_id', 'is', null);

    const stats = calculateStats(playersInTournament || [], matchesInTournament || []);
    const categoriesInTournament = [...new Map(playersInTournament.map(p => p && [p.category_id, p.categories]).filter(Boolean)).values()];

    rankingsContainer.innerHTML = '';
    if (categoriesInTournament.length === 0) {
        rankingsContainer.innerHTML = '<p class="text-center text-gray-500 p-8">No hay jugadores con categoría en este torneo.</p>';
        return;
    }

    categoriesInTournament.forEach(category => {
        let categoryStats = stats.filter(s => s.categoryId === category.id);
        
        const categoryTitle = document.createElement('h3');
        categoryTitle.className = 'text-2xl font-bold text-gray-800';
        categoryTitle.textContent = `Categoría: ${category.name}`;
        rankingsContainer.appendChild(categoryTitle);

        const tableContainer = document.createElement('div');
        tableContainer.className = 'bg-white rounded-xl shadow-lg overflow-x-auto';
        tableContainer.innerHTML = generateRankingsHTML(categoryStats);
        rankingsContainer.appendChild(tableContainer);
    });
}

function calculateStats(players, matches) {
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
        
        p1Stat.pj++; p2Stat.pj++;
        
        let p1SetsWon = 0, p2SetsWon = 0;
        (match.sets || []).forEach(set => {
            p1Stat.gg += set.p1; p1Stat.gp += set.p2;
            p2Stat.gg += set.p2; p2Stat.gp += set.p1;
            if(set.p1 > set.p2) p1SetsWon++; else p2SetsWon++;
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

function generateRankingsHTML(stats) {
    const headers = ['Pos.', 'Jugador', 'P+', 'P-', 'Dif.', 'S+', 'S-', 'Dif.', 'G+', 'G-', 'Dif.', 'Bon.', 'Pts.', 'Parcial', 'Prom. %'];
    
    let tableHTML = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    ${headers.map((h, i) => `<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${[5, 8, 11, 12, 13].includes(i) ? 'border-l' : ''}">${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">`;
    
    if (stats.length === 0) {
        tableHTML += '<tr><td colspan="15" class="text-center p-8 text-gray-500">No hay jugadores en esta categoría para mostrar.</td></tr>';
    } else {
        stats.forEach((s, index) => {
            const hasPlayed = s.pj > 0;
            const difPClass = s.difP < 0 ? 'text-red-600' : '';
            const difSClass = s.difS < 0 ? 'text-red-600' : '';
            const difGClass = s.difG < 0 ? 'text-red-600' : '';

            tableHTML += `
                <tr>
                    <td class="px-3 py-4 font-bold">${index + 1}°</td>
                    <td class="px-3 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-3">
                            <img src="${s.teamImageUrl || 'https://via.placeholder.com/40'}" alt="${s.teamName}" class="h-8 w-8 rounded-full object-cover">
                            <span class="font-medium text-gray-900">${s.name}</span>
                        </div>
                    </td>
                    <td class="px-3 py-4 text-center">${hasPlayed ? s.pg : ''}</td>
                    <td class="px-3 py-4 text-center">${hasPlayed ? s.pp : ''}</td>
                    <td class="px-3 py-4 text-center font-semibold ${difPClass}">${hasPlayed ? s.difP : ''}</td>
                    <td class="px-3 py-4 text-center border-l">${hasPlayed ? s.sg : ''}</td>
                    <td class="px-3 py-4 text-center">${hasPlayed ? s.sp : ''}</td>
                    <td class="px-3 py-4 text-center font-semibold ${difSClass}">${hasPlayed ? s.difS : ''}</td>
                    <td class="px-3 py-4 text-center border-l">${hasPlayed ? s.gg : ''}</td>
                    <td class="px-3 py-4 text-center">${hasPlayed ? s.gp : ''}</td>
                    <td class="px-3 py-4 text-center font-semibold ${difGClass}">${hasPlayed ? s.difG : ''}</td>
                    <td class="px-3 py-4 text-center border-l">${hasPlayed ? s.bonus : ''}</td>
                    <td class="px-3 py-4 text-center border-l font-bold text-base text-teal-600">${hasPlayed ? s.puntos : '0'}</td>
                    <td class="px-3 py-4 text-center border-l">${hasPlayed ? s.parcial.toFixed(2) : ''}</td>
                    <td class="px-3 py-4 text-center border-l font-semibold">
                        ${s.promedio.toFixed(2)}
                        <span class="text-xs text-gray-400">/${s.partidosParaPromediar}</span>
                    </td>
                </tr>`;
        });
    }
    tableHTML += '</tbody></table>';
    return tableHTML;
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await populateTournamentFilter();
    
    // Leer el ID y seleccionar el torneo en el dropdown si viene en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentIdToSelect = urlParams.get('tournamentId');

    if (tournamentIdToSelect) {
        tournamentFilter.value = tournamentIdToSelect;
        await renderRankings(); // Cargar el ranking para ese torneo
    } else {
        rankingsContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Seleccione un torneo para ver los rankings.</p>';
    }
});

tournamentFilter.addEventListener('change', () => renderRankings());