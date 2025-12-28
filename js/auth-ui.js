/**
 * Authentication UI Module
 * Handles login and signup forms for login.html
 */

import { auth, db } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    deleteUser,
    sendEmailVerification,
    sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    doc,
    getDoc,
    setDoc,
    Timestamp,
    deleteDoc,
    runTransaction
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// Tab switching
const loginTab = document.querySelector('[data-tab="login"]');
const signupTab = document.querySelector('[data-tab="signup"]');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const resetPasswordForm = document.getElementById('resetPasswordForm');

function switchTab(tabName) {
    // Update tabs
    loginTab.classList.toggle('active', tabName === 'login');
    signupTab.classList.toggle('active', tabName === 'signup');
    
    // Update page title
    const pageTitle = document.getElementById('authPageTitle');
    if (pageTitle) {
        pageTitle.textContent = tabName === 'login' ? 'Log in' : 'Create account';
    }
    
    // Update forms
    loginForm.classList.toggle('active', tabName === 'login');
    signupForm.classList.toggle('active', tabName === 'signup');
    
    // Hide reset form when switching tabs
    if (resetPasswordForm) {
        resetPasswordForm.classList.remove('active');
    }
    
    // Clear messages
    clearMessages();
}

// Show/hide password reset form
function showResetForm() {
    if (!resetPasswordForm) return;
    
    loginForm.classList.remove('active');
    signupForm.classList.remove('active');
    resetPasswordForm.classList.add('active');
    
    // Update page title
    const pageTitle = document.getElementById('authPageTitle');
    if (pageTitle) {
        pageTitle.textContent = 'Reset Password';
    }
    
    // Hide tabs
    if (loginTab && signupTab) {
        loginTab.style.display = 'none';
        signupTab.style.display = 'none';
    }
    
    clearMessages();
    
    // Focus on email input
    const resetEmailInput = document.getElementById('resetEmail');
    if (resetEmailInput) {
        setTimeout(() => resetEmailInput.focus(), 100);
    }
}

