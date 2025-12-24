/**
 * Firebase Initialization Module
 * ============================================
 * 
 * This module initializes Firebase ONCE and exports the app, auth, db, and storage instances.
 * All other modules should import from this file to ensure Firebase is only initialized once.
 * 
 * IMPORTANT NOTES:
 * - This uses Firebase Web SDK v12.7.0 via ES modules from gstatic CDN
 * - GitHub Pages requires <script type="module"> for ES module support
 * - Firebase must be initialized only once - this module handles that
 * - The firebaseConfig is defined below - update it if needed
 * 
 * USAGE:
 *   import { auth, db, storage } from './firebase.js';
 * 
 * ============================================
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';

// ============================================
// FIREBASE CONFIGURATION
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyDt2g4jg0uQQa70suB5W6ftB5OSm7JFDww",
  authDomain: "apes-365b0.firebaseapp.com",
  projectId: "apes-365b0",
  storageBucket: "apes-365b0.firebasestorage.app",
  messagingSenderId: "827150303070",
  appId: "1:827150303070:web:6837682b7748deb88199cf",
  measurementId: "G-24YSXGT2TB"
};

// Log Firebase config at startup (safe, no secrets)
console.log('🔥 Firebase initialized with config:', {
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
  authDomain: firebaseConfig.authDomain
});

// ============================================
// EMULATOR SAFETY GUARD
// ============================================
// Helper to ensure emulators only run on localhost (never on production)
function isLocalhost() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
}

// ============================================
// FIREBASE INITIALIZATION
// ============================================
// Initialize Firebase app only once (singleton pattern)
// If already initialized, use the existing app
let app;
const existingApps = getApps();
if (existingApps.length > 0) {
  // App already initialized - use the first one
  app = existingApps[0];
} else {
  // Initialize new app
  app = initializeApp(firebaseConfig);
}

// Initialize Firebase services
export const auth = getAuth(app);

// ============================================
// FIREBASE APP CHECK (reCAPTCHA v3)
// ============================================
// App Check protects Firestore and Storage from abuse
// IMPORTANT: Initialize App Check BEFORE Firestore initialization
let appCheckInitialized = false;
let appCheckPromise = null;

/**
 * Initialize Firebase App Check with reCAPTCHA v3
 * 
 * Setup steps:
 * 1. Get reCAPTCHA v3 site key from Google reCAPTCHA Admin Console:
 *    https://www.google.com/recaptcha/admin
 * 2. Register your domain (e.g., apetogetherstronger.com, *.github.io)
 * 3. Set RECAPTCHA_SITE_KEY below to your site key
 * 4. Ensure CSP allows:
 *    - script-src: https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/
 *    - frame-src: https://www.google.com/recaptcha/
 *    - connect-src: https://www.google.com/recaptcha/ (for token requests)
 * 
 * Note: App Check is skipped on localhost for development convenience
 */
async function initializeAppCheck() {
    // Skip App Check on localhost for development
    if (isLocalhost()) {
        console.log('🔧 App Check skipped on localhost (development mode)');
        return;
    }

    // TODO: Replace with your reCAPTCHA v3 site key from Google reCAPTCHA Admin Console
    const RECAPTCHA_SITE_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY_HERE';
    
    if (!RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY === 'YOUR_RECAPTCHA_V3_SITE_KEY_HERE') {
        console.warn('⚠️  App Check not configured: RECAPTCHA_SITE_KEY not set');
        console.warn('   App Check will not be initialized. Firestore writes may fail if enforcement is enabled.');
        console.warn('   Get site key: https://www.google.com/recaptcha/admin');
        return;
    }

    try {
        // Dynamically import App Check module (ES module, CSP-safe)
        const { initializeAppCheck, ReCaptchaV3Provider } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-check.js');
        
        // Load reCAPTCHA v3 script (CSP-safe, uses existing script-src allowances)
        // This must be done before initializing App Check
        await loadRecaptchaScript(RECAPTCHA_SITE_KEY);
        
        // Wait for grecaptcha to be available
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();
        while (typeof window.grecaptcha === 'undefined' && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (typeof window.grecaptcha === 'undefined') {
            console.error('❌ App Check initialization failed: reCAPTCHA script not loaded');
            console.error('   Check CSP: script-src must allow https://www.google.com/recaptcha/');
            return;
        }

        // Initialize App Check with reCAPTCHA v3 provider
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
            isTokenAutoRefreshEnabled: true
        });
        
        appCheckInitialized = true;
        console.log('✅ App Check initialized with reCAPTCHA v3');
    } catch (error) {
        console.error('❌ App Check initialization error:', error);
        console.error('   Error details:', error.message);
        // Don't block app initialization if App Check fails
    }
}

