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
                <col style="width: 6%">
                <col style="width: 9%">
                <col style="width: 25%">
                <col style="width: 6%">
                <col style="width: 18%">
                <col style="width: 6%">
                <col style="width: 25%">
                <col style="width: 5%">
            </colgroup>
        `;
        container.appendChild(table);
        return table;
    }

    function createHeaderRow(tbody, sede, formattedDate) {
        const headerRow = tbody.insertRow();
        headerRow.className = 'date-header-row';

        let bgColor, textColor;

        if (sede.toLowerCase().trim() === 'centro') {
            bgColor = '#111111'; 
            textColor = '#ffc000';
        } else { 
            bgColor = '#fdc100'; 
            textColor = '#000000';
        }

        const headerCell = headerRow.insertCell();
        headerCell.colSpan = 8; 
        
        // --- CÓDIGO CORREGIDO ---
        // Se aplica el estilo con !important para asegurar que sobreescriba
        // cualquier otra regla del archivo HTML.
        headerCell.style.cssText = `
            background-color: ${bgColor} !important; 
            color: ${textColor} !important;
            font-weight: 700;
            font-size: 11pt;
            padding: 8px 15px;
        `;
        
        headerCell.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="text-align: left;">${sede.toUpperCase()}</span>
                <span style="text-align: center; flex-grow: 1;">${formattedDate}</span>
            </div>
        `;
    }

    let container = createNewPage();

    for (const date of sortedDates) {
        const sedes = groupedMatches[date];
        
        const dateObj = new Date(date + 'T00:00:00');
        const weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
        const day = dateObj.getDate();
        const month = dateObj.toLocaleDateString('es-AR', { month: 'long' });
        let formattedDate = `${weekday} ${day} de ${month}`;
        formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
        
        for (const sede in sedes) {
            const matches = sedes[sede];
            
            if (currentHeight > 0 && (currentHeight + SPACER_HEIGHT_MM + HEADER_ROW_HEIGHT_MM + ROW_HEIGHT_MM > maxContentHeight)) {
                pageCount++;
                container = createNewPage();
            }

            if (container.children.length > 0) {
                 const spacer = document.createElement('div');
                 spacer.style.height = '20px';
                 container.appendChild(spacer);
                 currentHeight += SPACER_HEIGHT_MM;
            }

            const table = createTable(container);
            let tbody = table.createTBody();
            
            createHeaderRow(tbody, sede, formattedDate);
            currentHeight += HEADER_ROW_HEIGHT_MM;
            
            for (const match of matches) {
                if (currentHeight + ROW_HEIGHT_MM > maxContentHeight) {
                    pageCount++;
                    container = createNewPage();
                    
                    const newTable = createTable(container);
                    tbody = newTable.createTBody();

                    createHeaderRow(tbody, sede, `${formattedDate} (cont.)`);
                    currentHeight = HEADER_ROW_HEIGHT_MM;
                }

                let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
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
                // Reemplaza guiones por / y luego comas por espacio
                const setsDisplay = (match.sets || '').replace(/\s*-\s*/g, '/').replace(/,\s*/g, ' ');

                function isColorLight(hex) {
                    if (!hex) return false;
                    let c = hex.replace('#', '');
                    if (c.length === 3) c = c.split('').map(x => x + x).join('');
                    const r = parseInt(c.substr(0,2),16);
                    const g = parseInt(c.substr(2,2),16);
                    const b = parseInt(c.substr(4,2),16);
                    return (0.299*r + 0.587*g + 0.114*b) > 186;
                }

                const p1TeamColor = match.player1.teamColor;
                const p2TeamColor = match.player2.teamColor;
                const p1TextColor = isColorLight(p1TeamColor) ? '#222' : '#fff';
                const p2TextColor = isColorLight(p2TeamColor) ? '#222' : '#fff';

                const played = !!(match.sets && match.sets.trim() !== '');
                let p1NameStyle = played && !match.player1.isWinner ? 'color:#6b716f;' : '';
                let p2NameStyle = played && !match.player2.isWinner ? 'color:#6b716f;' : '';
                
                row.innerHTML = `
                    <td>${cancha}</td>
                    <td class="text-center">${hora}</td>
                    <td class="text-right font-bold ${p1_class}" style='${p1NameStyle}'>${match.player1.name}</td>
                    <td class="pts-col" style='text-align:center;background:${p1TeamColor || '#3a3838'};color:${p1TextColor};font-weight:700;'>${match.player1.points}</td>
                    <td style='text-align:center;' class="font-mono">${setsDisplay}</td>
                    <td class="pts-col" style='text-align:center;background:${p2TeamColor || '#3a3838'};color:${p2TextColor};font-weight:700;'>${match.player2.points}</td>
                    <td class="font-bold ${p2_class}" style='${p2NameStyle}'>${match.player2.name}</td>
                    <td class="cat-col" style="color:${catColor};font-family:'Segoe UI Black',Arial,sans-serif;font-weight:900;">${match.category}</td>
                `;
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
            report_data: reportData
        });

        if (error) {
            alert('Error al guardar el reporte: ' + error.message);
        } else {
            alert('Reporte guardado con éxito.');
            window.location.href = 'reportes-historicos.html';
        }
    });
});