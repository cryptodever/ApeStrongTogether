/**
 * Feed Page Functionality
 * Handles post creation, display, likes, and comments
 */

import { auth, db, storage } from './firebase.js';
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
    setDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    increment
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { withBase } from './base-url.js';
import {
    ref,
    uploadBytes,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';

// State
let currentUser = null;
let userProfile = null;
let postsListener = null;

// DOM Elements
let postsFeedEl, postCreateSectionEl, postCreateFormEl;
let postContentEl, postImageFileEl, postVideoFileEl;
let postCharCountEl, postSubmitBtnEl;
let removeImageBtnEl, imagePreviewContainerEl, imagePreviewEl;
let removeVideoBtnEl, videoPreviewContainerEl, videoPreviewEl;
let emojiBtnEl, emojiPickerEl, emojiPickerGridEl, emojiPickerCloseEl;
let selectedImageFile = null;
let selectedVideoFile = null;
let videoPreviewUrl = null;

// Initialize feed page
export function initFeed() {
    // Get DOM elements
    postsFeedEl = document.getElementById('postsFeed');
    postCreateSectionEl = document.getElementById('postCreateSection');
    postCreateFormEl = document.getElementById('postCreateForm');
    postContentEl = document.getElementById('postContent');
    postImageFileEl = document.getElementById('postImageFile');
    postVideoFileEl = document.getElementById('postVideoFile');
    postCharCountEl = document.getElementById('postCharCount');
    postSubmitBtnEl = document.getElementById('postSubmitBtn');
    removeImageBtnEl = document.getElementById('removeImageBtn');
    imagePreviewContainerEl = document.getElementById('imagePreviewContainer');
    imagePreviewEl = document.getElementById('imagePreview');
    removeVideoBtnEl = document.getElementById('removeVideoBtn');
    videoPreviewContainerEl = document.getElementById('videoPreviewContainer');
    videoPreviewEl = document.getElementById('videoPreview');
    emojiBtnEl = document.getElementById('emojiBtn');
    emojiPickerEl = document.getElementById('emojiPicker');
    emojiPickerGridEl = document.getElementById('emojiPickerGrid');
    emojiPickerCloseEl = document.getElementById('emojiPickerClose');

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
    
    // Initialize emoji picker
    initEmojiPicker();
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
    
    // Image file input
    if (postImageFileEl) {
        postImageFileEl.addEventListener('change', handleImageFileSelect);
    }
    
    // Video file input
    if (postVideoFileEl) {
        postVideoFileEl.addEventListener('change', handleVideoFileSelect);
    }
    
    // Remove image button
    if (removeImageBtnEl) {
        removeImageBtnEl.addEventListener('click', () => {
            selectedImageFile = null;
            if (postImageFileEl) postImageFileEl.value = '';
            if (imagePreviewContainerEl) imagePreviewContainerEl.classList.add('hide');
        });
    }
    
    // Remove video button
    if (removeVideoBtnEl) {
        removeVideoBtnEl.addEventListener('click', () => {
            selectedVideoFile = null;
            if (videoPreviewUrl) {
                URL.revokeObjectURL(videoPreviewUrl);
                videoPreviewUrl = null;
            }
            if (postVideoFileEl) postVideoFileEl.value = '';
            if (videoPreviewContainerEl) videoPreviewContainerEl.classList.add('hide');
            if (videoPreviewEl) {
                videoPreviewEl.src = '';
                videoPreviewEl.load();
            }
        });
    }
    
    // Emoji button
    if (emojiBtnEl) {
        emojiBtnEl.addEventListener('click', toggleEmojiPicker);
    }
    
    // Emoji picker close button
    if (emojiPickerCloseEl) {
        emojiPickerCloseEl.addEventListener('click', closeEmojiPicker);
    }
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (emojiPickerEl && !emojiPickerEl.contains(e.target) && e.target !== emojiBtnEl) {
            closeEmojiPicker();
        }
    });
}

// Update character count
function updateCharCount() {
    if (postCharCountEl && postContentEl) {
        postCharCountEl.textContent = postContentEl.value.length;
    }
}

