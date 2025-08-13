import { supabase } from './src/common/supabase.js';
const tournamentsList = document.getElementById('tournaments-list');

async function renderPublicTournaments() {
    tournamentsList.innerHTML = '<p class="col-span-full text-center">Cargando torneos...</p>';

    const { data: tournaments, error } = await supabase
        .from('tournaments')
        .select(`*, category:category_id(name)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error al cargar torneos:", error);
        tournamentsList.innerHTML = '<p class="col-span-full text-center text-red-500">No se pudieron cargar los torneos.</p>';
        return;
    }

    if (tournaments.length === 0) {
        tournamentsList.innerHTML = '<p class="col-span-full text-center text-gray-500">No hay torneos disponibles en este momento.</p>';
        return;
    }

    tournamentsList.innerHTML = tournaments.map(t => `
        <div class="bg-white rounded-xl shadow-lg border p-6 flex flex-col">
            <div class="flex-grow">
                <p class="text-sm font-semibold text-teal-600">${t.category.name}</p>
                <h3 class="font-bold text-xl text-gray-800 mt-1">${t.name}</h3>
            </div>
            <div class="mt-4 border-t pt-4">
                <a href="#" class="text-teal-600 font-semibold flex items-center justify-center gap-2">
                    <span>Ver Jugadores y Partidos</span>
                    <span class="material-icons">arrow_forward</span>
                </a>
            </div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', renderPublicTournaments);