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
    getDocs,
    doc,
    getDoc,
    writeBatch,
    serverTimestamp
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
let userProfilePopupEl, userProfilePopupOverlayEl, userProfilePopupCloseEl;

// Initialize leaderboard page
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        initializeLeaderboard();
        await loadLeaderboards();
    } else {
        currentUser = null;
    }
});

// Initialize leaderboard DOM elements
function initializeLeaderboard() {
    userProfilePopupEl = document.getElementById('userProfilePopup');
    userProfilePopupOverlayEl = document.getElementById('userProfilePopupOverlay');
    userProfilePopupCloseEl = document.getElementById('userProfilePopupClose');
    
    // Setup user profile popup
    setupUserProfilePopup();
}

// Setup user profile popup
function setupUserProfilePopup() {
    if (!userProfilePopupEl || !userProfilePopupOverlayEl || !userProfilePopupCloseEl) return;
    
    // Close on overlay click
    userProfilePopupOverlayEl.addEventListener('click', () => {
        userProfilePopupEl.classList.add('hide');
    });
    
    // Close on close button click
    userProfilePopupCloseEl.addEventListener('click', () => {
        userProfilePopupEl.classList.add('hide');
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !userProfilePopupEl.classList.contains('hide')) {
            userProfilePopupEl.classList.add('hide');
        }
    });
}

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
                
                // Include all users, even with 0 followers (will be sorted)
                userFollowersCounts.push({
                    userId: userId,
                    userData: userDoc.data(),
                    followersCount: followersCount
                });
            } catch (error) {
                // Log error but continue with other users
                console.error(`Error counting followers for ${userId}:`, error);
                // Include user with 0 followers if there's a permission error
                userFollowersCounts.push({
                    userId: userId,
                    userData: userDoc.data(),
                    followersCount: 0
                });
            }
        }

        // Sort by followers count (descending)
        userFollowersCounts.sort((a, b) => b.followersCount - a.followersCount);
        
        // Take top 20 (or all if less than 20)
        const top20 = userFollowersCounts.slice(0, 20);

        leaderboardEl.innerHTML = '';
        
        if (top20.length === 0) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">No users found</div>';
            return;
        }

        let rank = 1;
        top20.forEach((item) => {
            // Only show users with at least 0 followers (show all users, sorted by followers)
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
    
    // Make clickable to show profile popup
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `/profile/?user=${userId}`;
    });
    
    return item;
}

