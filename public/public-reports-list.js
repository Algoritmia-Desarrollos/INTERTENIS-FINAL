import { supabase } from '../src/common/supabase.js';
import { renderPublicHeader } from './public-header.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENTOS DEL DOM ---
    const headerContainer = document.getElementById('header-container');
    const reportsListContainer = document.getElementById('reports-list-container');

    // --- RENDERIZAR HEADER ---
    headerContainer.innerHTML = renderPublicHeader();

    // --- CARGAR Y RENDERIZAR REPORTES ---
    async function loadReports() {
        reportsListContainer.innerHTML = '<p class="text-gray-400">Cargando programación...</p>';

        const { data, error } = await supabase
            .from('reports')
            .select('id, title, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            reportsListContainer.innerHTML = `<div class="bg-[#222222] p-4 rounded-lg text-red-400">Error al cargar la programación.</div>`;
            console.error(error);
            return;
        }

        if (!data || data.length === 0) {
            reportsListContainer.innerHTML = `<div class="bg-[#222222] p-6 rounded-lg text-center text-gray-400">No hay programación disponible.</div>`;
            return;
        }
        
        reportsListContainer.innerHTML = data.map(report => `
            <a href="/public/public-report-view.html?id=${report.id}" class="block bg-[#222222] rounded-lg shadow-lg p-4 flex items-center justify-between hover:bg-gray-800 transition-colors group">
                <div>
                    <div class="font-semibold text-gray-100 group-hover:text-yellow-400">${report.title}</div>
                    <div class="text-xs text-gray-400">Publicado: ${new Date(report.created_at).toLocaleDateString('es-AR')}</div>
                </div>
                <div class="flex items-center gap-2 text-yellow-500">
                    <span>Ver Reporte</span>
                    <span class="material-icons text-base transition-transform group-hover:translate-x-1">arrow_forward</span>
                </div>
            </a>
        `).join('');
    }

    loadReports();
});