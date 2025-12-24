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
    
    // Get original menu for content
    const originalMenu = document.getElementById('navMenu');
    const authLoggedOut = document.getElementById('authLoggedOut');
    const authLoggedIn = document.getElementById('authLoggedIn');
    
    // Build panel structure
    // Header row: APE HUB + Close button
    const header = document.createElement('div');
    header.className = 'mobile-menu-header';
    
    const brand = document.createElement('a');
    brand.href = '/';
    brand.className = 'mobile-menu-brand';
    brand.textContent = 'APE HUB';
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mobile-menu-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '&times;';
    
    header.appendChild(brand);
    header.appendChild(closeBtn);
    
    // Nav links section
    const linksSection = document.createElement('div');
    linksSection.className = 'mobile-menu-links';
    
    // Add nav links (excluding APE HUB since it's already in the header)
    if (originalMenu) {
        const navLinks = originalMenu.querySelectorAll('a:not(.nav-social-icon):not(.nav-auth-btn)');
        navLinks.forEach(link => {
            // Skip APE HUB link since it's already in the header brand
            const linkText = link.textContent.trim();
            if (linkText !== 'APE HUB') {
                const menuLink = document.createElement('a');
                menuLink.href = link.href;
                menuLink.className = 'mobile-menu-link';
                menuLink.textContent = linkText;
                if (link.target) menuLink.target = link.target;
                if (link.rel) menuLink.rel = link.rel;
                linksSection.appendChild(menuLink);
            }
        });
    }
    
    // Social icons section (if exists)
    const socialsContainer = originalMenu?.querySelector('.nav-socials');
    if (socialsContainer && socialsContainer.innerHTML.trim()) {
        const socialsWrapper = document.createElement('div');
        socialsWrapper.className = 'mobile-menu-socials';
        socialsWrapper.innerHTML = socialsContainer.innerHTML;
        linksSection.appendChild(socialsWrapper);
    }
    
    // Auth section at bottom
    const actionsSection = document.createElement('div');
    actionsSection.className = 'mobile-menu-actions';
    
    // Determine which auth section to show
    const isLoggedIn = authLoggedIn && !authLoggedIn.classList.contains('hide');
    const isLoggedOut = authLoggedOut && !authLoggedOut.classList.contains('hide');
    
    if (isLoggedOut && authLoggedOut) {
        // Logged out: show Log In + Sign Up buttons
        const loginBtn = authLoggedOut.querySelector('#headerLoginBtn');
        const signupBtn = authLoggedOut.querySelector('#headerSignupBtn');
        
        if (loginBtn) {
            const btn = document.createElement('a');
            btn.href = loginBtn.href;
            btn.className = 'mobile-menu-btn mobile-menu-btn-primary';
            btn.textContent = loginBtn.textContent.trim();
            actionsSection.appendChild(btn);
        }
        
        if (signupBtn) {
            const btn = document.createElement('a');
            btn.href = signupBtn.href;
            btn.className = 'mobile-menu-btn mobile-menu-btn-secondary';
            btn.textContent = signupBtn.textContent.trim();
            actionsSection.appendChild(btn);
        }
    } else if (isLoggedIn && authLoggedIn) {
        // Logged in: show user info + Log Out button
        const userEmailDisplay = document.getElementById('userEmailDisplay');
        const logoutBtn = authLoggedIn.querySelector('#headerLogoutBtn');
        
        if (userEmailDisplay) {
            const userInfo = document.createElement('div');
            userInfo.className = 'mobile-menu-user';
            userInfo.textContent = `Logged in as: ${userEmailDisplay.textContent}`;
            actionsSection.appendChild(userInfo);
        }
        
        if (logoutBtn) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mobile-menu-btn mobile-menu-btn-secondary';
            btn.textContent = logoutBtn.textContent.trim();
            btn.id = 'mobileMenuLogoutBtn';
            actionsSection.appendChild(btn);
        }
    }
    
    // Assemble panel
    mobileMenuPanel.appendChild(header);
    mobileMenuPanel.appendChild(linksSection);
    mobileMenuPanel.appendChild(actionsSection);
    
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
        
        // Attach close button handler
        const closeBtn = mobileMenuPanel.querySelector('.mobile-menu-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeMenu);
        }
        
        // Attach logout button handler if it exists
        const mobileLogoutBtn = document.getElementById('mobileMenuLogoutBtn');
        if (mobileLogoutBtn) {
            const originalLogoutBtn = document.getElementById('headerLogoutBtn');
            if (originalLogoutBtn) {
                mobileLogoutBtn.addEventListener('click', () => {
                    originalLogoutBtn.click();
                    closeMenu();
                });
            }
        }
        
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
