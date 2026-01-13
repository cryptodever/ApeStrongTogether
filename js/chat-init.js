/**
 * Chat Page Initialization Module
 * Handles real-time chat functionality with Firestore
 */

import { auth, db, app } from './firebase.js';
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
    deleteDoc,
    writeBatch,
    startAfter
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// Constants
const MESSAGES_PER_PAGE = 30; // Reduced to load only recent messages
const MAX_MESSAGE_LENGTH = 1000;
// Rate limits per channel (in seconds)
const RATE_LIMITS = {
    'general': 15,
    'raid': 15,
    'trading': 15,
    'support': 30 // Support chat has longer cooldown to prevent spam
};

// Get rate limit for current channel
function getRateLimitSeconds() {
    return RATE_LIMITS[currentChannel] || 15; // Default to 15 seconds
}
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
let isInitialSnapshot = true; // Flag to track if we're handling the initial snapshot
let loadedMessageIds = new Set(); // Track which messages have been loaded
let oldestMessageDoc = null; // Track oldest message document for pagination
let isLoadingOlderMessages = false; // Flag to prevent multiple simultaneous loads
let hasMoreMessages = true; // Flag to track if there are more messages to load
// Default community ID
const DEFAULT_COMMUNITY_ID = 'default';

// Available channels (will be loaded from default community)
let AVAILABLE_CHANNELS = [
    { id: 'general', name: 'GENERAL', emoji: '💬' },
    { id: 'raid', name: 'RAID', emoji: '⚔️' },
    { id: 'trading', name: 'TRADING', emoji: '📈' },
    { id: 'support', name: 'SUPPORT', emoji: '🆘' }
];

// Get channel from localStorage or default to 'general'
let currentChannel = localStorage.getItem('selectedChannel') || 'general';
let currentCommunityId = localStorage.getItem('selectedCommunity') || DEFAULT_COMMUNITY_ID; // Default to default community
let messageContextMenuMessageId = null;
let userCommunities = []; // Communities user is a member of

// DOM Elements
let chatMessagesEl, chatInputEl, sendBtn, chatLoadingEl, chatEmptyEl;
let chatTypingEl, typingTextEl, charCountEl, rateLimitInfoEl;
let chatUserListEl, onlineCountEl;
let messageContextMenuEl, reactionPickerEl, emojiPickerEl;
let userProfilePopupEl, userProfilePopupOverlayEl, userProfilePopupCloseEl;
let apePriceEl, apeChangeEl, onlineCounterEl, raidTimerEl;
let currentChannelNameEl, currentChannelDescEl;

// Initialize auth gate for chat page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Chat init: Auth gate initialization error:', error);
    }
})();

// Owner username check
const OWNER_USERNAME = 'apelover69';

// Check if current user is owner
function isOwner() {
    if (!userProfile || !userProfile.username) return false;
    return userProfile.username.toLowerCase() === OWNER_USERNAME.toLowerCase();
}

// Initialize chat when auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserProfile();
        
        // Check if user is owner
        if (isOwner()) {
            // Owner can see chat
            showChatInterface();
            initializeChat();
        } else {
            // Non-owners see maintenance message
            showMaintenanceMessage();
        }
    } else {
        currentUser = null;
        userProfile = null;
        cleanupChat();
        showMaintenanceMessage();
    }
});

// Show maintenance message
function showMaintenanceMessage() {
    const maintenanceEl = document.getElementById('chatMaintenanceMessage');
    const chatContainer = document.querySelector('.chat-container');
    
    if (maintenanceEl) {
        maintenanceEl.classList.remove('hide');
    }
    
    if (chatContainer) {
        chatContainer.classList.add('hide');
    }
    
    if (document.querySelector('.chat-utility-bar')) {
        document.querySelector('.chat-utility-bar').classList.add('hide');
    }
}

// Show chat interface (owner only)
function showChatInterface() {
    const maintenanceEl = document.getElementById('chatMaintenanceMessage');
    const chatContainer = document.querySelector('.chat-container');
    
    if (maintenanceEl) {
        maintenanceEl.classList.add('hide');
    }
    
    if (chatContainer) {
        chatContainer.classList.remove('hide');
    }
    
    if (document.querySelector('.chat-utility-bar')) {
        document.querySelector('.chat-utility-bar').classList.remove('hide');
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
async function initializeChat() {
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
    
    // Utility bar elements
    apePriceEl = document.getElementById('apePrice');
    apeChangeEl = document.getElementById('apeChange');
    onlineCounterEl = document.getElementById('onlineCounter');
    raidTimerEl = document.getElementById('raidTimer');
    currentChannelNameEl = document.getElementById('currentChannelName');
    currentChannelDescEl = document.getElementById('currentChannelDesc');

    if (!chatMessagesEl || !chatInputEl || !sendBtn) {
        console.error('Chat DOM elements not found');
        return;
    }

    // Ensure default community exists and load channels
    await ensureDefaultCommunity();
    
    // Set default community if not set
    if (!currentCommunityId) {
        currentCommunityId = DEFAULT_COMMUNITY_ID;
        localStorage.setItem('selectedCommunity', DEFAULT_COMMUNITY_ID);
    }

    // Setup channel switcher
    setupChannelSwitcher();
    setupMobileChannelList();
    
    // Setup mobile drawer
    setupMobileDrawer();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize utility bar
    initializeUtilityBar();
    
    // Update channel info
    updateChannelInfo();
    
    // Load messages
    loadMessages();
    
    // Setup real-time listeners
    setupRealtimeListeners();
    
    // Setup presence
    setupPresence();
    
    // Setup typing indicator
    setupTypingIndicator();
    
    // Setup user profile popup
    setupUserProfilePopup();
    
    // Setup mobile swipe gestures
    setupMobileSwipe();
}

// Update channel switcher (called by community module)
async function updateChannelSwitcher() {
    // Load user communities if community module is available
    if (window.communityModule && window.communityModule.loadUserCommunities) {
        await window.communityModule.loadUserCommunities();
        if (window.communityModule.userCommunities) {
            userCommunities = window.communityModule.userCommunities || [];
        }
    }
    setupChannelSwitcher();
    setupMobileChannelList();
}

// Export for use by community-init.js
window.updateChannelSwitcher = updateChannelSwitcher;

// Setup channel switcher UI
async function setupChannelSwitcher() {
    const channelButtonsEl = document.getElementById('channelButtons');
    const channelButtonsMobileEl = document.getElementById('channelButtonsMobile');
    
    // Load user communities if available
    if (window.communityModule && window.communityModule.userCommunities) {
        userCommunities = window.communityModule.userCommunities || [];
    }
    
    // Desktop channel buttons
    if (channelButtonsEl) {
        channelButtonsEl.innerHTML = '';
        AVAILABLE_CHANNELS.forEach(channel => {
            const isActive = !currentCommunityId && channel.id === currentChannel;
            const button = document.createElement('button');
            button.className = `channel-button ${isActive ? 'active' : ''}`;
            button.setAttribute('data-channel', channel.id);
            button.innerHTML = `<span class="channel-emoji">${channel.emoji}</span> <span class="channel-name">${channel.name}</span>`;
            button.addEventListener('click', () => switchChannel(channel.id));
            channelButtonsEl.appendChild(button);
        });
        
        // Add user communities if any
        if (userCommunities && userCommunities.length > 0) {
            userCommunities.forEach(community => {
                const isActive = currentCommunityId === community.id;
                const button = document.createElement('button');
                button.className = `channel-button community-button ${isActive ? 'active' : ''}`;
                button.setAttribute('data-community', community.id);
                button.innerHTML = `<span class="channel-emoji">🦍</span> <span class="channel-name">${escapeHtml(community.name)}</span> <span class="member-count">(${community.memberCount || 0})</span>`;
                button.addEventListener('click', () => switchToCommunity(community.id));
                channelButtonsEl.appendChild(button);
            });
        }
    }
    
    // Mobile channel buttons
    if (channelButtonsMobileEl) {
        channelButtonsMobileEl.innerHTML = '';
        AVAILABLE_CHANNELS.forEach(channel => {
            const isActive = !currentCommunityId && channel.id === currentChannel;
            const button = document.createElement('button');
            button.className = `channel-button ${isActive ? 'active' : ''}`;
            button.setAttribute('data-channel', channel.id);
            button.innerHTML = `<span class="channel-emoji">${channel.emoji}</span> <span class="channel-name">${channel.name}</span>`;
            button.addEventListener('click', () => switchChannel(channel.id));
            channelButtonsMobileEl.appendChild(button);
        });
    }
}

// Setup mobile channel list in drawer
function setupMobileChannelList() {
    const mobileChannelsEl = document.getElementById('chatMobileChannels');
    if (!mobileChannelsEl) return;
    
    // Load user communities if available
    if (window.communityModule && window.communityModule.userCommunities) {
        userCommunities = window.communityModule.userCommunities || [];
    }
    
    mobileChannelsEl.innerHTML = '';
    
    // Add public channels
    AVAILABLE_CHANNELS.forEach(channel => {
        const isActive = !currentCommunityId && channel.id === currentChannel;
        const item = document.createElement('div');
        item.className = `chat-mobile-channel-item ${isActive ? 'active' : ''}`;
        item.setAttribute('data-channel', channel.id);
        item.innerHTML = `
            <span class="channel-emoji chat-mobile-drawer-emoji">${channel.emoji}</span>
            <span class="channel-name chat-mobile-drawer-name">${channel.name}</span>
        `;
        item.addEventListener('click', () => {
            switchChannel(channel.id);
            closeMobileDrawer();
        });
        mobileChannelsEl.appendChild(item);
    });
    
    // Add user communities if any
    if (userCommunities && userCommunities.length > 0) {
        userCommunities.forEach(community => {
            const isActive = currentCommunityId === community.id;
            const item = document.createElement('div');
            item.className = `chat-mobile-channel-item community-item ${isActive ? 'active' : ''}`;
            item.setAttribute('data-community', community.id);
            item.innerHTML = `
                <span class="channel-emoji chat-mobile-drawer-emoji">🦍</span>
                <span class="channel-name chat-mobile-drawer-name">${escapeHtml(community.name)}</span>
                <span class="channel-member-count">${community.memberCount || 0}</span>
            `;
            item.addEventListener('click', () => {
                switchToCommunity(community.id);
                closeMobileDrawer();
            });
            mobileChannelsEl.appendChild(item);
        });
    }
}

// Setup mobile drawer
function setupMobileDrawer() {
    const menuBtn = document.getElementById('chatMenuBtn');
    const drawerOverlay = document.getElementById('chatDrawerOverlay');
    const drawer = document.getElementById('chatMobileDrawer');
    const drawerClose = document.getElementById('chatDrawerClose');
    const drawerTabs = document.querySelectorAll('.chat-drawer-tab');
    const drawerPanels = document.querySelectorAll('.chat-drawer-panel');
    
    if (!menuBtn || !drawer || !drawerOverlay) return;
    
    // Open drawer
    menuBtn.addEventListener('click', () => {
        openMobileDrawer();
    });
    
    // Close drawer
    if (drawerClose) {
        drawerClose.addEventListener('click', () => {
            closeMobileDrawer();
        });
    }
    
    // Close drawer on overlay click
    drawerOverlay.addEventListener('click', () => {
        closeMobileDrawer();
    });
    
    // Drawer tab switching
    drawerTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Update active tab
            drawerTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active panel
            drawerPanels.forEach(p => {
                if (p.getAttribute('data-panel') === targetTab) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            });
        });
    });
}

