/**
 * Mobile Menu Toggle
 * Handles hamburger menu open/close on mobile devices
 * Uses a body-attached overlay to avoid stacking context issues
 */

let mobileMenuOverlay = null;
let mobileMenuPanel = null;

/**
 * Create mobile menu overlay and panel (appended to body)
 */
function createMobileMenuOverlay() {
    // Always recreate to get latest content
    if (mobileMenuOverlay && mobileMenuOverlay.parentNode) {
        mobileMenuOverlay.parentNode.removeChild(mobileMenuOverlay);
    }
    
    // Create overlay
    mobileMenuOverlay = document.createElement('div');
    mobileMenuOverlay.className = 'mobile-menu-overlay';
    mobileMenuOverlay.setAttribute('aria-hidden', 'true');
    
    // Create panel
    mobileMenuPanel = document.createElement('div');
    mobileMenuPanel.className = 'mobile-menu-panel';
    
    // Clone menu content from original nav-links
    const originalMenu = document.getElementById('navMenu');
    if (originalMenu) {
        mobileMenuPanel.innerHTML = originalMenu.innerHTML;
    }
    
    mobileMenuOverlay.appendChild(mobileMenuPanel);
    
    return mobileMenuOverlay;
}

/**
 * Initialize mobile menu toggle
 */
function initMobileMenu() {
    console.log('Mobile menu: Initializing...');
    
    const menuToggle = document.getElementById('navMenuToggle');
    const navMenu = document.getElementById('navMenu');
    
    if (!menuToggle) {
        console.error('Mobile menu: Toggle button (#navMenuToggle) not found');
        return;
    }
    
    console.log('Mobile menu: Toggle button found', menuToggle);
    
    // Verify it's a button element
    if (menuToggle.tagName !== 'BUTTON') {
        console.error('Mobile menu: Toggle element is not a button, got:', menuToggle.tagName);
        return;
    }
    
    if (!navMenu) {
        console.error('Mobile menu: Menu container (#navMenu) not found');
        return;
    }
    
    console.log('Mobile menu: Menu container found', navMenu);
    
    // Check if button already has a click handler (prevent duplicates)
    if (menuToggle.hasAttribute('data-menu-initialized')) {
        console.warn('Mobile menu: Already initialized, skipping');
        return;
    }
    menuToggle.setAttribute('data-menu-initialized', 'true');
    
    // Attach overlay listeners function
    function attachOverlayListeners() {
        if (!mobileMenuOverlay || !mobileMenuPanel) return;
        
        // Close menu when clicking overlay (outside panel)
        mobileMenuOverlay.addEventListener('click', (e) => {
            if (e.target === mobileMenuOverlay) {
                closeMenu();
            }
        });
        
        // Close menu when clicking a nav link or button (mobile navigation)
        mobileMenuPanel.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' || e.target.closest('a') || 
                e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                setTimeout(closeMenu, 100);
            }
        });
    }
    
    function openMenu() {
        console.log('Mobile menu: Opening...');
        
        // Create/recreate overlay to get latest content
        createMobileMenuOverlay();
        attachOverlayListeners();
        
        // Update button state
        menuToggle.setAttribute('aria-expanded', 'true');
        
        // Prevent body scroll
        document.body.classList.add('menu-open');
        document.body.style.overflow = 'hidden';
        
        // Show overlay
        mobileMenuOverlay.setAttribute('aria-hidden', 'false');
        mobileMenuOverlay.classList.add('is-open');
        document.body.appendChild(mobileMenuOverlay);
        
        // Update original menu class for CSS compatibility
        navMenu.classList.add('is-open');
        
        console.log('Mobile menu: Opened');
    }
    
    function closeMenu() {
        console.log('Mobile menu: Closing...');
        
        // Update button state
        menuToggle.setAttribute('aria-expanded', 'false');
        
        // Restore body scroll
        document.body.classList.remove('menu-open');
        document.body.style.overflow = '';
        
        // Hide overlay
        if (mobileMenuOverlay) {
            mobileMenuOverlay.setAttribute('aria-hidden', 'true');
            mobileMenuOverlay.classList.remove('is-open');
            
            // Remove from DOM after transition
            setTimeout(() => {
                if (mobileMenuOverlay && mobileMenuOverlay.parentNode) {
                    mobileMenuOverlay.parentNode.removeChild(mobileMenuOverlay);
                }
            }, 300);
        }
        
        // Update original menu class for CSS compatibility
        navMenu.classList.remove('is-open');
        
        console.log('Mobile menu: Closed');
    }
    
    function toggleMenu(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        console.log('Mobile menu: Click event fired');
        
        const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
        
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }
    
    // Toggle menu on button click
    console.log('Mobile menu: Attaching click handler to button');
    menuToggle.addEventListener('click', toggleMenu, { passive: false });
    
    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
            closeMenu();
            menuToggle.focus();
        }
    });
    
    console.log('Mobile menu: Initialization complete');
}

// Initialize only after header is loaded (via headerLoaded event)
// Do NOT initialize at module top-level - wait for header injection to complete
window.addEventListener('headerLoaded', () => {
    console.log('Mobile menu: headerLoaded event received, initializing...');
    initMobileMenu();
});

// Export for manual initialization
export { initMobileMenu };
