import { renderHeader } from '../common/header.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Renderizar el encabezado de la página
    const header = document.getElementById('header');
    if (header) {
        header.innerHTML = renderHeader();
    }
    
    // 2. Obtener los datos del reporte desde localStorage
    const reportData = JSON.parse(localStorage.getItem('reportMatches') || '[]');
    const reportContent = document.getElementById('report-content');
    
    if (reportData.length === 0) {
        reportContent.innerHTML = '<p class="text-center text-gray-500 py-10">No hay partidos seleccionados para el reporte. Vuelve a la página de partidos y selecciona los que quieras incluir.</p>';
        return;
    }

    // 3. Renderizar cada partido con el formato solicitado
    reportContent.innerHTML = reportData.map(match => {
        const [sede, cancha] = match.location ? match.location.split(' - ') : ['Sede no definida', 'Cancha no definida'];
        
        const p1_class = match.player1.isWinner ? 'text-yellow-600 font-bold' : 'text-gray-800';
        const p2_class = match.player2.isWinner ? 'text-yellow-600 font-bold' : 'text-gray-800';

        return `
        <div class="match-card border border-gray-200 rounded-lg p-5 break-inside-avoid">
            <div class="flex justify-between items-start text-sm text-gray-500 mb-4">
                <div>
                    <p class="font-bold text-lg text-gray-700">${sede || ''}</p>
                    <p>${cancha || ''}</p>
                </div>
                <div class="text-right">
                    <p class="font-semibold">${match.date || ''}</p>
                    <p>${match.time || ''}</p>
                </div>
            </div>

            <div class="grid grid-cols-[1fr,auto,auto,auto,1fr] items-center gap-4 text-center">
                <div class="text-right ${p1_class}">
                    <p class="text-lg">${match.player1.name}</p>
                </div>
                <div class="bg-gray-100 rounded-md px-4 py-2">
                    <p class="text-4xl font-bold ${p1_class}">${match.player1.points}</p>
                </div>

                <div class="font-mono font-bold text-gray-700 text-lg">
                    ${match.sets || '-'}
                </div>

                <div class="bg-gray-100 rounded-md px-4 py-2">
                    <p class="text-4xl font-bold ${p2_class}">${match.player2.points}</p>
                </div>
                <div class="text-left ${p2_class}">
                    <p class="text-lg">${match.player2.name}</p>
                </div>
            </div>

            <div class="text-center text-sm text-gray-500 mt-4 pt-4 border-t">
                <p>Categoría: <span class="font-semibold">${match.category}</span></p>
            </div>
        </div>
        `;
    }).join('');

    // 4. Lógica para el botón de descarga PDF
    const btnSavePdf = document.getElementById('btn-save-pdf');
    btnSavePdf.addEventListener('click', () => {
        const element = document.getElementById('report-container');
        const opt = {
            margin:       0.5,
            filename:     'reporte_partidos.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    });
});