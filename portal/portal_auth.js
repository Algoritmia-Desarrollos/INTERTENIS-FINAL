// Importa el cliente de Supabase desde la carpeta 'common'
import { supabase } from '../src/common/supabase.js';

/**
 * Obtiene el jugador actual (no el admin) desde el almacenamiento local.
 * @returns {object|null} El objeto del jugador si existe, o null.
 */
export function getCurrentPlayer() {
  try {
    const user = localStorage.getItem('player_user');
    return user ? JSON.parse(user) : null;
  } catch (e) {
    console.error("Error al obtener el jugador de localStorage:", e);
    return null;
  }
}

/**
 * Inicia sesión de un usuario y busca su perfil de JUGADOR vinculado.
 * @param {string} email - El correo electrónico del usuario.
 * @param {string} password - La contraseña del usuario.
 * @returns {Promise<object>} El objeto del JUGADOR (de la tabla 'players').
 */
export async function login(email, password) {
  // 1. Intenta iniciar sesión con las credenciales.
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError) {
    throw new Error('Email o contraseña incorrectos.');
  }
  if (!loginData.user) {
    throw new Error("No se pudo verificar el usuario. Inténtalo de nuevo.");
  }

  // 2. Busca el perfil del JUGADOR vinculado a este usuario.
  // (Usa la columna 'user_id' que creamos en la tabla 'players')
  const { data: playerProfile, error: profileError } = await supabase
    .from('players')
    .select(`*, category:category_id(name), team:team_id(id, name, image_url)`)
    .eq('user_id', loginData.user.id)
    .single();
  
  if (profileError || !playerProfile) {
    await supabase.auth.signOut(); // Si no está vinculado, cerramos sesión.
    throw new Error('Este usuario no está vinculado a ningún perfil de jugador.');
  }

  // 3. Si todo es correcto, guarda el PERFIL DEL JUGADOR en el navegador.
  // No guardamos el 'role' de admin, guardamos el jugador.
  localStorage.setItem('player_user', JSON.stringify(playerProfile));
  
  return playerProfile;
}

/**
 * Cierra la sesión del jugador y lo redirige a la página de inicio pública.
 */
export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('player_user');
  window.location.href = '/index.html'; // Redirige al ranking público
}