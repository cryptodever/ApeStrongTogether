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
    deleteDoc
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

// Username validation
function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 20) {
        return { valid: false, error: 'Username must be 3-20 characters long.' };
    }
    
    // Check for invalid characters (only letters, numbers, underscore allowed)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }
    
    // Check for spaces
    if (/\s/.test(username)) {
        return { valid: false, error: 'Username cannot contain spaces.' };
    }
    
    return { valid: true };
}

// Check if username is already taken
// Returns: boolean (if taken/not taken) or { ok: false, reason: "offline" } if offline
async function isUsernameTaken(usernameLower) {
    try {
        const usernameDoc = await getDoc(doc(db, 'usernames', usernameLower));
        return usernameDoc.exists();
    } catch (error) {
        console.error('Error checking username:', error);
        // Check if error is due to being offline
        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code || '';
        const isOffline = errorMessage.includes('offline') || 
                         errorCode === 'unavailable' || 
                         errorCode === 'failed-precondition';
        
        if (isOffline) {
            console.log('Username check failed: offline');
            return { ok: false, reason: 'offline' };
        }
        
        // For other errors, still throw
        throw error;
    }
}

// Create user profile and reserve username in Firestore
async function createUserProfile(uid, username) {
    const usernameLower = username.toLowerCase();
    
    // Create user profile
    await setDoc(doc(db, 'users', uid), {
        username: username,
        usernameLower: usernameLower,
        createdAt: serverTimestamp()
    });
    
    // Reserve username
    await setDoc(doc(db, 'usernames', usernameLower), {
        uid: uid
    });
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

        // Validate username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            showMessage('signup', 'error', usernameValidation.error);
            return;
        }

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
            // Check if username is already taken
            console.log('Checking username...');
            const usernameLower = username.toLowerCase();
            const usernameCheckResult = await isUsernameTaken(usernameLower);
            
            // Handle offline result
            if (usernameCheckResult && typeof usernameCheckResult === 'object' && usernameCheckResult.ok === false) {
                if (usernameCheckResult.reason === 'offline') {
                    showMessage('signup', 'error', 'Can\'t reach the database right now. Check internet or disable adblock for this site.');
                    return;
                }
            }
            
            // Handle username taken result
            if (usernameCheckResult === true) {
                showMessage('signup', 'error', 'Username is already taken.');
                return;
            }

            // Create auth user
            console.log('Creating auth user...');
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            try {
                // Create user profile and reserve username in Firestore
                await createUserProfile(uid, username);
                // Success - onAuthStateChanged will handle redirect
                showMessage('signup', 'success', 'Account created! Redirecting...');
            } catch (firestoreError) {
                // If Firestore fails, try to roll back auth user
                console.error('Firestore error:', firestoreError);
                try {
                    await deleteUser(userCredential.user);
                } catch (deleteError) {
                    console.error('Failed to rollback user:', deleteError);
                }
                showMessage('signup', 'error', 'Failed to create profile. Please try again.');
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
