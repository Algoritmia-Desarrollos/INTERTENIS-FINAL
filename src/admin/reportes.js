import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Renderizar el encabezado (se ocultará al imprimir)
    document.getElementById('header').innerHTML = renderHeader();
    

    // 2. Obtener y procesar los datos de los partidos
    const reportData = JSON.parse(localStorage.getItem('reportMatches') || '[]');
    const pagesContainer = document.getElementById('report-pages-container');

    // Obtener todos los equipos y sus colores
    const { data: teamsData, error: teamsError } = await supabase.from('teams').select('name,color');
    const teamColorMap = {};
    if (!teamsError && Array.isArray(teamsData)) {
        teamsData.forEach(t => {
            if (t.name && t.color) teamColorMap[t.name.trim().toLowerCase()] = t.color;
        });
    }

    if (reportData.length === 0) {
        pagesContainer.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte. Vuelve a la página anterior y selecciona los que desees incluir.</p>';
        return;
    }

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
    const PADDING_MM = 20 * 2;
    const HEADER_HEIGHT_MM = 25;
    const TABLE_HEADER_HEIGHT_MM = 10;
    const ROW_HEIGHT_MM = 8;
    const SECTION_HEADER_HEIGHT_MM = 15;
    
    const maxContentHeight = A4_PAGE_HEIGHT_MM - PADDING_MM - HEADER_HEIGHT_MM;
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

    let container = createNewPage();

    for (const date of sortedDates) {
        const sedes = groupedMatches[date];
        const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        for (const sede in sedes) {
            const matches = sedes[sede];
            const neededHeightForSection = SECTION_HEADER_HEIGHT_MM + TABLE_HEADER_HEIGHT_MM + ROW_HEIGHT_MM;

            if (currentHeight + neededHeightForSection > maxContentHeight) {
                pageCount++;
                container = createNewPage();
            }

            // Div de separación vacío para mantener el espaciado
            const sectionTitle = document.createElement('div');
            // Reducir a la mitad el espacio vertical (antes mb-2 mt-4)
            sectionTitle.className = 'flex items-center gap-4 mb-1 mt-2';
            sectionTitle.innerHTML = `<span class=\"text-lg font-semibold text-black-600\">&nbsp;</span>`;
            container.appendChild(sectionTitle);
            currentHeight += SECTION_HEADER_HEIGHT_MM / 2;

            let table = document.createElement('table');
            table.className = 'report-table';
            // Fila superior solo con sede, sin fecha
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = `<td colspan="8" style="background:#ffc000;color:#222;font-weight:700;font-size:1.1em;padding:8px 0;text-align:center;border-bottom:2px solid #888;">Sede: ${sede}</td>`;
            const tbodyEl = document.createElement('tbody');
            tbodyEl.appendChild(headerRow);
            table.appendChild(tbodyEl);
            container.appendChild(table);
            let tbody = table.querySelector('tbody');
            
            for (const match of matches) {
                if (currentHeight + ROW_HEIGHT_MM > maxContentHeight) {
                    pageCount++;
                    container = createNewPage();
                    
                    const newSectionTitle = sectionTitle.cloneNode(true);
                    newSectionTitle.querySelector('span').textContent = `| Sede: ${sede} (cont.)`;
                    container.appendChild(newSectionTitle);
                    currentHeight += SECTION_HEADER_HEIGHT_MM;

                    table = document.createElement('table');
                    table.className = 'report-table';
                    // Fila superior con día y sede también en las tablas continuadas
                    const headerRow2 = document.createElement('tr');
                    headerRow2.innerHTML = `<td colspan="8" style="background:#ffc000;color:#222;font-weight:700;font-size:1.1em;padding:8px 0;text-align:center;border-bottom:2px solid #888;">${formattedDate} | Sede: ${sede} (cont.)</td>`;
                    const tbodyEl2 = document.createElement('tbody');
                    tbodyEl2.appendChild(headerRow2);
                    table.appendChild(tbodyEl2);
                    container.appendChild(table);
                    tbody = table.querySelector('tbody');
                }

                let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                // Si el valor es tipo 'Cancha 2', extraer solo el número
                if (typeof cancha === 'string') {
                    const matchNum = cancha.match(/\d+/);
                    if (matchNum) cancha = matchNum[0];
                }
                const p1_class = match.player1.isWinner ? 'winner' : '';
                const p2_class = match.player2.isWinner ? 'winner' : '';
                let hora = match.time || '';
                if (hora && hora.length >= 5) hora = hora.substring(0, 5);

                const row = tbody.insertRow();
                const catColor = match.category_color || '#b45309';
                    // Reemplazar '-' por '/' en el resultado de sets, sin espacios
                    let setsDisplay = (match.sets || '').replace(/\s*-\s*/g, '/');
                    // Si hay varios sets, separarlos por espacio, no coma, y siempre usar '/'
                    if (Array.isArray(match.sets)) {
                        setsDisplay = match.sets.map(s => `${s.p1}/${s.p2}`).join(' ');
                    } else if (typeof match.sets === 'string') {
                        // Reemplazar cualquier '-' por '/' y comas por espacio
                        setsDisplay = match.sets.replace(/\s*-\s*/g, '/').split(',').map(s => s.trim()).join(' ');
                    }
                    // Colores de equipos desde la base
                    function getTeamColor(name) {
                        if (!name) return '';
                        const n = name.trim().toLowerCase();
                        return teamColorMap[n] || '';
                    }
                    function isColorLight(hex) {
                        if (!hex) return false;
                        let c = hex.replace('#', '');
                        if (c.length === 3) c = c.split('').map(x => x + x).join('');
                        const r = parseInt(c.substr(0,2),16);
                        const g = parseInt(c.substr(2,2),16);
                        const b = parseInt(c.substr(4,2),16);
                        // Percepción de luminosidad
                        return (0.299*r + 0.587*g + 0.114*b) > 186;
                    }
                    const p1TeamColor = match.player1.teamColor;
                    const p2TeamColor = match.player2.teamColor;
                    const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                    const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';
                    // Determinar si el partido se jugó (hay sets cargados)
                    const played = !!(match.sets && match.sets.trim() !== '');
                    let p1NameStyle = '';
                    let p2NameStyle = '';
                    if (played) {
                        if (!match.player1.isWinner) p1NameStyle = 'color:#6b716f;';
                        if (!match.player2.isWinner) p2NameStyle = 'color:#6b716f;';
                    }
                    row.innerHTML = `<td style='width:54px;min-width:54px;max-width:54px;text-align:center;'>${cancha}</td><td class="text-center">${hora}</td><td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${match.player1.name}</td><td class="pts-col" style='text-align:center;background:${p1TeamColor || '#3a3838'};color:#f2bb03;font-weight:bold;'>${match.player1.points}</td><td style='text-align:center;' class="font-mono">${setsDisplay}</td><td class="pts-col" style='text-align:center;background:${p2TeamColor || '#3a3838'};color:#f2bb03;font-weight:bold;'>${match.player2.points}</td><td class="font-bold ${p2_class}" style='${p2NameStyle}'>${match.player2.name}</td><td class="cat-col" style="text-align:center;margin:auto;color:${catColor};font-family:'Segoe UI Black','Arial Black',Arial,sans-serif;font-weight:900;letter-spacing:0.5px;">${match.category}</td>`;
row.innerHTML = `<td style='width:54px;min-width:54px;max-width:54px;text-align:center;'>${cancha}</td><td class="text-center">${hora}</td><td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${match.player1.name}</td><td class="pts-col" style='text-align:center;background:${p1TeamColor};color:${p1TextColor};font-weight:700;'>${match.player1.points}</td><td style='text-align:center;' class="font-mono">${setsDisplay}</td><td class="pts-col" style='text-align:center;background:${p2TeamColor};color:${p2TextColor};font-weight:700;'>${match.player2.points}</td><td class="font-bold ${p2_class}" style='${p2NameStyle}'>${match.player2.name}</td><td class="cat-col" style="text-align:center;margin:auto;color:${catColor};font-family:'Segoe UI Black','Arial Black',Arial,sans-serif;font-weight:900;letter-spacing:0.5px;">${match.category}</td>`;
                currentHeight += ROW_HEIGHT_MM;
            }
        }
    }

    // 5. Lógica para los botones de acción
    document.getElementById('btn-save-pdf').addEventListener('click', () => {
        const element = document.getElementById('report-pages-container');
        const opt = {
            margin: 0,
            filename: `reporte_partidos_${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    });

    document.getElementById('btn-save-report').addEventListener('click', async () => {
        if (!reportData || reportData.length === 0) {
            alert('No hay datos de reporte para guardar.');
            return;
        }
        const title = prompt('Ingresa un título para guardar este reporte:', 'Reporte de Partidos ' + new Date().toLocaleDateString('es-AR'));
        if (!title) return;
        
        const { error } = await supabase.from('reports').insert({
            title: title,
            report_data: reportData // 'report_data' debe ser el nombre de tu columna JSON en Supabase
        });

        if (error) {
            alert('Error al guardar el reporte: ' + error.message);
        } else {
            alert('Reporte guardado con éxito.');
            window.location.href = 'reportes-historicos.html';
        }
    });
});