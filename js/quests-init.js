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
let dailyQuestsEl, weeklyQuestsEl, userLevelEl;
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
            // Initialize points and level if they don't exist
            if (userProfile.points === undefined) {
                userProfile.points = 0;
            }
            if (userProfile.level === undefined) {
                userProfile.level = calculateLevel(userProfile.points);
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
                level: 1,
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
            level: 1,
            totalQuestsCompleted: 0
        };
    }
}

// Calculate XP needed for a specific level
function calculateXPForLevel(level) {
    if (level <= 1) return BASE_XP;
    let xp = BASE_XP;
    for (let i = 2; i <= level; i++) {
        xp = Math.round(xp * 1.2); // 20% increase, rounded to whole number
    }
    return xp;
}

// Get level progress information from total points
function getLevelProgress(points) {
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
function calculateLevel(points) {
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
    userLevelEl = document.getElementById('userLevel');
    levelProgressBarEl = document.getElementById('levelProgressBar');
    levelProgressFillEl = document.getElementById('levelProgressFill');
    levelProgressTextEl = document.getElementById('levelProgressText');

    if (!dailyQuestsEl || !weeklyQuestsEl || !userLevelEl) {
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
    
    // Update level progress bar
    if (levelProgressBarEl && levelProgressFillEl && levelProgressTextEl) {
        if (levelProgress.isMaxLevel) {
            levelProgressFillEl.style.width = '100%';
            levelProgressTextEl.textContent = 'MAX LEVEL';
        } else {
            const progressPercent = (levelProgress.xpInCurrentLevel / levelProgress.xpNeededForNextLevel) * 100;
            levelProgressFillEl.style.width = `${Math.min(progressPercent, 100)}%`;
            levelProgressTextEl.textContent = `${levelProgress.xpInCurrentLevel} / ${levelProgress.xpNeededForNextLevel} XP`;
        }
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
    } catch (error) {
        console.error('Error awarding quest points:', error);
    }
}

// Show quest completion notification
function showQuestCompletionNotification(quest) {
    // Create exciting notification popup
    const notification = document.createElement('div');
    notification.className = 'quest-notification';
    
    // Get current level progress to check for level up
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
    
    document.body.appendChild(notification);

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

