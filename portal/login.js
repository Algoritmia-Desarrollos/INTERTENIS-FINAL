import { login } from './portal_auth.js';

// --- Selectores de elementos del DOM ---
const form = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginText = document.getElementById('loginText');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMsgDiv = document.getElementById('errorMessage');
const errorTextSpan = document.getElementById('errorText');

// Limpiar cualquier sesión anterior al cargar la página de login
// (Ojo: solo limpiamos la sesión del jugador, no la del admin)
localStorage.removeItem('player_user');

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
        const player = await login(email, password);
        
        // Si tiene éxito, redirigimos al dashboard del JUGADOR.
        // (Crearemos esta página en el próximo paso)
        window.location.href = '/portal/dashboard.html';

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