// API Configuration
const API_URL = 'http://localhost:3000';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');
const buttonText = loginBtn.querySelector('.button-text');
const buttonLoader = loginBtn.querySelector('.button-loader');

// Load saved username if remember me was checked
window.addEventListener('DOMContentLoaded', () => {
    const savedUsername = localStorage.getItem('rememberedUsername');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (savedUsername) {
        usernameInput.value = savedUsername;
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
    }
});

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Hide error message
function hideError() {
    errorMessage.style.display = 'none';
}

// Show loading state
function setLoading(isLoading) {
    if (isLoading) {
        loginBtn.disabled = true;
        buttonText.style.display = 'none';
        buttonLoader.style.display = 'inline-block';
    } else {
        loginBtn.disabled = false;
        buttonText.style.display = 'inline-block';
        buttonLoader.style.display = 'none';
    }
}

// Validate form
function validateForm() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username) {
        showError('Please enter your username/email');
        usernameInput.focus();
        return false;
    }

    if (!password) {
        showError('Please enter your password');
        passwordInput.focus();
        return false;
    }

    if (password.length < 3) {
        showError('Password must be at least 3 characters long');
        passwordInput.focus();
        return false;
    }

    return true;
}

// Handle login
async function handleLogin(event) {
    event.preventDefault();
    hideError();

    // Validate form
    if (!validateForm()) {
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

    setLoading(true);

    try {
        // Call login API
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (data.success && data.token) {
            // Store JWT token
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('username', username);

            // Handle remember me
            if (rememberMe) {
                localStorage.setItem('rememberedUsername', username);
            } else {
                localStorage.removeItem('rememberedUsername');
            }

            // Navigate to dashboard
            await window.electronAPI.navigateToDashboard();
        } else {
            showError(data.error || 'Login failed. Please check your credentials.');
            setLoading(false);
        }
    } catch (error) {
        console.error('Login error:', error);

        if (error.message.includes('fetch')) {
            showError('Cannot connect to server. Please ensure the API server is running on port 3000.');
        } else {
            showError('An error occurred during login. Please try again.');
        }

        setLoading(false);
    }
}

// Attach event listener
loginForm.addEventListener('submit', handleLogin);

// Clear error on input
usernameInput.addEventListener('input', hideError);
passwordInput.addEventListener('input', hideError);

// Enter key handling
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        passwordInput.focus();
    }
});

// Prevent default behaviors for signup links (since we don't have signup yet)
const signupLinks = document.querySelectorAll('.signup-link, .signup-link-bottom');
if (signupLinks.length > 0) {
    signupLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showError('Sign up functionality coming soon!');
        });
    });
}

// Prevent default for forgot password
const forgotPasswordLink = document.querySelector('.forgot-password');
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        showError('Password recovery functionality coming soon!');
    });
}

console.log('Login page loaded');
console.log('Default credentials: admin / admin123');
