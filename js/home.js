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
    setDoc,
    serverTimestamp,
    increment,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { withBase } from './base-url.js';

// Constants
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const ACTIVITY_LIMIT = 30; // Max activity items to show
const TRENDING_LIMIT = 5; // Top 5 trending users
const POSTS_PER_PAGE = 5; // Number of posts to show per page

// State
let currentUser = null;
let pollInterval = null;
let lastUpdateTime = null;
let currentFeedType = 'trending'; // 'trending' or 'following'
let allActivities = []; // Store all fetched activities
let displayedActivityCount = 0; // Track how many activities are currently displayed
let isLoadingMoreActivities = false; // Prevent multiple simultaneous loads

// DOM Elements
let activityFeedEl, lastUpdatedEl, refreshBtnEl;
let userStatsSectionEl;
let trendingUsersEl, activeChannelsEl;
let chatOnlineCountEl, questsCompletedCountEl;
let trendingTabEl, followingTabEl;

// Initialize home page
export function initHome() {
    // Get DOM elements
    activityFeedEl = document.getElementById('activityFeed');
    lastUpdatedEl = document.getElementById('lastUpdated');
    refreshBtnEl = document.getElementById('refreshFeedBtn');
    userStatsSectionEl = document.getElementById('userStatsSection');
    trendingUsersEl = document.getElementById('trendingUsers');
    activeChannelsEl = document.getElementById('activeChannels');
    chatOnlineCountEl = document.getElementById('chatOnlineCount');
    questsCompletedCountEl = document.getElementById('questsCompletedCount');
    trendingTabEl = document.getElementById('trendingTab');
    followingTabEl = document.getElementById('followingTab');

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

    // Feed tab switching
    if (trendingTabEl) {
        trendingTabEl.addEventListener('click', () => switchFeedType('trending'));
    }
    if (followingTabEl) {
        followingTabEl.addEventListener('click', () => switchFeedType('following'));
    }
    
    // Hide following tab if not logged in (will be shown when user logs in)
    if (followingTabEl) {
        followingTabEl.style.display = currentUser ? 'inline-block' : 'none';
    }

    // Set up auth state listener
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        
        // Show/hide following tab based on login status
        if (followingTabEl) {
            if (user) {
                followingTabEl.style.display = 'inline-block';
            } else {
                followingTabEl.style.display = 'none';
                // Switch to trending if following tab was active
                if (currentFeedType === 'following') {
                    switchFeedType('trending');
                }
            }
        }
        
        if (user) {
            // Show user stats section
            if (userStatsSectionEl) {
                userStatsSectionEl.classList.remove('hide');
            }
            await loadUserStats();
        } else {
            // Hide user stats section
            if (userStatsSectionEl) {
                userStatsSectionEl.classList.add('hide');
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

// Switch feed type between trending and following
function switchFeedType(feedType) {
    console.log('[switchFeedType] Switching to:', feedType, 'current:', currentFeedType);
    if (feedType === currentFeedType) {
        console.log('[switchFeedType] Already on this feed type, returning');
        return;
    }
    
    currentFeedType = feedType;
    console.log('[switchFeedType] Updated currentFeedType to:', currentFeedType);
    
    // Update tab active states
    if (trendingTabEl) {
        trendingTabEl.classList.toggle('active', feedType === 'trending');
    }
    if (followingTabEl) {
        followingTabEl.classList.toggle('active', feedType === 'following');
    }
    
    // Reload feed with new type
    console.log('[switchFeedType] Calling loadAllData with feedType:', currentFeedType);
    loadAllData(true);
}

// Load all homepage data
async function loadAllData(manualRefresh = false) {
    try {
        if (activityFeedEl) {
            activityFeedEl.innerHTML = '<div class="activity-loading">Loading activity...</div>';
        }
        
        // Load all data in parallel
        await Promise.all([
            loadActivityFeed(currentFeedType),
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
async function loadActivityFeed(feedType = 'trending') {
    if (!activityFeedEl) return;
    
    try {
        const activities = [];
        
        if (feedType === 'following') {
            // Load posts from users you follow
            console.log('[loadActivityFeed] Loading following feed, currentUser:', currentUser?.uid);
            await loadFollowingFeed(activities);
            console.log('[loadActivityFeed] Following feed completed, activities.length:', activities.length);
        } else {
            // Load trending posts (most likes in last 24 hours)
            await loadTrendingFeed(activities);
        }
        
        // Reset pagination state
        allActivities = [];
        displayedActivityCount = 0;
        isLoadingMoreActivities = false;
        
        // Sort activities by timestamp (newest first)
        activities.sort((a, b) => {
            const timeA = a.sortTime || (a.timestamp?.toMillis?.() || a.timestamp?.seconds * 1000 || 0);
            const timeB = b.sortTime || (b.timestamp?.toMillis?.() || b.timestamp?.seconds * 1000 || 0);
            return timeB - timeA;
        });
        
        // Store all activities for pagination
        allActivities = activities;
        displayedActivityCount = 0;
        
        // Display first 5 activities
        if (allActivities.length === 0) {
            if (feedType === 'following') {
                if (!currentUser) {
                    activityFeedEl.innerHTML = '<div class="activity-empty">Please log in to see posts from users you follow.</div>';
                } else {
                    activityFeedEl.innerHTML = '<div class="activity-empty">no apes your following have posted...</div>';
                }
            } else {
                activityFeedEl.innerHTML = '<div class="activity-empty">no apes trending...</div>';
            }
        } else {
            await displayNextActivities(POSTS_PER_PAGE);
        }
        
    } catch (error) {
        console.error('Error loading activity feed:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            feedType: feedType,
            stack: error.stack
        });
        if (feedType === 'following') {
            activityFeedEl.innerHTML = '<div class="activity-error">Error loading following feed. Please try again.</div>';
        } else {
            activityFeedEl.innerHTML = '<div class="activity-error">Error loading feed. Please try again.</div>';
        }
    }
}

// Load trending feed
async function loadTrendingFeed(activities) {
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
                } catch (fallbackError) {
                    console.error('[loadActivityFeed] Fallback query also failed:', fallbackError);
                    // If even the simple query fails, try without any filters
                    const simpleQuery = query(
                        collection(db, 'posts'),
                        limit(500)
                    );
                    postsSnapshot = await getDocs(simpleQuery);
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
                
                // Filter out posts from users with very negative karma (spam prevention)
                const userKarma = userData?.karma || 0;
                if (userKarma < -10) {
                    continue; // Skip posts from users with karma < -10
                }
                
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
                    upvotes: postData.upvotes || {},
                    downvotes: postData.downvotes || {},
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
        } catch (error) {
            console.error('[loadTrendingFeed] Error loading trending posts:', error);
            // Continue even if posts fail to load
        }
}

// Display next batch of activities
async function displayNextActivities(count = 5) {
    if (!activityFeedEl) return;
    
    if (allActivities.length === 0) {
        if (currentFeedType === 'following') {
            if (!currentUser) {
                activityFeedEl.innerHTML = '<div class="activity-empty">Please log in to see posts from users you follow.</div>';
            } else {
                activityFeedEl.innerHTML = '<div class="activity-empty">no apes your following have posted...</div>';
            }
        } else {
            activityFeedEl.innerHTML = '<div class="activity-empty">no apes trending...</div>';
        }
        return;
    }
    
    // Get next batch of activities to display
    const activitiesToDisplay = allActivities.slice(displayedActivityCount, displayedActivityCount + count);
    
    if (activitiesToDisplay.length === 0) {
        // No more activities to display
        const loadMoreBtn = document.getElementById('loadMoreActivitiesBtn');
        if (loadMoreBtn) {
            loadMoreBtn.remove();
        }
        return;
    }
    
    // Render activities (append if not first batch)
    if (displayedActivityCount === 0) {
        activityFeedEl.innerHTML = activitiesToDisplay.map(activity => createActivityItem(activity)).join('');
    } else {
        // Remove load more button temporarily
        const loadMoreBtn = document.getElementById('loadMoreActivitiesBtn');
        if (loadMoreBtn) {
            loadMoreBtn.remove();
        }
        
        // Append new activities
        const existingHTML = activityFeedEl.innerHTML;
        activityFeedEl.innerHTML = existingHTML + activitiesToDisplay.map(activity => createActivityItem(activity)).join('');
    }
    
    // Update displayed count
    displayedActivityCount += activitiesToDisplay.length;
    
    // Add click handlers for new activities
    setupActivityHandlers();
    
    // Add "Load More" button if there are more activities
    if (displayedActivityCount < allActivities.length) {
        addLoadMoreActivitiesButton();
    }
}

// Add "Load More" button for activities
function addLoadMoreActivitiesButton() {
    // Remove existing button if any
    const existingBtn = document.getElementById('loadMoreActivitiesBtn');
    if (existingBtn) {
        existingBtn.remove();
    }
    
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'loadMoreActivitiesBtn';
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = 'Load More';
    loadMoreBtn.addEventListener('click', handleLoadMoreActivities);
    
    activityFeedEl.appendChild(loadMoreBtn);
}

// Handle "Load More" button click for activities
async function handleLoadMoreActivities() {
    if (isLoadingMoreActivities) return;
    
    isLoadingMoreActivities = true;
    const loadMoreBtn = document.getElementById('loadMoreActivitiesBtn');
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
    }
    
    await displayNextActivities(POSTS_PER_PAGE);
    
    isLoadingMoreActivities = false;
    if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load More';
    }
}

// Load following feed - posts from users you follow
async function loadFollowingFeed(activities) {
    if (!currentUser) {
        console.log('[loadFollowingFeed] No current user');
        return; // Can't load following feed if not logged in
    }
    
    try {
        // Get list of users you're following
        const followingRef = collection(db, 'following', currentUser.uid, 'following');
        const followingSnapshot = await getDocs(followingRef);
        
        if (followingSnapshot.empty) {
            console.log('[loadFollowingFeed] Not following any users yet');
            // Don't return - let the empty activities array trigger the empty message
            return;
        }
        
        const followingUserIds = [];
        followingSnapshot.forEach((doc) => {
            followingUserIds.push(doc.id);
        });
        
        if (followingUserIds.length === 0) {
            console.log('[loadFollowingFeed] No following user IDs found');
            return;
        }
        
        console.log(`[loadFollowingFeed] Following ${followingUserIds.length} user(s), fetching their posts...`);
        
        // Fetch posts from each user you follow
        // Note: Firestore 'in' query is limited to 10 items, so we need to batch
        const BATCH_SIZE = 10;
        const allPosts = [];
        
        for (let i = 0; i < followingUserIds.length; i += BATCH_SIZE) {
            const batch = followingUserIds.slice(i, i + BATCH_SIZE);
            
            try {
                const postsQuery = query(
                    collection(db, 'posts'),
                    where('userId', 'in', batch),
                    where('deleted', '==', false),
                    orderBy('createdAt', 'desc'),
                    limit(50) // Limit per batch to avoid too many reads
                );
                
                const postsSnapshot = await getDocs(postsQuery);
                
                for (const postDoc of postsSnapshot.docs) {
                    const postData = postDoc.data();
                    
                    // Skip deleted posts
                    if (postData.deleted === true) continue;
                    
                    if (!postData.createdAt || !postData.userId) {
                        console.warn('[loadFollowingFeed] Post missing createdAt or userId:', postDoc.id);
                        continue;
                    }
                    
                    // Get post timestamp
                    let postTime;
                    if (postData.createdAt && typeof postData.createdAt.toMillis === 'function') {
                        postTime = postData.createdAt.toMillis();
                    } else if (postData.createdAt && postData.createdAt.seconds) {
                        postTime = postData.createdAt.seconds * 1000;
                    } else {
                        continue;
                    }
                    
                    // Get user info
                    const userDoc = await getDoc(doc(db, 'users', postData.userId));
                    const userData = userDoc.exists() ? userDoc.data() : null;
                    const username = userData?.username || 'Anonymous';
                    
                    // Calculate vote score
                    const voteScore = postData.voteScore || 0;
                    const comments = postData.commentsCount || 0;
                    
                    allPosts.push({
                        type: 'trending_post',
                        userId: postData.userId,
                        username: username,
                        postId: postDoc.id,
                        content: postData.content || '',
                        images: postData.images || [],
                        videos: postData.videos || [],
                        upvotes: postData.upvotes || {},
                        downvotes: postData.downvotes || {},
                        voteScore: voteScore,
                        commentsCount: comments,
                        timestamp: postData.createdAt,
                        sortTime: postTime,
                        userData: userData
                    });
                }
            } catch (batchError) {
                console.error(`[loadFollowingFeed] Error fetching batch ${i}-${i + BATCH_SIZE}:`, batchError);
                // Try fallback: query without orderBy if index doesn't exist
                try {
                    const fallbackQuery = query(
                        collection(db, 'posts'),
                        where('userId', 'in', batch),
                        where('deleted', '==', false),
                        limit(100)
                    );
                    const fallbackSnapshot = await getDocs(fallbackQuery);
                    
                    for (const postDoc of fallbackSnapshot.docs) {
                        const postData = postDoc.data();
                        if (postData.deleted === true) continue;
                        if (!postData.createdAt || !postData.userId) continue;
                        
                        let postTime;
                        if (postData.createdAt && typeof postData.createdAt.toMillis === 'function') {
                            postTime = postData.createdAt.toMillis();
                        } else if (postData.createdAt && postData.createdAt.seconds) {
                            postTime = postData.createdAt.seconds * 1000;
                        } else {
                            continue;
                        }
                        
                        const userDoc = await getDoc(doc(db, 'users', postData.userId));
                        const userData = userDoc.exists() ? userDoc.data() : null;
                        const username = userData?.username || 'Anonymous';
                        const voteScore = postData.voteScore || 0;
                        const comments = postData.commentsCount || 0;
                        
                        allPosts.push({
                            type: 'post',
                            userId: postData.userId,
                            username: username,
                            postId: postDoc.id,
                            content: postData.content || '',
                            images: postData.images || [],
                            videos: postData.videos || [],
                            upvotes: postData.upvotes || {},
                            downvotes: postData.downvotes || {},
                            voteScore: voteScore,
                            commentsCount: comments,
                            timestamp: postData.createdAt,
                            sortTime: postTime,
                            userData: userData
                        });
                    }
                } catch (fallbackError) {
                    console.error(`[loadFollowingFeed] Fallback query also failed for batch:`, fallbackError);
                }
            }
        }
        
        // Sort by timestamp (newest first) and add to activities
        allPosts.sort((a, b) => b.sortTime - a.sortTime);
        activities.push(...allPosts);
        
        console.log(`[loadFollowingFeed] Loaded ${allPosts.length} post(s) from followed users`);
        
    } catch (error) {
        console.error('[loadFollowingFeed] Error loading following feed:', error);
        console.error('[loadFollowingFeed] Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        // Don't throw - let the empty activities array trigger the empty message
        // The error will be handled by loadActivityFeed's empty state check
    }
}

function setupActivityHandlers() {
    // Add click handlers for activity items
    activityFeedEl.querySelectorAll('.activity-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't navigate if clicking on vote buttons, comment button, comments section, or action buttons
                    if (e.target.closest('.activity-post-vote-btn') ||
                        e.target.closest('.activity-post-vote-section') ||
                        e.target.closest('.activity-post-comment-btn') || 
                        e.target.closest('.activity-post-comments-section') ||
                        e.target.closest('.activity-post-comment-input-wrapper') ||
                        e.target.closest('.activity-post-comment-submit') ||
                        e.target.closest('.post-edit-btn') ||
                        e.target.closest('.post-delete-btn') ||
                        e.target.closest('.share-btn') ||
                        e.target.closest('.report-btn') ||
                        e.target.closest('.post-header-actions')) {
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
    
    // Add vote button handlers for trending posts
            activityFeedEl.querySelectorAll('.activity-post-vote-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!currentUser) {
                        alert('Please log in to vote');
                        const loginBtn = document.getElementById('headerLoginBtn');
                        if (loginBtn) loginBtn.click();
                        return;
                    }
                    const postId = btn.dataset.postId;
                    const voteType = btn.dataset.voteType;
                    if (postId && voteType) {
                        handleActivityVote(postId, voteType);
                    }
                });
    });
    
    // Add comment button handlers for trending posts
            activityFeedEl.querySelectorAll('.activity-post-comment-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!currentUser) {
                        alert('Please log in to view comments');
                        const loginBtn = document.getElementById('headerLoginBtn');
                        if (loginBtn) loginBtn.click();
                        return;
                    }
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
            
            // Setup emoji pickers for comment inputs
            activityFeedEl.querySelectorAll('.activity-comment-emoji-btn').forEach(btn => {
                const postId = btn.dataset.postId;
                if (postId && !btn.dataset.emojiSetup) {
                    setupActivityCommentEmojiPicker(postId);
                }
            });
            
            // Single global click handler to close pickers when clicking outside
            if (!activityFeedEl.dataset.emojiClickHandler) {
                activityFeedEl.dataset.emojiClickHandler = 'true';
                document.addEventListener('click', (e) => {
                    // Don't close if clicking on an emoji button or inside a picker
                    if (e.target.closest('.activity-comment-emoji-btn') || 
                        e.target.closest('.activity-comment-emoji-picker') ||
                        e.target.closest('.emoji-picker-close')) {
                        return;
                    }
                    // Close all activity comment emoji pickers
                    closeAllActivityCommentEmojiPickers();
                });
            }
    
    // Add edit button handlers
            activityFeedEl.querySelectorAll('.post-edit-btn[data-post-id]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const postId = btn.dataset.postId;
                    if (postId) {
                        handleHomeEditPost(postId);
                    }
                });
    });
    
    // Add delete button handlers
            activityFeedEl.querySelectorAll('.post-delete-btn[data-post-id]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const postId = btn.dataset.postId;
                    if (postId) {
                        showHomeDeleteConfirmationModal(postId);
                    }
                });
    });
    
    // Add share button handlers
            activityFeedEl.querySelectorAll('.share-btn[data-post-id]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!currentUser) {
                        alert('Please log in to share posts');
                        const loginBtn = document.getElementById('headerLoginBtn');
                        if (loginBtn) loginBtn.click();
                        return;
                    }
                    const postId = btn.dataset.postId;
                    if (postId) {
                        handleHomeSharePost(postId);
                    }
                });
    });
    
    // Add report button handlers
            activityFeedEl.querySelectorAll('.report-btn[data-post-id]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const postId = btn.dataset.postId;
                    if (postId) {
                        handleHomeReportPost(postId);
                    }
                });
            });
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
        const hasUpvote = currentUser && activity.upvotes && activity.upvotes[currentUser.uid] === true;
        const hasDownvote = currentUser && activity.downvotes && activity.downvotes[currentUser.uid] === true;
        const voteScore = activity.voteScore || 0;
        const canDelete = currentUser && activity.userId === currentUser.uid;
        const canEdit = currentUser && activity.userId === currentUser.uid && activity.timestamp && (() => {
            const createdTime = activity.timestamp.toMillis ? activity.timestamp.toMillis() : (activity.timestamp.seconds * 1000 || Date.now());
            return (Date.now() - createdTime) < 5 * 60 * 1000;
        })();
        const editedAt = activity.editedAt?.toMillis ? activity.editedAt.toMillis() : (activity.editedAt?.seconds ? activity.editedAt.seconds * 1000 : null);
        const editedIndicator = editedAt ? `<span class="post-edited-indicator">edited ${getTimeAgo({toMillis: () => editedAt})}</span>` : '';
        const canReport = currentUser && activity.userId !== currentUser.uid;
        
        content = `
            <div class="activity-item activity-post activity-post-full" data-user-id="${activity.userId}" data-post-id="${activity.postId}">
                <div class="activity-post-header">
                    <img src="${bannerImage}" alt="${escapeHtml(activity.username)}" class="activity-post-avatar" />
                    <div class="activity-post-author">
                        <div class="activity-post-username">@${escapeHtml(activity.username)}${(activity.username || '').toLowerCase() === 'apelover69' ? '<span class="owner-badge" title="Owner">OWNER</span>' : ''}</div>
                        <div class="activity-post-meta">
                            <span class="activity-post-level">LVL ${userLevel}</span>
                            <span class="activity-time">${timeAgo}</span>
                            ${editedIndicator}
                        </div>
                    </div>
                    <div class="post-header-actions">
                        ${canEdit ? `<button class="post-edit-btn" data-post-id="${activity.postId}" title="Edit post">✏️</button>` : ''}
                        ${canDelete ? `<button class="post-delete-btn" data-post-id="${activity.postId}" title="Delete post">×</button>` : ''}
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
                    <div class="activity-post-vote-section">
                        ${currentUser ? `
                            <button class="activity-post-vote-btn activity-upvote-btn ${hasUpvote ? 'voted' : ''}" data-post-id="${activity.postId}" data-vote-type="upvote" title="Upvote">
                                <span class="activity-post-vote-icon">↑</span>
                            </button>
                            <span class="activity-post-vote-score" data-post-id="${activity.postId}">${voteScore}</span>
                            <button class="activity-post-vote-btn activity-downvote-btn ${hasDownvote ? 'voted' : ''}" data-post-id="${activity.postId}" data-vote-type="downvote" title="Downvote">
                                <span class="activity-post-vote-icon">↓</span>
                            </button>
                        ` : `
                            <div class="activity-post-vote-btn activity-upvote-btn disabled" title="Log in to vote">
                                <span class="activity-post-vote-icon">↑</span>
                            </div>
                            <span class="activity-post-vote-score" data-post-id="${activity.postId}">${voteScore}</span>
                            <div class="activity-post-vote-btn activity-downvote-btn disabled" title="Log in to vote">
                                <span class="activity-post-vote-icon">↓</span>
                            </div>
                        `}
                    </div>
                    ${currentUser ? `<button class="activity-post-comment-btn" data-post-id="${activity.postId}">
                        💬 <span class="activity-post-comment-count">${activity.commentsCount || 0}</span>
                    </button>` : `<div class="activity-post-comment-btn disabled" title="Log in to comment">
                        💬 <span class="activity-post-comment-count">${activity.commentsCount || 0}</span>
                    </div>`}
                    ${currentUser ? `<button class="post-action-btn share-btn" data-post-id="${activity.postId}" title="Share post">
                        <span class="post-action-icon">🔗</span>
                    </button>` : `<div class="post-action-btn share-btn disabled" title="Log in to share">
                        <span class="post-action-icon">🔗</span>
                    </div>`}
                    ${canReport ? `<button class="post-action-btn report-btn" data-post-id="${activity.postId}" title="Report post">
                        <span class="post-action-icon">🚩</span>
                    </button>` : ''}
                </div>
                <div class="activity-post-comments-section hide" id="activityCommentsSection_${activity.postId}">
                    <div class="activity-post-comments-list" id="activityCommentsList_${activity.postId}"></div>
                    ${currentUser ? `
                        <div class="activity-post-comment-input-wrapper">
                            <button type="button" class="activity-comment-emoji-btn" data-post-id="${activity.postId}" title="Add emoji">😀</button>
                            <input type="text" class="activity-post-comment-input" id="activityCommentInput_${activity.postId}" placeholder="Write a comment..." maxlength="500" />
                            <button class="activity-post-comment-submit" data-post-id="${activity.postId}">Post</button>
                        </div>
                        <div class="activity-comment-emoji-picker hide" id="activityCommentEmojiPicker_${activity.postId}">
                            <div class="emoji-picker-header">
                                <span class="emoji-picker-title">Choose an emoji</span>
                                <button type="button" class="emoji-picker-close" data-post-id="${activity.postId}">×</button>
                            </div>
                            <div class="emoji-picker-grid" id="activityCommentEmojiGrid_${activity.postId}">
                                <!-- Emojis will be populated by JavaScript -->
                            </div>
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
                    <span class="trending-username">@${escapeHtml(user.username)}${(user.username || '').toLowerCase() === 'apelover69' ? '<span class="owner-badge" title="Owner">OWNER</span>' : ''}</span>
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
                <a href="/community/?channel=${channel.name.toLowerCase()}" class="channel-item">
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
        const karmaStatEl = document.getElementById('userKarmaStat');
        const followersStatEl = document.getElementById('userFollowersStat');
        const followingStatEl = document.getElementById('userFollowingStat');
        const levelProgressFillEl = document.getElementById('userLevelProgressFill');
        const levelProgressTextEl = document.getElementById('userLevelProgressText');
        
        if (levelStatEl) levelStatEl.textContent = levelProgress.level;
        
        // Update karma
        const karma = userData.karma || 0;
        if (karmaStatEl) karmaStatEl.textContent = karma;
        
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

