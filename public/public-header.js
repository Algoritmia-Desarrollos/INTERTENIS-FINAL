import { supabase } from '../src/common/supabase.js';

export function renderPublicHeader() {
  const headerHTML = `
    <header class="flex items-center justify-between border-b border-gray-700 bg-[#222222] px-4 sm:px-6 py-3 sticky top-0 z-50">
      <div class="flex items-center gap-4">
        <a href="/index.html">
            <img src="/logo_2021_02.png" alt="Logo" class="h-10">
        </a>
      </div>
      <div class="flex-1 flex justify-end">
        <div class="relative w-full max-w-xs">
          <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
          <input type="text" id="player-search-input" class="input-field !pl-10 w-full" placeholder="Buscar jugador..." autocomplete="off">
          <div id="player-search-results" class="absolute top-full mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-50 hidden"></div>
        </div>
      </div>
    </header>
  `;

  // Se agrega un temporizador para asegurar que el DOM esté listo
  setTimeout(() => {
    const searchInput = document.getElementById('player-search-input');
    const searchResults = document.getElementById('player-search-results');

    if (searchInput && searchResults) {
      searchInput.addEventListener('input', async (e) => {
          const searchTerm = e.target.value;
          if (searchTerm.length < 2) {
              searchResults.classList.add('hidden');
              return;
          }
          
          // Llama a la función de Supabase para buscar jugadores
          const { data, error } = await supabase.rpc('search_players_unaccent', { search_term: searchTerm });

          if (error || !data || data.length === 0) {
              searchResults.innerHTML = '<div class="px-4 py-2 text-sm text-gray-400">No se encontraron jugadores.</div>';
          } else {
              searchResults.innerHTML = data.map(player => `
                  <a href="/public/public-player-dashboard.html?id=${player.id}" class="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                      ${player.name}
                  </a>
              `).join('');
          }
          searchResults.classList.remove('hidden');
      });

      // Oculta los resultados si se hace clic fuera del buscador
      document.addEventListener('click', (e) => {
          if (!e.target.closest('.relative')) {
              searchResults.classList.add('hidden');
          }
      });
    }
  }, 0);

  return headerHTML;
}