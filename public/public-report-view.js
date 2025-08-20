import { supabase } from '../src/common/supabase.js';
import { renderPublicHeader } from './public-header.js';
import { calculatePoints } from '../src/admin/calculatePoints.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENTOS DEL DOM ---
    const headerContainer = document.getElementById('header-container');
    const reportTitleEl = document.getElementById('report-title');
    const reportContainer = document.getElementById('report-container');

    // --- FUNCIONES AUXILIARES ---
    function isColorLight(hex) {
        if (!hex) return false;
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const r = parseInt(c.substr(0, 2), 16),
              g = parseInt(c.substr(2, 2), 16),
              b = parseInt(c.substr(4, 2), 16);
        return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
    }

    // Procesa los datos crudos de Supabase al formato que necesita el reporte.
    function processMatchesForReport(matches) {
        if (!matches) return [];
        return matches.map(match => {
            const { p1_points, p2_points } = calculatePoints(match);
            return {
                id: match.id,
                date: match.match_date ? match.match_date.split('T')[0] : '',
                time: match.match_time || '',
                location: match.location || '',
                player1: {
                    name: match.player1?.name || 'N/A',
                    isWinner: match.winner_id === match.player1_id,
                    teamColor: match.player1?.team?.color,
                    teamImage: match.player1?.team?.image_url,
                    points: p1_points
                },
                player2: {
                    name: match.player2?.name || 'N/A',
                    isWinner: match.winner_id === match.player2_id,
                    teamColor: match.player2?.team?.color,
                    teamImage: match.player2?.team?.image_url,
                    points: p2_points
                },
                sets: match.sets || [],
                category: match.category?.name || '',
                category_color: match.category?.color || '#a0a0a0',
            };
        });
    }

    // Renderiza el reporte con el estilo de matches.js
    async function renderReport(reportData) {
        if (!reportData || reportData.length === 0) {
            reportContainer.innerHTML = '<p class="text-center text-gray-400 py-10">Este reporte no contiene partidos.</p>';
            return;
        }

        const groupedByDate = reportData.reduce((acc, match) => {
            const date = match.date || 'Sin fecha';
            if (!acc[date]) acc[date] = [];
            acc[date].push(match);
            return acc;
        }, {});

        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a) - new Date(b));
        
        let tableBodyHTML = '';

        for (const [dateIdx, date] of sortedDates.entries()) {
            if (dateIdx > 0) tableBodyHTML += `<tr><td colspan="8" style="height: 12px; background: #000; border: none;"></td></tr>`;
            
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

                // Espaciado entre tablas de sede
                if (Object.keys(groupedBySede).indexOf(sede) > 0) {
                    tableBodyHTML += `<tr><td colspan="8" style="height: 22px; background: #000; border: none;"></td></tr>`;
                }

                tableBodyHTML += `
                    <tr>
                        <td colspan="2" class="sede-fecha" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 8px 0; border-right: none;">
                            ${sede.toUpperCase()}
                        </td>
                        <td colspan="6" class="sede-fecha" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 8px 0; border-left: none;">
                            ${formattedDate}
                        </td>
                    </tr>`;

                for (const match of matchesInSede) {
                    const p1_class = match.player1.isWinner ? 'winner' : '';
                    const p2_class = match.player2.isWinner ? 'winner' : '';
                    let hora = match.time ? match.time.substring(0, 5) : 'HH:MM';
                    const setsDisplay = (match.sets || []).map(s => `${s.p1}/${s.p2}`).join(' ');
                    const p1TeamColor = match.player1.teamColor;
                    const p2TeamColor = match.player2.teamColor;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                    const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                    const played = !!(match.sets && match.sets.length > 0);
                    let p1NameStyle = played && !p1_class ? 'color:#888;' : '';
                    let p2NameStyle = played && !p2_class ? 'color:#888;' : '';
                    let p1PointsDisplay = '';
                    let p2PointsDisplay = '';

                    if (played) {
                        p1PointsDisplay = (typeof match.player1.points !== 'undefined' && match.player1.points !== null) ? match.player1.points : '';
                        p2PointsDisplay = (typeof match.player2.points !== 'undefined' && match.player2.points !== null) ? match.player2.points : '';
                    } else {
                        if (match.player1.teamImage) p1PointsDisplay = `<img src="${match.player1.teamImage}" alt="" style="height: 18px; object-fit: contain; margin: auto; display: block;">`;
                        if (match.player2.teamImage) p2PointsDisplay = `<img src="${match.player2.teamImage}" alt="" style="height: 18px; object-fit: contain; margin: auto; display: block;">`;
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

                    tableBodyHTML += `
                        <tr class="data-row">
                            <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold; font-size: 8pt;">${cancha}</td>
                            <td style="background:#000;color:#fff; font-size: 8pt;">${hora}</td>
                            <td class="player-name player-name-right ${p1_class}" style='background:#000;color:#fff;${p1NameStyle};'>${match.player1.name}</td>
                            <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${p1PointsDisplay}</td>
                            <td class="font-mono" style="background:#000;color:#fff; font-size: 9pt;">${setsDisplay}</td>
                            <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${p2PointsDisplay}</td>
                            <td class="player-name player-name-left ${p2_class}" style='background:#000;color:#fff;${p2NameStyle};'>${match.player2.name}</td>
                            <td class="cat-col" style="background:#000;color:${match.category_color || '#b45309'};">${match.category || 'N/A'}</td>
                        </tr>`;
                }
            }
        }
        
        reportContainer.innerHTML = `
        <div class="bg-[#18191b] p-4 rounded-xl shadow-lg overflow-x-auto">
            <style>
                /* Estilos por defecto (Móvil) */
                .responsive-table .player-name { font-size: 9pt; }
                .responsive-table .sede-fecha { font-size: 11pt; }
                .responsive-table th:nth-child(1), .responsive-table td:nth-child(1) { width: 6%; }  /* Cancha más chica */
                .responsive-table th:nth-child(2), .responsive-table td:nth-child(2) { width: 10%; }
                .responsive-table th:nth-child(3), .responsive-table td:nth-child(3) { width: 23%; } /* Jugador 1 */
                .responsive-table th:nth-child(4), .responsive-table td:nth-child(4) { width: 7%; }
                .responsive-table th:nth-child(5), .responsive-table td:nth-child(5) { width: 14%; }
                .responsive-table th:nth-child(6), .responsive-table td:nth-child(6) { width: 7%; }
                .responsive-table th:nth-child(7), .responsive-table td:nth-child(7) { width: 23%; } /* Jugador 2 */
                .responsive-table th:nth-child(8), .responsive-table td:nth-child(8) { width: 10%; }
                
                /* Estilos para pantallas grandes (Desktop) a partir de 768px */
                @media (min-width: 768px) {
                    .responsive-table .player-name { font-size: 11pt; } /* Nombres más grandes en desktop */
                    .responsive-table .sede-fecha { font-size: 1.35rem; } /* Más grande sede y fecha en desktop */
                    .responsive-table th:nth-child(1), .responsive-table td:nth-child(1) { width: 5%; }
                    .responsive-table th:nth-child(2), .responsive-table td:nth-child(2) { width: 8%; }
                    .responsive-table th:nth-child(3), .responsive-table td:nth-child(3) { width: 28%; } /* Jugador 1 más ancho */
                    .responsive-table th:nth-child(4), .responsive-table td:nth-child(4) { width: 5%; }
                    .responsive-table th:nth-child(5), .responsive-table td:nth-child(5) { width: 12%; }
                    .responsive-table th:nth-child(6), .responsive-table td:nth-child(6) { width: 5%; }
                    .responsive-table th:nth-child(7), .responsive-table td:nth-child(7) { width: 28%; } /* Jugador 2 más ancho */
                    .responsive-table th:nth-child(8), .responsive-table td:nth-child(8) { width: 9%; }
                }
            </style>
            <table class="matches-report-style responsive-table">
                <tbody>${tableBodyHTML}</tbody>
            </table>
        </div>`;
    }

    async function loadReportData() {
        headerContainer.innerHTML = renderPublicHeader();
        const urlParams = new URLSearchParams(window.location.search);
        const reportId = urlParams.get('id');

        if (!reportId) {
            reportTitleEl.textContent = "Reporte no encontrado";
            return;
        }

        const { data: savedReport, error } = await supabase
            .from('reports')
            .select('title, report_data')
            .eq('id', reportId)
            .single();

        if (error || !savedReport) {
            reportTitleEl.textContent = "Error al cargar el reporte";
            console.error(error);
            return;
        }

        document.title = savedReport.title;
        reportTitleEl.textContent = savedReport.title;
        const matchIds = savedReport.report_data || [];

        if (matchIds.length === 0) {
            reportContainer.innerHTML = '<p class="text-center text-gray-400 py-10">Este reporte no contiene partidos.</p>';
            return;
        }

        const { data: freshMatches, error: matchesError } = await supabase
            .from('matches')
            .select(`*, 
                category:category_id(id, name, color), 
                player1:player1_id(*, team:team_id(name, image_url, color)), 
                player2:player2_id(*, team:team_id(name, image_url, color)), 
                winner:winner_id(name)`)
            .in('id', matchIds);

        if (matchesError) {
            reportTitleEl.textContent = "Error al cargar los partidos del reporte";
            return;
        }
        
        const reportData = processMatchesForReport(freshMatches);
        await renderReport(reportData);
    }

    loadReportData();
});