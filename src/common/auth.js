import { supabase } from '../../supabase.js'; // <-- RUTA CORREGIDA Y SIMPLIFICADA

/**
 * Obtiene el administrador actual desde el almacenamiento local.
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
 * Inicia sesión de un usuario. Si las credenciales son válidas,
 * se le otorga acceso de administrador.
 * @param {string} email - El correo electrónico del usuario.
 * @param {string} password - La contraseña del usuario.
 * @returns {Promise<object>} El objeto del usuario.
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

  // --- ¡IMPORTANTE! Hemos eliminado la consulta a la tabla 'profiles' ---
  // Ahora, si el login es exitoso, asumimos que es un administrador.

  const userToStore = {
    email: loginData.user.email,
    id: loginData.user.id,
    role: 'admin', // Se asigna el rol de 'admin' directamente
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