// Show user profile popup
async function showUserProfile(userId) {
    if (!userProfilePopupEl || !currentUser) return;
    
    // Validate userId
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        console.error('showUserProfile: Invalid userId:', userId);
        return;
    }
    
    // Don't show profile for current user (they can use their own profile page)
    if (userId === currentUser.uid) {
        window.location.href = '/profile/';
        return;
    }
    
    try {
        // Show loading state
        userProfilePopupEl.classList.remove('hide');
        const nameEl = document.getElementById('userProfilePopupName');
        const levelEl = document.getElementById('userProfilePopupLevelValue');
        const followersEl = document.getElementById('userProfilePopupFollowersValue');
        const followingEl = document.getElementById('userProfilePopupFollowingValue');
        const countryEl = document.getElementById('userProfilePopupCountryValue');
        const xAccountEl = document.getElementById('userProfilePopupXAccountValue');
        const bioEl = document.getElementById('userProfilePopupBio');
        const verifiedEl = document.getElementById('userProfilePopupVerified');
        
        if (nameEl) nameEl.textContent = 'Loading...';
        if (levelEl) levelEl.textContent = '—';
        if (followersEl) followersEl.textContent = '—';
        if (followingEl) followingEl.textContent = '—';
        if (countryEl) countryEl.textContent = '—';
        if (xAccountEl) xAccountEl.textContent = '—';
        if (bioEl) bioEl.textContent = 'Loading profile...';
        if (verifiedEl) verifiedEl.classList.add('hide');
        
        // Fetch user profile from Firestore
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        
        let userData = null;
        
        if (userDoc.exists()) {
            userData = userDoc.data();
        } else {
            console.error('User not found for userId:', userId);
            if (nameEl) nameEl.textContent = 'User not found';
            if (bioEl) bioEl.textContent = 'This user profile could not be loaded.';
            return;
        }
        
        const bannerImgEl = document.getElementById('userProfilePopupBannerImg');
        
        if (!nameEl || !bannerImgEl || !levelEl || !countryEl || !xAccountEl || !bioEl || !verifiedEl) {
            console.error('User profile popup elements not found');
            return;
        }
        
        // Name
        nameEl.textContent = userData.username || 'Anonymous';
        
        // Level - calculate from points if level not set
        let userLevel = userData.level;
        if (userLevel === undefined && userData.points !== undefined) {
            try {
                const { calculateLevel } = await import('/js/quests-init.js');
                userLevel = calculateLevel(userData.points || 0);
            } catch (error) {
                console.error('Error importing calculateLevel:', error);
                userLevel = 1;
            }
        }
        if (levelEl) {
            levelEl.textContent = userLevel || 1;
        }
        
        // Banner
        const bannerImage = userData.bannerImage || '/pfp_apes/bg1.png';
        const fallbackImage = '/pfp_apes/bg1.png';
        
        const newImg = bannerImgEl.cloneNode(false);
        bannerImgEl.parentNode.replaceChild(newImg, bannerImgEl);
        const updatedBannerImg = document.getElementById('userProfilePopupBannerImg');
        
        updatedBannerImg.src = bannerImage;
        updatedBannerImg.dataset.fallback = fallbackImage;
        
        updatedBannerImg.addEventListener('error', function handleError() {
            const fallback = this.dataset.fallback || fallbackImage;
            if (this.src !== fallback) {
                this.src = fallback;
            }
        }, { once: true });
        
        // Country
        if (userData.country) {
            countryEl.textContent = userData.country;
        } else {
            countryEl.textContent = '—';
        }
        
        // X Account
        const xAccount = userData.xAccount || userData.profileXAccount || '';
        if (xAccount && userData.xAccountVerified) {
            xAccountEl.textContent = `@${xAccount}`;
            verifiedEl.classList.remove('hide');
        } else if (xAccount) {
            xAccountEl.textContent = `@${xAccount} (not verified)`;
            verifiedEl.classList.add('hide');
        } else {
            xAccountEl.textContent = '—';
            verifiedEl.classList.add('hide');
        }
        
        // Bio
        if (userData.bio && userData.bio.trim()) {
            bioEl.textContent = userData.bio;
        } else {
            bioEl.textContent = 'No bio available.';
        }
        
        // Load followers/following counts
        try {
            const [followersCount, followingCount] = await Promise.all([
                getFollowersCount(userId),
                getFollowingCount(userId)
            ]);
            
            if (followersEl) followersEl.textContent = followersCount || 0;
            if (followingEl) followingEl.textContent = followingCount || 0;
        } catch (error) {
            console.error('Error loading follow stats:', error);
            if (followersEl) followersEl.textContent = '0';
            if (followingEl) followingEl.textContent = '0';
        }
        
        // Check if current user is following this user and show follow button
        if (userId !== currentUser.uid) {
            try {
                const isFollowing = await checkIfFollowing(userId);
                const followBtn = document.getElementById('leaderboardFollowBtn');
                if (followBtn) {
                    followBtn.classList.remove('hide');
                    followBtn.dataset.userId = userId;
                    followBtn.dataset.isFollowing = isFollowing ? 'true' : 'false';
                    followBtn.innerHTML = `<span class="follow-btn-text">${isFollowing ? 'Unfollow' : 'Follow'}</span>`;
                    followBtn.className = isFollowing ? 'btn btn-secondary follow-btn following' : 'btn btn-primary follow-btn';
                    
                    // Remove existing listeners and add new one
                    const newFollowBtn = followBtn.cloneNode(true);
                    followBtn.parentNode.replaceChild(newFollowBtn, followBtn);
                    newFollowBtn.addEventListener('click', async () => {
                        const targetUserId = newFollowBtn.dataset.userId;
                        const currentlyFollowing = newFollowBtn.dataset.isFollowing === 'true';
                        
                        if (currentlyFollowing) {
                            await unfollowUser(targetUserId);
                            newFollowBtn.dataset.isFollowing = 'false';
                            newFollowBtn.innerHTML = '<span class="follow-btn-text">Follow</span>';
                            newFollowBtn.className = 'btn btn-primary follow-btn';
                        } else {
                            await followUser(targetUserId);
                            newFollowBtn.dataset.isFollowing = 'true';
                            newFollowBtn.innerHTML = '<span class="follow-btn-text">Unfollow</span>';
                            newFollowBtn.className = 'btn btn-secondary follow-btn following';
                        }
                    });
                }
            } catch (error) {
                console.error('Error checking follow status:', error);
            }
        } else {
            // Hide follow button for own profile
            const followBtn = document.getElementById('leaderboardFollowBtn');
            if (followBtn) {
                followBtn.classList.add('hide');
            }
        }
        
        // Ensure popup is visible after data is loaded
        userProfilePopupEl.classList.remove('hide');
        void userProfilePopupEl.offsetWidth;
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        const nameEl = document.getElementById('userProfilePopupName');
        const bioEl = document.getElementById('userProfilePopupBio');
        if (nameEl) nameEl.textContent = 'Error';
        if (bioEl) bioEl.textContent = 'Failed to load user profile.';
        if (userProfilePopupEl) {
            userProfilePopupEl.classList.remove('hide');
        }
    }
}

