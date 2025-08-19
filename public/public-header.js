export function renderPublicHeader() {
  return `
    <header class="flex items-center justify-between border-b border-gray-700 bg-[#222222] px-4 sm:px-6 py-3 sticky top-0 z-50">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-4 w-full justify-between">
          <div class="flex items-center gap-4">
            <a href="/index.html">
                <img src="/logo_2021_02.png" alt="Logo" class="h-10">
            </a>
            <h1 class="text-lg font-bold text-gray-100 hidden sm:block">Torneos del Club</h1>
          </div>
          <div class="flex-1 flex justify-center">
            <div class="relative w-full max-w-xs">
              <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
              <input type="text" id="player-search-input" class="input-field !pl-10 w-full" placeholder="Buscar jugador..." autocomplete="off">
              <div id="player-search-results" class="absolute top-full mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-50 hidden"></div>
            </div>
          </div>
        </div>
    </header>
  `;
}