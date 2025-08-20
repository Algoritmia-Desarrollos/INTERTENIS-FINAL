import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ESTADO Y DATOS GLOBALES ---
    let reportData = [];
    let allPlayers = [];
    let isEditMode = false;
    
    // --- ELEMENTOS DEL DOM ---
    const header = document.getElementById('header');
    const pagesContainer = document.getElementById('report-pages-container');
    const btnEditReport = document.getElementById('btn-edit-report');
    
    // Función para obtener todos los jugadores (necesario para los selectores de edición)
    async function fetchAllPlayers() {
        const { data, error } = await supabase.from('players').select('id, name').order('name');
        if (error) {
            console.error("Error fetching players:", error);
            return [];
        }
        return data;
    }

    // Función principal para renderizar el reporte
    async function renderReport() {
        // Limpiar el contenedor antes de renderizar
        pagesContainer.innerHTML = '';

        if (reportData.length === 0) {
            pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte.</p>';
            btnEditReport.style.display = 'none'; // Ocultar botón si no hay reporte
            return;
        }

        // --- OBTENER DATOS DEL CLIMA ---
        async function fetchWeatherData() {
            // (La lógica del clima se mantiene sin cambios)
            const locations = {
                centro: { lat: -32.95, lon: -60.64 },
                funes: { lat: -32.92, lon: -60.81 }
            };
            const weatherCache = { centro: {}, funes: {} };
            try {
                for (const key in locations) {
                    const loc = locations[key];
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&timezone=auto&forecast_days=16`;
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const data = await response.json();
                    data.daily.time.forEach((date, index) => {
                        weatherCache[key][date] = {
                            maxTemp: Math.round(data.daily.temperature_2m_max[index]),
                            minTemp: Math.round(data.daily.temperature_2m_min[index]),
                            windSpeed: Math.round(data.daily.wind_speed_10m_max[index]),
                            weatherCode: data.daily.weather_code[index]
                        };
                    });
                }
            } catch (error) { console.error("Error al obtener clima:", error); }
            return weatherCache;
        }
        
        const weatherData = await fetchWeatherData();

        // --- LÓGICA DE AGRUPACIÓN Y PAGINACIÓN (sin cambios) ---
        const groupedMatches = reportData.reduce((acc, match, index) => {
            // Añadimos un ID único a cada partido para la edición
            match.reportIndex = index; 
            const date = match.date;
            const sede = match.location ? match.location.split(' - ')[0] : 'Sede no definida';
            if (!acc[date]) acc[date] = {};
            if (!acc[date][sede]) acc[date][sede] = [];
            acc[date][sede].push(match);
            return acc;
        }, {});
        const sortedDates = Object.keys(groupedMatches).sort((a, b) => new Date(a) - new Date(b));
        const A4_PAGE_HEIGHT_MM = 297, PADDING_MM = 30, PAGE_HEADER_HEIGHT_MM = 25;
        const HEADER_ROW_HEIGHT_MM = 12, ROW_HEIGHT_MM = 8, SPACER_HEIGHT_MM = 5;
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
        
        function createTable(container) { /* ... sin cambios ... */
            const table = document.createElement('table');
            table.className = 'report-table';
            table.style.tableLayout = 'fixed'; 
            table.innerHTML = `<colgroup><col style="width: 6%"><col style="width: 9%"><col style="width: 25%"><col style="width: 6%"><col style="width: 18%"><col style="width: 6%"><col style="width: 25%"><col style="width: 5%"></colgroup>`;
            container.appendChild(table);
            return table;
        }

        function createHeaderRow(tbody, sede, date, formattedDate) { /* ... sin cambios ... */
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
        
        // --- BUCLE DE RENDERIZADO PRINCIPAL (MODIFICADO) ---
        let container = createNewPage();
        for (const date of sortedDates) {
            const sedes = groupedMatches[date];
            const formattedDate = new Date(date).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
            for (const sede in sedes) {
                const matches = sedes[sede];
                const tableHeight = HEADER_ROW_HEIGHT_MM + (matches.length * ROW_HEIGHT_MM);
                const spacerHeight = (currentHeight > 0) ? SPACER_HEIGHT_MM : 0;

                if (currentHeight + spacerHeight + tableHeight > maxContentHeight) {
                    pageCount++;
                    container = createNewPage();
                    currentHeight = 0;
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
                
                // Bucle para añadir filas de partidos
                for (const match of matches) {
                    const row = tbody.insertRow();
                    row.className = 'data-row';
                    
                    const played = !!(match.sets && match.sets.trim() !== '');
                    
                    // --- NUEVA LÓGICA DE EDICIÓN ---
                    let player1Content, player2Content;
                    
                    if (isEditMode && !played) {
                        // Si estamos en modo edición y el partido está pendiente, mostrar selectores
                        const createPlayerSelect = (playerNumber, selectedPlayerName) => {
                            const selectedPlayer = allPlayers.find(p => p.name === selectedPlayerName);
                            let options = allPlayers.map(p => `<option value="${p.id}" ${p.id === selectedPlayer?.id ? 'selected' : ''}>${p.name}</option>`).join('');
                            return `<select data-report-index="${match.reportIndex}" data-player-number="${playerNumber}" class="player-select" style="width: 100%; border: 1px solid #ccc; background: #fff; color: #000; font-size: 8pt; padding: 2px;">${options}</select>`;
                        };
                        player1Content = createPlayerSelect(1, match.player1.name);
                        player2Content = createPlayerSelect(2, match.player2.name);
                    } else {
                        // Modo normal: mostrar solo texto
                        player1Content = match.player1.name;
                        player2Content = match.player2.name;
                    }
                    // --- FIN DE LA LÓGICA DE EDICIÓN ---

                    let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                    const matchNum = cancha.match(/\d+/);
                    if (matchNum) cancha = matchNum[0];
                    
                    const p1_class = match.player1.isWinner ? 'winner' : '';
                    const p2_class = match.player2.isWinner ? 'winner' : '';
                    let hora = match.time || '';
                    if (hora && hora.length >= 5) hora = hora.substring(0, 5);
                    const setsDisplay = (match.sets || '').split(/\s*,\s*/).map(s => s.replace(/\s*-\s*/g, '/')).join(' ');

                    function isColorLight(hex) {
                        if (!hex) return false; let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16); return (0.299*r + 0.587*g + 0.114*b) > 186;
                    }
                    
                    const p1TeamColor = match.player1.teamColor, p2TeamColor = match.player2.teamColor;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff', p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                    let p1NameStyle = played && !match.player1.isWinner ? 'color:#6b716f;' : '';
                    let p2NameStyle = played && !match.player2.isWinner ? 'color:#6b716f;' : '';
                    let p1PointsDisplay = '', p2PointsDisplay = '';
                    // ... (resto de la lógica de puntos e imágenes de equipo sin cambios)
                    if (played) { p1PointsDisplay = match.player1.points ?? ''; if(p1PointsDisplay===0) p1PointsDisplay='0'; p2PointsDisplay = match.player2.points ?? ''; if(p2PointsDisplay===0) p2PointsDisplay='0'; } else { if (match.player1.teamImage) p1PointsDisplay = `<img src="${match.player1.teamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`; if (match.player2.teamImage) p2PointsDisplay = `<img src="${match.player2.teamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`; }
                    const canchaBackgroundColor = sede.toLowerCase().trim() === 'centro' ? '#222222' : '#ffc000';
                    const canchaTextColor = sede.toLowerCase().trim() === 'centro' ? '#ffc000' : '#222';

                    row.innerHTML = `
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td class="text-center">${hora}</td>
                        <td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${player1Content}</td>
                        <td class="pts-col" style='text-align:center;background:${p1TeamColor || '#3a3838'};color:${p1TextColor};font-weight:700;'>${p1PointsDisplay}</td>
                        <td style='text-align:center;' class="font-mono">${setsDisplay}</td>
                        <td class="pts-col" style='text-align:center;background:${p2TeamColor || '#3a3838'};color:${p2TextColor};font-weight:700;'>${p2PointsDisplay}</td>
                        <td class="font-bold ${p2_class}" style='${p2NameStyle}'>${player2Content}</td>
                        <td class="cat-col" style="color:${match.category_color || '#b45309'};font-family:'Segoe UI Black',Arial,sans-serif;font-weight:900;">${match.category}</td>
                    `;
                    currentHeight += ROW_HEIGHT_MM;
                }
            }
        }
    }

    // --- MANEJADOR DE EVENTOS PARA LOS SELECTORES DE JUGADOR ---
    pagesContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('player-select')) {
            const select = e.target;
            const reportIndex = parseInt(select.dataset.reportIndex, 10);
            const playerNumber = parseInt(select.dataset.playerNumber, 10);
            const newPlayerId = parseInt(select.value, 10);
            const newPlayer = allPlayers.find(p => p.id === newPlayerId);

            if (newPlayer) {
                const playerKey = `player${playerNumber}`;
                // Actualizamos el nombre del jugador en nuestro array de datos
                reportData[reportIndex][playerKey].name = newPlayer.name;
                // Aquí podrías actualizar también el equipo si fuera necesario
                // reportData[reportIndex][playerKey].teamColor = newPlayer.team?.color;
                // reportData[reportIndex][playerKey].teamImage = newPlayer.team?.image_url;
                console.log(`Cambiado jugador ${playerNumber} del partido ${reportIndex} a ${newPlayer.name}`);
            }
        }
    });

    // --- LÓGICA PARA LOS BOTONES DE ACCIÓN ---
    function toggleEditMode() {
        isEditMode = !isEditMode;
        if (isEditMode) {
            btnEditReport.textContent = 'Guardar y Salir';
            btnEditReport.classList.remove('btn-secondary');
            btnEditReport.classList.add('btn-primary');
        } else {
            // Guardar los cambios en localStorage al salir del modo edición
            localStorage.setItem('reportMatches', JSON.stringify(reportData));
            alert('Reporte actualizado con los nuevos jugadores.');
            btnEditReport.innerHTML = `<span class="material-icons">edit</span> Editar Reporte`;
            btnEditReport.classList.remove('btn-primary');
            btnEditReport.classList.add('btn-secondary');
        }
        // Volver a renderizar el reporte con el nuevo estado de edición
        renderReport();
    }
    
    // --- INICIALIZACIÓN ---
    async function initialize() {
        header.innerHTML = renderHeader();
        reportData = JSON.parse(localStorage.getItem('reportMatches') || '[]');
        allPlayers = await fetchAllPlayers(); // Cargar jugadores
        
        btnEditReport.addEventListener('click', toggleEditMode);
        
        // La lógica de los otros botones se mantiene
        document.getElementById('btn-save-pdf').addEventListener('click', () => { /* ... sin cambios ... */
            const element = document.getElementById('report-pages-container'); html2pdf().set({ margin: 0, filename: `reporte_partidos.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).toPdf().get('pdf').then(function (pdf) { const totalPages = pdf.internal.getNumberOfPages(); if (totalPages > 1) { pdf.deletePage(totalPages); } }).save();
        });
        document.getElementById('btn-save-report').addEventListener('click', async () => { /* ... sin cambios ... */
            if (!reportData || reportData.length === 0) return alert('No hay datos de reporte para guardar.'); const title = prompt('Ingresa un título para guardar este reporte:', 'Reporte de Partidos ' + new Date().toLocaleDateString('es-AR')); if (!title) return; const { error } = await supabase.from('reports').insert({ title: title, report_data: reportData }); if (error) alert('Error al guardar el reporte: ' + error.message); else { alert('Reporte guardado con éxito.'); window.location.href = 'reportes-historicos.html'; }
        });

        await renderReport();
    }

    initialize();
});