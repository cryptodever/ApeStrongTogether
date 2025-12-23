/**
 * Mobile Menu Toggle
 * Handles hamburger menu open/close on mobile devices
 */

/**
 * Initialize mobile menu toggle
 */
function initMobileMenu() {
    const menuToggle = document.getElementById('navMenuToggle');
    const navMenu = document.getElementById('navMenu');
    
    if (!menuToggle || !navMenu) {
        return;
    }
    
    function toggleMenu() {
        const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
        const newState = !isExpanded;
        
        menuToggle.setAttribute('aria-expanded', newState);
        navMenu.setAttribute('aria-expanded', newState);
        
        // Prevent body scroll when menu is open
        if (newState) {
            document.body.classList.add('menu-open');
        } else {
            document.body.classList.remove('menu-open');
        }
    }
    
    function closeMenu() {
        menuToggle.setAttribute('aria-expanded', 'false');
        navMenu.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('menu-open');
    }
    
    // Toggle menu on button click
    menuToggle.addEventListener('click', toggleMenu);
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navMenu.getAttribute('aria-expanded') === 'true' && 
            !navMenu.contains(e.target) && 
            !menuToggle.contains(e.target)) {
            closeMenu();
        }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.getAttribute('aria-expanded') === 'true') {
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    initMobileMenu();
}

// Also initialize after header is loaded (for dynamically injected headers)
window.addEventListener('headerLoaded', initMobileMenu);

// Export for manual initialization
export { initMobileMenu };

