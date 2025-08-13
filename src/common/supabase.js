import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// URL y Clave pública (anon key) de tu proyecto de Tenis
const supabaseUrl = 'https://vulzfuwesigberabbbhx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1bHpmdXdlc2lnYmVyYWJiYmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMTExOTEsImV4cCI6MjA2ODc4NzE5MX0.5ndfB7FxvW6B4UVny198BiVlw-1BhJ98Xg_iyAEiFQw';

// Exportamos el cliente de Supabase para que esté disponible en toda la aplicación
export const supabase = createClient(supabaseUrl, supabaseKey);



/**
 * Muestra una notificación toast en la esquina de la pantalla.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} [type='success'] - El tipo de notificación ('success' o 'error').
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}