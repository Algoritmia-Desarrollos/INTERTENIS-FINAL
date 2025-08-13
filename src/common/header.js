import { getUser, goTo } from './router.js';
import { logout } from './auth.js';

export function renderHeader() {
  const user = getUser();
  const currentPage = window.location.pathname.split('/').pop();
  
  const getLinkClasses = (href) => {
    const base = "text-sm font-medium transition-colors px-3 py-2 rounded-md";
    const isActive = href.split('/').pop() === currentPage;
    return isActive 
      ? `${base} bg-teal-100 text-teal-700 font-semibold` 
      : `${base} text-gray-500 hover:bg-gray-100 hover:text-gray-900`;
  };
  
  let navLinks = '';
  // Definimos los enlaces según el rol del usuario
  if (user?.role === 'admin') {
    navLinks = `
        <a class="${getLinkClasses('dashboard.html')}" href="/src/admin/dashboard.html">Dashboard</a>
        <a class="${getLinkClasses('tournaments.html')}" href="/src/admin/tournaments.html">Torneos</a>
        <a class="${getLinkClasses('players.html')}" href="/src/admin/players.html">Jugadores</a>
        <a class="${getLinkClasses('matches.html')}" href="/src/admin/matches.html">Partidos</a>
        <a class="${getLinkClasses('programs.html')}" href="/src/admin/programs.html">Programas</a>
        <a class="${getLinkClasses('teams.html')}" href="/src/admin/teams.html">Equipos</a>
  <a class="${getLinkClasses('categories.html')}" href="/src/admin/categories.html">Categorías</a>
  <a class="${getLinkClasses('ranking.html')}" href="/src/admin/ranking.html">Ranking</a>
    `;
  } else if (user?.role === 'profesor') {
    navLinks = `
        <a class="${getLinkClasses('dashboard.html')}" href="/src/profesor/dashboard.html">Dashboard</a>
        // Aquí irían los enlaces para el rol 'profesor'
    `;
  } else if (user?.role === 'jugador') {
    navLinks = `
        <a class="${getLinkClasses('home.html')}" href="/src/jugador/home.html">Mis Partidos</a>
        // Aquí irían los enlaces para el rol 'jugador'
    `;
  }
  
  const headerHTML = `
    <header class="flex items-center justify-between border-b bg-white px-4 sm:px-6 py-3 shadow-sm sticky top-0 z-50">
      <div class="flex items-center gap-4">
        <a href="/index.html">
            <img src="/logo_2021_02.png" alt="Logo" class="h-10">
        </a>
        <h1 class="text-lg font-bold text-gray-800 hidden sm:block">InterTenis</h1>
      </div>
      <nav class="hidden md:flex items-center gap-2">${navLinks}</nav>
      <div class="flex items-center gap-4">
        <button id="btnLogout" class="text-sm font-medium text-gray-600 hover:text-red-600 flex items-center gap-2">
          <span class="hidden sm:inline">Cerrar Sesión</span>
          <span class="material-icons">logout</span>
        </button>
        <button id="hamburgerBtn" class="md:hidden"><span class="material-icons">menu</span></button>
      </div>
    </header>
    <div id="mobileMenu" class="hidden fixed inset-0 z-50">
        <div id="mobileMenuOverlay" class="absolute inset-0 bg-black bg-opacity-50"></div>
        <div class="relative bg-white w-72 h-full p-6 flex flex-col">
            <div class="flex justify-between items-center mb-8">
                <img src="/public/assets/img/logotipo.png" alt="Logo" class="h-10">
                <button id="closeMobileMenu"><span class="material-icons">close</span></button>
            </div>
            <nav class="flex flex-col gap-3">${navLinks}</nav>
            <div class="mt-auto">
                <button id="logoutMobile" class="w-full text-left text-sm font-medium text-gray-600 hover:text-red-600 flex items-center gap-2 p-3 rounded-md hover:bg-gray-100">
                    <span class="material-icons">logout</span>
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </div>
    </div>
  `;

  // Añadimos los event listeners después de crear el HTML
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btnLogout') || e.target.closest('#logoutMobile')) {
        logout();
    }
  
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMobileMenu = document.getElementById('closeMobileMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  
    if (hamburgerBtn?.contains(e.target)) mobileMenu?.classList.remove('hidden');
    if (closeMobileMenu?.contains(e.target)) mobileMenu?.classList.add('hidden');
    if (mobileMenuOverlay?.contains(e.target)) mobileMenu?.classList.add('hidden');
  });

  return headerHTML;
}