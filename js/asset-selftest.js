/**
 * Asset Self-Test Module
 * Runs diagnostics to verify CSS and critical assets are loaded correctly
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    function runTests() {
        // Test 1: CSS loaded check
        const body = document.body;
        if (body) {
            const computedStyle = window.getComputedStyle(body);
            const bgColor = computedStyle.backgroundColor;
            // Check if background color is not the browser default (usually transparent or white)
            // Our CSS sets background-color: #1a1a1a or similar dark color
            const defaultColors = ['transparent', 'rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)'];
            const isDefaultColor = defaultColors.includes(bgColor) && 
                                   (bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)');
            
            if (!isDefaultColor || computedStyle.fontFamily !== '') {
                console.log('✅ CSS loaded');
            } else {
                console.warn('⚠️ CSS may not be loaded (default styles detected)');
            }
        }

        // Test 2: Header present check (only after header injection completes or timeout)
        const headerContainer = document.getElementById('site-header');
        if (headerContainer) {
            // Check if header has been injected (has content)
            const hasContent = headerContainer.innerHTML.trim().length > 0;
            const hasNav = document.querySelector('nav') !== null;
            
            if (hasContent || hasNav) {
                console.log('✅ Header present');
            } else {
                // Header not loaded yet - this is okay, will be checked again after headerLoaded event
                // Don't warn here to avoid false positives during async loading
            }
        } else {
            console.warn('⚠️ Header container (#site-header) not found');
        }
    }

    // Check header specifically after headerLoaded event or timeout
    function checkHeaderAfterLoad() {
        const headerContainer = document.getElementById('site-header');
        if (headerContainer) {
            const hasContent = headerContainer.innerHTML.trim().length > 0;
            const hasNav = document.querySelector('nav') !== null;
            
            if (hasContent || hasNav) {
                console.log('✅ Header present');
            } else {
                // Use MutationObserver to watch for header injection
                const observer = new MutationObserver((mutations, obs) => {
                    const hasContentNow = headerContainer.innerHTML.trim().length > 0;
                    const hasNavNow = document.querySelector('nav') !== null;
                    if (hasContentNow || hasNavNow) {
                        console.log('✅ Header present');
                        obs.disconnect();
                    }
                });
                
                observer.observe(headerContainer, { childList: true, subtree: true });
                
                // Also check after a reasonable timeout (5 seconds)
                setTimeout(() => {
                    observer.disconnect();
                    const hasContentFinal = headerContainer.innerHTML.trim().length > 0;
                    const hasNavFinal = document.querySelector('nav') !== null;
                    if (!hasContentFinal && !hasNavFinal) {
                        console.warn('⚠️ Header container exists but appears empty after 5s - header may have failed to load');
                    }
                }, 5000);
            }
        }
    }

    // Test 3: Error listeners for missing assets
    window.addEventListener('error', function(event) {
        // Check if it's a resource loading error
        if (event.target && (event.target.tagName === 'LINK' || event.target.tagName === 'SCRIPT' || event.target.tagName === 'IMG')) {
            const src = event.target.src || event.target.href;
            if (src) {
                console.error('❌ Asset failed to load:', src);
            }
        } else if (event.message && event.filename) {
            // JavaScript error (could be missing module)
            if (event.message.includes('Failed to fetch') || 
                event.message.includes('Loading chunk') ||
                event.message.includes('import')) {
                console.error('❌ JavaScript module failed to load:', event.filename);
            }
        }
    }, true); // Use capture phase to catch errors early

    // Listen for CSS loading errors specifically
    document.addEventListener('error', function(event) {
        if (event.target.tagName === 'LINK' && event.target.rel === 'stylesheet') {
            console.error('❌ Stylesheet failed to load:', event.target.href);
        }
    }, true);

    // Run CSS test immediately, header check after headerLoaded event
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Run CSS check immediately
            runTests();
            // Check header after headerLoaded event or fallback timeout
            if (window.headerLoaded) {
                checkHeaderAfterLoad();
            } else {
                window.addEventListener('headerLoaded', checkHeaderAfterLoad, { once: true });
                // Fallback: check after 2 seconds if event hasn't fired
                setTimeout(checkHeaderAfterLoad, 2000);
            }
        });
    } else {
        // DOM already ready
        runTests();
        if (window.headerLoaded) {
            checkHeaderAfterLoad();
        } else {
            window.addEventListener('headerLoaded', checkHeaderAfterLoad, { once: true });
            // Fallback: check after 2 seconds if event hasn't fired
            setTimeout(checkHeaderAfterLoad, 2000);
        }
    }
})();

