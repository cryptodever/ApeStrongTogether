/**
 * Firebase Test Module
 * ============================================
 * 
 * This module verifies that Firebase is properly initialized.
 * It prints diagnostic information to the console.
 * 
 * This is safe to run even if the user is not logged in.
 */

import { app, auth, storage } from './firebase.js';

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runTest);
} else {
  runTest();
}

function runTest() {
  console.log('🔍 Firebase Test Module');
  console.log('=====================');
  
  // Check Firebase app initialization
  if (app) {
    console.log('✅ Firebase initialized');
    console.log('   Project ID:', app.options.projectId);
  } else {
    console.error('❌ Firebase app not initialized');
    return;
  }
  
  // Check Auth instance
  if (auth) {
    console.log('✅ Auth service initialized');
    console.log('   Current user:', auth.currentUser ? auth.currentUser.email : '(not logged in)');
  } else {
    console.error('❌ Auth service not initialized');
  }
  
  // Check Storage instance
  if (storage) {
    console.log('✅ Storage service initialized');
    console.log('   Storage bucket:', storage.app.options.storageBucket || 'unknown');
  } else {
    console.error('❌ Storage service not initialized');
  }
  
  console.log('=====================');
  console.log('Firebase test complete ✓');
}