// Open mobile drawer
function openMobileDrawer() {
    const drawerOverlay = document.getElementById('chatDrawerOverlay');
    const drawer = document.getElementById('chatMobileDrawer');
    
    if (drawerOverlay && drawer) {
        drawerOverlay.classList.remove('hide');
        drawer.classList.remove('hide');
        document.body.style.overflow = 'hidden';
    }
}

// Close mobile drawer
function closeMobileDrawer() {
    const drawerOverlay = document.getElementById('chatDrawerOverlay');
    const drawer = document.getElementById('chatMobileDrawer');
    
    if (drawerOverlay && drawer) {
        drawerOverlay.classList.add('hide');
        drawer.classList.add('hide');
        document.body.style.overflow = '';
    }
}

// Update mobile header channel name
function updateMobileChannelName() {
    const mobileChannelNameEl = document.getElementById('chatMobileChannelName');
    if (!mobileChannelNameEl) return;
    
    const channel = AVAILABLE_CHANNELS.find(c => c.id === currentChannel);
    if (channel) {
        mobileChannelNameEl.textContent = `${channel.emoji} ${channel.name}`;
    }
}

// Update mobile header online count
function updateMobileOnlineCount() {
    const mobileOnlineCountEl = document.getElementById('chatMobileOnlineCount');
    if (!mobileOnlineCountEl || !onlineCountEl) return;
    
    const count = parseInt(onlineCountEl.textContent) || 0;
    mobileOnlineCountEl.textContent = count;
}

// Initialize utility bar
function initializeUtilityBar() {
    // Update online counter (will be updated by presence system)
    if (onlineCounterEl && onlineCountEl) {
        const count = parseInt(onlineCountEl.textContent) || 0;
        onlineCounterEl.textContent = count;
    }
    
    // Initialize APE price (mock for now - can be replaced with real API)
    updateApePrice();
    setInterval(updateApePrice, 30000); // Update every 30 seconds
    
    // Initialize raid timer
    updateRaidTimer();
    setInterval(updateRaidTimer, 1000); // Update every second
}

// Update APE price (mock implementation)
function updateApePrice() {
    if (!apePriceEl || !apeChangeEl) return;
    
    // Mock price - replace with real API call
    const mockPrice = 0.00123 + (Math.random() - 0.5) * 0.0001;
    const mockChange = (Math.random() - 0.5) * 0.1;
    
    apePriceEl.textContent = `$${mockPrice.toFixed(5)}`;
    apeChangeEl.textContent = `${mockChange >= 0 ? '+' : ''}${mockChange.toFixed(2)}%`;
    apeChangeEl.className = `utility-change ${mockChange >= 0 ? 'positive' : 'negative'}`;
}