function hideResetForm() {
    if (!resetPasswordForm) return;
    
    resetPasswordForm.classList.remove('active');
    loginForm.classList.add('active');
    
    // Update page title
    const pageTitle = document.getElementById('authPageTitle');
    if (pageTitle) {
        pageTitle.textContent = 'Log in';
    }
    
    // Show tabs
    if (loginTab && signupTab) {
        loginTab.style.display = '';
        signupTab.style.display = '';
    }
    
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

// Helper to detect Firestore database missing errors
function isDatabaseMissingError(e) {
    const message = e?.message || "";
    return /database.*\(default\).*does not exist/i.test(message);
}

// Rate limiting state for username checks (per-session)
let lastUsernameCheckTime = 0;
let usernameCheckTimes = []; // Array of timestamps for the last minute

/**
 * Check if username check rate limit is exceeded
 * @param {boolean} bypass - If true, allows check but still enforces minimal limits
 * @returns {Object} { allowed: boolean, reason?: string }
 */
function checkUsernameRateLimit(bypass = false) {
    const now = Date.now();
    
    // Check 750ms cooldown (always enforced, even with bypass)
    if (now - lastUsernameCheckTime < 750 && !bypass) {
        return { allowed: false, reason: 'cooldown' };
    }
    
    // If bypass is true, allow but still track (for spam prevention)
    if (bypass) {
        lastUsernameCheckTime = now;
        usernameCheckTimes.push(now);
        // Clean old timestamps (older than 1 minute)
        usernameCheckTimes = usernameCheckTimes.filter(t => now - t < 60000);
        return { allowed: true };
    }
    
    // Check per-minute limit (max 20 per minute)
    const oneMinuteAgo = now - 60000;
    usernameCheckTimes = usernameCheckTimes.filter(t => t > oneMinuteAgo);
    
    if (usernameCheckTimes.length >= 20) {
        return { allowed: false, reason: 'limit' };
    }
    
    // Update tracking
    lastUsernameCheckTime = now;
    usernameCheckTimes.push(now);
    return { allowed: true };
}

// Check if username is already taken (using getDoc only, no watch streams)
// Returns: { ok: true, available: boolean } or { ok: false, available: false, reason: "offline" }
// @param {boolean} bypassRateLimit - If true, bypasses rate limiting (for final signup check)
async function checkUsernameAvailability(usernameLower, bypassRateLimit = false) {
    // Check rate limit (unless bypassed)
    const rateLimitCheck = checkUsernameRateLimit(bypassRateLimit);
    if (!rateLimitCheck.allowed) {
        console.log('Username check rate limit exceeded:', rateLimitCheck.reason);
        return { ok: false, available: null, reason: 'rate_limit', rateLimitReason: rateLimitCheck.reason };
    }
    
    try {
        const usernameDoc = await getDoc(doc(db, 'usernames', usernameLower));
        const isTaken = usernameDoc.exists();
        console.log(`Username check result for "${usernameLower}": ${isTaken ? 'taken' : 'available'}`);
        return { ok: true, available: !isTaken };
    } catch (error) {
        // Handle Firestore database missing error - block signup and stop retries
        if (isDatabaseMissingError(error)) {
            console.error('Firestore database missing error:', error);
            return { ok: false, available: false, reason: "database_missing" };
        }
        
        // Handle offline/network blocked errors gracefully - do NOT throw
        if (isOfflineError(error)) {
            console.log('Username check failed: offline/network blocked');
            console.warn("Can't check username right now (offline or blocked network).");
            return { ok: false, available: false, reason: "offline" };
        }
        
        // For other errors, log and return error state
        console.error('Error checking username:', error);
        console.error('Username check failed with unknown error:', error);
        return { ok: false, available: null, error: 'unknown' };
    }
}

// Reserve username only (used during signup - profile created after email verification)
async function reserveUsernameOnly(uid, usernameLower) {
    // Validate inputs
    if (!uid || !usernameLower) {
        console.error('❌ reserveUsernameOnly: Missing required parameters', { uid, usernameLower });
        return { success: false, reason: 'error', error: new Error('Missing required parameters') };
    }
    
    const usernameRef = doc(db, 'usernames', usernameLower);
    
    // Log reservation details
    console.log('🔄 Reserving username only:');
    console.log('  - UID:', uid);
    console.log('  - Username:', usernameLower);
    console.log('  - Username doc path: usernames/' + usernameLower);
    console.log('  - Note: User profile will be created after email verification');
    
    try {
        // Check if username is already taken
        const usernameDoc = await getDoc(usernameRef);
        if (usernameDoc.exists()) {
            console.log(`❌ Username reservation failed: username "${usernameLower}" already taken`);
            return { success: false, reason: 'taken' };
        }
        
        // Reserve username
        const usernameData = {
            uid: uid,
            createdAt: Timestamp.now()
        };
        console.log('  - Setting usernames/' + usernameLower + ' with data:', { uid, createdAt: 'Timestamp.now()' });
        await setDoc(usernameRef, usernameData);
        
        console.log(`✅ Username reserved: "${usernameLower}" for uid ${uid}`);
        return { success: true };
    } catch (error) {
        console.error('❌ Username reservation error:', error);
        console.error('  - Error code:', error.code);
        console.error('  - Error message:', error.message);
        if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED') {
            console.error('  - PERMISSION_DENIED: Check Firestore rules');
            console.error('    * usernames/{username}: Ensure request.auth.uid == data.uid');
        }
        return { success: false, reason: 'error', error: error };
    }
}

