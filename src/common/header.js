import { getUser, goTo } from './router.js';
import { logout } from './auth.js';
import { supabase } from './supabase.js';

export function renderHeader() {
  const user = getUser();
  const currentPage = window.location.pathname.split('/').pop();
  
  // Clases actualizadas para los enlaces de navegación en tema oscuro
  const getLinkClasses = (href) => {
    const base = "text-sm font-medium transition-colors px-3 py-2 rounded-md";
    const isActive = href.split('/').pop() === currentPage;
    return isActive 
      ? `${base} bg-yellow-400 text-black font-semibold` 
      : `${base} text-gray-300 hover:bg-gray-700 hover:text-white`;
  };
  
  let navLinks = '';
  if (user?.role === 'admin') {
    navLinks = `
        <a class="${getLinkClasses('dashboard.html')}" href="/src/admin/dashboard.html">Dashboard</a>
        <a class="${getLinkClasses('matches.html')}" href="/src/admin/matches.html">Partidos</a>
                <a class="${getLinkClasses('reportes-historicos.html')}" href="/src/admin/reportes-historicos.html">Reportes</a>
        <a class="${getLinkClasses('rankings.html')}" href="/src/admin/rankings.html">Ranking</a>
        <a class="${getLinkClasses('players.html')}" href="/src/admin/players.html">Jugadores</a>
        <a class="${getLinkClasses('tournaments.html')}" href="/src/admin/tournaments.html">Torneos</a>
        <a class="${getLinkClasses('teams.html')}" href="/src/admin/teams.html">Equipos</a>
        <a class="${getLinkClasses('categories.html')}" href="/src/admin/categories.html">Categorías</a>
    `;
  }
  
  const headerHTML = `
    <header class="flex items-center justify-between border-b border-gray-700 bg-[#222222] px-4 sm:px-6 py-3 sticky top-0 z-50">
      <div class="flex items-center gap-4">
        <a href="/src/admin/dashboard.html">
            <img src="/logo_2021_02.png" alt="Logo" class="h-10">
        </a>
      </div>
      
      <nav class="hidden lg:flex items-center gap-2">${navLinks}</nav>
      
      <div class="flex items-center gap-4">
        <div class="relative hidden md:block">
            <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input type="text" id="global-player-search" class="input-field dark-input !pl-10 !w-64" placeholder="Buscar jugador..." autocomplete="off">
            <div id="global-search-results" class="absolute top-full mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-50 hidden"></div>
        </div>
        
        <button id="btnLogout" class="text-sm font-medium text-gray-300 hover:text-red-400 flex items-center gap-2">
          <span class="hidden sm:inline">Cerrar Sesión</span>
          <span class="material-icons">logout</span>
        </button>
        <button id="hamburgerBtn" class="lg:hidden text-gray-300"><span class="material-icons">menu</span></button>
      </div>
    </header>
    <div id="mobileMenu" class="hidden fixed inset-0 z-50">
        <div id="mobileMenuOverlay" class="absolute inset-0 bg-black bg-opacity-70"></div>
        <div class="relative bg-[#222222] w-72 h-full p-6 flex flex-col">
            <div class="flex justify-between items-center mb-8">
                <img src="/logo_2021_02.png" alt="Logo" class="h-10">
                <button id="closeMobileMenu" class="text-gray-300"><span class="material-icons">close</span></button>
            </div>
            <nav class="flex flex-col gap-3">${navLinks}</nav>
            <div class="mt-auto">
                <button id="logoutMobile" class="w-full text-left text-sm font-medium text-gray-300 hover:text-red-400 flex items-center gap-2 p-3 rounded-md hover:bg-gray-800">
                    <span class="material-icons">logout</span>
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </div>
    </div>
  `;

  setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (e.target.closest('#btnLogout') || e.target.closest('#logoutMobile')) {
            logout();
        }
      });
      
      const hamburgerBtn = document.getElementById('hamburgerBtn');
      const mobileMenu = document.getElementById('mobileMenu');
      const closeMobileMenu = document.getElementById('closeMobileMenu');
      const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    
      if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => mobileMenu?.classList.remove('hidden'));
      if (closeMobileMenu) closeMobileMenu.addEventListener('click', () => mobileMenu?.classList.add('hidden'));
      if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', () => mobileMenu?.classList.add('hidden'));

      // Lógica para el buscador (con estilos oscuros para los resultados)
      const searchInput = document.getElementById('global-player-search');
      const searchResults = document.getElementById('global-search-results');
      if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const searchTerm = e.target.value;
            if (searchTerm.length < 2) {
                searchResults.classList.add('hidden');
                return;
            }
            
            const { data, error } = await supabase.rpc('search_players_unaccent', { search_term: searchTerm });

            if (error || !data || data.length === 0) {
                searchResults.innerHTML = '<div class="px-4 py-2 text-sm text-gray-400">No se encontraron jugadores.</div>';
                searchResults.classList.remove('hidden');
                return;
            }

            searchResults.innerHTML = data.map(player => `
                <a href="/src/admin/player-dashboard.html?id=${player.id}" class="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                    ${player.name}
                </a>
            `).join('');
            searchResults.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#global-player-search')) {
                searchResults.classList.add('hidden');
            }
        });
      }
  }, 0);

  return headerHTML;
}