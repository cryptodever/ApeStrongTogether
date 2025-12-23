/**
 * Roadmap page functionality
 */

export function initRoadmap() {
    // Initialize: Phase 1 expanded by default
    const phase1 = document.getElementById('phase-1');
    if (phase1) {
        phase1.classList.add('expanded');
    }
}

export function togglePhase(phaseNumber) {
    const phaseDetails = document.getElementById(`phase-${phaseNumber}`);
    if (!phaseDetails) return;
    
    const isExpanded = phaseDetails.classList.contains('expanded');
    
    // Close all phases first
    document.querySelectorAll('.phase-details').forEach(details => {
        details.classList.remove('expanded');
    });
    
    // If this phase wasn't expanded, expand it
    if (!isExpanded) {
        phaseDetails.classList.add('expanded');
    }
}

// Make togglePhase available globally for onclick handlers
window.togglePhase = togglePhase;