// Create user profile after email verification (called from verify page)
async function createUserProfileAfterVerification(uid, usernameLower, email) {
    // Validate inputs
    if (!uid || !usernameLower || !email) {
        console.error('❌ createUserProfileAfterVerification: Missing required parameters', { uid, usernameLower, email });
        return { success: false, reason: 'error', error: new Error('Missing required parameters') };
    }
    
    const userRef = doc(db, 'users', uid);
    
    // Check if user profile already exists
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
        console.log('✅ User profile already exists');
        return { success: true, alreadyExists: true };
    }
    
    console.log('📝 Creating user profile after email verification:');
    console.log('  - UID:', uid);
    console.log('  - Username:', usernameLower);
    console.log('  - Email:', email);
    
    try {
        // Create user profile
        const userData = {
            username: usernameLower,
            email: email,
            createdAt: Timestamp.now(),
            avatarCount: 0
        };
        console.log('  - Setting users/' + uid + ' with data:', userData);
        await setDoc(userRef, userData);
        
        console.log(`✅ User profile created successfully for uid ${uid}`);
        return { success: true };
    } catch (error) {
        console.error('❌ User profile creation error:', error);
        console.error('  - Error code:', error.code);
        console.error('  - Error message:', error.message);
        if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED') {
            console.error('  - PERMISSION_DENIED: Check Firestore rules');
            console.error('    * users/{uid}: Ensure request.auth.uid == uid');
        }
        return { success: false, reason: 'error', error: error };
    }
}

// Export function for use in verify.js
export { createUserProfileAfterVerification };

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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Check if email is verified
            await userCredential.user.reload();
            if (!userCredential.user.emailVerified) {
                // Email not verified - redirect to verify page
                showMessage('login', 'error', 'Please verify your email before logging in. Redirecting to verification page...');
                setTimeout(() => {
                    window.location.href = '/verify/';
                }, 2000);
                return;
            }
            // Success - onAuthStateChanged will handle redirect
            showMessage('login', 'success', 'Login successful! Redirecting...');
        } catch (error) {
            showMessage('login', 'error', formatAuthError(error));
            loginBtn.disabled = false;
            loginBtn.textContent = 'Log In';
        }
    });
}

// Password reset form handler
const resetFormEl = document.getElementById('resetPasswordForm');
const resetBtn = document.getElementById('resetBtn');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const backToLoginLink = document.getElementById('backToLoginLink');

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        showResetForm();
    });
}

if (backToLoginLink) {
    backToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideResetForm();
    });
}

if (resetFormEl && resetBtn) {
    resetFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        
        const email = document.getElementById('resetEmail').value.trim();

        if (!email) {
            showMessage('reset', 'error', 'Please enter your email address.');
            return;
        }

        // Show loading state
        resetBtn.disabled = true;
        resetBtn.textContent = 'Sending...';

        try {
            // Send password reset email
            // Using ActionCodeSettings with production URL
            await sendPasswordResetEmail(auth, email, {
                url: window.location.origin + '/login/',
                handleCodeInApp: false
            });
            
            console.log('✅ Password reset email sent to:', email);
            
            // Show generic success message (privacy-safe - doesn't reveal if email exists)
            showMessage('reset', 'success', 'If an account exists with this email, a password reset link has been sent. Please check your inbox.');
            
            // Clear the email field
            document.getElementById('resetEmail').value = '';
            
            // Reset button after a delay
            setTimeout(() => {
                resetBtn.disabled = false;
                resetBtn.textContent = 'Send reset link';
            }, 3000);
        } catch (error) {
            console.error('❌ Failed to send password reset email:', error);
            console.error('Error code:', error.code, 'Error message:', error.message);
            
            // Show generic error message (privacy-safe)
            // Don't reveal if email exists or specific error details
            showMessage('reset', 'error', 'Unable to send reset email. Please check your email address and try again.');
            
            resetBtn.disabled = false;
            resetBtn.textContent = 'Send reset link';
        }
    });
}

// Signup form handler
const signupFormEl = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');

