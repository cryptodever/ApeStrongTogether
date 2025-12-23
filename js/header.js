/**
 * Global Header Module
 * Fetches and injects the header partial into #site-header placeholder
 * Initializes authentication UI after injection
 */

import { withBase } from './base-url.js';

let headerLoaded = false;

/**
 * Load the header partial and inject it into the page
 */
async function loadHeader() {
    const headerPlaceholder = document.getElementById('site-header');
    if (!headerPlaceholder) {
        console.error('Header: Could not find #site-header placeholder');
        return;
    }

    try {
        // Use withBase() to ensure path works from any route depth
        // Paths starting with "/" are absolute from root, withBase() preserves them
        const headerPath = withBase('/partials/header.html');
        const response = await fetch(headerPath);
        if (!response.ok) {
            throw new Error(`Failed to load header: ${response.status}`);
        }
        const html = await response.text();
        headerPlaceholder.innerHTML = html;
        headerLoaded = true;
        
        // Dispatch custom event to signal header is loaded
        window.dispatchEvent(new CustomEvent('headerLoaded'));
        
        // Bind login/signup links after header is injected
        bindHeaderAuthLinks();
        
        // Initialize mobile menu toggle
        try {
            const { initMobileMenu } = await import('./header-menu.js');
            initMobileMenu();
        } catch (error) {
            console.error('Error initializing mobile menu:', error);
        }
        
        // Initialize auth UI
        await initializeAuth();
    } catch (error) {
        console.error('Error loading header:', error);
        // Fallback: show a simple header if fetch fails
        headerPlaceholder.innerHTML = `
            <nav style="padding: 1rem; background: rgba(15, 15, 15, 0.85); border-bottom: 1px solid rgba(255,255,255,0.1);">
                <div style="max-width: 1200px; margin: 0 auto; display: flex; gap: 2rem; align-items: center; justify-content: space-between;">
                    <div style="display: flex; gap: 2rem; align-items: center;">
                        <a href="/" style="color: #e8e8e8; text-decoration: none;">APE HUB</a>
                        <a href="/roadmap/" style="color: #e8e8e8; text-decoration: none;">ROADMAP</a>
                        <a href="/generator/" style="color: #e8e8e8; text-decoration: none;">GENERATOR</a>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <a href="/login/" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #4ade80, #22c55e); color: #000; border-radius: 8px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">Log In</a>
                        <a href="/login/?mode=signup" style="padding: 0.5rem 1rem; background: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">Sign Up</a>
                    </div>
                </div>
            </nav>
        `;
    }
}

/**
 * Bind login/signup links after header is injected
 */
function bindHeaderAuthLinks() {
    // Links are now anchor tags, so they work automatically
    // Verify they exist and log for debugging
    const loginLink = document.getElementById('headerLoginBtn');
    const signupLink = document.getElementById('headerSignupBtn');
    
    if (loginLink && signupLink) {
        // Verify links are properly configured with correct paths
        const loginHref = loginLink.getAttribute('href');
        const signupHref = signupLink.getAttribute('href');
        if (loginHref && signupHref && loginHref.startsWith('/') && signupHref.startsWith('/')) {
            console.log('Header bound: login/signup');
        }
    }
}

/**
 * Initialize authentication UI after header is loaded
 */
async function initializeAuth() {
    try {
        const { initAuthUI } = await import('./auth.js');
        // Initialize auth with document.body as root (modal goes in body)
        initAuthUI({ rootElement: document.body });
    } catch (error) {
        console.error('Error initializing auth:', error);
    }
}

// Load header when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadHeader);
} else {
    loadHeader();
}

// Export for manual initialization if needed
export { loadHeader, headerLoaded };

