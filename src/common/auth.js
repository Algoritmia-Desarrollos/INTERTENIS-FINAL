import { supabase } from './supabase.js';

/**
 * Obtiene el usuario actual desde el almacenamiento local del navegador.
 * @returns {object|null} El objeto del usuario si existe, o null.
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
 * Inicia sesión de un usuario y obtiene su perfil.
 * @param {string} email - El correo electrónico del usuario.
 * @param {string} password - La contraseña del usuario.
 * @returns {Promise<object>} El objeto del usuario con su rol.
 */
export async function login(email, password) {
  // 1. Inicia sesión con Supabase Auth
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (loginError) {
    throw new Error('Credenciales incorrectas o el usuario no existe.');
  }
  
  if (!loginData.user) {
    throw new Error("No se pudo verificar el usuario. Inténtalo de nuevo.");
  }

  // 2. Obtiene el perfil y rol del usuario desde la tabla 'profiles'
  const { data: userData, error: userError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', loginData.user.id)
    .single();
  
  if (userError) {
    await supabase.auth.signOut(); // Cierra la sesión si no se encuentra el perfil
    throw new Error('El perfil del usuario no fue encontrado en la base de datos.');
  }

  // 3. Crea y guarda el objeto de usuario completo en el almacenamiento local
  const userToStore = {
    email: loginData.user.email,
    id: loginData.user.id,
    role: userData.role,
  };
  localStorage.setItem('user', JSON.stringify(userToStore));
  
  return userToStore;
}

/**
 * Cierra la sesión del usuario y lo redirige a la página de inicio.
 */
export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('user');
  window.location.href = '/index.html'; // Redirige al login principal
}