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
    // Guard: Don't inject if already loaded
    if (headerLoaded) {
        return;
    }

    const headerPlaceholder = document.getElementById('site-header');
    if (!headerPlaceholder) {
        console.error('Header: Could not find #site-header placeholder');
        return;
    }

    // Guard: Don't inject if placeholder already has content
    if (headerPlaceholder.innerHTML.trim().length > 0) {
        console.log('Header: Already injected, skipping');
        headerLoaded = true;
        return;
    }

    // Guard: Don't inject if nav element already exists in DOM
    const existingNav = document.querySelector('nav .nav-container');
    if (existingNav) {
        console.log('Header: Nav already exists in DOM, skipping injection');
        headerLoaded = true;
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
        
        // Set global flag for asset-selftest to check
        window.headerLoaded = true;
        
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
            <nav class="fallback-nav">
                <div class="fallback-nav-container">
                    <div class="fallback-nav-links">
                        <a href="/" class="fallback-nav-link">APE HUB</a>
                        <a href="/roadmap/" class="fallback-nav-link">ROADMAP</a>
                        <a href="/generator/" class="fallback-nav-link">GENERATOR</a>
                    </div>
                    <div class="fallback-nav-auth">
                        <a href="/login/" class="fallback-nav-btn-primary">Log In</a>
                        <a href="/login/?mode=signup" class="fallback-nav-btn-secondary">Sign Up</a>
                    </div>
                </div>
            </nav>
        `;
        headerLoaded = true;
        window.headerLoaded = true;
        window.dispatchEvent(new CustomEvent('headerLoaded'));
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

