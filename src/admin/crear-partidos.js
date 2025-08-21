import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { importMatchesFromFile } from '../common/excel-importer.js';
import { setupMassMatchLoader } from './mass-match-loader.js';
import { setupDoublesMatchLoader } from './doubles-match-loader.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const btnShowSinglesForm = document.getElementById('btn-show-singles-form');
const btnShowDoublesForm = document.getElementById('btn-show-doubles-form');
const massLoaderContainer = document.getElementById('mass-match-loader-container');
const doublesLoaderContainer = document.getElementById('doubles-match-loader-container');
const matchesContainer = document.getElementById('matches-container');
// Añade aquí otros selectores que necesites para filtros o la tabla principal si los tienes
// const filterTournamentSelect = document.getElementById('filter-tournament');

// --- Estado Global ---
let allMatches = [];
let allPlayers = [];
let allTeams = [];
let allTournaments = [];
let tournamentPlayersMap = new Map();
let isSinglesLoaderInitialized = false;
let isDoublesLoaderInitialized = false;

// --- Carga de Datos ---
async function loadInitialData() {
    matchesContainer.innerHTML = '<p class="text-center p-8 text-gray-400">Cargando datos...</p>';
    const [
        { data: playersData },
        { data: tournamentsData },
        { data: teamsData },
        { data: matchesData },
        { data: tournamentPlayersData }
    ] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('tournaments').select('*, category:category_id(id, name)').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('matches').select(`*, category:category_id(id, name), player1:player1_id(*, team:team_id(image_url)), player2:player2_id(*, team:team_id(image_url)), winner:winner_id(name)`).order('match_date', { ascending: false }),
        supabase.from('tournament_players').select('tournament_id, player_id')
    ]);

    allPlayers = playersData || [];
    allTournaments = tournamentsData || [];
    allTeams = teamsData || [];
    allMatches = matchesData || [];
    
    tournamentPlayersMap.clear();
    if (tournamentPlayersData) {
        tournamentPlayersData.forEach(link => {
            if (!tournamentPlayersMap.has(link.tournament_id)) {
                tournamentPlayersMap.set(link.tournament_id, new Set());
            }
            tournamentPlayersMap.get(link.tournament_id).add(link.player_id);
        });
    }
    
    // Aquí puedes llamar a tu función para renderizar los partidos existentes si la tienes
    // renderExistingMatches(allMatches); 
    matchesContainer.innerHTML = '<p class="text-center p-4 text-gray-500">La tabla de partidos existentes se carga en la página principal de "Partidos".</p>';
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

btnShowSinglesForm.addEventListener('click', () => {
    doublesLoaderContainer.classList.add('hidden'); // Ocultar el otro formulario
    const isHidden = massLoaderContainer.classList.toggle('hidden');
    
    if (!isHidden && !isSinglesLoaderInitialized) {
        setupMassMatchLoader({
            container: massLoaderContainer,
            allTournaments,
            allPlayers,
            tournamentPlayersMap,
            loadInitialData
        });
        isSinglesLoaderInitialized = true;
    }
});

btnShowDoublesForm.addEventListener('click', () => {
    massLoaderContainer.classList.add('hidden'); // Ocultar el otro formulario
    const isHidden = doublesLoaderContainer.classList.toggle('hidden');

    if (!isHidden && !isDoublesLoaderInitialized) {
        setupDoublesMatchLoader({
            container: doublesLoaderContainer,
            allTournaments,
            allPlayers,
            allTeams,
            loadInitialData
        });
        isDoublesLoaderInitialized = true;
    }
});

// Listener para el botón de importar desde Excel (si lo tienes)
const btnImport = document.getElementById('btn-import-excel');
if (btnImport) {
    btnImport.addEventListener('click', () => {
        importMatchesFromFile(allPlayers, allTournaments, allCategories).then(success => {
            if (success) {
                // Recargar los datos de la página si la importación es exitosa
                loadInitialData();
            }
        });
    });
}