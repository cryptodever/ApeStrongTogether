/**
 * Authentication Module
 * Handles header-based authentication with modal UI
 * Works with header partial (modal HTML already in DOM)
 */

import { auth, db } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getDoc, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

let authStateListener = null;
let eventsSetup = false;
let userProfileListener = null;

/**
 * Initialize auth UI (works with header partial)
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.rootElement - Root element (optional, for backwards compatibility)
 */
export function initAuthUI(options = {}) {
    // Wait for header to be loaded if needed
    waitForHeader().then(() => {
        setupModalEvents();
        setupHeaderButtons();
    });
    
    // Set up auth state listener (only once)
    if (!authStateListener) {
        authStateListener = onAuthStateChanged(auth, (user) => {
            updateHeaderUI(user);
        });
    }
}

/**
 * Initialize auth (legacy API - for backwards compatibility)
 * @deprecated Use initAuthUI() instead
 */
export function initAuth() {
    initAuthUI();
}

/**
 * Wait for header to be loaded
 */
function waitForHeader() {
    return new Promise((resolve) => {
        // Check if modal already exists
        if (document.getElementById('authModal') && document.getElementById('authModalBackdrop')) {
            resolve();
            return;
        }
        
        // Wait for headerLoaded event
        const handler = () => {
            if (document.getElementById('authModal') && document.getElementById('authModalBackdrop')) {
                window.removeEventListener('headerLoaded', handler);
                resolve();
            }
        };
        window.addEventListener('headerLoaded', handler);
        
        // Also check periodically as fallback
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (document.getElementById('authModal') && document.getElementById('authModalBackdrop')) {
                clearInterval(interval);
                window.removeEventListener('headerLoaded', handler);
                resolve();
            } else if (attempts > 50) { // 5 seconds max wait
                clearInterval(interval);
                window.removeEventListener('headerLoaded', handler);
                console.warn('Auth: Header modal not found after waiting');
                resolve(); // Resolve anyway to not block
            }
        }, 100);
    });
}

function setupModalEvents() {
    if (eventsSetup) return;
    
    const closeBtn = document.getElementById('authModalClose');
    const backdrop = document.getElementById('authModalBackdrop');
    const tabs = document.querySelectorAll('.auth-modal-tab');
    const loginForm = document.getElementById('authLoginForm');
    const signupForm = document.getElementById('authSignupForm');
    const loginBtn = document.getElementById('authLoginBtn');
    const signupBtn = document.getElementById('authSignupBtn');
    const modalTitle = document.getElementById('authModalTitle');
    
    if (!closeBtn || !backdrop || !tabs.length || !loginForm || !signupForm) {
        console.warn('Auth: Modal elements not found, retrying...');
        setTimeout(() => setupModalEvents(), 100);
        return;
    }
    
    eventsSetup = true;
    
    // Close modal
    function closeModal() {
        backdrop.classList.remove('show');
        clearMessages();
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
        if (e.key === 'Escape' && backdrop.classList.contains('show')) {
            closeModal();
        }
    });
    
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            loginForm.classList.toggle('active', mode === 'login');
            signupForm.classList.toggle('active', mode === 'signup');
            
            if (modalTitle) {
                modalTitle.textContent = mode === 'login' ? 'Log In' : 'Sign Up';
            }
            
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
        
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Loading...';
        }
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            closeModal();
        } catch (error) {
            showMessage('authLoginError', formatAuthError(error));
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Log In';
            }
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
        
        if (signupBtn) {
            signupBtn.disabled = true;
            signupBtn.textContent = 'Loading...';
        }
        
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            closeModal();
        } catch (error) {
            showMessage('authSignupError', formatAuthError(error));
            if (signupBtn) {
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
            }
        }
    });
}

