/**
 * Base URL Helper Module
 * Provides route-safe path resolution for static sites (GitHub Pages, custom domains)
 * 
 * Works correctly from:
 * - Root: /
 * - Subdirectories: /profile/, /login/, etc.
 * - GitHub Pages: /repo-name/ or custom domain
 */

/**
 * Get the base path for the current page
 * @returns {string} Base path (e.g., "", "/repo-name", "/generator")
 */
export function getBasePath() {
    // Get the pathname (e.g., "/profile/index.html" or "/index.html")
    const pathname = window.location.pathname;
    
    // Remove filename (index.html, etc.) and trailing slashes
    let basePath = pathname.replace(/\/[^/]*\.html?$/, '').replace(/\/$/, '');
    
    // If we're at root, basePath should be empty string (not "/")
    // If we're in a subdirectory like /profile/, basePath will be "/profile"
    return basePath || '';
}

/**
 * Prefix a path with the base path
 * @param {string} path - Path to prefix (should start with "/" for absolute paths)
 * @returns {string} Path prefixed with base path
 * 
 * Examples:
 * - from /generator: withBase("/js/app.js") -> "/js/app.js" (absolute from root)
 * - from /profile: withBase("js/app.js") -> "/profile/js/app.js" (relative)
 */
export function withBase(path) {
    // If path is already absolute (starts with /), use it as-is from root
    if (path.startsWith('/')) {
        return path;
    }
    
    // For relative paths, prefix with base path
    const basePath = getBasePath();
    if (!basePath) {
        return '/' + path;
    }
    
    // Ensure single slash between base and path
    return basePath + '/' + path.replace(/^\//, '');
}

/**
 * Resolve a relative path to an absolute URL
 * @param {string} relativePath - Relative path like "../assets/image.png"
 * @returns {string} Absolute URL
 */
export function resolvePath(relativePath) {
    // Use new URL() to resolve relative to current page
    return new URL(relativePath, window.location.href).href;
}

