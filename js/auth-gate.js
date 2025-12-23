/**
 * Authentication Gate Module
 * Blocks access to /generator/ unless user is authenticated
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
    // Find the generator container
    const generatorContainer = document.querySelector('.generator-container');
    if (!generatorContainer) {
        console.error('AuthGate: Could not find .generator-container');
        return;
    }
    
    // Ensure generator container is positioned relative
    generatorContainer.style.position = 'relative';
    
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
    
    // Append overlay to generator container (not body)
    generatorContainer.appendChild(authGateOverlay);
    
    // Wire up buttons to open auth modal
    setupOverlayButtons();
}

function setupOverlayButtons() {
    const loginBtn = document.getElementById('authGateLoginBtn');
    const signupBtn = document.getElementById('authGateSignupBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            // Use global function or trigger header button
            if (window.openAuthModal) {
                window.openAuthModal('login');
            } else {
                // Fallback: trigger header button click
                const headerLoginBtn = document.getElementById('headerLoginBtn');
                if (headerLoginBtn) {
                    headerLoginBtn.click();
                } else {
                    // Last resort: import and call
                    import('./auth.js').then(({ openAuthModal }) => {
                        openAuthModal('login');
                    }).catch(console.error);
                }
            }
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            // Use global function or trigger header button
            if (window.openAuthModal) {
                window.openAuthModal('signup');
            } else {
                // Fallback: trigger header button click
                const headerSignupBtn = document.getElementById('headerSignupBtn');
                if (headerSignupBtn) {
                    headerSignupBtn.click();
                } else {
                    // Last resort: import and call
                    import('./auth.js').then(({ openAuthModal }) => {
                        openAuthModal('signup');
                    }).catch(console.error);
                }
            }
        });
    }
}

function showOverlay() {
    if (authGateOverlay) {
        authGateOverlay.classList.add('show');
        // Disable pointer events on generator container content (but not header)
        const generatorContainer = document.querySelector('.generator-container');
        if (generatorContainer) {
            // Disable pointer events on all children except the overlay
            Array.from(generatorContainer.children).forEach(child => {
                if (child.id !== 'authGateOverlay') {
                    child.style.pointerEvents = 'none';
                }
            });
        }
    }
}

function hideOverlay() {
    if (authGateOverlay) {
        authGateOverlay.classList.remove('show');
        // Re-enable pointer events on generator container content
        const generatorContainer = document.querySelector('.generator-container');
        if (generatorContainer) {
            Array.from(generatorContainer.children).forEach(child => {
                child.style.pointerEvents = 'auto';
            });
        }
    }
}

