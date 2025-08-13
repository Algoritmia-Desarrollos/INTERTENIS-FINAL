import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../../supabase.js'; // <-- ¡RUTA CORREGIDA!

// 1. Proteger la página para que solo los administradores puedan acceder.
requireRole('admin');

// --- Carga Inicial de la Página ---
document.addEventListener('DOMContentLoaded', async () => {
    // 2. Renderizar el encabezado común
    document.getElementById('header').innerHTML = renderHeader();
    
    // 3. Cargar y mostrar los datos del dashboard
    await loadDashboardData();
});

// --- Función Principal para Cargar Datos ---
async function loadDashboardData() {
    const summaryContainer = document.getElementById('dashboard-summary');
    const matchesContainer = document.getElementById('matches-container');

    summaryContainer.innerHTML = '<p>Cargando estadísticas...</p>';
    matchesContainer.innerHTML = '<p>Cargando partidos...</p>';

    // Cargar los datos en paralelo para mayor eficiencia
    const [
        { count: tournamentCount },
        { count: playerCount },
        { count: matchCount },
        { data: lastMatches, error: matchesError }
    ] = await Promise.all([
        supabase.from('tournaments').select('*', { count: 'exact', head: true }),
        supabase.from('players').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select(`*, player1:player1_id(name), player2:player2_id(name), winner:winner_id(name)`).order('match_date', { ascending: false }).limit(5)
    ]);

    // Renderizar las tarjetas de resumen
    summaryContainer.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4">
            <span class="material-icons text-4xl text-teal-500">emoji_events</span>
            <div>
                <p class="text-gray-500">Torneos Activos</p>
                <p class="text-2xl font-bold">${tournamentCount ?? 0}</p>
            </div>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4">
            <span class="material-icons text-4xl text-teal-500">groups</span>
            <div>
                <p class="text-gray-500">Jugadores Registrados</p>
                <p class="text-2xl font-bold">${playerCount ?? 0}</p>
            </div>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4">
            <span class="material-icons text-4xl text-teal-500">sports_tennis</span>
            <div>
                <p class="text-gray-500">Partidos Jugados</p>
                <p class="text-2xl font-bold">${matchCount ?? 0}</p>
            </div>
        </div>
    `;

    // Renderizar la tabla de últimos partidos
    if (matchesError || lastMatches.length === 0) {
        matchesContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay partidos registrados.</p>';
        return;
    }

    matchesContainer.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugadores</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Ganador</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${lastMatches.map(match => `
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 whitespace-nowrap text-sm">${new Date(match.match_date).toLocaleDateString('es-AR')}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm">${match.player1.name} vs ${match.player2.name}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold">${match.winner?.name || 'Pendiente'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}