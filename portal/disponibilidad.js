// Ruta: portal/disponibilidad.js

import { supabase, showToast } from '../src/common/supabase.js';
import { requirePlayer, getPlayer } from './portal_router.js';
import { renderPortalHeader } from './portal_header.js';

// --- PROTEGER PÁGINA ---
requirePlayer();

// --- ELEMENTOS DEL DOM ---
const headerContainer = document.getElementById('header');
const weekDisplay = document.getElementById('week-display');
const form = document.getElementById('availability-form');
const saveButton = document.getElementById('save-button');
const statusMessage = document.getElementById('status-message');
// Sede select ya no existe

// Checkboxes (14 en total)
const checkboxes = {
    'lun-m': document.getElementById('lun-m'), 'lun-t': document.getElementById('lun-t'),
    'mar-m': document.getElementById('mar-m'), 'mar-t': document.getElementById('mar-t'),
    'mie-m': document.getElementById('mie-m'), 'mie-t': document.getElementById('mie-t'),
    'jue-m': document.getElementById('jue-m'), 'jue-t': document.getElementById('jue-t'),
    'vie-m': document.getElementById('vie-m'), 'vie-t': document.getElementById('vie-t'),
    'sab-m': document.getElementById('sab-m'), 'sab-t': document.getElementById('sab-t'),
    'dom-m': document.getElementById('dom-m'), 'dom-t': document.getElementById('dom-t'),
};

// Headers de los días (para poner la fecha)
const dayHeaders = {
    lun: document.getElementById('header-lun'),
    mar: document.getElementById('header-mar'),
    mie: document.getElementById('header-mie'),
    jue: document.getElementById('header-jue'),
    vie: document.getElementById('header-vie'),
    sab: document.getElementById('header-sab'),
    dom: document.getElementById('header-dom'),
};

// --- ESTADO ---
let player;
let targetDates = {}; // { lun: 'YYYY-MM-DD', mar: 'YYYY-MM-DD', ..., dom: 'YYYY-MM-DD' }
let isLoading = false;
const DEFAULT_ZONE = 'Ambas'; // Hardcodeado como pide el admin

/**
 * Función auxiliar para obtener el Lunes de la semana de una fecha dada.
 */
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  // Si es Domingo (0), retrocede 6 días. Si es Lunes (1), retrocede 0. Si es Sábado (6), retrocede 5.
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0); // Establecer al inicio del día
  return monday;
}

/**
 * Calcula las fechas de la semana ACTUAL (Lunes a Domingo)
 */
