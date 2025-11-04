// Ruta: portal/portal_auth.js

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
 * Inicia sesión de un usuario y determina si es Admin o Player.
 * @param {string} email - El correo electrónico del usuario.
 * @param {string} password - La contraseña del usuario.
 * @returns {Promise<object>} Un objeto con { type: 'admin' | 'player', user: object }
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

  const userId = loginData.user.id;

  // 2. ¿Es un Administrador?
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile && profile.role === 'admin') {
    const adminUser = {
      email: loginData.user.email,
      id: userId,
      role: profile.role,
    };
    localStorage.removeItem('player_user'); // Cierra sesión de jugador
    localStorage.setItem('user', JSON.stringify(adminUser)); // Inicia sesión de admin
    return { type: 'admin', user: adminUser };
  }

  // 3. Si no es Admin, ¿Es un Jugador?
  const { data: playerProfile, error: playerError } = await supabase
    .from('players')
    .select(`*, category:category_id(name), team:team_id(id, name, image_url)`)
    .eq('user_id', userId)
    .single();
  
  if (playerProfile) {
    localStorage.removeItem('user'); // Cierra sesión de admin
    localStorage.setItem('player_user', JSON.stringify(playerProfile)); // Inicia sesión de jugador
    return { type: 'player', user: playerProfile };
  }

  // 4. Si no es ninguno, es un usuario sin perfil.
  await supabase.auth.signOut(); // Cierra la sesión
  throw new Error('Este usuario no está vinculado a ningún perfil de jugador o administrador.');
}

/**
 * Cierra la sesión (sea admin o jugador) y redirige a la página de inicio pública.
 */
export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('player_user');
  localStorage.removeItem('user'); // Asegura limpiar ambas sesiones
  window.location.href = '/index.html'; // Redirige al ranking público
}