/**
 * Authentication UI Module
 * Handles login and signup forms for login.html
 */

import { auth, db } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    deleteUser
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    deleteDoc,
    runTransaction
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

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

if (loginTab && signupTab) {
    loginTab.addEventListener('click', () => switchTab('login'));
    signupTab.addEventListener('click', () => switchTab('signup'));
}

// Check URL parameter for mode and switch tab on page load
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
if (mode === 'signup' && signupTab && signupForm) {
    switchTab('signup');
}

// Password toggle functionality for signup password field
const signupPasswordInput = document.getElementById('signupPassword');
const signupPasswordToggle = document.getElementById('signupPasswordToggle');
const signupPasswordToggleIcon = document.getElementById('signupPasswordToggleIcon');

if (signupPasswordInput && signupPasswordToggle && signupPasswordToggleIcon) {
    signupPasswordToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isPassword = signupPasswordInput.type === 'password';
        signupPasswordInput.type = isPassword ? 'text' : 'password';
        signupPasswordToggleIcon.textContent = isPassword ? '👁️‍🗨️' : '👁️';
        signupPasswordToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
}

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

// Username validation (enforces lowercase, no leading/trailing underscore)
function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 20) {
        return { valid: false, error: 'Username must be 3-20 characters long.' };
    }
    
    // Check for invalid characters (only letters, numbers, underscore allowed)
    if (!/^[a-z0-9_]+$/.test(username)) {
        return { valid: false, error: 'Username can only contain lowercase letters, numbers, and underscores.' };
    }
    
    // Check for leading/trailing underscore
    if (username.startsWith('_') || username.endsWith('_')) {
        return { valid: false, error: 'Username cannot start or end with an underscore.' };
    }
    
    // Check for spaces
    if (/\s/.test(username)) {
        return { valid: false, error: 'Username cannot contain spaces.' };
    }
    
    return { valid: true };
}

// Normalize username to lowercase and strip leading/trailing underscores
function normalizeUsername(username) {
    return username.toLowerCase().replace(/^_+|_+$/g, '');
}

// Helper to detect offline/network blocked errors
function isOfflineError(e) {
    return e?.code === "unavailable" || /offline/i.test(e?.message || "");
}

// Check if username is already taken (using getDoc only, no watch streams)
// Returns: { ok: true, available: boolean } or { ok: false, available: false, reason: "offline" }
async function checkUsernameAvailability(usernameLower) {
    try {
        const usernameDoc = await getDoc(doc(db, 'usernames', usernameLower));
        const isTaken = usernameDoc.exists();
        console.log(`Username check result for "${usernameLower}": ${isTaken ? 'taken' : 'available'}`);
        return { ok: true, available: !isTaken };
    } catch (error) {
        // Handle offline/network blocked errors gracefully - do NOT throw
        if (isOfflineError(error)) {
            console.log('Username check failed: offline/network blocked');
            console.warn("Can't check username right now (offline or blocked network).");
            return { ok: false, available: false, reason: "offline" };
        }
        
        // For other errors, log and return error state
        console.error('Error checking username:', error);
        console.error('Username check failed with unknown error:', error);
        return { available: null, error: 'unknown' };
    }
}

// Atomically reserve username using Firestore transaction
async function reserveUsernameTransaction(uid, usernameLower, email) {
    const usernameRef = doc(db, 'usernames', usernameLower);
    const userRef = doc(db, 'users', uid);
    
    try {
        await runTransaction(db, async (transaction) => {
            // Check if username is already taken
            const usernameDoc = await transaction.get(usernameRef);
            if (usernameDoc.exists()) {
                console.log(`Transaction failed: username "${usernameLower}" already taken`);
                throw new Error('USERNAME_TAKEN');
            }
            
            // Reserve username
            transaction.set(usernameRef, {
                uid: uid,
                createdAt: serverTimestamp()
            });
            
            // Create user profile
            transaction.set(userRef, {
                username: usernameLower,
                email: email,
                createdAt: serverTimestamp(),
                avatarCount: 0
            });
        });
        
        console.log(`Transaction success: username "${usernameLower}" reserved for uid ${uid}`);
        return { success: true };
    } catch (error) {
        if (error.message === 'USERNAME_TAKEN') {
            console.log(`Transaction failed: username taken`);
            return { success: false, reason: 'taken' };
        }
        console.error('Transaction error:', error);
        return { success: false, reason: 'error', error: error };
    }
}

// Login form handler
const loginFormEl = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');

if (loginFormEl && loginBtn) {
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
}

// Signup form handler
const signupFormEl = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');

