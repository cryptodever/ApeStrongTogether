/**
 * Authentication Gate Module
 * Blocks access to protected pages unless user is authenticated and email verified
 */

import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

let authGateOverlay = null;

// Initialize auth gate
export function initAuthGate() {
    console.log('AuthGate: Initializing...');
    
    // Create overlay if it doesn't exist
    if (!document.getElementById('authGateOverlay')) {
        createOverlay();
    }
    
    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is logged in - check email verification
            // Skip verification check on verify page itself
            if (window.location.pathname.includes('/verify/')) {
                hideOverlay();
                return;
            }
            
            try {
                // Reload user to get latest verification status
                await user.reload();
                const currentUser = auth.currentUser;
                
                if (currentUser && !currentUser.emailVerified) {
                    // Email not verified - redirect to verify page
                    console.log('AuthGate: email not verified, redirecting to /verify/');
                    window.location.href = '/verify/';
                } else {
                    // User is verified - hide overlay
                    hideOverlay();
                    console.log(`AuthGate: logged in and verified as ${user.uid}`);
                }
            } catch (error) {
                console.error('AuthGate: error checking verification status:', error);
                // On error, still check the user object directly
                if (user.emailVerified) {
                    hideOverlay();
                    console.log(`AuthGate: logged in as ${user.uid}`);
                } else {
                    console.log('AuthGate: email not verified, redirecting to /verify/');
                    window.location.href = '/verify/';
                }
            }
        } else {
            // User is not logged in - show overlay
            showOverlay();
            console.log('AuthGate: not logged in, blocking access');
        }
    });
}

function createOverlay() {
    // Find the container (profile, chat, quests, or leaderboard)
    const profileContainer = document.querySelector('.profile-container');
    const chatContainer = document.querySelector('.chat-container');
    const questsContainer = document.querySelector('.quests-container');
    const leaderboardContainer = document.querySelector('.leaderboard-container');
    const container = profileContainer || chatContainer || questsContainer || leaderboardContainer;
    
    if (!container) {
        console.error('AuthGate: Could not find .profile-container, .chat-container, .quests-container, or .leaderboard-container');
        return;
    }
    
    // Determine page type and message
    const isChatPage = !!chatContainer;
    const isProfilePage = !!profileContainer;
    const isQuestsPage = !!questsContainer;
    const isLeaderboardPage = !!leaderboardContainer;
    const pageMessage = isChatPage 
        ? 'Sign up / Log in to access live chat.' 
        : isProfilePage
        ? 'Sign up / Log in to access your profile.'
        : isQuestsPage
        ? 'Sign up / Log in to access quests.'
        : isLeaderboardPage
        ? 'Sign up / Log in to view the leaderboard.'
        : 'Sign up / Log in to generate your Ape.';
    
    // Note: Both containers already have position: relative in CSS, so no need to add class
    
    authGateOverlay = document.createElement('div');
    authGateOverlay.id = 'authGateOverlay';
    authGateOverlay.className = 'auth-gate-overlay';
    authGateOverlay.innerHTML = `
        <div class="auth-gate-content">
            <div class="auth-gate-icon">🦍</div>
            <h2 class="auth-gate-title">Members Only</h2>
            <p class="auth-gate-message">${pageMessage}</p>
            <div class="auth-gate-buttons">
                <button class="btn btn-primary" id="authGateLoginBtn">Log In</button>
                <button class="btn btn-secondary" id="authGateSignupBtn">Sign Up</button>
            </div>
        </div>
    `;
    
    // Append overlay to container (not body)
    container.appendChild(authGateOverlay);
    
    // Wire up buttons to open auth modal
    setupOverlayButtons();
}

function setupOverlayButtons() {
    const loginBtn = document.getElementById('authGateLoginBtn');
    const signupBtn = document.getElementById('authGateSignupBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            // Redirect to login page
            window.location.href = '/login/';
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            // Redirect to signup page (login with mode parameter)
            window.location.href = '/login/?mode=signup';
        });
    }
}

function showOverlay() {
    if (authGateOverlay) {
        authGateOverlay.classList.add('show');
        // Disable pointer events on container content (but not header)
        const profileContainer = document.querySelector('.profile-container');
        const chatContainer = document.querySelector('.chat-container');
        const questsContainer = document.querySelector('.quests-container');
        const leaderboardContainer = document.querySelector('.leaderboard-container');
        const container = profileContainer || chatContainer || questsContainer || leaderboardContainer;
        
        if (container) {
            // Add blocked class to container for CSS styling
            container.classList.add('blocked');
            
            // For profile page, also add blocked class to profile-page
            if (profileContainer) {
                const profilePage = document.querySelector('.profile-page');
                if (profilePage) {
                    profilePage.classList.add('blocked');
                }
            }
            
            // For quests page, also add blocked class to quests-page
            if (questsContainer) {
                const questsPage = document.querySelector('.quests-page');
                if (questsPage) {
                    questsPage.classList.add('blocked');
                }
            }
            
            // For leaderboard page, also add blocked class to leaderboard-page
            if (leaderboardContainer) {
                const leaderboardPage = document.querySelector('.leaderboard-page');
                if (leaderboardPage) {
                    leaderboardPage.classList.add('blocked');
                }
            }
            
            // Disable pointer events on all children except the overlay
            Array.from(container.children).forEach(child => {
                if (child.id !== 'authGateOverlay') {
                    child.classList.add('pointer-events-none');
                }
            });
        }
    }
}

function hideOverlay() {
    if (authGateOverlay) {
        authGateOverlay.classList.remove('show');
        // Re-enable pointer events on container content
        const profileContainer = document.querySelector('.profile-container');
        const chatContainer = document.querySelector('.chat-container');
        const questsContainer = document.querySelector('.quests-container');
        const leaderboardContainer = document.querySelector('.leaderboard-container');
        const container = profileContainer || chatContainer || questsContainer || leaderboardContainer;
        
        if (container) {
            // Remove blocked class from container
            container.classList.remove('blocked');
            
            // For profile page, also remove blocked class from profile-page
            if (profileContainer) {
                const profilePage = document.querySelector('.profile-page');
                if (profilePage) {
                    profilePage.classList.remove('blocked');
                }
            }
            
            // For quests page, also remove blocked class from quests-page
            if (questsContainer) {
                const questsPage = document.querySelector('.quests-page');
                if (questsPage) {
                    questsPage.classList.remove('blocked');
                }
            }
            
            // For leaderboard page, also remove blocked class from leaderboard-page
            if (leaderboardContainer) {
                const leaderboardPage = document.querySelector('.leaderboard-page');
                if (leaderboardPage) {
                    leaderboardPage.classList.remove('blocked');
                }
            }
            
            Array.from(container.children).forEach(child => {
                child.classList.remove('pointer-events-none');
                child.classList.add('pointer-events-auto');
            });
        }
    }
}

