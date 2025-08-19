import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Renderizar el encabezado (se ocultará al imprimir)
    document.getElementById('header').innerHTML = renderHeader();
    
    // 2. Obtener y procesar los datos de los partidos
    const reportData = JSON.parse(localStorage.getItem('reportMatches') || '[]');
    const pagesContainer = document.getElementById('report-pages-container');

    if (reportData.length === 0) {
        pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte. Vuelve a la página anterior y selecciona los que desees incluir.</p>';
        return;
    }

    // --- NUEVA FUNCIÓN PARA OBTENER DATOS DEL CLIMA ---
    async function fetchWeatherData() {
        const locations = {
            centro: { lat: -32.95, lon: -60.64 }, // Coordenadas de Rosario
            funes: { lat: -32.92, lon: -60.81 }   // Coordenadas de Funes
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
        } catch (error) {
            console.error("No se pudo obtener la información del clima:", error);
        }
        return weatherCache;
    }

    // Llama a la API antes de renderizar
    const weatherData = await fetchWeatherData();

    // 3. Agrupar partidos por fecha y luego por sede
    const groupedMatches = reportData.reduce((acc, match) => {
        const date = match.date;
        const sede = match.location ? match.location.split(' - ')[0] : 'Sede no definida';
        if (!acc[date]) acc[date] = {};
        if (!acc[date][sede]) acc[date][sede] = [];
        acc[date][sede].push(match);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedMatches).sort((a, b) => new Date(a) - new Date(b));

    // 4. Lógica de paginación
    const A4_PAGE_HEIGHT_MM = 297;
    const PADDING_MM = 15 * 2;
    const PAGE_HEADER_HEIGHT_MM = 25;
    const HEADER_ROW_HEIGHT_MM = 12; 
    const ROW_HEIGHT_MM = 8;
    const SPACER_HEIGHT_MM = 5; 
    
    const maxContentHeight = A4_PAGE_HEIGHT_MM - PADDING_MM - PAGE_HEADER_HEIGHT_MM;
    let pageCount = 1;
    let currentHeight = 0;

    function createNewPage() {
        const page = document.createElement('div');
        page.className = 'page';
        page.innerHTML = `
            <div class="page-header flex justify-between items-center">
                <h1 class="text-2xl font-bold">Reporte de Partidos</h1>
                <p class="text-sm text-gray-500">Página ${pageCount}</p>
            </div>
            <div class="page-content"></div>
        `;
        pagesContainer.appendChild(page);
        currentHeight = 0;
        return page.querySelector('.page-content');
    }

    function createTable(container) {
        const table = document.createElement('table');
        table.className = 'report-table';
        table.style.tableLayout = 'fixed'; 
        table.innerHTML = `
            <colgroup>
                <col style="width: 6%"><col style="width: 9%"><col style="width: 25%"><col style="width: 6%"><col style="width: 18%"><col style="width: 6%"><col style="width: 25%"><col style="width: 5%">
            </colgroup>
        `;
        container.appendChild(table);
        return table;
    }

    // --- FUNCIÓN MODIFICADA PARA AÑADIR EL CLIMA ---
    function createHeaderRow(tbody, sede, date, formattedDate) {
        const headerRow = tbody.insertRow();
        headerRow.className = 'date-header-row';

        let bgColor, textColor;

        if (sede.toLowerCase().trim() === 'centro') {
            bgColor = '#222222'; // gris oscuro
            textColor = '#ffc000';
        } else { 
            bgColor = '#fdc100'; 
            textColor = '#000000';
        }

        function weatherCodeToEmoji(code) {
            const icons = { 0: '☀️', 1: '🌤️', 2: '⛅️', 3: '🌥️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 80: '⛈️', 81: '⛈️', 82: '⛈️', 95: '🌩️' };
            return icons[code] || '🌐';
        }

        let weatherHTML = '';
        const weather = weatherData[sede.toLowerCase().trim()]?.[date];
        if (weather) {
            weatherHTML = `
                <div style="display: flex; align-items: center; gap: 15px; font-size: 0.9em;">
                    <div style="text-align: right;">
                        <div>${weather.maxTemp}° / ${weather.minTemp}°</div>
                        <div style="font-size: 0.8em; opacity: 0.9;">${weather.windSpeed} km/h</div>
                    </div>
                    <div style="font-size: 1.8em;">${weatherCodeToEmoji(weather.weatherCode)}</div>
                </div>
            `;
        }

        const headerCell = headerRow.insertCell();
        headerCell.colSpan = 8;
        headerCell.style.backgroundColor = bgColor;
        headerCell.style.color = textColor;
        headerCell.style.fontWeight = '700';
        headerCell.style.fontSize = '11pt';
        headerCell.style.padding = '8px 15px';
        
        headerCell.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="text-align: left;">${sede.toUpperCase()}</span>
                <span style="text-align: center; flex-grow: 1; display: inline-block; padding-top:2px; padding-bottom:2px; font-size: 13pt;">${formattedDate}</span>
                <span style="text-align: right;">${weatherHTML}</span>
            </div>
        `;
    }

    let container = createNewPage();

// Pega este bloque completo en reportes.js
for (const date of sortedDates) {
    
    // Define las variables necesarias para esta fecha específica
    const sedes = groupedMatches[date];
    const dateObj = new Date(date + 'T00:00:00');
    const weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
    const day = dateObj.getDate();
    const month = dateObj.toLocaleDateString('es-AR', { month: 'long' });
    let formattedDate = `${weekday} ${day} de ${month}`;
    formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

    // Bucle interno que recorre las sedes DENTRO de la fecha actual
    for (const sede in sedes) {
        const matches = sedes[sede];

        // --- LÓGICA DE PAGINACIÓN ---
        const tableHeight = HEADER_ROW_HEIGHT_MM + (matches.length * ROW_HEIGHT_MM);
        const spacerHeight = (currentHeight > 0) ? SPACER_HEIGHT_MM : 0;

        if (currentHeight + spacerHeight + tableHeight > maxContentHeight) {
            pageCount++;
            container = createNewPage();
            currentHeight = 0;
        }
        // --- FIN DE LÓGICA DE PAGINACIÓN ---

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
            row.className = 'data-row';
            let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
            if (typeof cancha === 'string') {
                const matchNum = cancha.match(/\d+/);
                if (matchNum) cancha = matchNum[0];
            }
            const p1_class = match.player1.isWinner ? 'winner' : '';
            const p2_class = match.player2.isWinner ? 'winner' : '';
            let hora = match.time || '';
            if (hora && hora.length >= 5) hora = hora.substring(0, 5);
            const setsDisplay = (match.sets || '').split(/\s*,\s*/).map(s => s.replace(/\s*-\s*/g, '/')).join(' ');

            function isColorLight(hex) {
                if (!hex) return false;
                let c = hex.replace('#', '');
                if (c.length === 3) c = c.split('').map(x => x + x).join('');
                const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
                return (0.299*r + 0.587*g + 0.114*b) > 186;
            }

            const p1TeamColor = match.player1.teamColor, p2TeamColor = match.player2.teamColor;
            const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff', p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
            const played = !!(match.sets && match.sets.trim() !== '');
            let p1NameStyle = played && !match.player1.isWinner ? 'color:#6b716f;' : '';
            let p2NameStyle = played && !match.player2.isWinner ? 'color:#6b716f;' : '';
            

            let p1CellContent = '';
            if (played) {
                p1CellContent = (typeof match.player1.points !== 'undefined' && match.player1.points !== null) ? match.player1.points : '';
                if (p1CellContent === '') p1CellContent = '';
                if (p1CellContent === 0) p1CellContent = '0';
            }
            if (!played && match.player1.teamImage) {
                p1CellContent = `<img src="${match.player1.teamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
            }

            let p2CellContent = '';
            if (played) {
                p2CellContent = (typeof match.player2.points !== 'undefined' && match.player2.points !== null) ? match.player2.points : '';
                if (p2CellContent === '') p2CellContent = '';
                if (p2CellContent === 0) p2CellContent = '0';
            }
            if (!played && match.player2.teamImage) {
                p2CellContent = `<img src="${match.player2.teamImage}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
            }
            
            const canchaBackgroundColor = sede.toLowerCase().trim() === 'centro' ? '#222222' : '#ffc000';
            const canchaTextColor = sede.toLowerCase().trim() === 'centro' ? '#ffc000' : '#222';

            row.innerHTML = `
                <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                <td class="text-center">${hora}</td>
                <td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${match.player1.name}</td>
                <td class="pts-col" style='text-align:center;background:${p1TeamColor || '#3a3838'};color:${p1TextColor};font-weight:700;'>${p1CellContent}</td>
                <td style='text-align:center;' class="font-mono">${setsDisplay}</td>
                <td class="pts-col" style='text-align:center;background:${p2TeamColor || '#3a3838'};color:${p2TextColor};font-weight:700;'>${p2CellContent}</td>
                <td class="font-bold ${p2_class}" style='${p2NameStyle}'>${match.player2.name}</td>
                <td class="cat-col" style="color:${match.category_color || '#b45309'};font-family:'Segoe UI Black',Arial,sans-serif;font-weight:900;">${match.category}</td>
            `;
            currentHeight += ROW_HEIGHT_MM;
        }
    }
}
});