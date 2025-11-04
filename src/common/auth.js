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
  // 1. Intenta iniciar sesión con las credenciales proporcionadas.
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError) {
    throw new Error('Credenciales incorrectas o el usuario no existe.');
  }
  if (!loginData.user) {
    throw new Error("No se pudo verificar el usuario. Inténtalo de nuevo.");
  }

  // 2. Busca el perfil del usuario en tu tabla 'profiles' para obtener su rol.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', loginData.user.id)
    .single();
  
  if (profileError || !profile) {
    await supabase.auth.signOut(); // Si no tiene perfil, cerramos la sesión por seguridad.
    throw new Error('El perfil del usuario no fue encontrado en la base de datos.');
  }

  // 3. Verificación clave: comprueba si el rol es 'admin'.
  if (profile.role !== 'admin') {
    await supabase.auth.signOut(); // Si no es admin, cerramos la sesión.
    throw new Error('Acceso denegado. Esta sección es solo para administradores.');
  }

  // 4. Si todo es correcto, guarda los datos del admin en el navegador.
  const userToStore = {
    email: loginData.user.email,
    id: loginData.user.id,
    role: profile.role,
  };
  
  localStorage.removeItem('player_user'); // Cierra sesión de jugador
  localStorage.setItem('user', JSON.stringify(userToStore)); // Inicia sesión de admin
  
  return userToStore;
}

/**
 * Cierra la sesión del administrador y lo redirige a la página de inicio pública.
 */
export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('user');
  localStorage.removeItem('player_user'); // Asegura limpiar ambas sesiones
  window.location.href = '/index.html';
}