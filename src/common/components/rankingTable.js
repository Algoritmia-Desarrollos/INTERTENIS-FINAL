// Ruta NUEVA: src/common/components/rankingTable.js
// Este módulo centraliza la lógica de cálculo y renderizado de las tablas de ranking
// para las vistas públicas (index.html) y del portal (portal/ranking.html).

import { calculatePoints } from '../../admin/calculatePoints.js';

/**
 * Helper para determinar si un color hexadecimal es claro u oscuro.
 * Usado para decidir el color del texto de las etiquetas (tags).
 */
function isColorLight(hex) {
    if (!hex || typeof hex !== 'string') return false;
    let c = hex.startsWith('#') ? hex.slice(1) : hex;
    if (c.length === 3) c = c.split('').map(char => char + char).join('');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.5;
};

/**
 * Calcula las estadísticas detalladas para un conjunto de jugadores y partidos.
 * (Esta función es idéntica a la de public.js y portal/ranking.js)
 * @export
 */
export function calculateCategoryStats(players, matches) {
    const validPlayers = players.filter(p => p && p.id);
    
    const stats = validPlayers.map(player => ({
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

/**
 * Genera el HTML para la tabla de ranking pública (sin botones de admin).
 * (Esta función es idéntica a la de public.js y portal/ranking.js)
 * @export
 */
export function generateCategoryRankingsHTML(category, stats, playerToHighlight = null, metadataMap) {
    
    const renderTag = (meta) => {
        if (meta && meta.special_tag) {
            const tagColor = meta.tag_color || '#374151';
            const textColor = isColorLight(tagColor) ? '#000' : '#fff';
            return `<span class="special-tag" style="background-color: ${tagColor}; color: ${textColor};">${meta.special_tag}</span>`;
        }
        return '';
    };
    
    let tableHTML = `
        <table class="rankings-table min-w-full font-bold text-sm text-gray-200" style="border-spacing: 0; border-collapse: separate;">
            <thead class="bg-black]">
                <tr>
                    <th colspan="2" class="category-header py-2 px-4 text-3xl font-bold text-white text-center" style=" border-width: 1px 0 3px 1px; background: #757170; border-color: black;">${category.name}</th>
                    <th class="col-p-plus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 2px; background: #757170; border-color: black;">P+</th>
                    <th class="col-p-minus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 0px; background: #757170; border-color: black;">P-</th>
                    <th class="col-p-diff px-1 py-3 text-center text-[14px] font-light text-white tracking-wider" style="border-width: 1px 2px 3px 0px; background: #757170; border-color: black;">Dif.</th>
                    <th class="col-s-plus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 1px; background: #757170; border-color: black;">S+</th>
                    <th class="col-s-minus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 0px; background: #757170; border-color: black;">S-</th>
                    <th class="col-s-diff px-1 py-3 text-center text-[14px] font-light text-white tracking-wider" style="border-width: 1px 2px 3px 0px; background: #757170; border-color: black;">Dif.</th>
                    <th class="col-g-plus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 1px; background: #757170; border-color: black;">G+</th>
                    <th class="col-g-minus px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 0 3px 0px; background: #757170; border-color: black;">G-</th>
                    <th class="col-g-diff px-1 py-3 text-center text-[14px] font-light text-white tracking-wider" style="border-width: 1px 2px 3px 0px; background: #757170; border-color: black;">Dif.</th>
                    <th class="col-bonus px-1 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Bon.</th>
                    <th class="col-points px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Pts.</th>
                    <th class="col-partial px-1 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Parcial</th>
                    <th class="col-prom px-3 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 2px 3px 1px; background: #757170; border-color: black;">Prom. %</th>
                    <th class="col-tag px-0 py-3 text-center text-[18px] font-bold text-white tracking-wider" style="border-width: 1px 1px 3px 1px; background: black; border-color: black; width: 50px;"></th>
                    </tr>
            </thead>
            <tbody>`;
    
    if (stats.length === 0) {
        tableHTML += '<tr><td colspan="16" class="text-center font-bold p-8 text-gray-400">No hay jugadores en esta categoría para mostrar.</td></tr>';
    } else {
        stats.forEach((s, index) => {
            if (!s.playerId) {
                return; 
            }
            
            const hasPlayed = s.pj > 0;
            const difPClass = 'text-[#e8b83a]';
            const difSClass = 'text-[#e8b83a]';
            const difGClass = 'text-[#e8b83a]';
            const highlightClass = s.playerId == playerToHighlight ? 'bg-yellow-900/50' : '';

            const rank_position = index + 1;
            const meta = metadataMap.get(rank_position) || { is_divider_after: false, special_tag: null, tag_color: null };
            
            const tagHTML = renderTag(meta);

            tableHTML += `
                <tr class="${highlightClass}">
                    <td class="col-rank px-2 py-2 text-xl font-bold text-white text-center" style="border-width: 0 0 3px 1px; background-color: #757170; border-color: black; vertical-align: middle;">${rank_position}°</td>
                    <td class="col-player bg-black px-0 py-0 whitespace-nowrap" style="border-width: 0 0 2px 1px; border-color: #4b556352; vertical-align: middle;">
                        <div class="flex items-center bg-black font-light player-cell-content">
                            <span class="flex-grow bg-black font-bold text-gray-100 player-name-container text-center">
                                ${s.name}
                                </span>
                            <img src="${s.teamImageUrl || 'https://via.placeholder.com/40'}" alt="${s.teamName}" class="h-10 w-10 object-cover bg-black team-logo ml-4">
                        </div>
                    </td>
                    <td class="col-p-plus px-2 py-2 text-center text-2xl font-bold bg-black" style="border-width: 0px 0 2px 1px;  border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.pg : ''}</td>
                    <td class="col-p-minus px-2 py-2 text-center text-2xl font-bold bg-black" style="border-width: 0 0 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.pp : ''}</td>
                    <td class="col-p-diff px-2 py-2 text-center bg-black font-bold ${difPClass}" style="border-width: 0 1px 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.difP : ''}</td>
                    <td class="col-s-plus px-2 py-2 text-center text-2xl font-bold bg-black" style="border-width: 0 0 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.sg : ''}</td>
                    <td class="col-s-minus px-2 py-2 text-center text-2xl bg-black font-bold" style="border-width: 0 0 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.sp : ''}</td>
                    <td class="col-s-diff px-2 py-2 text-center bg-black font-bold ${difSClass}" style="border-width: 0 1px 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.difS : ''}</td>
                    <td class="col-g-plus px-2 py-2 text-center text-2xl bg-black font-bold" style="border-width: 0 0 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.gg : ''}</td>
                    <td class="col-g-minus px-2 py-2 text-center text-2xl bg-black font-bold" style="border-width: 0 0 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.gp : ''}</td>
                    <td class="col-g-diff px-2 py-2 text-center bg-black font-bold ${difGClass}" style="border-width: 0 1px 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.difG : ''}</td>
                    <td class="col-bonus px-1 py-2 text-center bg-black font-bold text-red-500" style="border-width: 0 1px 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.bonus : ''}</td>
                    <td class="col-points px-2 py-2 text-center text-2xl bg-black font-bold text-lg text-[#e8b83a]" style="border-width: 0 1px 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.puntos : '0'}</td>
                    <td class="col-partial px-1 py-2 text-center bg-black font-bold" style="border-width: 0 1px 2px 1px; border-color: #4b556352; vertical-align: middle;">${hasPlayed ? s.parcial.toFixed(2) : ''}</td>
                    <td class="col-prom px-2 py-2 text-center text-2xl bg-black font-bold text-[yellow]" style="border-width: 0 1px 1px 1px; border-color: #4b556352; vertical-align: middle;">
                        ${s.promedio.toFixed(2)}
                        <span class="text-xs text-gray-500">/${s.partidosParaPromediar}</span>
                    </td>
                    <td class="col-tag bg-black px-1 py-2 text-center" style="border-width: 0 1px 1px 1px; border-color: #4b556352; vertical-align: middle;">
                        ${tagHTML}
                    </td>
                    </tr>`;
            
                if (meta.is_divider_after) {
                    tableHTML += `<tr class="ranking-divider-row"><td colspan="16"></td></tr>`;
                }
            });
        }
        tableHTML += '</tbody></table>';
        return tableHTML;
    }