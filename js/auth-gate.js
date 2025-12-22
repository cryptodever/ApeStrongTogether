/**
 * Authentication Gate Module
 * Blocks access to generator.html unless user is authenticated
 */

import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

let authGateOverlay = null;

// Initialize auth gate
export function initAuthGate() {
    console.log('AuthGate: Initializing...');
    
    // Create overlay if it doesn't exist
    if (!document.getElementById('authGateOverlay')) {
        createOverlay();
    }
    
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is logged in - hide overlay
            hideOverlay();
            console.log(`AuthGate: logged in as ${user.uid}`);
        } else {
            // User is not logged in - show overlay
            showOverlay();
            console.log('AuthGate: not logged in, blocking generator');
        }
    });
}

function createOverlay() {
    authGateOverlay = document.createElement('div');
    authGateOverlay.id = 'authGateOverlay';
    authGateOverlay.className = 'auth-gate-overlay';
    authGateOverlay.innerHTML = `
        <div class="auth-gate-content">
            <div class="auth-gate-icon">🦍</div>
            <h2 class="auth-gate-title">Members Only</h2>
            <p class="auth-gate-message">Sign up / Log in to generate your Ape.</p>
            <div class="auth-gate-buttons">
                <button class="btn btn-primary" id="authGateLoginBtn">Log In</button>
                <button class="btn btn-secondary" id="authGateSignupBtn">Sign Up</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(authGateOverlay);
    
    // Wire up buttons to open auth modal
    setupOverlayButtons();
}

function setupOverlayButtons() {
    const loginBtn = document.getElementById('authGateLoginBtn');
    const signupBtn = document.getElementById('authGateSignupBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                // Import and open auth modal
                const { openAuthModal } = await import('./auth.js');
                openAuthModal('login');
            } catch (error) {
                console.error('Error opening login modal:', error);
                // Fallback: try to trigger header button
                const headerLoginBtn = document.getElementById('headerLoginBtn');
                if (headerLoginBtn) {
                    headerLoginBtn.click();
                }
            }
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            try {
                // Import and open auth modal
                const { openAuthModal } = await import('./auth.js');
                openAuthModal('signup');
            } catch (error) {
                console.error('Error opening signup modal:', error);
                // Fallback: try to trigger header button
                const headerSignupBtn = document.getElementById('headerSignupBtn');
                if (headerSignupBtn) {
                    headerSignupBtn.click();
                }
            }
        });
    }
}

function showOverlay() {
    if (authGateOverlay) {
        authGateOverlay.classList.add('show');
        // Disable pointer events on generator content
        const generatorContent = document.querySelector('.generator-page');
        if (generatorContent) {
            generatorContent.style.pointerEvents = 'none';
        }
    }
}

function hideOverlay() {
    if (authGateOverlay) {
        authGateOverlay.classList.remove('show');
        // Re-enable pointer events on generator content
        const generatorContent = document.querySelector('.generator-page');
        if (generatorContent) {
            generatorContent.style.pointerEvents = 'auto';
        }
    }
}

