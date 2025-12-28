/**
 * Chat Page Initialization Module
 * Handles real-time chat functionality with Firestore
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    query,
    orderBy,
    limit,
    addDoc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    setDoc,
    doc,
    getDoc,
    getDocs,
    where,
    Timestamp,
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// Constants
const MESSAGES_PER_PAGE = 50;
const MAX_MESSAGE_LENGTH = 1000;
const RATE_LIMIT_SECONDS = 10; // Max 1 message per 10 seconds
const EDIT_TIME_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
const TYPING_TIMEOUT = 3000; // 3 seconds
const PRESENCE_TIMEOUT = 30000; // 30 seconds

// Profanity filter - list of explicit words to censor
const PROFANITY_WORDS = [
    // Common profanity
    'fuck', 'fucking', 'fucked', 'fucker', 'fucks',
    'shit', 'shitting', 'shitted', 'shits',
    'damn', 'damned', 'damning',
    'hell', 'hells',
    'ass', 'asses', 'asshole', 'assholes',
    'bitch', 'bitches', 'bitching',
    'bastard', 'bastards',
    'crap', 'craps',
    'piss', 'pissing', 'pissed',
    'dick', 'dicks', 'dickhead',
    'cock', 'cocks',
    'pussy', 'pussies',
    'slut', 'sluts',
    'whore', 'whores',
    'nigger', 'niggers', 'nigga', 'niggas',
    'retard', 'retards', 'retarded',
    'gay', 'gays', // Context-dependent, but included for safety
    'lesbian', 'lesbians',
    // Add more as needed
];

// State
let currentUser = null;
let userProfile = null;
let messagesListener = null;
let typingListener = null;
let presenceListener = null;
let lastMessageTime = 0;
let typingTimeout = null;
let presenceUpdateInterval = null;
let lastSeenUpdateInterval = null;
let currentOnlineUsers = []; // Store current online users for periodic updates
let currentChannel = 'general';
let messageContextMenuMessageId = null;

// DOM Elements
let chatMessagesEl, chatInputEl, sendBtn, chatLoadingEl, chatEmptyEl;
let chatTypingEl, typingTextEl, charCountEl, rateLimitInfoEl;
let chatUserListEl, onlineCountEl;
let messageContextMenuEl, reactionPickerEl, emojiPickerEl;
let userProfilePopupEl, userProfilePopupOverlayEl, userProfilePopupCloseEl;

// Initialize auth gate for chat page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Chat init: Auth gate initialization error:', error);
    }
})();

// Initialize chat when auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserProfile();
        initializeChat();
    } else {
        currentUser = null;
        cleanupChat();
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
        } else {
            console.warn('User profile not found, creating default profile');
            // Create a default profile if it doesn't exist
            // Must match Firestore rules: username, email, avatarCount, createdAt (on create)
            const defaultUsername = currentUser.email?.split('@')[0] || 'user';
            // Normalize username to match Firestore rules: lowercase, alphanumeric + underscore, 3-20 chars
            const normalizedUsername = defaultUsername.toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')  // Replace invalid chars with underscore
                .substring(0, 20)             // Max 20 chars
                .replace(/^_+|_+$/g, '');     // Remove leading/trailing underscores
            
            // Ensure minimum length
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
                xAccountVerified: false
            };
            
            // Try to create it (but don't block if it fails)
            try {
                // Use setDoc (not merge) for initial creation to match Firestore rules
                await setDoc(userDocRef, userData);
                // Default user profile created
            } catch (createError) {
                console.error('Error creating user profile:', createError);
                console.error('  - Error code:', createError.code);
                console.error('  - Error message:', createError.message);
                if (createError.code === 'permission-denied') {
                    console.error('  - PERMISSION_DENIED: Profile creation blocked by Firestore rules');
                    console.error('    * Check that request.auth.uid == uid');
                    console.error('    * Username format:', finalUsername, 'valid:', /^[a-z0-9_]{3,20}$/.test(finalUsername));
                }
                // Continue anyway with default profile
            }
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        // Create a default profile on error so chat can still work
        const defaultUsername = currentUser.email?.split('@')[0] || 'user';
        // Normalize username to match Firestore rules
        const normalizedUsername = defaultUsername.toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .substring(0, 20)
            .replace(/^_+|_+$/g, '');
        const finalUsername = normalizedUsername.length >= 3 ? normalizedUsername : 'user_' + Date.now().toString(36).substring(0, 10);
        
        userProfile = {
            username: finalUsername,
            usernameLower: finalUsername.toLowerCase(),
            email: currentUser.email || '',
            avatarCount: 0,
            bannerImage: '/pfp_apes/bg1.png',
            xAccountVerified: false
        };
        // Using default profile due to error
        
        // Try to create the profile one more time with proper format
        try {
            const userData = {
                username: finalUsername,
                email: currentUser.email || '',
                avatarCount: 0,
                createdAt: Timestamp.now()
            };
            
            await setDoc(doc(db, 'users', currentUser.uid), userData);
            // Successfully created user profile after error
        } catch (retryError) {
            console.error('Failed to create profile on retry:', retryError);
            console.error('  - Error code:', retryError.code);
            console.error('  - Error message:', retryError.message);
        }
    }
}

// Initialize chat functionality
function initializeChat() {
    if (!currentUser || !userProfile) {
        console.error('Cannot initialize chat: user not loaded');
        return;
    }

    // Get DOM elements
    chatMessagesEl = document.getElementById('chatMessages');
    chatInputEl = document.getElementById('chatInput');
    sendBtn = document.getElementById('sendBtn');
    chatLoadingEl = document.getElementById('chatLoading');
    chatEmptyEl = document.getElementById('chatEmpty');
    chatTypingEl = document.getElementById('chatTyping');
    typingTextEl = document.getElementById('typingText');
    charCountEl = document.getElementById('charCount');
    rateLimitInfoEl = document.getElementById('rateLimitInfo');
    chatUserListEl = document.getElementById('chatUserList');
    onlineCountEl = document.getElementById('onlineCount');
    messageContextMenuEl = document.getElementById('messageContextMenu');
    reactionPickerEl = document.getElementById('reactionPicker');
    emojiPickerEl = document.getElementById('emojiPicker');
    userProfilePopupEl = document.getElementById('userProfilePopup');
    userProfilePopupOverlayEl = document.getElementById('userProfilePopupOverlay');
    userProfilePopupCloseEl = document.getElementById('userProfilePopupClose');

    if (!chatMessagesEl || !chatInputEl || !sendBtn) {
        console.error('Chat DOM elements not found');
        return;
    }

    // Setup event listeners
    setupEventListeners();
    
    // Load messages
    loadMessages();
    
    // Setup real-time listeners
    setupRealtimeListeners();
    
    // Setup presence
    setupPresence();
    
    // Setup typing indicator
    setupTypingIndicator();
}

// Setup event listeners
function setupEventListeners() {
    // Send message
    sendBtn.addEventListener('click', handleSendMessage);
    chatInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Character count
    chatInputEl.addEventListener('input', () => {
        const length = chatInputEl.value.length;
        charCountEl.textContent = `${length}/${MAX_MESSAGE_LENGTH}`;
        
        if (length > MAX_MESSAGE_LENGTH * 0.9) {
            charCountEl.classList.add('warning');
        } else {
            charCountEl.classList.remove('warning');
        }
    });

    // Emoji button - show emoji picker
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn && emojiPickerEl) {
        emojiBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Toggle emoji picker
            if (emojiPickerEl.classList.contains('hide')) {
                showEmojiPicker(emojiBtn);
            } else {
                emojiPickerEl.classList.add('hide');
            }
        });
        
        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (emojiPickerEl && !emojiPickerEl.classList.contains('hide')) {
                // Check if click is outside both the picker and the button
                if (!emojiPickerEl.contains(e.target) && !emojiBtn.contains(e.target)) {
                    emojiPickerEl.classList.add('hide');
                }
            }
        });
    }
    
    // Setup emoji picker options
    if (emojiPickerEl) {
        const emojiOptions = emojiPickerEl.querySelectorAll('.emoji-picker-option');
        emojiOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const emoji = option.dataset.emoji;
                if (emoji) {
                    insertTextAtCursor(chatInputEl, emoji);
                    chatInputEl.focus();
                    // Trigger input event to update character count
                    chatInputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    // Close picker
                    emojiPickerEl.classList.add('hide');
                }
            });
        });
    }

    // Message context menu
    setupMessageContextMenu();
    
    // Reaction picker
    setupReactionPicker();
    
    // User profile popup
    setupUserProfilePopup();
    
    // Close menus on click outside
    document.addEventListener('click', (e) => {
        if (!messageContextMenuEl.contains(e.target) && !e.target.closest('.message-actions')) {
            messageContextMenuEl.classList.add('hide');
        }
        if (!reactionPickerEl.contains(e.target) && !e.target.closest('.message-reactions')) {
            reactionPickerEl.classList.add('hide');
        }
        if (emojiPickerEl && !emojiPickerEl.contains(e.target) && !e.target.closest('.chat-emoji-btn')) {
            emojiPickerEl.classList.add('hide');
        }
    });

    // Auto-resize textarea
    chatInputEl.addEventListener('input', () => {
        chatInputEl.style.height = 'auto';
        chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 150) + 'px';
    });
}

// Load messages from Firestore
function loadMessages() {
    if (!currentUser) return;

    // Always hide loading after a timeout, even if query fails
    const loadingTimeout = setTimeout(() => {
        if (chatLoadingEl && !chatLoadingEl.classList.contains('hide')) {
            console.warn('Message loading taking too long, showing error');
            chatLoadingEl.classList.add('hide');
            chatEmptyEl.classList.remove('hide');
            chatEmptyEl.innerHTML = `
                <div class="chat-empty-icon">⏱️</div>
                <h3>Loading is taking longer than expected</h3>
                <p>Please check your connection and refresh the page.</p>
            `;
        }
    }, 15000); // 15 second timeout

    const messagesRef = collection(db, 'messages');
    const q = query(
        messagesRef,
        where('channel', '==', currentChannel),
        where('deleted', '==', false),
        orderBy('timestamp', 'desc'),
        limit(MESSAGES_PER_PAGE)
    );

    getDocs(q).then((snapshot) => {
        clearTimeout(loadingTimeout);
        chatLoadingEl.classList.add('hide');
        
        if (snapshot.empty) {
            chatEmptyEl.classList.remove('hide');
            return;
        }

        chatEmptyEl.classList.add('hide');
        
        // Reverse to show oldest first
        const messages = snapshot.docs.reverse();
        messages.forEach((doc) => {
            displayMessage(doc.id, doc.data());
        });

        scrollToBottom();
    }).catch((error) => {
        clearTimeout(loadingTimeout);
        console.error('Error loading messages:', error);
        chatLoadingEl.classList.add('hide');
        chatEmptyEl.classList.remove('hide');
        chatEmptyEl.innerHTML = `
            <div class="chat-empty-icon">⚠️</div>
            <h3>Unable to load messages</h3>
            <p>There was an error loading messages. Please check your connection and refresh the page.</p>
            <p style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 10px;">Error: ${error.message}</p>
        `;
    });
}

// Setup real-time message listener
function setupRealtimeListeners() {
    if (!currentUser) return;

    const messagesRef = collection(db, 'messages');
    const q = query(
        messagesRef,
        where('channel', '==', currentChannel),
        where('deleted', '==', false),
        orderBy('timestamp', 'desc'),
        limit(MESSAGES_PER_PAGE)
    );

    messagesListener = onSnapshot(q, (snapshot) => {
        // Only handle new messages (not initial load)
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                // Check if message already displayed
                const existingMsg = document.getElementById(`msg-${change.doc.id}`);
                if (!existingMsg) {
                    displayMessage(change.doc.id, change.doc.data());
                    scrollToBottom();
                }
            } else if (change.type === 'modified') {
                updateMessageDisplay(change.doc.id, change.doc.data());
            }
        });
    });

    // Setup typing indicator listener
    const typingRef = collection(db, 'typing');
    typingListener = onSnapshot(typingRef, (snapshot) => {
        const typingUsers = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.channel === currentChannel && data.userId !== currentUser.uid) {
                // Check if typing is recent (within 3 seconds)
                const now = Date.now();
                const typingTime = data.timestamp?.toMillis() || 0;
                if (now - typingTime < TYPING_TIMEOUT) {
                    typingUsers.push(data);
                }
            }
        });

        if (typingUsers.length > 0) {
            const usernames = typingUsers.map(u => u.username || 'Someone').slice(0, 3);
            let text = '';
            if (usernames.length === 1) {
                text = `${usernames[0]} is typing...`;
            } else if (usernames.length === 2) {
                text = `${usernames[0]} and ${usernames[1]} are typing...`;
            } else {
                text = `${usernames[0]}, ${usernames[1]}, and others are typing...`;
            }
            typingTextEl.textContent = text;
            chatTypingEl.classList.remove('hide');
        } else {
            chatTypingEl.classList.add('hide');
        }
    });

    // Setup presence listener for online users
    const presenceRef = collection(db, 'presence');
    presenceListener = onSnapshot(presenceRef, (snapshot) => {
        const onlineUsers = [];
        const now = Date.now();
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId === currentUser.uid) return; // Skip current user
            
            // Check if user is online (either explicitly online or recently active)
            let lastSeenMillis = 0;
            if (data.lastSeen) {
                if (data.lastSeen.toMillis) {
                    lastSeenMillis = data.lastSeen.toMillis();
                } else if (data.lastSeen.toDate) {
                    lastSeenMillis = data.lastSeen.toDate().getTime();
                } else if (typeof data.lastSeen === 'number') {
                    lastSeenMillis = data.lastSeen;
                }
            }
            const timeSinceLastSeen = now - lastSeenMillis;
            const isRecentlyActive = timeSinceLastSeen < PRESENCE_TIMEOUT * 2; // 60 seconds
            
            if (data.online || isRecentlyActive) {
                onlineUsers.push({
                    ...data,
                    lastSeen: data.lastSeen,
                    isOnline: data.online || isRecentlyActive
                });
            }
        });

        // Sort by online status (online first) then by last seen (most recent first)
        onlineUsers.sort((a, b) => {
            if (a.isOnline !== b.isOnline) {
                return a.isOnline ? -1 : 1;
            }
            // Get lastSeen timestamps
            let aLastSeen = 0;
            let bLastSeen = 0;
            if (a.lastSeen) {
                if (a.lastSeen.toMillis) aLastSeen = a.lastSeen.toMillis();
                else if (a.lastSeen.toDate) aLastSeen = a.lastSeen.toDate().getTime();
                else if (typeof a.lastSeen === 'number') aLastSeen = a.lastSeen;
            }
            if (b.lastSeen) {
                if (b.lastSeen.toMillis) bLastSeen = b.lastSeen.toMillis();
                else if (b.lastSeen.toDate) bLastSeen = b.lastSeen.toDate().getTime();
                else if (typeof b.lastSeen === 'number') bLastSeen = b.lastSeen;
            }
            return bLastSeen - aLastSeen;
        });

        currentOnlineUsers = onlineUsers; // Store for periodic updates
        updateOnlineUsersList(onlineUsers);
        onlineCountEl.textContent = onlineUsers.length + 1; // +1 for current user
        
        // Update last seen times every minute for real-time updates
        if (!lastSeenUpdateInterval) {
            lastSeenUpdateInterval = setInterval(() => {
                updateOnlineUsersList(currentOnlineUsers);
            }, 60000); // Update every minute
        }
    });
}

// Display a message in the chat
function displayMessage(messageId, messageData) {
    if (!chatMessagesEl) return;

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.id = `msg-${messageId}`;
    
    const isOwnMessage = messageData.userId === currentUser.uid;
    if (isOwnMessage) {
        messageEl.classList.add('own-message');
    }

    const timestamp = messageData.timestamp?.toDate() || new Date();
    const timeStr = formatTime(timestamp);
    const dateStr = formatDate(timestamp);

    // Check if user is admin/moderator (role field needs to be added to user profile)
    const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'moderator';
    const canEdit = isOwnMessage && (Date.now() - timestamp.getTime() < EDIT_TIME_LIMIT);
    const canDelete = isOwnMessage || isAdmin;

    // Banner image (fallback to default if no banner)
    const bannerImage = messageData.bannerImage || '/pfp_apes/bg1.png';
    const defaultImage = '/pfp_apes/bg1.png';
    
    messageEl.innerHTML = `
        <div class="message-avatar">
            <img src="${bannerImage}" alt="${messageData.username}" data-fallback="${defaultImage}">
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username clickable-username" data-user-id="${messageData.userId}" data-username="${escapeHtml(messageData.username)}" title="Click to view profile">${escapeHtml(messageData.username)}</span>
                ${messageData.xAccountVerified ? '<span class="verified-badge" title="Verified X account">✓</span>' : ''}
                <span class="message-time" title="${dateStr}">${timeStr}</span>
                ${messageData.editedAt ? '<span class="message-edited">(edited)</span>' : ''}
            </div>
            <div class="message-text">${formatMessageText(messageData.text)}</div>
            ${messageData.reactions && Object.keys(messageData.reactions).length > 0 ? renderReactions(messageId, messageData.reactions) : ''}
            <div class="message-actions">
                <button class="message-action-btn" data-message-id="${messageId}" title="React">😀</button>
                ${canEdit ? `<button class="message-action-btn edit-btn" data-message-id="${messageId}" title="Edit">✏️</button>` : ''}
                ${canDelete ? `<button class="message-action-btn delete-btn" data-message-id="${messageId}" title="Delete">🗑️</button>` : ''}
            </div>
        </div>
    `;

    chatMessagesEl.appendChild(messageEl);
    
    // Add image error handling (CSP-compliant)
    const avatarImg = messageEl.querySelector('.message-avatar img');
    if (avatarImg) {
        avatarImg.addEventListener('error', function() {
            const fallback = this.dataset.fallback || '/pfp_apes/bg1.png';
            if (this.src !== fallback) {
                this.src = fallback;
            }
        });
    }
    
    // Add event listeners for message actions
    setupMessageActions(messageEl, messageId, messageData, canEdit, canDelete);
    
    // Add event listener for clickable username
    const usernameEl = messageEl.querySelector('.clickable-username');
    if (usernameEl) {
        usernameEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const userId = usernameEl.dataset.userId;
            if (userId) {
                showUserProfile(userId);
            }
        });
    }
}

// Update message display (for edits, reactions)
function updateMessageDisplay(messageId, messageData) {
    const messageEl = document.getElementById(`msg-${messageId}`);
    if (!messageEl) return;

    // Update text if edited
    const textEl = messageEl.querySelector('.message-text');
    if (textEl) {
        textEl.innerHTML = formatMessageText(messageData.text);
    }

    // Update edited indicator
    const headerEl = messageEl.querySelector('.message-header');
    if (headerEl) {
        const editedEl = headerEl.querySelector('.message-edited');
        if (messageData.editedAt) {
            if (!editedEl) {
                const editedSpan = document.createElement('span');
                editedSpan.className = 'message-edited';
                editedSpan.textContent = '(edited)';
                headerEl.appendChild(editedSpan);
            }
        } else if (editedEl) {
            editedEl.remove();
        }
    }

    // Update reactions
    const reactionsEl = messageEl.querySelector('.message-reactions');
    if (messageData.reactions && Object.keys(messageData.reactions).length > 0) {
        if (reactionsEl) {
            reactionsEl.outerHTML = renderReactions(messageId, messageData.reactions);
        } else {
            const contentEl = messageEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.insertAdjacentHTML('beforeend', renderReactions(messageId, messageData.reactions));
            }
        }
    } else if (reactionsEl) {
        reactionsEl.remove();
    }
}

// Render reactions
function renderReactions(messageId, reactions) {
    let html = '<div class="message-reactions">';
    Object.entries(reactions).forEach(([emoji, userIds]) => {
        const count = userIds.length;
        const hasReacted = userIds.includes(currentUser.uid);
        html += `<button class="reaction ${hasReacted ? 'reacted' : ''}" data-emoji="${emoji}" data-message-id="${messageId}">
            ${emoji} ${count}
        </button>`;
    });
    html += '</div>';
    return html;
}

// Format message text (links, mentions, basic formatting)
// Filter profanity from text
// Pre-compile profanity regex patterns for better performance
const PROFANITY_PATTERNS = PROFANITY_WORDS.map(word => {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedWord}\\b`, 'gi');
});

function filterProfanity(text) {
    if (!text) return text;
    
    let filtered = text;
    
    // Use pre-compiled regex patterns for better performance
    PROFANITY_PATTERNS.forEach(regex => {
        filtered = filtered.replace(regex, (match) => {
            return '*'.repeat(match.length);
        });
    });
    
    return filtered;
}

function formatMessageText(text) {
    if (!text) return '';
    
    // Filter profanity first (before HTML escaping)
    let formatted = filterProfanity(text);
    
    // Escape HTML
    formatted = escapeHtml(formatted);
    
    // Convert URLs to links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Convert @mentions (simple version)
    const mentionRegex = /@(\w+)/g;
    formatted = formatted.replace(mentionRegex, '<span class="mention">@$1</span>');
    
    // Convert **bold** and *italic*
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Preserve line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Setup message action buttons
function setupMessageActions(messageEl, messageId, messageData, canEdit, canDelete) {
    // React button
    const reactBtn = messageEl.querySelector('[data-message-id].message-action-btn:not(.edit-btn):not(.delete-btn)');
    if (reactBtn) {
        reactBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showReactionPicker(messageId, reactBtn);
        });
    }

    // Edit button
    if (canEdit) {
        const editBtn = messageEl.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editMessage(messageId, messageData.text);
            });
        }
    }

    // Delete button
    if (canDelete) {
        const deleteBtn = messageEl.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteMessage(messageId);
            });
        }
    }

    // Reaction buttons
    messageEl.querySelectorAll('.reaction').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleReaction(messageId, btn.dataset.emoji);
        });
    });

    // Right-click context menu
    messageEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMessageContextMenu(e, messageId, messageData, canEdit, canDelete);
    });
}

// Handle sending a message
async function handleSendMessage() {
    if (!currentUser || !userProfile) {
        alert('Please log in to send messages');
        return;
    }

    const text = chatInputEl.value.trim();
    if (!text) return;

    // Rate limiting with countdown timer
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    if (timeSinceLastMessage < RATE_LIMIT_SECONDS * 1000) {
        const remaining = Math.ceil((RATE_LIMIT_SECONDS * 1000 - timeSinceLastMessage) / 1000);
        rateLimitInfoEl.textContent = `Please wait ${remaining} second${remaining > 1 ? 's' : ''} before sending another message`;
        rateLimitInfoEl.classList.remove('hide');
        rateLimitInfoEl.classList.add('warning');
        
        // Update countdown every second
        const countdownInterval = setInterval(() => {
            const timeLeft = Math.ceil((RATE_LIMIT_SECONDS * 1000 - (Date.now() - lastMessageTime)) / 1000);
            if (timeLeft > 0) {
                rateLimitInfoEl.textContent = `Please wait ${timeLeft} second${timeLeft > 1 ? 's' : ''} before sending another message`;
            } else {
                rateLimitInfoEl.classList.add('hide');
                rateLimitInfoEl.classList.remove('warning');
                clearInterval(countdownInterval);
            }
        }, 1000);
        
        // Clear interval after cooldown period
        setTimeout(() => {
            clearInterval(countdownInterval);
            rateLimitInfoEl.classList.add('hide');
            rateLimitInfoEl.classList.remove('warning');
        }, (RATE_LIMIT_SECONDS * 1000) - timeSinceLastMessage);
        
        return;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
        alert(`Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
        return;
    }

    // Basic profanity filter (simple word list - can be expanded)
    const profanityWords = ['spam', 'scam']; // Add more as needed
    const lowerText = text.toLowerCase();
    if (profanityWords.some(word => lowerText.includes(word) && lowerText.split(word).length > 2)) {
        alert('Please keep messages appropriate for the community.');
        return;
    }

    try {
        const messagesRef = collection(db, 'messages');
        await addDoc(messagesRef, {
            text: text,
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
            avatarCount: userProfile.avatarCount || 0,
            bannerImage: userProfile.bannerImage || '',
            timestamp: serverTimestamp(),
            channel: currentChannel,
            deleted: false,
            reactions: {},
            xAccountVerified: userProfile.xAccountVerified || false
        });

        // Clear input
        chatInputEl.value = '';
        chatInputEl.style.height = 'auto';
        charCountEl.textContent = `0/${MAX_MESSAGE_LENGTH}`;
        lastMessageTime = now;
        rateLimitInfoEl.classList.add('hide');
        rateLimitInfoEl.classList.remove('warning');

        // Clear typing indicator
        clearTypingIndicator();

        // Update presence when sending a message (mark as online)
        updatePresence(true);

        // Update quest progress for chat messages
        try {
            const { updateQuestProgress } = await import('/js/quests-init.js');
            await updateQuestProgress('daily_chat_5', 1);
            await updateQuestProgress('weekly_chat_50', 1);
        } catch (error) {
            console.error('Error updating quest progress from chat:', error);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
}

// Edit a message
async function editMessage(messageId, currentText) {
    const newText = prompt('Edit your message:', currentText);
    if (!newText || newText.trim() === currentText.trim()) return;

    if (newText.trim().length > MAX_MESSAGE_LENGTH) {
        alert(`Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
        return;
    }

    try {
        const messageRef = doc(db, 'messages', messageId);
        await updateDoc(messageRef, {
            text: newText.trim(),
            editedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error editing message:', error);
        alert('Failed to edit message. Please try again.');
    }
}

// Delete a message (soft delete)
async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
        const messageRef = doc(db, 'messages', messageId);
        await updateDoc(messageRef, {
            deleted: true
        });
        
        // Remove from UI
        const messageEl = document.getElementById(`msg-${messageId}`);
        if (messageEl) {
            messageEl.remove();
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message. Please try again.');
    }
}

// Toggle reaction
async function toggleReaction(messageId, emoji) {
    if (!currentUser) return;

    try {
        const messageRef = doc(db, 'messages', messageId);
        const messageDoc = await getDoc(messageRef);
        
        if (!messageDoc.exists()) return;

        const messageData = messageDoc.data();
        const reactions = messageData.reactions || {};
        const userIds = reactions[emoji] || [];

        if (userIds.includes(currentUser.uid)) {
            // Remove reaction
            const newUserIds = userIds.filter(id => id !== currentUser.uid);
            if (newUserIds.length === 0) {
                delete reactions[emoji];
            } else {
                reactions[emoji] = newUserIds;
            }
        } else {
            // Add reaction
            reactions[emoji] = [...userIds, currentUser.uid];
        }

        await updateDoc(messageRef, { reactions });
    } catch (error) {
        console.error('Error toggling reaction:', error);
    }
}

// Setup typing indicator
function setupTypingIndicator() {
    if (!chatInputEl) return;

    let typingTimeoutId = null;

    chatInputEl.addEventListener('input', () => {
        updateTypingIndicator();
        
        // Clear existing timeout
        if (typingTimeoutId) {
            clearTimeout(typingTimeoutId);
        }

        // Set timeout to clear typing indicator
        typingTimeoutId = setTimeout(() => {
            clearTypingIndicator();
        }, TYPING_TIMEOUT);
    });

    // Clear on blur
    chatInputEl.addEventListener('blur', () => {
        clearTypingIndicator();
    });
}

// Update typing indicator in Firestore
async function updateTypingIndicator() {
    if (!currentUser || !userProfile) return;

    try {
        const typingRef = doc(db, 'typing', currentUser.uid);
        await setDoc(typingRef, {
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
            channel: currentChannel,
            timestamp: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error('Error updating typing indicator:', error);
    }
}

// Clear typing indicator
async function clearTypingIndicator() {
    if (!currentUser) return;

    try {
        const typingRef = doc(db, 'typing', currentUser.uid);
        await deleteDoc(typingRef);
    } catch (error) {
        // Ignore if document doesn't exist
    }
}

// Setup presence (online/offline status)
function setupPresence() {
    if (!currentUser) return;

    // Set online status
    updatePresence(true);

    // Update presence periodically
    presenceUpdateInterval = setInterval(() => {
        updatePresence(true);
    }, PRESENCE_TIMEOUT / 2);

    // Set offline when page unloads
    window.addEventListener('beforeunload', () => {
        updatePresence(false);
    });

    // Set offline when tab becomes hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            updatePresence(false);
        } else {
            updatePresence(true);
        }
    });
}

// Update presence in Firestore
async function updatePresence(online) {
    if (!currentUser) return;

    try {
        const presenceRef = doc(db, 'presence', currentUser.uid);
        await setDoc(presenceRef, {
            userId: currentUser.uid,
            username: userProfile?.username || 'Anonymous',
            avatarCount: userProfile?.avatarCount || 0,
            bannerImage: userProfile?.bannerImage || '',
            xAccountVerified: userProfile?.xAccountVerified || false,
            online: online,
            lastSeen: serverTimestamp(),
            channel: currentChannel
        }, { merge: true });
    } catch (error) {
        console.error('Error updating presence:', error);
    }
}

// Format relative time (e.g., "2 minutes ago", "just now")
function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Unknown';
    
    try {
        const now = Date.now();
        let time;
        
        // Handle Firestore Timestamp
        if (timestamp.toMillis) {
            time = timestamp.toMillis();
        } else if (timestamp.toDate) {
            time = timestamp.toDate().getTime();
        } else if (typeof timestamp === 'number') {
            time = timestamp;
        } else if (timestamp instanceof Date) {
            time = timestamp.getTime();
        } else {
            return 'Unknown';
        }
        
        const diff = now - time;
        
        if (diff < 0) return 'just now'; // Future timestamp (shouldn't happen)
        if (diff < 1000) return 'just now';
        if (diff < 60000) {
            const seconds = Math.floor(diff / 1000);
            return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`;
        }
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
        }
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
        }
        const days = Math.floor(diff / 86400000);
        return days === 1 ? '1 day ago' : `${days} days ago`;
    } catch (error) {
        console.error('Error formatting relative time:', error);
        return 'Unknown';
    }
}

// Update online users list
function updateOnlineUsersList(users) {
    if (!chatUserListEl) return;

    if (users.length === 0) {
        chatUserListEl.innerHTML = '<div class="chat-user-item">No other users online</div>';
        return;
    }

    chatUserListEl.innerHTML = users.map(user => {
        const bannerImage = user.bannerImage || '/pfp_apes/bg1.png';
        const defaultImage = '/pfp_apes/bg1.png';
        const lastSeen = user.lastSeen ? formatRelativeTime(user.lastSeen) : 'Unknown';
        const isOnline = user.isOnline !== false; // Default to true if not specified
        
        return `
            <div class="chat-user-item">
                <div class="chat-user-avatar">
                    <img src="${bannerImage}" alt="${user.username}" data-fallback="${defaultImage}">
                    ${isOnline ? '<span class="online-indicator" title="Online"></span>' : ''}
                </div>
                <div class="chat-user-info">
                    <div class="chat-user-name-row">
                        <span class="chat-username">${escapeHtml(user.username || 'Anonymous')}</span>
                        ${user.xAccountVerified ? '<span class="verified-badge-small" title="Verified X account">✓</span>' : ''}
                    </div>
                    <div class="chat-user-last-seen">
                        ${isOnline ? `<span class="online-text">Online</span> • <span class="last-seen-text">Active ${lastSeen}</span>` : `<span class="last-seen-text">Last active: ${lastSeen}</span>`}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add image error handling for user list (CSP-compliant)
    chatUserListEl.querySelectorAll('img').forEach(img => {
        img.addEventListener('error', function() {
            const fallback = this.dataset.fallback || '/pfp_apes/bg1.png';
            if (this.src !== fallback) {
                this.src = fallback;
            }
        });
    });
}

// Setup message context menu
function setupMessageContextMenu() {
    const copyBtn = document.getElementById('copyMessageBtn');
    const reactBtn = document.getElementById('reactMessageBtn');
    const editBtn = document.getElementById('editMessageBtn');
    const deleteBtn = document.getElementById('deleteMessageBtn');
    const reportBtn = document.getElementById('reportMessageBtn');

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (messageContextMenuMessageId) {
                const messageEl = document.getElementById(`msg-${messageContextMenuMessageId}`);
                if (messageEl) {
                    const textEl = messageEl.querySelector('.message-text');
                    if (textEl) {
                        navigator.clipboard.writeText(textEl.textContent).then(() => {
                            showToast('Message copied to clipboard');
                        });
                    }
                }
            }
            messageContextMenuEl.classList.add('hide');
        });
    }

    if (reactBtn) {
        reactBtn.addEventListener('click', () => {
            if (messageContextMenuMessageId) {
                const messageEl = document.getElementById(`msg-${messageContextMenuMessageId}`);
                const actionBtn = messageEl?.querySelector('.message-action-btn:not(.edit-btn):not(.delete-btn)');
                if (actionBtn) {
                    showReactionPicker(messageContextMenuMessageId, actionBtn);
                }
            }
            messageContextMenuEl.classList.add('hide');
        });
    }

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (messageContextMenuMessageId) {
                const messageEl = document.getElementById(`msg-${messageContextMenuMessageId}`);
                const textEl = messageEl?.querySelector('.message-text');
                if (textEl) {
                    editMessage(messageContextMenuMessageId, textEl.textContent);
                }
            }
            messageContextMenuEl.classList.add('hide');
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (messageContextMenuMessageId) {
                deleteMessage(messageContextMenuMessageId);
            }
            messageContextMenuEl.classList.add('hide');
        });
    }

    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            if (messageContextMenuMessageId) {
                reportMessage(messageContextMenuMessageId);
            }
            messageContextMenuEl.classList.add('hide');
        });
    }
}

// Show message context menu
function showMessageContextMenu(event, messageId, messageData, canEdit, canDelete) {
    messageContextMenuMessageId = messageId;
    
    const editBtn = document.getElementById('editMessageBtn');
    const deleteBtn = document.getElementById('deleteMessageBtn');
    
    if (editBtn) {
        if (canEdit) {
            editBtn.classList.remove('hide');
        } else {
            editBtn.classList.add('hide');
        }
    }
    if (deleteBtn) {
        if (canDelete) {
            deleteBtn.classList.remove('hide');
        } else {
            deleteBtn.classList.add('hide');
        }
    }

    messageContextMenuEl.classList.remove('hide');
    messageContextMenuEl.style.left = event.pageX + 'px';
    messageContextMenuEl.style.top = event.pageY + 'px';
}

// Setup reaction picker
function setupReactionPicker() {
    const reactionOptions = reactionPickerEl.querySelectorAll('.reaction-option');
    reactionOptions.forEach(option => {
        option.addEventListener('click', () => {
            const emoji = option.dataset.emoji;
            if (messageContextMenuMessageId) {
                toggleReaction(messageContextMenuMessageId, emoji);
            }
            reactionPickerEl.classList.add('hide');
        });
    });
}

// Show reaction picker
function showReactionPicker(messageId, button) {
    messageContextMenuMessageId = messageId;
    const rect = button.getBoundingClientRect();
    reactionPickerEl.classList.remove('hide');
    reactionPickerEl.style.left = rect.left + 'px';
    reactionPickerEl.style.top = (rect.top - 60) + 'px';
}

// Show emoji picker for chat input
function showEmojiPicker(button) {
    if (!emojiPickerEl) return;
    
    // Show the picker first to get its actual dimensions
    emojiPickerEl.classList.remove('hide');
    
    // Force a reflow to ensure dimensions are calculated
    emojiPickerEl.offsetHeight;
    
    // Get button position relative to viewport
    const rect = button.getBoundingClientRect();
    const pickerWidth = emojiPickerEl.offsetWidth || 300;
    const pickerHeight = emojiPickerEl.offsetHeight || 250;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10; // Padding from edges
    
    // Calculate position - try to position above the button, aligned to the right
    let left = rect.right - pickerWidth;
    let top = rect.top - pickerHeight - padding;
    
    // If it would go off the top of the screen, position it below instead
    if (top < padding) {
        top = rect.bottom + padding;
    }
    
    // If it would go off the bottom of the screen, position it above
    if (top + pickerHeight > viewportHeight - padding) {
        top = rect.top - pickerHeight - padding;
        // If still off screen, position at top of viewport
        if (top < padding) {
            top = padding;
        }
    }
    
    // If it would go off the right edge, align to the right edge of the screen
    if (left < padding) {
        left = padding;
    }
    
    // If it would go off the left edge, align to the left edge of the button
    if (left + pickerWidth > viewportWidth - padding) {
        left = viewportWidth - pickerWidth - padding;
        // If still off screen, align to left edge of button
        if (left < rect.left) {
            left = rect.left;
        }
    }
    
    // Ensure it doesn't go off screen on any side
    left = Math.max(padding, Math.min(left, viewportWidth - pickerWidth - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - pickerHeight - padding));
    
    // Apply the calculated position using fixed positioning
    emojiPickerEl.style.left = left + 'px';
    emojiPickerEl.style.top = top + 'px';
    emojiPickerEl.style.right = 'auto';
    emojiPickerEl.style.bottom = 'auto';
}

// Report a message
function reportMessage(messageId) {
    const reason = prompt('Why are you reporting this message? (Optional)');
    // In a real implementation, you'd save this to Firestore or send to admins
    showToast('Message reported. Thank you for keeping the community safe.');
    // Message reported (reason logged for moderation)
}

// Utility functions
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

function scrollToBottom() {
    if (chatMessagesEl) {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
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

// Show user profile popup
async function showUserProfile(userId) {
    if (!userProfilePopupEl || !currentUser) return;
    
    // Don't show profile for current user (they can use their own profile page)
    if (userId === currentUser.uid) {
        window.location.href = '/generator/';
        return;
    }
    
    try {
        // Show loading state
        userProfilePopupEl.classList.remove('hide');
        document.getElementById('userProfilePopupName').textContent = 'Loading...';
        document.getElementById('userProfilePopupCountryValue').textContent = '—';
        document.getElementById('userProfilePopupXAccountValue').textContent = '—';
        document.getElementById('userProfilePopupBio').textContent = 'Loading profile...';
        document.getElementById('userProfilePopupVerified').classList.add('hide');
        
        // Fetch user profile from Firestore
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
            document.getElementById('userProfilePopupName').textContent = 'User not found';
            document.getElementById('userProfilePopupBio').textContent = 'This user profile could not be loaded.';
            return;
        }
        
        const userData = userDoc.data();
        
        // Update popup with user data
        const nameEl = document.getElementById('userProfilePopupName');
        const bannerImgEl = document.getElementById('userProfilePopupBannerImg');
        const countryEl = document.getElementById('userProfilePopupCountryValue');
        const xAccountEl = document.getElementById('userProfilePopupXAccountValue');
        const bioEl = document.getElementById('userProfilePopupBio');
        const verifiedEl = document.getElementById('userProfilePopupVerified');
        
        // Name
        nameEl.textContent = userData.username || 'Anonymous';
        
        // Banner
        const bannerImage = userData.bannerImage || '/pfp_apes/bg1.png';
        bannerImgEl.src = bannerImage;
        bannerImgEl.dataset.fallback = '/pfp_apes/bg1.png';
        
        // Add error handling for banner image
        bannerImgEl.addEventListener('error', function() {
            const fallback = this.dataset.fallback || '/pfp_apes/bg1.png';
            if (this.src !== fallback) {
                this.src = fallback;
            }
        });
        
        // Country
        if (userData.country) {
            countryEl.textContent = userData.country;
        } else {
            countryEl.textContent = '—';
        }
        
        // X Account - check both xAccount and profileXAccount field names
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
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        document.getElementById('userProfilePopupName').textContent = 'Error';
        document.getElementById('userProfilePopupBio').textContent = 'Failed to load user profile.';
    }
}

function showToast(message) {
    // Simple toast notification
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

// Cleanup on logout
function cleanupChat() {
    if (messagesListener) {
        messagesListener();
        messagesListener = null;
    }
    if (typingListener) {
        typingListener();
        typingListener = null;
    }
    if (presenceListener) {
        presenceListener();
        presenceListener = null;
    }
    if (presenceUpdateInterval) {
        clearInterval(presenceUpdateInterval);
        presenceUpdateInterval = null;
    }
    if (lastSeenUpdateInterval) {
        clearInterval(lastSeenUpdateInterval);
        lastSeenUpdateInterval = null;
    }
    clearTypingIndicator();
    if (currentUser) {
        updatePresence(false);
    }
}

// Chat page initialized
