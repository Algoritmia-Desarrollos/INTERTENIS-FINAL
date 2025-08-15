import { supabase } from '../src/common/supabase.js';

// --- Elementos del DOM ---
const programTitleEl = document.getElementById('program-title');
const matchesListEl = document.getElementById('matches-list');

// --- Lógica Principal ---
async function loadPublicProgram() {
    const urlParams = new URLSearchParams(window.location.search);
    const programId = urlParams.get('id');
    if (!programId) {
        programTitleEl.textContent = "Error: Programa no válido.";
        return;
    }

    const { data: program, error } = await supabase.from('programs').select('*').eq('id', programId).single();
    if (error || !program) {
        programTitleEl.textContent = "Programa no encontrado.";
        return;
    }
    programTitleEl.textContent = program.title;

    const { data: matches } = await supabase.from('matches')
        .select('*, player1:player1_id(name), player2:player2_id(name)')
        .in('id', program.match_ids)
        .order('match_date', { ascending: true });

    if (!matches || matches.length === 0) {
        matchesListEl.innerHTML = '<p>Este programa aún no tiene partidos definidos.</p>';
        return;
    }

    matchesListEl.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cancha</th>
                        <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Jugador 1</th>
                        <th class="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">vs</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Jugador 2</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${matches.map(match => `
                        <tr>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${new Date(match.match_date + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${match.location || 'A definir'}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-800">${match.player1.name}</td>
                            <td class="px-2 py-3 text-center text-xs text-gray-400">vs</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-left font-semibold text-gray-800">${match.player2.name}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', loadPublicProgram);