// Update raid timer
function updateRaidTimer() {
    if (!raidTimerEl) return;
    
    // Mock raid timer - replace with real logic
    const lastRaid = localStorage.getItem('lastRaidTime');
    if (!lastRaid) {
        raidTimerEl.textContent = '--:--';
        return;
    }
    
    const now = Date.now();
    const elapsed = Math.floor((now - parseInt(lastRaid)) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    if (minutes > 60) {
        raidTimerEl.textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    } else {
        raidTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

// Update channel info display
async function updateChannelInfo() {
    if (!currentChannelNameEl || !currentChannelDescEl) return;
    
    // Check if we're in a community
    if (currentCommunityId) {
        try {
            const communityDoc = await getDoc(doc(db, 'communities', currentCommunityId));
            if (communityDoc.exists()) {
                const communityData = communityDoc.data();
                currentChannelNameEl.textContent = communityData.name || 'Community';
                currentChannelDescEl.textContent = communityData.description || 'Community chat';
                
                // Update mobile
                const mobileChannelNameEl = document.getElementById('currentChannelNameMobile');
                const mobileChannelDescEl = document.getElementById('currentChannelDescMobile');
                if (mobileChannelNameEl) mobileChannelNameEl.textContent = communityData.name || 'Community';
                if (mobileChannelDescEl) mobileChannelDescEl.textContent = communityData.description || 'Community chat';
                
                updateMobileChannelName();
                return;
            }
        } catch (error) {
            console.error('Error loading community info:', error);
        }
    }
    
    // Global channel
    const channel = AVAILABLE_CHANNELS.find(c => c.id === currentChannel);
    if (!channel) return;
    
    const channelDescriptions = {
        'general': 'General discussion for the Ape community',
        'raid': 'Coordinate raids and community actions',
        'trading': 'Share trading tips and market insights',
        'support': 'Get help and support from the community'
    };
    
    currentChannelNameEl.textContent = channel.name;
    currentChannelDescEl.textContent = channelDescriptions[channel.id] || 'Channel description';
    
    // Update mobile channel info
    const mobileChannelNameEl = document.getElementById('currentChannelNameMobile');
    const mobileChannelDescEl = document.getElementById('currentChannelDescMobile');
    if (mobileChannelNameEl) mobileChannelNameEl.textContent = channel.name;
    if (mobileChannelDescEl) mobileChannelDescEl.textContent = channelDescriptions[channel.id] || 'Channel description';
    
    // Update mobile header channel name
    updateMobileChannelName();
}

// Setup mobile swipe gestures
function setupMobileSwipe() {
    if (window.innerWidth > 768) return; // Only on mobile
    
    const chatMainPanel = document.querySelector('.chat-main-panel');
    if (!chatMainPanel) return;
    
    let touchStartX = 0;
    let touchEndX = 0;
    
    chatMainPanel.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    chatMainPanel.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            const currentIndex = AVAILABLE_CHANNELS.findIndex(c => c.id === currentChannel);
            if (diff > 0 && currentIndex < AVAILABLE_CHANNELS.length - 1) {
                // Swipe left - next channel
                switchChannel(AVAILABLE_CHANNELS[currentIndex + 1].id);
            } else if (diff < 0 && currentIndex > 0) {
                // Swipe right - previous channel
                switchChannel(AVAILABLE_CHANNELS[currentIndex - 1].id);
            }
        }
    }
}

// Switch to a community chat
async function switchToCommunity(communityId) {
    if (!currentUser) {
        alert('You must be logged in to access communities');
        return;
    }
    
    // Verify membership
    const isMember = await verifyCommunityMembership(communityId);
    if (!isMember) {
        alert('You must be a member to access this community');
        // Optionally open join modal
        if (window.communityModule?.openCommunityJoinModal) {
            window.communityModule.openCommunityJoinModal();
        }
        return;
    }
    
    try {
        // Update state
        currentCommunityId = communityId;
        currentChannel = 'community'; // Special channel type for communities
        localStorage.setItem('selectedCommunity', communityId);
        localStorage.setItem('selectedChannel', 'community');
        
        // Remove old listeners
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
        
        // Clear typing indicator
        clearTypingIndicator();
        
        // Clear current messages and tracked message IDs
        if (chatMessagesEl) {
            chatMessagesEl.innerHTML = '';
        }
        loadedMessageIds.clear();
        isInitialSnapshot = true;
        oldestMessageDoc = null;
        hasMoreMessages = true;
        isLoadingOlderMessages = false;
        
        // Remove scroll listener
        if (chatMessagesEl) {
            chatMessagesEl.removeEventListener('scroll', handleScroll);
        }
        
        // Show loading
        if (chatLoadingEl) {
            chatLoadingEl.classList.remove('hide');
        }
        if (chatEmptyEl) {
            chatEmptyEl.classList.add('hide');
        }
        
        // Update UI
        setupChannelSwitcher();
        setupMobileChannelList();
        updateChannelInfo();
        updateMobileChannelName();
        
        // Reload messages for community
        loadMessages();
        
        // Setup real-time listeners
        setupRealtimeListeners();
        setupTypingIndicator();
        setupPresence();
        
        // Update presence
        updatePresence(true);
        
        // Close mobile drawer if open
        const drawerOverlay = document.getElementById('chatDrawerOverlay');
        const drawer = document.getElementById('chatMobileDrawer');
        if (drawerOverlay && drawer && !drawerOverlay.classList.contains('hide')) {
            closeMobileDrawer();
        }
    } catch (error) {
        console.error('Error switching to community:', error);
        alert('Failed to switch to community');
    }
}

// Export for use by community-init.js
window.switchToCommunity = switchToCommunity;

// Switch to a different channel
async function switchChannel(channelId) {
    // If it's a community ID (starts with 'community-'), handle separately
    if (channelId && channelId.startsWith('community-')) {
        const communityId = channelId.replace('community-', '');
        switchToCommunity(communityId);
        return;
    }
    
    // Ensure default community
    if (!currentCommunityId) {
        currentCommunityId = DEFAULT_COMMUNITY_ID;
        await ensureDefaultCommunity();
    }
    
    if (channelId === currentChannel && currentCommunityId === DEFAULT_COMMUNITY_ID) return;
    
    // Validate channel exists
    const channel = AVAILABLE_CHANNELS.find(c => c.id === channelId);
    if (!channel) {
        console.error('Invalid channel:', channelId);
        return;
    }
    
    // Update current channel (within default community)
    currentChannel = channelId;
    currentCommunityId = DEFAULT_COMMUNITY_ID;
    localStorage.setItem('selectedChannel', channelId);
    localStorage.setItem('selectedCommunity', DEFAULT_COMMUNITY_ID);
    
    // Update UI
    setupChannelSwitcher();
    setupMobileChannelList();
    updateChannelInfo();
    
    // Clear current messages and tracked message IDs
    if (chatMessagesEl) {
        chatMessagesEl.innerHTML = '';
    }
    loadedMessageIds.clear();
    isInitialSnapshot = true;
    oldestMessageDoc = null;
    hasMoreMessages = true;
    isLoadingOlderMessages = false;
    
    // Remove scroll listener
    if (chatMessagesEl) {
        chatMessagesEl.removeEventListener('scroll', handleScroll);
    }
    
    // Remove old listeners
    if (messagesListener) {
        messagesListener();
        messagesListener = null;
    }
    if (typingListener) {
        typingListener();
        typingListener = null;
    }
    
    // Clear typing indicator
    clearTypingIndicator();
    
    // Show loading
    if (chatLoadingEl) {
        chatLoadingEl.classList.remove('hide');
    }
    if (chatEmptyEl) {
        chatEmptyEl.classList.add('hide');
    }
    
    // Reload messages and setup listeners for new channel
    loadMessages();
    setupRealtimeListeners();
    setupTypingIndicator();
    
    // Update presence with new channel
    updatePresence(true);
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
    
    // Sticker button - insert ape sticker (🦍)
    const stickerBtn = document.getElementById('stickerBtn');
    if (stickerBtn) {
        stickerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Insert ape emoji
            insertTextAtCursor(chatInputEl, '🦍');
            chatInputEl.focus();
            // Trigger input event to update character count
            chatInputEl.dispatchEvent(new Event('input', { bubbles: true }));
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
    setupFollowModals();
    
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
        chatInputEl.style.setProperty('height', 'auto');
        chatInputEl.style.setProperty('height', Math.min(chatInputEl.scrollHeight, 150) + 'px');
    });
}

// Load messages from Firestore
async function loadMessages() {
    if (!currentUser) return;

    // Ensure default community exists and user is a member
    await ensureDefaultCommunity();
    
    // Use default community if not set
    if (!currentCommunityId) {
        currentCommunityId = DEFAULT_COMMUNITY_ID;
        localStorage.setItem('selectedCommunity', DEFAULT_COMMUNITY_ID);
    }

    // Reset pagination state
    oldestMessageDoc = null;
    hasMoreMessages = true;
    isLoadingOlderMessages = false;

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

    // Verify membership
    const memberRef = doc(db, 'communities', currentCommunityId, 'members', currentUser.uid);
    const memberDoc = await getDoc(memberRef);
    if (!memberDoc.exists()) {
        // Auto-join user
        await autoJoinDefaultCommunity(currentUser.uid);
    }
    
    // Query messages from community messages subcollection
    const messagesRef = collection(db, 'communities', currentCommunityId, 'messages');
    const q = query(
        messagesRef,
        where('channelId', '==', currentChannel),
        where('deleted', '==', false),
        orderBy('timestamp', 'desc'),
        limit(MESSAGES_PER_PAGE)
    );

    getDocs(q).then((snapshot) => {
        clearTimeout(loadingTimeout);
        chatLoadingEl.classList.add('hide');
        
        if (snapshot.empty) {
            chatEmptyEl.classList.remove('hide');
            hasMoreMessages = false;
            return;
        }

        chatEmptyEl.classList.add('hide');
        
        // Check if there might be more messages
        hasMoreMessages = snapshot.docs.length === MESSAGES_PER_PAGE;
        
        // Store oldest message document for pagination
        if (snapshot.docs.length > 0) {
            oldestMessageDoc = snapshot.docs[snapshot.docs.length - 1];
        }
        
        // Reverse to show oldest first (newest at bottom)
        const messages = snapshot.docs.reverse();
        messages.forEach((doc) => {
            loadedMessageIds.add(doc.id);
            displayMessage(doc.id, doc.data());
        });

        scrollToBottom();
        setupScrollListener();
    }).catch((error) => {
        clearTimeout(loadingTimeout);
        console.error('Error loading messages:', error);
        chatLoadingEl.classList.add('hide');
        chatEmptyEl.classList.remove('hide');
        chatEmptyEl.innerHTML = `
            <div class="chat-empty-icon">⚠️</div>
            <h3>Unable to load messages</h3>
            <p>There was an error loading messages. Please check your connection and refresh the page.</p>
            <p class="chat-error-detail">Error: ${escapeHtml(error.message)}</p>
        `;
    });
}

