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
      <div class="flex items-center gap-2">
        <a href="reportes.html?id=${r.id}" class="btn btn-secondary !py-1 !px-3 !text-xs">Ver Reporte</a>
        <button data-action="delete" data-id="${r.id}" class="btn btn-secondary !py-1 !px-3 !text-xs !bg-red-900/50 hover:!bg-red-800/60 !border-red-500/20">Eliminar</button>
      </div>
    </div>
  `).join('');
}

async function handleDelete(reportId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este reporte de forma permanente?')) return;

    const { error } = await supabase.from('reports').delete().eq('id', reportId);

    if (error) {
        alert('Error al eliminar el reporte: ' + error.message);
    } else {
        alert('Reporte eliminado con éxito.');
        cargarReportes(); // Recargar la lista
    }
}


document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('header').innerHTML = renderHeader();
    cargarReportes();

    document.getElementById('reportes-list').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action="delete"]');
        if (button) {
            const reportId = button.dataset.id;
            handleDelete(reportId);
        }
    });
});