// Handle vote (upvote/downvote) for activity posts
async function handleActivityVote(postId, voteType) {
    if (!currentUser) {
        alert('Please log in to vote');
        return;
    }
    
    if (voteType !== 'upvote' && voteType !== 'downvote') {
        console.error('Invalid vote type');
        return;
    }
    
    try {
        const postRef = doc(db, 'posts', postId);
        const postDoc = await getDoc(postRef);
        
        if (!postDoc.exists()) {
            console.error('Post not found');
            return;
        }
        
        const postData = postDoc.data();
        const upvotes = postData.upvotes || {};
        const downvotes = postData.downvotes || {};
        const currentVoteScore = postData.voteScore || 0;
        
        // Check current vote state
        const hasUpvote = upvotes[currentUser.uid] === true;
        const hasDownvote = downvotes[currentUser.uid] === true;
        
        // Calculate vote change
        let voteChange = 0;
        const newUpvotes = { ...upvotes };
        const newDownvotes = { ...downvotes };
        
        if (voteType === 'upvote') {
            if (hasUpvote) {
                // Remove upvote
                delete newUpvotes[currentUser.uid];
                voteChange = -1;
            } else {
                // Add upvote, remove downvote if exists
                newUpvotes[currentUser.uid] = true;
                if (hasDownvote) {
                    delete newDownvotes[currentUser.uid];
                    voteChange = 2; // +1 for upvote, +1 for removing downvote
                } else {
                    voteChange = 1;
                }
            }
        } else { // downvote
            if (hasDownvote) {
                // Remove downvote
                delete newDownvotes[currentUser.uid];
                voteChange = 1;
            } else {
                // Add downvote, remove upvote if exists
                newDownvotes[currentUser.uid] = true;
                if (hasUpvote) {
                    delete newUpvotes[currentUser.uid];
                    voteChange = -2; // -1 for downvote, -1 for removing upvote
                } else {
                    voteChange = -1;
                }
            }
        }
        
        const newVoteScore = currentVoteScore + voteChange;
        
        // Update post
        await updateDoc(postRef, {
            upvotes: newUpvotes,
            downvotes: newDownvotes,
            voteScore: newVoteScore,
            updatedAt: serverTimestamp()
        });
        
        // Update karma for post author (if not voting on own post)
        if (postData.userId !== currentUser.uid) {
            try {
                const authorRef = doc(db, 'users', postData.userId);
                const authorDoc = await getDoc(authorRef);
                
                if (authorDoc.exists()) {
                    const authorData = authorDoc.data();
                    const currentKarma = authorData.karma || 0;
                    const newKarma = currentKarma + voteChange;
                    
                    await updateDoc(authorRef, {
                        karma: newKarma
                    });
                }
            } catch (karmaError) {
                console.error('Error updating karma:', karmaError);
                // Don't fail the vote if karma update fails
            }
        }
        
        // Update UI immediately
        const voteScoreEl = document.querySelector(`.activity-post-vote-score[data-post-id="${postId}"]`);
        if (voteScoreEl) {
            voteScoreEl.textContent = newVoteScore;
        }
        
        // Update button states
        const upvoteBtn = document.querySelector(`.activity-upvote-btn[data-post-id="${postId}"]`);
        const downvoteBtn = document.querySelector(`.activity-downvote-btn[data-post-id="${postId}"]`);
        if (upvoteBtn) {
            if (newUpvotes[currentUser.uid]) {
                upvoteBtn.classList.add('voted');
            } else {
                upvoteBtn.classList.remove('voted');
            }
        }
        if (downvoteBtn) {
            if (newDownvotes[currentUser.uid]) {
                downvoteBtn.classList.add('voted');
            } else {
                downvoteBtn.classList.remove('voted');
            }
        }
        
    } catch (error) {
        console.error('Error voting:', error);
        alert('Failed to vote. Please try again.');
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Common emojis for comment picker
const commonEmojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
    '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
    '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
    '🤧', '🥵', '🥶', '😶‍🌫️', '😵', '😵‍💫', '🤯', '🤠', '🥳', '😎',
    '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳',
    '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
    '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
    '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽',
    '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
    '😾', '🙈', '🙉', '🙊', '💋', '💌', '💘', '💝', '💖', '💗',
    '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚',
    '💙', '💜', '🖤', '🤍', '🤎', '💯', '🔥', '⭐', '🌟', '✨',
    '💫', '💥', '💢', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️',
    '🗯️', '💭', '💤', '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌',
    '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕',
    '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌',
    '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶',
    '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄'
];

// Insert emoji into any input field
function insertEmojiIntoInput(inputEl, emoji) {
    if (!inputEl) return;
    
    const cursorPos = inputEl.selectionStart || inputEl.value.length;
    const textBefore = inputEl.value.substring(0, cursorPos);
    const textAfter = inputEl.value.substring(inputEl.selectionEnd || cursorPos);
    const newText = textBefore + emoji + textAfter;
    
    // Check if adding emoji would exceed max length
    const maxLength = inputEl.getAttribute('maxlength') ? parseInt(inputEl.getAttribute('maxlength')) : Infinity;
    if (newText.length > maxLength) {
        alert('Comment is too long! Maximum ' + maxLength + ' characters.');
        return;
    }
    
    inputEl.value = newText;
    
    // Set cursor position after inserted emoji
    const newCursorPos = cursorPos + emoji.length;
    inputEl.setSelectionRange(newCursorPos, newCursorPos);
    
    // Focus back on input
    inputEl.focus();
}

// Close all activity comment emoji pickers
function closeAllActivityCommentEmojiPickers() {
    document.querySelectorAll('.activity-comment-emoji-picker').forEach(picker => {
        picker.classList.add('hide');
    });
}

// Setup emoji picker for activity comment inputs
function setupActivityCommentEmojiPicker(postId) {
    const emojiBtn = document.querySelector(`.activity-comment-emoji-btn[data-post-id="${postId}"]`);
    const emojiPicker = document.getElementById(`activityCommentEmojiPicker_${postId}`);
    const emojiGrid = document.getElementById(`activityCommentEmojiGrid_${postId}`);
    const closeBtn = emojiPicker?.querySelector('.emoji-picker-close[data-post-id="' + postId + '"]');
    const commentInput = document.getElementById(`activityCommentInput_${postId}`);
    
    if (!emojiBtn || !emojiPicker || !emojiGrid || !commentInput) return;
    
    // Prevent duplicate event listeners
    if (emojiBtn.dataset.emojiSetup === 'true') return;
    emojiBtn.dataset.emojiSetup = 'true';
    
    // Populate emoji grid if not already populated
    if (emojiGrid.children.length === 0) {
        commonEmojis.forEach(emoji => {
            const emojiBtnEl = document.createElement('button');
            emojiBtnEl.type = 'button';
            emojiBtnEl.className = 'emoji-item';
            emojiBtnEl.textContent = emoji;
            emojiBtnEl.title = emoji;
            emojiBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                insertEmojiIntoInput(commentInput, emoji);
                emojiPicker.classList.add('hide');
            });
            emojiGrid.appendChild(emojiBtnEl);
        });
    }
    
    // Toggle emoji picker
    const togglePicker = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isHidden = emojiPicker.classList.contains('hide');
        
        // Close all other pickers first
        closeAllActivityCommentEmojiPickers();
        
        if (isHidden) {
            emojiPicker.classList.remove('hide');
            // Position picker relative to button
            const btnRect = emojiBtn.getBoundingClientRect();
            const wrapper = emojiBtn.closest('.activity-post-comment-input-wrapper');
            if (wrapper) {
                emojiPicker.style.position = 'absolute';
                emojiPicker.style.bottom = 'calc(100% + 10px)';
                emojiPicker.style.left = '0';
                emojiPicker.style.zIndex = '1000';
            }
        }
    };
    
    emojiBtn.addEventListener('click', togglePicker);
    
    // Close button
    if (closeBtn) {
        const closeHandler = (e) => {
            e.stopPropagation();
            emojiPicker.classList.add('hide');
        };
        closeBtn.addEventListener('click', closeHandler);
    }
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
        
        // Setup emoji picker for comment input
        setupActivityCommentEmojiPicker(postId);
        
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
                    <span class="comment-author">${escapeHtml(comment.username)}${(comment.username || '').toLowerCase() === 'apelover69' ? '<span class="owner-badge" title="Owner">OWNER</span>' : ''}</span>
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