function calculateCurrentWeekDates() {
    const today = new Date();
    
    // Obtener el Lunes de la semana actual
    const currentMonday = getStartOfWeek(today);

    const weekDates = [];
    const dateKeys = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

    const formatDate = (date) => date.toISOString().split('T')[0];
    
    // Formato de display: "D/M"
    const formatDisplay = (date) => {
        const d = date.getDate();
        const m = date.getMonth() + 1; // getMonth() es 0-indexado
        return `${d}/${m}`;
    };

    targetDates = {};
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentMonday.getTime() + i * 24 * 60 * 60 * 1000);
        const key = dateKeys[i];
        
        // Guardar la fecha YYYY-MM-DD
        targetDates[key] = formatDate(date);
        
        // Actualizar el header del día con el nuevo formato
        if (dayHeaders[key]) {
            const dayName = date.toLocaleDateString('es-AR', { weekday: 'short' });
            // Ej: "Vie 7/11"
            dayHeaders[key].innerHTML = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} <span class="date-span">${formatDisplay(date)}</span>`;
        }
    }

    // Actualizar el display principal
    const firstDay = new Date(targetDates.lun + 'T00:00:00'); // Lunes
    const lastDay = new Date(targetDates.dom + 'T00:00:00');  // Domingo
    
    weekDisplay.textContent = `
        Semana del Lun ${formatDisplay(firstDay)} al Dom ${formatDisplay(lastDay)}
    `;
}

/**
 * Carga la disponibilidad guardada para la semana actual (7 días)
 */
async function loadCurrentAvailability() {
    if (!player) return;
    
    statusMessage.innerHTML = `<div class="spinner inline-block"></div> Cargando disponibilidad guardada...`;
    
    const allTargetDates = Object.values(targetDates);

    const { data, error } = await supabase
        .from('player_availability')
        .select('available_date, time_slot, zone')
        .eq('player_id', player.id)
        .in('available_date', allTargetDates);

    if (error) {
        console.error("Error cargando disponibilidad:", error);
        showToast("Error al cargar tu disponibilidad guardada.", "error");
        statusMessage.textContent = '';
        return;
    }

    // Marcar los checkboxes
    data.forEach(avail => {
        // Encontrar la clave del día (lun, mar, etc.)
        const dayKey = Object.keys(targetDates).find(key => targetDates[key] === avail.available_date);
        if (dayKey) {
            const turnKey = avail.time_slot === 'mañana' ? 'm' : 't';
            const checkboxId = `${dayKey}-${turnKey}`;
            if (checkboxes[checkboxId]) {
                checkboxes[checkboxId].checked = true;
            }
        }
    });
    
    statusMessage.textContent = '';
}

/**
 * Maneja el guardado del formulario
 */
async function handleSave(e) {
    e.preventDefault();
    if (isLoading) return;
    isLoading = true;
    saveButton.disabled = true;
    saveButton.innerHTML = `<div class="spinner inline-block mr-2"></div> Guardando...`;

    const zone = DEFAULT_ZONE; // Sede eliminada, usamos 'Ambas' por defecto
    const rowsToInsert = [];
    const allTargetDates = Object.values(targetDates);

    // 1. Preparar las filas a insertar
    const keyMap = {
        'lun-m': { date: targetDates.lun, slot: 'mañana' },
        'lun-t': { date: targetDates.lun, slot: 'tarde' },
        'mar-m': { date: targetDates.mar, slot: 'mañana' },
        'mar-t': { date: targetDates.mar, slot: 'tarde' },
        'mie-m': { date: targetDates.mie, slot: 'mañana' },
        'mie-t': { date: targetDates.mie, slot: 'tarde' },
        'jue-m': { date: targetDates.jue, slot: 'mañana' },
        'jue-t': { date: targetDates.jue, slot: 'tarde' },
        'vie-m': { date: targetDates.vie, slot: 'mañana' },
        'vie-t': { date: targetDates.vie, slot: 'tarde' },
        'sab-m': { date: targetDates.sab, slot: 'mañana' },
        'sab-t': { date: targetDates.sab, slot: 'tarde' },
        'dom-m': { date: targetDates.dom, slot: 'mañana' },
        'dom-t': { date: targetDates.dom, slot: 'tarde' },
    };

    for (const key in checkboxes) {
        if (checkboxes[key].checked) {
            rowsToInsert.push({
                player_id: player.id,
                available_date: keyMap[key].date,
                time_slot: keyMap[key].slot,
                zone: zone,
                source: 'player'
            });
        }
    }

    try {
        // 2. Borrar CUALQUIER disponibilidad existente para esos 7 días
        const { error: deleteError } = await supabase
            .from('player_availability')
            .delete()
            .eq('player_id', player.id)
            .in('available_date', allTargetDates); // Borrar en todo el rango

        if (deleteError) throw deleteError;

        // 3. Insertar las nuevas filas (si hay alguna)
        if (rowsToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('player_availability')
                .insert(rowsToInsert);
            
            if (insertError) throw insertError;
        }

        // --- INICIO DE LA MODIFICACIÓN ---
        showToast("Disponibilidad guardada. Volviendo al perfil...", "success");
        statusMessage.textContent = '';

        // Esperar 1 segundo para que el usuario vea el toast y redirigir
        setTimeout(() => {
            window.location.href = '/portal/dashboard.html';
        }, 1000);
        // --- FIN DE LA MODIFICACIÓN ---

    } catch (error) {
        console.error("Error al guardar:", error);
        showToast("Error al guardar: " + error.message, "error");
        statusMessage.textContent = 'Error al guardar. Intenta de nuevo.';
        
        // Si hay error, SÍ reactivamos el botón
        isLoading = false;
        saveButton.disabled = false;
        saveButton.innerHTML = `<span class="material-icons mr-2">save</span> Guardar Disponibilidad`;
    }
}


// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    player = getPlayer(); // Obtener el jugador que está en localStorage
    headerContainer.innerHTML = renderPortalHeader();
    
    calculateCurrentWeekDates(); 
    loadCurrentAvailability();

    form.addEventListener('submit', handleSave);
});