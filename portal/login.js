// Ruta: portal/login.js

import { login } from './portal_auth.js';

// --- Selectores de elementos del DOM ---
const form = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginText = document.getElementById('loginText');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMsgDiv = document.getElementById('errorMessage');
const errorTextSpan = document.getElementById('errorText');

// Limpiar cualquier sesión anterior al cargar la página de login
localStorage.removeItem('player_user');
localStorage.removeItem('user'); // Limpia también la sesión de admin

// --- Evento para el formulario de login ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    errorMsgDiv.classList.add('hidden');
    loginBtn.disabled = true;
    loginText.style.display = 'none';
    loadingSpinner.style.display = 'block';

    const email = form.email.value;
    const password = form.password.value;

    try {
        // Llama a la nueva función de login unificada
        const result = await login(email, password);
        
        // --- INICIO DE LA MODIFICACIÓN: Redirección inteligente ---
        if (result.type === 'admin') {
            window.location.href = '/src/admin/dashboard.html';
        } else if (result.type === 'player') {
            window.location.href = '/portal/dashboard.html';
        } else {
            throw new Error('Tipo de usuario desconocido.');
        }
        // --- FIN DE LA MODIFICACIÓN ---

    } catch (err) {
        // Mostrar mensaje de error
        errorTextSpan.textContent = err.message || 'Error desconocido.';
        errorMsgDiv.classList.remove('hidden');
        
        // Reactivar el botón
        loginBtn.disabled = false;
        loginText.style.display = 'block';
        loadingSpinner.style.display = 'none';
    }
});