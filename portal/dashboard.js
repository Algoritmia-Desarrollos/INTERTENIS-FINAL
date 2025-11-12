// Ruta: portal/dashboard.js

import { supabase } from '../src/common/supabase.js';
// import { calculatePoints } from '../src/admin/calculatePoints.js'; // ELIMINADO
import { renderMatchesTable } from '../src/common/components/matchesTable.js'; // AÑADIDO
import { requirePlayer, getPlayer } from './portal_router.js';
import { renderPortalHeader } from './portal_header.js';

// --- PROTEGER PÁGINA ---
requirePlayer();

// --- ELEMENTOS DEL DOM ---
const headerContainer = document.getElementById('header');
const profileContainer = document.getElementById('player-profile-container');
// const availabilityContainer = document.getElementById('availability-link-container'); // <-- ELIMINADO
const pendingContainer = document.getElementById('pending-matches-container');
const historyContainer = document.getElementById('history-matches-container');

// --- HELPER DE COLOR (ELIMINADO) ---
/*
function isColorLight(hex) {
    // ... (código eliminado)
}
*/

// --- Funciones para chequear disponibilidad ---

/**
 * Función auxiliar para obtener el Lunes de la semana de una fecha dada.
 */
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0); // Establecer al inicio del día
  return monday;
}

/**
 * Renderiza el botón de disponibilidad según si el jugador ya cargó o no.
 * @param {number} entryCount - 0 si no cargó, >0 si ya cargó.
 * @param {boolean} hasError - true si hubo un error al chequear.
 */
function renderAvailabilityPrompt(entryCount, hasError = false) {
    const container = document.getElementById('availability-prompt-card-container');
    if (!container) return; 

    if (hasError) {
        container.innerHTML = `<p class="text-red-500">No se pudo verificar tu disponibilidad.</p>`;
        return;
    }

    if (entryCount > 0) {
        // El jugador YA cargó. Mostrar un link normal.
        // --- INICIO DE LA MODIFICACIÓN: Clases responsive ---
        container.innerHTML = `
            <a href="/portal/disponibilidad.html" class="btn btn-primary !py-3 !px-4 text-sm sm:text-lg sm:!px-6 whitespace-nowrap">
                <span class="material-icons mr-2">edit_calendar</span>
                Ver/Editar mi Disponibilidad
            </a>
        `;
        // --- FIN DE LA MODIFICACIÓN ---
    } else {
        // El jugador NO cargó. Mostrar un link "incitador".
        // --- INICIO DE LA MODIFICACIÓN: Clases responsive ---
        container.innerHTML = `
            <a href="/portal/disponibilidad.html" class="btn btn-primary !py-3 !px-4 text-sm sm:text-lg sm:!py-4 sm:!px-8 whitespace-nowrap animate-pulse">
                <span class="material-icons mr-2">calendar_today</span>
                ¡Cargá tu Disponibilidad para esta semana!
            </a>
        `;
        // --- FIN DE LA MODIFICACIÓN ---
    }
}

/**
 * Chequea en Supabase si el jugador tiene entradas de disponibilidad
 * (creadas por 'player') para la semana en curso.
 */
async function checkCurrentWeekAvailability(playerId) {
    const currentMonday = getStartOfWeek(new Date());
    const allTargetDates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentMonday.getTime() + i * 24 * 60 * 60 * 1000);
        allTargetDates.push(date.toISOString().split('T')[0]);
    }

    const { data, error } = await supabase
        .from('player_availability')
        .select('available_date') 
        .eq('player_id', playerId)
        .in('available_date', allTargetDates)
        .eq('source', 'player'); 
    
    if (error) {
         console.error("Error chequeando disponibilidad:", error);
         renderAvailabilityPrompt(0, true); 
         return;
    }
    
    renderAvailabilityPrompt(data.length, false);
}


/**
 * Carga todos los datos del dashboard del jugador
 */
