// Ruta: src/common/router.js

import { getCurrentUser } from './auth.js';

/**
 * Redirige al usuario a otra página de la aplicación.
 * @param {string} url - La URL a la que se quiere navegar.
 */
export function goTo(url) {
  window.location.href = url;
}

/**
 * Protege una página para que solo sea accesible por un rol específico.
 * Si el usuario no tiene el rol correcto, lo redirige a la página de inicio de sesión.
 * @param {string} requiredRole - El rol requerido para acceder a la página (ej: 'admin').
 */
export function requireRole(requiredRole) {
  const user = getCurrentUser();
  
  // Si no hay un usuario logueado o su rol no es el requerido,
  // se le redirige a la página de login UNIFICADA.
  if (!user || user.role !== requiredRole) {
    // --- INICIO DE LA MODIFICACIÓN ---
    // ANTES: goTo('/src/admin/login.html');
    goTo('/portal/login.html'); // AHORA: Redirige al login de portal
    // --- FIN DE LA MODIFICACIÓN ---
  }
}

/**
 * Devuelve el objeto del usuario que está actualmente logueado.
 * Es un atajo para no tener que importar 'getCurrentUser' en todos lados.
 */
export function getUser() {
  return getCurrentUser();
}