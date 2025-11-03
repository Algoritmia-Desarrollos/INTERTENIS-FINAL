import { getCurrentPlayer } from './portal_auth.js';

/**
 * Redirige al usuario a otra página de la aplicación.
 * @param {string} url - La URL a la que se quiere navegar.
 */
export function goTo(url) {
  window.location.href = url;
}

/**
 * Protege una página para que solo sea accesible por un JUGADOR logueado.
 * Si el usuario no está logueado, lo redirige al login del portal.
 */
export function requirePlayer() {
  const player = getCurrentPlayer();
  
  // Si no hay un jugador logueado, se le redirige a la página de login del portal.
  if (!player) {
    goTo('/portal/login.html');
  }
}

/**
 * Devuelve el objeto del JUGADOR que está actualmente logueado.
 */
export function getPlayer() {
  return getCurrentPlayer();
}