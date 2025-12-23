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
import { initializeFirestore, setLogLevel } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
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
// Feature-flag: Only enable App Check in production (not localhost)
// This protects Firestore and Storage from abuse
let appCheckInitialized = false;

async function initializeAppCheck() {
    // Skip App Check on localhost for development
    if (isLocalhost()) {
        console.log('App Check: Skipped on localhost (development mode)');
        return;
    }

    try {
        // Initialize App Check with reCAPTCHA v3
        // NOTE: Replace 'YOUR_RECAPTCHA_SITE_KEY' with your actual reCAPTCHA v3 site key
        const RECAPTCHA_SITE_KEY = 'YOUR_RECAPTCHA_SITE_KEY'; // TODO: Replace with actual site key
        
        if (RECAPTCHA_SITE_KEY === 'YOUR_RECAPTCHA_SITE_KEY') {
            console.warn('App Check: reCAPTCHA site key not configured. App Check will be skipped.');
            return;
        }

        // Wait for reCAPTCHA to be available (with timeout)
        const maxWait = 5000; // 5 seconds
        const startTime = Date.now();
        
        while (typeof window.grecaptcha === 'undefined' && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (typeof window.grecaptcha === 'undefined') {
            console.warn('App Check: reCAPTCHA v3 not loaded after waiting. App Check will be skipped.');
            return;
        }

        const { initializeAppCheck, ReCaptchaV3Provider } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-check.js');
        
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
            isTokenAutoRefreshEnabled: true
        });
        
        appCheckInitialized = true;
        console.log('✅ App Check initialized with reCAPTCHA v3');
    } catch (error) {
        console.error('App Check initialization error:', error);
        // Don't block app initialization if App Check fails
    }
}

// Initialize App Check (non-blocking, runs in background)
initializeAppCheck();

// Enable Firestore SDK debug logs
setLogLevel("debug");

// Initialize Firestore with forced long polling for better offline/network reliability
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
export { app, isLocalhost };
export const apiKey = firebaseConfig.apiKey;
export const projectId = firebaseConfig.projectId;