if (signupFormEl && signupBtn) {
    signupFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;

        // Validate all fields are filled
        if (!username || !email || !password || !confirmPassword) {
            showMessage('signup', 'error', 'Please fill in all fields.');
            return;
        }

        // Normalize username (lowercase, trim underscores)
        const normalizedUsername = normalizeUsername(username);
        
        // Validate username
        const usernameValidation = validateUsername(normalizedUsername);
        if (!usernameValidation.valid) {
            showMessage('signup', 'error', usernameValidation.error);
            return;
        }
        
        // Use normalized username
        const usernameLower = normalizedUsername;

        // Validate password
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
            // Username availability check - block signup unless ok:true and available:true
            console.log('Final username check before signup...');
            const availabilityCheck = await checkUsernameAvailability(usernameLower);
            
            // Block signup if check failed (ok:false) or username not available
            if (availabilityCheck.ok !== true || availabilityCheck.available !== true) {
                if (availabilityCheck.reason === 'offline') {
                    showMessage('signup', 'error', 'Offline / Network blocked. Check internet connection or disable adblock for this site.');
                } else if (availabilityCheck.available === false) {
                    showMessage('signup', 'error', 'Username is already taken.');
                } else {
                    showMessage('signup', 'error', 'Username verification failed. Please check your connection and try again.');
                }
                return;
            }

            // Step 1: Create auth user
            console.log('Creating auth user...');
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;
            console.log('Auth user created:', uid);

            // Step 2: Atomically reserve username and create user profile using transaction
            console.log('Reserving username with transaction...');
            const transactionResult = await reserveUsernameTransaction(uid, usernameLower, email);
            
            if (!transactionResult.success) {
                if (transactionResult.reason === 'taken') {
                    // Username was taken between check and transaction
                    console.log('Username taken during transaction, rolling back auth user');
                    try {
                        await deleteUser(userCredential.user);
                        console.log('Auth user rolled back successfully');
                    } catch (deleteError) {
                        console.error('Failed to rollback auth user:', deleteError);
                    }
                    showMessage('signup', 'error', 'Username was just taken. Please choose another.');
                } else {
                    // Other transaction error
                    console.error('Transaction failed:', transactionResult.error);
                    try {
                        await deleteUser(userCredential.user);
                        console.log('Auth user rolled back after transaction error');
                    } catch (deleteError) {
                        console.error('Failed to rollback auth user:', deleteError);
                    }
                    showMessage('signup', 'error', 'Failed to create profile. Please try again.');
                }
            } else {
                // Success - onAuthStateChanged will handle redirect
                console.log('Signup completed successfully');
                showMessage('signup', 'success', 'Account created! Redirecting...');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showMessage('signup', 'error', formatAuthError(error));
        } finally {
            // Always reset loading state
            signupBtn.disabled = false;
            signupBtn.textContent = 'Create Account';
        }
    });
}

// Initialize username checking UI and debounced availability check
function initUsernameChecking() {
    const usernameInput = document.getElementById('signupUsername');
    const usernameStatus = document.getElementById('usernameStatus');
    const signupBtn = document.getElementById('signupBtn');
    if (!usernameInput || !usernameStatus) return;
    
    let debounceTimer = null;
    let lastCheckedValue = '';
    let isUsernameVerified = false;
    
    // Update username status UI and button state
    function updateUsernameStatus(status, message, verified = false) {
        usernameStatus.className = 'username-status ' + status;
        usernameStatus.textContent = message;
        isUsernameVerified = verified;
        
        // Update signup button state (disabled if not verified or invalid/taken)
        if (signupBtn) {
            const normalized = normalizeUsername(usernameInput.value.trim());
            const validation = validateUsername(normalized);
            const isValid = validation.valid && verified && status === 'available';
            // Don't disable based on verification alone - allow submit if user wants to retry
            // The submit handler will check availability again anyway
        }
    }
    
    // Force lowercase on input
    usernameInput.addEventListener('input', (e) => {
        const value = e.target.value;
        const lowerValue = value.toLowerCase();
        if (value !== lowerValue) {
            e.target.value = lowerValue;
        }
    });
    
    // Debounced username availability check
    usernameInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        const normalized = normalizeUsername(value);
        
        // Clear previous timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        // Validate format first
        const validation = validateUsername(normalized);
        if (!normalized || normalized.length < 3) {
            updateUsernameStatus('', '', false);
            return;
        }
        
        if (!validation.valid) {
            updateUsernameStatus('invalid', '❌ Invalid', false);
            return;
        }
        
        // Only check if value changed
        if (normalized === lastCheckedValue) {
            return;
        }
        
        // Show checking status
        updateUsernameStatus('checking', 'Checking...', false);
        
        // Debounce check (350ms)
        debounceTimer = setTimeout(async () => {
            lastCheckedValue = normalized;
            const result = await checkUsernameAvailability(normalized);
            
            // Only update if input hasn't changed
            if (usernameInput.value.trim().toLowerCase() === normalized) {
                if (result.ok === true && result.available === true) {
                    updateUsernameStatus('available', '✅ Available', true);
                } else if (result.available === false) {
                    updateUsernameStatus('taken', '❌ Taken', false);
                } else if (result.reason === 'offline' || result.ok === false) {
                    updateUsernameStatus('error', '⚠️ Offline / Network blocked - Check internet or disable adblock', false);
                } else {
                    updateUsernameStatus('error', '⚠️ Can\'t verify right now', false);
                }
            }
        }, 350);
    });
}

// Handle auth state changes - redirect after successful login/signup
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('Auth state changed: user logged in', user.uid);
        // User is logged in - redirect to generator after a brief delay
        setTimeout(() => {
            const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/generator/';
            window.location.href = redirectUrl;
        }, 1500);
    } else {
        console.log('Auth state changed: user logged out');
    }
});

// Initialize on DOM ready and after header loads
let authStateChecked = false;
function initializeAuthUI() {
    console.log('Auth UI loaded');
    
    // Get current user status (only once)
    if (!authStateChecked) {
        authStateChecked = true;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('Current user:', user.uid);
            } else {
                console.log('No user logged in');
            }
            unsubscribe(); // Only check once
        });
    }
    
    // Initialize username checking
    initUsernameChecking();
}

// Run initialization after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuthUI);
} else {
    initializeAuthUI();
}

// Also initialize after header loads (if header is injected)
window.addEventListener('headerLoaded', initializeAuthUI);
