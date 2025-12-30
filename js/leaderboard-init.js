/**
 * Leaderboard Page Initialization Module
 * Handles loading and displaying top users by level and followers
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    query,
    orderBy,
    limit,
    getDocs
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// Initialize auth gate for leaderboard page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Leaderboard init: Auth gate initialization error:', error);
    }
})();

let currentUser = null;

// Initialize leaderboard page
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadLeaderboards();
    } else {
        currentUser = null;
    }
});

// Load top users by level
async function loadTopByLevel() {
    const leaderboardEl = document.getElementById('levelLeaderboard');
    if (!leaderboardEl) return;

    try {
        leaderboardEl.innerHTML = '<div class="leaderboard-loading">Loading...</div>';

        // Query users ordered by level (descending), then by points (descending) as tiebreaker
        const usersRef = collection(db, 'users');
        const q = query(
            usersRef,
            orderBy('level', 'desc'),
            orderBy('points', 'desc'),
            limit(20)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">No users found</div>';
            return;
        }

        leaderboardEl.innerHTML = '';
        let rank = 1;

        snapshot.docs.forEach((userDoc) => {
            const userData = userDoc.data();
            const userItem = createLeaderboardItem(rank, userData, userDoc.id, 'level');
            leaderboardEl.appendChild(userItem);
            rank++;
        });
    } catch (error) {
        console.error('Error loading top by level:', error);
        if (error.code === 'failed-precondition') {
            leaderboardEl.innerHTML = '<div class="leaderboard-error">Index required. Please deploy Firestore indexes.</div>';
        } else {
            leaderboardEl.innerHTML = '<div class="leaderboard-error">Error loading leaderboard</div>';
        }
    }
}

// Load top users by followers
async function loadTopByFollowers() {
    const leaderboardEl = document.getElementById('followersLeaderboard');
    if (!leaderboardEl) return;

    try {
        leaderboardEl.innerHTML = '<div class="leaderboard-loading">Loading...</div>';

        // Get all users and count their followers
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        if (usersSnapshot.empty) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">No users found</div>';
            return;
        }

        // Count followers for each user
        const userFollowersCounts = [];
        
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            try {
                const followersRef = collection(db, 'followers', userId, 'followers');
                const followersSnapshot = await getDocs(followersRef);
                const followersCount = followersSnapshot.size;
                
                if (followersCount > 0) {
                    userFollowersCounts.push({
                        userId: userId,
                        userData: userDoc.data(),
                        followersCount: followersCount
                    });
                }
            } catch (error) {
                // Silently skip users with permission errors
                console.warn(`Error counting followers for ${userId}:`, error);
            }
        }

        // Sort by followers count (descending)
        userFollowersCounts.sort((a, b) => b.followersCount - a.followersCount);
        
        // Take top 20
        const top20 = userFollowersCounts.slice(0, 20);

        leaderboardEl.innerHTML = '';
        
        if (top20.length === 0) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">No users with followers yet</div>';
            return;
        }

        let rank = 1;
        top20.forEach((item) => {
            const userItem = createLeaderboardItem(rank, item.userData, item.userId, 'followers', item.followersCount);
            leaderboardEl.appendChild(userItem);
            rank++;
        });
    } catch (error) {
        console.error('Error loading top by followers:', error);
        leaderboardEl.innerHTML = '<div class="leaderboard-error">Error loading leaderboard</div>';
    }
}

// Create a leaderboard item
function createLeaderboardItem(rank, userData, userId, type, followersCount = null) {
    const item = document.createElement('div');
    item.className = `leaderboard-item ${currentUser && userId === currentUser.uid ? 'current-user' : ''}`;
    
    const level = userData.level || 1;
    const points = userData.points || 0;
    const username = userData.username || 'Anonymous';
    const bannerImage = userData.bannerImage || '/pfp_apes/bg1.png';
    
    let valueDisplay = '';
    if (type === 'level') {
        valueDisplay = `<span class="leaderboard-value">Level ${level}</span>`;
    } else {
        valueDisplay = `<span class="leaderboard-value">${followersCount || 0} ${followersCount === 1 ? 'follower' : 'followers'}</span>`;
    }
    
    // Medal emoji for top 3
    let rankDisplay = rank;
    if (rank === 1) rankDisplay = '🥇';
    else if (rank === 2) rankDisplay = '🥈';
    else if (rank === 3) rankDisplay = '🥉';
    
    item.innerHTML = `
        <div class="leaderboard-rank">${rankDisplay}</div>
        <img src="${bannerImage}" alt="${username}" class="leaderboard-avatar" />
        <div class="leaderboard-info">
            <div class="leaderboard-username">${escapeHtml(username)}</div>
            ${type === 'level' ? `<div class="leaderboard-subtext">${points} XP</div>` : ''}
        </div>
        <div class="leaderboard-value-container">
            ${valueDisplay}
        </div>
    `;
    
    // Make clickable to view profile
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
        window.location.href = `/profile/?user=${userId}`;
    });
    
    return item;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load both leaderboards
async function loadLeaderboards() {
    await Promise.all([
        loadTopByLevel(),
        loadTopByFollowers()
    ]);
}

console.log('Leaderboard page initialized');