// Load older messages when scrolling to top
async function loadOlderMessages() {
    if (!currentUser || isLoadingOlderMessages || !hasMoreMessages || !oldestMessageDoc) {
        return;
    }

    if (!currentCommunityId) {
        currentCommunityId = DEFAULT_COMMUNITY_ID;
    }

    isLoadingOlderMessages = true;
    
    try {
        // Query messages from community messages subcollection
        const messagesRef = collection(db, 'communities', currentCommunityId, 'messages');
        const q = query(
            messagesRef,
            where('channelId', '==', currentChannel),
            where('deleted', '==', false),
            orderBy('timestamp', 'desc'),
            startAfter(oldestMessageDoc),
            limit(MESSAGES_PER_PAGE)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            hasMoreMessages = false;
            isLoadingOlderMessages = false;
            return;
        }

        // Check if there might be more messages
        hasMoreMessages = snapshot.docs.length === MESSAGES_PER_PAGE;

        // Store new oldest message document
        if (snapshot.docs.length > 0) {
            oldestMessageDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        // Store scroll position before adding messages
        const scrollContainer = chatMessagesEl;
        const previousScrollHeight = scrollContainer.scrollHeight;
        const previousScrollTop = scrollContainer.scrollTop;

        // Reverse to show oldest first, then prepend to container
        const messagesToAdd = snapshot.docs.reverse();
        
        messagesToAdd.forEach((doc) => {
            if (!loadedMessageIds.has(doc.id)) {
                loadedMessageIds.add(doc.id);
                const messageEl = document.createElement('div');
                messageEl.innerHTML = ''; // Will be set by displayMessage
                displayMessage(doc.id, doc.data(), true); // true = prepend
            }
        });

        // Restore scroll position after a brief delay to allow DOM updates
        setTimeout(() => {
            const newScrollHeight = scrollContainer.scrollHeight;
            scrollContainer.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
        }, 0);

        isLoadingOlderMessages = false;

    } catch (error) {
        console.error('Error loading older messages:', error);
        isLoadingOlderMessages = false;
        hasMoreMessages = false;
    }
}

// Setup scroll listener for loading older messages
function setupScrollListener() {
    if (!chatMessagesEl) return;

    // Remove existing listener if any
    chatMessagesEl.removeEventListener('scroll', handleScroll);
    
    chatMessagesEl.addEventListener('scroll', handleScroll, { passive: true });
}

let scrollTimeout = null;
function handleScroll() {
    if (!chatMessagesEl || isLoadingOlderMessages || !hasMoreMessages) return;

    // Throttle scroll events
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        
        // Load more when scrolled near the top (within 200px)
        if (chatMessagesEl.scrollTop < 200) {
            loadOlderMessages();
        }
    }, 100);
}

