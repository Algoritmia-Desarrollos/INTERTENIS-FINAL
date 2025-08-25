import { supabase } from '../src/common/supabase.js';
import { renderPublicHeader } from './public-header.js';
import { calculatePoints } from '../src/admin/calculatePoints.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENTOS DEL DOM ---
    const headerContainer = document.getElementById('header-container');
    const reportTitleEl = document.getElementById('report-title');
    const pagesContainer = document.getElementById('report-pages-container');
    let reportData = [];

    function processMatchesForReport(matches) {
        if (!matches) return [];
        return matches.map(match => {
            const { p1_points, p2_points } = calculatePoints(match);
            const isDoubles = !!(match.player3 && match.player4);
            return {
                id: match.id,
                isDoubles: isDoubles,
                status: match.status || '',
                date: match.match_date ? match.match_date.split('T')[0] : '',
                time: match.match_time || '',
                location: match.location || '',
                category: match.category?.name || '',
                category_color: match.category?.color || '#e5e7eb',
                player1: {
                    name: match.player1?.name || '',
                    points: p1_points ?? '',
                    isWinner: match.winner_id === match.player1_id || (isDoubles && match.winner_id === match.player3_id),
                    teamColor: match.player1?.team?.color,
                    teamImage: match.player1?.team?.image_url
                },
                player2: {
                    name: match.player2?.name || '',
                    points: p2_points ?? '',
                    isWinner: match.winner_id === match.player2_id || (isDoubles && match.winner_id === match.player4_id),
                    teamColor: match.player2?.team?.color,
                    teamImage: match.player2?.team?.image_url
                },
                player3: isDoubles ? { name: match.player3?.name || '' } : null,
                player4: isDoubles ? { name: match.player4?.name || '' } : null,
                sets: match.sets || [],
            };
        });
    }

    async function renderReport() {
        pagesContainer.innerHTML = '';
        if (reportData.length === 0) {
            pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte.</p>';
            return;
        }

        async function fetchWeatherData() {
            const locations = { centro: { lat: -32.95, lon: -60.64 }, funes: { lat: -32.92, lon: -60.81 } };
            const weatherCache = { centro: {}, funes: {} };
            try {
                for (const key in locations) {
                    const loc = locations[key];
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&timezone=auto&forecast_days=16`;
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const data = await response.json();
                    data.daily.time.forEach((date, index) => {
                        weatherCache[key][date] = { maxTemp: Math.round(data.daily.temperature_2m_max[index]), minTemp: Math.round(data.daily.temperature_2m_min[index]), windSpeed: Math.round(data.daily.wind_speed_10m_max[index]), weatherCode: data.daily.weather_code[index] };
                    });
                }
            } catch (error) { console.error("Error al obtener clima:", error); }
            return weatherCache;
        }
        const weatherData = await fetchWeatherData();

        const groupedMatches = reportData.reduce((acc, match) => {
            const date = match.date;
            const sede = match.location ? match.location.split(' - ')[0] : 'Sede no definida';
            if (!acc[date]) acc[date] = {};
            if (!acc[date][sede]) acc[date][sede] = [];
            acc[date][sede].push(match);
            return acc;
        }, {});
        const sortedDates = Object.keys(groupedMatches).sort((a, b) => new Date(a) - new Date(b));
        const A4_PAGE_HEIGHT_MM = 297, PADDING_MM = 30, PAGE_HEADER_HEIGHT_MM = 25, HEADER_ROW_HEIGHT_MM = 12, ROW_HEIGHT_MM = 10, SPACER_HEIGHT_MM = 5;
        const maxContentHeight = A4_PAGE_HEIGHT_MM - PADDING_MM - PAGE_HEADER_HEIGHT_MM;
        let pageCount = 1, currentHeight = 0;
        
        function createNewPage() {
            const page = document.createElement('div');
            page.className = 'page';
            page.innerHTML = `<div class="page-header flex justify-between items-center"><h1 class="text-2xl font-bold">Reporte de Partidos</h1><p class="text-sm text-gray-500">Página ${pageCount}</p></div><div class="page-content"></div>`;
            pagesContainer.appendChild(page);
            currentHeight = 0;
            return page.querySelector('.page-content');
        }
        
        function createTable(container) {
            const table = document.createElement('table');
            table.className = 'report-table';
            table.style.tableLayout = 'fixed'; 
            table.innerHTML = `<colgroup><col style="width: 6%"><col style="width: 9%"><col style="width: 25%"><col style="width: 6%"><col style="width: 18%"><col style="width: 6%"><col style="width: 25%"><col style="width: 5%"></colgroup>`;
            container.appendChild(table);
            return table;
        }

        function createHeaderRow(tbody, sede, date, formattedDate) {
             const headerRow = tbody.insertRow();
            headerRow.className = 'date-header-row';
            let bgColor, textColor;
            if (sede.toLowerCase().trim() === 'centro') { bgColor = '#222222'; textColor = '#ffc000'; } else { bgColor = '#fdc100'; textColor = '#000000'; }
            function weatherCodeToEmoji(code) { const icons = { 0: '☀️', 1: '🌤️', 2: '⛅️', 3: '🌥️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 80: '⛈️', 81: '⛈️', 82: '⛈️', 95: '🌩️' }; return icons[code] || '🌐'; }
            let weatherHTML = '';
            const weather = weatherData[sede.toLowerCase().trim()]?.[date];
            if (weather) { weatherHTML = `<div style="display: flex; align-items: center; gap: 15px; font-size: 0.9em;"><div style="text-align: right;"><div>${weather.maxTemp}° / ${weather.minTemp}°</div><div style="font-size: 0.8em; opacity: 0.9;">${weather.windSpeed} km/h</div></div><div style="font-size: 1.8em;">${weatherCodeToEmoji(weather.weatherCode)}</div></div>`; }
            const headerCell = headerRow.insertCell();
            headerCell.colSpan = 8;
            headerCell.style.cssText = `background-color: ${bgColor}; color: ${textColor}; font-weight: 700; font-size: 11pt; padding: 8px 15px;`;
            headerCell.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;"><span style="text-align: left;">${sede.toUpperCase()}</span><span style="text-align: center; flex-grow: 1; display: inline-block; padding-top:2px; padding-bottom:2px; font-size: 13pt;">${formattedDate}</span><span style="text-align: right;">${weatherHTML}</span></div>`;
        }
        
        let container = createNewPage();
        for (const date of sortedDates) {
            const sedes = groupedMatches[date];
            const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
            for (const sede in sedes) {
                const matches = sedes[sede];
                const tableHeight = HEADER_ROW_HEIGHT_MM + (matches.length * ROW_HEIGHT_MM);
                const spacerHeight = (currentHeight > 0) ? SPACER_HEIGHT_MM : 0;

                if (currentHeight + spacerHeight + tableHeight > maxContentHeight) {
                    pageCount++; container = createNewPage(); currentHeight = 0;
                }
                
                if (currentHeight > 0) {
                    const spacer = document.createElement('div');
                    spacer.style.height = `${SPACER_HEIGHT_MM}mm`;
                    container.appendChild(spacer);
                    currentHeight += SPACER_HEIGHT_MM;
                }

                const table = createTable(container);
                let tbody = table.createTBody();
                createHeaderRow(tbody, sede, date, formattedDate);
                currentHeight += HEADER_ROW_HEIGHT_MM;
                
                for (const match of matches) {
                    const row = tbody.insertRow();
                    row.className = 'data-row' + (match.status === 'suspendido' ? ' suspended-row' : '');
                    const played = Array.isArray(match.sets) && match.sets.length > 0;
                    let player1Content, player2Content;
                    if (match.isDoubles) {
                        player1Content = `<div style="line-height: 1.2;"><div>${match.player1.name}</div><div>${match.player3.name}</div></div>`;
                        player2Content = `<div style="line-height: 1.2;"><div>${match.player2.name}</div><div>${match.player4.name}</div></div>`;
                    } else {
                        player1Content = match.player1.name;
                        player2Content = match.player2.name;
                    }
                    let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                    if(cancha.match(/\d+/)) cancha = cancha.match(/\d+/)[0];
                    const p1_class = match.player1.isWinner ? 'winner' : '';
                    const p2_class = match.player2.isWinner ? 'winner' : '';
                    let hora = match.time?.substring(0, 5) || '';
                    let setsDisplay = '';
                    if (match.status === 'suspendido') {
                        setsDisplay = `<span style=\"color:#fff;font-weight:700;text-decoration:none !important;\">Suspendido</span>`;
                    } else {
                        setsDisplay = played ? match.sets.map(s => `${s.p1}/${s.p2}`).join(' ') : '';
                    }
                    function isColorLight(hex) { if (!hex) return false; let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16); return (0.299*r + 0.587*g + 0.114*b) > 186; }
                    const p1TeamColor = match.player1.teamColor, p2TeamColor = match.player2.teamColor;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff', p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                    let p1NameStyle = played && !match.player1.isWinner ? 'color:#6b716f;' : '';
                    let p2NameStyle = played && !match.player2.isWinner ? 'color:#6b716f;' : '';
                    let p1PointsDisplay = '', p2PointsDisplay = '';
                    if (played) { p1PointsDisplay = match.player1.points ?? ''; if(p1PointsDisplay===0) p1PointsDisplay='0'; p2PointsDisplay = match.player2.points ?? ''; if(p2PointsDisplay===0) p2PointsDisplay='0'; } else { if (match.player1.teamImage) p1PointsDisplay = `<img src="${match.player1.teamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`; if (match.player2.teamImage) p2PointsDisplay = `<img src="${match.player2.teamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`; }
                    const canchaBackgroundColor = sede.toLowerCase().trim() === 'centro' ? '#222222' : '#ffc000';
                    const canchaTextColor = sede.toLowerCase().trim() === 'centro' ? '#ffc000' : '#222';
                    const categoryDisplay = match.category === 'Equipos' ? '' : match.category;
                    row.innerHTML = `
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td class="text-center">${hora}</td>
                        <td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${player1Content}</td>
                        <td class="pts-col" style='text-align:center;background:${p1TeamColor || '#3a3838'};color:${p1TextColor};font-weight:700;'>${p1PointsDisplay}</td>
                        <td style='text-align:center; background:#222 !important; color:#fff !important; text-decoration:none !important; font-weight:700;' class="font-mono">${setsDisplay}</td>
                        <td class="pts-col" style='text-align:center;background:${p2TeamColor || '#3a3838'};color:${p2TextColor};font-weight:700;'>${p2PointsDisplay}</td>
                        <td class="font-bold ${p2_class}" style='${p2NameStyle}'>${player2Content}</td>
                        <td class="cat-col" style="color:${match.category_color || '#b45309'};font-family:'Segoe UI Black',Arial,sans-serif;font-weight:900;">${categoryDisplay}</td>
                    `;
        // Agregar estilos para la fila suspendida: solo color rojo, sin tachado
        const style = document.createElement('style');
        style.innerHTML = `.suspended-row td, .suspended-row .font-mono, .suspended-row .pts-col, .suspended-row .cat-col, .suspended-row .player-name, .suspended-row .player-name-right, .suspended-row .player-name-left {
            color: #ff4444 !important;
            text-decoration: none !important;
        }
        .suspended-row td.font-mono {
            color: #fff !important;
            text-decoration: none !important;
            font-weight: 700;
            background: #222 !important;
        }`;
        document.head.appendChild(style);
                    currentHeight += ROW_HEIGHT_MM;
                }
            }
        }
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
            pagesContainer.innerHTML = '<p class="text-center text-gray-400 py-10">Este reporte no contiene partidos.</p>';
            return;
        }

        const { data: freshMatches, error: matchesError } = await supabase
            .from('matches')
            .select(`*, 
                category:category_id(id, name, color), 
                player1:player1_id(*, team:team_id(name, image_url, color)), 
                player2:player2_id(*, team:team_id(name, image_url, color)),
                player3:player3_id(*, team:team_id(name, image_url, color)),
                player4:player4_id(*, team:team_id(name, image_url, color)),
                winner:winner_id(name)`)
            .in('id', matchIds);

        if (matchesError) {
            reportTitleEl.textContent = "Error al cargar los partidos del reporte";
            return;
        }
        
        reportData = processMatchesForReport(freshMatches);
        
        document.getElementById('btn-save-pdf').addEventListener('click', () => {
            const element = document.getElementById('report-pages-container'); 
            html2pdf().set({ 
                margin: 0, 
                filename: `reporte_${savedReport.title.replace(/\s+/g, '_')}.pdf`, 
                image: { type: 'jpeg', quality: 0.98 }, 
                html2canvas: { scale: 2, useCORS: true }, 
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
            }).from(element).toPdf().get('pdf').then(function (pdf) { 
                const totalPages = pdf.internal.getNumberOfPages(); 
                if (totalPages > 1) { 
                    pdf.deletePage(totalPages); 
                } 
            }).save();
        });

        await renderReport();
    }

    loadReportData();
});