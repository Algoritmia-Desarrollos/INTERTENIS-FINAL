import { login } from './src/common/auth.js';

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

    // Ocultar errores previos y mostrar el spinner de carga
    errorMsgDiv.classList.add('hidden');
    loginBtn.disabled = true;
    loginText.style.display = 'none';
    loadingSpinner.style.display = 'block';

    const email = form.email.value;
    const password = form.password.value;

    try {
        const user = await login(email, password);
        
        // Redirección según el rol del usuario
        if (user.role === 'admin') {
            window.location.href = '/src/admin/dashboard.html';
        } else if (user.role === 'profesor') {
            window.location.href = '/src/profesor/dashboard.html';
        } else if (user.role === 'jugador') {
            window.location.href = '/src/jugador/home.html';
        } else {
            // Si el rol no es reconocido, se lanza un error
            throw new Error("Rol de usuario no reconocido.");
        }
    } catch (err) {
        // Mostrar mensaje de error
        errorTextSpan.textContent = err.message || 'Credenciales incorrectas.';
        errorMsgDiv.classList.remove('hidden');
        
        // Reactivar el botón para que el usuario pueda intentarlo de nuevo
        loginBtn.disabled = false;
        loginText.style.display = 'block';
        loadingSpinner.style.display = 'none';
    }
});