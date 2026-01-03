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
    addDoc,
    updateDoc,
    serverTimestamp,
    increment,
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
        
        // Load trending posts (most likes in last 24 hours)
        try {
            const twentyFourHoursAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
            const trendingPosts = [];
            let postsSnapshot;
            
            try {
                // Try with composite query first (requires index: deleted, createdAt, likesCount)
                const postsQuery = query(
                    collection(db, 'posts'),
                    where('deleted', '==', false),
                    where('createdAt', '>=', twentyFourHoursAgo),
                    orderBy('createdAt', 'desc'),
                    limit(100)
                );
                postsSnapshot = await getDocs(postsQuery);
            } catch (indexError) {
                console.warn('[loadActivityFeed] Index error or index building, using fallback query:', indexError.message);
                // Fallback: query without orderBy (no index needed), filter and sort in JavaScript
                try {
                    const postsQuery = query(
                        collection(db, 'posts'),
                        where('deleted', '==', false),
                        limit(500) // Get more documents since we'll filter in JS
                    );
                    postsSnapshot = await getDocs(postsQuery);
                    console.log(`[loadActivityFeed] Fallback posts query returned ${postsSnapshot.size} documents`);
                } catch (fallbackError) {
                    console.error('[loadActivityFeed] Fallback query also failed:', fallbackError);
                    // If even the simple query fails, try without any filters
                    const simpleQuery = query(
                        collection(db, 'posts'),
                        limit(500)
                    );
                    postsSnapshot = await getDocs(simpleQuery);
                    console.log(`[loadActivityFeed] Simple query returned ${postsSnapshot.size} documents`);
                }
            }
            
            for (const postDoc of postsSnapshot.docs) {
                const postData = postDoc.data();
                
                // Skip deleted posts (if not already filtered by query)
                if (postData.deleted === true) continue;
                
                if (!postData.createdAt || !postData.userId) {
                    console.warn('[loadActivityFeed] Post missing createdAt or userId:', postDoc.id);
                    continue;
                }
                
                // Filter by time if we used the fallback query
                let postTime;
                if (postData.createdAt && typeof postData.createdAt.toMillis === 'function') {
                    postTime = postData.createdAt.toMillis();
                } else if (postData.createdAt && postData.createdAt.seconds) {
                    postTime = postData.createdAt.seconds * 1000;
                } else {
                    console.warn('[loadActivityFeed] Post createdAt is not a valid timestamp:', postDoc.id);
                    continue;
                }
                
                const twentyFourHoursAgoTime = twentyFourHoursAgo.toMillis();
                if (postTime < twentyFourHoursAgoTime) continue;
                
                // Get user info
                const userDoc = await getDoc(doc(db, 'users', postData.userId));
                const userData = userDoc.exists() ? userDoc.data() : null;
                const username = userData?.username || 'Anonymous';
                
                // Calculate hot score for this post using vote score
                const voteScore = postData.voteScore || 0;
                const comments = postData.commentsCount || 0;
                const hotScore = calculateHotScore(voteScore, comments, postData.createdAt);
                
                trendingPosts.push({
                    type: 'trending_post',
                    userId: postData.userId,
                    username: username,
                    postId: postDoc.id,
                    content: postData.content || '',
                    images: postData.images || [],
                    videos: postData.videos || [],
                    voteScore: voteScore,
                    commentsCount: comments,
                    timestamp: postData.createdAt,
                    sortTime: postTime,
                    hotScore: hotScore,
                    userData: userData
                });
            }
            
            // Sort trending posts by hotScore (highest first), then take top 25
            trendingPosts.sort((a, b) => {
                // Sort by hot score (higher score first)
                return b.hotScore - a.hotScore;
            });
            activities.push(...trendingPosts.slice(0, 25));
            console.log(`[loadActivityFeed] Loaded ${trendingPosts.length} trending posts, adding ${Math.min(trendingPosts.length, 25)} to feed`);
        } catch (error) {
            console.error('[loadActivityFeed] Error loading trending posts:', error);
            // Continue even if posts fail to load
        }
        
        // Posts are already sorted by hotScore, so no need to sort again
        const displayActivities = activities;
        
        // Render activities
        if (displayActivities.length === 0) {
            activityFeedEl.innerHTML = '<div class="activity-empty">No recent activity. Check back soon!</div>';
        } else {
            activityFeedEl.innerHTML = displayActivities.map(activity => createActivityItem(activity)).join('');
            
            // Add click handlers for activity items
            activityFeedEl.querySelectorAll('.activity-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't navigate if clicking on comment button or comments section
                    if (e.target.closest('.activity-post-comment-btn') || 
                        e.target.closest('.activity-post-comments-section') ||
                        e.target.closest('.activity-post-comment-input-wrapper') ||
                        e.target.closest('.activity-post-comment-submit')) {
                        return;
                    }
                    
                    const userId = item.dataset.userId;
                    const postId = item.dataset.postId;
                    
                    // If it's a trending post, navigate to feed page
                    if (postId) {
                        window.location.href = `/feed/#post-${postId}`;
                        return;
                    }
                    
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
            
            // Add profile navigation for trending post authors (avatar and username)
            activityFeedEl.querySelectorAll('.activity-post').forEach(item => {
                const userId = item.dataset.userId;
                if (userId) {
                    const avatar = item.querySelector('.activity-post-avatar');
                    const authorSection = item.querySelector('.activity-post-author');
                    
                    const navigateToProfile = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.location.href = `/profile/?user=${userId}`;
                    };
                    
                    if (avatar) {
                        avatar.style.cursor = 'pointer';
                        avatar.addEventListener('click', navigateToProfile);
                    }
                    
                    if (authorSection) {
                        authorSection.style.cursor = 'pointer';
                        authorSection.addEventListener('click', navigateToProfile);
                    }
                }
            });
            
            // Add comment button handlers for trending posts
            activityFeedEl.querySelectorAll('.activity-post-comment-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const postId = btn.dataset.postId;
                    if (postId) {
                        toggleActivityComments(postId);
                    }
                });
            });
            
            // Add comment submit handlers
            activityFeedEl.querySelectorAll('.activity-post-comment-submit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const postId = btn.dataset.postId;
                    const input = document.getElementById(`activityCommentInput_${postId}`);
                    if (postId && input) {
                        handleActivityAddComment(postId, input);
                    }
                });
            });
            
            // Add Enter key handler for comment inputs
            activityFeedEl.querySelectorAll('.activity-post-comment-input').forEach(input => {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.stopPropagation();
                        const postId = input.id.replace('activityCommentInput_', '');
                        handleActivityAddComment(postId, input);
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
        'daily_post_1': { title: 'Content Creator', rewardPoints: 5 },
        'daily_quests_visit': { title: 'Quest Explorer', rewardPoints: 5 },
        'daily_login': { title: 'Daily Login', rewardPoints: 5 },
        'daily_complete_quest': { title: 'Quest Completer', rewardPoints: 15 },
        'daily_follow_3': { title: 'Social Butterfly', rewardPoints: 15 },
        'weekly_chat_50': { title: 'Chat Champion', rewardPoints: 50 },
        'weekly_complete_daily_5': { title: 'Daily Grinder', rewardPoints: 75 },
        'achievement_verify_x': { title: 'Verified Ape', rewardPoints: 100 },
        'weekly_active_3_days': { title: 'Loyal Ape', rewardPoints: 50 },
        'weekly_get_25_followers': { title: 'Influencer Ape', rewardPoints: 100 }
    };
    
    return questInfoMap[questId] || { title: 'Quest', rewardPoints: 0 };
}

