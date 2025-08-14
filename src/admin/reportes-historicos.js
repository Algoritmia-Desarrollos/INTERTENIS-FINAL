import { supabase } from '../common/supabase.js';

async function cargarReportes() {
  const { data, error } = await supabase
    .from('reports')
    .select('id, title, created_at')
    .order('created_at', { ascending: false });

  const cont = document.getElementById('reportes-list');
  if (error) {
    cont.innerHTML = `<div class="text-red-600">Error al cargar reportes</div>`;
    return;
  }
  if (!data || data.length === 0) {
    cont.innerHTML = `<div class="text-gray-500">No hay reportes guardados.</div>`;
    return;
  }
  cont.innerHTML = data.map(r => `
    <div class="bg-white rounded shadow p-4 flex items-center justify-between">
      <div>
        <div class="font-semibold">${r.title}</div>
        <div class="text-xs text-gray-500">${new Date(r.created_at).toLocaleString()}</div>
      </div>
      <a href="ver-reporte.html?id=${r.id}" class="btn btn-secondary">Ver</a>
    </div>
  `).join('');
}

cargarReportes();
