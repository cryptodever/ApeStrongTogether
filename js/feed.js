/**
 * Feed Page Functionality
 * Handles post creation, display, likes, and comments
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    addDoc,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    increment
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// State
let currentUser = null;
let userProfile = null;
let postsListener = null;

// DOM Elements
let postsFeedEl, postCreateSectionEl, postCreateFormEl;
let postContentEl, postImageUrlEl, postLinkUrlEl, postLinkTitleEl;
let postCharCountEl, postSubmitBtnEl;
let removeImageBtnEl, removeLinkBtnEl;

// Initialize feed page
export function initFeed() {
    // Get DOM elements
    postsFeedEl = document.getElementById('postsFeed');
    postCreateSectionEl = document.getElementById('postCreateSection');
    postCreateFormEl = document.getElementById('postCreateForm');
    postContentEl = document.getElementById('postContent');
    postImageUrlEl = document.getElementById('postImageUrl');
    postLinkUrlEl = document.getElementById('postLinkUrl');
    postLinkTitleEl = document.getElementById('postLinkTitle');
    postCharCountEl = document.getElementById('postCharCount');
    postSubmitBtnEl = document.getElementById('postSubmitBtn');
    removeImageBtnEl = document.getElementById('removeImageBtn');
    removeLinkBtnEl = document.getElementById('removeLinkBtn');

    // Set up auth state listener
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        
        if (user) {
            // Load user profile
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    userProfile = userDoc.data();
                }
            } catch (error) {
                console.error('Error loading user profile:', error);
            }
            
            // Show post creation form
            if (postCreateSectionEl) {
                postCreateSectionEl.classList.remove('hide');
            }
            
            // Load posts
            loadPosts();
        } else {
            // Hide post creation form
            if (postCreateSectionEl) {
                postCreateSectionEl.classList.add('hide');
            }
            
            // Still load posts (public view)
            loadPosts();
        }
    });

    // Set up event listeners
    setupEventListeners();
}

// Set up event listeners
function setupEventListeners() {
    // Post creation form
    if (postCreateFormEl) {
        postCreateFormEl.addEventListener('submit', handlePostSubmit);
    }
    
    // Character count
    if (postContentEl) {
        postContentEl.addEventListener('input', updateCharCount);
    }
    
    // Remove image button
    if (removeImageBtnEl) {
        removeImageBtnEl.addEventListener('click', () => {
            if (postImageUrlEl) postImageUrlEl.value = '';
            removeImageBtnEl.classList.add('hide');
        });
    }
    
    // Remove link button
    if (removeLinkBtnEl) {
        removeLinkBtnEl.addEventListener('click', () => {
            if (postLinkUrlEl) postLinkUrlEl.value = '';
            if (postLinkTitleEl) postLinkTitleEl.value = '';
            removeLinkBtnEl.classList.add('hide');
        });
    }
    
    // Show/hide remove buttons
    if (postImageUrlEl) {
        postImageUrlEl.addEventListener('input', () => {
            if (removeImageBtnEl) {
                if (postImageUrlEl.value) {
                    removeImageBtnEl.classList.remove('hide');
                } else {
                    removeImageBtnEl.classList.add('hide');
                }
            }
        });
    }
    
    if (postLinkUrlEl) {
        postLinkUrlEl.addEventListener('input', () => {
            if (removeLinkBtnEl) {
                if (postLinkUrlEl.value) {
                    removeLinkBtnEl.classList.remove('hide');
                } else {
                    removeLinkBtnEl.classList.add('hide');
                }
            }
        });
    }
}

// Update character count
function updateCharCount() {
    if (postCharCountEl && postContentEl) {
        postCharCountEl.textContent = postContentEl.value.length;
    }
}

// Handle post submission
async function handlePostSubmit(e) {
    e.preventDefault();
    
    if (!currentUser || !userProfile) {
        alert('Please log in to create a post');
        return;
    }
    
    const content = postContentEl?.value.trim() || '';
    const imageUrl = postImageUrlEl?.value.trim() || '';
    const linkUrl = postLinkUrlEl?.value.trim() || '';
    const linkTitle = postLinkTitleEl?.value.trim() || '';
    
    if (!content && !imageUrl && !linkUrl) {
        alert('Please add some content, an image, or a link to your post');
        return;
    }
    
    if (content.length > 2000) {
        alert('Post content must be 2000 characters or less');
        return;
    }
    
    // Disable submit button
    if (postSubmitBtnEl) {
        postSubmitBtnEl.disabled = true;
        postSubmitBtnEl.textContent = 'Posting...';
    }
    
    try {
        // Prepare post data
        const postData = {
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
            content: content,
            images: imageUrl ? [imageUrl] : [],
            links: linkUrl ? [{ url: linkUrl, title: linkTitle || linkUrl }] : [],
            likes: {},
            likesCount: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            deleted: false
        };
        
        // Add post to Firestore
        await addDoc(collection(db, 'posts'), postData);
        
        // Reset form
        if (postContentEl) postContentEl.value = '';
        if (postImageUrlEl) postImageUrlEl.value = '';
        if (postLinkUrlEl) postLinkUrlEl.value = '';
        if (postLinkTitleEl) postLinkTitleEl.value = '';
        if (removeImageBtnEl) removeImageBtnEl.classList.add('hide');
        if (removeLinkBtnEl) removeLinkBtnEl.classList.add('hide');
        updateCharCount();
        
    } catch (error) {
        console.error('Error creating post:', error);
        alert('Failed to create post. Please try again.');
    } finally {
        // Re-enable submit button
        if (postSubmitBtnEl) {
            postSubmitBtnEl.disabled = false;
            postSubmitBtnEl.textContent = 'Post';
        }
    }
}

// Load posts
function loadPosts() {
    if (!postsFeedEl) return;
    
    // Clear existing listener
    if (postsListener) {
        postsListener();
        postsListener = null;
    }
    
    // Set loading state
    postsFeedEl.innerHTML = '<div class="posts-loading">Loading posts...</div>';
    
    try {
        // Query posts (non-deleted, ordered by createdAt desc)
        const postsQuery = query(
            collection(db, 'posts'),
            where('deleted', '==', false),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        
        // Set up real-time listener
        postsListener = onSnapshot(
            postsQuery,
            (snapshot) => {
                renderPosts(snapshot.docs);
            },
            (error) => {
                console.error('Error loading posts:', error);
                postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts. Please refresh the page.</div>';
            }
        );
    } catch (error) {
        console.error('Error setting up posts listener:', error);
        postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts. Please refresh the page.</div>';
    }
}

// Render posts
async function renderPosts(postDocs) {
    if (!postsFeedEl) return;
    
    if (postDocs.length === 0) {
        postsFeedEl.innerHTML = '<div class="posts-empty">No posts yet. Be the first to post!</div>';
        return;
    }
    
    // Get user data for all posts
    const posts = await Promise.all(postDocs.map(async (postDoc) => {
        const postData = postDoc.data();
        try {
            const userDoc = await getDoc(doc(db, 'users', postData.userId));
            const userData = userDoc.exists() ? userDoc.data() : null;
            return {
                id: postDoc.id,
                ...postData,
                userData: userData
            };
        } catch (error) {
            console.error(`Error loading user data for post ${postDoc.id}:`, error);
            return {
                id: postDoc.id,
                ...postData,
                userData: null
            };
        }
    }));
    
    // Render posts
    postsFeedEl.innerHTML = posts.map(post => renderPost(post)).join('');
    
    // Set up event listeners for each post
    posts.forEach(post => {
        setupPostEventListeners(post.id, post);
        setupPostImageErrors(post.id);
    });
}

// Set up image error handlers for a post
function setupPostImageErrors(postId) {
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (!postCard) return;
    
    const images = postCard.querySelectorAll('.post-image');
    images.forEach(img => {
        img.addEventListener('error', () => {
            img.classList.add('post-image-error');
        });
    });
}

// Render single post
function renderPost(post) {
    const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt?.seconds * 1000 || Date.now());
    const timeAgo = getTimeAgo(createdAt);
    const userLevel = post.userData?.level || 1;
    const bannerImage = post.userData?.bannerImage || '/pfp_apes/bg1.png';
    const isLiked = currentUser && post.likes && post.likes[currentUser.uid] === true;
    const canDelete = currentUser && post.userId === currentUser.uid;
    
    return `
        <div class="post-card" data-post-id="${post.id}">
            <div class="post-header">
                <img src="${bannerImage}" alt="${post.username}" class="post-author-avatar" />
                <div class="post-author-info">
                    <div class="post-author-name">${escapeHtml(post.username)}</div>
                    <div class="post-author-meta">
                        <span class="post-author-level">LVL ${userLevel}</span>
                        <span class="post-time">${timeAgo}</span>
                    </div>
                </div>
                ${canDelete ? `<button class="post-delete-btn" data-post-id="${post.id}" title="Delete post">×</button>` : ''}
            </div>
            
            <div class="post-content">
                ${post.content ? `<p class="post-text">${escapeHtml(post.content).replace(/\n/g, '<br>')}</p>` : ''}
                
                ${post.images && post.images.length > 0 ? `
                    <div class="post-images">
                        ${post.images.map(img => `
                            <img src="${escapeHtml(img)}" alt="Post image" class="post-image" data-image-src="${escapeHtml(img)}" />
                        `).join('')}
                    </div>
                ` : ''}
                
                ${post.links && post.links.length > 0 ? `
                    <div class="post-links">
                        ${post.links.map(link => `
                            <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="post-link">
                                <span class="post-link-icon">🔗</span>
                                <span class="post-link-text">${escapeHtml(link.title || link.url)}</span>
                            </a>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            
            <div class="post-actions">
                <button class="post-action-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" data-liked="${isLiked}">
                    <span class="post-action-icon">${isLiked ? '❤️' : '🤍'}</span>
                    <span class="post-action-count" data-post-id="${post.id}" data-type="likes">${post.likesCount || 0}</span>
                </button>
                <button class="post-action-btn comment-btn" data-post-id="${post.id}">
                    <span class="post-action-icon">💬</span>
                    <span class="post-action-count">${post.commentsCount || 0}</span>
                </button>
            </div>
            
            <div class="post-comments-section hide" id="commentsSection_${post.id}">
                <div class="post-comments-list" id="commentsList_${post.id}"></div>
                ${currentUser ? `
                    <div class="post-comment-input-wrapper">
                        <input type="text" class="post-comment-input" id="commentInput_${post.id}" placeholder="Write a comment..." maxlength="500" />
                        <button class="post-comment-submit" data-post-id="${post.id}">Post</button>
                    </div>
                ` : '<div class="post-comment-login">Please log in to comment</div>'}
            </div>
        </div>
    `;
}

// Set up event listeners for a post
function setupPostEventListeners(postId, post) {
    // Like button
    const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
    if (likeBtn) {
        likeBtn.addEventListener('click', () => handleLike(postId));
    }
    
    // Comment button
    const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
    const commentsSection = document.getElementById(`commentsSection_${postId}`);
    if (commentBtn && commentsSection) {
        commentBtn.addEventListener('click', () => {
            const isVisible = !commentsSection.classList.contains('hide');
            if (isVisible) {
                commentsSection.classList.add('hide');
            } else {
                commentsSection.classList.remove('hide');
                loadComments(postId);
            }
        });
    }
    
    // Comment submit
    const commentSubmit = document.querySelector(`.post-comment-submit[data-post-id="${postId}"]`);
    const commentInput = document.getElementById(`commentInput_${postId}`);
    if (commentSubmit && commentInput) {
        commentSubmit.addEventListener('click', () => handleAddComment(postId, commentInput));
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAddComment(postId, commentInput);
            }
        });
    }
    
    // Delete button
    const deleteBtn = document.querySelector(`.post-delete-btn[data-post-id="${postId}"]`);
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeletePost(postId));
    }
}

// Handle like toggle
async function handleLike(postId) {
    if (!currentUser) {
        alert('Please log in to like posts');
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
        const likes = postData.likes || {};
        const isLiked = likes[currentUser.uid] === true;
        
        // Update likes map
        const newLikes = { ...likes };
        if (isLiked) {
            delete newLikes[currentUser.uid];
        } else {
            newLikes[currentUser.uid] = true;
        }
        
        // Update post
        await updateDoc(postRef, {
            likes: newLikes,
            likesCount: isLiked ? increment(-1) : increment(1),
            updatedAt: serverTimestamp()
        });
        
    } catch (error) {
        console.error('Error toggling like:', error);
        alert('Failed to like post. Please try again.');
    }
}

// Load comments for a post
async function loadComments(postId) {
    const commentsListEl = document.getElementById(`commentsList_${postId}`);
    if (!commentsListEl) return;
    
    try {
        const commentsQuery = query(
            collection(db, 'posts', postId, 'comments'),
            where('deleted', '==', false),
            orderBy('createdAt', 'asc')
        );
        
        const commentsSnapshot = await getDocs(commentsQuery);
        
        if (commentsSnapshot.empty) {
            commentsListEl.innerHTML = '<div class="post-comments-empty">No comments yet</div>';
            return;
        }
        
        // Get user data for comments
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
        
        commentsListEl.innerHTML = comments.map(comment => renderComment(comment, postId)).join('');
        
        // Set up delete listeners for comments
        comments.forEach(comment => {
            if (currentUser && comment.userId === currentUser.uid) {
                const deleteBtn = document.querySelector(`.comment-delete-btn[data-comment-id="${comment.id}"]`);
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => handleDeleteComment(postId, comment.id));
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsListEl.innerHTML = '<div class="post-comments-error">Error loading comments</div>';
    }
}

// Render comment
function renderComment(comment, postId) {
    const createdAt = comment.createdAt?.toDate ? comment.createdAt.toDate() : new Date(comment.createdAt?.seconds * 1000 || Date.now());
    const timeAgo = getTimeAgo(createdAt);
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

// Handle add comment
async function handleAddComment(postId, commentInputEl) {
    if (!currentUser || !userProfile) {
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
        // Add comment
        await addDoc(collection(db, 'posts', postId, 'comments'), {
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
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
        loadComments(postId);
        
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Failed to add comment. Please try again.');
    }
}

// Handle delete post
async function handleDeletePost(postId) {
    if (!currentUser) return;
    
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
        return;
    }
    
    try {
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            deleted: true,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error deleting post:', error);
        alert('Failed to delete post. Please try again.');
    }
}

// Handle delete comment
async function handleDeleteComment(postId, commentId) {
    if (!currentUser) return;
    
    try {
        const commentRef = doc(db, 'posts', postId, 'comments', commentId);
        await updateDoc(commentRef, {
            deleted: true
        });
        
        // Update post comments count
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentsCount: increment(-1),
            updatedAt: serverTimestamp()
        });
        
        // Reload comments
        loadComments(postId);
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        alert('Failed to delete comment. Please try again.');
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
}
