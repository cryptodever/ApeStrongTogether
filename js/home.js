/**
 * Home page functionality
 */

export function initHome() {
    // Copy token address functionality
    const copyButton = document.getElementById('copyButton');
    if (copyButton) {
        copyButton.addEventListener('click', copyTokenAddress);
    }
}

function copyTokenAddress() {
    const addressElement = document.getElementById('tokenAddress');
    const button = document.getElementById('copyButton');
    if (!addressElement || !button) return;
    
    const address = addressElement.textContent;
    
    navigator.clipboard.writeText(address).then(function() {
        const originalText = button.textContent;
        button.textContent = 'Copied ✅';
        button.classList.add('copied');
        
        setTimeout(function() {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(function(err) {
        console.error('Failed to copy:', err);
        button.textContent = 'Error';
        setTimeout(function() {
            button.textContent = 'Copy';
        }, 2000);
    });
}

