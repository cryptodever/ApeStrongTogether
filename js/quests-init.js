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
const MAX_LEVEL = 100;
const BASE_XP = 10; // Level 1 requires 10 XP

// State
let currentUser = null;
let userProfile = null;
let userQuests = {}; // Map of questId -> userQuest data
let availableQuests = [];

// DOM Elements
let dailyQuestsEl, weeklyQuestsEl, achievementsQuestsEl, userLevelEl;
let levelProgressBarEl, levelProgressFillEl, levelProgressTextEl;

// Initialize auth gate for quests page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Quests init: Auth gate initialization error:', error);
    }
})();

// Track daily login
let lastLoginDate = null;

// Initialize quests when auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Track daily login
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toDateString();
        
        // Check if user logged in today
        const shouldTrackLogin = lastLoginDate !== todayStr;
        if (shouldTrackLogin) {
            lastLoginDate = todayStr;
        }
        
        await loadUserProfile();
        await initializeQuests();
        
        // Track daily login after quests are initialized
        if (shouldTrackLogin) {
            setTimeout(async () => {
                try {
                    await updateQuestProgress('daily_login', 1);
                } catch (error) {
                    console.error('Error tracking daily login:', error);
                }
            }, 500);
        }
    } else {
        currentUser = null;
        userProfile = null;
        userQuests = {};
        lastLoginDate = null;
    }
});

// Track daily activity for "weekly_active_3_days" quest
async function trackDailyActivity() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);
        
        // Get last activity date
        let lastActivityDate = null;
        if (userData.lastActivityDate) {
            lastActivityDate = userData.lastActivityDate.toDate();
            lastActivityDate.setHours(0, 0, 0, 0);
        }
        
        // Check if user was active today
        const wasActiveToday = lastActivityDate && 
            lastActivityDate.getTime() === today.getTime();
        
        // Check the quest's current state to see if it was reset (new week)
        const questId = 'weekly_active_3_days';
        const userQuest = userQuests[questId];
        let isNewWeek = false;
        
        if (userQuest && userQuest.resetAt) {
            const resetAt = userQuest.resetAt.toDate();
            // If reset date is in the past or today, it's a new week
            // (checkAndResetQuests should have already reset it, but check anyway)
            if (resetAt <= today) {
                isNewWeek = true;
            }
        } else {
            // Quest doesn't exist yet, treat as new week
            isNewWeek = true;
        }
        
        // If it's a new week OR user wasn't active today, increment
        if (isNewWeek || !wasActiveToday) {
            // Update user profile with today's activity
            await updateDoc(userDocRef, {
                lastActivityDate: todayTimestamp
            });
            
            // Update the weekly_active_3_days quest
            // This will increment by 1 for each unique day the user is active
            await updateQuestProgress('weekly_active_3_days', 1);
        }
    } catch (error) {
        console.error('Error tracking daily activity:', error);
    }
}

// Load user profile data
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            userProfile = userDoc.data();
            // Initialize points and level if they don't exist
            if (userProfile.points === undefined) {
                userProfile.points = 0;
            }
            if (userProfile.level === undefined) {
                userProfile.level = calculateLevel(userProfile.points);
            }
        } else {
            // Create default profile with points/rank
            // Must match Firestore rules: username, email, avatarCount, createdAt (on create)
            const defaultUsername = currentUser.email?.split('@')[0] || 'user';
            // Normalize username to match Firestore rules
            const normalizedUsername = defaultUsername.toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .substring(0, 20)
                .replace(/^_+|_+$/g, '');
            const finalUsername = normalizedUsername.length >= 3 ? normalizedUsername : 'user_' + Date.now().toString(36).substring(0, 10);
            
            const userData = {
                username: finalUsername,
                email: currentUser.email || '',
                avatarCount: 0,
                createdAt: Timestamp.now()
            };
            
            userProfile = {
                ...userData,
                usernameLower: finalUsername.toLowerCase(),
                bannerImage: '/pfp_apes/bg1.png',
                xAccountVerified: false,
                points: 0,
                level: 1,
                totalQuestsCompleted: 0
            };
            
            try {
                // Use setDoc (not merge) for initial creation to match Firestore rules
                await setDoc(userDocRef, userData);
                console.log('Default user profile created in quests with username:', finalUsername);
            } catch (createError) {
                console.error('Error creating user profile:', createError);
                console.error('  - Error code:', createError.code);
                console.error('  - Error message:', createError.message);
            }
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        // Use defaults on error
        userProfile = {
            points: 0,
            level: 1,
            totalQuestsCompleted: 0
        };
    }
}

// Calculate XP needed for a specific level
export function calculateXPForLevel(level) {
    if (level <= 1) return BASE_XP;
    let xp = BASE_XP;
    for (let i = 2; i <= level; i++) {
        xp = Math.round(xp * 1.2); // 20% increase, rounded to whole number
    }
    return xp;
}

