/**
 * Authentication UI Module
 * Handles login and signup forms for login.html
 */

import { auth } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

// Tab switching
const loginTab = document.querySelector('[data-tab="login"]');
const signupTab = document.querySelector('[data-tab="signup"]');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

function switchTab(tabName) {
    // Update tabs
    loginTab.classList.toggle('active', tabName === 'login');
    signupTab.classList.toggle('active', tabName === 'signup');
    
    // Update forms
    loginForm.classList.toggle('active', tabName === 'login');
    signupForm.classList.toggle('active', tabName === 'signup');
    
    // Clear messages
    clearMessages();
}

loginTab.addEventListener('click', () => switchTab('login'));
signupTab.addEventListener('click', () => switchTab('signup'));

// Message helpers
function showMessage(formType, type, message) {
    const messageEl = document.getElementById(`${formType}${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.classList.add('show');
        setTimeout(() => {
            messageEl.classList.remove('show');
        }, 5000);
    }
}

function clearMessages() {
    document.querySelectorAll('.message').forEach(msg => {
        msg.classList.remove('show');
        msg.textContent = '';
    });
}

// Error message formatter
function formatAuthError(error) {
    const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password should be at least 6 characters.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.'
    };
    return errorMessages[error.code] || error.message || 'An error occurred. Please try again.';
}

// Login form handler
const loginFormEl = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');

loginFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showMessage('login', 'error', 'Please fill in all fields.');
        return;
    }

    // Show loading state
    loginBtn.disabled = true;
    loginBtn.textContent = 'Loading...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Success - onAuthStateChanged will handle redirect
        showMessage('login', 'success', 'Login successful! Redirecting...');
    } catch (error) {
        showMessage('login', 'error', formatAuthError(error));
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
    }
});

// Signup form handler
const signupFormEl = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');

signupFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    if (!email || !password || !confirmPassword) {
        showMessage('signup', 'error', 'Please fill in all fields.');
        return;
    }

    if (password.length < 6) {
        showMessage('signup', 'error', 'Password must be at least 6 characters.');
        return;
    }

    if (password !== confirmPassword) {
        showMessage('signup', 'error', 'Passwords do not match.');
        return;
    }

    // Show loading state
    signupBtn.disabled = true;
    signupBtn.textContent = 'Loading...';

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // Success - onAuthStateChanged will handle redirect
        showMessage('signup', 'success', 'Account created! Redirecting...');
    } catch (error) {
        showMessage('signup', 'error', formatAuthError(error));
        signupBtn.disabled = false;
        signupBtn.textContent = 'Create Account';
    }
});

// Handle auth state changes - redirect after successful login/signup
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in - redirect to generator after a brief delay
        setTimeout(() => {
            const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/generator/';
            window.location.href = redirectUrl;
        }, 1500);
    }
});

