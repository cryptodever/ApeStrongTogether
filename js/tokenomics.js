/**
 * Tokenomics Page Interactive Elements
 * Handles FAQ toggles, tooltips, pie chart, and copy functionality
 */

// FAQ Toggle Functionality
document.addEventListener('DOMContentLoaded', () => {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        const toggle = item.querySelector('.faq-toggle');
        
        if (question && answer && toggle) {
            question.addEventListener('click', () => {
                const isOpen = item.classList.contains('active');
                
                // Close all other FAQs
                faqItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                        const otherToggle = otherItem.querySelector('.faq-toggle');
                        if (otherToggle) otherToggle.textContent = '+';
                    }
                });
                
                // Toggle current FAQ
                if (isOpen) {
                    item.classList.remove('active');
                    toggle.textContent = '+';
                } else {
                    item.classList.add('active');
                    toggle.textContent = '−';
                }
            });
        }
    });
    
    // Tooltip functionality
    const tooltipTriggers = document.querySelectorAll('.tooltip-trigger');
    tooltipTriggers.forEach(trigger => {
        const tooltipText = trigger.getAttribute('data-tooltip');
        if (!tooltipText) return;
        
        let tooltipElement = null;
        
        trigger.addEventListener('mouseenter', (e) => {
            tooltipElement = document.createElement('div');
            tooltipElement.className = 'tooltip';
            tooltipElement.textContent = tooltipText;
            document.body.appendChild(tooltipElement);
            
            const rect = trigger.getBoundingClientRect();
            tooltipElement.style.left = rect.left + (rect.width / 2) + 'px';
            tooltipElement.style.top = rect.top - tooltipElement.offsetHeight - 10 + 'px';
            tooltipElement.style.transform = 'translateX(-50%)';
        });
        
        trigger.addEventListener('mouseleave', () => {
            if (tooltipElement) {
                tooltipElement.remove();
                tooltipElement = null;
            }
        });
    });
    
    // Copy contract address functionality
    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-copy');
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const text = targetElement.textContent.trim();
                try {
                    await navigator.clipboard.writeText(text);
                    btn.textContent = '✓';
                    setTimeout(() => {
                        btn.textContent = '📋';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            }
        });
    });
    
    // Initialize pie chart (placeholder - will need actual percentages)
    initializePieChart();
});

// Pie Chart Initialization
function initializePieChart() {
    const svg = document.getElementById('feePieChart');
    if (!svg) return;
    
    // Placeholder percentages - replace with actual values
    const allocations = [
        { percent: 40, color: '#4ade80', label: 'Liquidity Growth' },
        { percent: 25, color: '#22c55e', label: 'Market Making' },
        { percent: 20, color: '#16a34a', label: 'Buyback & Burn' },
        { percent: 15, color: '#15803d', label: 'Creator Revenue' }
    ];
    
    const centerX = 100;
    const centerY = 100;
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    let currentOffset = 0;
    
    // Clear existing segments
    svg.innerHTML = '';
    
    allocations.forEach((allocation, index) => {
        const percent = allocation.percent;
        const dashLength = (percent / 100) * circumference;
        const dashOffset = circumference - currentOffset;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'pie-segment');
        circle.setAttribute('cx', centerX);
        circle.setAttribute('cy', centerY);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', allocation.color);
        circle.setAttribute('stroke-width', '40');
        circle.setAttribute('stroke-dasharray', `${dashLength} ${circumference}`);
        circle.setAttribute('stroke-dashoffset', dashOffset);
        circle.setAttribute('data-percent', percent);
        circle.setAttribute('data-label', allocation.label);
        circle.setAttribute('transform', 'rotate(-90 100 100)');
        
        svg.appendChild(circle);
        
        currentOffset += dashLength;
    });
}

