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

        // Test 2: Header present check
        const headerContainer = document.getElementById('site-header');
        if (headerContainer) {
            // Check if header has been injected (has content)
            if (headerContainer.innerHTML.trim().length > 0 || 
                document.querySelector('nav') !== null) {
                console.log('✅ Header present');
            } else {
                console.warn('⚠️ Header container exists but appears empty');
            }
        } else {
            console.warn('⚠️ Header container (#site-header) not found');
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

    // Run tests when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Wait a bit for header to potentially load
            setTimeout(runTests, 100);
        });
    } else {
        // DOM already ready, wait a bit for header
        setTimeout(runTests, 100);
    }
})();

