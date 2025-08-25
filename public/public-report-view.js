import { supabase } from '../src/common/supabase.js';
import { renderPublicHeader } from './public-header.js';
import { calculatePoints } from '../src/admin/calculatePoints.js';

document.addEventListener('DOMContentLoaded', async () => {
    const headerContainer = document.getElementById('header-container');
    const reportTitleEl = document.getElementById('report-title');
    const matchesContainer = document.getElementById('matches-container');

    function isColorLight(hex) {
        if (!hex) return false;
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const r = parseInt(c.substr(0, 2), 16),
              g = parseInt(c.substr(2, 2), 16),
              b = parseInt(c.substr(4, 2), 16);
        return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
    }

    function renderMatches(matchesToRender) {
        if (!matchesToRender || matchesToRender.length === 0) {
            matchesContainer.innerHTML = '<p class="text-center text-gray-400 py-8">Este reporte no contiene partidos.</p>';
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

        for (const [dateIdx, date] of sortedDates.entries()) {
            if (dateIdx > 0) tableHTML += `<tr><td colspan="9" style="height: 18px; background: #000; border: none;"></td></tr>`;
            
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
                        <td colspan="2" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-right: none;">${sede.toUpperCase()}</td>
                        <td colspan="7" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0 8px 0; font-size: 15pt; border-radius: 0; letter-spacing: 1px; border-left: none;">${formattedDate}</td>
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
                    const resultadoDisplay = match.status === 'suspendido' ? '<span style="color:#fff;font-weight:700;">Suspendido</span>' : setsDisplay;
                    
                    const p1TeamColor = match.player1.team?.color;
                    const p2TeamColor = match.player2.team?.color;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                    const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';

                    const played = !!(match.sets && match.sets.length > 0);
                    let team1NameStyle = played && !team1_winner ? 'color:#888;' : '';
                    let team2NameStyle = played && (team1_winner || !match.winner_id) ? 'color:#888;' : '';

                    let team1PointsDisplay = played ? (p1_points ?? '') : (match.player1.team?.image_url ? `<img src="${match.player1.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">` : '');
                    let team2PointsDisplay = played ? (p2_points ?? '') : (match.player2.team?.image_url ? `<img src="${match.player2.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">` : '');

                    let cancha = match.location ? (match.location.split(' - ')[1] || match.location.split(' - ')[0] || 'N/A') : 'N/A';
                    const matchNum = cancha.match(/\d+/);
                    if (matchNum) cancha = matchNum[0];

                    const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
                    const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';
                    const suspendedClass = match.status === 'suspendido' ? 'suspended-row' : '';

                    tableHTML += `
                        <tr class="data-row ${suspendedClass}">
                            <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                            <td style="background:#000;color:#fff;">${hora}</td>
                            <td class="player-name player-name-right ${team1_class}" style='background:#000;color:#fff;${team1NameStyle};font-size:${isDoubles ? '10pt' : '12pt'};'>${team1_names}</td>
                            <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${team1PointsDisplay}</td>
                            <td class="font-mono" style="background:#000;color:#fff;">${resultadoDisplay}</td>
                            <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${team2PointsDisplay}</td>
                            <td class="player-name player-name-left ${team2_class}" style='background:#000;color:#fff;${team2NameStyle};font-size:${isDoubles ? '10pt' : '12pt'};'>${team2_names}</td>
                            <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${match.category?.name || 'N/A'}</td>
                        </tr>`;
                }
            }
        }
        
        matchesContainer.innerHTML = `
            <div class="bg-[#18191b] p-4 sm:p-6 rounded-xl shadow-lg overflow-x-auto">
                <table class="matches-report-style">
                    <colgroup><col style="width: 5%"><col style="width: 8%"><col style="width: 28%"><col style="width: 5%"><col style="width: 13%"><col style="width: 5%"><col style="width: 28%"><col style="width: 8%"></colgroup>
                    <tbody>${tableHTML}</tbody>
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

        const { data: freshMatches, error: matchesError } = await supabase
            .from('matches')
            .select(`*, 
                category:category_id(id, name, color), 
                player1:player1_id(*, team:team_id(name, image_url, color)), 
                player2:player2_id(*, team:team_id(name, image_url, color)),
                player3:player3_id(*, team:team_id(name, image_url, color)),
                player4:player4_id(*, team:team_id(name, image_url, color)),
                winner:winner_id(id, name)`)
            .in('id', matchIds);

        if (matchesError) {
            reportTitleEl.textContent = "Error al cargar los partidos del reporte";
            return;
        }
        
        renderMatches(freshMatches);
    }

    loadReportData();
});