// Setup real-time message listener
async function setupRealtimeListeners() {
    if (!currentUser) return;

    // Ensure default community
    if (!currentCommunityId) {
        currentCommunityId = DEFAULT_COMMUNITY_ID;
        await ensureDefaultCommunity();
    }

    // Query messages from community messages subcollection
    const messagesRef = collection(db, 'communities', currentCommunityId, 'messages');
    const q = query(
        messagesRef,
        where('channelId', '==', currentChannel),
        where('deleted', '==', false),
        orderBy('timestamp', 'desc'),
        limit(MESSAGES_PER_PAGE)
    );

    messagesListener = onSnapshot(q, (snapshot) => {
        // Handle initial snapshot - ignore it since loadMessages() already loaded these
        if (isInitialSnapshot) {
            isInitialSnapshot = false;
            // Mark all messages in initial snapshot as loaded
            snapshot.docs.forEach((doc) => {
                loadedMessageIds.add(doc.id);
            });
            return;
        }
        
        // Only handle new/modified messages after initial load
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                // Skip if already loaded or already displayed
                if (loadedMessageIds.has(change.doc.id)) {
                    return;
                }
                const existingMsg = document.getElementById(`msg-${change.doc.id}`);
                if (!existingMsg) {
                    loadedMessageIds.add(change.doc.id);
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
            // Check if typing matches current channel/community
            const matchesChannel = currentCommunityId 
                ? data.channel === `community_${currentCommunityId}`
                : data.channel === currentChannel;
            
            if (matchesChannel && data.userId !== currentUser.uid) {
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

    // Setup presence listener for online users (optimized: only load recently active users)
    // This reduces Firestore reads significantly by limiting to users active in last 5 minutes
    const presenceRef = collection(db, 'presence');
    const fiveMinutesAgo = Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
    const presenceQuery = query(
        presenceRef,
        where('lastSeen', '>=', fiveMinutesAgo),
        orderBy('lastSeen', 'desc'),
        limit(100) // Cap at 100 most recently active users
    );
    presenceListener = onSnapshot(presenceQuery, async (snapshot) => {
        const onlineUsers = [];
        const now = Date.now();
        
        // Add current user first
        if (currentUser && userProfile) {
            // Get current user's presence data
            const currentUserPresenceRef = doc(db, 'presence', currentUser.uid);
            const currentUserPresenceDoc = await getDoc(currentUserPresenceRef);
            const currentUserPresence = currentUserPresenceDoc.exists() ? currentUserPresenceDoc.data() : null;
            
            onlineUsers.push({
                userId: currentUser.uid,
                username: userProfile.username || currentUser.email?.split('@')[0] || 'You',
                bannerImage: userProfile.bannerImage || '/pfp_apes/bg1.png',
                xAccountVerified: userProfile.xAccountVerified || false,
                online: true,
                lastSeen: currentUserPresence?.lastSeen || Timestamp.now(),
                isOnline: true
            });
        }
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId === currentUser.uid) return; // Skip current user (already added above)
            
            // Check if user is online (only if explicitly marked as online AND recently updated)
            // Also check if they were recently active (within 2 minutes) to show in list
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
            const isRecentlyActive = timeSinceLastSeen < PRESENCE_TIMEOUT * 4; // 2 minutes - show in list if recently active
            
            // Only mark as online if:
            // 1. Explicitly set to true in data.online
            // 2. AND last seen is within the presence timeout (30 seconds)
            // This prevents showing users as online if their browser crashed or they closed the tab
            const isOnline = data.online === true && timeSinceLastSeen < PRESENCE_TIMEOUT;
            
            // Show in list if online OR recently active (but mark online status correctly)
            if (isOnline || isRecentlyActive) {
                onlineUsers.push({
                    ...data,
                    lastSeen: data.lastSeen,
                    isOnline: isOnline // Only true if explicitly online AND recently seen
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
        const count = onlineUsers.length;
        if (onlineCountEl) onlineCountEl.textContent = count;
        if (onlineCounterEl) onlineCounterEl.textContent = count;
        updateMobileOnlineCount();
        
        // Update last seen times every minute for real-time updates
        if (!lastSeenUpdateInterval) {
            lastSeenUpdateInterval = setInterval(() => {
                updateOnlineUsersList(currentOnlineUsers);
            }, 60000); // Update every minute
        }
    });
}

// Display a message in the chat
function displayMessage(messageId, messageData, prepend = false) {
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
                ${(messageData.username || '').toLowerCase() === 'apelover69' ? '<span class="owner-badge" title="Owner">OWNER</span>' : ''}
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

    if (prepend) {
        chatMessagesEl.insertBefore(messageEl, chatMessagesEl.firstChild);
    } else {
        chatMessagesEl.appendChild(messageEl);
    }
    
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
    
    // Add event listener for clickable username - navigate to profile
    const usernameEl = messageEl.querySelector('.clickable-username');
    if (usernameEl) {
        usernameEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const userId = usernameEl.dataset.userId;
            if (userId) {
                window.location.href = `/profile/?user=${userId}`;
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

    // Check if user is muted
    if (userProfile.mutedUntil) {
        const mutedUntil = userProfile.mutedUntil.toMillis ? userProfile.mutedUntil.toMillis() : new Date(userProfile.mutedUntil).getTime();
        const now = Date.now();
        if (mutedUntil > now) {
            const remainingMinutes = Math.ceil((mutedUntil - now) / (1000 * 60));
            alert(`You are muted. You cannot send messages for ${remainingMinutes} more minute${remainingMinutes > 1 ? 's' : ''}.`);
            chatInputEl.value = '';
            return;
        } else {
            // Mute expired, clear it
            try {
                const userDocRef = doc(db, 'users', currentUser.uid);
                await updateDoc(userDocRef, {
                    mutedUntil: null
                });
                // Reload user profile
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    userProfile = { ...userProfile, ...userDoc.data() };
                }
            } catch (error) {
                console.error('Error clearing expired mute:', error);
            }
        }
    }

    // Check for admin commands (must start with /)
    if (text.startsWith('/')) {
        const commandParts = text.split(' ');
        const command = commandParts[0].toLowerCase();
        
        // Check if user is admin or moderator
        const isAdmin = userProfile.role === 'admin' || userProfile.role === 'moderator';
        
        if (!isAdmin) {
            alert('You do not have permission to use admin commands.');
            chatInputEl.value = '';
            return;
        }

        // Handle admin commands
        if (command === '/promote' && commandParts.length === 2) {
            const targetUsername = commandParts[1];
            await handlePromoteCommand(targetUsername);
            chatInputEl.value = '';
            return;
        } else if (command === '/mute' && commandParts.length === 3) {
            const targetUsername = commandParts[1];
            const minutes = parseInt(commandParts[2]);
            if (isNaN(minutes) || minutes <= 0) {
                alert('Invalid mute duration. Please provide a positive number of minutes.');
                chatInputEl.value = '';
                return;
            }
            await handleMuteCommand(targetUsername, minutes);
            chatInputEl.value = '';
            return;
        } else if (command === '/clear' && commandParts.length === 2) {
            const channelName = commandParts[1].toLowerCase();
            await handleClearCommand(channelName);
            chatInputEl.value = '';
            return;
        } else {
            alert('Unknown command. Available commands: /promote username, /mute username minutes, /clear chatname');
            chatInputEl.value = '';
            return;
        }
    }

    // Rate limiting with countdown timer (channel-specific)
    const rateLimitSeconds = getRateLimitSeconds();
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    if (timeSinceLastMessage < rateLimitSeconds * 1000) {
        const remaining = Math.ceil((rateLimitSeconds * 1000 - timeSinceLastMessage) / 1000);
        rateLimitInfoEl.textContent = `Please wait ${remaining} second${remaining > 1 ? 's' : ''} before sending another message`;
        rateLimitInfoEl.classList.remove('hide');
        rateLimitInfoEl.classList.add('warning');
        
        // Update countdown every second
        const countdownInterval = setInterval(() => {
            const timeLeft = Math.ceil((rateLimitSeconds * 1000 - (Date.now() - lastMessageTime)) / 1000);
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
        }, (rateLimitSeconds * 1000) - timeSinceLastMessage);
        
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
        // Verify membership in default community
        if (!currentCommunityId) {
            currentCommunityId = DEFAULT_COMMUNITY_ID;
        }
        
        const memberRef = doc(db, 'communities', currentCommunityId, 'members', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        if (!memberDoc.exists()) {
            // Auto-join user to default community
            await autoJoinDefaultCommunity(currentUser.uid);
        }
        
        // Store message in community messages subcollection
        const messagesRef = collection(db, 'communities', currentCommunityId, 'messages');
        const messageData = {
            text: text,
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
            avatarCount: userProfile.avatarCount || 0,
            bannerImage: userProfile.bannerImage || '',
            timestamp: serverTimestamp(),
            channelId: currentChannel || 'general', // Use channelId instead of channel
            deleted: false,
            reactions: {},
            xAccountVerified: userProfile.xAccountVerified || false
        };
        
        await addDoc(messagesRef, messageData);

        // Clear input
        chatInputEl.value = '';
        chatInputEl.style.setProperty('height', 'auto');
        charCountEl.textContent = `0/${MAX_MESSAGE_LENGTH}`;
        lastMessageTime = now;
        rateLimitInfoEl.classList.add('hide');
        rateLimitInfoEl.classList.remove('warning');

        // Clear typing indicator
        clearTypingIndicator();

        // Update presence when sending a message (mark as online)
        updatePresence(true);

        // Update quest progress for chat messages (works across all channels)
        // Tracks messages sent in any channel: General, Raid, Trading, or Support
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
        if (!currentCommunityId) {
            currentCommunityId = DEFAULT_COMMUNITY_ID;
        }
        const messageRef = doc(db, 'communities', currentCommunityId, 'messages', messageId);
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
        if (!currentCommunityId) {
            currentCommunityId = DEFAULT_COMMUNITY_ID;
        }
        const messageRef = doc(db, 'communities', currentCommunityId, 'messages', messageId);
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
        if (!currentCommunityId) {
            currentCommunityId = DEFAULT_COMMUNITY_ID;
        }
        const messageRef = doc(db, 'communities', currentCommunityId, 'messages', messageId);
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

    if (!currentCommunityId) {
        currentCommunityId = DEFAULT_COMMUNITY_ID;
    }

    try {
        const typingRef = doc(db, 'typing', currentUser.uid);
        // Format: communityId_channelId for typing indicator
        const typingChannel = currentCommunityId === DEFAULT_COMMUNITY_ID 
            ? currentChannel 
            : `${currentCommunityId}_${currentChannel}`;
        
        await setDoc(typingRef, {
            userId: currentUser.uid,
            username: userProfile.username || 'Anonymous',
            channel: typingChannel,
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

    // Update presence periodically (optimized: every 120 seconds / 2 minutes)
    // This reduces Firestore writes from ~2.88M/day to ~360K/day for 500 users
    presenceUpdateInterval = setInterval(() => {
        updatePresence(true);
    }, 120000); // 120 seconds (2 minutes)

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
            channel: currentCommunityId ? `community_${currentCommunityId}` : currentChannel
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

    const userListHTML = users.length === 0
        ? '<div class="chat-user-item">No other users online</div>'
        : users.map(user => {
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
                            ${(user.username || '').toLowerCase() === 'apelover69' ? '<span class="owner-badge-small" title="Owner">OWNER</span>' : ''}
                            ${user.xAccountVerified ? '<span class="verified-badge-small" title="Verified X account">✓</span>' : ''}
                        </div>
                        <div class="chat-user-last-seen">
                            ${isOnline ? '<span class="online-text">Online</span>' : `<span class="last-seen-text">Last active: ${lastSeen}</span>`}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    
    // Update desktop user list
    chatUserListEl.innerHTML = userListHTML;
    
    // Update mobile user list
    const mobileUserListEl = document.getElementById('chatMobileUserList');
    if (mobileUserListEl) {
        mobileUserListEl.innerHTML = userListHTML;
    }
    
    // Add image error handling for user lists (CSP-compliant)
    [chatUserListEl, mobileUserListEl].filter(Boolean).forEach(listEl => {
        listEl.querySelectorAll('img').forEach(img => {
            img.addEventListener('error', function() {
                const fallback = this.dataset.fallback || '/pfp_apes/bg1.png';
                if (this.src !== fallback) {
                    this.src = fallback;
                }
            });
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
    messageContextMenuEl.style.setProperty('left', event.pageX + 'px');
    messageContextMenuEl.style.setProperty('top', event.pageY + 'px');
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
    reactionPickerEl.style.setProperty('left', rect.left + 'px');
    reactionPickerEl.style.setProperty('top', (rect.top - 60) + 'px');
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
    emojiPickerEl.style.setProperty('left', left + 'px');
    emojiPickerEl.style.setProperty('top', top + 'px');
    emojiPickerEl.style.setProperty('right', 'auto');
    emojiPickerEl.style.setProperty('bottom', 'auto');
}

// Report a message
function reportMessage(messageId) {
    const reason = prompt('Why are you reporting this message? (Optional)');
    // In a real implementation, you'd save this to Firestore or send to admins
    showToast('Message reported. Thank you for keeping the community safe.');
    // Message reported (reason logged for moderation)
}

// Utility functions
// Verify community membership
async function verifyCommunityMembership(communityId) {
    if (!currentUser || !communityId) return false;
    try {
        const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        return memberDoc.exists();
    } catch (error) {
        console.error('Error verifying membership:', error);
        return false;
    }
}

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

// Create a default user profile for a user ID (helper function)
async function createDefaultUserProfile(userId) {
    if (!userId || !currentUser) return false;
    
    try {
        // Check if profile already exists
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            return true; // Profile already exists
        }
        
        // Try to create profile using Cloud Function
        // This allows creating profiles for other users (if admin) or for current user
        try {
            const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
            const functions = getFunctions(app, 'us-central1');
            const createDefaultProfile = httpsCallable(functions, 'createDefaultUserProfile');
            
            const result = await createDefaultProfile({ uid: userId });
            
            if (result.data && result.data.success) {
                console.log('✅ Created default profile via Cloud Function for userId:', userId, 'username:', result.data.username);
                return true;
            } else {
                console.warn('⚠️ Cloud Function returned success=false for userId:', userId);
                return false;
            }
        } catch (cloudFunctionError) {
            console.error('❌ Error calling Cloud Function to create profile:', cloudFunctionError);
            
            // Fallback: Try to create profile directly (only works for current user due to Firestore rules)
            if (userId === currentUser.uid) {
                // Try to get user info from presence collection
                let email = '';
                let username = '';
                
                const presenceRef = doc(db, 'presence', userId);
                const presenceDoc = await getDoc(presenceRef);
                
                if (presenceDoc.exists()) {
                    const presenceData = presenceDoc.data();
                    username = presenceData.username || '';
                    email = presenceData.email || '';
                }
                
                // Generate default username if not found
                if (!username || username.trim() === '') {
                    if (email) {
                        username = email.split('@')[0] || 'user';
                    } else {
                        username = 'user_' + Date.now().toString(36).substring(0, 10);
                    }
                }
                
                // Normalize username to match Firestore rules
                const normalizedUsername = username.toLowerCase()
                    .replace(/[^a-z0-9_]/g, '_')
                    .substring(0, 20)
                    .replace(/^_+|_+$/g, '');
                
                const finalUsername = normalizedUsername.length >= 3 
                    ? normalizedUsername 
                    : 'user_' + Date.now().toString(36).substring(0, 10);
                
                // Create user profile with required fields
                const userData = {
                    username: finalUsername,
                    email: email || '',
                    avatarCount: 0,
                    createdAt: Timestamp.now()
                };
                
                await setDoc(userDocRef, userData);
                console.log('✅ Created default profile directly for current user:', userId, 'with username:', finalUsername);
                return true;
            } else {
                // Can't create profile for other users without Cloud Function
                return false;
            }
        }
    } catch (error) {
        console.error('❌ Error creating default profile for userId:', userId, error);
        return false;
    }
}

// Get profile data from presence collection as fallback
async function getProfileFromPresence(userId) {
    try {
        const presenceRef = doc(db, 'presence', userId);
        const presenceDoc = await getDoc(presenceRef);
        
        if (presenceDoc.exists()) {
            const presenceData = presenceDoc.data();
            return {
                username: presenceData.username || 'Anonymous',
                bannerImage: presenceData.bannerImage || '/pfp_apes/bg1.png',
                xAccountVerified: presenceData.xAccountVerified || false,
                country: null,
                bio: null,
                xAccount: null,
                email: presenceData.email || ''
            };
        }
    } catch (error) {
        console.error('Error getting profile from presence:', error);
    }
    return null;
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
        console.log('Fetching user profile for userId:', userId);
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        
        let userData = null;
        
        if (userDoc.exists()) {
            userData = userDoc.data();
            console.log('User profile found in users collection:', userData);
        } else {
            console.log('User not found in users collection, attempting to create default profile...');
            // Try to create a default profile for this user
            const created = await createDefaultUserProfile(userId);
            
            if (created) {
                // Retry fetching the profile
                const retryDoc = await getDoc(userDocRef);
                if (retryDoc.exists()) {
                    userData = retryDoc.data();
                    console.log('Default profile created and loaded:', userData);
                } else {
                    // Still not found, try presence collection as fallback
                    userData = await getProfileFromPresence(userId);
                }
            } else {
                // Couldn't create profile, try presence collection as fallback
                userData = await getProfileFromPresence(userId);
            }
            
            if (!userData) {
                // User not found in any collection
                console.error('User not found in users or presence collection for userId:', userId);
                if (nameEl) nameEl.textContent = 'User not found';
                if (bioEl) bioEl.textContent = 'This user profile could not be loaded.';
                return;
            }
        }
        
        // Get banner image element (not declared above)
        const bannerImgEl = document.getElementById('userProfilePopupBannerImg');
        
        // Check if all elements exist (reuse variables from loading state above)
        if (!nameEl || !bannerImgEl || !levelEl || !countryEl || !xAccountEl || !bioEl || !verifiedEl) {
            console.error('User profile popup elements not found:', {
                nameEl: !!nameEl,
                bannerImgEl: !!bannerImgEl,
                levelEl: !!levelEl,
                countryEl: !!countryEl,
                xAccountEl: !!xAccountEl,
                bioEl: !!bioEl,
                verifiedEl: !!verifiedEl
            });
            return;
        }
        
        // Name
        nameEl.textContent = userData.username || 'Anonymous';
        
        // Level - calculate from points if level not set, or use stored level
        let userLevel = userData.level;
        if (userLevel === undefined && userData.points !== undefined) {
            // Import level calculation from quests system
            try {
                const { calculateLevel } = await import('/js/quests-init.js');
                userLevel = calculateLevel(userData.points || 0);
            } catch (error) {
                console.error('Error importing calculateLevel:', error);
                userLevel = 1; // Default fallback
            }
        }
        if (levelEl) {
            levelEl.textContent = userLevel || 1;
        }
        
        // Banner - handle image loading with error fallback
        const bannerImage = userData.bannerImage || '/pfp_apes/bg1.png';
        const fallbackImage = '/pfp_apes/bg1.png';
        
        // Remove any existing error listeners
        const newImg = bannerImgEl.cloneNode(false);
        bannerImgEl.parentNode.replaceChild(newImg, bannerImgEl);
        const updatedBannerImg = document.getElementById('userProfilePopupBannerImg');
        
        updatedBannerImg.src = bannerImage;
        updatedBannerImg.dataset.fallback = fallbackImage;
        
        // Add error handling for banner image
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
        
        // Load followers/following counts
        try {
            const [followersCount, followingCount] = await Promise.all([
                getFollowersCount(userId),
                getFollowingCount(userId)
            ]);
            
            if (followersEl) {
                followersEl.textContent = followersCount || 0;
                followersEl.dataset.userId = userId;
                // Remove existing listeners by cloning
                const newFollowersEl = followersEl.cloneNode(true);
                followersEl.parentNode.replaceChild(newFollowersEl, followersEl);
                // Add event listener to the new element
                newFollowersEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Followers button clicked in chat popup, userId:', userId);
                    showFollowersList(userId);
                });
                console.log('Followers button listener attached');
            }
            if (followingEl) {
                followingEl.textContent = followingCount || 0;
                followingEl.dataset.userId = userId;
                // Remove existing listeners by cloning
                const newFollowingEl = followingEl.cloneNode(true);
                followingEl.parentNode.replaceChild(newFollowingEl, followingEl);
                // Add event listener to the new element
                newFollowingEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Following button clicked in chat popup, userId:', userId);
                    showFollowingList(userId);
                });
                console.log('Following button listener attached');
            }
        } catch (error) {
            console.error('Error loading follow stats:', error);
            if (followersEl) followersEl.textContent = '0';
            if (followingEl) followingEl.textContent = '0';
        }
        
        // Check if current user is following this user and show follow button
        if (userId !== currentUser.uid) {
            try {
                const isFollowing = await checkIfFollowing(userId);
                const followBtn = document.getElementById('chatFollowBtn');
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
            const followBtn = document.getElementById('chatFollowBtn');
            if (followBtn) {
                followBtn.classList.add('hide');
            }
        }
        
        // Ensure popup is visible after data is loaded
        userProfilePopupEl.classList.remove('hide');
        
        // Force a reflow to ensure CSS transition works
        void userProfilePopupEl.offsetWidth;
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        const nameEl = document.getElementById('userProfilePopupName');
        const bioEl = document.getElementById('userProfilePopupBio');
        if (nameEl) nameEl.textContent = 'Error';
        if (bioEl) bioEl.textContent = 'Failed to load user profile.';
        // Still show popup even on error
        if (userProfilePopupEl) {
            userProfilePopupEl.classList.remove('hide');
        }
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

// Admin command: Promote user to moderator
async function handlePromoteCommand(username) {
    try {
        // Find user by username
        const usernamesRef = collection(db, 'usernames');
        const usernameDoc = await getDoc(doc(usernamesRef, username.toLowerCase()));
        
        if (!usernameDoc.exists()) {
            alert(`User "${username}" not found.`);
            return;
        }
        
        const targetUserId = usernameDoc.data().uid;
        
        // Check if trying to promote self
        if (targetUserId === currentUser.uid) {
            alert('You cannot promote yourself.');
            return;
        }
        
        // Get target user document
        const targetUserRef = doc(db, 'users', targetUserId);
        const targetUserDoc = await getDoc(targetUserRef);
        
        if (!targetUserDoc.exists()) {
            alert(`User profile for "${username}" not found.`);
            return;
        }
        
        const targetUserData = targetUserDoc.data();
        
        // Check if already moderator or admin
        if (targetUserData.role === 'moderator' || targetUserData.role === 'admin') {
            alert(`User "${username}" is already a ${targetUserData.role}.`);
            return;
        }
        
        // Promote to moderator
        await updateDoc(targetUserRef, {
            role: 'moderator'
        });
        
        alert(`Successfully promoted "${username}" to moderator.`);
        console.log(`Admin ${userProfile.username} promoted ${username} to moderator`);
    } catch (error) {
        console.error('Error promoting user:', error);
        alert(`Failed to promote user: ${error.message}`);
    }
}

// Admin command: Mute user for specified minutes
async function handleMuteCommand(username, minutes) {
    try {
        // Find user by username
        const usernamesRef = collection(db, 'usernames');
        const usernameDoc = await getDoc(doc(usernamesRef, username.toLowerCase()));
        
        if (!usernameDoc.exists()) {
            alert(`User "${username}" not found.`);
            return;
        }
        
        const targetUserId = usernameDoc.data().uid;
        
        // Check if trying to mute self
        if (targetUserId === currentUser.uid) {
            alert('You cannot mute yourself.');
            return;
        }
        
        // Get target user document
        const targetUserRef = doc(db, 'users', targetUserId);
        const targetUserDoc = await getDoc(targetUserRef);
        
        if (!targetUserDoc.exists()) {
            alert(`User profile for "${username}" not found.`);
            return;
        }
        
        const targetUserData = targetUserDoc.data();
        
        // Check if target is admin (can't mute admins)
        if (targetUserData.role === 'admin') {
            alert('You cannot mute an admin.');
            return;
        }
        
        // Calculate mute expiration time
        const muteExpiration = Timestamp.fromMillis(Date.now() + (minutes * 60 * 1000));
        
        // Set mute using updateDoc
        await updateDoc(targetUserRef, {
            mutedUntil: muteExpiration
        });
        
        alert(`Successfully muted "${username}" for ${minutes} minute${minutes > 1 ? 's' : ''}.`);
        console.log(`Admin ${userProfile.username} muted ${username} for ${minutes} minutes`);
    } catch (error) {
        console.error('Error muting user:', error);
        alert(`Failed to mute user: ${error.message}`);
    }
}

// Admin command: Clear all messages in a channel
async function handleClearCommand(channelName) {
    try {
        // Validate channel name
        const validChannels = ['general', 'raid', 'trading', 'support'];
        if (!validChannels.includes(channelName)) {
            alert(`Invalid channel name. Valid channels: ${validChannels.join(', ')}`);
            return;
        }
        
        // Format channel name for display
        const channelDisplayName = channelName.toUpperCase();
        
        // Confirm action
        if (!confirm(`Are you sure you want to clear all messages in ${channelDisplayName}? This action cannot be undone.`)) {
            return;
        }
        
        // Get all messages for this channel
        // Use default community for clearing
        const communityId = DEFAULT_COMMUNITY_ID;
        const messagesRef = collection(db, 'communities', communityId, 'messages');
        const messagesQuery = query(
            messagesRef,
            where('channelId', '==', channelName),
            where('deleted', '==', false)
        );
        
        const messagesSnapshot = await getDocs(messagesQuery);
        
        if (messagesSnapshot.empty) {
            alert(`No messages found in ${channelDisplayName}.`);
            return;
        }
        
        // Soft delete all messages (set deleted flag to true)
        const deletePromises = [];
        messagesSnapshot.forEach((messageDoc) => {
            const messageRef = doc(db, 'communities', communityId, 'messages', messageDoc.id);
            deletePromises.push(updateDoc(messageRef, {
                deleted: true
            }));
        });
        
        await Promise.all(deletePromises);
        
        alert(`Successfully cleared ${messagesSnapshot.size} message${messagesSnapshot.size > 1 ? 's' : ''} from ${channelDisplayName}.`);
        console.log(`Admin ${userProfile.username} cleared ${messagesSnapshot.size} messages from ${channelName} channel`);
    } catch (error) {
        console.error('Error clearing channel:', error);
        alert(`Failed to clear channel: ${error.message}`);
    }
}

// Follow/Unfollow functions for chat popup
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
        alert('Failed to follow user. Please try again.');
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
        console.log(`Unfollowed user: ${targetUserId}`);
    } catch (error) {
        console.error('Error unfollowing user:', error);
        alert('Failed to unfollow user. Please try again.');
    }
}

async function checkIfFollowing(targetUserId) {
    if (!currentUser || !targetUserId || targetUserId === currentUser.uid) return false;
    
    try {
        const followDoc = await getDoc(doc(db, 'following', currentUser.uid, 'following', targetUserId));
        return followDoc.exists();
    } catch (error) {
        console.error('Error checking follow status:', error);
        return false;
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

// Store followers/following data for search (chat)
let chatFollowersData = [];
let chatFollowingData = [];

// Filter and render followers list (chat)
function renderChatFollowersList(followers, followingStatus, searchTerm = '') {
    const listEl = document.getElementById('followersList');
    if (!listEl) return;
    
    const filtered = searchTerm 
        ? followers.filter(f => 
            (f.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (f.bio || '').toLowerCase().includes(searchTerm.toLowerCase())
          )
        : followers;
    
    if (filtered.length === 0) {
        listEl.innerHTML = searchTerm 
            ? '<div class="follow-list-empty">No followers match your search</div>'
            : '<div class="follow-list-empty">No followers yet</div>';
        return;
    }
    
    listEl.innerHTML = '';
    
    filtered.forEach((follower) => {
        const followerItem = document.createElement('div');
        followerItem.className = 'follow-list-item';
        const isFollowing = currentUser && follower.id !== currentUser.uid ? followingStatus.get(follower.id) : false;
        const isOwnProfile = currentUser && follower.id === currentUser.uid;
        const level = follower.level || 1;
        
        followerItem.innerHTML = `
            <img src="${follower.bannerImage || '/pfp_apes/bg1.png'}" alt="${follower.username}" class="follow-item-avatar" />
            <div class="follow-item-info">
                <div class="follow-item-info-wrapper">
                    <div class="follow-item-username">${follower.username || 'Unknown'}</div>
                    ${level ? `<span class="follow-item-level">LVL ${level}</span>` : ''}
                </div>
                ${follower.bio ? `<div class="follow-item-bio">${follower.bio.substring(0, 50)}${follower.bio.length > 50 ? '...' : ''}</div>` : ''}
            </div>
            ${currentUser && !isOwnProfile ? `
                <button class="follow-item-btn ${isFollowing ? 'following' : ''}" data-user-id="${follower.id}">
                    ${isFollowing ? 'Unfollow' : 'Follow'}
                </button>
            ` : ''}
        `;
        
        const avatar = followerItem.querySelector('.follow-item-avatar');
        const infoSection = followerItem.querySelector('.follow-item-info');
        const navigateToProfile = (e) => {
            e.stopPropagation();
            window.location.href = `/profile/?user=${follower.id}`;
        };
        if (avatar) avatar.addEventListener('click', navigateToProfile);
        if (infoSection) infoSection.addEventListener('click', navigateToProfile);
        
        const followBtn = followerItem.querySelector('.follow-item-btn');
        if (followBtn) {
            followBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const targetUserId = followBtn.dataset.userId;
                if (isFollowing) {
                    await unfollowUser(targetUserId);
                    followBtn.textContent = 'Follow';
                    followBtn.classList.remove('following');
                    followingStatus.set(targetUserId, false);
                } else {
                    await followUser(targetUserId);
                    followBtn.textContent = 'Unfollow';
                    followBtn.classList.add('following');
                    followingStatus.set(targetUserId, true);
                }
            });
        }
        
        listEl.appendChild(followerItem);
    });
}

// Show followers list (same as profile page)
async function showFollowersList(userId) {
    console.log('showFollowersList called in chat with userId:', userId);
    const modal = document.getElementById('followersModal');
    const listEl = document.getElementById('followersList');
    const searchInput = document.getElementById('followersSearchInput');
    
    if (!modal || !listEl) {
        console.error('Modal elements not found:', { modal: !!modal, listEl: !!listEl });
        return;
    }
    
    modal.classList.remove('hide');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    listEl.innerHTML = '<div class="follow-list-loading">Loading...</div>';
    if (searchInput) searchInput.value = '';
    
    try {
        const followersRef = collection(db, 'followers', userId, 'followers');
        const followersSnapshot = await getDocs(followersRef);
        
        if (followersSnapshot.empty) {
            listEl.innerHTML = '<div class="follow-list-empty">No followers yet</div>';
            chatFollowersData = [];
            return;
        }
        
        const followerPromises = followersSnapshot.docs.map(async (followerDoc) => {
            const followerId = followerDoc.data().userId;
            try {
                const userDoc = await getDoc(doc(db, 'users', followerId));
                if (userDoc.exists()) {
                    return { id: followerId, ...userDoc.data() };
                }
            } catch (error) {
                console.error(`Error loading follower ${followerId}:`, error);
            }
            return null;
        });
        
        const followers = (await Promise.all(followerPromises)).filter(f => f !== null);
        chatFollowersData = followers;
        
        const followingStatus = new Map();
        if (currentUser) {
            const followingPromises = followers.map(async (follower) => {
                const isFollowing = await checkIfFollowing(follower.id);
                return { id: follower.id, isFollowing };
            });
            const statuses = await Promise.all(followingPromises);
            statuses.forEach(status => {
                followingStatus.set(status.id, status.isFollowing);
            });
        }
        
        // Setup search functionality
        if (searchInput) {
            // Remove existing listeners
            const newSearchInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearchInput, searchInput);
            const updatedSearchInput = document.getElementById('followersSearchInput');
            if (updatedSearchInput) {
                updatedSearchInput.addEventListener('input', (e) => {
                    renderChatFollowersList(chatFollowersData, followingStatus, e.target.value);
                });
            }
        }
        
        // Initial render
        renderChatFollowersList(followers, followingStatus);
    } catch (error) {
        console.error('Error loading followers:', error);
        listEl.innerHTML = '<div class="follow-list-error">Error loading followers</div>';
        chatFollowersData = [];
    }
}

// Filter and render following list (chat)
function renderChatFollowingList(following, followingStatus, searchTerm = '', viewingUserId = null) {
    const listEl = document.getElementById('followingList');
    if (!listEl) return;
    
    const filtered = searchTerm 
        ? following.filter(f => 
            (f.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (f.bio || '').toLowerCase().includes(searchTerm.toLowerCase())
          )
        : following;
    
    if (filtered.length === 0) {
        listEl.innerHTML = searchTerm 
            ? '<div class="follow-list-empty">No following match your search</div>'
            : '<div class="follow-list-empty">Not following anyone yet</div>';
        return;
    }
    
    listEl.innerHTML = '';
    
    filtered.forEach((followed) => {
        const followingItem = document.createElement('div');
        followingItem.className = 'follow-list-item';
        const isFollowing = currentUser && followed.id !== currentUser.uid ? followingStatus.get(followed.id) : false;
        const isOwnProfile = currentUser && followed.id === currentUser.uid;
        const isViewingOwnProfile = currentUser && viewingUserId && viewingUserId === currentUser.uid;
        const level = followed.level || 1;
        
        followingItem.innerHTML = `
            <img src="${followed.bannerImage || '/pfp_apes/bg1.png'}" alt="${followed.username}" class="follow-item-avatar" />
            <div class="follow-item-info">
                <div class="follow-item-info-wrapper">
                    <div class="follow-item-username">${followed.username || 'Unknown'}</div>
                    ${level ? `<span class="follow-item-level">LVL ${level}</span>` : ''}
                </div>
                ${followed.bio ? `<div class="follow-item-bio">${followed.bio.substring(0, 50)}${followed.bio.length > 50 ? '...' : ''}</div>` : ''}
            </div>
            ${currentUser && !isOwnProfile ? `
                <button class="follow-item-btn ${isFollowing || isViewingOwnProfile ? 'following' : ''}" data-user-id="${followed.id}">
                    ${isFollowing || isViewingOwnProfile ? 'Unfollow' : 'Follow'}
                </button>
            ` : ''}
        `;
        
        const avatar = followingItem.querySelector('.follow-item-avatar');
        const infoSection = followingItem.querySelector('.follow-item-info');
        const navigateToProfile = (e) => {
            e.stopPropagation();
            window.location.href = `/profile/?user=${followed.id}`;
        };
        if (avatar) avatar.addEventListener('click', navigateToProfile);
        if (infoSection) infoSection.addEventListener('click', navigateToProfile);
        
        const followBtn = followingItem.querySelector('.follow-item-btn');
        if (followBtn) {
            followBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const targetUserId = followBtn.dataset.userId;
                const currentlyFollowing = followBtn.classList.contains('following');
                if (currentlyFollowing) {
                    await unfollowUser(targetUserId);
                    followBtn.textContent = 'Follow';
                    followBtn.classList.remove('following');
                    followingStatus.set(targetUserId, false);
                } else {
                    await followUser(targetUserId);
                    followBtn.textContent = 'Unfollow';
                    followBtn.classList.add('following');
                    followingStatus.set(targetUserId, true);
                }
            });
        }
        
        listEl.appendChild(followingItem);
    });
}

// Show following list (same as profile page)
async function showFollowingList(userId) {
    console.log('showFollowingList called in chat with userId:', userId);
    const modal = document.getElementById('followingModal');
    const listEl = document.getElementById('followingList');
    const searchInput = document.getElementById('followingSearchInput');
    
    if (!modal || !listEl) {
        console.error('Modal elements not found:', { modal: !!modal, listEl: !!listEl });
        return;
    }
    
    modal.classList.remove('hide');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    listEl.innerHTML = '<div class="follow-list-loading">Loading...</div>';
    if (searchInput) searchInput.value = '';
    
    try {
        const followingRef = collection(db, 'following', userId, 'following');
        const followingSnapshot = await getDocs(followingRef);
        
        if (followingSnapshot.empty) {
            listEl.innerHTML = '<div class="follow-list-empty">Not following anyone yet</div>';
            chatFollowingData = [];
            return;
        }
        
        const followingPromises = followingSnapshot.docs.map(async (followingDoc) => {
            const followingId = followingDoc.data().userId;
            try {
                const userDoc = await getDoc(doc(db, 'users', followingId));
                if (userDoc.exists()) {
                    return { id: followingId, ...userDoc.data() };
                }
            } catch (error) {
                console.error(`Error loading followed user ${followingId}:`, error);
            }
            return null;
        });
        
        const following = (await Promise.all(followingPromises)).filter(f => f !== null);
        chatFollowingData = following;
        
        const followingStatus = new Map();
        if (currentUser && userId !== currentUser.uid) {
            const statusPromises = following.map(async (followed) => {
                const isFollowing = await checkIfFollowing(followed.id);
                return { id: followed.id, isFollowing };
            });
            const statuses = await Promise.all(statusPromises);
            statuses.forEach(status => {
                followingStatus.set(status.id, status.isFollowing);
            });
        } else if (currentUser && userId === currentUser.uid) {
            following.forEach(f => followingStatus.set(f.id, true));
        }
        
        // Setup search functionality
        if (searchInput) {
            // Remove existing listeners
            const newSearchInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearchInput, searchInput);
            const updatedSearchInput = document.getElementById('followingSearchInput');
            if (updatedSearchInput) {
                updatedSearchInput.addEventListener('input', (e) => {
                    renderChatFollowingList(chatFollowingData, followingStatus, e.target.value, userId);
                });
            }
        }
        
        // Initial render
        renderChatFollowingList(following, followingStatus, '', userId);
    } catch (error) {
        console.error('Error loading following:', error);
        listEl.innerHTML = '<div class="follow-list-error">Error loading following</div>';
        chatFollowingData = [];
    }
}

// Setup modal close handlers
function setupFollowModals() {
    const closeFollowersModal = document.getElementById('closeFollowersModal');
    if (closeFollowersModal) {
        closeFollowersModal.addEventListener('click', () => {
            const modal = document.getElementById('followersModal');
            if (modal) {
                modal.classList.remove('show');
                modal.classList.add('hide');
                document.body.style.overflow = '';
            }
        });
    }
    
    const closeFollowingModal = document.getElementById('closeFollowingModal');
    if (closeFollowingModal) {
        closeFollowingModal.addEventListener('click', () => {
            const modal = document.getElementById('followingModal');
            if (modal) {
                modal.classList.remove('show');
                modal.classList.add('hide');
                document.body.style.overflow = '';
            }
        });
    }
    
    // Close modals on overlay click
    const followersModal = document.getElementById('followersModal');
    if (followersModal) {
        followersModal.addEventListener('click', (e) => {
            if (e.target === followersModal) {
                followersModal.classList.remove('show');
                followersModal.classList.add('hide');
                document.body.style.overflow = '';
            }
        });
    }
    
    const followingModal = document.getElementById('followingModal');
    if (followingModal) {
        followingModal.addEventListener('click', (e) => {
            if (e.target === followingModal) {
                followingModal.classList.remove('show');
                followingModal.classList.add('hide');
                document.body.style.overflow = '';
            }
        });
    }
}

// Chat page initialized