// Flag to prevent onAuthStateChanged from redirecting during signup
let isSignupInProgress = false;

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
        
        // Set flag to prevent premature redirects
        isSignupInProgress = true;

        try {
            // Username availability check - block signup unless ok:true and available:true
            // Use bypassRateLimit=true for final check, but it still respects minimal 750ms cooldown
            console.log('Final username check before signup...');
            const availabilityCheck = await checkUsernameAvailability(usernameLower, true);
            
            // Block signup if check failed (ok:false) or username not available
            if (availabilityCheck.ok !== true || availabilityCheck.available !== true) {
                // Clear signup flag on early return
                isSignupInProgress = false;
                
                if (availabilityCheck.reason === 'database_missing') {
                    showMessage('signup', 'error', 'Firestore database isn\'t created for this Firebase project. Enable Cloud Firestore in Firebase Console.');
                } else if (availabilityCheck.reason === 'offline') {
                    showMessage('signup', 'error', 'Offline / Network blocked. Check internet connection or disable adblock for this site.');
                } else if (availabilityCheck.available === false) {
                    showMessage('signup', 'error', 'Username is already taken.');
                } else {
                    showMessage('signup', 'error', 'Username verification failed. Please check your connection and try again.');
                }
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
                return;
            }

            // Step 1: Create auth user
            // IMPORTANT: Fully await user creation before proceeding
            console.log('🔐 Step 1: Creating Firebase Auth user...');
            console.log('  - Email:', email);
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Extract UID from credential immediately (do NOT use auth.currentUser)
            const uid = userCredential.user.uid;
            console.log('✅ Auth user created successfully');
            console.log('  - UID from credential:', uid);
            console.log('  - User email:', userCredential.user.email);
            console.log('  - Email verified:', userCredential.user.emailVerified);
            
            // Verify Firestore is initialized
            if (!db) {
                console.error('❌ Firestore db is not initialized!');
                throw new Error('Firestore not initialized');
            }
            console.log('  - Firestore db initialized:', !!db);
            
            // Brief pause to ensure auth state propagates to Firestore rules
            // This ensures request.auth is available when transaction runs
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('  - Auth state propagation delay completed');

            // Step 2: Reserve username only (user profile created after email verification)
            // IMPORTANT: Use uid from credential, NOT auth.currentUser
            // Profile will be created after email verification is confirmed
            console.log('📝 Step 2: Reserving username only (profile will be created after email verification)...');
            const usernameReservationResult = await reserveUsernameOnly(uid, usernameLower);
            
            if (!usernameReservationResult.success) {
                // Clear signup flag before error handling
                isSignupInProgress = false;
                
                // Username reservation failed - clean up the Auth user to prevent orphaned accounts
                console.log('Username reservation failed, cleaning up Auth user...');
                try {
                    await deleteUser(userCredential.user);
                    console.log('✅ Auth user deleted successfully (no orphaned account)');
                } catch (deleteError) {
                    console.error('❌ Failed to delete Auth user:', deleteError);
                    console.error('  - Error code:', deleteError.code);
                    console.error('  - Error message:', deleteError.message);
                    if (deleteError.code === 'auth/requires-recent-login') {
                        console.warn('⚠️ Auth user requires recent login to delete - may need manual cleanup');
                    }
                }
                
                // Show appropriate error message
                if (usernameReservationResult.reason === 'taken') {
                    showMessage('signup', 'error', 'Username was just taken. Please choose another.');
                } else {
                    const errorMsg = usernameReservationResult.error?.code === 'permission-denied' || usernameReservationResult.error?.code === 'PERMISSION_DENIED'
                        ? 'Permission denied. Please check your connection and try again.'
                        : 'Failed to reserve username. Please try again.';
                    showMessage('signup', 'error', errorMsg);
                }
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
                return;
            } else {
                console.log('✅ Username reserved successfully (profile will be created after email verification)');
                
                // Store username in localStorage for retrieval after email verification
                localStorage.setItem('pending_username', usernameLower);
                console.log('  - Username stored in localStorage for profile creation');
                
                // Success - send verification email immediately after user creation
                // IMPORTANT: Use userCredential.user (the newly created user) and await the call
                console.log('Signup completed successfully, sending verification email...');
                
                let verificationEmailSent = false;
                try {
                    // Send email verification - MUST await this before any redirect or UI transition
                    // This uses the user object from the credential (correct approach)
                    // Using default settings - Firebase will send verification email with default redirect
                    await sendEmailVerification(userCredential.user);
                    verificationEmailSent = true;
                    console.log('✅ Verification email sent successfully to:', userCredential.user.email);
                    showMessage('signup', 'success', 'Account created! Please verify your email to complete signup. Check your inbox for the verification link.');
                } catch (verifyError) {
                    // Log the error but don't fail the signup - user account is still created
                    console.error('❌ Failed to send verification email:', verifyError);
                    console.error('Error code:', verifyError.code, 'Error message:', verifyError.message);
                    
                    // Show user-friendly error message
                    const errorMsg = verifyError.code === 'auth/too-many-requests' 
                        ? 'Too many verification emails. Please try again later or check your spam folder.'
                        : 'Account created, but verification email failed to send. You can request a new one on the verify page.';
                    showMessage('signup', 'error', errorMsg);
                } finally {
                    // Clear the signup flag to allow normal redirects
                    isSignupInProgress = false;
                }
                
                // Only redirect after verification email attempt completes (success or failure)
                // This ensures sendEmailVerification() has fully resolved before any redirect
                setTimeout(() => {
                    window.location.href = '/verify/';
                }, verificationEmailSent ? 2000 : 1500);
            }
        } catch (error) {
            console.error('Signup error:', error);
            showMessage('signup', 'error', formatAuthError(error));
            // Clear signup flag on error
            isSignupInProgress = false;
        } finally {
            // Always reset loading state (but keep flag if signup succeeded)
            if (!isSignupInProgress) {
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
            }
        }
    });
}

