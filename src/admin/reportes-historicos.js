import { renderHeader } from '../common/header.js';
import { supabase } from '../common/supabase.js';

async function cargarReportes() {
  const cont = document.getElementById('reportes-list');
  cont.innerHTML = '<p class="text-gray-400">Cargando reportes...</p>';

  const { data, error } = await supabase
    .from('reports')
    .select('id, title, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    cont.innerHTML = `<div class="bg-[#222222] p-4 rounded-lg text-red-400">Error al cargar reportes.</div>`;
    return;
  }
  if (!data || data.length === 0) {
    cont.innerHTML = `<div class="bg-[#222222] p-6 rounded-lg text-center text-gray-400">No hay reportes guardados.</div>`;
    return;
  }
  
  cont.innerHTML = data.map(r => `
    <div class="bg-[#222222] rounded-lg shadow-lg p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
      <div>
        <div class="font-semibold text-gray-100">${r.title}</div>
        <div class="text-xs text-gray-400">${new Date(r.created_at).toLocaleString('es-AR')}</div>
      </div>
      <a href="reportes.html?id=${r.id}" class="btn btn-secondary">Ver Reporte</a>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('header').innerHTML = renderHeader();
    cargarReportes();
});