// Create activity item HTML
function createActivityItem(activity) {
    const timeAgo = getTimeAgo(activity.timestamp);
    let content = '';
    
    if (activity.type === 'trending_post') {
        const userLevel = activity.userData?.level || 1;
        const bannerImage = activity.userData?.bannerImage || '/pfp_apes/bg1.png';
        const fullContent = activity.content ? escapeHtml(activity.content).replace(/\n/g, '<br>') : '';
        
        content = `
            <div class="activity-item activity-post activity-post-full" data-user-id="${activity.userId}" data-post-id="${activity.postId}">
                <div class="activity-post-header">
                    <img src="${bannerImage}" alt="${escapeHtml(activity.username)}" class="activity-post-avatar" />
                    <div class="activity-post-author">
                        <div class="activity-post-username">@${escapeHtml(activity.username)}</div>
                        <div class="activity-post-meta">
                            <span class="activity-post-level">LVL ${userLevel}</span>
                            <span class="activity-time">${timeAgo}</span>
                        </div>
                    </div>
                </div>
                <div class="activity-post-body">
                    ${fullContent ? `<div class="activity-post-text">${fullContent}</div>` : ''}
                    ${activity.images && activity.images.length > 0 ? `
                        <div class="activity-post-images">
                            ${activity.images.map(img => `
                                <img src="${escapeHtml(img)}" alt="Post image" class="activity-post-image" />
                            `).join('')}
                        </div>
                    ` : ''}
                    ${activity.videos && activity.videos.length > 0 ? `
                        <div class="activity-post-videos">
                            ${activity.videos.map(vid => `
                                <video src="${escapeHtml(vid)}" class="activity-post-video" controls></video>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="activity-post-footer">
                    <span class="activity-post-votes">↑ ${activity.voteScore || 0}</span>
                    <button class="activity-post-comment-btn" data-post-id="${activity.postId}">
                        💬 <span class="activity-post-comment-count">${activity.commentsCount || 0}</span>
                    </button>
                </div>
                <div class="activity-post-comments-section hide" id="activityCommentsSection_${activity.postId}">
                    <div class="activity-post-comments-list" id="activityCommentsList_${activity.postId}"></div>
                    ${currentUser ? `
                        <div class="activity-post-comment-input-wrapper">
                            <input type="text" class="activity-post-comment-input" id="activityCommentInput_${activity.postId}" placeholder="Write a comment..." maxlength="500" />
                            <button class="activity-post-comment-submit" data-post-id="${activity.postId}">Post</button>
                        </div>
                    ` : '<div class="activity-post-comment-login">Please log in to comment</div>'}
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

// Calculate Reddit-style "hot" score for trending posts
// Formula: hot_score = (voteScore + comments * weight) / (age_in_hours + 2)^gravity
function calculateHotScore(voteScore, comments, createdAt) {
    // Get post age in hours
    let postTime;
    if (createdAt && typeof createdAt.toMillis === 'function') {
        postTime = createdAt.toMillis();
    } else if (createdAt && createdAt.seconds) {
        postTime = createdAt.seconds * 1000;
    } else {
        // Invalid timestamp, return 0
        return 0;
    }
    
    const now = Date.now();
    const ageInMs = Math.max(0, now - postTime); // Ensure non-negative
    const ageInHours = ageInMs / (1000 * 60 * 60);
    
    // Algorithm parameters
    const commentWeight = 1.5; // Comments count 1.5x more than likes
    const gravity = 1.5; // Controls decay rate (higher = faster decay)
    const timeOffset = 2; // Prevents division by zero for brand new posts
    
    // Calculate engagement score
    const engagement = voteScore + (comments * commentWeight);
    
    // Calculate hot score with time decay
    const hotScore = engagement / Math.pow(ageInHours + timeOffset, gravity);
    
    return hotScore;
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
        const followersStatEl = document.getElementById('userFollowersStat');
        const followingStatEl = document.getElementById('userFollowingStat');
        const postsStatEl = document.getElementById('userPostsStat');
        const levelProgressFillEl = document.getElementById('userLevelProgressFill');
        const levelProgressTextEl = document.getElementById('userLevelProgressText');
        
        if (levelStatEl) levelStatEl.textContent = levelProgress.level;
        
        // Get followers count
        try {
            const followersRef = collection(db, 'followers', currentUser.uid, 'followers');
            const followersSnapshot = await getDocs(followersRef);
            if (followersStatEl) followersStatEl.textContent = followersSnapshot.size;
        } catch (error) {
            if (followersStatEl) followersStatEl.textContent = '0';
        }
        
        // Get following count
        try {
            const followingRef = collection(db, 'following', currentUser.uid, 'following');
            const followingSnapshot = await getDocs(followingRef);
            if (followingStatEl) followingStatEl.textContent = followingSnapshot.size;
        } catch (error) {
            if (followingStatEl) followingStatEl.textContent = '0';
        }
        
        // Get posts count
        try {
            const postsQuery = query(
                collection(db, 'posts'),
                where('userId', '==', currentUser.uid),
                where('deleted', '==', false)
            );
            const postsSnapshot = await getDocs(postsQuery);
            if (postsStatEl) postsStatEl.textContent = postsSnapshot.size;
        } catch (error) {
            if (postsStatEl) postsStatEl.textContent = '0';
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

// Toggle comments section for activity post
function toggleActivityComments(postId) {
    const commentsSection = document.getElementById(`activityCommentsSection_${postId}`);
    if (!commentsSection) return;
    
    const isVisible = !commentsSection.classList.contains('hide');
    if (isVisible) {
        commentsSection.classList.add('hide');
    } else {
        commentsSection.classList.remove('hide');
        loadActivityComments(postId);
    }
}

// Load comments for an activity post
async function loadActivityComments(postId) {
    const commentsListEl = document.getElementById(`activityCommentsList_${postId}`);
    if (!commentsListEl) return;
    
    try {
        let commentsSnapshot;
        
        try {
            const commentsQuery = query(
                collection(db, 'posts', postId, 'comments'),
                where('deleted', '==', false),
                orderBy('createdAt', 'asc')
            );
            
            commentsSnapshot = await getDocs(commentsQuery);
        } catch (indexError) {
            console.warn('Index not found for comments, using fallback query:', indexError);
            try {
                const commentsQuery = query(
                    collection(db, 'posts', postId, 'comments'),
                    where('deleted', '==', false)
                );
                
                commentsSnapshot = await getDocs(commentsQuery);
                
                const commentsArray = Array.from(commentsSnapshot.docs);
                commentsArray.sort((a, b) => {
                    const aData = a.data();
                    const bData = b.data();
                    const aTime = aData.createdAt?.toMillis ? aData.createdAt.toMillis() : (aData.createdAt?.seconds * 1000 || 0);
                    const bTime = bData.createdAt?.toMillis ? bData.createdAt.toMillis() : (bData.createdAt?.seconds * 1000 || 0);
                    return aTime - bTime;
                });
                
                commentsSnapshot = {
                    docs: commentsArray,
                    empty: commentsArray.length === 0,
                    size: commentsArray.length,
                    forEach: (callback) => commentsArray.forEach(callback),
                    query: commentsSnapshot.query
                };
            } catch (fallbackError) {
                console.error('Fallback query also failed:', fallbackError);
                const allCommentsQuery = query(
                    collection(db, 'posts', postId, 'comments')
                );
                
                commentsSnapshot = await getDocs(allCommentsQuery);
                
                const commentsArray = Array.from(commentsSnapshot.docs)
                    .filter(doc => {
                        const data = doc.data();
                        return data.deleted !== true;
                    })
                    .sort((a, b) => {
                        const aData = a.data();
                        const bData = b.data();
                        const aTime = aData.createdAt?.toMillis ? aData.createdAt.toMillis() : (aData.createdAt?.seconds * 1000 || 0);
                        const bTime = bData.createdAt?.toMillis ? bData.createdAt.toMillis() : (bData.createdAt?.seconds * 1000 || 0);
                        return aTime - bTime;
                    });
                
                commentsSnapshot = {
                    docs: commentsArray,
                    empty: commentsArray.length === 0,
                    size: commentsArray.length,
                    forEach: (callback) => commentsArray.forEach(callback),
                    query: commentsSnapshot.query
                };
            }
        }
        
        if (commentsSnapshot.empty) {
            commentsListEl.innerHTML = '<div class="post-comments-empty">No comments yet</div>';
            return;
        }
        
        const comments = await Promise.all(commentsSnapshot.docs.map(async (commentDoc) => {
            const commentData = commentDoc.data();
            try {
                const userDoc = await getDoc(doc(db, 'users', commentData.userId));
                const userData = userDoc.exists() ? userDoc.data() : null;
                return {
                    id: commentDoc.id,
                    ...commentData,
                    userData: userData
                };
            } catch (error) {
                return {
                    id: commentDoc.id,
                    ...commentData,
                    userData: null
                };
            }
        }));
        
        commentsListEl.innerHTML = comments.map(comment => renderActivityComment(comment, postId)).join('');
        
        // Set up profile navigation for comment authors
        comments.forEach(comment => {
            if (comment.userId) {
                const commentEl = document.querySelector(`.post-comment[data-comment-id="${comment.id}"]`);
                if (commentEl) {
                    const avatar = commentEl.querySelector('.comment-author-avatar');
                    const authorName = commentEl.querySelector('.comment-author');
                    
                    const navigateToProfile = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.location.href = `/profile/?user=${comment.userId}`;
                    };
                    
                    if (avatar) {
                        avatar.style.cursor = 'pointer';
                        avatar.addEventListener('click', navigateToProfile);
                    }
                    
                    if (authorName) {
                        authorName.style.cursor = 'pointer';
                        authorName.addEventListener('click', navigateToProfile);
                    }
                }
            }
        });
        
        // Set up delete listeners for comments
        comments.forEach(comment => {
            if (currentUser && comment.userId === currentUser.uid) {
                const deleteBtn = document.querySelector(`.comment-delete-btn[data-comment-id="${comment.id}"]`);
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleActivityDeleteComment(postId, comment.id);
                    });
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsListEl.innerHTML = '<div class="post-comments-error">Error loading comments</div>';
    }
}

// Render comment for activity post
function renderActivityComment(comment, postId) {
    const createdAt = comment.createdAt?.toDate ? comment.createdAt.toDate() : new Date(comment.createdAt?.seconds * 1000 || Date.now());
    const timeAgo = getTimeAgo(comment.createdAt);
    const bannerImage = comment.userData?.bannerImage || '/pfp_apes/bg1.png';
    const canDelete = currentUser && comment.userId === currentUser.uid;
    
    return `
        <div class="post-comment" data-comment-id="${comment.id}">
            <img src="${bannerImage}" alt="${comment.username}" class="comment-author-avatar" />
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.username)}</span>
                    <span class="comment-time">${timeAgo}</span>
                    ${canDelete ? `<button class="comment-delete-btn" data-comment-id="${comment.id}" title="Delete comment">×</button>` : ''}
                </div>
                <div class="comment-text">${escapeHtml(comment.content).replace(/\n/g, '<br>')}</div>
            </div>
        </div>
    `;
}

// Handle add comment for activity post
async function handleActivityAddComment(postId, commentInputEl) {
    if (!currentUser) {
        alert('Please log in to comment');
        return;
    }
    
    const content = commentInputEl.value.trim();
    if (!content) {
        return;
    }
    
    if (content.length > 500) {
        alert('Comment must be 500 characters or less');
        return;
    }
    
    try {
        // Get user profile
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
            alert('User profile not found');
            return;
        }
        const userData = userDoc.data();
        
        // Add comment
        await addDoc(collection(db, 'posts', postId, 'comments'), {
            userId: currentUser.uid,
            username: userData.username || 'Anonymous',
            content: content,
            createdAt: serverTimestamp(),
            deleted: false
        });
        
        // Update post comments count
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentsCount: increment(1),
            updatedAt: serverTimestamp()
        });
        
        // Clear input
        commentInputEl.value = '';
        
        // Reload comments
        loadActivityComments(postId);
        
        // Update comment count in UI
        const commentBtn = document.querySelector(`.activity-post-comment-btn[data-post-id="${postId}"]`);
        if (commentBtn) {
            const countEl = commentBtn.querySelector('.activity-post-comment-count');
            if (countEl) {
                const currentCount = parseInt(countEl.textContent) || 0;
                countEl.textContent = currentCount + 1;
            }
        }
        
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Failed to add comment. Please try again.');
    }
}

// Handle delete comment for activity post
async function handleActivityDeleteComment(postId, commentId) {
    if (!currentUser) return;
    
    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }
    
    try {
        const commentRef = doc(db, 'posts', postId, 'comments', commentId);
        
        // Soft delete
        await updateDoc(commentRef, {
            deleted: true,
            updatedAt: serverTimestamp()
        });
        
        // Update post comments count
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentsCount: increment(-1),
            updatedAt: serverTimestamp()
        });
        
        // Reload comments
        loadActivityComments(postId);
        
        // Update comment count in UI
        const commentBtn = document.querySelector(`.activity-post-comment-btn[data-post-id="${postId}"]`);
        if (commentBtn) {
            const countEl = commentBtn.querySelector('.activity-post-comment-count');
            if (countEl) {
                const currentCount = parseInt(countEl.textContent) || 0;
                countEl.textContent = Math.max(0, currentCount - 1);
            }
        }
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        alert('Failed to delete comment. Please try again.');
    }
}
