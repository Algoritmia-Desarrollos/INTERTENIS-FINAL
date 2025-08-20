import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ESTADO Y DATOS GLOBALES ---
    let reportData = []; // Contendrá los objetos de partido completos y actualizados.
    let matchIdsForReport = []; // Guardará los IDs que definen el reporte actual.
    let allPlayers = [];
    let isEditMode = false;
    
    // --- ELEMENTOS DEL DOM ---
    const header = document.getElementById('header');
    const pagesContainer = document.getElementById('report-pages-container');
    const btnEditReport = document.getElementById('btn-edit-report');
    
    async function fetchAllPlayers() {
        const { data, error } = await supabase.from('players').select('id, name, category_id').order('name');
        if (error) {
            console.error("Error al obtener los jugadores:", error);
            return [];
        }
        return data;
    }

    // Procesa los datos crudos de Supabase al formato que necesita renderReport.
    function processMatchesForReport(matches) {
        if (!matches) return [];
        return matches.map(match => {
            const { p1_points, p2_points } = calculatePoints(match);
            return {
                id: match.id,
                date: match.match_date ? match.match_date.split('T')[0] : '',
                time: match.match_time || '',
                location: match.location || '',
                category: match.category?.name || '',
                category_id: match.category?.id || null,
                category_color: match.category?.color || '#e5e7eb',
                player1: {
                    id: match.player1?.id,
                    name: match.player1?.name || '',
                    points: p1_points ?? '',
                    isWinner: match.winner_id === match.player1_id,
                    teamColor: match.player1?.team?.color,
                    teamImage: match.player1?.team?.image_url
                },
                player2: {
                    id: match.player2?.id,
                    name: match.player2?.name || '',
                    points: p2_points ?? '',
                    isWinner: match.winner_id === match.player2_id,
                    teamColor: match.player2?.team?.color,
                    teamImage: match.player2?.team?.image_url
                },
                sets: match.sets || [],
            };
        });
    }

    async function renderReport() {
        pagesContainer.innerHTML = '';
        if (reportData.length === 0) {
            pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte.</p>';
            btnEditReport.style.display = 'none';
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

        const groupedMatches = reportData.reduce((acc, match, index) => {
            match.reportIndex = index; 
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
                    row.className = 'data-row';
                    const played = Array.isArray(match.sets) && match.sets.length > 0;
                    let player1Content, player2Content;
                    
                    if (isEditMode && !played) {
                        const categoryPlayers = allPlayers.filter(p => p.category_id === match.category_id);
                        
                        const createPlayerSelect = (playerNumber, selectedPlayerId, opponentPlayerId) => {
                            let options = categoryPlayers
                                .filter(p => p.id !== opponentPlayerId) 
                                .map(p => `<option value="${p.id}" ${p.id === selectedPlayerId ? 'selected' : ''}>${p.name}</option>`)
                                .join('');
                            
                            const style = `width: 100%; border: 1px solid #ccc; background: #f3f4f6; color: #111; font-size: 9pt; padding: 4px; border-radius: 4px; font-weight: 600;`;
                            return `<select data-report-index="${match.reportIndex}" data-player-number="${playerNumber}" class="player-select" style="${style}">${options}</select>`;
                        };
                        
                        player1Content = createPlayerSelect(1, match.player1.id, match.player2.id);
                        player2Content = createPlayerSelect(2, match.player2.id, match.player1.id);

                    } else {
                        player1Content = match.player1.name;
                        player2Content = match.player2.name;
                    }

                    let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                    if(cancha.match(/\d+/)) cancha = cancha.match(/\d+/)[0];
                    const p1_class = match.player1.isWinner ? 'winner' : '';
                    const p2_class = match.player2.isWinner ? 'winner' : '';
                    let hora = match.time?.substring(0, 5) || '';
                    const setsDisplay = played ? match.sets.map(s => `${s.p1}/${s.p2}`).join(' ') : '';
                    function isColorLight(hex) { if (!hex) return false; let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16); return (0.299*r + 0.587*g + 0.114*b) > 186; }
                    const p1TeamColor = match.player1.teamColor, p2TeamColor = match.player2.teamColor;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff', p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                    let p1NameStyle = played && !match.player1.isWinner ? 'color:#6b716f;' : '';
                    let p2NameStyle = played && !match.player2.isWinner ? 'color:#6b716f;' : '';
                    let p1PointsDisplay = '', p2PointsDisplay = '';
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

    pagesContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('player-select')) {
            const select = e.target;
            const reportIndex = parseInt(select.dataset.reportIndex, 10);
            const playerNumber = parseInt(select.dataset.playerNumber, 10);
            const newPlayerId = parseInt(select.value, 10);
            const newPlayer = allPlayers.find(p => p.id === newPlayerId);
            if (newPlayer) {
                const playerKey = `player${playerNumber}`;
                reportData[reportIndex][playerKey].name = newPlayer.name;
                reportData[reportIndex][playerKey].id = newPlayerId;
                reportData[reportIndex][`${playerKey}_id_new`] = newPlayerId;
                const row = select.closest('tr');
                if (row) {
                    const opponentNumber = playerNumber === 1 ? 2 : 1;
                    const opponentSelect = row.querySelector(`select[data-player-number='${opponentNumber}']`);
                    if (opponentSelect) {
                        const match = reportData[reportIndex];
                        const categoryPlayers = allPlayers.filter(p => p.category_id === match.category_id);
                        let options = categoryPlayers
                            .filter(p => p.id !== newPlayerId)
                            .map(p => `<option value="${p.id}" ${p.id === match[`player${opponentNumber}`].id ? 'selected' : ''}>${p.name}</option>`)
                            .join('');
                        opponentSelect.innerHTML = options;
                    }
                }
            }
        }
    });

    async function toggleEditMode() {
        isEditMode = !isEditMode;
        if (isEditMode) {
            btnEditReport.innerHTML = `<span class="material-icons">save</span> Guardar Cambios`;
            btnEditReport.classList.remove('btn-secondary');
            btnEditReport.classList.add('btn-primary');
        } else {
            let updates = [];
            for(const match of reportData) {
                let updateData = {};
                if (match.player1_id_new) updateData.player1_id = match.player1_id_new;
                if (match.player2_id_new) updateData.player2_id = match.player2_id_new;

                if (Object.keys(updateData).length > 0) {
                    updates.push(supabase.from('matches').update(updateData).eq('id', match.id));
                }
            }
            
            if (updates.length > 0) {
                btnEditReport.disabled = true;
                btnEditReport.innerHTML = `<span></span> Guardando...`;

                const results = await Promise.all(updates);
                const errors = results.filter(res => res.error);

                if (errors.length > 0) {
                    alert(`Hubo un error al actualizar ${errors.length} partido(s).`);
                    console.error("Errores de actualización:", errors);
                } else {
                    alert(`${updates.length} partido(s) actualizados en la base de datos con éxito.`);
                }
                btnEditReport.disabled = false;
            }

            reportData.forEach(m => {
                delete m.player1_id_new;
                delete m.player2_id_new;
            });

            btnEditReport.innerHTML = `<span class="material-icons">edit</span> Editar Reporte`;
            btnEditReport.classList.remove('btn-primary');
            btnEditReport.classList.add('btn-secondary');
        }
        await renderReport();
    }
    
    async function initialize() {
        header.innerHTML = renderHeader();
        allPlayers = await fetchAllPlayers();

        const urlParams = new URLSearchParams(window.location.search);
        const reportId = urlParams.get('id');

        if (reportId) {
            const { data: savedReport, error } = await supabase
                .from('reports')
                .select('report_data')
                .eq('id', reportId)
                .single();
            
            if (error || !savedReport) {
                pagesContainer.innerHTML = '<p class="text-center text-red-500 py-10">No se pudo cargar el reporte guardado.</p>';
                return;
            }
            matchIdsForReport = savedReport.report_data || [];

        } else {
            const idsFromStorage = localStorage.getItem('reportMatchIds');
            if (idsFromStorage) {
                matchIdsForReport = JSON.parse(idsFromStorage);
                localStorage.removeItem('reportMatchIds');
            }
        }

        if (matchIdsForReport.length === 0) {
            pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No se especificaron partidos para este reporte.</p>';
            return;
        }

        const { data: freshMatches, error: matchesError } = await supabase
            .from('matches')
            .select(`*, 
                category:category_id(id, name, color), 
                player1:player1_id(*, team:team_id(name, image_url, color)), 
                player2:player2_id(*, team:team_id(name, image_url, color)), 
                winner:winner_id(name)`)
            .in('id', matchIdsForReport);

        if (matchesError) {
            pagesContainer.innerHTML = '<p class="text-center text-red-500 py-10">Error al buscar los datos actualizados de los partidos.</p>';
            return;
        }

        reportData = processMatchesForReport(freshMatches);
        
        btnEditReport.addEventListener('click', toggleEditMode);
        
        document.getElementById('btn-save-pdf').addEventListener('click', () => {
            const element = document.getElementById('report-pages-container'); html2pdf().set({ margin: 0, filename: `reporte_partidos.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).toPdf().get('pdf').then(function (pdf) { const totalPages = pdf.internal.getNumberOfPages(); if (totalPages > 1) { pdf.deletePage(totalPages); } }).save();
        });
        
        document.getElementById('btn-save-report').addEventListener('click', async () => {
            if (!matchIdsForReport || matchIdsForReport.length === 0) return alert('No hay datos de reporte para guardar.');
            const title = prompt('Ingresa un título para guardar este reporte:', 'Reporte de Partidos ' + new Date().toLocaleDateString('es-AR'));
            if (!title) return;
            
            const { error } = await supabase.from('reports').insert({ title: title, report_data: matchIdsForReport });

            if (error) {
                alert('Error al guardar el reporte: ' + error.message);
            } else {
                alert('Reporte guardado con éxito.');
                window.location.href = 'reportes-historicos.html';
            }
        });

        await renderReport();
    }

    initialize();
});