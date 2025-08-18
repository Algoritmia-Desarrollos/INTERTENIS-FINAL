import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
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

            const sectionTitle = document.createElement('div');
            sectionTitle.className = 'flex items-center gap-4 mb-2 mt-4';
            sectionTitle.innerHTML = `<h2 class="text-xl font-bold text-gray-800 capitalize">${formattedDate}</h2><span class="text-lg font-semibold text-gray-700">| Sede: ${sede}</span>`;
            container.appendChild(sectionTitle);
            currentHeight += SECTION_HEADER_HEIGHT_MM;

            let table = document.createElement('table');
            table.className = 'report-table';
            table.innerHTML = `<colgroup>
                <col style="width: 40px; text-align: center;">
                <col>
                <col>
                <col>
                <col>
                <col>
                <col>
                <col style="width: 40px;">
            </colgroup>
            <thead><tr>
                <th class="text-center">Cancha</th>
                <th class="text-left">Hora</th>
                <th class="text-right">Jugador 1</th>
                <th class="text-center">Pts</th>
                <th class="text-center">Resultado</th>
                <th class="text-center">Pts</th>
                <th class="text-right">Jugador 2</th>
                <th class="text-center">Cat.</th>
            </tr></thead><tbody></tbody>`;
            container.appendChild(table);
            let tbody = table.querySelector('tbody');
            currentHeight += TABLE_HEADER_HEIGHT_MM;
            
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
                    table.innerHTML = `<thead><tr><th>Cancha</th><th>Hora</th><th class="text-right">Jugador 1</th><th class="text-center">Pts</th><th class="text-center">Resultado</th><th class="text-center">Pts</th><th>Jugador 2</th><th class="text-center">Categoría</th></tr></thead><tbody></tbody>`;
                    container.appendChild(table);
                    tbody = table.querySelector('tbody');
                    currentHeight += TABLE_HEADER_HEIGHT_MM;
                }

                let cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                if (cancha && cancha.toLowerCase().startsWith('cancha ')) {
                    cancha = cancha.replace(/cancha\s*/i, '');
                }
                const p1_class = match.player1.isWinner ? 'winner' : '';
                const p2_class = match.player2.isWinner ? 'winner' : '';
                let hora = match.time || '';
                if (hora && hora.length >= 5) hora = hora.substring(0, 5);

                const row = tbody.insertRow();
                function getTeamBgFromName(name) {
                    if (!name) return '';
                    const t = name.toLowerCase();
                    if (t.includes('lakemo')) return 'background:#ffe066; color:#222;';
                    if (t.includes('melabanko')) return 'background:#e8593b; color:#fff;';
                    if (t.includes('muro')) return 'background:#444; color:#fff;';
                    if (t.includes('nunkafuera')) return 'background:#5cb85c; color:#fff;';
                    return '';
                }
                row.innerHTML = `
                    <td class="text-center" style="text-align:center;">${cancha}</td>
                    <td class="text-left">${hora}</td>
                    <td class="text-right font-bold ${p1_class}">${match.player1.name}</td>
                    <td class="text-center font-bold ${p1_class}" style="text-align:center;${getTeamBgFromName(match.player1.team || match.player1.team_name)}">${match.player1.points}</td>
                    <td class="text-center font-mono" style="text-align:center;">${match.sets}</td>
                    <td class="text-center font-bold ${p2_class}" style="text-align:center;${getTeamBgFromName(match.player2.team || match.player2.team_name)}">${match.player2.points}</td>
                    <td class="text-right font-bold ${p2_class}">${match.player2.name}</td>
                    <td class="text-center"><span class='inline-flex items-center justify-center w-7 h-7 rounded-full align-middle font-extrabold text-xs' style='background:transparent; color:${match.category_color || '#e5e7eb'};'>${match.category}</span></td>
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