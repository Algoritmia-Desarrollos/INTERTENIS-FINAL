import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// URL y Clave pública (anon key) de tu proyecto de Tenis
const supabaseUrl = 'https://vulzfuwesigberabbbhx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWFzamx0eGV3ZG1wcHR1d3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk1MDU0NDUsImV4cCI6MjAzNTA4MTQ0NX0.90j55v0oVa5u5yv2i0h54ab3w7w2i-4nB_K9c9D1aDM';

// Exportamos el cliente de Supabase para que esté disponible en toda la aplicación
export const supabase = createClient(supabaseUrl, supabaseKey);