// Get level progress information from total points
export function getLevelProgress(points) {
    if (points < 0) points = 0;
    
    let level = 1;
    let cumulativeXP = 0;
    
    // Calculate which level the user is at
    while (level < MAX_LEVEL) {
        const xpForNextLevel = calculateXPForLevel(level + 1);
        if (points < cumulativeXP + xpForNextLevel) {
            break;
        }
        cumulativeXP += xpForNextLevel;
        level++;
    }
    
    const xpInCurrentLevel = points - cumulativeXP;
    const xpNeededForNextLevel = level < MAX_LEVEL ? calculateXPForLevel(level + 1) : 0;
    
    return {
        level: Math.min(level, MAX_LEVEL),
        xpInCurrentLevel,
        xpNeededForNextLevel,
        cumulativeXP,
        isMaxLevel: level >= MAX_LEVEL
    };
}

// Calculate level from points (for backward compatibility)
export function calculateLevel(points) {
    return getLevelProgress(points).level;
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
    achievementsQuestsEl = document.getElementById('achievementsQuests');
    userLevelEl = document.getElementById('userLevel');
    levelProgressBarEl = document.getElementById('levelProgressBar');
    levelProgressFillEl = document.getElementById('levelProgressFill');
    levelProgressTextEl = document.getElementById('levelProgressText');

    // Only initialize if we're on the quests page (elements exist)
    // If not on quests page, still allow quest progress updates from other pages
    if (!dailyQuestsEl || !weeklyQuestsEl || !userLevelEl) {
        // Not on quests page - this is fine, quest progress can still be updated
        // Don't log as error, just return early
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
    
    // Check if all daily quests are completed (for the "complete all" quest)
    await checkAndUpdateCompleteAllDailyQuests();
    
    // Sync followers quest progress
    await syncFollowersQuestProgress();
    
    // Sync achievement progress
    await syncAchievementProgress();
    
    // Track quests page visit (after a small delay to ensure quests are loaded)
    setTimeout(async () => {
        try {
            await updateQuestProgress('daily_quests_visit', 1);
        } catch (error) {
            console.error('Error tracking quests page visit:', error);
        }
    }, 500);
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
            id: 'daily_post_1',
            title: 'Content Creator',
            description: 'Create 1 post',
            type: 'daily',
            targetValue: 1,
            rewardPoints: 5,
            category: 'social',
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
            id: 'daily_login',
            title: 'Daily Login',
            description: 'Log in to the site',
            type: 'daily',
            targetValue: 1,
            rewardPoints: 5,
            category: 'activity',
            isActive: true,
            resetPeriod: 'daily'
        },
        {
            id: 'daily_complete_quest',
            title: 'Quest Completer',
            description: 'Complete all daily quests',
            type: 'daily',
            targetValue: 5, // Number of other daily quests (excluding this one)
            rewardPoints: 15,
            category: 'quests',
            isActive: true,
            resetPeriod: 'daily'
        },
        {
            id: 'daily_follow_3',
            title: 'Social Butterfly',
            description: 'Follow 3 users',
            type: 'daily',
            targetValue: 3,
            rewardPoints: 15,
            category: 'social',
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
            description: 'Complete 20 daily quests',
            type: 'weekly',
            targetValue: 20,
            rewardPoints: 75,
            category: 'quests',
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
        },
        {
            id: 'weekly_get_25_followers',
            title: 'Influencer Ape',
            description: 'Get 25 followers',
            type: 'weekly',
            targetValue: 25,
            rewardPoints: 100,
            category: 'social',
            isActive: true,
            resetPeriod: 'weekly'
        },
        // Achievements (Permanent)
        {
            id: 'achievement_level_10',
            title: 'Level 10 Master',
            description: 'Reach level 10',
            type: 'achievement',
            targetValue: 10,
            rewardPoints: 50,
            category: 'level',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_level_25',
            title: 'Level 25 Champion',
            description: 'Reach level 25',
            type: 'achievement',
            targetValue: 25,
            rewardPoints: 150,
            category: 'level',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_level_50',
            title: 'Level 50 Legend',
            description: 'Reach level 50',
            type: 'achievement',
            targetValue: 50,
            rewardPoints: 500,
            category: 'level',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_level_100',
            title: 'Level 100 God',
            description: 'Reach level 100',
            type: 'achievement',
            targetValue: 100,
            rewardPoints: 2000,
            category: 'level',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_complete_100_quests',
            title: 'Quest Master',
            description: 'Complete 100 quests total',
            type: 'achievement',
            targetValue: 100,
            rewardPoints: 500,
            category: 'quests',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_100_followers',
            title: 'Century Club',
            description: 'Get 100 followers',
            type: 'achievement',
            targetValue: 100,
            rewardPoints: 500,
            category: 'social',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_50_posts',
            title: 'Content Creator',
            description: 'Create 50 posts',
            type: 'achievement',
            targetValue: 50,
            rewardPoints: 300,
            category: 'posts',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_1000_chat_messages',
            title: 'Chat Legend',
            description: 'Send 1000 chat messages',
            type: 'achievement',
            targetValue: 1000,
            rewardPoints: 400,
            category: 'chat',
            isActive: true,
            resetPeriod: 'never'
        },
        {
            id: 'achievement_verify_x',
            title: 'Verified Ape',
            description: 'Verify your X account',
            type: 'achievement',
            targetValue: 1,
            rewardPoints: 100,
            category: 'social',
            isActive: true,
            resetPeriod: 'never'
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

        // Check for quests that need reset (daily/weekly) - only if quests are loaded
        if (availableQuests.length > 0) {
            await checkAndResetQuests();
        }
        
        // Track daily activity after quests are loaded and reset
        await trackDailyActivity();
    } catch (error) {
        console.error('Error loading user quest progress:', error);
        userQuests = {};
    }
}

