// Ruta: portal/dashboard.js

import { supabase } from '../src/common/supabase.js';
import { calculatePoints } from '../src/admin/calculatePoints.js'; // Reutilizamos esta lógica
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

// --- HELPER DE COLOR ---
function isColorLight(hex) {
    if (!hex) return false;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substr(0, 2), 16),
          g = parseInt(c.substr(2, 2), 16),
          b = parseInt(c.substr(4, 2), 16);
    return ((0.299 * r + 0.587 * g + 0.114 * b) > 150);
}

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
            <a href="/portal/disponibilidad.html" class="btn btn-secondary !py-3 !px-4 text-sm sm:text-lg sm:!px-6 whitespace-nowrap">
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

    // 7. Renderizar las tablas de partidos
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
                    <a href="/portal/ranking.html" class="btn btn-primary !py-2 !px-4 text-sm w-full">
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

/**
 * Renderiza una tabla de partidos (reutilizada de public-player-dashboard.js)
 */
function renderMatchesTable(matchesToRender, containerElement, emptyMessage) {
    if (!matchesToRender || matchesToRender.length === 0) {
        containerElement.innerHTML = `<div class="bg-[#222222] p-6 rounded-xl"><p class="text-center text-gray-500 py-4">${emptyMessage}</p></div>`;
        return;
    }
    const groupedByDate = matchesToRender.reduce((acc, match) => {
        const date = match.match_date || 'Sin fecha';
        if (!acc[date]) acc[date] = [];
        acc[date].push(match);
        return acc;
    }, {});
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a) - new Date(b));
    let tableHTML = '';

    for (const date of sortedDates) {
        const groupedBySede = groupedByDate[date].reduce((acc, match) => {
            const sede = (match.location ? match.location.split(' - ')[0] : 'Sede no definida').trim();
            if(!acc[sede]) acc[sede] = [];
            acc[sede].push(match);
            return acc;
        }, {});
        for(const sede in groupedBySede) {
            const matchesInSede = groupedBySede[sede];
            const dateObj = new Date(date + 'T00:00:00');
            
            let formattedDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj);
            formattedDate = formattedDate.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').replace(' De ', ' de ');

            const headerBgColor = sede.toLowerCase() === 'centro' ? '#222222' : '#fdc100';
            const headerTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#000000';
            
            tableHTML += `
                <tr>
                    <td colspan="2" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0; font-size: 15pt; border-right: 1px solid #000;">${sede.toUpperCase()}</td>
                    <td colspan="6" style="background-color: ${headerBgColor}; color: ${headerTextColor}; font-weight: 700; text-align: center; vertical-align: middle; padding: 12px 0; font-size: 15pt;">${formattedDate}</td>
                </tr>`;

            for (const match of matchesInSede) {
                const { p1_points, p2_points } = calculatePoints(match);
                const isDoubles = match.player3 && match.player4;
                const team1_winner = isDoubles ? (match.winner_id === match.player1.id || match.winner_id === match.player3.id) : (match.winner_id === match.player1.id);
                
                let team1_class = '';
                let team2_class = '';
                if (match.winner_id) {
                    if (team1_winner) {
                        team1_class = 'winner';
                        team2_class = 'loser';
                    } else {
                        team1_class = 'loser';
                        team2_class = 'winner';
                    }
                }

                let team1_names = `<span class="player-name-text">${match.player1.name}</span>`;
                if (isDoubles && match.player3) team1_names += ` / <span class="player-name-text">${match.player3.name}</span>`;
                let team2_names = `<span class="player-name-text">${match.player2.name}</span>`;
                if (isDoubles && match.player4) team2_names += ` / <span class="player-name-text">${match.player4.name}</span>`;
                
                let hora = match.match_time ? match.match_time.substring(0, 5) : 'HH:MM';
                
                const setsDisplayRaw = (match.sets || []).map(s => {
                    if (match.winner_id && !team1_winner) {
                        return `${s.p2}/${s.p1}`;
                    }
                    return `${s.p1}/${s.p2}`;
                }).join(' ');

                let resultadoDisplay;
                if (match.status === 'completado_wo') {
                    resultadoDisplay = 'W.O.';
                } else if (match.status === 'suspendido') {
                    resultadoDisplay = 'Suspendido';
                } else if (match.status === 'completado_ret') {
                    resultadoDisplay = `${setsDisplayRaw} ret.`;
                } else {
                    resultadoDisplay = setsDisplayRaw;
                }

                const p1TeamColor = match.player1.team?.color;
                const p2TeamColor = match.player2.team?.color;
                const p1TextColor = isColorLight(p1TeamColor) ? '#000' : '#fff';
                const p2TextColor = isColorLight(p2TeamColor) ? '#000' : '#fff';
                let cancha = match.location ? (match.location.split(' - ')[1] || 'N/A') : 'N/A';
                const matchNum = cancha.match(/\d+/);
                if (matchNum) cancha = matchNum[0];

                const canchaBackgroundColor = sede.toLowerCase() === 'centro' ? '#222222' : '#ffc000';
                const canchaTextColor = sede.toLowerCase() === 'centro' ? '#ffc000' : '#222';
                const categoryDisplay = match.category?.name || '';
                
                const played = !!match.winner_id;
                let team1PointsDisplay = '';
                let team2PointsDisplay = '';

                if (played) {
                    team1PointsDisplay = p1_points ?? '';
                    if (team1PointsDisplay === 0) team1PointsDisplay = '0';
                    team2PointsDisplay = p2_points ?? '';
                    if (team2PointsDisplay === 0) team2PointsDisplay = '0';
                } else {
                    if (match.player1.team?.image_url) team1PointsDisplay = `<img src="${match.player1.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                    if (match.player2.team?.image_url) team2PointsDisplay = `<img src="${match.player2.team.image_url}" alt="" style="height: 20px; object-fit: contain; margin: auto; display: block;">`;
                }

                tableHTML += `
                    <tr class="data-row">
                        <td style="background-color: ${canchaBackgroundColor} !important; color: ${canchaTextColor} !important; font-weight: bold; border-left: 1px solid #4a4a4a;">${cancha}</td>
                        <td style="background:#000;color:#fff;">${hora}</td>
                        <td class="player-name player-name-right ${team1_class}" style='background:#000; font-size:${isDoubles ? '9pt' : '11pt'};'>${team1_names}</td>
                        <td class="pts-col" style='background:${p1TeamColor || '#3a3838'};color:${p1TextColor};'>${team1PointsDisplay}</td>
                        <td class="font-mono" style="background:#000; font-weight: bold; color: #fff;">${resultadoDisplay}</td>
                        <td class="pts-col" style='background:${p2TeamColor || '#3a3838'};color:${p2TextColor};'>${team2PointsDisplay}</td>
                        <td class="player-name player-name-left ${team2_class}" style='background:#000; font-size:${isDoubles ? '9pt' : '11pt'};'>${team2_names}</td>
                        <td class="cat-col" style="background:#000;color:${match.category?.color || '#b45309'};">${categoryDisplay}</td>
                    </tr>`;
            }
        }
    }
    containerElement.innerHTML = `
        <div class="bg-[#18191b] p-2 sm:p-4 rounded-xl shadow-lg overflow-x-auto">
            <table class="matches-report-style">
                <colgroup><col style="width: 5%"><col style="width: 7%"><col style="width: 25%"><col style="width: 5%"><col style="width: 16%"><col style="width: 5%"><col style="width: 25%"><col style="width: 12%"></colgroup>
                <tbody>${tableHTML}</tbody>
            </table>
        </div>`;
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', loadDashboardData);