// Check Firestore rules version on startup
async function checkRulesVersion() {
    try {
        const rulesDoc = await getDoc(doc(db, 'meta', 'rules'));
        if (rulesDoc.exists()) {
            const version = rulesDoc.data().version;
            console.log('📋 Firestore rules version:', version);
            console.log('✅ Confirmed: Client is using the intended Firestore project and ruleset');
        } else {
            console.warn('⚠️ meta/rules document not found - rules version check skipped');
        }
    } catch (error) {
        // Handle permission-denied specifically
        if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED') {
            console.error('❌ Permission denied: meta/rules read is blocked by Firestore rules');
            console.error('   Ensure rules allow: match /meta/{docId} { allow read: if docId == "rules"; }');
        } else {
            console.error('❌ Failed to check Firestore rules version:', error);
            console.error('   Error code:', error.code, 'Error message:', error.message);
            // Don't block initialization if version check fails
        }
    }
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
            const result = await checkUsernameAvailability(normalized, false);
            
            // Only update if input hasn't changed
            if (usernameInput.value.trim().toLowerCase() === normalized) {
                if (result.reason === 'rate_limit') {
                    updateUsernameStatus('error', '⚠️ Slow down', false);
                } else if (result.ok === true && result.available === true) {
                    updateUsernameStatus('available', '✅ Available', true);
                } else if (result.available === false) {
                    updateUsernameStatus('taken', '❌ Taken', false);
                } else if (result.reason === 'database_missing') {
                    updateUsernameStatus('error', '❌ Firestore database not created - Enable in Firebase Console', false);
                } else if (result.reason === 'offline' || result.ok === false) {
                    updateUsernameStatus('error', '⚠️ Offline / Network blocked - Check internet or disable adblock', false);
                } else {
                    updateUsernameStatus('error', '⚠️ Can\'t verify right now', false);
                }
            }
        }, 350);
    });
}

// Handle auth state changes - redirect after successful login (only if verified)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('Auth state changed: user logged in', user.uid);
        
        // Don't redirect if signup is in progress (prevents interrupting email verification)
        if (isSignupInProgress) {
            console.log('Signup in progress, skipping auth state redirect');
            return;
        }
        
        // Only redirect to generator if email is verified
        // Don't redirect if we're already on the verify page
        if (user.emailVerified && !window.location.pathname.includes('/verify/')) {
            setTimeout(() => {
                const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/generator/';
                window.location.href = redirectUrl;
            }, 1500);
        } else if (!user.emailVerified && window.location.pathname.includes('/login/')) {
            // If on login page and not verified, redirect to verify page
            // But only if signup is not in progress
            if (!isSignupInProgress) {
                window.location.href = '/verify/';
            }
        }
    } else {
        console.log('Auth state changed: user logged out');
    }
});

// Initialize on DOM ready and after header loads
let authStateChecked = false;
function initializeAuthUI() {
    console.log('Auth UI loaded');
    
    // Check Firestore rules version on startup
    checkRulesVersion();
    
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
