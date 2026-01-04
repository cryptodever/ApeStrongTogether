/**
 * Game Leaderboard Module
 * Displays top 50 scores and user's rank if outside top 50
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// DOM Elements
let leaderboardListEl;
let leaderboardLoadingEl;
let userRankSectionEl;
let userRankItemEl;
let backToGameBtn;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    leaderboardListEl = document.getElementById('leaderboardList');
    leaderboardLoadingEl = document.getElementById('leaderboardLoading');
    userRankSectionEl = document.getElementById('userRankSection');
    userRankItemEl = document.getElementById('userRankItem');
    backToGameBtn = document.getElementById('backToGameBtn');
    
    // Back button
    if (backToGameBtn) {
        backToGameBtn.addEventListener('click', () => {
            window.location.href = '/game/index.html';
        });
    }
    
    // Load leaderboard when auth state is known
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadLeaderboard(user);
        } else {
            // Still show leaderboard even if not logged in
            await loadLeaderboard(null);
        }
    });
});

// Load leaderboard data
async function loadLeaderboard(currentUser) {
    try {
        leaderboardLoadingEl.style.display = 'block';
        leaderboardListEl.innerHTML = '';
        userRankSectionEl.style.display = 'none';
        
        // Get top 50 scores
        const leaderboardRef = collection(db, 'gameLeaderboard');
        const topScoresQuery = query(
            leaderboardRef,
            orderBy('score', 'desc'),
            limit(50)
        );
        
        const topScoresSnapshot = await getDocs(topScoresQuery);
        const topScores = [];
        
        topScoresSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            topScores.push({
                userId: docSnap.id,
                username: data.username || 'Anonymous',
                score: data.score || 0
            });
        });
        
        // Display top 50
        displayLeaderboard(topScores);
        
        // If user is logged in, check their rank
        if (currentUser) {
            await displayUserRank(currentUser.uid, topScores);
        }
        
        leaderboardLoadingEl.style.display = 'none';
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardLoadingEl.textContent = 'Error loading leaderboard. Please try again.';
    }
}

// Display leaderboard entries
function displayLeaderboard(scores) {
    if (scores.length === 0) {
        leaderboardListEl.innerHTML = '<div class="game-leaderboard-empty">No scores yet. Be the first!</div>';
        return;
    }
    
    let html = '';
    scores.forEach((entry, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
        const rankDisplay = medal || rank;
        
        html += `
            <div class="game-leaderboard-entry ${rank <= 3 ? 'top-three' : ''}">
                <div class="game-leaderboard-rank">${rankDisplay}</div>
                <div class="game-leaderboard-username">${escapeHtml(entry.username)}</div>
                <div class="game-leaderboard-score">${entry.score.toLocaleString()}</div>
            </div>
        `;
    });
    
    leaderboardListEl.innerHTML = html;
}

// Display user's rank if outside top 50
async function displayUserRank(userId, topScores) {
    try {
        // Check if user is in top 50
        const userInTop50 = topScores.findIndex(entry => entry.userId === userId) !== -1;
        
        if (userInTop50) {
            // User is in top 50, don't show separate rank
            return;
        }
        
        // Get user's score
        const userLeaderboardRef = doc(db, 'gameLeaderboard', userId);
        const userLeaderboardDoc = await getDoc(userLeaderboardRef);
        
        if (!userLeaderboardDoc.exists()) {
            // User has no score yet
            return;
        }
        
        const userData = userLeaderboardDoc.data();
        const userScore = userData.score || 0;
        
        // Get all scores to calculate rank (we'll limit to reasonable amount)
        // Since we can't use where with > without index, we'll fetch all and filter client-side
        // For performance, we'll only do this if user score is reasonable
        try {
            // Try to get count of scores higher than user's score
            const allScoresQuery = query(
                collection(db, 'gameLeaderboard'),
                orderBy('score', 'desc')
            );
            
            const allScoresSnapshot = await getDocs(allScoresQuery);
            let userRank = 1;
            
            allScoresSnapshot.forEach((docSnap) => {
                const score = docSnap.data().score || 0;
                if (score > userScore) {
                    userRank++;
                }
            });
            
            // Display user's rank
            const username = userData.username || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'You';
            
            userRankItemEl.innerHTML = `
                <div class="game-leaderboard-rank">${userRank}</div>
                <div class="game-leaderboard-username">${escapeHtml(username)}</div>
                <div class="game-leaderboard-score">${userScore.toLocaleString()}</div>
            `;
            
            userRankSectionEl.style.display = 'block';
        } catch (error) {
            // If query fails (e.g., no index), just show user's score without rank
            console.warn('Could not calculate user rank:', error);
            const username = userData.username || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'You';
            
            userRankItemEl.innerHTML = `
                <div class="game-leaderboard-rank">-</div>
                <div class="game-leaderboard-username">${escapeHtml(username)}</div>
                <div class="game-leaderboard-score">${userScore.toLocaleString()}</div>
            `;
            
            userRankSectionEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Error getting user rank:', error);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