async function loadDashboardData() {
    // 1. Renderizar el header
    headerContainer.innerHTML = renderPortalHeader();

    // 2. Obtener el perfil del jugador
    const player = getPlayer();
    if (!player) {
        profileContainer.innerHTML = '<p class="text-red-500 text-center">Error al cargar el perfil del jugador.</p>';
        return;
    }

    // 3. Renderizar el perfil del jugador
    renderPlayerProfile(player);

    // 4. Chequear disponibilidad de la semana actual
    checkCurrentWeekAvailability(player.id); 

    // 5. Buscar los partidos del jugador
    const { data: matches, error } = await supabase
        .from('matches')
        .select(`
            *, 
            status, 
            tournament:tournament_id(name), 
            category:category_id(name, color), 
            player1:player1_id(id, name, team:team_id(color, image_url)), 
            player2:player2_id(id, name, team:team_id(color, image_url)), 
            player3:player3_id(id, name), 
            player4:player4_id(id, name), 
            winner:winner_id(id, name)
        `)
        .or(`player1_id.eq.${player.id},player2_id.eq.${player.id},player3_id.eq.${player.id},player4_id.eq.${player.id}`)
        .order('match_date', { ascending: true });

    if (error) {
        console.error("Error fetching matches:", error);
        pendingContainer.innerHTML = '<p class="text-red-500 text-center">Error al cargar partidos.</p>';
        historyContainer.innerHTML = '<p class="text-red-500 text-center">Error al cargar historial.</p>';
        return;
    }

    const allMatches = matches || [];
    const today = new Date().setHours(0, 0, 0, 0);

    // 6. Filtrar partidos pendientes vs historial
    const pendingMatches = allMatches.filter(m => !m.winner_id && (new Date(m.match_date) >= today));
    const matchHistory = allMatches.filter(m => !!m.winner_id).reverse();

    // 7. Renderizar las tablas de partidos (usando la función importada)
    renderMatchesTable(pendingMatches, pendingContainer, 'No tienes partidos pendientes.');
    renderMatchesTable(matchHistory, historyContainer, 'Aún no has jugado partidos.');

    // 8. Calcular y mostrar estadísticas en el perfil
    const stats = calculatePlayerStats(player.id, matchHistory);
    document.getElementById('stat-pj').textContent = stats.pj;
    document.getElementById('stat-pg').textContent = stats.pg;
    document.getElementById('stat-pp').textContent = stats.pp;
    document.getElementById('stat-efectividad').textContent = stats.efectividad + '%';
}

/**
 * Renderiza la tarjeta de perfil del jugador
 */
function renderPlayerProfile(player) {
    profileContainer.innerHTML = `
        <div class="bg-[#222222] p-4 sm:p-6 rounded-xl shadow-lg">
            <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <img src="${player.team?.image_url || 'https://via.placeholder.com/80'}" alt="Logo" class="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border-4 border-gray-700 flex-shrink-0">
                <div class="flex-grow w-full text-center sm:text-left">
                    <h1 class="text-3xl sm:text-4xl font-bold text-gray-100">${player.name}</h1>
                    <p class="text-md text-gray-400">${player.category?.name || 'Sin Categoría'} | ${player.team?.name || 'Sin Equipo'}</p>
                </div>
                
                <div class="flex-shrink-0 flex flex-col gap-2 w-full sm:w-auto">
                    <a href="/portal/ranking.html" class="btn btn-secondary !py-2 !px-4 text-sm w-full">
                        <span class="material-icons !text-sm">leaderboard</span>
                        Ver Mi Ranking
                    </a>
                    
                </div>
            </div>
            
            <div id="availability-prompt-card-container" class="mt-6 text-center border-t border-gray-700 pt-6">
                 <div class="h-20 flex justify-center items-center"><div class="spinner"></div></div>
            </div>

            <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div class="bg-gray-800 p-3 rounded-lg"><p id="stat-pj" class="text-2xl font-bold">0</p><p class="text-xs text-gray-400">Jugados</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p id="stat-pg" class="text-2xl font-bold text-green-400">0</p><p class="text-xs text-gray-400">Victorias</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p id="stat-pp" class="text-2xl font-bold text-red-400">0</p><p class="text-xs text-gray-400">Derrotas</p></div>
                <div class="bg-gray-800 p-3 rounded-lg"><p id="stat-efectividad" class="text-2xl font-bold text-yellow-400">0%</p><p class="text-xs text-gray-400">Efectividad</p></div>
            </div>
        </div>
    `;
}

/**
 * Calcula las estadísticas simples (PJ, PG, PP)
 */
function calculatePlayerStats(playerId, playedMatches) {
    const stats = { pj: 0, pg: 0, pp: 0, efectividad: 0 };
    playedMatches.forEach(m => {
        stats.pj++;
        const isPlayerInSide1 = m.player1_id === playerId || m.player3_id === playerId;
        const winnerIsSide1 = m.winner_id === m.player1_id || (m.player3_id && m.winner_id === m.player3_id);
        
        if (isPlayerInSide1 && winnerIsSide1) {
            stats.pg++;
        } else if (!isPlayerInSide1 && !winnerIsSide1) {
            stats.pg++;
        } else {
            stats.pp++;
        }
    });
    stats.efectividad = stats.pj > 0 ? ((stats.pg / stats.pj) * 100).toFixed(0) : 0;
    return stats;
}

// --- FUNCIÓN renderMatchesTable ELIMINADA DE AQUÍ ---

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', loadDashboardData);