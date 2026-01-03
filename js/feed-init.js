/**
 * Feed page initialization
 */

// Initialize auth gate for feed page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Feed init: Auth gate initialization error:', error);
    }
})();

import { initFeed } from '/js/feed.js?v=1';
initFeed();