/**
 * Load reCAPTCHA v3 script dynamically (CSP-safe)
 * Uses ES modules and dynamic script injection that respects CSP
 */
function loadRecaptchaScript(siteKey) {
    return new Promise((resolve, reject) => {
        // Check if script is already loaded
        if (typeof window.grecaptcha !== 'undefined') {
            console.log('✅ reCAPTCHA already loaded (grecaptcha found)');
            resolve();
            return;
        }

        // Check if script tag already exists
        const existingScript = document.querySelector('script[src*="recaptcha"]');
        if (existingScript) {
            console.log('⏳ reCAPTCHA script tag exists, waiting for load...');
            // If script already loaded, resolve immediately
            if (existingScript.complete || existingScript.readyState === 'complete') {
                // Script already loaded, wait a bit for grecaptcha to be available
                const checkInterval = setInterval(() => {
                    if (typeof window.grecaptcha !== 'undefined') {
                        clearInterval(checkInterval);
                        console.log('✅ reCAPTCHA loaded from existing script');
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    if (typeof window.grecaptcha === 'undefined') {
                        console.warn('⚠️  Existing reCAPTCHA script found but grecaptcha not available');
                    }
                    resolve(); // Resolve anyway to continue
                }, 5000);
                return;
            }
            // Script exists but not loaded yet, wait for it
            existingScript.addEventListener('load', () => {
                console.log('✅ reCAPTCHA loaded from existing script tag');
                resolve();
            });
            existingScript.addEventListener('error', () => {
                console.error('❌ Existing reCAPTCHA script failed to load');
                reject(new Error('Existing reCAPTCHA script failed to load'));
            });
            return;
        }

        // Create and inject script tag
        console.log('📥 Loading reCAPTCHA script dynamically...');
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?render=' + siteKey;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            console.log('✅ reCAPTCHA script loaded successfully');
            resolve();
        };
        script.onerror = () => {
            console.error('❌ Failed to load reCAPTCHA script');
            console.error('   Check CSP: script-src must allow https://www.google.com/recaptcha/');
            reject(new Error('Failed to load reCAPTCHA script. Check CSP: script-src must allow https://www.google.com/recaptcha/'));
        };
        document.head.appendChild(script);
    });
}

// Initialize App Check BEFORE Firestore (non-blocking, runs in background)
// This ensures App Check tokens are available when Firestore operations occur
appCheckPromise = initializeAppCheck();

// Log App Check status after initialization attempt
appCheckPromise.then(() => {
    if (appCheckInitialized) {
        console.log('✅ App Check status: INITIALIZED');
    } else {
        console.warn('⚠️  App Check status: NOT INITIALIZED');
        console.warn('   If App Check enforcement is ON in Firebase Console, Firestore writes will return 403');
        console.warn('   Check: Firebase Console → App Check → Firestore enforcement status');
    }
}).catch(() => {
    // Silent fail - App Check is optional
});

// Initialize Firestore with forced long polling for better offline/network reliability
// IMPORTANT: App Check should be initialized before this (done above)
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    experimentalLongPollingOptions: { timeoutSeconds: 10 }
});
export const storage = getStorage(app);

// ============================================
// EMULATOR CONNECTION (localhost only)
// ============================================
// If you need to connect to Firebase Emulators, use this pattern:
// 
// if (isLocalhost()) {
//   import { connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
//   import { connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
//   connectFirestoreEmulator(db, 'localhost', 8080);
//   connectAuthEmulator(auth, 'http://localhost:9099');
// }
//
// This ensures emulators NEVER run on github.io or production domains.

// Export app instance, emulator guard, and config values for reference
export { app, isLocalhost, appCheckPromise };
export const apiKey = firebaseConfig.apiKey;
export const projectId = firebaseConfig.projectId;
export { appCheckInitialized };