// Follow/Unfollow functions (from profile-init.js)
async function checkIfFollowing(targetUserId) {
    if (!currentUser) return false;
    
    try {
        const followingRef = doc(db, 'following', currentUser.uid, 'following', targetUserId);
        const followingDoc = await getDoc(followingRef);
        return followingDoc.exists();
    } catch (error) {
        console.error('Error checking follow status:', error);
        return false;
    }
}

async function followUser(targetUserId) {
    if (!currentUser || !targetUserId || targetUserId === currentUser.uid) return;
    
    try {
        // Check if already following
        const followingRef = doc(db, 'following', currentUser.uid, 'following', targetUserId);
        const followingDoc = await getDoc(followingRef);
        
        if (followingDoc.exists()) {
            console.log('Already following this user');
            return; // Already following, don't count for quest
        }
        
        const batch = writeBatch(db);
        
        // Add to current user's following list
        batch.set(followingRef, {
            userId: targetUserId,
            followedAt: serverTimestamp()
        });
        
        // Add to target user's followers list
        const followersRef = doc(db, 'followers', targetUserId, 'followers', currentUser.uid);
        batch.set(followersRef, {
            userId: currentUser.uid,
            followedAt: serverTimestamp()
        });
        
        await batch.commit();
        console.log(`Followed user: ${targetUserId}`);
        
        // Track quest progress: daily_follow_3 (only if this was a new follow)
        try {
            const { updateQuestProgress } = await import('/js/quests-init.js');
            console.log('Updating quest progress for daily_follow_3');
            await updateQuestProgress('daily_follow_3', 1, { targetUserId: targetUserId });
            console.log('Quest progress updated successfully');
        } catch (error) {
            console.error('Error updating follow quest progress:', error);
            console.error('Error details:', error.message, error.stack);
        }
    } catch (error) {
        console.error('Error following user:', error);
        throw error;
    }
}

async function unfollowUser(targetUserId) {
    if (!currentUser || !targetUserId || targetUserId === currentUser.uid) return;
    
    try {
        const batch = writeBatch(db);
        
        // Remove from current user's following list
        const followingRef = doc(db, 'following', currentUser.uid, 'following', targetUserId);
        batch.delete(followingRef);
        
        // Remove from target user's followers list
        const followersRef = doc(db, 'followers', targetUserId, 'followers', currentUser.uid);
        batch.delete(followersRef);
        
        await batch.commit();
    } catch (error) {
        console.error('Error unfollowing user:', error);
        throw error;
    }
}

// Get followers count for a user
async function getFollowersCount(userId) {
    try {
        const followersRef = collection(db, 'followers', userId, 'followers');
        const snapshot = await getDocs(followersRef);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting followers count:', error);
        return 0;
    }
}

// Get following count for a user
async function getFollowingCount(userId) {
    try {
        const followingRef = collection(db, 'following', userId, 'following');
        const snapshot = await getDocs(followingRef);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting following count:', error);
        return 0;
    }
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

