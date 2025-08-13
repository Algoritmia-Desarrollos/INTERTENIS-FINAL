import { supabase } from '../supabase.js'; // Esta ruta es la correcta


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