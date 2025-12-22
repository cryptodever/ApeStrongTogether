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
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
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
export const db = getFirestore(app);
export const storage = getStorage(app);

// Export app instance for reference
export { app };

