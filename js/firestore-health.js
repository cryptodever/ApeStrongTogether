/**
 * Firestore Health Check Module
 * Tests Firestore connectivity on page load (REST and SDK)
 */

import { db, apiKey, projectId } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

/**
 * Check Firestore REST API reachability
 */
async function checkRestPing() {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/__health/ping?key=${apiKey}`;
    
    try {
        // Create a timeout promise (6 seconds)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('REST ping timed out after 6 seconds')), 6000);
        });
        
        // Race between fetch and timeout
        const response = await Promise.race([
            fetch(url, { method: 'GET' }),
            timeoutPromise
        ]);
        
        if (response.ok) {
            console.log('✅ REST reachable: yes');
            return { success: true, message: 'REST reachable: yes' };
        } else {
            const errorText = await response.text().catch(() => 'Unable to read response');
            console.error(`❌ REST reachable: no (HTTP ${response.status})`);
            console.error('REST error response:', errorText);
            return { success: false, message: `REST reachable: no (HTTP ${response.status})`, error: errorText };
        }
    } catch (error) {
        const errorMessage = error?.message || String(error) || 'Unknown error';
        console.error('❌ REST reachable: no');
        console.error('REST error:', errorMessage);
        return { success: false, message: 'REST reachable: no', error: errorMessage };
    }
}

/**
 * Check if error indicates Firestore database is missing
 */
function isDatabaseMissingError(error) {
    const code = error?.code || '';
    const message = error?.message || String(error) || '';
    return code === 'not-found' && /database.*\(default\).*does not exist/i.test(message);
}

/**
 * Check Firestore SDK reachability
 */
async function checkSdkPing() {
    try {
        // Create a timeout promise (6 seconds)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('SDK ping timed out after 6 seconds')), 6000);
        });
        
        // Race between getDoc and timeout
        await Promise.race([
            getDoc(doc(db, '__health', 'ping')),
            timeoutPromise
        ]);
        
        console.log('✅ SDK reachable: yes');
        return { success: true, message: 'SDK reachable: yes' };
    } catch (error) {
        const errorCode = error?.code || 'unknown';
        const errorMessage = error?.message || String(error) || 'Unknown error';
        
        // Check for database missing error
        if (isDatabaseMissingError(error)) {
            console.error('❌ Firestore database not enabled');
            return { success: false, message: 'Firestore NOT enabled for this project (create database in Firebase Console)', code: errorCode, error: errorMessage, isDatabaseMissing: true };
        }
        
        console.error('❌ SDK reachable: no');
        console.error('SDK error:', { code: errorCode, message: errorMessage });
        return { success: false, message: 'SDK reachable: no', code: errorCode, error: errorMessage };
    }
}

/**
 * Run Firestore health check with timeout (REST and SDK)
 */
async function checkFirestoreHealth() {
    const statusEl = document.getElementById('firestoreStatus');
    
    // Check REST first
    const restResult = await checkRestPing();
    
    // Check SDK second
    const sdkResult = await checkSdkPing();
    
    // Combine results
    const isOnline = navigator.onLine;
    const restStatus = restResult.success ? 'yes' : 'no';
    const sdkStatus = sdkResult.success ? 'yes' : 'no';
    
    // Check if database is missing (special case)
    if (sdkResult.isDatabaseMissing) {
        const statusMsg = 'Firestore NOT enabled for this project (create database in Firebase Console)';
        if (statusEl) {
            statusEl.textContent = `❌ ${statusMsg}`;
            statusEl.style.color = '#f87171';
            statusEl.className = 'firestore-status error';
        }
    } else {
        const statusMsg = `REST reachable: ${restStatus} | SDK reachable: ${sdkStatus}`;
        if (statusEl) {
            if (restResult.success && sdkResult.success) {
                statusEl.textContent = `✅ ${statusMsg}`;
                statusEl.style.color = '#4ade80';
                statusEl.className = 'firestore-status success';
            } else {
                statusEl.textContent = `⚠️ ${statusMsg}`;
                statusEl.style.color = '#f87171';
                statusEl.className = 'firestore-status error';
            }
        }
    }
    
    return {
        rest: restResult,
        sdk: sdkResult,
        online: isOnline
    };
}

/**
 * Initialize health check when DOM is ready
 */
function initHealthCheck() {
    // Wait a bit for Firebase to initialize
    setTimeout(() => {
        checkFirestoreHealth();
    }, 500);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHealthCheck);
} else {
    initHealthCheck();
}

// Export for manual testing if needed
export { checkFirestoreHealth };