// Check and reset quests based on reset period
async function checkAndResetQuests() {
    if (!currentUser || availableQuests.length === 0) return;

    const now = Date.now();
    const updates = [];

    for (const quest of availableQuests) {
        const userQuest = userQuests[quest.id];
        if (!userQuest) continue;

        // Check if quest needs reset
        let resetAtMillis = 0;
        if (userQuest.resetAt) {
            if (userQuest.resetAt.toMillis) {
                resetAtMillis = userQuest.resetAt.toMillis();
            } else if (userQuest.resetAt.toDate) {
                resetAtMillis = userQuest.resetAt.toDate().getTime();
            } else if (typeof userQuest.resetAt === 'number') {
                resetAtMillis = userQuest.resetAt;
            }
        }
        const shouldReset = resetAtMillis > 0 && now >= resetAtMillis;

        if (shouldReset) {
            // Calculate next reset time
            const nextReset = getNextResetTime(quest.resetPeriod);
            
            // Only reset if we have a valid reset time (skip achievements with 'never')
            if (nextReset) {
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
    }

    // Batch update
    for (const update of updates) {
        try {
            // Use transaction for quest reset to ensure proper rule evaluation
            await runTransaction(db, async (transaction) => {
                const questDoc = await transaction.get(update.ref);
                if (questDoc.exists()) {
                    transaction.update(update.ref, update.data);
                } else {
                    transaction.set(update.ref, update.data);
                }
            });
        } catch (error) {
            console.error(`Error resetting quest ${update.ref.id}:`, error);
        }
    }
}

// Get next reset time based on period
function getNextResetTime(period) {
    // For achievements that never reset, return null
    if (period === 'never') {
        return null;
    }
    
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
    const achievementQuests = availableQuests.filter(q => q.type === 'achievement' && q.isActive);

    // Clear loading states
    dailyQuestsEl.innerHTML = '';
    weeklyQuestsEl.innerHTML = '';
    if (achievementsQuestsEl) {
        achievementsQuestsEl.innerHTML = '';
    }

    // Display daily quests (limit to 4 for 2 rows × 2 columns)
    const QUESTS_PER_SECTION = 4; // 2 rows × 2 columns
    if (dailyQuests.length === 0) {
        dailyQuestsEl.innerHTML = '<p class="quest-empty">No daily quests available.</p>';
    } else {
        const dailyQuestsToShow = dailyQuests.slice(0, QUESTS_PER_SECTION);
        dailyQuestsToShow.forEach(quest => {
            const questCard = createQuestCard(quest);
            dailyQuestsEl.appendChild(questCard);
        });
        
        // Show "Show More" button if there are more quests
        if (dailyQuests.length > QUESTS_PER_SECTION) {
            const showMoreBtn = document.createElement('button');
            showMoreBtn.className = 'quest-show-more-btn';
            showMoreBtn.textContent = `Show All (${dailyQuests.length})`;
            showMoreBtn.addEventListener('click', () => {
                // Remove button and show all quests
                showMoreBtn.remove();
                dailyQuests.slice(QUESTS_PER_SECTION).forEach(quest => {
                    const questCard = createQuestCard(quest);
                    dailyQuestsEl.appendChild(questCard);
                });
            });
            dailyQuestsEl.appendChild(showMoreBtn);
        }
    }

    // Display weekly quests (limit to 4 for 2 rows × 2 columns)
    if (weeklyQuests.length === 0) {
        weeklyQuestsEl.innerHTML = '<p class="quest-empty">No weekly quests available.</p>';
    } else {
        const weeklyQuestsToShow = weeklyQuests.slice(0, QUESTS_PER_SECTION);
        weeklyQuestsToShow.forEach(quest => {
            const questCard = createQuestCard(quest);
            weeklyQuestsEl.appendChild(questCard);
        });
        
        // Show "Show More" button if there are more quests
        if (weeklyQuests.length > QUESTS_PER_SECTION) {
            const showMoreBtn = document.createElement('button');
            showMoreBtn.className = 'quest-show-more-btn';
            showMoreBtn.textContent = `Show All (${weeklyQuests.length})`;
            showMoreBtn.addEventListener('click', () => {
                // Remove button and show all quests
                showMoreBtn.remove();
                weeklyQuests.slice(QUESTS_PER_SECTION).forEach(quest => {
                    const questCard = createQuestCard(quest);
                    weeklyQuestsEl.appendChild(questCard);
                });
            });
            weeklyQuestsEl.appendChild(showMoreBtn);
        }
    }

    // Display achievements (limit to 4 for 2 rows × 2 columns)
    if (achievementsQuestsEl) {
        if (achievementQuests.length === 0) {
            achievementsQuestsEl.innerHTML = '<p class="quest-empty">No achievements available.</p>';
        } else {
            const achievementQuestsToShow = achievementQuests.slice(0, QUESTS_PER_SECTION);
            achievementQuestsToShow.forEach(quest => {
                const questCard = createQuestCard(quest);
                achievementsQuestsEl.appendChild(questCard);
            });
            
            // Show "Show More" button if there are more achievements
            if (achievementQuests.length > QUESTS_PER_SECTION) {
                const showMoreBtn = document.createElement('button');
                showMoreBtn.className = 'quest-show-more-btn';
                showMoreBtn.textContent = `Show All (${achievementQuests.length})`;
                showMoreBtn.addEventListener('click', () => {
                    // Remove button and show all achievements
                    showMoreBtn.remove();
                    achievementQuests.slice(QUESTS_PER_SECTION).forEach(quest => {
                        const questCard = createQuestCard(quest);
                        achievementsQuestsEl.appendChild(questCard);
                    });
                });
                achievementsQuestsEl.appendChild(showMoreBtn);
            }
        }
    } else {
        console.warn('[displayQuests] achievementsQuestsEl not found');
    }
}

// Create a quest card element
function createQuestCard(quest) {
    const userQuest = userQuests[quest.id] || {
        progress: 0,
        completed: false,
        completedAt: null
    };

    let progress = userQuest.progress || 0;
    const completed = userQuest.completed || false;
    
    // Cap progress at target value for display (fixes old incorrect data)
    // For level achievements, don't show progress exceeding the target
    if (quest.type === 'achievement' && quest.id && quest.id.startsWith('achievement_level_')) {
        progress = Math.min(progress, quest.targetValue);
    }
    
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
                <div class="quest-progress-fill"></div>
            </div>
            <div class="quest-progress-text">
                <span>${progress} / ${quest.targetValue}</span>
                ${completed ? '<span class="quest-completed-badge">✓ Completed</span>' : ''}
            </div>
        </div>
    `;

    // Set progress width using setProperty (CSP-compliant)
    const progressFill = card.querySelector('.quest-progress-fill');
    if (progressFill) {
        progressFill.style.setProperty('width', `${progressPercent}%`);
    }

    return card;
}

// Update user stats display
function updateUserStats() {
    const points = userProfile?.points || 0;
    const levelProgress = getLevelProgress(points);
    
    // Update level display
    if (userLevelEl) {
        if (levelProgress.isMaxLevel) {
            userLevelEl.textContent = 'MAX';
        } else {
            userLevelEl.textContent = levelProgress.level;
        }
    }
    
    // Update level progress bar using setProperty (CSP-safe)
    if (levelProgressBarEl && levelProgressFillEl && levelProgressTextEl) {
        if (levelProgress.isMaxLevel) {
            levelProgressFillEl.style.setProperty('width', '100%');
            levelProgressTextEl.textContent = 'MAX LEVEL';
        } else {
            const progressPercent = (levelProgress.xpInCurrentLevel / levelProgress.xpNeededForNextLevel) * 100;
            levelProgressFillEl.style.setProperty('width', `${Math.min(progressPercent, 100)}%`);
            levelProgressTextEl.textContent = `${levelProgress.xpInCurrentLevel} / ${levelProgress.xpNeededForNextLevel} XP`;
        }
    }
}

// Track ongoing quest updates to prevent duplicate processing
const questUpdateLocks = new Map();

// Update quest progress (called from other modules)
// For daily_follow_3 quest, pass the targetUserId as the third parameter to prevent duplicate follows
export async function updateQuestProgress(questId, increment = 1, metadata = null) {
    // Get current user from auth if not set
    if (!currentUser) {
        const currentAuthUser = auth.currentUser;
        if (!currentAuthUser) {
            console.warn('updateQuestProgress: No user authenticated');
            return;
        }
        currentUser = currentAuthUser;
    }

    // Create a unique lock key for this user + quest combination
    const lockKey = `${currentUser.uid}_${questId}`;
    
    // Check if this quest is already being processed
    if (questUpdateLocks.has(lockKey)) {
        console.log(`updateQuestProgress: Quest ${questId} is already being processed, skipping duplicate call`);
        return;
    }
    
    // Set lock
    questUpdateLocks.set(lockKey, true);

    try {
        // Ensure user profile is loaded
        if (!userProfile) {
            await loadUserProfile();
        }

        // Ensure quests are loaded
        if (availableQuests.length === 0) {
            await loadAvailableQuests();
        }

        const quest = availableQuests.find(q => q.id === questId);
        if (!quest) {
            console.warn(`updateQuestProgress: Quest ${questId} not found in available quests`);
            questUpdateLocks.delete(lockKey);
            return;
        }
        if (!quest.isActive) {
            console.warn(`updateQuestProgress: Quest ${questId} is not active`);
            questUpdateLocks.delete(lockKey);
            return;
        }

        const userQuestId = `${currentUser.uid}_${quest.id}`;
        const userQuestRef = doc(db, 'userQuests', userQuestId);
        
        // Reload user quest progress if not already loaded (important when called from other pages)
        // Do this outside transaction for initial state check only
        const userQuestDoc = await getDoc(userQuestRef);
        if (!userQuests[questId] && userQuestDoc.exists()) {
            const data = userQuestDoc.data();
            userQuests[questId] = data;
        }

        // Use runTransaction to ensure atomicity and proper rule evaluation
        // All logic that depends on document state should be inside the transaction
        let wasNewlyCompleted = false;
        
        await runTransaction(db, async (transaction) => {
            const questDoc = await transaction.get(userQuestRef);
            
            let currentProgress = 0;
            let completed = false;
            let resetAt = null;

            let followedUsers = [];
            
            if (questDoc.exists()) {
                const data = questDoc.data();
                currentProgress = data.progress || 0;
                completed = data.completed || false;
                resetAt = data.resetAt;
                followedUsers = data.followedUsers || [];
                
                // Check if quest needs reset before updating (inside transaction)
                // Skip reset check for achievements (resetPeriod === 'never')
                if (resetAt && quest.resetPeriod !== 'never') {
                    let resetAtMillis = 0;
                    if (resetAt.toMillis) {
                        resetAtMillis = resetAt.toMillis();
                    } else if (resetAt.toDate) {
                        resetAtMillis = resetAt.toDate().getTime();
                    } else if (typeof resetAt === 'number') {
                        resetAtMillis = resetAt;
                    }
                    
                    // If reset time has passed, reset the quest first
                    if (resetAtMillis > 0 && Date.now() >= resetAtMillis) {
                        const nextReset = getNextResetTime(quest.resetPeriod);
                        if (nextReset) {
                            currentProgress = 0;
                            completed = false;
                            resetAt = Timestamp.fromDate(nextReset);
                            // Clear followedUsers array on reset
                            followedUsers = [];
                        }
                    }
                }
            } else {
                // Create new user quest entry
                const nextReset = getNextResetTime(quest.resetPeriod);
                if (nextReset) {
                    resetAt = Timestamp.fromDate(nextReset);
                } else {
                    // For achievements (never reset), set resetAt to null
                    resetAt = null;
                }
            }
            
            // Special handling for daily_follow_3 quest to prevent duplicate follows
            if (questId === 'daily_follow_3' && metadata && metadata.targetUserId) {
                // Check if this user was already followed today
                if (followedUsers.includes(metadata.targetUserId)) {
                    console.log(`User ${metadata.targetUserId} was already followed today, not counting for quest`);
                    return; // Don't increment progress
                }
                
                // Add this user to the followed list
                followedUsers.push(metadata.targetUserId);
            }

            // Don't update if already completed (after potential reset)
            // For achievements (never reset), also skip if already completed to prevent re-awarding
            if (completed) {
                // Return early but don't throw - just skip the update
                // This prevents re-awarding points for already-completed achievements
                return;
            }

            // Update progress
            // For achievements, allow progress to exceed targetValue for display purposes
            let newProgress;
            if (quest.resetPeriod === 'never') {
                // Achievements: allow progress to exceed target
                newProgress = currentProgress + increment;
            } else {
                // Regular quests: cap at targetValue
                newProgress = Math.min(currentProgress + increment, quest.targetValue);
            }
            const isNowCompleted = newProgress >= quest.targetValue && !completed;
            
            // Track if this transaction newly completed the quest
            wasNewlyCompleted = isNowCompleted;
            
            // Calculate resetAt - handle achievements that never reset
            let finalResetAt = resetAt;
            if (!finalResetAt) {
                const nextReset = getNextResetTime(quest.resetPeriod);
                finalResetAt = nextReset ? Timestamp.fromDate(nextReset) : null;
            }
            
            const questData = {
                userId: currentUser.uid,
                questId: quest.id,
                progress: newProgress,
                completed: isNowCompleted,
                completedAt: isNowCompleted ? serverTimestamp() : null,
                resetAt: finalResetAt,
                updatedAt: serverTimestamp()
            };
            
            // Add followedUsers array for daily_follow_3 quest
            if (questId === 'daily_follow_3') {
                questData.followedUsers = followedUsers;
            }
            
            if (!questDoc.exists()) {
                // Document doesn't exist - create it
                questData.createdAt = serverTimestamp();
                transaction.set(userQuestRef, questData);
            } else {
                // Document exists - update it (don't overwrite createdAt)
                // Calculate resetAt - handle achievements that never reset
                let finalResetAt = resetAt;
                if (!finalResetAt) {
                    const nextReset = getNextResetTime(quest.resetPeriod);
                    finalResetAt = nextReset ? Timestamp.fromDate(nextReset) : null;
                }
                
                const updateData = {
                    progress: newProgress,
                    completed: isNowCompleted,
                    completedAt: isNowCompleted ? serverTimestamp() : null,
                    resetAt: finalResetAt,
                    updatedAt: serverTimestamp()
                };
                
                // Include followedUsers in update if it's the follow quest
                if (questId === 'daily_follow_3') {
                    updateData.followedUsers = followedUsers;
                }
                
                transaction.update(userQuestRef, updateData);
            }
            
        });

        // Read the updated document to get the final state for local cache
        const updatedQuestDoc = await getDoc(userQuestRef);
        
        if (updatedQuestDoc.exists()) {
            const data = updatedQuestDoc.data();
            
            // Update local state with actual data from Firestore
            userQuests[quest.id] = {
                userId: currentUser.uid,
                questId: quest.id,
                progress: data.progress || 0,
                completed: data.completed || false,
                completedAt: data.completedAt || null,
                resetAt: data.resetAt || null
            };
            
            // Refresh quest display if on quests page
            if (dailyQuestsEl && weeklyQuestsEl) {
                displayQuests();
            }
        }

        // Only award points if the quest was newly completed in THIS transaction
        // This prevents duplicate rewards from race conditions
        if (wasNewlyCompleted) {
            await awardQuestPoints(quest.rewardPoints);
            
            // Reload user profile to get updated points/level
            await loadUserProfile();
            
            // If this is a daily quest (but not the "complete all" quest itself), check if all daily quests are completed
            if (quest.type === 'daily' && quest.id !== 'daily_complete_quest') {
                await checkAndUpdateCompleteAllDailyQuests();
            }
            
            // If this is a daily quest completion, update weekly "complete 20 daily quests" quest
            if (quest.type === 'daily') {
                await updateQuestProgress('weekly_complete_daily_5', 1);
            }
            
            // Show notification on any page (not just quests page)
            showQuestCompletionNotification(quest);
            
            // Refresh display only if on quests page
            if (dailyQuestsEl && weeklyQuestsEl) {
                displayQuests();
                updateUserStats();
            }
        } else {
            // Just update the display if on quests page
            if (dailyQuestsEl && weeklyQuestsEl) {
                displayQuests();
            }
        }
    } catch (error) {
        console.error(`Error updating quest progress for ${questId}:`, error);
    } finally {
        // Always remove lock, even if there was an error or early return
        questUpdateLocks.delete(lockKey);
    }
}

// Check and update "complete all daily quests" quest
async function checkAndUpdateCompleteAllDailyQuests() {
    if (!currentUser || !userProfile) return;
    
    // Make sure quests are loaded
    if (availableQuests.length === 0) {
        await loadAvailableQuests();
    }
    
    // Get all daily quests (excluding the "complete all" quest itself)
    const dailyQuests = availableQuests.filter(q => 
        q.type === 'daily' && q.id !== 'daily_complete_quest' && q.isActive
    );
    
    if (dailyQuests.length === 0) return; // No daily quests loaded yet
    
    // Count how many are completed
    let completedCount = 0;
    for (const quest of dailyQuests) {
        const userQuest = userQuests[quest.id];
        if (userQuest && userQuest.completed) {
            completedCount++;
        }
    }
    
    // Update the "complete all daily quests" quest
    // Get current progress
    const completeQuest = availableQuests.find(q => q.id === 'daily_complete_quest');
    if (!completeQuest) return;
    
    const userQuestId = `${currentUser.uid}_daily_complete_quest`;
    const userQuestRef = doc(db, 'userQuests', userQuestId);
    const userQuestDoc = await getDoc(userQuestRef);
    
    // Only update if not already completed
    if (userQuestDoc.exists()) {
        const data = userQuestDoc.data();
        if (data.completed) return; // Already completed
    }
    
    // Set progress to completed count (up to target value)
    const newProgress = Math.min(completedCount, completeQuest.targetValue);
    const isNowCompleted = newProgress >= completeQuest.targetValue;
    
    let resetAt = null;
    if (userQuestDoc.exists()) {
        resetAt = userQuestDoc.data().resetAt;
    } else {
        const nextReset = getNextResetTime(completeQuest.resetPeriod);
        resetAt = nextReset ? Timestamp.fromDate(nextReset) : null;
    }
    
    // Use transaction for quest update to ensure proper rule evaluation
    await runTransaction(db, async (transaction) => {
        const questDoc = await transaction.get(userQuestRef);
        
        // Calculate final resetAt - handle achievements that never reset
        let finalResetAt = resetAt;
        if (!finalResetAt) {
            const nextReset = getNextResetTime(completeQuest.resetPeriod);
            finalResetAt = nextReset ? Timestamp.fromDate(nextReset) : null;
        }
        
        const questData = {
            userId: currentUser.uid,
            questId: 'daily_complete_quest',
            progress: newProgress,
            completed: isNowCompleted,
            completedAt: isNowCompleted ? serverTimestamp() : null,
            resetAt: finalResetAt,
            updatedAt: serverTimestamp()
        };
        
        if (!questDoc.exists()) {
            questData.createdAt = serverTimestamp();
            transaction.set(userQuestRef, questData);
        } else {
            transaction.update(userQuestRef, {
                progress: newProgress,
                completed: isNowCompleted,
                completedAt: isNowCompleted ? serverTimestamp() : null,
                resetAt: finalResetAt,
                updatedAt: serverTimestamp()
            });
        }
    });
    
    // Update local state
    // Calculate final resetAt for local state
    let finalResetAt = resetAt;
    if (!finalResetAt) {
        const nextReset = getNextResetTime(completeQuest.resetPeriod);
        finalResetAt = nextReset ? Timestamp.fromDate(nextReset) : null;
    }
    
    userQuests['daily_complete_quest'] = {
        userId: currentUser.uid,
        questId: 'daily_complete_quest',
        progress: newProgress,
        completed: isNowCompleted,
        completedAt: isNowCompleted ? Timestamp.now() : null,
        resetAt: finalResetAt
    };
    
    // If completed, award points and show notification
    if (isNowCompleted) {
        await awardQuestPoints(completeQuest.rewardPoints);
        displayQuests();
        updateUserStats();
        showQuestCompletionNotification(completeQuest);
    } else {
        displayQuests();
    }
}

// Award points for quest completion
async function awardQuestPoints(points) {
    if (!currentUser) return;

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Retry transaction up to 3 times if it fails due to conflicts
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
            try {
                await runTransaction(db, async (transaction) => {
                    const userDoc = await transaction.get(userDocRef);
                    if (!userDoc.exists()) {
                        throw new Error('User document does not exist');
                    }
                    
                    const currentPoints = userDoc.data()?.points || 0;
                    const newPoints = currentPoints + points;
                    const newLevel = calculateLevel(newPoints);

                    transaction.update(userDocRef, {
                        points: newPoints,
                        level: newLevel,
                        totalQuestsCompleted: (userDoc.data()?.totalQuestsCompleted || 0) + 1
                    });

                    // Update local state
                    userProfile.points = newPoints;
                    userProfile.level = newLevel;
                });
                
                // Transaction succeeded, break out of retry loop
                break;
            } catch (error) {
                retries++;
                if (error.code === 'failed-precondition' && retries < maxRetries) {
                    // Wait a bit before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 50 * retries));
                    continue;
                } else {
                    // Either not a retryable error or max retries reached
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error awarding quest points:', error);
        // Don't throw - we don't want to break the quest completion flow
        // The points will be synced when the user profile is reloaded
    }
}

// Show quest completion notification
function showQuestCompletionNotification(quest) {
    // Validate quest object
    if (!quest || !quest.title || quest.rewardPoints === undefined) {
        console.error('Invalid quest object passed to showQuestCompletionNotification:', quest);
        return;
    }
    
    // Create exciting notification popup
    const notification = document.createElement('div');
    notification.className = 'quest-notification';
    
    // Get current level progress to check for level up
    // Use userProfile if available, otherwise try to get from auth state
    const points = userProfile?.points || 0;
    const levelProgress = getLevelProgress(points);
    const newLevelProgress = getLevelProgress(points + quest.rewardPoints);
    const leveledUp = newLevelProgress.level > levelProgress.level;
    
    notification.innerHTML = `
        <div class="quest-notification-content">
            <div class="quest-notification-icon-container">
                <span class="quest-notification-icon">🎉</span>
                ${leveledUp ? '<span class="quest-level-up-badge">LEVEL UP!</span>' : ''}
            </div>
            <div class="quest-notification-text">
                <strong class="quest-notification-title">Quest Completed!</strong>
                <p class="quest-notification-quest-name">${escapeHtml(quest.title)}</p>
                <div class="quest-notification-reward">
                    <span class="quest-reward-icon">⭐</span>
                    <span class="quest-reward-amount">+${quest.rewardPoints} XP</span>
                </div>
                ${leveledUp ? `<p class="quest-level-up-text">🎊 You reached Level ${newLevelProgress.level}! 🎊</p>` : ''}
            </div>
            <button class="quest-notification-close" aria-label="Close">&times;</button>
        </div>
        <div class="quest-notification-particles"></div>
    `;
    
    // Append to body and ensure it's positioned correctly
    document.body.appendChild(notification);
    
    // Force correct positioning by setting styles directly
    notification.style.position = 'fixed';
    notification.style.top = '50%';
    notification.style.left = '50%';
    notification.style.right = 'auto';
    notification.style.bottom = 'auto';
    notification.style.margin = '0';
    notification.style.zIndex = '100000';

    // Add close button handler
    const closeBtn = notification.querySelector('.quest-notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeNotification(notification);
        });
    }

    // Create particle effects
    createParticleEffects(notification);

    // Animate in with bounce effect
    setTimeout(() => {
        notification.classList.add('show');
        notification.classList.add('quest-notification-bounce');
        // Re-enforce positioning after class is added
        notification.style.top = '50%';
        notification.style.left = '50%';
        notification.style.right = 'auto';
        notification.style.bottom = 'auto';
        notification.style.margin = '0';
    }, 10);

    // Remove bounce animation after initial animation
    setTimeout(() => {
        notification.classList.remove('quest-notification-bounce');
    }, 600);

    // Auto-remove after 5 seconds (longer for level ups)
    const displayTime = leveledUp ? 6000 : 5000;
    setTimeout(() => {
        closeNotification(notification);
    }, displayTime);
}

// Close notification with animation
function closeNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 400);
}

// Create particle effects for celebration
function createParticleEffects(container) {
    const particlesContainer = container.querySelector('.quest-notification-particles');
    if (!particlesContainer) return;

    const emojis = ['🎉', '⭐', '✨', '💫', '🎊', '🔥', '💎', '🚀'];
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'quest-particle';
        particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        
        // Random position and animation
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 100 + Math.random() * 50;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const delay = Math.random() * 0.3;
        const duration = 1.5 + Math.random() * 0.5;
        
        particle.style.setProperty('--x', `${x}px`);
        particle.style.setProperty('--y', `${y}px`);
        particle.style.setProperty('--delay', `${delay}s`);
        particle.style.setProperty('--duration', `${duration}s`);
        particle.style.setProperty('--rotation', `${Math.random() * 720 - 360}deg`);
        
        particlesContainer.appendChild(particle);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sync followers quest progress with current follower count
async function syncFollowersQuestProgress() {
    if (!currentUser) return;
    
    try {
        // Get current follower count
        const followersRef = collection(db, 'followers', currentUser.uid, 'followers');
        const followersSnapshot = await getDocs(followersRef);
        const currentFollowerCount = followersSnapshot.size;
        
        // Get current quest progress
        const userQuestId = `${currentUser.uid}_weekly_get_25_followers`;
        const userQuestRef = doc(db, 'userQuests', userQuestId);
        const userQuestDoc = await getDoc(userQuestRef);
        
        let currentProgress = 0;
        if (userQuestDoc.exists()) {
            currentProgress = userQuestDoc.data().progress || 0;
        }
        
        // If follower count is higher than current progress, update it
        if (currentFollowerCount > currentProgress) {
            const difference = currentFollowerCount - currentProgress;
            await updateQuestProgress('weekly_get_25_followers', difference);
        }
    } catch (error) {
        console.error('Error syncing followers quest:', error);
    }
}

// Sync achievement progress based on current user stats
async function syncAchievementProgress() {
    if (!currentUser || !userProfile) return;
    
    try {
        const points = userProfile.points || 0;
        const levelProgress = getLevelProgress(points);
        const currentLevel = levelProgress.level;
        const totalQuestsCompleted = userProfile.totalQuestsCompleted || 0;
        
        // Sync level achievements
        const levelAchievements = [
            { id: 'achievement_level_10', target: 10 },
            { id: 'achievement_level_25', target: 25 },
            { id: 'achievement_level_50', target: 50 },
            { id: 'achievement_level_100', target: 100 }
        ];
        
        for (const achievement of levelAchievements) {
            // For level achievements, progress should be capped at the target value
            // If user is level 22 and achievement is for level 10, show 10/10, not 22/10
            const targetProgress = Math.min(currentLevel, achievement.target);
            
            if (targetProgress > 0) {
                const userQuestId = `${currentUser.uid}_${achievement.id}`;
                const userQuestRef = doc(db, 'userQuests', userQuestId);
                const userQuestDoc = await getDoc(userQuestRef);
                
                let currentProgress = 0;
                if (userQuestDoc.exists()) {
                    currentProgress = userQuestDoc.data().progress || 0;
                }
                
                // Only update if the capped progress is greater than current progress
                if (targetProgress > currentProgress) {
                    await updateQuestProgress(achievement.id, targetProgress);
                }
            }
        }
        
        // Sync quest completion achievement
        if (totalQuestsCompleted > 0) {
            const userQuestId = `${currentUser.uid}_achievement_complete_100_quests`;
            const userQuestRef = doc(db, 'userQuests', userQuestId);
            const userQuestDoc = await getDoc(userQuestRef);
            
            let currentProgress = 0;
            if (userQuestDoc.exists()) {
                currentProgress = userQuestDoc.data().progress || 0;
            }
            
            if (totalQuestsCompleted > currentProgress) {
                await updateQuestProgress('achievement_complete_100_quests', totalQuestsCompleted);
            }
        }
        
        // Sync followers achievement
        try {
            const followersRef = collection(db, 'followers', currentUser.uid, 'followers');
            const followersSnapshot = await getDocs(followersRef);
            const followerCount = followersSnapshot.size;
            
            if (followerCount > 0) {
                const userQuestId = `${currentUser.uid}_achievement_100_followers`;
                const userQuestRef = doc(db, 'userQuests', userQuestId);
                const userQuestDoc = await getDoc(userQuestRef);
                
                let currentProgress = 0;
                if (userQuestDoc.exists()) {
                    currentProgress = userQuestDoc.data().progress || 0;
                }
                
                if (followerCount > currentProgress) {
                    await updateQuestProgress('achievement_100_followers', followerCount);
                }
            }
        } catch (error) {
            console.error('Error syncing followers achievement:', error);
        }
        
        // Sync posts achievement
        try {
            const postsQuery = query(
                collection(db, 'posts'),
                where('userId', '==', currentUser.uid),
                where('deleted', '==', false)
            );
            const postsSnapshot = await getDocs(postsQuery);
            const postCount = postsSnapshot.size;
            
            if (postCount > 0) {
                const userQuestId = `${currentUser.uid}_achievement_50_posts`;
                const userQuestRef = doc(db, 'userQuests', userQuestId);
                const userQuestDoc = await getDoc(userQuestRef);
                
                let currentProgress = 0;
                if (userQuestDoc.exists()) {
                    currentProgress = userQuestDoc.data().progress || 0;
                }
                
                if (postCount > currentProgress) {
                    await updateQuestProgress('achievement_50_posts', postCount);
                }
            }
        } catch (error) {
            console.error('Error syncing posts achievement:', error);
        }
        
        // Sync chat messages achievement
        try {
            // Count messages across all channels
            const channels = ['general', 'raid', 'trading', 'support'];
            let totalMessages = 0;
            
            for (const channel of channels) {
                const messagesQuery = query(
                    collection(db, 'messages'),
                    where('userId', '==', currentUser.uid),
                    where('channel', '==', channel),
                    where('deleted', '==', false)
                );
                const messagesSnapshot = await getDocs(messagesQuery);
                totalMessages += messagesSnapshot.size;
            }
            
            if (totalMessages > 0) {
                const userQuestId = `${currentUser.uid}_achievement_1000_chat_messages`;
                const userQuestRef = doc(db, 'userQuests', userQuestId);
                const userQuestDoc = await getDoc(userQuestRef);
                
                let currentProgress = 0;
                if (userQuestDoc.exists()) {
                    currentProgress = userQuestDoc.data().progress || 0;
                }
                
                if (totalMessages > currentProgress) {
                    await updateQuestProgress('achievement_1000_chat_messages', totalMessages);
                }
            }
        } catch (error) {
            console.error('Error syncing chat messages achievement:', error);
        }
        
    } catch (error) {
        console.error('Error syncing achievement progress:', error);
    }
}


