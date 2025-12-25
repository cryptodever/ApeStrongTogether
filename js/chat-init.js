/**
 * Chat Page Initialization Module
 * Handles authentication gate and chat page setup
 */

// Initialize auth gate for chat page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Chat init: Auth gate initialization error:', error);
        // If auth gate fails, show overlay as fallback
        const overlay = document.getElementById('authGateOverlay');
        if (overlay) {
            overlay.classList.add('show');
        }
    }
})();

console.log('Chat page initialized');

