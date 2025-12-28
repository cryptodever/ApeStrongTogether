/**
 * Quests Page Initialization Module
 * Handles quest loading, progress tracking, and completion
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    Timestamp,
    runTransaction
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// Constants
const POINTS_PER_LEVEL = 100; // 100 points = 1 level

// State
let currentUser = null;
let userProfile = null;
let userQuests = {}; // Map of questId -> userQuest data
let availableQuests = [];

// DOM Elements
let dailyQuestsEl, weeklyQuestsEl, userRankEl, userPointsEl;

// Initialize auth gate for quests page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Quests init: Auth gate initialization error:', error);
    }
})();

// Initialize quests when auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserProfile();
        await initializeQuests();
    } else {
        currentUser = null;
        userProfile = null;
        userQuests = {};
    }
});

// Load user profile data
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            userProfile = userDoc.data();
            // Initialize points and rank if they don't exist
            if (userProfile.points === undefined) {
                userProfile.points = 0;
            }
            if (userProfile.rank === undefined) {
                userProfile.rank = calculateRank(userProfile.points);
            }
        } else {
            // Create default profile with points/rank
            const defaultUsername = currentUser.email?.split('@')[0] || 'User';
            userProfile = {
                username: defaultUsername,
                usernameLower: defaultUsername.toLowerCase(),
                avatarCount: 0,
                bannerImage: '/pfp_apes/bg1.png',
                xAccountVerified: false,
                points: 0,
                rank: 1,
                totalQuestsCompleted: 0
            };
            try {
                await setDoc(userDocRef, userProfile, { merge: true });
            } catch (createError) {
                console.error('Error creating user profile:', createError);
            }
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        // Use defaults on error
        userProfile = {
            points: 0,
            rank: 1,
            totalQuestsCompleted: 0
        };
    }
}

// Calculate rank from points
function calculateRank(points) {
    return Math.floor(points / POINTS_PER_LEVEL) + 1;
}

// Initialize quests page
async function initializeQuests() {
    if (!currentUser || !userProfile) {
        console.error('Cannot initialize quests: user not loaded');
        return;
    }

    // Get DOM elements
    dailyQuestsEl = document.getElementById('dailyQuests');
    weeklyQuestsEl = document.getElementById('weeklyQuests');
    userRankEl = document.getElementById('userRank');
    userPointsEl = document.getElementById('userPoints');

    if (!dailyQuestsEl || !weeklyQuestsEl || !userRankEl || !userPointsEl) {
        console.error('Quests DOM elements not found');
        return;
    }

    // Update user stats display
    updateUserStats();

    // Load available quests (hardcoded for now)
    await loadAvailableQuests();

    // Load user quest progress
    await loadUserQuestProgress();

    // Display quests
    displayQuests();
}

// Load available quests (hardcoded initially)
async function loadAvailableQuests() {
    // For now, use hardcoded quests. Later these can be loaded from Firestore
    availableQuests = [
        // Daily Quests
        {
            id: 'daily_chat_5',
            title: 'Chat Master',
            description: 'Send 5 messages in chat',
            type: 'daily',
            targetValue: 5,
            rewardPoints: 10,
            category: 'chat',
            isActive: true,
            resetPeriod: 'daily'
        },
        {
            id: 'daily_profile_update',
            title: 'Profile Polisher',
            description: 'Update your profile',
            type: 'daily',
            targetValue: 1,
            rewardPoints: 5,
            category: 'profile',
            isActive: true,
            resetPeriod: 'daily'
        },
        {
            id: 'daily_quests_visit',
            title: 'Quest Explorer',
            description: 'Visit the quests page',
            type: 'daily',
            targetValue: 1,
            rewardPoints: 5,
            category: 'quests',
            isActive: true,
            resetPeriod: 'daily'
        },
        {
            id: 'daily_complete_quest',
            title: 'Quest Completer',
            description: 'Complete 1 daily quest',
            type: 'daily',
            targetValue: 1,
            rewardPoints: 15,
            category: 'quests',
            isActive: true,
            resetPeriod: 'daily'
        },
        // Weekly Quests
        {
            id: 'weekly_chat_50',
            title: 'Chat Champion',
            description: 'Send 50 messages in chat',
            type: 'weekly',
            targetValue: 50,
            rewardPoints: 50,
            category: 'chat',
            isActive: true,
            resetPeriod: 'weekly'
        },
        {
            id: 'weekly_complete_daily_5',
            title: 'Daily Grinder',
            description: 'Complete 5 daily quests',
            type: 'weekly',
            targetValue: 5,
            rewardPoints: 75,
            category: 'quests',
            isActive: true,
            resetPeriod: 'weekly'
        },
        {
            id: 'weekly_verify_x',
            title: 'Verified Ape',
            description: 'Verify your X account',
            type: 'weekly',
            targetValue: 1,
            rewardPoints: 100,
            category: 'social',
            isActive: true,
            resetPeriod: 'weekly'
        },
        {
            id: 'weekly_active_3_days',
            title: 'Loyal Ape',
            description: 'Stay active for 3 days',
            type: 'weekly',
            targetValue: 3,
            rewardPoints: 50,
            category: 'activity',
            isActive: true,
            resetPeriod: 'weekly'
        }
    ];
}

// Load user quest progress from Firestore
async function loadUserQuestProgress() {
    if (!currentUser) return;

    try {
        const userQuestsRef = collection(db, 'userQuests');
        const q = query(userQuestsRef, where('userId', '==', currentUser.uid));
        const snapshot = await getDocs(q);

        userQuests = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            userQuests[data.questId] = data;
        });

        // Check for quests that need reset (daily/weekly)
        await checkAndResetQuests();
    } catch (error) {
        console.error('Error loading user quest progress:', error);
        userQuests = {};
    }
}

// Check and reset quests based on reset period
async function checkAndResetQuests() {
    if (!currentUser) return;

    const now = Date.now();
    const updates = [];

    for (const quest of availableQuests) {
        const userQuest = userQuests[quest.id];
        if (!userQuest) continue;

        const resetAt = userQuest.resetAt?.toMillis() || 0;
        const shouldReset = now >= resetAt;

        if (shouldReset) {
            // Calculate next reset time
            const nextReset = getNextResetTime(quest.resetPeriod);
            
            // Reset quest progress
            const userQuestRef = doc(db, 'userQuests', `${currentUser.uid}_${quest.id}`);
            updates.push({
                ref: userQuestRef,
                data: {
                    progress: 0,
                    completed: false,
                    completedAt: null,
                    resetAt: Timestamp.fromDate(nextReset),
                    updatedAt: serverTimestamp()
                }
            });

            // Update local state
            userQuests[quest.id] = {
                ...userQuest,
                progress: 0,
                completed: false,
                completedAt: null,
                resetAt: Timestamp.fromDate(nextReset)
            };
        }
    }

    // Batch update
    for (const update of updates) {
        try {
            await setDoc(update.ref, update.data, { merge: true });
        } catch (error) {
            console.error(`Error resetting quest ${update.ref.id}:`, error);
        }
    }
}

// Get next reset time based on period
function getNextResetTime(period) {
    const now = new Date();
    const next = new Date();

    if (period === 'daily') {
        next.setDate(now.getDate() + 1);
        next.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
        // Reset on Monday
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        next.setDate(now.getDate() + daysUntilMonday);
        next.setHours(0, 0, 0, 0);
    }

    return next;
}

// Display quests on the page
function displayQuests() {
    if (!dailyQuestsEl || !weeklyQuestsEl) return;

    const dailyQuests = availableQuests.filter(q => q.type === 'daily' && q.isActive);
    const weeklyQuests = availableQuests.filter(q => q.type === 'weekly' && q.isActive);

    // Clear loading states
    dailyQuestsEl.innerHTML = '';
    weeklyQuestsEl.innerHTML = '';

    // Display daily quests
    if (dailyQuests.length === 0) {
        dailyQuestsEl.innerHTML = '<p class="quest-empty">No daily quests available.</p>';
    } else {
        dailyQuests.forEach(quest => {
            const questCard = createQuestCard(quest);
            dailyQuestsEl.appendChild(questCard);
        });
    }

    // Display weekly quests
    if (weeklyQuests.length === 0) {
        weeklyQuestsEl.innerHTML = '<p class="quest-empty">No weekly quests available.</p>';
    } else {
        weeklyQuests.forEach(quest => {
            const questCard = createQuestCard(quest);
            weeklyQuestsEl.appendChild(questCard);
        });
    }
}

// Create a quest card element
function createQuestCard(quest) {
    const userQuest = userQuests[quest.id] || {
        progress: 0,
        completed: false,
        completedAt: null
    };

    const progress = userQuest.progress || 0;
    const completed = userQuest.completed || false;
    const progressPercent = Math.min((progress / quest.targetValue) * 100, 100);

    const card = document.createElement('div');
    card.className = `quest-card ${completed ? 'quest-completed' : ''}`;
    card.innerHTML = `
        <div class="quest-card-header">
            <h3 class="quest-title">${escapeHtml(quest.title)}</h3>
            <div class="quest-reward">
                <span class="quest-reward-icon">⭐</span>
                <span class="quest-reward-points">${quest.rewardPoints}</span>
            </div>
        </div>
        <p class="quest-description">${escapeHtml(quest.description)}</p>
        <div class="quest-progress">
            <div class="quest-progress-bar">
                <div class="quest-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="quest-progress-text">
                <span>${progress} / ${quest.targetValue}</span>
                ${completed ? '<span class="quest-completed-badge">✓ Completed</span>' : ''}
            </div>
        </div>
    `;

    return card;
}

// Update user stats display
function updateUserStats() {
    if (userRankEl) {
        userRankEl.textContent = userProfile?.rank || 1;
    }
    if (userPointsEl) {
        userPointsEl.textContent = userProfile?.points || 0;
    }
}

// Update quest progress (called from other modules)
export async function updateQuestProgress(questId, increment = 1) {
    if (!currentUser || !userProfile) return;

    const quest = availableQuests.find(q => q.id === questId);
    if (!quest || !quest.isActive) return;

    try {
        const userQuestId = `${currentUser.uid}_${quest.id}`;
        const userQuestRef = doc(db, 'userQuests', userQuestId);
        const userQuestDoc = await getDoc(userQuestRef);

        let currentProgress = 0;
        let completed = false;
        let resetAt = null;

        if (userQuestDoc.exists()) {
            const data = userQuestDoc.data();
            currentProgress = data.progress || 0;
            completed = data.completed || false;
            resetAt = data.resetAt;
        } else {
            // Create new user quest entry
            resetAt = Timestamp.fromDate(getNextResetTime(quest.resetPeriod));
        }

        // Don't update if already completed
        if (completed) return;

        // Update progress
        const newProgress = Math.min(currentProgress + increment, quest.targetValue);
        const isNowCompleted = newProgress >= quest.targetValue && !completed;

        await setDoc(userQuestRef, {
            userId: currentUser.uid,
            questId: quest.id,
            progress: newProgress,
            completed: isNowCompleted,
            completedAt: isNowCompleted ? serverTimestamp() : null,
            resetAt: resetAt || Timestamp.fromDate(getNextResetTime(quest.resetPeriod)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Update local state
        userQuests[quest.id] = {
            userId: currentUser.uid,
            questId: quest.id,
            progress: newProgress,
            completed: isNowCompleted,
            completedAt: isNowCompleted ? Timestamp.now() : null,
            resetAt: resetAt || Timestamp.fromDate(getNextResetTime(quest.resetPeriod))
        };

        // If quest completed, award points
        if (isNowCompleted) {
            await awardQuestPoints(quest.rewardPoints);
            
            // If this is a daily quest, update "complete daily quest" quest
            if (quest.type === 'daily') {
                await updateQuestProgress('daily_complete_quest', 1);
            }
            
            // If this is a daily quest completion, update weekly "complete 5 daily quests" quest
            if (quest.type === 'daily') {
                await updateQuestProgress('weekly_complete_daily_5', 1);
            }
            
            // Refresh display
            displayQuests();
            updateUserStats();
            showQuestCompletionNotification(quest);
        } else {
            // Just update the display
            displayQuests();
        }
    } catch (error) {
        console.error(`Error updating quest progress for ${questId}:`, error);
    }
}

// Award points for quest completion
async function awardQuestPoints(points) {
    if (!currentUser) return;

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userDocRef);
            const currentPoints = userDoc.data()?.points || 0;
            const newPoints = currentPoints + points;
            const newRank = calculateRank(newPoints);

            transaction.update(userDocRef, {
                points: newPoints,
                rank: newRank,
                totalQuestsCompleted: (userDoc.data()?.totalQuestsCompleted || 0) + 1
            });

            // Update local state
            userProfile.points = newPoints;
            userProfile.rank = newRank;
        });
    } catch (error) {
        console.error('Error awarding quest points:', error);
    }
}

// Show quest completion notification
function showQuestCompletionNotification(quest) {
    // Simple notification - can be enhanced later
    const notification = document.createElement('div');
    notification.className = 'quest-notification';
    notification.innerHTML = `
        <div class="quest-notification-content">
            <span class="quest-notification-icon">🎉</span>
            <div class="quest-notification-text">
                <strong>Quest Completed!</strong>
                <p>${quest.title} - +${quest.rewardPoints} points</p>
            </div>
        </div>
    `;
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Track quests page visit
if (window.location.pathname.includes('/quests/')) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Small delay to ensure quests are loaded
            setTimeout(() => {
                updateQuestProgress('daily_quests_visit', 1);
            }, 1000);
        }
    });
}

