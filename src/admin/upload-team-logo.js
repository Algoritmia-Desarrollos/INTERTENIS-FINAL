import { supabase } from '../common/supabase.js';
// Sube un archivo al bucket 'team-images' de Supabase Storage y retorna la URL pública
export async function uploadTeamLogo(file) {
  if (!file) return null;
  const ext = file.name.split('.').pop();
  const fileName = `team-${Date.now()}-${Math.floor(Math.random()*10000)}.${ext}`;
  // Subir al bucket 'team-images'
  const { data, error } = await supabase.storage.from('team-images').upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw new Error('Error al subir la imagen: ' + error.message);
  // Obtener la URL pública
  const { data: publicUrlData } = supabase.storage.from('team-images').getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}