// Handle image file selection
function handleImageFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Clear video if image is selected
    if (selectedVideoFile) {
        selectedVideoFile = null;
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
            videoPreviewUrl = null;
        }
        if (postVideoFileEl) postVideoFileEl.value = '';
        if (videoPreviewContainerEl) videoPreviewContainerEl.classList.add('hide');
        if (videoPreviewEl) {
            videoPreviewEl.src = '';
            videoPreviewEl.load();
        }
    }
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
        alert('Please select a PNG or JPEG image file');
        e.target.value = '';
        return;
    }
    
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        alert('Image file must be 5MB or smaller');
        e.target.value = '';
        return;
    }
    
    selectedImageFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
        if (imagePreviewEl) {
            imagePreviewEl.src = event.target.result;
        }
        if (imagePreviewContainerEl) {
            imagePreviewContainerEl.classList.remove('hide');
        }
    };
    reader.readAsDataURL(file);
}

// Handle video file selection
function handleVideoFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Clear image if video is selected
    if (selectedImageFile) {
        selectedImageFile = null;
        if (postImageFileEl) postImageFileEl.value = '';
        if (imagePreviewContainerEl) imagePreviewContainerEl.classList.add('hide');
    }
    
    // Revoke previous video URL if exists
    if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        videoPreviewUrl = null;
    }
    
    // Validate file type
    if (file.type !== 'video/mp4') {
        alert('Please select an MP4 video file');
        e.target.value = '';
        return;
    }
    
    // Validate file size (1MB max)
    const maxSize = 1 * 1024 * 1024; // 1MB
    if (file.size > maxSize) {
        alert('Video file must be 1MB or smaller');
        e.target.value = '';
        return;
    }
    
    selectedVideoFile = file;
    
    // Show preview
    videoPreviewUrl = URL.createObjectURL(file);
    if (videoPreviewEl) {
        videoPreviewEl.src = videoPreviewUrl;
    }
    if (videoPreviewContainerEl) {
        videoPreviewContainerEl.classList.remove('hide');
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
    
    if (!content && !selectedImageFile && !selectedVideoFile) {
        alert('Please add some content, an image, or a video to your post');
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
        let imageUrl = '';
        let videoUrl = '';
        
        // Upload image if selected
        if (selectedImageFile) {
            try {
                // Create a unique filename
                const timestamp = Date.now();
                const fileName = `${currentUser.uid}_${timestamp}_${selectedImageFile.name}`;
                const storageRef = ref(storage, `posts/${fileName}`);
                
                // Upload file
                await uploadBytes(storageRef, selectedImageFile);
                
                // Get download URL
                imageUrl = await getDownloadURL(storageRef);
            } catch (uploadError) {
                console.error('Error uploading image:', uploadError);
                console.error('Upload error details:', {
                    code: uploadError.code,
                    message: uploadError.message,
                    fileName: selectedImageFile.name,
                    fileSize: selectedImageFile.size,
                    fileType: selectedImageFile.type
                });
                alert(`Failed to upload image: ${uploadError.message || 'Unknown error'}. Please try again.`);
                if (postSubmitBtnEl) {
                    postSubmitBtnEl.disabled = false;
                    postSubmitBtnEl.textContent = 'Post';
                }
                return;
            }
        }
        
        // Upload video if selected
        if (selectedVideoFile) {
            try {
                // Create a unique filename
                const timestamp = Date.now();
                const fileName = `${currentUser.uid}_${timestamp}_${selectedVideoFile.name}`;
                const storageRef = ref(storage, `posts/${fileName}`);
                
                // Upload file with explicit content type metadata
                const metadata = {
                    contentType: 'video/mp4'
                };
                await uploadBytes(storageRef, selectedVideoFile, metadata);
                
                // Get download URL
                videoUrl = await getDownloadURL(storageRef);
            } catch (uploadError) {
                console.error('Error uploading video:', uploadError);
                console.error('Upload error details:', {
                    code: uploadError.code,
                    message: uploadError.message,
                    fileName: selectedVideoFile.name,
                    fileSize: selectedVideoFile.size,
                    fileType: selectedVideoFile.type
                });
                alert(`Failed to upload video: ${uploadError.message || 'Unknown error'}. Please try again.`);
                if (postSubmitBtnEl) {
                    postSubmitBtnEl.disabled = false;
                    postSubmitBtnEl.textContent = 'Post';
                }
                return;
            }
        }
        
        // Prepare post data
        const postData = {
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
            content: content,
            images: imageUrl ? [imageUrl] : [],
            videos: videoUrl ? [videoUrl] : [],
            upvotes: {},
            downvotes: {},
            voteScore: 0,
            commentsCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            deleted: false
        };
        
        // Add post to Firestore
        await addDoc(collection(db, 'posts'), postData);
        
        // Update quest progress for daily post quest
        try {
            const { updateQuestProgress } = await import('/js/quests-init.js');
            await updateQuestProgress('daily_post_1', 1);
        } catch (error) {
            // Quest module might not be loaded, ignore silently
        }
        
        // Reset form
        if (postContentEl) postContentEl.value = '';
        if (postImageFileEl) postImageFileEl.value = '';
        if (postVideoFileEl) postVideoFileEl.value = '';
        selectedImageFile = null;
        selectedVideoFile = null;
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
            videoPreviewUrl = null;
        }
        if (imagePreviewContainerEl) imagePreviewContainerEl.classList.add('hide');
        if (videoPreviewContainerEl) videoPreviewContainerEl.classList.add('hide');
        if (videoPreviewEl) {
            videoPreviewEl.src = '';
            videoPreviewEl.load();
        }
        updateCharCount();
        
    } catch (error) {
        console.error('Error creating post:', error);
        console.error('Post creation error details:', {
            code: error.code,
            message: error.message
        });
        alert(`Failed to create post: ${error.message || 'Unknown error'}. Please try again.`);
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
    
    // Check for post parameter in URL for scrolling
    const urlParams = new URLSearchParams(window.location.search);
    const postParam = urlParams.get('post');
    if (postParam) {
        // Clear URL parameter after reading
        window.history.replaceState({}, '', window.location.pathname);
        // Will scroll after posts are rendered
        setTimeout(() => scrollToPost(postParam), 1000);
    }
    
    // Clear existing listener
    if (postsListener) {
        postsListener();
        postsListener = null;
    }
    
    // Set loading state
    postsFeedEl.innerHTML = '<div class="posts-loading">Loading posts...</div>';
    
    try {
        // Try with composite query first (requires index)
        let postsQuery;
        try {
            postsQuery = query(
                collection(db, 'posts'),
                where('deleted', '==', false),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            
            // Set up real-time listener with the composite query
            postsListener = onSnapshot(
                postsQuery,
                (snapshot) => {
                    renderPosts(snapshot.docs);
                },
                (error) => {
                    // If index error, fall back to simpler query
                    if (error.code === 'failed-precondition' || error.message.includes('index')) {
                        setupFallbackPostsListener();
                    } else {
                        console.error('Error loading posts:', error);
                        postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts. Please refresh the page.</div>';
                    }
                }
            );
        } catch (indexError) {
            // If query setup fails due to missing index, use fallback
            if (indexError.code === 'failed-precondition' || indexError.message.includes('index')) {
                setupFallbackPostsListener();
            } else {
                throw indexError;
            }
        }
    } catch (error) {
        console.error('Error setting up posts listener:', error);
        postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts. Please refresh the page.</div>';
    }
}

// Fallback posts listener (simpler query, filters in JavaScript)
function setupFallbackPostsListener() {
    try {
        const postsQuery = query(
            collection(db, 'posts'),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        
        postsListener = onSnapshot(
            postsQuery,
            (snapshot) => {
                // Filter out deleted posts in JavaScript
                const nonDeletedDocs = snapshot.docs.filter(doc => {
                    const data = doc.data();
                    return !data.deleted || data.deleted === false;
                });
                // Limit to 50 after filtering
                renderPosts(nonDeletedDocs.slice(0, 50));
            },
            (error) => {
                console.error('Error loading posts:', error);
                postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts. Please refresh the page.</div>';
            }
        );
    } catch (error) {
        console.error('Error setting up fallback posts listener:', error);
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
    const hasUpvote = currentUser && post.upvotes && post.upvotes[currentUser.uid] === true;
    const hasDownvote = currentUser && post.downvotes && post.downvotes[currentUser.uid] === true;
    const voteScore = post.voteScore || 0;
    const canDelete = currentUser && post.userId === currentUser.uid;
    
    // Check if post can be edited (within 5 minutes)
    const canEdit = currentUser && post.userId === currentUser.uid && post.createdAt && (() => {
        const createdTime = post.createdAt.toMillis ? post.createdAt.toMillis() : (post.createdAt.seconds * 1000 || Date.now());
        return (Date.now() - createdTime) < 5 * 60 * 1000;
    })();
    
    // Check if post was edited
    const editedAt = post.editedAt?.toDate ? post.editedAt.toDate() : (post.editedAt?.seconds ? new Date(post.editedAt.seconds * 1000) : null);
    const editedIndicator = editedAt ? `<span class="post-edited-indicator">edited ${getTimeAgo(editedAt)}</span>` : '';
    
    // Check if user can report (authenticated and not post author)
    const canReport = currentUser && post.userId !== currentUser.uid;
    
    return `
        <div class="post-card" data-post-id="${post.id}">
            <div class="post-header">
                <img src="${bannerImage}" alt="${post.username}" class="post-author-avatar" />
                <div class="post-author-info">
                    <div class="post-author-name">${escapeHtml(post.username)}</div>
                    <div class="post-author-meta">
                        <span class="post-author-level">LVL ${userLevel}</span>
                        <span class="post-time">${timeAgo}</span>
                        ${editedIndicator}
                    </div>
                </div>
                <div class="post-header-actions">
                    ${canEdit ? `<button class="post-edit-btn" data-post-id="${post.id}" title="Edit post">✏️</button>` : ''}
                    ${canDelete ? `<button class="post-delete-btn" data-post-id="${post.id}" title="Delete post">×</button>` : ''}
                </div>
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
                
                ${post.videos && post.videos.length > 0 ? `
                    <div class="post-videos">
                        ${post.videos.map(vid => `
                            <video src="${escapeHtml(vid)}" class="post-video" controls></video>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            
            <div class="post-actions">
                <div class="post-vote-section">
                    <button class="post-vote-btn upvote-btn ${hasUpvote ? 'voted' : ''}" data-post-id="${post.id}" data-vote-type="upvote" title="Upvote">
                        <span class="post-vote-icon">↑</span>
                    </button>
                    <span class="post-vote-score" data-post-id="${post.id}">${voteScore}</span>
                    <button class="post-vote-btn downvote-btn ${hasDownvote ? 'voted' : ''}" data-post-id="${post.id}" data-vote-type="downvote" title="Downvote">
                        <span class="post-vote-icon">↓</span>
                    </button>
                </div>
                <button class="post-action-btn comment-btn" data-post-id="${post.id}">
                    <span class="post-action-icon">💬</span>
                    <span class="post-action-count">${post.commentsCount || 0}</span>
                </button>
                <button class="post-action-btn share-btn" data-post-id="${post.id}" title="Share post">
                    <span class="post-action-icon">🔗</span>
                </button>
                ${canReport ? `<button class="post-action-btn report-btn" data-post-id="${post.id}" title="Report post">
                    <span class="post-action-icon">🚩</span>
                </button>` : ''}
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
    // Profile navigation - avatar and name
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (postCard && post.userId) {
        const avatar = postCard.querySelector('.post-author-avatar');
        const authorInfo = postCard.querySelector('.post-author-info');
        
        const navigateToProfile = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `/profile/?user=${post.userId}`;
        };
        
        if (avatar) {
            avatar.style.cursor = 'pointer';
            avatar.addEventListener('click', navigateToProfile);
        }
        
        if (authorInfo) {
            authorInfo.style.cursor = 'pointer';
            authorInfo.addEventListener('click', navigateToProfile);
        }
    }
    
    // Vote buttons
    const upvoteBtn = document.querySelector(`.upvote-btn[data-post-id="${postId}"]`);
    const downvoteBtn = document.querySelector(`.downvote-btn[data-post-id="${postId}"]`);
    if (upvoteBtn) {
        upvoteBtn.addEventListener('click', () => handleVote(postId, 'upvote'));
    }
    if (downvoteBtn) {
        downvoteBtn.addEventListener('click', () => handleVote(postId, 'downvote'));
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
    
    // Edit button
    const editBtn = document.querySelector(`.post-edit-btn[data-post-id="${postId}"]`);
    if (editBtn) {
        editBtn.addEventListener('click', () => handleEditPost(postId, post));
    }
    
    // Delete button
    const deleteBtn = document.querySelector(`.post-delete-btn[data-post-id="${postId}"]`);
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => showDeleteConfirmationModal(postId));
    }
    
    // Share button
    const shareBtn = document.querySelector(`.share-btn[data-post-id="${postId}"]`);
    if (shareBtn) {
        shareBtn.addEventListener('click', () => handleSharePost(postId));
    }
    
    // Report button
    const reportBtn = document.querySelector(`.report-btn[data-post-id="${postId}"]`);
    if (reportBtn) {
        reportBtn.addEventListener('click', () => handleReportPost(postId, post));
    }
}

// Handle vote (upvote/downvote)
async function handleVote(postId, voteType) {
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
        
        // Update UI immediately
        const voteScoreEl = document.querySelector(`.post-vote-score[data-post-id="${postId}"]`);
        if (voteScoreEl) {
            voteScoreEl.textContent = newVoteScore;
        }
        
        // Update button states
        const upvoteBtn = document.querySelector(`.upvote-btn[data-post-id="${postId}"]`);
        const downvoteBtn = document.querySelector(`.downvote-btn[data-post-id="${postId}"]`);
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
        
    } catch (error) {
        console.error('Error voting:', error);
        alert('Failed to vote. Please try again.');
    }
}

// Load comments for a post
async function loadComments(postId) {
    const commentsListEl = document.getElementById(`commentsList_${postId}`);
    if (!commentsListEl) return;
    
    try {
        let commentsSnapshot;
        
        try {
            // Try with composite query first (requires index: deleted, createdAt)
            const commentsQuery = query(
                collection(db, 'posts', postId, 'comments'),
                where('deleted', '==', false),
                orderBy('createdAt', 'asc')
            );
            
            commentsSnapshot = await getDocs(commentsQuery);
        } catch (indexError) {
            console.warn('Index not found for comments, using fallback query:', indexError);
            // Fallback: simpler query, filter and sort in JavaScript
            try {
                const commentsQuery = query(
                    collection(db, 'posts', postId, 'comments'),
                    where('deleted', '==', false)
                );
                
                commentsSnapshot = await getDocs(commentsQuery);
                
                // Sort by createdAt in JavaScript
                const commentsArray = Array.from(commentsSnapshot.docs);
                commentsArray.sort((a, b) => {
                    const aData = a.data();
                    const bData = b.data();
                    const aTime = aData.createdAt?.toMillis ? aData.createdAt.toMillis() : (aData.createdAt?.seconds * 1000 || 0);
                    const bTime = bData.createdAt?.toMillis ? bData.createdAt.toMillis() : (bData.createdAt?.seconds * 1000 || 0);
                    return aTime - bTime; // ASC order
                });
                
                // Create a new QuerySnapshot-like object with sorted docs
                commentsSnapshot = {
                    docs: commentsArray,
                    empty: commentsArray.length === 0,
                    size: commentsArray.length,
                    forEach: (callback) => commentsArray.forEach(callback),
                    query: commentsSnapshot.query
                };
            } catch (fallbackError) {
                console.error('Fallback query also failed:', fallbackError);
                // Final fallback: get all comments and filter/sort in JavaScript
                const allCommentsQuery = query(
                    collection(db, 'posts', postId, 'comments')
                );
                
                commentsSnapshot = await getDocs(allCommentsQuery);
                
                // Filter and sort in JavaScript
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
                        return aTime - bTime; // ASC order
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

// Toast utility function
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Handle edit post
function handleEditPost(postId, post) {
    if (!currentUser || !post) return;
    
    // Create edit modal
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.id = 'editPostModal';
    
    const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt?.seconds * 1000 || Date.now());
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
    
    document.body.appendChild(modalOverlay);
    setTimeout(() => modalOverlay.classList.add('show'), 10);
    
    const editContentEl = document.getElementById('editPostContent');
    if (editContentEl) {
        editContentEl.focus();
        editContentEl.setSelectionRange(editContentEl.value.length, editContentEl.value.length);
    }
    
    // Close handlers
    const closeModal = () => {
        modalOverlay.classList.remove('show');
        setTimeout(() => modalOverlay.remove(), 300);
    };
    
    modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
    document.getElementById('saveEditBtn').addEventListener('click', () => handleSaveEdit(postId, editContentEl.value, closeModal));
    
    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    // Close on ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Handle save edit
async function handleSaveEdit(postId, newContent, closeModal) {
    if (!currentUser) return;
    
    const content = newContent.trim();
    
    if (!content) {
        showToast('Post content cannot be empty');
        return;
    }
    
    if (content.length > 2000) {
        showToast('Post content must be 2000 characters or less');
        return;
    }
    
    try {
        const postRef = doc(db, 'posts', postId);
        
        // Check if still within 5-minute window
        const postDoc = await getDoc(postRef);
        if (!postDoc.exists()) {
            showToast('Post not found');
            return;
        }
        
        const postData = postDoc.data();
        const createdTime = postData.createdAt?.toMillis ? postData.createdAt.toMillis() : (postData.createdAt?.seconds * 1000 || Date.now());
        if ((Date.now() - createdTime) >= 5 * 60 * 1000) {
            showToast('Edit window has expired');
            closeModal();
            return;
        }
        
        await updateDoc(postRef, {
            content: content,
            editedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        
        showToast('Post updated successfully');
        closeModal();
    } catch (error) {
        console.error('Error saving edit:', error);
        showToast('Failed to save edit. Please try again.');
    }
}

// Show delete confirmation modal
function showDeleteConfirmationModal(postId) {
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
    
    document.body.appendChild(modalOverlay);
    setTimeout(() => modalOverlay.classList.add('show'), 10);
    
    // Close handlers
    const closeModal = () => {
        modalOverlay.classList.remove('show');
        setTimeout(() => modalOverlay.remove(), 300);
    };
    
    modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => handleConfirmDelete(postId, closeModal));
    
    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    // Close on ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Handle confirm delete
async function handleConfirmDelete(postId, closeModal) {
    if (!currentUser) return;
    
    try {
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            deleted: true,
            updatedAt: serverTimestamp()
        });
        closeModal();
        showToast('Post deleted');
    } catch (error) {
        console.error('Error deleting post:', error);
        showToast('Failed to delete post. Please try again.');
    }
}

// Handle share post
async function handleSharePost(postId) {
    try {
        const shareUrl = window.location.origin + withBase(`/feed/?post=${postId}`);
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copied to clipboard!');
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('Link copied to clipboard!');
            } catch (err) {
                showToast(`Share URL: ${shareUrl}`);
            }
            document.body.removeChild(textArea);
        }
    } catch (error) {
        console.error('Error sharing post:', error);
        showToast('Failed to copy link. Please try again.');
    }
}

// Handle report post
function handleReportPost(postId, post) {
    if (!currentUser || !post) return;
    
    // Check if already reported (optional optimization)
    checkIfAlreadyReported(postId, currentUser.uid).then(alreadyReported => {
        if (alreadyReported) {
            showToast('You have already reported this post');
            return;
        }
        
        // Create report modal
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
        
        document.body.appendChild(modalOverlay);
        setTimeout(() => modalOverlay.classList.add('show'), 10);
        
        // Close handlers
        const closeModal = () => {
            modalOverlay.classList.remove('show');
            setTimeout(() => modalOverlay.remove(), 300);
        };
        
        modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
        document.getElementById('cancelReportBtn').addEventListener('click', closeModal);
        document.getElementById('submitReportBtn').addEventListener('click', () => {
            const selectedReason = modalOverlay.querySelector('input[name="reportReason"]:checked');
            if (!selectedReason) {
                showToast('Please select a reason');
                return;
            }
            handleSubmitReport(postId, post.userId, selectedReason.value, closeModal);
        });
        
        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
        
        // Close on ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

// Check if already reported
async function checkIfAlreadyReported(postId, userId) {
    try {
        const reportId = `${postId}_${userId}`;
        const reportRef = doc(db, 'reports', reportId);
        const reportDoc = await getDoc(reportRef);
        return reportDoc.exists();
    } catch (error) {
        console.error('Error checking report:', error);
        return false;
    }
}

// Handle submit report
async function handleSubmitReport(postId, reportedUserId, reason, closeModal) {
    if (!currentUser) return;
    
    const validReasons = ['spam', 'harassment', 'inappropriate', 'misinformation', 'other'];
    if (!validReasons.includes(reason)) {
        showToast('Invalid report reason');
        return;
    }
    
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
        }, { merge: false });
        
        showToast('Report submitted. Thank you for keeping the community safe.');
        closeModal();
    } catch (error) {
        console.error('Error submitting report:', error);
        if (error.code === 'permission-denied') {
            showToast('You have already reported this post');
        } else {
            showToast('Failed to submit report. Please try again.');
        }
    }
}

// Scroll to post on page load if URL has post parameter
function scrollToPost(postId) {
    setTimeout(() => {
        const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
        if (postCard) {
            postCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Highlight the post briefly
            postCard.style.transition = 'box-shadow 0.3s ease';
            postCard.style.boxShadow = '0 0 20px rgba(74, 222, 128, 0.5)';
            setTimeout(() => {
                postCard.style.boxShadow = '';
            }, 2000);
        }
    }, 500); // Delay to ensure posts are rendered
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

// Emoji picker functionality
const commonEmojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
    '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖',
    '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
    '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
    '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦',
    '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴',
    '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿',
    '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖',
    '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟',
    '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎',
    '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏',
    '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠',
    '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '💘', '💝', '💖',
    '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛',
    '💚', '💙', '💜', '🖤', '🤍', '🤎', '💯', '🔥', '⭐', '🌟',
    '✨', '💫', '💥', '💢', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️',
    '🗨️', '🗯️', '💭', '💤', '👋', '🤚', '🖐', '✋', '🖖', '👌'
];

function initEmojiPicker() {
    if (!emojiPickerGridEl) return;
    
    // Populate emoji grid
    commonEmojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.type = 'button';
        emojiBtn.className = 'emoji-item';
        emojiBtn.textContent = emoji;
        emojiBtn.title = emoji;
        emojiBtn.addEventListener('click', () => insertEmoji(emoji));
        emojiPickerGridEl.appendChild(emojiBtn);
    });
}

function toggleEmojiPicker(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!emojiPickerEl) return;
    
    if (emojiPickerEl.classList.contains('hide')) {
        openEmojiPicker();
    } else {
        closeEmojiPicker();
    }
}

function openEmojiPicker() {
    if (!emojiPickerEl) return;
    emojiPickerEl.classList.remove('hide');
}

function closeEmojiPicker() {
    if (!emojiPickerEl) return;
    emojiPickerEl.classList.add('hide');
}

function insertEmoji(emoji) {
    if (!postContentEl) return;
    
    const cursorPos = postContentEl.selectionStart;
    const textBefore = postContentEl.value.substring(0, cursorPos);
    const textAfter = postContentEl.value.substring(postContentEl.selectionEnd);
    const newText = textBefore + emoji + textAfter;
    
    // Check if adding emoji would exceed max length
    if (newText.length > 2000) {
        alert('Post is too long! Maximum 2000 characters.');
        return;
    }
    
    postContentEl.value = newText;
    
    // Set cursor position after inserted emoji
    const newCursorPos = cursorPos + emoji.length;
    postContentEl.setSelectionRange(newCursorPos, newCursorPos);
    
    // Update character count
    updateCharCount();
    
    // Focus back on textarea
    postContentEl.focus();
    
    // Close picker
    closeEmojiPicker();
}
