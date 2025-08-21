import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';

requireRole('admin');

// --- Elementos del DOM y Estado ---
const header = document.getElementById('header');
const formContainer = document.getElementById('form-container');
const btnShowForm = document.getElementById('btn-show-form');
const form = document.getElementById('form-tournament');
const formTitle = document.getElementById('form-title');
const tournamentIdInput = document.getElementById('tournament-id');
const tournamentNameInput = document.getElementById('tournament-name');
const isTeamTournamentCheckbox = document.getElementById('is-team-tournament');
const categoryContainer = document.getElementById('category-container');
const categorySelect = document.getElementById('category-select');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const tournamentsList = document.getElementById('tournaments-list');

let allPlayers = [];
let allCategories = [];
let allTournaments = [];
let expandedTournaments = new Set();
let expandedPlayerLists = new Set();
const TEAM_TOURNAMENT_CATEGORY_NAME = "Equipos";

// --- Inyectar CSS para vista compacta ---
const style = document.createElement('style');
style.textContent = `
    .tournament-card-header { padding: 0.75rem 1rem; }
    .tournament-card-header .font-bold { font-size: 1rem; }
    .tournament-card-header .text-sm { font-size: 0.75rem; }
`;
document.head.appendChild(style);

// --- Carga de Datos ---
async function loadInitialData() {
    const [{ data: categories }, { data: players }] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('players').select('*, team:team_id(image_url)').order('name')
    ]);
    allCategories = categories || [];
    allPlayers = players || [];
    
    categorySelect.innerHTML = '<option value="">Seleccione una categoría</option>';
    allCategories
        .filter(cat => cat.name !== TEAM_TOURNAMENT_CATEGORY_NAME)
        .forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
        
    await fetchAndRenderTournaments();
}

// *** INICIO DE LA CORRECCIÓN ***
async function fetchAndRenderTournaments() {
    tournamentsList.innerHTML = '<p class="text-gray-400">Cargando torneos...</p>';

    // 1. Obtener todos los torneos y sus jugadores inscritos
    const { data: tournamentsData, error: tournamentsError } = await supabase
        .from('tournaments')
        .select(`*, 
            category:category_id(name), 
            players:tournament_players(player:players(*, team:team_id(image_url)))
        `);

    if (tournamentsError) {
        console.error("Error al cargar torneos:", tournamentsError);
        tournamentsList.innerHTML = `<p class="text-red-400">Error al cargar los torneos: ${tournamentsError.message}</p>`;
        return;
    }

    // 2. Obtener todos los vínculos entre torneos por equipo y torneos fuente
    const { data: allLinks, error: linksError } = await supabase
        .from('linked_tournaments')
        .select('team_tournament_id, source_tournament_id');

    if (linksError) {
        console.error("Error al cargar los vínculos de torneos:", linksError);
        // No es un error fatal, podemos continuar sin los vínculos
    }

    // 3. Combinar los datos en JavaScript
    allTournaments = tournamentsData.map(tournament => {
        const linked = allLinks?.filter(link => link.team_tournament_id === tournament.id) || [];
        return {
            ...tournament,
            linked_tournaments: linked
        };
    });

    sortAndRenderTournaments();
}
// *** FIN DE LA CORRECCIÓN ***

// --- Renderizado y Lógica de UI ---
function sortAndRenderTournaments() {
    const getCategoryNumber = (name) => {
        const match = name.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : Infinity;
    };

    let sorted = [...allTournaments];
    
    sorted.sort((a, b) => {
        const aIsTeam = a.category.name === TEAM_TOURNAMENT_CATEGORY_NAME;
        const bIsTeam = b.category.name === TEAM_TOURNAMENT_CATEGORY_NAME;

        if (aIsTeam && !bIsTeam) return -1;
        if (!aIsTeam && bIsTeam) return 1;

        const aNum = getCategoryNumber(a.category.name);
        const bNum = getCategoryNumber(b.category.name);
        
        return aNum - bNum;
    });

    renderTournaments(sorted);
}

