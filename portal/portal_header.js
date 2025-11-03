// Ruta: portal/portal_header.js

import { getPlayer } from './portal_router.js';
import { logout } from './portal_auth.js';

export function renderPortalHeader() {
  const player = getPlayer();
  const currentPage = window.location.pathname.split('/').pop();
  
  const getLinkClasses = (href) => {
    const base = "text-sm font-medium transition-colors px-3 py-2 rounded-md";
    const isActive = href.split('/').pop() === currentPage;
    return isActive 
      ? `${base} bg-yellow-400 text-black font-semibold` 
      : `${base} text-gray-300 hover:bg-gray-700 hover:text-white`;
  };

  const navLinks = `
    <a class="${getLinkClasses('dashboard.html')}" href="/portal/dashboard.html">Mi Perfil</a>
    <a class="${getLinkClasses('disponibilidad.html')}" href="/portal/disponibilidad.html">Disponibilidad</a>
  `;

  const headerHTML = `
    <header class="flex items-center justify-between border-b border-gray-700 bg-[#222222] px-4 sm:px-6 py-3 sticky top-0 z-50">
      <div class="flex items-center gap-4">
        <a href="/portal/dashboard.html">
            <img src="/logo_2021_02.png" alt="Logo" class="h-16">
        </a>
        <span class="text-gray-400 text-sm hidden md:block">
          ¡Hola, <strong class="text-gray-100">${player?.name.split(' ')[0] || 'Jugador'}</strong>!
        </span>
      </div>
      
      <nav class="hidden lg:flex items-center gap-2">${navLinks}</nav>
      
      <div class="flex items-center gap-4">
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
                <img src="/logo_2021_02.png" alt="Logo" class="h-16">
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

  // Añadir listeners después de renderizar
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
  }, 0);

  return headerHTML;
}