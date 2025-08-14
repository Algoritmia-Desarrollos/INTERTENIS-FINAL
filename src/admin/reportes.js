// src/admin/reportes.js
// Este script recibe los partidos seleccionados desde matches.js y los muestra en la página de reportes

document.addEventListener('DOMContentLoaded', () => {
    const header = document.getElementById('header');
    if (header && typeof renderHeader === 'function') {
        header.innerHTML = renderHeader();
    }
    
    // Obtener los partidos seleccionados desde localStorage
    const reportData = JSON.parse(localStorage.getItem('reportMatches') || '[]');
    const reportContent = document.getElementById('report-content');
    if (reportData.length === 0) {
        reportContent.innerHTML = '<p>No hay partidos seleccionados para el reporte.</p>';
        return;
    }
    // Renderizar tabla de partidos
    let html = `<table><thead><tr><th>Fecha y Hora</th><th>Cancha</th><th>Jugador A</th><th>Puntos A</th><th>Resultado</th><th>Puntos B</th><th>Jugador B</th><th>Categoría</th></tr></thead><tbody>`;
    for (const match of reportData) {
        html += `<tr>
            <td>${match.fechaHora || ''}</td>
            <td>${match.cancha || ''}</td>
            <td>${match.jugadorA || ''}</td>
            <td>${match.puntosA ?? ''}</td>
            <td>${match.resultado || ''}</td>
            <td>${match.puntosB ?? ''}</td>
            <td>${match.jugadorB || ''}</td>
            <td>${match.categoria || ''}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    reportContent.innerHTML = html;
});
