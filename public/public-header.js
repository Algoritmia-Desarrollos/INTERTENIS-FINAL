import { supabase } from '../src/common/supabase.js';

export function renderPublicHeader() {
  const headerHTML = `
    <header class="flex items-center justify-between gap-4 border-b border-gray-700 bg-[#222222] px-4 py-3 sticky top-0 z-50">
      
      <div class="flex-shrink-0">
        <a href="/index.html">
            <img src="/logo_2021_02.png" alt="Logo" class="h-16">
        </a>
      </div>

      <div class="flex-1 px-2">
        <div class="relative w-full max-w-md mx-auto">
          <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
          <input type="text" id="player-search-input" class="input-field !pl-10 w-full" placeholder="Buscar Jugador..." autocomplete="off">
          <div id="player-search-results" class="absolute top-full mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-50 hidden"></div>
        </div>
      </div>

      <div class="flex-shrink-0">
        <nav class="hidden sm:flex items-center gap-2">
            <a href="/index.html" class="text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-md">POSICIONES</a>
            <a href="/public/public-reports-list.html" class="text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-md">PROGRAMACION</a>
        </nav>
        <button id="hamburgerBtn" class="sm:hidden text-gray-300">
            <span class="material-icons">menu</span>
        </button>
      </div>

    </header>

    <div id="mobileMenu" class="hidden fixed inset-0 z-50">
        <div id="mobileMenuOverlay" class="absolute inset-0 bg-black bg-opacity-70"></div>
        <div class="relative bg-[#222222] w-72 h-full p-6 flex flex-col">
            <div class="flex justify-between items-center mb-8">
                <a href="/index.html">
                    <img src="/logo_2021_02.png" alt="Logo" class="h-16">
                </a>
                <button id="closeMobileMenu" class="text-gray-300"><span class="material-icons">close</span></button>
            </div>
            <nav class="flex flex-col gap-4">
                <a href="/index.html" class="text-lg font-medium text-gray-300 hover:text-yellow-400 px-3 py-2 rounded-md">POSICIONES</a>
                <a href="/public/public-reports-list.html" class="text-lg font-medium text-gray-300 hover:text-yellow-400 px-3 py-2 rounded-md">PROGRAMACION</a>
            </nav>
        </div>
    </div>
  `;

  // --- INICIO DE LA MODIFICACIÓN ---
  // Se eliminó la clase "hidden" y "sm:inline" del span para que siempre sea visible
  const floatingButton = `
    <a href="https://wa.me/5493416940596?text=Hola" target="_blank" 
       class="fixed bottom-4 right-4 bg-green-500 hover:bg-green-600 text-white rounded-full p-3 shadow-lg z-50 flex items-center gap-2 transition-colors">
        <span class="material-icons">chat</span>
        <span>INSCRIBITE</span>
    </a>
  `;
  // --- FIN DE LA MODIFICACIÓN ---

  // Se agrega un temporizador para asegurar que el DOM esté listo
  setTimeout(() => {
    // Lógica del buscador (sin cambios)
    const searchInput = document.getElementById('player-search-input');
    const searchResults = document.getElementById('player-search-results');

    if (searchInput && searchResults) {
      searchInput.addEventListener('input', async (e) => {
          const searchTerm = e.target.value;
          if (searchTerm.length < 2) {
              searchResults.classList.add('hidden');
              return;
          }
          
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

      document.addEventListener('click', (e) => {
          if (!e.target.closest('.relative')) {
              searchResults.classList.add('hidden');
          }
      });
    }

    // --- Lógica para el Menú Móvil ---
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMobileMenu = document.getElementById('closeMobileMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => mobileMenu?.classList.remove('hidden'));
    if (closeMobileMenu) closeMobileMenu.addEventListener('click', () => mobileMenu?.classList.add('hidden'));
    if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', () => mobileMenu?.classList.add('hidden'));

  }, 0);

  return headerHTML + floatingButton;
}