/**
 * Mobile Menu Toggle
 * Handles hamburger menu open/close on mobile devices
 */

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
    
    function toggleMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Mobile menu: Click event fired');
        
        // Use .is-open class as single source of truth
        const isOpen = navMenu.classList.contains('is-open');
        const newState = !isOpen;
        
        // Update .is-open class (single source of truth)
        if (newState) {
            navMenu.classList.add('is-open');
            document.body.classList.add('menu-open');
            menuToggle.setAttribute('aria-expanded', 'true');
        } else {
            navMenu.classList.remove('is-open');
            document.body.classList.remove('menu-open');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
        
        console.log(`Mobile menu: Toggled to ${newState ? 'open' : 'closed'} (is-open: ${navMenu.classList.contains('is-open')})`);
    }
    
    function closeMenu() {
        navMenu.classList.remove('is-open');
        document.body.classList.remove('menu-open');
        menuToggle.setAttribute('aria-expanded', 'false');
    }
    
    // Toggle menu on button click
    console.log('Mobile menu: Attaching click handler to button');
    menuToggle.addEventListener('click', toggleMenu, { passive: false });
    
    console.log('Mobile menu: Initialization complete');
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('is-open') && 
            !navMenu.contains(e.target) && 
            !menuToggle.contains(e.target)) {
            closeMenu();
        }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
            closeMenu();
            menuToggle.focus();
        }
    });
    
    // Close menu when clicking a nav link (mobile navigation)
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Small delay to allow navigation to start
            setTimeout(closeMenu, 100);
        });
    });
}

// Initialize only after header is loaded (via headerLoaded event)
// Do NOT initialize at module top-level - wait for header injection to complete
window.addEventListener('headerLoaded', () => {
    console.log('Mobile menu: headerLoaded event received, initializing...');
    initMobileMenu();
});

// Export for manual initialization
export { initMobileMenu };