// Toast utility function
function showHomeToast(message) {
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    const height = toast.offsetHeight;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}

// Handle edit post (home page)
async function handleHomeEditPost(postId) {
    if (!currentUser) return;
    
    try {
        const postRef = doc(db, 'posts', postId);
        const postDoc = await getDoc(postRef);
        
        if (!postDoc.exists()) {
            showHomeToast('Post not found');
            return;
        }
        
        const post = { id: postDoc.id, ...postDoc.data() };
        
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'editPostModal';
        
        const createdTime = post.createdAt?.toMillis ? post.createdAt.toMillis() : (post.createdAt?.seconds * 1000 || Date.now());
        const timeRemaining = Math.max(0, 5 * 60 * 1000 - (Date.now() - createdTime));
        const minutesRemaining = Math.floor(timeRemaining / 60000);
        const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);
        
        modalOverlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Post</h3>
                    <button class="modal-close" type="button">×</button>
                </div>
                <div class="modal-body">
                    <div class="edit-time-remaining">
                        Time remaining to edit: ${minutesRemaining}m ${secondsRemaining}s
                    </div>
                    <textarea id="editPostContent" class="post-content-input edit-post-textarea" maxlength="2000" rows="5">${escapeHtml(post.content || '')}</textarea>
                    <div id="editPostMediaPreview" class="edit-post-media-preview">
                        ${post.images && post.images.length > 0 ? `
                            <div class="post-images edit-post-images">
                                ${post.images.map(img => `<img src="${escapeHtml(img)}" alt="Post image" class="post-image edit-post-image" />`).join('')}
                            </div>
                        ` : ''}
                        ${post.videos && post.videos.length > 0 ? `
                            <div class="post-videos edit-post-videos">
                                ${post.videos.map(vid => `<video src="${escapeHtml(vid)}" class="post-video edit-post-video" controls></video>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" type="button" id="cancelEditBtn">Cancel</button>
                        <button class="btn btn-primary" type="button" id="saveEditBtn">Save</button>
                    </div>
                </div>
            </div>
        `;
        
        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        
        document.body.appendChild(modalOverlay);
        modalOverlay.offsetHeight;
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalOverlay.classList.add('show');
            });
        });
        
        const editContentEl = document.getElementById('editPostContent');
        if (editContentEl) {
            editContentEl.focus();
            editContentEl.setSelectionRange(editContentEl.value.length, editContentEl.value.length);
        }
        
        const closeModal = () => {
            modalOverlay.classList.remove('show');
            setTimeout(() => {
                modalOverlay.remove();
                const scrollY = document.body.style.top;
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.width = '';
                document.body.style.overflow = '';
                if (scrollY) {
                    window.scrollTo(0, parseInt(scrollY || '0') * -1);
                }
            }, 300);
        };
        
        modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
        document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
        document.getElementById('saveEditBtn').addEventListener('click', () => handleHomeSaveEdit(postId, editContentEl.value, closeModal));
        
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
        
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    } catch (error) {
        console.error('Error loading post for edit:', error);
        showHomeToast('Failed to load post. Please try again.');
    }
}

// Handle save edit (home page)
async function handleHomeSaveEdit(postId, newContent, closeModal) {
    if (!currentUser) return;
    
    const content = newContent.trim();
    
    if (!content) {
        showHomeToast('Post content cannot be empty');
        return;
    }
    
    if (content.length > 2000) {
        showHomeToast('Post content must be 2000 characters or less');
        return;
    }
    
    try {
        const postRef = doc(db, 'posts', postId);
        const postDoc = await getDoc(postRef);
        if (!postDoc.exists()) {
            showHomeToast('Post not found');
            return;
        }
        
        const postData = postDoc.data();
        const createdTime = postData.createdAt?.toMillis ? postData.createdAt.toMillis() : (postData.createdAt?.seconds * 1000 || Date.now());
        if ((Date.now() - createdTime) >= 5 * 60 * 1000) {
            showHomeToast('Edit window has expired');
            closeModal();
            return;
        }
        
        await updateDoc(postRef, {
            content: content,
            editedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        
        showHomeToast('Post updated successfully');
        closeModal();
        // Reload activity feed
        loadActivityFeed(currentFeedType);
    } catch (error) {
        console.error('Error saving edit:', error);
        showHomeToast('Failed to save edit. Please try again.');
    }
}

// Show delete confirmation modal (home page)
function showHomeDeleteConfirmationModal(postId) {
    if (!currentUser) return;
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.id = 'deletePostModal';
    
    modalOverlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Delete Post</h3>
                <button class="modal-close" type="button">×</button>
            </div>
            <div class="modal-body">
                <p class="delete-confirmation-text">
                    Are you sure you want to delete this post? This cannot be undone.
                </p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" type="button" id="cancelDeleteBtn">Cancel</button>
                    <button class="btn btn-danger" type="button" id="confirmDeleteBtn">Delete</button>
                </div>
            </div>
        </div>
    `;
    
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    
    document.body.appendChild(modalOverlay);
    modalOverlay.offsetHeight;
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modalOverlay.classList.add('show');
        });
    });
    
    const closeModal = () => {
        modalOverlay.classList.remove('show');
        setTimeout(() => {
            modalOverlay.remove();
            const scrollY = document.body.style.top;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
            }
        }, 300);
    };
    
    modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => handleHomeConfirmDelete(postId, closeModal));
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Handle confirm delete (home page)
async function handleHomeConfirmDelete(postId, closeModal) {
    if (!currentUser) return;
    
    try {
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            deleted: true,
            updatedAt: serverTimestamp()
        });
        closeModal();
        showHomeToast('Post deleted');
        // Reload activity feed
        loadActivityFeed(currentFeedType);
    } catch (error) {
        console.error('Error deleting post:', error);
        showHomeToast('Failed to delete post. Please try again.');
    }
}

