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
    
    if (!menuToggle) {
        console.log('Mobile menu: Toggle button not found');
        return;
    }
    
    if (!navMenu) {
        console.log('Mobile menu: Menu container not found');
        return;
    }
    
    console.log('Mobile menu: Toggle button found, attaching click handler');
    
    function toggleMenu() {
        const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
        const newState = !isExpanded;
        
        menuToggle.setAttribute('aria-expanded', newState);
        navMenu.setAttribute('aria-expanded', newState);
        
        // Toggle .is-open class on menu
        if (newState) {
            navMenu.classList.add('is-open');
            document.body.classList.add('menu-open');
        } else {
            navMenu.classList.remove('is-open');
            document.body.classList.remove('menu-open');
        }
        
        console.log(`Mobile menu: Toggled to ${newState ? 'open' : 'closed'}`);
    }
    
    function closeMenu() {
        menuToggle.setAttribute('aria-expanded', 'false');
        navMenu.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('is-open');
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

