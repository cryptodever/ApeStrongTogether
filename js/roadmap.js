/**
 * Roadmap page functionality
 */

export function initRoadmap() {
    // Initialize: Phase 1 expanded by default
    const phase1 = document.getElementById('phase-1');
    if (phase1) {
        phase1.classList.add('expanded');
    }
    
    // Attach event listeners to phase headers
    document.querySelectorAll('.phase-header[data-phase]').forEach(header => {
        header.addEventListener('click', () => {
            const phaseNumber = parseInt(header.getAttribute('data-phase'));
            togglePhase(phaseNumber);
        });
    });
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

