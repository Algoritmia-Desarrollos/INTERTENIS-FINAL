import { supabase } from './supabase.js';

/**
 * Obtiene el administrador actual desde el almacenamiento local del navegador.
 * @returns {object|null} El objeto del administrador si existe, o null.
 */
export function getCurrentUser() {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch (e) {
    console.error("Error al obtener el usuario de localStorage:", e);
    return null;
  }
}

/**
 * Inicia sesión de un usuario y verifica si tiene el rol de 'admin'.
 * @param {string} email - El correo electrónico del usuario.
 * @param {string} password - La contraseña del usuario.
 * @returns {Promise<object>} El objeto del usuario si es admin.
 */
export async function login(email, password) {
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError) {
    throw new Error('Credenciales incorrectas.');
  }
  if (!loginData.user) {
    throw new Error("No se pudo verificar el usuario.");
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', loginData.user.id)
    .single();
  
  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error('El perfil del usuario no fue encontrado.');
  }

  // Verificación clave: solo los administradores pueden pasar.
  if (profile.role !== 'admin') {
    await supabase.auth.signOut();
    throw new Error('Acceso denegado. Esta sección es solo para administradores.');
  }

  const userToStore = {
    email: loginData.user.email,
    id: loginData.user.id,
    role: profile.role,
  };
  localStorage.setItem('user', JSON.stringify(userToStore));
  
  return userToStore;
}

/**
 * Cierra la sesión del administrador y lo redirige a la página de inicio.
 */
export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('user');
  window.location.href = '/index.html';
}