/**
 * Comprehensive Firestore Debugging Tool
 * 
 * Run this in browser console to diagnose Firestore 403 errors:
 *   import('./js/debug-firestore.js').then(m => m.runAllDiagnostics())
 * 
 * Or use individual functions:
 *   import('./js/debug-firestore.js').then(m => m.checkProjectMatch())
 */

import { app, db, auth, appCheckInitialized, projectId } from './firebase.js';
import { doc, getDoc, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

/**
 * Run all diagnostics and print a comprehensive report
 */
export async function runAllDiagnostics() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 COMPREHENSIVE FIRESTORE DIAGNOSTICS');
    console.log('═══════════════════════════════════════════════════════');
    
    // Part A: Project Matching
    await checkProjectMatch();
    
    // Part B: App Check Status
    checkAppCheckStatus();
    
    // Part C: Basic Firestore Access
    await checkFirestoreAccess();
    
    // Part D: Meta Rules Read
    await checkMetaRulesRead();
    
    // Part E: Test Writes
    await testBasicWrite();
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Diagnostics complete - check results above');
    console.log('═══════════════════════════════════════════════════════');
}

/**
 * Part A: Verify Firebase project matches
 */
export async function checkProjectMatch() {
    console.log('\n📋 PART A: Project Verification');
    console.log('─'.repeat(55));
    console.log('Client projectId:', app.options.projectId);
    console.log('Client appId:', app.options.appId);
    console.log('Client apiKey (last 6):', app.options.apiKey.slice(-6));
    console.log('Expected projectId: apes-365b0');
    console.log('✅ Verify above matches Firebase Console project');
}

/**
 * Part B: Check App Check status
 */
export function checkAppCheckStatus() {
    console.log('\n🔒 PART B: App Check Status');
    console.log('─'.repeat(55));
    if (appCheckInitialized) {
        console.log('✅ App Check: INITIALIZED');
    } else {
        console.warn('⚠️  App Check: NOT INITIALIZED');
        console.warn('   → If enforcement is ON, Firestore writes will return 403');
        console.warn('   → Check: Firebase Console → App Check → Firestore enforcement');
    }
}

/**
 * Part C: Test basic Firestore read access
 */
export async function checkFirestoreAccess() {
    console.log('\n📖 PART C: Firestore Read Access');
    console.log('─'.repeat(55));
    try {
        // Try reading a non-existent document (should work even if doc doesn't exist)
        const testDoc = await getDoc(doc(db, '__test', 'connection'));
        console.log('✅ Firestore read access works');
        console.log('   Document exists:', testDoc.exists());
    } catch (error) {
        console.error('❌ Firestore read access FAILED');
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        if (error.code === 'permission-denied') {
            console.error('   → Rules are blocking reads');
        }
    }
}

/**
 * Part D: Test meta/rules read
 */
export async function checkMetaRulesRead() {
    console.log('\n📋 PART D: Meta/Rules Read Test');
    console.log('─'.repeat(55));
    try {
        const rulesDoc = await getDoc(doc(db, 'meta', 'rules'));
        if (rulesDoc.exists()) {
            console.log('✅ meta/rules read succeeded');
            console.log('   Version:', rulesDoc.data().version);
        } else {
            console.warn('⚠️  meta/rules document does not exist');
        }
    } catch (error) {
        console.error('❌ meta/rules read FAILED');
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        if (error.code === 'permission-denied') {
            console.error('   → Rules block meta/rules read');
            console.error('   → Check: match /meta/{docId} { allow read: if docId == "rules"; }');
        }
    }
}

/**
 * Part E: Test basic write (if signed in)
 */
export async function testBasicWrite() {
    console.log('\n✍️  PART E: Basic Write Test');
    console.log('─'.repeat(55));
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
        console.warn('⚠️  Not signed in - skipping write test');
        console.warn('   → Sign in first to test writes');
        return;
    }
    
    console.log('User signed in:', currentUser.uid);
    console.log('Attempting write to __test/write_test...');
    
    try {
        await setDoc(doc(db, '__test', 'write_test'), {
            timestamp: Timestamp.now(),
            uid: currentUser.uid
        });
        console.log('✅ Basic write succeeded');
        console.log('   → Firestore writes work');
    } catch (error) {
        console.error('❌ Basic write FAILED');
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        if (error.code === 'permission-denied') {
            console.error('   → Rules are blocking writes');
            console.error('   → OR App Check is blocking (if enforcement ON)');
        }
    }
}

// Auto-run if loaded directly in console
if (typeof window !== 'undefined') {
    window.debugFirestoreAll = runAllDiagnostics;
    console.log('💡 Run: debugFirestoreAll() to run all diagnostics');
}

