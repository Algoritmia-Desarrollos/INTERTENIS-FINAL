import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';
import { calculatePoints } from './calculatePoints.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ESTADO Y DATOS GLOBALES ---
    let reportData = [];
    let matchIdsForReport = [];
    let allPlayers = [];
    let editMode = null; // Puede ser 'players', 'attendance', o null
    let pristineMatchesData = []; 
    
    // --- ELEMENTOS DEL DOM ---
    const header = document.getElementById('header');
    const pagesContainer = document.getElementById('report-pages-container');
    const defaultButtons = document.getElementById('default-buttons');
    const editModeButtons = document.getElementById('edit-mode-buttons');
    const btnEditPlayers = document.getElementById('btn-edit-players');
    const btnEditAttendance = document.getElementById('btn-edit-attendance');
    const btnSaveChanges = document.getElementById('btn-save-changes');
    const btnCancelChanges = document.getElementById('btn-cancel-changes');
    const btnSaveReport = document.getElementById('btn-save-report');
    
    // --- LÓGICA DE VISIBILIDAD DE BOTONES ---
    function updateButtonVisibility() {
        if (editMode) {
            defaultButtons.classList.add('hidden');
            editModeButtons.classList.remove('hidden');
        } else {
            defaultButtons.classList.remove('hidden');
            editModeButtons.classList.add('hidden');
        }
    }

    async function fetchAllPlayers() {
        const { data, error } = await supabase.from('players').select('id, name, category_id, team_id').order('name');
        if (error) {
            console.error("Error al obtener los jugadores:", error);
            return [];
        }
        return data;
    }

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
                category_id: match.category?.id || null,
                category_color: match.category?.color || '#e5e7eb',
                p1_confirmed: match.p1_confirmed, 
                p2_confirmed: match.p2_confirmed, 
                player1: {
                    id: match.player1?.id, name: match.player1?.name || '', points: p1_points ?? '',
                    isWinner: match.winner_id === match.player1_id || (isDoubles && match.winner_id === match.player3_id),
                    teamColor: match.player1?.team?.color, teamImage: match.player1?.team?.image_url, team_id: match.player1?.team_id
                },
                player2: {
                    id: match.player2?.id, name: match.player2?.name || '', points: p2_points ?? '',
                    isWinner: match.winner_id === match.player2_id || (isDoubles && match.winner_id === match.player4_id),
                    teamColor: match.player2?.team?.color, teamImage: match.player2?.team?.image_url, team_id: match.player2?.team_id
                },
                player3: isDoubles ? { id: match.player3?.id, name: match.player3?.name || '' } : null,
                player4: isDoubles ? { id: match.player4?.id, name: match.player4?.name || '' } : null,
                sets: match.sets || [],
            };
        });
    }

    async function renderReport() {
        if (!document.getElementById('suspended-row-style')) {
            const style = document.createElement('style');
            style.id = 'suspended-row-style';
            style.innerHTML = `.suspended-row td, .suspended-row .font-mono, .suspended-row .pts-col, .suspended-row .cat-col, .suspended-row .player-name, .suspended-row .player-name-right, .suspended-row .player-name-left { color: #ff4444 !important; text-decoration: none !important; } .suspended-row td.font-mono { color: #fff !important; text-decoration: none !important; font-weight: 700; background: #222 !important; }`;
            document.head.appendChild(style);
        }
        pagesContainer.innerHTML = '';
        if (reportData.length === 0) {
            pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte.</p>';
            return;
        }

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
            const headerCell = headerRow.insertCell();
            headerCell.colSpan = 8;
            headerCell.style.cssText = `background-color: ${bgColor}; color: ${textColor}; font-weight: 700; font-size: 11pt; padding: 8px 15px;`;
            headerCell.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;"><span style="text-align: left;">${sede.toUpperCase()}</span><span style="text-align: center; flex-grow: 1; display: inline-block; padding-top:2px; padding-bottom:2px; font-size: 13pt;">${formattedDate}</span></div>`;
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
                    row.style.height = '9mm';
                    const played = Array.isArray(match.sets) && match.sets.length > 0;
                    let player1Content, player2Content;
                    
                    if (editMode === 'players' && !played) {
                        const createPlayerSelect = (playerNumber, selectedPlayerId, opponentIds, teamId, isConfirmed) => {
                            if (isConfirmed) {
                                const playerName = allPlayers.find(p => p.id === selectedPlayerId)?.name || 'Confirmado';
                                return `<span class="player-confirmed" title="Asistencia confirmada, no se puede cambiar el jugador.">${playerName}</span>`;
                            }
                            
                            let availablePlayers = allPlayers;
                            if (match.category === 'Equipos') {
                                availablePlayers = allPlayers.filter(p => p.team_id === teamId);
                            } else {
                                availablePlayers = allPlayers.filter(p => p.category_id === match.category_id);
                            }
                            let options = availablePlayers
                                .filter(p => !opponentIds.includes(p.id)) 
                                .map(p => `<option value="${p.id}" ${p.id === selectedPlayerId ? 'selected' : ''}>${p.name}</option>`)
                                .join('');
                            const style = `width: 100%; border: 1px solid #ccc; background: #f3f4f6; color: #111; font-size: 9pt; padding: 4px; border-radius: 4px; font-weight: 600; margin-bottom: 2px;`;
                            return `<select data-report-index="${match.reportIndex}" data-player-number="${playerNumber}" class="player-select" style="${style}"><option value="">Seleccionar</option>${options}</select>`;
                        };

                        if (match.isDoubles) {
                            const team1_opponents = [match.player2.id, match.player4.id];
                            const team2_opponents = [match.player1.id, match.player3.id];
                            player1Content = `<div>${createPlayerSelect(1, match.player1.id, [match.player3.id, ...team1_opponents], match.player1.team_id, match.p1_confirmed)}</div><div>${createPlayerSelect(3, match.player3.id, [match.player1.id, ...team1_opponents], match.player1.team_id, match.p1_confirmed)}</div>`;
                            player2Content = `<div>${createPlayerSelect(2, match.player2.id, [match.player4.id, ...team2_opponents], match.player2.team_id, match.p2_confirmed)}</div><div>${createPlayerSelect(4, match.player4.id, [match.player2.id, ...team2_opponents], match.player2.team_id, match.p2_confirmed)}</div>`;
                        } else {
                            player1Content = createPlayerSelect(1, match.player1.id, [match.player2.id], match.player1.team_id, match.p1_confirmed);
                            player2Content = createPlayerSelect(2, match.player2.id, [match.player1.id], match.player2.team_id, match.p2_confirmed);
                        }
                    } else {
                        const createPlayerSpan = (player, side, confirmed) => {
                            const classes = editMode === 'attendance' ? 'player-name-clickable' : '';
                            const confirmedClass = confirmed ? 'player-confirmed' : '';
                            const dataAttrs = editMode === 'attendance' ? `data-match-id="${match.id}" data-side="${side}"` : '';
                            return `<span class="${classes} ${confirmedClass}" ${dataAttrs}>${player.name}</span>`;
                        };
                        if (match.isDoubles) {
                            player1Content = `<div>${createPlayerSpan(match.player1, 'p1', match.p1_confirmed)}</div><div>${createPlayerSpan(match.player3, 'p1', match.p1_confirmed)}</div>`;
                            player2Content = `<div>${createPlayerSpan(match.player2, 'p2', match.p2_confirmed)}</div><div>${createPlayerSpan(match.player4, 'p2', match.p2_confirmed)}</div>`;
                        } else {
                            player1Content = createPlayerSpan(match.player1, 'p1', match.p1_confirmed);
                            player2Content = createPlayerSpan(match.player2, 'p2', match.p2_confirmed);
                        }
                    }

                    let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                    if(cancha.match(/\d+/)) cancha = cancha.match(/\d+/)[0];
                    const p1_class = match.player1.isWinner ? 'winner' : '';
                    const p2_class = match.player2.isWinner ? 'winner' : '';
                    let hora = match.time?.substring(0, 5) || '';
                    let setsDisplay = '';
                    if (match.status === 'suspendido') {
                        setsDisplay = `<span style="color:#fff;font-weight:700;text-decoration:none !important;">Suspendido</span>`;
                    } else {
                        setsDisplay = played ? match.sets.map(s => `${s.p1}/${s.p2}`).join(' ') : '';
                    }
                    const p1TeamColor = match.player1.teamColor, p2TeamColor = match.player2.teamColor;
                    const p1TextColor = '#fff', p2TextColor = '#fff';
                    let p1NameStyle = played && !match.player1.isWinner ? 'color:#6b716f;' : '';
                    let p2NameStyle = played && !match.player2.isWinner ? 'color:#6b716f;' : '';
                    let p1PointsDisplay = '', p2PointsDisplay = '';
                    
                    if (played) { 
                        p1PointsDisplay = match.player1.points ?? ''; 
                        if(p1PointsDisplay===0) p1PointsDisplay='0'; 
                        p2PointsDisplay = match.player2.points ?? ''; 
                        if(p2PointsDisplay===0) p2PointsDisplay='0'; 
                    } else { 
                        if (match.player1.teamImage) p1PointsDisplay = `<img src="${match.player1.teamImage}" alt="" style="height: 25px; width: 100%; object-fit: contain; margin: auto; display: block;">`; 
                        if (match.player2.teamImage) p2PointsDisplay = `<img src="${match.player2.teamImage}" alt="" style="height: 25px; width: 100%; object-fit: contain; margin: auto; display: block;">`; 
                    }
                    const canchaBackgroundColor = sede.toLowerCase().trim() === 'centro' ? '#222222' : '#ffc000';
                    const canchaTextColor = sede.toLowerCase().trim() === 'centro' ? '#ffc000' : '#222';
                    const categoryDisplay = match.category === 'Equipos' ? '' : match.category;
                    row.innerHTML = `
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold;">${cancha}</td>
                        <td class="text-center">${hora}</td>
                        <td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${player1Content}</td>
                        <td class="pts-col" style='text-align:center;background:${p1TeamColor || '#3a3838'};color:${p1TextColor};font-weight:700;'>${p1PointsDisplay}</td>
                        <td style='text-align:center;' class="font-mono">${setsDisplay}</td>
                        <td class="pts-col" style='text-align:center;background:${p2TeamColor || '#3a3838'};color:${p2TextColor};font-weight:700;'>${p2PointsDisplay}</td>
                        <td class="font-bold ${p2_class}" style='${p2NameStyle}'>${player2Content}</td>
                        <td class="cat-col" style="color:${match.category_color || '#b45309'};font-family:'Segoe UI Black',Arial,sans-serif;font-weight:900; font-size: 11pt;">${categoryDisplay}</td>
                    `;
                    currentHeight += ROW_HEIGHT_MM;
                }
            }
        }
    }

    async function handleSaveChanges() {
        let updates = [];
        if (editMode === 'players') {
            for (const match of reportData) {
                let updateData = {};
                if (match.player1_id_new) updateData.player1_id = match.player1_id_new;
                if (match.player2_id_new) updateData.player2_id = match.player2_id_new;
                if (match.player3_id_new) updateData.player3_id = match.player3_id_new;
                if (match.player4_id_new) updateData.player4_id = match.player4_id_new;
                if (Object.keys(updateData).length > 0) {
                    updates.push(supabase.from('matches').update(updateData).eq('id', match.id));
                }
            }
        } else if (editMode === 'attendance') {
            for (const match of reportData) {
                const originalMatch = pristineMatchesData.find(m => m.id === match.id);
                if (originalMatch.p1_confirmed !== match.p1_confirmed || originalMatch.p2_confirmed !== match.p2_confirmed) {
                    updates.push(supabase.from('matches').update({ p1_confirmed: match.p1_confirmed, p2_confirmed: match.p2_confirmed }).eq('id', match.id));
                }
            }
        }

        if (updates.length > 0) {
            btnSaveChanges.disabled = true;
            btnSaveChanges.innerHTML = `<div class="spinner"></div> Guardando...`;
            const results = await Promise.all(updates);
            const errors = results.filter(res => res.error);
            if (errors.length > 0) {
                alert(`Hubo un error al actualizar ${errors.length} partido(s).`);
                console.error("Errores de actualización:", errors);
            } else {
                alert(`${updates.length} cambio(s) guardado(s) con éxito.`);
            }
        }
        
        btnSaveChanges.disabled = false;
        btnSaveChanges.innerHTML = `<span class="material-icons">save</span> Guardar Cambios`;
        editMode = null;
        updateButtonVisibility();
        await initialize();
    }
    
    async function initialize() {
        header.innerHTML = renderHeader();
        allPlayers = await fetchAllPlayers();
        const urlParams = new URLSearchParams(window.location.search);
        const reportId = urlParams.get('id');

        if (reportId) {
            btnSaveReport.classList.add('hidden');
            const { data: savedReport, error } = await supabase.from('reports').select('report_data').eq('id', reportId).single();
            if (error || !savedReport) {
                pagesContainer.innerHTML = `<p class="text-center text-red-500 py-10">No se pudo cargar el reporte guardado.</p>`;
                return;
            }
            matchIdsForReport = savedReport.report_data || [];
        } else {
            const idsFromStorage = sessionStorage.getItem('reportMatchIds');
            if (idsFromStorage) matchIdsForReport = JSON.parse(idsFromStorage);
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
                player3:player3_id(*, team:team_id(name, image_url, color)),
                player4:player4_id(*, team:team_id(name, image_url, color)),
                winner:winner_id(name)`)
            .in('id', matchIdsForReport);

        if (matchesError) {
            pagesContainer.innerHTML = `<p class="text-center text-red-500 py-10">Error al buscar los datos actualizados de los partidos.</p>`;
            return;
        }
        pristineMatchesData = freshMatches;
        reportData = processMatchesForReport(freshMatches);
        await renderReport();
    }
    
    btnEditPlayers.addEventListener('click', () => {
        editMode = 'players';
        updateButtonVisibility();
        renderReport();
    });
    btnEditAttendance.addEventListener('click', () => {
        editMode = 'attendance';
        updateButtonVisibility();
        renderReport();
    });
    btnCancelChanges.addEventListener('click', () => {
        editMode = null;
        reportData = processMatchesForReport(pristineMatchesData);
        updateButtonVisibility();
        renderReport();
    });
    btnSaveChanges.addEventListener('click', handleSaveChanges);

    pagesContainer.addEventListener('change', (e) => {
        if (editMode === 'players' && e.target.classList.contains('player-select')) {
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
            }
        }
    });

    pagesContainer.addEventListener('click', (e) => {
        if (editMode === 'attendance' && e.target.classList.contains('player-name-clickable')) {
            const span = e.target;
            const matchId = parseInt(span.dataset.matchId, 10);
            const side = span.dataset.side;
            const matchIndex = reportData.findIndex(m => m.id === matchId);
            if (matchIndex === -1) return;
            const fieldToUpdate = `${side}_confirmed`;
            const newStatus = !reportData[matchIndex][fieldToUpdate];
            reportData[matchIndex][fieldToUpdate] = newStatus;
            const playerSpans = pagesContainer.querySelectorAll(`.player-name-clickable[data-match-id="${matchId}"][data-side="${side}"]`);
            playerSpans.forEach(s => s.classList.toggle('player-confirmed', newStatus));
        }
    });
    
    document.getElementById('btn-save-pdf').addEventListener('click', () => {
        const element = document.getElementById('report-pages-container'); html2pdf().set({ margin: 0, filename: `reporte_partidos.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).toPdf().get('pdf').then(function (pdf) { const totalPages = pdf.internal.getNumberOfPages(); if (totalPages > 1) { pdf.deletePage(totalPages); } }).save();
    });
    btnSaveReport.addEventListener('click', async () => {
        if (!matchIdsForReport || matchIdsForReport.length === 0) return alert('No hay datos de reporte para guardar.');
        const title = prompt('Ingresa un título para guardar este reporte:', 'Reporte de Partidos ' + new Date().toLocaleDateString('es-AR'));
        if (!title) return;
        const { data, error } = await supabase.from('reports').insert({ title: title, report_data: matchIdsForReport }).select('id').single();
        if (error) {
            alert('Error al guardar el reporte: ' + error.message);
        } else {
            alert('Reporte guardado con éxito. Redirigiendo...');
            window.location.href = `reportes.html?id=${data.id}`;
        }
    });

    initialize();
});