function tournamentCardTemplate(t) {
    const startDate = t.start_date ? new Date(t.start_date + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';
    const isExpanded = expandedTournaments.has(t.id);
    const isTeamTournament = t.category.name === TEAM_TOURNAMENT_CATEGORY_NAME;
    
    const detailsContent = isTeamTournament 
        ? generateTeamTournamentDetails(t) 
        : generateStandardTournamentDetails(t);

    return `
    <div class="border border-gray-700 rounded-lg overflow-hidden bg-[#222222]" data-tournament-card-id="${t.id}">
        <div class="tournament-card-header flex justify-between items-center p-3">
            <div>
                <p class="font-bold text-gray-100">${t.name}</p>
                <p class="text-xs text-gray-400">${t.category.name} | Inicia: ${startDate}</p>
            </div>
            <div class="flex items-center gap-2">
                ${isTeamTournament 
                    ? `<a href="team-scoreboard.html?id=${t.id}" class="btn btn-primary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">leaderboard</span>Ver Ranking Equipos</a>`
                    : `<a href="rankings.html?tournamentId=${t.id}" class="btn btn-secondary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">leaderboard</span>Ver Ranking</a>`
                }
                <button data-action="toggle" data-tournament-id="${t.id}" class="p-2 rounded-full hover:bg-gray-800">
                    <span class="material-icons transition-transform ${isExpanded ? 'rotate-180' : ''}">expand_more</span>
                </button>
            </div>
        </div>
        <div class="${isExpanded ? '' : 'hidden'} p-4 bg-black border-t border-gray-700">
            ${detailsContent}
        </div>
    </div>`;
}

function generateStandardTournamentDetails(t) {
    const enrolledPlayers = t.players.map(p => p.player).filter(Boolean);
    const isPlayerListExpanded = expandedPlayerLists.has(t.id);
    const playersToEnroll = allPlayers.filter(p => p.category_id === t.category_id && !enrolledPlayers.some(ep => ep.id === p.id));
    const enrollLabel = `Inscribir jugador de "${t.category.name}"...`;

    return `
        <div class="flex items-center gap-2 mb-4">
             <button data-action="edit" data-tournament='${JSON.stringify(t)}' class="btn btn-secondary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">edit</span>Editar</button>
             <button data-action="delete" data-id="${t.id}" class="btn btn-secondary !text-xs !py-1 !px-2 !text-red-400"><span class="material-icons !text-sm">delete</span>Eliminar</button>
        </div>
        <div class="flex justify-between items-center mb-2 cursor-pointer" data-action="toggle-player-list" data-tournament-id="${t.id}">
            <h4 class="font-semibold text-sm text-gray-100">Jugadores Inscritos (${enrolledPlayers.length})</h4>
            <button class="p-1 rounded-full hover:bg-gray-700">
                 <span class="material-icons transition-transform ${isPlayerListExpanded ? 'rotate-180' : ''}">expand_more</span>
            </button>
        </div>
        <div class="${isPlayerListExpanded ? '' : 'hidden'} space-y-2 mb-3 max-h-60 overflow-y-auto pr-2">
            ${enrolledPlayers.length > 0 ? enrolledPlayers.map(p => `
                <div class="flex justify-between items-center text-sm bg-gray-800 p-2 rounded-md">
                    <div class="flex items-center gap-3"><img src="${p.team?.image_url || 'https://via.placeholder.com/40'}" alt="Logo" class="h-8 w-8 rounded-full object-cover"><span class="text-gray-200">${p.name}</span></div>
                    <button data-action="unenroll" data-tournament-id="${t.id}" data-player-id="${p.id}" class="text-gray-500 hover:text-red-400 p-1"><span class="material-icons text-sm">close</span></button>
                </div>
            `).join('') : '<p class="text-xs text-gray-400">Aún no hay jugadores inscritos.</p>'}
        </div>
        <div class="flex gap-2 items-center">
            <select class="input-field dark-input !h-10 flex-grow" data-enroll-select>
                <option value="">${enrollLabel}</option>
                ${playersToEnroll.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
            <button data-action="enroll-player" data-tournament-id="${t.id}" class="btn btn-secondary !py-2 !px-4">Inscribir</button>
            <button data-action="enroll-all" data-tournament-id="${t.id}" class="btn btn-primary !py-2 !px-4" title="Inscribir a todos los jugadores elegibles"><span class="material-icons">playlist_add_check</span></button>
        </div>`;
}

function generateTeamTournamentDetails(t) {
    const linkedTournamentIds = new Set(t.linked_tournaments.map(lt => lt.source_tournament_id));
    const availableTournaments = allTournaments.filter(tour => tour.id !== t.id && tour.category.name !== TEAM_TOURNAMENT_CATEGORY_NAME);

    return `
        <div class="flex items-center gap-2 mb-4">
            <button data-action="edit" data-tournament='${JSON.stringify(t)}' class="btn btn-secondary !text-xs !py-1 !px-2"><span class="material-icons !text-sm">edit</span>Editar</button>
            <button data-action="delete" data-id="${t.id}" class="btn btn-secondary !text-xs !py-1 !px-2 !text-red-400"><span class="material-icons !text-sm">delete</span>Eliminar</button>
        </div>
        <h4 class="font-semibold text-sm mb-2 text-gray-100">Vincular Torneos</h4>
        <p class="text-xs text-gray-400 mb-4">Selecciona los torneos cuyos puntos se sumarán a este ranking de equipos.</p>
        <div id="link-form-${t.id}" class="space-y-2 max-h-60 overflow-y-auto pr-2">
            ${availableTournaments.map(avail_t => `
                <label class="flex items-center gap-2 p-2 rounded-md hover:bg-gray-800 cursor-pointer">
                    <input type="checkbox" value="${avail_t.id}" class="form-checkbox h-4 w-4 text-yellow-400 bg-gray-700 border-gray-600 rounded" ${linkedTournamentIds.has(avail_t.id) ? 'checked' : ''}>
                    <span class="text-sm">${avail_t.name} <span class="text-xs text-gray-500">(${avail_t.category.name})</span></span>
                </label>
            `).join('')}
        </div>
        <div class="flex justify-end mt-4">
            <button data-action="save-links" data-tournament-id="${t.id}" class="btn btn-primary">Guardar Vínculos</button>
        </div>
    `;
}

function renderTournaments(tournamentsToRender) {
    tournamentsList.innerHTML = tournamentsToRender.map(t => tournamentCardTemplate(t)).join('');
}

// --- Lógica de Formulario y Eventos ---
async function handleFormSubmit(e) {
    e.preventDefault();
    const id = tournamentIdInput.value;
    const name = tournamentNameInput.value.trim();
    const isTeamTournament = isTeamTournamentCheckbox.checked;
    const start_date = startDateInput.value;
    const end_date = endDateInput.value || null;
    let category_id = categorySelect.value;

    if (isTeamTournament) {
        let teamCategory = allCategories.find(cat => cat.name === TEAM_TOURNAMENT_CATEGORY_NAME);
        if (!teamCategory) {
            const { data: newCategory, error: createError } = await supabase
                .from('categories').insert({ name: TEAM_TOURNAMENT_CATEGORY_NAME, color: '#cccccc' }).select().single();
            if (createError) { alert(`Error: ${createError.message}`); return; }
            allCategories.push(newCategory);
            teamCategory = newCategory;
        }
        category_id = teamCategory.id;
    }

    if (!name || !category_id || !start_date) {
        alert("Por favor, complete nombre, categoría y fecha de inicio.");
        return;
    }

    const tournamentData = { name, category_id, start_date, end_date };
    const { error } = id ? await supabase.from('tournaments').update(tournamentData).eq('id', id) : await supabase.from('tournaments').insert([tournamentData]);
    
    if (error) { alert(`Error: ${error.message}`); } 
    else { resetForm(); await fetchAndRenderTournaments(); }
}

function resetForm() {
    form.reset();
    tournamentIdInput.value = '';
    formTitle.textContent = 'Añadir Nuevo Torneo';
    btnSave.textContent = 'Guardar Torneo';
    categoryContainer.style.display = 'block';
    categorySelect.required = true;
    isTeamTournamentCheckbox.checked = false;
    formContainer.classList.add('hidden');
    btnShowForm.innerHTML = '<span class="material-icons">add</span> Crear Nuevo Torneo';
}

async function updateSingleTournament(tournamentId) {
    const { data: tournament, error } = await supabase
        .from('tournaments').select(`*, category:category_id(name), players:tournament_players(player:players(*, team:team_id(image_url)))`).eq('id', tournamentId).single();
    if (error) { console.error("Error al recargar torneo:", error); return; }
    const index = allTournaments.findIndex(t => t.id == tournamentId);
    if (index !== -1) allTournaments[index] = tournament;
    sortAndRenderTournaments();
}

document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

form.addEventListener('submit', handleFormSubmit);
isTeamTournamentCheckbox.addEventListener('change', (e) => {
    categoryContainer.style.display = e.target.checked ? 'none' : 'block';
    categorySelect.required = !e.target.checked;
});
btnShowForm.addEventListener('click', () => {
    formContainer.classList.toggle('hidden');
    btnShowForm.innerHTML = formContainer.classList.contains('hidden') ? '<span class="material-icons">add</span> Crear Nuevo Torneo' : '<span class="material-icons">close</span> Cancelar';
    if(formContainer.classList.contains('hidden')) resetForm();
    else form.scrollIntoView({ behavior: 'smooth' });
});
btnCancel.addEventListener('click', resetForm);

tournamentsList.addEventListener('click', async (e) => {
    const targetElement = e.target.closest('[data-action]');
    if (!targetElement) return;

    const action = targetElement.dataset.action;
    const tournamentId = targetElement.dataset.tournamentId || targetElement.closest('[data-tournament-card-id]')?.dataset.tournamentCardId;

    switch(action) {
        case 'toggle':
            const tId = Number(tournamentId);
            expandedTournaments.has(tId) ? expandedTournaments.delete(tId) : expandedTournaments.add(tId);
            if (!expandedTournaments.has(tId)) expandedPlayerLists.delete(tId);
            sortAndRenderTournaments();
            break;
        
        case 'toggle-player-list':
            const pId = Number(tournamentId);
            expandedPlayerLists.has(pId) ? expandedPlayerLists.delete(pId) : expandedPlayerLists.add(pId);
            sortAndRenderTournaments();
            break;

        case 'edit':
            const tournament = JSON.parse(targetElement.dataset.tournament);
            const isTeamTournament = tournament.category.name === TEAM_TOURNAMENT_CATEGORY_NAME;
            tournamentIdInput.value = tournament.id;
            tournamentNameInput.value = tournament.name;
            startDateInput.value = tournament.start_date;
            endDateInput.value = tournament.end_date;
            isTeamTournamentCheckbox.checked = isTeamTournament;
            categoryContainer.style.display = isTeamTournament ? 'none' : 'block';
            categorySelect.required = !isTeamTournament;
            if(!isTeamTournament) categorySelect.value = tournament.category_id;
            formTitle.textContent = 'Editar Torneo';
            btnSave.textContent = 'Actualizar Torneo';
            formContainer.classList.remove('hidden');
            btnShowForm.innerHTML = '<span class="material-icons">close</span> Cancelar';
            form.scrollIntoView({ behavior: 'smooth' });
            break;

        case 'delete':
            const idToDelete = targetElement.dataset.id;
            if (confirm('¿Está seguro? Esto eliminará el torneo, sus partidos y las inscripciones de jugadores.')) {
                await supabase.from('linked_tournaments').delete().eq('team_tournament_id', idToDelete);
                await supabase.from('tournament_players').delete().eq('tournament_id', idToDelete);
                await supabase.from('matches').delete().eq('tournament_id', idToDelete);
                await supabase.from('tournaments').delete().eq('id', idToDelete);
                await fetchAndRenderTournaments();
            }
            break;

        case 'unenroll':
            const playerIdToUnenroll = targetElement.dataset.playerId;
            if (confirm('¿Quitar a este jugador del torneo?')) {
                await supabase.from('tournament_players').delete().match({ tournament_id: tournamentId, player_id: playerIdToUnenroll });
                await updateSingleTournament(tournamentId);
            }
            break;

        case 'enroll-player':
            const select = targetElement.parentElement.querySelector('select[data-enroll-select]');
            const playerIdToEnroll = select.value;
            if (!playerIdToEnroll) return; 
            const { error } = await supabase.from('tournament_players').insert([{ tournament_id: tournamentId, player_id: playerIdToEnroll }]);
            if (error) alert('Error: ' + error.message);
            else await updateSingleTournament(tournamentId);
            break;

        case 'enroll-all':
            const tourney = allTournaments.find(t => t.id == tournamentId);
            if (!tourney) return;
            const enrolledIds = new Set(tourney.players.map(p => p.player.id));
            const isTeams = tourney.category.name === TEAM_TOURNAMENT_CATEGORY_NAME;
            const playersToEnroll = (isTeams ? allPlayers : allPlayers.filter(p => p.category_id === tourney.category_id)).filter(p => !enrolledIds.has(p.id));
            if (playersToEnroll.length === 0) { alert('No hay jugadores nuevos para inscribir.'); return; }
            if (confirm(`¿Inscribir a ${playersToEnroll.length} jugadores a este torneo?`)) {
                const enrollData = playersToEnroll.map(p => ({ tournament_id: tournamentId, player_id: p.id }));
                const { error: enrollError } = await supabase.from('tournament_players').insert(enrollData);
                if (enrollError) alert('Error: ' + enrollError.message);
                else { alert(`${playersToEnroll.length} jugadores inscritos.`); await updateSingleTournament(tournamentId); }
            }
            break;
        
        case 'save-links':
            targetElement.disabled = true;
            targetElement.textContent = 'Guardando...';
            const formEl = document.getElementById(`link-form-${tournamentId}`);
            const selectedCheckboxes = formEl.querySelectorAll('input[type="checkbox"]:checked');
            const newLinkedIds = Array.from(selectedCheckboxes).map(cb => Number(cb.value));
            await supabase.from('linked_tournaments').delete().eq('team_tournament_id', tournamentId);
            if (newLinkedIds.length > 0) {
                const linksToInsert = newLinkedIds.map(id => ({ team_tournament_id: tournamentId, source_tournament_id: id }));
                await supabase.from('linked_tournaments').insert(linksToInsert);
            }
            alert("Vínculos guardados.");
            targetElement.disabled = false;
            targetElement.textContent = 'Guardar Vínculos';
            await fetchAndRenderTournaments();
            break;
    }
});