function setupHeaderButtons() {
    // Login/signup buttons are now anchor links in header, so they redirect automatically
    // Only need to handle logout button
    const logoutBtn = document.getElementById('headerLogoutBtn');
    
    if (logoutBtn && !logoutBtn.dataset.listenerAdded) {
        logoutBtn.dataset.listenerAdded = 'true';
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
    const backdrop = document.getElementById('authModalBackdrop');
    const authModal = document.getElementById('authModal');
    
    if (!backdrop || !authModal) {
        // Wait for header to load
        waitForHeader().then(() => {
            setupModalEvents();
            openModal(mode);
        });
        return;
    }
    
    // Ensure events are setup
    if (!eventsSetup) {
        setupModalEvents();
    }
    
    // Switch to requested mode
    const tab = document.querySelector(`.auth-modal-tab[data-mode="${mode}"]`);
    if (tab) {
        tab.click();
    } else {
        // Fallback: manually switch
        const loginForm = document.getElementById('authLoginForm');
        const signupForm = document.getElementById('authSignupForm');
        const modalTitle = document.getElementById('authModalTitle');
        const tabs = document.querySelectorAll('.auth-modal-tab');
        
        tabs.forEach(t => {
            t.classList.toggle('active', t.dataset.mode === mode);
        });
        
        if (mode === 'login') {
            if (loginForm) loginForm.classList.add('active');
            if (signupForm) signupForm.classList.remove('active');
            if (modalTitle) modalTitle.textContent = 'Log In';
        } else {
            if (loginForm) loginForm.classList.remove('active');
            if (signupForm) signupForm.classList.add('active');
            if (modalTitle) modalTitle.textContent = 'Sign Up';
        }
    }
    
    backdrop.classList.add('show');
}

// Export function for external use (e.g., auth-gate.js)
export function openAuthModal(mode = 'login') {
    openModal(mode);
}

// Also expose globally for easy access from overlay buttons
window.openAuthModal = openAuthModal;

function updateUsernameDisplay(user) {
    const userEmailEl = document.getElementById('userEmailDisplay');
    if (!userEmailEl || !user) return;
    
    // Show email initially (fallback)
    userEmailEl.textContent = user.email;
    
    // Set up real-time listener for user profile
    // First, unsubscribe from any existing listener
    if (userProfileListener) {
        userProfileListener();
        userProfileListener = null;
    }
    
    // Create real-time listener to watch for profile creation/updates
    const userDocRef = doc(db, 'users', user.uid);
    userProfileListener = onSnapshot(
        userDocRef,
        (userDoc) => {
            if (userDoc.exists()) {
                const userData = userDoc.data();
                console.log('User profile data:', userData);
                if (userData.username) {
                    console.log('Updating display to username:', userData.username);
                    if (userEmailEl) {
                        userEmailEl.textContent = userData.username;
                    }
                } else {
                    console.warn('Username field not found in user profile, keeping email');
                }
            } else {
                console.log('User profile document does not exist yet, showing email');
            }
        },
        (error) => {
            console.error('Error listening to user profile:', error);
            // Keep showing email on error
        }
    );
}

async function updateHeaderUI(user) {
    const authLoggedOut = document.getElementById('authLoggedOut');
    const authLoggedIn = document.getElementById('authLoggedIn');
    const navDivider = document.getElementById('navDivider');
    const navProfileLink = document.getElementById('navProfileLink');
    const navChatLink = document.getElementById('navChatLink');
    const navQuestsLink = document.getElementById('navQuestsLink');
    const navLeaderboardLink = document.getElementById('navLeaderboardLink');
    
    if (user) {
        if (authLoggedOut) {
            authLoggedOut.classList.add('hide');
            authLoggedOut.classList.remove('show-flex');
        }
        if (authLoggedIn) {
            authLoggedIn.classList.remove('hide');
            authLoggedIn.classList.add('show-flex');
            
            // Set up username display with real-time listener
            updateUsernameDisplay(user);
        }
        // Remove logged-out styling from divider and account links when logged in
        if (navDivider) {
            navDivider.classList.remove('logged-out');
        }
        if (navProfileLink) {
            navProfileLink.classList.remove('logged-out');
        }
        if (navChatLink) {
            navChatLink.classList.remove('logged-out');
        }
        if (navQuestsLink) {
            navQuestsLink.classList.remove('logged-out');
        }
        if (navLeaderboardLink) {
            navLeaderboardLink.classList.remove('logged-out');
        }
    } else {
        // Clean up listener when user logs out
        if (userProfileListener) {
            userProfileListener();
            userProfileListener = null;
        }
        
        if (authLoggedIn) {
            authLoggedIn.classList.add('hide');
            authLoggedIn.classList.remove('show-flex');
        }
        if (authLoggedOut) {
            authLoggedOut.classList.remove('hide');
            authLoggedOut.classList.add('show-flex');
        }
        // Add logged-out styling to divider and account links when logged out
        if (navDivider) {
            navDivider.classList.add('logged-out');
        }
        if (navProfileLink) {
            navProfileLink.classList.add('logged-out');
        }
        if (navChatLink) {
            navChatLink.classList.add('logged-out');
        }
        if (navQuestsLink) {
            navQuestsLink.classList.add('logged-out');
        }
        if (navLeaderboardLink) {
            navLeaderboardLink.classList.add('logged-out');
        }
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
