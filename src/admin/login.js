import { login } from '../common/auth.js'; // Esta ruta es correcta

// --- Selectores de elementos del DOM ---
const form = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginText = document.getElementById('loginText');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMsgDiv = document.getElementById('errorMessage');
const errorTextSpan = document.getElementById('errorText');

// Limpiar cualquier sesión anterior al cargar la página de login
localStorage.removeItem('user');

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
        const user = await login(email, password);
        
        // La función login ya verifica que el rol sea 'admin'.
        // Si tiene éxito, redirigimos al dashboard del administrador.
        window.location.href = '/src/admin/dashboard.html';

    } catch (err) {
        // Mostrar mensaje de error
        errorTextSpan.textContent = err.message || 'Credenciales incorrectas.';
        errorMsgDiv.classList.remove('hidden');
        
        // Reactivar el botón
        loginBtn.disabled = false;
        loginText.style.display = 'block';
        loadingSpinner.style.display = 'none';
    }
});