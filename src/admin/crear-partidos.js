import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase } from '../common/supabase.js';
import { setupMassMatchLoader } from './mass-match-loader.js';
import { setupDoublesMatchLoader } from './doubles-match-loader.js';

requireRole('admin');

// --- Elementos del DOM ---
const header = document.getElementById('header');
const btnShowSinglesForm = document.getElementById('btn-show-singles-form');
const btnShowDoublesForm = document.getElementById('btn-show-doubles-form');
const massLoaderContainer = document.getElementById('mass-match-loader-container');
const doublesLoaderContainer = document.getElementById('doubles-match-loader-container');

// --- Estado Global ---
let allPlayers = [];
let allTeams = [];
let allTournaments = [];
let tournamentPlayersMap = new Map();
let isSinglesLoaderInitialized = false;
let isDoublesLoaderInitialized = false;

// --- Carga de Datos ---
async function loadInitialData() {
    console.log("Cargando datos iniciales...");
    const [
        { data: playersData },
        { data: tournamentsData },
        { data: teamsData },
        { data: tournamentPlayersData }
    ] = await Promise.all([
        supabase.from('players').select('*').order('name'),
        supabase.from('tournaments').select('*, category:category_id(id, name)').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('tournament_players').select('tournament_id, player_id')
    ]);

    allPlayers = playersData || [];
    allTournaments = tournamentsData || [];
    allTeams = teamsData || [];
    
    tournamentPlayersMap.clear();
    if (tournamentPlayersData) {
        tournamentPlayersData.forEach(link => {
            if (!tournamentPlayersMap.has(link.tournament_id)) {
                tournamentPlayersMap.set(link.tournament_id, new Set());
            }
            tournamentPlayersMap.get(link.tournament_id).add(link.player_id);
        });
    }
    console.log("Datos cargados.", { allTournaments, allPlayers, allTeams });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    header.innerHTML = renderHeader();
    await loadInitialData();
});

btnShowSinglesForm.addEventListener('click', () => {
    doublesLoaderContainer.classList.add('hidden');
    massLoaderContainer.classList.toggle('hidden');
    
    if (!massLoaderContainer.classList.contains('hidden') && !isSinglesLoaderInitialized) {
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
    massLoaderContainer.classList.add('hidden');
    doublesLoaderContainer.classList.toggle('hidden');

    if (!doublesLoaderContainer.classList.contains('hidden') && !isDoublesLoaderInitialized) {
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