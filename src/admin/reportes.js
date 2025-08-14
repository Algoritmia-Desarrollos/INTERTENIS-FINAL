import { renderHeader } from '../common/header.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Renderizar el encabezado (se ocultará al imprimir)
    document.getElementById('header').innerHTML = renderHeader();
    
    // 2. Obtener y procesar los datos de los partidos
    const reportData = JSON.parse(localStorage.getItem('reportMatches') || '[]');
    const reportContent = document.getElementById('report-content');
    
    if (reportData.length === 0) {
        reportContent.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos para el reporte. Vuelve a la página anterior y selecciona los que desees incluir.</p>';
        return;
    }

    // 3. Agrupar partidos por fecha y luego por sede
    const groupedMatches = reportData.reduce((acc, match) => {
        const date = match.date;
        const sede = match.location ? match.location.split(' - ')[0] : 'Sede no definida';
        
        if (!acc[date]) {
            acc[date] = {};
        }
        if (!acc[date][sede]) {
            acc[date][sede] = [];
        }
        acc[date][sede].push(match);
        return acc;
    }, {});

    // Ordenar las fechas
    const sortedDates = Object.keys(groupedMatches).sort((a, b) => new Date(a) - new Date(b));

    // 4. Renderizar el contenido agrupado
    let finalHtml = '';
    for (const date of sortedDates) {
        const sedes = groupedMatches[date];
        const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        for (const sede in sedes) {
            // Fecha y sede en la misma línea
            finalHtml += `<div class="flex items-center gap-4 mb-2 mt-8">
                <h2 class="text-2xl font-bold text-gray-800 capitalize">${formattedDate}</h2>
                <span class="text-lg font-semibold text-gray-700">| Sede: ${sede}</span>
            </div>`;
            finalHtml += `
                <div class="overflow-x-auto">
                    <table class="min-w-full table-fixed">
                        <colgroup>
                            <col style="width: 100px;">
                            <col style="width: 100px;">
                            <col style="width: 180px;">
                            <col style="width: 60px;">
                            <col style="width: 120px;">
                            <col style="width: 60px;">
                            <col style="width: 180px;">
                            <col style="width: 80px;">
                        </colgroup>
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cancha</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Hora</th>
                                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Jugador 1</th>
                                <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Pts</th>
                                <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Resultado</th>
                                <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Pts</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador 2</th>
                                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">CATEGO.</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
            `;
            
            sedes[sede].forEach(match => {
                const cancha = match.location ? match.location.split(' - ')[1] : 'N/A';
                const p1_class = match.player1.isWinner ? 'text-yellow-600 font-bold' : 'text-gray-700';
                const p2_class = match.player2.isWinner ? 'text-yellow-600 font-bold' : 'text-gray-700';
                // Formatear hora solo HH:mm
                let hora = match.time || '';
                if (hora && hora.length >= 5) hora = hora.substring(0,5);

                finalHtml += `
                    <tr>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">${cancha}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">${hora}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap text-right ${p1_class}">
                            <span>${match.player1.name}</span>
                            ${match.player1.image ? `<img src="${match.player1.image}" alt="logo" class="inline-block h-5 w-5 rounded-full object-cover ml-1 align-middle" style="vertical-align:middle;">` : ''}
                        </td>
                        <td class="px-3 py-3 text-2xl font-black text-center ${p1_class}">${match.player1.points}</td>
                        <td class="px-3 py-3 text-base font-mono font-bold text-center text-gray-800">${match.sets}</td>
                        <td class="px-3 py-3 text-2xl font-black text-center ${p2_class}">${match.player2.points}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap text-left ${p2_class}">
                            ${match.player2.image ? `<img src="${match.player2.image}" alt="logo" class="inline-block h-5 w-5 rounded-full object-cover mr-1 align-middle" style="vertical-align:middle;">` : ''}
                            <span>${match.player2.name}</span>
                        </td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap text-gray-500 text-center">${match.category}</td>
                    </tr>
                `;
            });

            finalHtml += `</tbody></table></div>`;
        }
    }
    reportContent.innerHTML = finalHtml;


    // 5. Lógica para descargar PDF
    document.getElementById('btn-save-pdf').addEventListener('click', () => {
        const element = document.getElementById('report-container');
        const opt = {
            margin:       0.5,
            filename:     `reporte_partidos_${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    });
});