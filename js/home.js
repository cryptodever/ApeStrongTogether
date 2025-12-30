/**
 * Home page functionality - Community Hub
 * Implements activity feed, user stats, trending users, and feature cards
 * Uses 5-minute polling to save on Firestore read/writes
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// Constants
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const ACTIVITY_LIMIT = 30; // Max activity items to show
const TRENDING_LIMIT = 5; // Top 5 trending users

// State
let currentUser = null;
let pollInterval = null;
let lastUpdateTime = null;

// DOM Elements
let activityFeedEl, lastUpdatedEl, refreshBtnEl;
let userStatsSectionEl, quickStatsWidgetEl;
let trendingUsersEl, activeChannelsEl;
let chatOnlineCountEl, questsCompletedCountEl;

// Initialize home page
export function initHome() {
    // Get DOM elements
    activityFeedEl = document.getElementById('activityFeed');
    lastUpdatedEl = document.getElementById('lastUpdated');
    refreshBtnEl = document.getElementById('refreshFeedBtn');
    userStatsSectionEl = document.getElementById('userStatsSection');
    quickStatsWidgetEl = document.getElementById('quickStatsWidget');
    trendingUsersEl = document.getElementById('trendingUsers');
    activeChannelsEl = document.getElementById('activeChannels');
    chatOnlineCountEl = document.getElementById('chatOnlineCount');
    questsCompletedCountEl = document.getElementById('questsCompletedCount');

    // Copy token address functionality
    const copyButton = document.getElementById('copyButton');
    if (copyButton) {
        copyButton.addEventListener('click', copyTokenAddress);
    }

    // Refresh button
    if (refreshBtnEl) {
        refreshBtnEl.addEventListener('click', () => {
            loadAllData(true);
        });
    }

    // Set up auth state listener
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        
        if (user) {
            // Show user stats section
            if (userStatsSectionEl) {
                userStatsSectionEl.classList.remove('hide');
            }
            if (quickStatsWidgetEl) {
                quickStatsWidgetEl.classList.remove('hide');
            }
            await loadUserStats();
        } else {
            // Hide user stats section
            if (userStatsSectionEl) {
                userStatsSectionEl.classList.add('hide');
            }
            if (quickStatsWidgetEl) {
                quickStatsWidgetEl.classList.add('hide');
            }
        }
        
        // Load all data (works for both logged in and out)
        await loadAllData();
        
        // Set up polling interval
        if (pollInterval) {
            clearInterval(pollInterval);
        }
        pollInterval = setInterval(() => {
            loadAllData();
        }, POLL_INTERVAL);
    });
}

// Load all homepage data
async function loadAllData(manualRefresh = false) {
    try {
        if (activityFeedEl) {
            activityFeedEl.innerHTML = '<div class="activity-loading">Loading activity...</div>';
        }
        
        // Load all data in parallel
        await Promise.all([
            loadActivityFeed(),
            loadTrendingUsers(),
            loadActiveChannels(),
            loadFeatureStats()
        ]);
        
        // Update user stats if logged in
        if (currentUser) {
            await loadUserStats();
        }
        
        // Update last updated time
        lastUpdateTime = new Date();
        updateLastUpdatedText();
        
    } catch (error) {
        console.error('Error loading homepage data:', error);
        if (activityFeedEl) {
            activityFeedEl.innerHTML = '<div class="activity-error">Error loading activity. Please try again.</div>';
        }
    }
}

// Load activity feed
async function loadActivityFeed() {
    if (!activityFeedEl) return;
    
    try {
        const activities = [];
        const fiveMinutesAgo = Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
        
        // 1. Load recent quest completions
        try {
            // Try with composite query first (requires index)
            let questsSnapshot;
            try {
                const questsQuery = query(
                    collection(db, 'userQuests'),
                    where('completed', '==', true),
                    where('completedAt', '>=', fiveMinutesAgo),
                    orderBy('completedAt', 'desc'),
                    limit(20)
                );
                questsSnapshot = await getDocs(questsQuery);
            } catch (indexError) {
                // If index doesn't exist, fall back to simpler query
                // Silently handle - index will be created when deployed
                const questsQuery = query(
                    collection(db, 'userQuests'),
                    where('completed', '==', true),
                    orderBy('completedAt', 'desc'),
                    limit(50)
                );
                questsSnapshot = await getDocs(questsQuery);
                // Filter by time in JavaScript
            }
            
            for (const questDoc of questsSnapshot.docs) {
                const questData = questDoc.data();
                if (!questData.completedAt || !questData.userId) continue;
                
                // Filter by time if we used the fallback query
                const completedTime = questData.completedAt.toMillis();
                const fiveMinutesAgoTime = fiveMinutesAgo.toMillis();
                if (completedTime < fiveMinutesAgoTime) continue;
                
                // Get user info
                const userDoc = await getDoc(doc(db, 'users', questData.userId));
                const userData = userDoc.exists() ? userDoc.data() : null;
                const username = userData?.username || 'Anonymous';
                
                // Get quest info
                const questInfo = await getQuestInfo(questData.questId);
                
                activities.push({
                    type: 'quest_completion',
                    userId: questData.userId,
                    username: username,
                    questTitle: questInfo.title,
                    rewardPoints: questInfo.rewardPoints,
                    timestamp: questData.completedAt,
                    sortTime: completedTime
                });
            }
        } catch (error) {
            // Silently handle - errors are expected until indexes are deployed
            // The fallback queries will handle the data loading
        }
        
        // 2. Load recent follows (this is trickier - we need to query all following subcollections)
        // For now, we'll skip follows as it requires querying many subcollections
        // TODO: Consider creating an activity log collection for better performance
        
        // 3. Load recent chat messages (highlights)
        try {
            // Try with composite query first (requires index)
            let messagesSnapshot;
            try {
                const messagesQuery = query(
                    collection(db, 'messages'),
                    where('deleted', '==', false),
                    where('timestamp', '>=', fiveMinutesAgo),
                    orderBy('timestamp', 'desc'),
                    limit(10)
                );
                messagesSnapshot = await getDocs(messagesQuery);
            } catch (indexError) {
                // If index doesn't exist, fall back to simpler query
                // Silently handle - index will be created when deployed
                const messagesQuery = query(
                    collection(db, 'messages'),
                    where('deleted', '==', false),
                    orderBy('timestamp', 'desc'),
                    limit(50)
                );
                messagesSnapshot = await getDocs(messagesQuery);
                // Filter by time in JavaScript
            }
            
            for (const messageDoc of messagesSnapshot.docs) {
                const messageData = messageDoc.data();
                if (!messageData.userId || !messageData.text || !messageData.timestamp) continue;
                
                // Filter by time if we used the fallback query
                const messageTime = messageData.timestamp.toMillis();
                const fiveMinutesAgoTime = fiveMinutesAgo.toMillis();
                if (messageTime < fiveMinutesAgoTime) continue;
                
                // Get user info
                const userDoc = await getDoc(doc(db, 'users', messageData.userId));
                const userData = userDoc.exists() ? userDoc.data() : null;
                const username = userData?.username || 'Anonymous';
                
                activities.push({
                    type: 'chat_message',
                    userId: messageData.userId,
                    username: username,
                    channel: messageData.channel || 'general',
                    text: messageData.text.substring(0, 100),
                    timestamp: messageData.timestamp,
                    sortTime: messageTime
                });
            }
        } catch (error) {
            // Silently handle - errors are expected until indexes are deployed
            // The fallback queries will handle the data loading
        }
        
        // Sort all activities by timestamp
        activities.sort((a, b) => b.sortTime - a.sortTime);
        
        // Limit to ACTIVITY_LIMIT
        const displayActivities = activities.slice(0, ACTIVITY_LIMIT);
        
        // Render activities
        if (displayActivities.length === 0) {
            activityFeedEl.innerHTML = '<div class="activity-empty">No recent activity. Check back soon!</div>';
        } else {
            activityFeedEl.innerHTML = displayActivities.map(activity => createActivityItem(activity)).join('');
            
            // Add click handlers for activity items
            activityFeedEl.querySelectorAll('.activity-item').forEach(item => {
                item.addEventListener('click', () => {
                    const userId = item.dataset.userId;
                    if (userId && currentUser) {
                        // Show user profile popup or navigate to profile
                        // For now, navigate to profile page
                        window.location.href = `/profile/?user=${userId}`;
                    } else if (userId) {
                        // Not logged in, show login prompt
                        const loginBtn = document.getElementById('headerLoginBtn');
                        if (loginBtn) loginBtn.click();
                    }
                });
            });
        }
        
    } catch (error) {
        console.error('Error loading activity feed:', error);
        activityFeedEl.innerHTML = '<div class="activity-error">Error loading activity feed.</div>';
    }
}

// Get quest info from quest ID
async function getQuestInfo(questId) {
    // Quest definitions mapping
    const questInfoMap = {
        'daily_chat_5': { title: 'Chat Master', rewardPoints: 10 },
        'daily_profile_update': { title: 'Profile Polisher', rewardPoints: 5 },
        'daily_quests_visit': { title: 'Quest Explorer', rewardPoints: 5 },
        'daily_login': { title: 'Daily Login', rewardPoints: 5 },
        'daily_complete_quest': { title: 'Quest Completer', rewardPoints: 15 },
        'daily_follow_3': { title: 'Social Butterfly', rewardPoints: 15 },
        'weekly_chat_50': { title: 'Chat Champion', rewardPoints: 50 },
        'weekly_complete_daily_5': { title: 'Daily Grinder', rewardPoints: 75 },
        'weekly_verify_x': { title: 'Verified Ape', rewardPoints: 100 },
        'weekly_active_3_days': { title: 'Loyal Ape', rewardPoints: 50 },
        'weekly_get_25_followers': { title: 'Influencer Ape', rewardPoints: 100 }
    };
    
    return questInfoMap[questId] || { title: 'Quest', rewardPoints: 0 };
}

// Create activity item HTML
function createActivityItem(activity) {
    const timeAgo = getTimeAgo(activity.timestamp);
    let content = '';
    
    if (activity.type === 'quest_completion') {
        content = `
            <div class="activity-item activity-quest" data-user-id="${activity.userId}">
                <div class="activity-icon">🎯</div>
                <div class="activity-content">
                    <div class="activity-text">
                        <span class="activity-username">@${escapeHtml(activity.username)}</span>
                        completed <strong>${escapeHtml(activity.questTitle)}</strong>
                        <span class="activity-reward">+${activity.rewardPoints} XP</span>
                    </div>
                    <div class="activity-time">${timeAgo}</div>
                </div>
            </div>
        `;
    } else if (activity.type === 'chat_message') {
        const channelName = activity.channel.charAt(0).toUpperCase() + activity.channel.slice(1);
        content = `
            <div class="activity-item activity-chat" data-user-id="${activity.userId}">
                <div class="activity-icon">💬</div>
                <div class="activity-content">
                    <div class="activity-text">
                        <span class="activity-username">@${escapeHtml(activity.username)}</span>
                        in <strong>${channelName}</strong>: "${escapeHtml(activity.text)}${activity.text.length >= 100 ? '...' : ''}"
                    </div>
                    <div class="activity-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }
    
    return content;
}

// Get time ago string
function getTimeAgo(timestamp) {
    if (!timestamp || !timestamp.toMillis) return 'Just now';
    
    const now = Date.now();
    const time = timestamp.toMillis();
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}

// Load trending users
async function loadTrendingUsers() {
    if (!trendingUsersEl) return;
    
    try {
        // Get top users by level
        const usersQuery = query(
            collection(db, 'users'),
            orderBy('level', 'desc'),
            orderBy('points', 'desc'),
            limit(TRENDING_LIMIT)
        );
        const usersSnapshot = await getDocs(usersQuery);
        
        const trending = [];
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            trending.push({
                userId: userDoc.id,
                username: userData.username || 'Anonymous',
                level: userData.level || 1,
                points: userData.points || 0
            });
        }
        
        if (trending.length === 0) {
            trendingUsersEl.innerHTML = '<div class="trending-empty">No users yet</div>';
        } else {
            trendingUsersEl.innerHTML = trending.map((user, index) => `
                <div class="trending-user" data-user-id="${user.userId}">
                    <span class="trending-rank">${index + 1}</span>
                    <span class="trending-username">@${escapeHtml(user.username)}</span>
                    <span class="trending-level">LVL ${user.level}</span>
                </div>
            `).join('');
        }
        
        // Add click handlers
        trendingUsersEl.querySelectorAll('.trending-user').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                if (userId && currentUser) {
                    // Show user profile popup (would need to import this functionality)
                    window.location.href = `/profile/?user=${userId}`;
                }
            });
        });
        
    } catch (error) {
        // Silently handle permission errors - show empty state
        if (trendingUsersEl) {
            trendingUsersEl.innerHTML = '<div class="trending-empty">Sign in to view trending users</div>';
        }
    }
}

// Load active channels
async function loadActiveChannels() {
    if (!activeChannelsEl) return;
    
    try {
        const fiveMinutesAgo = Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
        const channels = ['general', 'raid', 'trading', 'support'];
        const channelStats = [];
        
        for (const channel of channels) {
            try {
                let countSnapshot;
                try {
                    // Try with composite query first
                    const countQuery = query(
                        collection(db, 'messages'),
                        where('channel', '==', channel),
                        where('deleted', '==', false),
                        where('timestamp', '>=', fiveMinutesAgo)
                    );
                    countSnapshot = await getDocs(countQuery);
            } catch (indexError) {
                // Fallback: get recent messages and filter
                // Silently handle - index will be created when deployed
                const countQuery = query(
                    collection(db, 'messages'),
                    where('channel', '==', channel),
                    where('deleted', '==', false),
                    orderBy('timestamp', 'desc'),
                    limit(100)
                );
                const allMessages = await getDocs(countQuery);
                // Filter by time
                const fiveMinutesAgoTime = fiveMinutesAgo.toMillis();
                const recentMessages = allMessages.docs.filter(doc => {
                    const data = doc.data();
                    return data.timestamp && data.timestamp.toMillis() >= fiveMinutesAgoTime;
                });
                countSnapshot = { size: recentMessages.length, docs: recentMessages };
            }
                
                channelStats.push({
                    name: channel.charAt(0).toUpperCase() + channel.slice(1),
                    count: countSnapshot.size,
                    hasActivity: countSnapshot.size > 0
                });
            } catch (error) {
                // Silently handle permission errors - add channel with 0 count
                channelStats.push({
                    name: channel.charAt(0).toUpperCase() + channel.slice(1),
                    count: 0,
                    hasActivity: false
                });
            }
        }
        
        // Sort by activity count
        channelStats.sort((a, b) => b.count - a.count);
        
        if (channelStats.length === 0) {
            activeChannelsEl.innerHTML = '<div class="channels-empty">No active channels</div>';
        } else {
            activeChannelsEl.innerHTML = channelStats.map(channel => `
                <a href="/chat/?channel=${channel.name.toLowerCase()}" class="channel-item">
                    <span class="channel-name">#${channel.name}</span>
                    <span class="channel-count">${channel.count} messages</span>
                </a>
            `).join('');
        }
        
    } catch (error) {
        console.error('Error loading active channels:', error);
        activeChannelsEl.innerHTML = '<div class="channels-error">Error loading channels</div>';
    }
}

// Load feature stats
async function loadFeatureStats() {
    try {
        // Online users count (from presence collection)
        try {
            const fiveMinutesAgo = Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
            const presenceQuery = query(
                collection(db, 'presence'),
                where('lastSeen', '>=', fiveMinutesAgo),
                limit(100)
            );
            const presenceSnapshot = await getDocs(presenceQuery);
            if (chatOnlineCountEl) {
                chatOnlineCountEl.textContent = presenceSnapshot.size;
            }
        } catch (error) {
            // Silently handle permission errors - show default value
            if (chatOnlineCountEl) chatOnlineCountEl.textContent = '—';
        }
        
        // Quest completions today
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Timestamp.fromDate(today);
            
            let questsSnapshot;
            try {
                // Try with index first
                const questsQuery = query(
                    collection(db, 'userQuests'),
                    where('completed', '==', true),
                    where('completedAt', '>=', todayTimestamp),
                    limit(1000) // Just to count
                );
                questsSnapshot = await getDocs(questsQuery);
            } catch (indexError) {
                // Fallback: get all completed quests and filter
                // Silently handle - index will be created when deployed
                const questsQuery = query(
                    collection(db, 'userQuests'),
                    where('completed', '==', true),
                    orderBy('completedAt', 'desc'),
                    limit(500)
                );
                const allQuests = await getDocs(questsQuery);
                // Filter by date
                const todayTime = todayTimestamp.toMillis();
                const recentQuests = allQuests.docs.filter(doc => {
                    const data = doc.data();
                    return data.completedAt && data.completedAt.toMillis() >= todayTime;
                });
                questsSnapshot = { size: recentQuests.length, docs: recentQuests };
            }
            
            if (questsCompletedCountEl) {
                questsCompletedCountEl.textContent = questsSnapshot.size;
            }
        } catch (error) {
            // Silently handle - errors are expected until indexes are deployed
            if (questsCompletedCountEl) questsCompletedCountEl.textContent = '—';
        }
        
    } catch (error) {
        console.error('Error loading feature stats:', error);
    }
}

// Load user stats (if logged in)
async function loadUserStats() {
    if (!currentUser) return;
    
    try {
        // Get user profile
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        const points = userData.points || 0;
        const level = userData.level || 1;
        
        // Calculate level progress
        let levelProgress = { level: level, xpInCurrentLevel: 0, xpNeededForNextLevel: 10, isMaxLevel: false };
        try {
            const { getLevelProgress } = await import('./quests-init.js');
            levelProgress = getLevelProgress(points);
        } catch (error) {
            console.error('Error calculating level progress:', error);
            // Fallback calculation
            levelProgress = calculateLevelProgress(points);
        }
        
        // Update user stats section
        const levelStatEl = document.getElementById('userLevelStat');
        const xpStatEl = document.getElementById('userXPStat');
        const followersStatEl = document.getElementById('userFollowersStat');
        const levelProgressFillEl = document.getElementById('userLevelProgressFill');
        const levelProgressTextEl = document.getElementById('userLevelProgressText');
        
        if (levelStatEl) levelStatEl.textContent = levelProgress.level;
        if (xpStatEl) xpStatEl.textContent = points;
        
        // Get followers count
        try {
            const followersRef = collection(db, 'followers', currentUser.uid, 'followers');
            const followersSnapshot = await getDocs(followersRef);
            if (followersStatEl) followersStatEl.textContent = followersSnapshot.size;
        } catch (error) {
            if (followersStatEl) followersStatEl.textContent = '0';
        }
        
        // Get quests completed today
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Timestamp.fromDate(today);
            
            const questsQuery = query(
                collection(db, 'userQuests'),
                where('userId', '==', currentUser.uid),
                where('completed', '==', true),
                where('completedAt', '>=', todayTimestamp)
            );
            const questsSnapshot = await getDocs(questsQuery);
            const questsTodayEl = document.getElementById('userQuestsTodayStat');
            if (questsTodayEl) questsTodayEl.textContent = questsSnapshot.size;
        } catch (error) {
            const questsTodayEl = document.getElementById('userQuestsTodayStat');
            if (questsTodayEl) questsTodayEl.textContent = '0';
        }
        
        // Update level progress bar
        if (levelProgressFillEl && levelProgressTextEl) {
            if (levelProgress.isMaxLevel) {
                levelProgressFillEl.style.setProperty('width', '100%');
                levelProgressTextEl.textContent = 'MAX LEVEL';
            } else {
                const progressPercent = (levelProgress.xpInCurrentLevel / levelProgress.xpNeededForNextLevel) * 100;
                levelProgressFillEl.style.setProperty('width', `${Math.min(progressPercent, 100)}%`);
                levelProgressTextEl.textContent = `${levelProgress.xpInCurrentLevel} / ${levelProgress.xpNeededForNextLevel} XP`;
            }
        }
        
        // Update quick stats widget
        if (quickStatsWidgetEl) {
            const quickStatsContent = document.getElementById('quickStatsContent');
            if (quickStatsContent) {
                quickStatsContent.innerHTML = `
                    <div class="quick-stat">
                        <span class="quick-stat-label">Level</span>
                        <span class="quick-stat-value">${levelProgress.level}</span>
                    </div>
                    <div class="quick-stat">
                        <span class="quick-stat-label">XP</span>
                        <span class="quick-stat-value">${points}</span>
                    </div>
                    <div class="quick-stat">
                        <span class="quick-stat-label">Followers</span>
                        <span class="quick-stat-value" id="quickFollowersCount">—</span>
                    </div>
                `;
                
                // Get followers for quick stats
                try {
                    const followersRef = collection(db, 'followers', currentUser.uid, 'followers');
                    const followersSnapshot = await getDocs(followersRef);
                    const quickFollowersEl = document.getElementById('quickFollowersCount');
                    if (quickFollowersEl) quickFollowersEl.textContent = followersSnapshot.size;
                } catch (error) {
                    const quickFollowersEl = document.getElementById('quickFollowersCount');
                    if (quickFollowersEl) quickFollowersEl.textContent = '0';
                }
            }
        }
        
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

// Update last updated text
let lastUpdatedInterval = null;

function updateLastUpdatedText() {
    if (!lastUpdatedEl || !lastUpdateTime) return;
    
    // Clear existing interval
    if (lastUpdatedInterval) {
        clearInterval(lastUpdatedInterval);
    }
    
    // Update immediately
    const updateText = () => {
        if (!lastUpdateTime) return;
        
        const now = new Date();
        const diff = now - lastUpdateTime;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) {
            lastUpdatedEl.textContent = 'Updated just now';
        } else if (minutes === 1) {
            lastUpdatedEl.textContent = 'Updated 1 minute ago';
        } else if (minutes < 5) {
            lastUpdatedEl.textContent = `Updated ${minutes} minutes ago`;
        } else {
            lastUpdatedEl.textContent = 'Updating...';
        }
    };
    
    updateText();
    
    // Update every minute
    lastUpdatedInterval = setInterval(updateText, 60000);
}

// Copy token address
function copyTokenAddress() {
    const addressElement = document.getElementById('tokenAddress');
    const button = document.getElementById('copyButton');
    if (!addressElement || !button) return;
    
    const address = addressElement.textContent.trim();
    if (address === 'COMING SOON') return;
    
    navigator.clipboard.writeText(address).then(function() {
        const originalText = button.textContent;
        button.textContent = 'Copied ✅';
        button.classList.add('copied');
        
        setTimeout(function() {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(function(err) {
        console.error('Failed to copy:', err);
        button.textContent = 'Error';
        setTimeout(function() {
            button.textContent = 'Copy';
        }, 2000);
    });
}

// Calculate level progress (fallback if import fails)
function calculateLevelProgress(points) {
    const MAX_LEVEL = 100;
    const BASE_XP = 10;
    
    let level = 1;
    let xpInCurrentLevel = points;
    let xpNeededForNextLevel = BASE_XP;
    
    while (xpInCurrentLevel >= xpNeededForNextLevel && level < MAX_LEVEL) {
        xpInCurrentLevel -= xpNeededForNextLevel;
        level++;
        xpNeededForNextLevel = BASE_XP * level;
    }
    
    return {
        level: Math.min(level, MAX_LEVEL),
        xpInCurrentLevel: Math.max(0, xpInCurrentLevel),
        xpNeededForNextLevel: level >= MAX_LEVEL ? 0 : xpNeededForNextLevel,
        isMaxLevel: level >= MAX_LEVEL
    };
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
