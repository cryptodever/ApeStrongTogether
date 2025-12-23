/**
 * Firestore Health Check Module
 * Tests Firestore connectivity on page load
 */

import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

/**
 * Run Firestore health check with timeout
 */
async function checkFirestoreHealth() {
    const statusEl = document.getElementById('firestoreStatus');
    
    try {
        // Create a timeout promise (6 seconds)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Health check timed out after 6 seconds')), 6000);
        });
        
        // Race between getDoc and timeout
        await Promise.race([
            getDoc(doc(db, '__health', 'ping')),
            timeoutPromise
        ]);
        
        // Success
        const successMsg = 'Firestore reachable';
        console.log(`✅ ${successMsg}`);
        
        if (statusEl) {
            statusEl.textContent = `✅ ${successMsg}`;
            statusEl.style.color = '#4ade80';
            statusEl.className = 'firestore-status success';
        }
        
        return { success: true, message: successMsg };
    } catch (error) {
        // Failure
        const isOnline = navigator.onLine;
        const errorCode = error?.code || 'unknown';
        const errorMessage = error?.message || 'Unknown error';
        
        const failMsg = `Firestore unreachable (${errorCode}, online: ${isOnline})`;
        console.error(`❌ ${failMsg}`);
        console.error('Error details:', {
            code: errorCode,
            message: errorMessage,
            online: isOnline,
            error: error
        });
        
        if (statusEl) {
            statusEl.textContent = `⚠️ ${failMsg}`;
            statusEl.style.color = '#f87171';
            statusEl.className = 'firestore-status error';
        }
        
        return { 
            success: false, 
            code: errorCode, 
            message: errorMessage, 
            online: isOnline 
        };
    }
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