// Handle share post (home page)
async function handleHomeSharePost(postId) {
    if (!currentUser) {
        alert('Please log in to share posts');
        return;
    }
    
    try {
        const shareUrl = window.location.origin + withBase(`/feed/?post=${postId}`);
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showHomeToast('Link copied to clipboard!');
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showHomeToast('Link copied to clipboard!');
            } catch (err) {
                showHomeToast(`Share URL: ${shareUrl}`);
            }
            document.body.removeChild(textArea);
        }
    } catch (error) {
        console.error('Error sharing post:', error);
        showHomeToast('Failed to copy link. Please try again.');
    }
}

// Handle report post (home page)
async function handleHomeReportPost(postId) {
    if (!currentUser) return;
    
    try {
        const postRef = doc(db, 'posts', postId);
        const postDoc = await getDoc(postRef);
        
        if (!postDoc.exists()) {
            showHomeToast('Post not found');
            return;
        }
        
        const post = { id: postDoc.id, ...postDoc.data() };
        
        // Check if already reported
        const alreadyReported = await checkHomeIfAlreadyReported(postId, currentUser.uid);
        if (alreadyReported) {
            showHomeToast('You have already reported this post');
            return;
        }
        
        showHomeReportModal(postId, post);
    } catch (error) {
        console.warn('Could not check if already reported, proceeding:', error);
        try {
            const postRef = doc(db, 'posts', postId);
            const postDoc = await getDoc(postRef);
            if (postDoc.exists()) {
                const post = { id: postDoc.id, ...postDoc.data() };
                showHomeReportModal(postId, post);
            }
        } catch (err) {
            console.error('Error loading post for report:', err);
            showHomeToast('Failed to load post. Please try again.');
        }
    }
}

