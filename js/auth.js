/**
 * Authentication Module
 * Handles header-based authentication with modal UI
 */

import { auth } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

// Modal elements
let authModal = null;
let modalBackdrop = null;

// Initialize auth UI
export function initAuth() {
    // Create modal HTML if it doesn't exist
    if (!document.getElementById('authModal')) {
        createModal();
    }
    
    // Set up auth state listener
    onAuthStateChanged(auth, (user) => {
        updateHeaderUI(user);
    });
    
    // Wire up header buttons
    setupHeaderButtons();
}

function createModal() {
    // Create backdrop
    modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'authModalBackdrop';
    modalBackdrop.className = 'auth-modal-backdrop';
    
    // Create modal
    authModal = document.createElement('div');
    authModal.id = 'authModal';
    authModal.className = 'auth-modal';
    authModal.innerHTML = `
        <button class="auth-modal-close" id="authModalClose" aria-label="Close">&times;</button>
        <div class="auth-modal-header">
            <h2 id="authModalTitle">Log In</h2>
        </div>
        
        <div class="auth-modal-tabs">
            <button class="auth-modal-tab active" data-mode="login">Log In</button>
            <button class="auth-modal-tab" data-mode="signup">Sign Up</button>
        </div>
        
        <div class="auth-modal-content">
            <!-- Login Form -->
            <form id="authLoginForm" class="auth-form active">
                <div class="auth-message error" id="authLoginError"></div>
                
                <div class="auth-form-group">
                    <label for="authEmail">Email</label>
                    <input type="email" id="authEmail" required autocomplete="email" placeholder="your@email.com">
                </div>
                
                <div class="auth-form-group">
                    <label for="authPassword">Password</label>
                    <input type="password" id="authPassword" required autocomplete="current-password" placeholder="••••••••">
                </div>
                
                <button type="submit" class="btn btn-primary" id="authLoginBtn">Log In</button>
            </form>
            
            <!-- Signup Form -->
            <form id="authSignupForm" class="auth-form">
                <div class="auth-message error" id="authSignupError"></div>
                
                <div class="auth-form-group">
                    <label for="authSignupEmail">Email</label>
                    <input type="email" id="authSignupEmail" required autocomplete="email" placeholder="your@email.com">
                </div>
                
                <div class="auth-form-group">
                    <label for="authSignupPassword">Password</label>
                    <input type="password" id="authSignupPassword" required autocomplete="new-password" placeholder="Minimum 6 characters" minlength="6">
                </div>
                
                <div class="auth-form-group">
                    <label for="authConfirmPassword">Confirm Password</label>
                    <input type="password" id="authConfirmPassword" required autocomplete="new-password" placeholder="Confirm your password">
                </div>
                
                <button type="submit" class="btn btn-primary" id="authSignupBtn">Create Account</button>
            </form>
        </div>
    `;
    
    modalBackdrop.appendChild(authModal);
    document.body.appendChild(modalBackdrop);
    
    // Wire up modal events
    setupModalEvents();
}

function setupModalEvents() {
    const closeBtn = document.getElementById('authModalClose');
    const backdrop = document.getElementById('authModalBackdrop');
    const tabs = document.querySelectorAll('.auth-modal-tab');
    const loginForm = document.getElementById('authLoginForm');
    const signupForm = document.getElementById('authSignupForm');
    const loginBtn = document.getElementById('authLoginBtn');
    const signupBtn = document.getElementById('authSignupBtn');
    const modalTitle = document.getElementById('authModalTitle');
    
    // Close modal
    function closeModal() {
        modalBackdrop.classList.remove('show');
        clearMessages();
        // Clear forms after animation
        setTimeout(() => {
            loginForm.reset();
            signupForm.reset();
        }, 300);
    }
    
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeModal();
        }
    });
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalBackdrop.classList.contains('show')) {
            closeModal();
        }
    });
    
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            
            // Update tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update forms
            loginForm.classList.toggle('active', mode === 'login');
            signupForm.classList.toggle('active', mode === 'signup');
            
            // Update title
            modalTitle.textContent = mode === 'login' ? 'Log In' : 'Sign Up';
            
            // Clear messages
            clearMessages();
        });
    });
    
    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        
        if (!email || !password) {
            showMessage('authLoginError', 'Please fill in all fields.');
            return;
        }
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Loading...';
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Success - modal will close via auth state change
            closeModal();
        } catch (error) {
            showMessage('authLoginError', formatAuthError(error));
            loginBtn.disabled = false;
            loginBtn.textContent = 'Log In';
        }
    });
    
    // Signup form submit
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        
        const email = document.getElementById('authSignupEmail').value.trim();
        const password = document.getElementById('authSignupPassword').value;
        const confirmPassword = document.getElementById('authConfirmPassword').value;
        
        if (!email || !password || !confirmPassword) {
            showMessage('authSignupError', 'Please fill in all fields.');
            return;
        }
        
        if (password.length < 6) {
            showMessage('authSignupError', 'Password must be at least 6 characters.');
            return;
        }
        
        if (password !== confirmPassword) {
            showMessage('authSignupError', 'Passwords do not match.');
            return;
        }
        
        signupBtn.disabled = true;
        signupBtn.textContent = 'Loading...';
        
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            // Success - modal will close via auth state change
            closeModal();
        } catch (error) {
            showMessage('authSignupError', formatAuthError(error));
            signupBtn.disabled = false;
            signupBtn.textContent = 'Create Account';
        }
    });
}

function setupHeaderButtons() {
    const loginBtn = document.getElementById('headerLoginBtn');
    const signupBtn = document.getElementById('headerSignupBtn');
    const logoutBtn = document.getElementById('headerLogoutBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            openModal('login');
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            openModal('signup');
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error('Error signing out:', error);
                alert('Error signing out. Please try again.');
            }
        });
    }
}

function openModal(mode = 'login') {
    if (!modalBackdrop) {
        createModal();
        // Re-setup events after creation
        setTimeout(() => {
            setupModalEvents();
            // Switch to requested mode
            const tab = document.querySelector(`[data-mode="${mode}"]`);
            if (tab) tab.click();
        }, 10);
    } else {
        // Switch to requested mode
        const tab = document.querySelector(`[data-mode="${mode}"]`);
        if (tab) tab.click();
    }
    
    modalBackdrop.classList.add('show');
}

function updateHeaderUI(user) {
    const authLoggedOut = document.getElementById('authLoggedOut');
    const authLoggedIn = document.getElementById('authLoggedIn');
    const userEmailEl = document.getElementById('userEmailDisplay');
    
    if (user) {
        // User is logged in
        if (authLoggedOut) authLoggedOut.style.display = 'none';
        if (authLoggedIn) {
            authLoggedIn.style.display = 'flex';
            if (userEmailEl) userEmailEl.textContent = user.email;
        }
    } else {
        // User is logged out
        if (authLoggedIn) authLoggedIn.style.display = 'none';
        if (authLoggedOut) authLoggedOut.style.display = 'flex';
    }
}

function showMessage(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.add('show');
    }
}

function clearMessages() {
    document.querySelectorAll('.auth-message').forEach(msg => {
        msg.classList.remove('show');
        msg.textContent = '';
    });
}

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

