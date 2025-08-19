import { supabase } from './src/common/supabase.js';
const tournamentsList = document.getElementById('tournaments-list');

async function renderPublicTournaments() {
    tournamentsList.innerHTML = '<p class="col-span-full text-center text-gray-400">Cargando torneos...</p>';

    const { data: tournaments, error } = await supabase
        .from('tournaments')
        .select(`*, category:category_id(name)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error al cargar torneos:", error);
        tournamentsList.innerHTML = '<p class="col-span-full text-center text-red-400">No se pudieron cargar los torneos.</p>';
        return;
    }

    if (tournaments.length === 0) {
        tournamentsList.innerHTML = '<p class="col-span-full text-center text-gray-400">No hay torneos disponibles en este momento.</p>';
        return;
    }

    tournamentsList.innerHTML = tournaments.map(t => `
        <div class="bg-[#222222] rounded-xl shadow-lg border border-gray-700 p-6 flex flex-col transition hover:border-yellow-400">
            <div class="flex-grow">
                <p class="text-sm font-semibold text-yellow-400">${t.category.name}</p>
                <h3 class="font-bold text-xl text-gray-100 mt-1">${t.name}</h3>
            </div>
            <div class="mt-4 border-t border-gray-700 pt-4">
                <a href="/public-tournament-view.html?id=${t.id}" class="text-yellow-400 font-semibold flex items-center justify-center gap-2 hover:text-yellow-300">
                    <span>Ver Jugadores y Partidos</span>
                    <span class="material-icons">arrow_forward</span>
                </a>
            </div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', renderPublicTournaments);