// Check if already reported (home page)
async function checkHomeIfAlreadyReported(postId, userId) {
    try {
        const reportId = `${postId}_${userId}`;
        const reportRef = doc(db, 'reports', reportId);
        const reportDoc = await getDoc(reportRef);
        return reportDoc.exists();
    } catch (error) {
        console.warn('Error checking report, proceeding as if not reported:', error);
        return false;
    }
}

// Show report modal (home page)
function showHomeReportModal(postId, post) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.id = 'reportPostModal';
    
    modalOverlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Report Post</h3>
                <button class="modal-close" type="button">×</button>
            </div>
            <div class="modal-body">
                <p class="report-prompt-text">
                    Why are you reporting this post?
                </p>
                <div class="report-reasons-list">
                    <label class="report-reason-label">
                        <input type="radio" name="reportReason" value="spam" />
                        <span>Spam</span>
                    </label>
                    <label class="report-reason-label">
                        <input type="radio" name="reportReason" value="harassment" />
                        <span>Harassment/Bullying</span>
                    </label>
                    <label class="report-reason-label">
                        <input type="radio" name="reportReason" value="inappropriate" />
                        <span>Inappropriate Content</span>
                    </label>
                    <label class="report-reason-label">
                        <input type="radio" name="reportReason" value="misinformation" />
                        <span>Misinformation/Fake News</span>
                    </label>
                    <label class="report-reason-label">
                        <input type="radio" name="reportReason" value="other" />
                        <span>Other</span>
                    </label>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" type="button" id="cancelReportBtn">Cancel</button>
                    <button class="btn btn-danger" type="button" id="submitReportBtn">Submit</button>
                </div>
            </div>
        </div>
    `;
    
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    
    document.body.appendChild(modalOverlay);
    modalOverlay.offsetHeight;
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modalOverlay.classList.add('show');
        });
    });
    
    const closeModal = () => {
        modalOverlay.classList.remove('show');
        setTimeout(() => {
            modalOverlay.remove();
            const scrollY = document.body.style.top;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
            }
        }, 300);
    };
    
    modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('cancelReportBtn').addEventListener('click', closeModal);
    document.getElementById('submitReportBtn').addEventListener('click', () => {
        const selectedReason = modalOverlay.querySelector('input[name="reportReason"]:checked');
        if (!selectedReason) {
            showHomeToast('Please select a reason');
            return;
        }
        handleHomeSubmitReport(postId, post.userId, selectedReason.value, closeModal);
    });
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Handle submit report (home page)
async function handleHomeSubmitReport(postId, reportedUserId, reason, closeModal) {
    if (!currentUser) return;
    
    try {
        const reportId = `${postId}_${currentUser.uid}`;
        const reportRef = doc(db, 'reports', reportId);
        
        await setDoc(reportRef, {
            postId: postId,
            reportedBy: currentUser.uid,
            reportedUser: reportedUserId,
            reason: reason,
            createdAt: serverTimestamp(),
            reviewed: false
        });
        
        showHomeToast('Report submitted successfully');
        closeModal();
    } catch (error) {
        console.error('Error submitting report:', error);
        if (error.code === 'permission-denied') {
            showHomeToast('You have already reported this post');
        } else {
            showHomeToast('Failed to submit report. Please try again.');
        }
    }
}
