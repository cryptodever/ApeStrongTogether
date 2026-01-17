/**
 * Community Management Module
 * Handles user-created community chat functionality
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    collection,
    query,
    orderBy,
    limit,
    addDoc,
    updateDoc,
    setDoc,
    doc,
    getDoc,
    getDocs,
    where,
    serverTimestamp,
    deleteDoc,
    writeBatch,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

// State
let currentUser = null;
let userProfile = null;
let userCommunities = []; // Communities the user is a member of

// DOM Elements
let createCommunityBtn, createCommunityBtnMobile, createCommunityBtnDrawer;
let communityModal, communityModalOverlay, communityModalClose;
let communityCreateForm, communityNameInput, communityDescriptionInput, communityIsPublicInput;
let communityPfpInput, pfpPreview, pfpPreviewImage, pfpRemoveBtn, pfpPlaceholder;
let nameCharCount, descriptionCharCount;
let communityJoinModal, communityJoinModalOverlay, communityJoinModalClose;
let communityDiscoveryModal, communityDiscoveryModalOverlay, communityDiscoveryModalClose;
let communitySettingsModal, communitySettingsModalOverlay, communitySettingsModalClose;
let communityMembersModal, communityMembersModalOverlay, communityMembersModalClose;
let communitySettingsBtn;

// PFP state
let pfpFile = null;
let pfpDataUrl = null;
let settingsPfpFile = null;
let settingsPfpDataUrl = null;
let settingsPfpRemoved = false; // Track if PFP was removed in settings

// Initialize when auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserProfile();
        initializeCommunityUI();
        loadUserCommunities();
    } else {
        currentUser = null;
        userProfile = null;
        userCommunities = [];
    }
});

// Load user profile
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            userProfile = userDoc.data();
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Initialize community UI elements
function initializeCommunityUI() {
    // Get DOM elements
    createCommunityBtn = document.getElementById('createCommunityBtn');
    createCommunityBtnMobile = document.getElementById('createCommunityBtnMobile');
    createCommunityBtnDrawer = document.getElementById('createCommunityBtnDrawer');
    
    communityModal = document.getElementById('communityModal');
    communityModalOverlay = document.getElementById('communityModalOverlay');
    communityModalClose = document.getElementById('communityModalClose');
    
    communityCreateForm = document.getElementById('communityCreateForm');
    communityNameInput = document.getElementById('communityName');
    communityDescriptionInput = document.getElementById('communityDescription');
    // Note: isPublic is now handled via radio buttons, not a single checkbox
    communityIsPublicInput = document.querySelector('input[name="isPublic"][value="true"]');
    communityPfpInput = document.getElementById('communityPfp');
    pfpPreview = document.getElementById('pfpPreview');
    pfpPreviewImage = document.getElementById('pfpPreviewImage');
    pfpRemoveBtn = document.getElementById('pfpRemoveBtn');
    pfpPlaceholder = pfpPreview?.querySelector('.pfp-placeholder');
    nameCharCount = document.getElementById('nameCharCount');
    descriptionCharCount = document.getElementById('descriptionCharCount');
    
    communityJoinModal = document.getElementById('communityJoinModal');
    communityJoinModalOverlay = document.getElementById('communityJoinModalOverlay');
    communityJoinModalClose = document.getElementById('communityJoinModalClose');
    
    communityDiscoveryModal = document.getElementById('communityDiscoveryModal');
    communityDiscoveryModalOverlay = document.getElementById('communityDiscoveryModalOverlay');
    communityDiscoveryModalClose = document.getElementById('communityDiscoveryModalClose');
    
    communitySettingsModal = document.getElementById('communitySettingsModal');
    communitySettingsModalOverlay = document.getElementById('communitySettingsModalOverlay');
    communitySettingsModalClose = document.getElementById('communitySettingsModalClose');
    
    communityMembersModal = document.getElementById('communityMembersModal');
    communityMembersModalOverlay = document.getElementById('communityMembersModalOverlay');
    communityMembersModalClose = document.getElementById('communityMembersModalClose');
    
    communitySettingsBtn = document.getElementById('communitySettingsBtn');
    
    // Setup event listeners
    if (createCommunityBtn) {
        createCommunityBtn.addEventListener('click', () => openCommunityModal());
    }
    if (createCommunityBtnMobile) {
        createCommunityBtnMobile.addEventListener('click', () => openCommunityModal());
    }
    if (createCommunityBtnDrawer) {
        createCommunityBtnDrawer.addEventListener('click', () => {
            openCommunityModal();
            closeMobileDrawer();
        });
    }
    
    if (communityModalClose) {
        communityModalClose.addEventListener('click', () => closeCommunityModal());
    }
    if (communityModalOverlay) {
        communityModalOverlay.addEventListener('click', () => closeCommunityModal());
    }
    
    if (communityJoinModalClose) {
        communityJoinModalClose.addEventListener('click', () => closeCommunityJoinModal());
    }
    if (communityJoinModalOverlay) {
        communityJoinModalOverlay.addEventListener('click', () => closeCommunityJoinModal());
    }
    
    if (communityDiscoveryModalClose) {
        communityDiscoveryModalClose.addEventListener('click', () => closeCommunityDiscoveryModal());
    }
    if (communityDiscoveryModalOverlay) {
        communityDiscoveryModalOverlay.addEventListener('click', () => closeCommunityDiscoveryModal());
    }
    
    if (communitySettingsModalClose) {
        communitySettingsModalClose.addEventListener('click', () => closeCommunitySettingsModal());
    }
    if (communitySettingsModalOverlay) {
        communitySettingsModalOverlay.addEventListener('click', () => closeCommunitySettingsModal());
    }
    
    if (communityMembersModalClose) {
        communityMembersModalClose.addEventListener('click', () => closeCommunityMembersModal());
    }
    if (communityMembersModalOverlay) {
        communityMembersModalOverlay.addEventListener('click', () => closeCommunityMembersModal());
    }
    
    if (communityCreateForm) {
        communityCreateForm.addEventListener('submit', handleCreateCommunity);
    }
    
    // PFP upload handlers
    if (communityPfpInput) {
        communityPfpInput.addEventListener('change', handlePfpUpload);
    }
    if (pfpRemoveBtn) {
        pfpRemoveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePfpRemove();
        });
    }
    if (pfpPreview) {
        pfpPreview.addEventListener('click', (e) => {
            // Only trigger file picker if clicking directly on pfp preview, not on child elements that might handle their own clicks
            const target = e.target;
            // Don't trigger if clicking on the remove button
            if (target.closest('.pfp-remove-btn')) {
                return;
            }
            if (communityPfpInput && !pfpFile) {
                e.preventDefault();
                e.stopPropagation();
                communityPfpInput.click();
            }
        });
    }
    
    // Character counters
    if (communityNameInput && nameCharCount) {
        communityNameInput.addEventListener('input', () => {
            nameCharCount.textContent = communityNameInput.value.length;
        });
        
        // Prevent Enter key from triggering form submission or unwanted actions
        communityNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Optionally, focus the next field (description) instead
                if (communityDescriptionInput) {
                    communityDescriptionInput.focus();
                }
            }
        });
        
        // Prevent clicks from bubbling up (in case of any event propagation issues)
        communityNameInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Prevent focus events from triggering unwanted actions
        communityNameInput.addEventListener('focus', (e) => {
            e.stopPropagation();
        });
    }
    if (communityDescriptionInput && descriptionCharCount) {
        communityDescriptionInput.addEventListener('input', () => {
            descriptionCharCount.textContent = communityDescriptionInput.value.length;
        });
    }
    
    // Join modal
    const communityJoinSubmitBtn = document.getElementById('communityJoinSubmitBtn');
    const communityJoinCancelBtn = document.getElementById('communityJoinCancelBtn');
    if (communityJoinSubmitBtn) {
        communityJoinSubmitBtn.addEventListener('click', handleJoinCommunity);
    }
    if (communityJoinCancelBtn) {
        communityJoinCancelBtn.addEventListener('click', () => closeCommunityJoinModal());
    }
    
    // Discovery modal
    const communitySearchInput = document.getElementById('communitySearchInput');
    if (communitySearchInput) {
        communitySearchInput.addEventListener('input', handleCommunitySearch);
    }
    
    // Settings modal
    const communitySettingsForm = document.getElementById('communitySettingsForm');
    if (communitySettingsForm) {
        communitySettingsForm.addEventListener('submit', handleUpdateCommunitySettings);
    }
    
    // Settings PFP upload handlers
    const settingsPfpInput = document.getElementById('settingsCommunityPfp');
    const settingsPfpPreview = document.getElementById('settingsPfpPreview');
    const settingsPfpPreviewImage = document.getElementById('settingsPfpPreviewImage');
    const settingsPfpRemoveBtn = document.getElementById('settingsPfpRemoveBtn');
    const settingsPfpPlaceholder = settingsPfpPreview?.querySelector('.pfp-placeholder');
    
    if (settingsPfpInput) {
        settingsPfpInput.addEventListener('change', (e) => handleSettingsPfpUpload(e, settingsPfpPreviewImage, settingsPfpPlaceholder, settingsPfpRemoveBtn));
    }
    if (settingsPfpRemoveBtn) {
        settingsPfpRemoveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleSettingsPfpRemove(settingsPfpPreviewImage, settingsPfpPlaceholder, settingsPfpRemoveBtn);
        });
    }
    if (settingsPfpPreview) {
        settingsPfpPreview.addEventListener('click', (e) => {
            const target = e.target;
            if (target.closest('.pfp-remove-btn')) {
                return;
            }
            if (settingsPfpInput && !settingsPfpFile) {
                e.preventDefault();
                e.stopPropagation();
                settingsPfpInput.click();
            }
        });
    }
    
    // Settings button click handler
    if (communitySettingsBtn) {
        communitySettingsBtn.addEventListener('click', async () => {
            // Get current community ID from localStorage (set by chat-init.js)
            const DEFAULT_COMMUNITY_ID = 'default';
            const currentCommunityId = localStorage.getItem('selectedCommunity') || DEFAULT_COMMUNITY_ID;
            
            if (currentCommunityId && window.communityModule?.openCommunitySettingsModal) {
                await window.communityModule.openCommunitySettingsModal(currentCommunityId);
            }
        });
    }
    
    const copyInviteLinkBtn = document.getElementById('copyInviteLinkBtn');
    const regenerateInviteCodeBtn = document.getElementById('regenerateInviteCodeBtn');
    if (copyInviteLinkBtn) {
        copyInviteLinkBtn.addEventListener('click', handleCopyInviteLink);
    }
    if (regenerateInviteCodeBtn) {
        regenerateInviteCodeBtn.addEventListener('click', handleRegenerateInviteCode);
    }
    
    // Cancel buttons
    const communityCancelBtn = document.getElementById('communityCancelBtn');
    const communitySettingsCancelBtn = document.getElementById('communitySettingsCancelBtn');
    if (communityCancelBtn) {
        communityCancelBtn.addEventListener('click', () => closeCommunityModal());
    }
    if (communitySettingsCancelBtn) {
        communitySettingsCancelBtn.addEventListener('click', () => closeCommunitySettingsModal());
    }
}

// Generate unique invite code
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Check if invite code is unique
async function isInviteCodeUnique(code) {
    try {
        const communitiesRef = collection(db, 'communities');
        const q = query(communitiesRef, where('inviteCode', '==', code), limit(1));
        const snapshot = await getDocs(q);
        return snapshot.empty;
    } catch (error) {
        // If we don't have permission to check uniqueness, assume it's unique
        // The probability of collision with 8 alphanumeric chars is ~1 in 2.8 trillion
        // Silently return true - this is expected behavior when users don't have read access to all communities
        return true; // Assume unique if we can't check
    }
}

// Generate unique invite code
async function generateUniqueInviteCode() {
    // Generate a code - 8 alphanumeric chars gives us 2.8 trillion possible codes
    // Even without checking uniqueness, collision probability is extremely low
    const code = generateInviteCode();
    
    // Try to check uniqueness if possible (but don't fail if we can't)
    const isUnique = await isInviteCodeUnique(code);
    if (isUnique) {
        return code;
    }
    
    // If somehow not unique (very unlikely), try a few more times
    let attempts = 0;
    let newCode = code;
    while (attempts < 5) {
        newCode = generateInviteCode();
        const checkUnique = await isInviteCodeUnique(newCode);
        if (checkUnique) {
            return newCode;
        }
        attempts++;
    }
    
    // If we still can't verify after 5 attempts, just return a code anyway
    // The collision probability is so low it's acceptable
    return newCode || generateInviteCode();
}

// Open community creation modal
function openCommunityModal() {
    if (!communityModal) return;
    communityModal.classList.remove('hide');
    document.body.classList.add('no-scroll');
    // Reset and focus name input
    if (communityNameInput) {
        communityNameInput.value = '';
        communityNameInput.disabled = false;
        communityNameInput.readOnly = false;
        // Use setTimeout to ensure modal is visible before focusing
        setTimeout(() => {
            communityNameInput.focus();
        }, 100);
    }
}

// Export functions for use by chat-init.js
if (!window.communityModule) {
    window.communityModule = {};
}
window.communityModule.openCommunityModal = openCommunityModal;
window.communityModule.loadUserCommunities = loadUserCommunities;

// Handle PFP upload
function handlePfpUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    
    // Validate file size (max 1MB = 1,048,576 bytes)
    const maxSizeBytes = 1024 * 1024; // 1MB
    const fileSizeKB = (file.size / 1024).toFixed(2);
    const maxSizeKB = (maxSizeBytes / 1024).toFixed(2);
    
    console.log('PFP upload validation:', {
        fileName: file.name,
        fileSize: file.size,
        fileSizeKB: fileSizeKB + ' KB',
        fileSizeMB: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        maxSizeBytes: maxSizeBytes,
        maxSizeKB: maxSizeKB + ' KB',
        isValid: file.size <= maxSizeBytes
    });
    
    if (file.size > maxSizeBytes) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        alert(`Image size (${fileSizeMB} MB) must be less than 1MB (${maxSizeKB} KB). Please choose a smaller image.`);
        // Reset the input so user can try again
        if (communityPfpInput) {
            communityPfpInput.value = '';
        }
        return;
    }
    
    // Validate image dimensions (max 100x100px)
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (event) => {
        img.onload = () => {
            if (img.width > 100 || img.height > 100) {
                alert(`Image dimensions (${img.width}x${img.height}px) must be 100x100px or smaller. Please resize your image.`);
                if (communityPfpInput) {
                    communityPfpInput.value = '';
                }
                return;
            }
            
            // Valid image
            pfpFile = file;
            pfpDataUrl = event.target.result;
            
            if (pfpPreviewImage) {
                pfpPreviewImage.src = pfpDataUrl;
                pfpPreviewImage.classList.remove('hide');
            }
            if (pfpPlaceholder) {
                pfpPlaceholder.classList.add('hide');
            }
            if (pfpRemoveBtn) {
                pfpRemoveBtn.classList.remove('hide');
            }
        };
        img.src = event.target.result;
    };
    
    reader.readAsDataURL(file);
}

// Handle PFP removal
function handlePfpRemove() {
    pfpFile = null;
    pfpDataUrl = null;
    if (communityPfpInput) {
        communityPfpInput.value = '';
    }
    if (pfpPreviewImage) {
        pfpPreviewImage.src = '';
        pfpPreviewImage.classList.add('hide');
    }
    if (pfpPlaceholder) {
        pfpPlaceholder.classList.remove('hide');
    }
    if (pfpRemoveBtn) {
        pfpRemoveBtn.classList.add('hide');
    }
}

// Handle settings PFP upload
function handleSettingsPfpUpload(e, previewImage, placeholder, removeBtn) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    
    // Validate file size (max 1MB = 1,048,576 bytes)
    const maxSizeBytes = 1024 * 1024; // 1MB
    const fileSizeKB = (file.size / 1024).toFixed(2);
    const maxSizeKB = (maxSizeBytes / 1024).toFixed(2);
    
    if (file.size > maxSizeBytes) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        alert(`Image size (${fileSizeMB} MB) must be less than 1MB (${maxSizeKB} KB). Please choose a smaller image.`);
        const settingsPfpInput = document.getElementById('settingsCommunityPfp');
        if (settingsPfpInput) {
            settingsPfpInput.value = '';
        }
        return;
    }
    
    // Validate image dimensions (max 100x100px)
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (event) => {
        img.onload = () => {
            if (img.width > 100 || img.height > 100) {
                alert(`Image dimensions (${img.width}x${img.height}px) must be 100x100px or smaller. Please resize your image.`);
                const settingsPfpInput = document.getElementById('settingsCommunityPfp');
                if (settingsPfpInput) {
                    settingsPfpInput.value = '';
                }
                return;
            }
            
            // Valid image
            settingsPfpFile = file;
            settingsPfpDataUrl = event.target.result;
            
            if (previewImage) {
                previewImage.src = settingsPfpDataUrl;
                previewImage.classList.remove('hide');
            }
            if (placeholder) {
                placeholder.classList.add('hide');
            }
            if (removeBtn) {
                removeBtn.classList.remove('hide');
            }
        };
        img.src = event.target.result;
    };
    
    reader.readAsDataURL(file);
}

// Handle settings PFP removal
function handleSettingsPfpRemove(previewImage, placeholder, removeBtn) {
    settingsPfpFile = null;
    settingsPfpDataUrl = null;
    settingsPfpRemoved = true; // Mark as removed
    const settingsPfpInput = document.getElementById('settingsCommunityPfp');
    if (settingsPfpInput) {
        settingsPfpInput.value = '';
    }
    if (previewImage) {
        previewImage.src = '';
        previewImage.classList.add('hide');
    }
    if (placeholder) {
        placeholder.classList.remove('hide');
    }
    if (removeBtn) {
        removeBtn.classList.add('hide');
    }
}

// Close community creation modal
function closeCommunityModal() {
    if (!communityModal) return;
    communityModal.classList.add('hide');
    document.body.classList.remove('no-scroll');
    if (communityCreateForm) {
        communityCreateForm.reset();
        // Reset PFP
        handlePfpRemove();
        // Reset character counters
        if (nameCharCount) nameCharCount.textContent = '0';
        if (descriptionCharCount) descriptionCharCount.textContent = '0';
    }
}

// Handle create community form submission
async function handleCreateCommunity(e) {
    e.preventDefault();
    
    if (!currentUser || !userProfile) {
        alert('You must be logged in to create a community');
        return;
    }
    
    const name = communityNameInput?.value.trim() || '';
    const description = communityDescriptionInput?.value.trim() || '';
    // Handle radio buttons for isPublic
    const isPublicRadio = document.querySelector('input[name="isPublic"]:checked');
    const isPublic = isPublicRadio ? isPublicRadio.value === 'true' : true;
    
    if (!name) {
        alert('Please enter a community name');
        return;
    }
    
    if (name.length > 50) {
        alert('Community name must be 50 characters or less');
        return;
    }
    
    const submitBtn = document.getElementById('communitySubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
    }
    
    try {
        // Generate unique invite code
        const inviteCode = await generateUniqueInviteCode();
        
        // Create community document
        // Default to ape emoji if no PFP is uploaded
        const communityData = {
            name: name,
            description: description || '',
            creatorId: currentUser.uid,
            createdAt: serverTimestamp(),
            isPublic: isPublic,
            inviteCode: inviteCode,
            memberCount: 1,
            pfpUrl: pfpDataUrl || null, // Store PFP as data URL (or upload to Storage later)
            emoji: pfpDataUrl ? null : '🦍', // Default to ape emoji if no PFP
            settings: {
                allowInvites: true,
                approvalRequired: false
            }
        };
        
        const communityRef = await addDoc(collection(db, 'communities'), communityData);
        const communityId = communityRef.id;
        
        // Add creator as owner in members subcollection
        await setDoc(doc(db, 'communities', communityId, 'members', currentUser.uid), {
            userId: currentUser.uid,
            role: 'owner',
            joinedAt: serverTimestamp()
        });
        
        // Close modal
        closeCommunityModal();
        
        // Reload user communities and switch to new community
        await loadUserCommunities();
        
        // Switch to the new community chat
        if (window.switchToCommunity) {
            window.switchToCommunity(communityId);
        }
        
        showToast('Community created successfully!');
    } catch (error) {
        console.error('Error creating community:', error);
        alert('Failed to create community. Please try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Community';
        }
    }
}

// Helper function to get actual member count from subcollection
async function getActualMemberCount(communityId) {
    try {
        const membersRef = collection(db, 'communities', communityId, 'members');
        const membersSnapshot = await getDocs(membersRef);
        return membersSnapshot.size;
    } catch (error) {
        console.warn(`Could not get member count for community ${communityId}:`, error);
        return null;
    }
}

// Load user's communities
async function loadUserCommunities() {
    if (!currentUser) return;
    
    try {
        const DEFAULT_COMMUNITY_ID = 'default';
        
        // Always include default community first
        const defaultCommunityRef = doc(db, 'communities', DEFAULT_COMMUNITY_ID);
        let defaultCommunityDoc;
        
        try {
            defaultCommunityDoc = await getDoc(defaultCommunityRef);
        } catch (readError) {
            // If we can't read, the community might not exist or we don't have permission
            console.warn('Could not read default community:', readError);
            defaultCommunityDoc = { exists: () => false };
        }
        
        const communities = [];
        
        // Add default community if it exists
        if (defaultCommunityDoc.exists && defaultCommunityDoc.exists()) {
            const defaultData = defaultCommunityDoc.data();
            // Check if user is a member
            try {
                const memberRef = doc(db, 'communities', DEFAULT_COMMUNITY_ID, 'members', currentUser.uid);
                const memberDoc = await getDoc(memberRef);
                
                if (memberDoc.exists() || defaultData.isDefault) {
                    // Auto-join if not already a member
                    if (!memberDoc.exists()) {
                        try {
                            await setDoc(memberRef, {
                                userId: currentUser.uid,
                                role: 'member',
                                joinedAt: serverTimestamp()
                            });
                        } catch (joinError) {
                            console.warn('Could not auto-join default community:', joinError);
                        }
                    }
                    
                    // Get actual member count
                    const actualCount = await getActualMemberCount(DEFAULT_COMMUNITY_ID);
                    const memberCount = actualCount !== null ? actualCount : (defaultData.memberCount || 0);
                    
                    communities.push({ 
                        id: DEFAULT_COMMUNITY_ID, 
                        ...defaultData,
                        memberCount: memberCount,
                        isDefault: true
                    });
                    
                    // Update stored count if different (async, don't wait)
                    if (actualCount !== null && actualCount !== defaultData.memberCount) {
                        updateDoc(defaultCommunityRef, { memberCount: actualCount }).catch(err => {
                            console.warn('Could not update member count for default community:', err);
                        });
                    }
                }
            } catch (memberError) {
                // If we can't check/add membership, still add the community if it's the default
                if (defaultData.isDefault) {
                    // Get actual member count
                    const actualCount = await getActualMemberCount(DEFAULT_COMMUNITY_ID);
                    const memberCount = actualCount !== null ? actualCount : (defaultData.memberCount || 0);
                    
                    communities.push({ 
                        id: DEFAULT_COMMUNITY_ID, 
                        ...defaultData,
                        memberCount: memberCount,
                        isDefault: true
                    });
                }
            }
        }
        
        // Get communities created by user
        const communitiesRef = collection(db, 'communities');
        const q = query(
            communitiesRef,
            where('creatorId', '==', currentUser.uid)
        );
        const snapshot = await getDocs(q);
        
        // Load member counts for user's communities
        const communityPromises = snapshot.docs.map(async (docSnapshot) => {
            if (docSnapshot.id === DEFAULT_COMMUNITY_ID) return null; // Already added
            
            const communityData = docSnapshot.data();
            // Get actual member count
            const actualCount = await getActualMemberCount(docSnapshot.id);
            const memberCount = actualCount !== null ? actualCount : (communityData.memberCount || 0);
            
            // Update stored count if different (async, don't wait)
            if (actualCount !== null && actualCount !== communityData.memberCount) {
                updateDoc(doc(db, 'communities', docSnapshot.id), { memberCount: actualCount }).catch(err => {
                    console.warn(`Could not update member count for community ${docSnapshot.id}:`, err);
                });
            }
            
            return { id: docSnapshot.id, ...communityData, memberCount: memberCount };
        });
        
        const userCreatedCommunities = (await Promise.all(communityPromises)).filter(c => c !== null);
        communities.push(...userCreatedCommunities);
        
        // Get communities where user is a member (by checking members subcollection)
        // Note: This is limited - we check known communities
        // For better performance, consider maintaining a userCommunities array in user profile
        try {
            const allCommunitiesQuery = query(
                communitiesRef,
                where('isPublic', '==', true),
                limit(50)
            );
            const allCommunitiesSnapshot = await getDocs(allCommunitiesQuery);
            
            const memberCommunityPromises = allCommunitiesSnapshot.docs.map(async (commDoc) => {
                if (commDoc.id === DEFAULT_COMMUNITY_ID) return null; // Already added
                
                // Check if already in list
                if (communities.find(c => c.id === commDoc.id)) return null;
                
                try {
                    const memberRef = doc(db, 'communities', commDoc.id, 'members', currentUser.uid);
                    const memberDoc = await getDoc(memberRef);
                    
                    if (memberDoc.exists()) {
                        const communityData = commDoc.data();
                        // Get actual member count
                        const actualCount = await getActualMemberCount(commDoc.id);
                        const memberCount = actualCount !== null ? actualCount : (communityData.memberCount || 0);
                        
                        // Update stored count if different (async, don't wait)
                        if (actualCount !== null && actualCount !== communityData.memberCount) {
                            updateDoc(doc(db, 'communities', commDoc.id), { memberCount: actualCount }).catch(err => {
                                console.warn(`Could not update member count for community ${commDoc.id}:`, err);
                            });
                        }
                        
                        return { id: commDoc.id, ...communityData, memberCount: memberCount };
                    }
                } catch (memberError) {
                    // Skip if we can't check membership (permission issue)
                    console.warn(`Could not check membership for community ${commDoc.id}:`, memberError);
                }
                
                return null;
            });
            
            const memberCommunities = (await Promise.all(memberCommunityPromises)).filter(c => c !== null);
            communities.push(...memberCommunities);
        } catch (queryError) {
            // If query fails, just continue with what we have
            console.warn('Could not query public communities:', queryError);
        }
        
        userCommunities = communities;
        
        // Export to window for chat-init.js access
        if (!window.communityModule) {
            window.communityModule = {};
        }
        // Update userCommunities - delete and recreate if it exists as a getter
        try {
            delete window.communityModule.userCommunities;
        } catch (e) {
            // Ignore if can't delete
        }
        window.communityModule.userCommunities = userCommunities;
        
        // Update channel switcher if it exists
        if (window.updateChannelSwitcher) {
            window.updateChannelSwitcher();
        }
        
        // Update community selector if it exists
        if (window.updateCommunitySelector) {
            window.updateCommunitySelector();
        }
    } catch (error) {
        console.error('Error loading user communities:', error);
    }
}

// Open join community modal
function openCommunityJoinModal() {
    if (!communityJoinModal) return;
    communityJoinModal.classList.remove('hide');
    document.body.style.overflow = 'hidden';
    const inviteCodeInput = document.getElementById('inviteCode');
    if (inviteCodeInput) inviteCodeInput.focus();
}

// Close join community modal
function closeCommunityJoinModal() {
    if (!communityJoinModal) return;
    communityJoinModal.classList.add('hide');
    document.body.style.overflow = '';
    const inviteCodeInput = document.getElementById('inviteCode');
    if (inviteCodeInput) inviteCodeInput.value = '';
}

// Handle join community
async function handleJoinCommunity() {
    if (!currentUser || !userProfile) {
        alert('You must be logged in to join a community');
        return;
    }
    
    const inviteCodeInput = document.getElementById('inviteCode');
    if (!inviteCodeInput) return;
    
    const inviteCode = inviteCodeInput.value.trim().toUpperCase();
    
    if (!inviteCode) {
        alert('Please enter an invite code');
        return;
    }
    
    const submitBtn = document.getElementById('communityJoinSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Joining...';
    }
    
    try {
        // Find community by invite code
        const communitiesRef = collection(db, 'communities');
        const q = query(communitiesRef, where('inviteCode', '==', inviteCode));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            alert('Invalid invite code');
            return;
        }
        
        const communityDoc = snapshot.docs[0];
        const communityId = communityDoc.id;
        const communityData = communityDoc.data();
        
        // Check if user is already a member
        const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        
        if (memberDoc.exists()) {
            alert('You are already a member of this community');
            closeCommunityJoinModal();
            if (window.switchToCommunity) {
                window.switchToCommunity(communityId);
            }
            return;
        }
        
        // Add user as member
        const batch = writeBatch(db);
        
        batch.set(memberRef, {
            userId: currentUser.uid,
            role: 'member',
            joinedAt: serverTimestamp()
        });
        
        // Update member count
        batch.update(doc(db, 'communities', communityId), {
            memberCount: (communityData.memberCount || 0) + 1
        });
        
        await batch.commit();
        
        closeCommunityJoinModal();
        
        // Reload communities and switch to joined community
        await loadUserCommunities();
        
        if (window.switchToCommunity) {
            window.switchToCommunity(communityId);
        }
        
        showToast('Successfully joined community!');
    } catch (error) {
        console.error('Error joining community:', error);
        alert('Failed to join community. Please try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Join';
        }
    }
}

// Open community discovery modal
function openCommunityDiscoveryModal() {
    if (!communityDiscoveryModal) return;
    communityDiscoveryModal.classList.remove('hide');
    document.body.style.overflow = 'hidden';
    loadPublicCommunities();
}

// Close community discovery modal
function closeCommunityDiscoveryModal() {
    if (!communityDiscoveryModal) return;
    communityDiscoveryModal.classList.add('hide');
    document.body.style.overflow = '';
    const searchInput = document.getElementById('communitySearchInput');
    if (searchInput) searchInput.value = '';
}

// Load public communities
async function loadPublicCommunities(searchTerm = '') {
    const communityList = document.getElementById('communityList');
    if (!communityList) return;
    
    communityList.innerHTML = '<div class="community-loading">Loading communities...</div>';
    
    try {
        const communitiesRef = collection(db, 'communities');
        let q = query(
            communitiesRef,
            where('isPublic', '==', true),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        
        const snapshot = await getDocs(q);
        const communities = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!searchTerm || data.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (data.description && data.description.toLowerCase().includes(searchTerm.toLowerCase()))) {
                communities.push({ id: doc.id, ...data });
            }
        });
        
        if (communities.length === 0) {
            communityList.innerHTML = '<div class="community-empty">No communities found</div>';
            return;
        }
        
        // Check which communities user is already a member of
        const memberPromises = communities.map(async (community) => {
            if (!currentUser) return { ...community, isMember: false };
            const memberRef = doc(db, 'communities', community.id, 'members', currentUser.uid);
            const memberDoc = await getDoc(memberRef);
            return { ...community, isMember: memberDoc.exists() };
        });
        
        const communitiesWithMembership = await Promise.all(memberPromises);
        
        communityList.innerHTML = communitiesWithMembership.map(community => {
            const createdAt = community.createdAt?.toDate ? community.createdAt.toDate() : new Date();
            const dateStr = createdAt.toLocaleDateString();
            
            return `
                <div class="community-item">
                    <div class="community-item-header">
                        <h3>${escapeHtml(community.name)}</h3>
                        <span class="community-member-count">${community.memberCount || 0} members</span>
                    </div>
                    ${community.description ? `<p class="community-item-description">${escapeHtml(community.description)}</p>` : ''}
                    <div class="community-item-footer">
                        <span class="community-item-date">Created ${dateStr}</span>
                        ${community.isMember 
                            ? '<button class="btn btn-secondary btn-sm" disabled>Joined</button>'
                            : `<button class="btn btn-primary btn-sm" data-community-id="${community.id}" data-join-community>Join</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners to join buttons
        communityList.querySelectorAll('[data-join-community]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const communityId = btn.getAttribute('data-community-id');
                await joinCommunityById(communityId);
            });
        });
    } catch (error) {
        console.error('Error loading public communities:', error);
        communityList.innerHTML = '<div class="community-error">Error loading communities</div>';
    }
}

// Join community by ID
async function joinCommunityById(communityId) {
    if (!currentUser) {
        alert('You must be logged in to join a community');
        return;
    }
    
    try {
        // Check if already a member
        const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        
        if (memberDoc.exists()) {
            alert('You are already a member of this community');
            if (window.switchToCommunity) {
                window.switchToCommunity(communityId);
            }
            return;
        }
        
        // Get community data
        const communityDoc = await getDoc(doc(db, 'communities', communityId));
        if (!communityDoc.exists()) {
            alert('Community not found');
            return;
        }
        
        const communityData = communityDoc.data();
        
        // Add user as member
        const batch = writeBatch(db);
        
        batch.set(memberRef, {
            userId: currentUser.uid,
            role: 'member',
            joinedAt: serverTimestamp()
        });
        
        // Update member count
        batch.update(doc(db, 'communities', communityId), {
            memberCount: (communityData.memberCount || 0) + 1
        });
        
        await batch.commit();
        
        // Reload communities and switch
        await loadUserCommunities();
        await loadPublicCommunities();
        
        if (window.switchToCommunity) {
            window.switchToCommunity(communityId);
        }
        
        showToast('Successfully joined community!');
    } catch (error) {
        console.error('Error joining community:', error);
        alert('Failed to join community. Please try again.');
    }
}

// Handle community search
function handleCommunitySearch(e) {
    const searchTerm = e.target.value.trim();
    loadPublicCommunities(searchTerm);
}

// Open community settings modal
async function openCommunitySettingsModal(communityId) {
    if (!communitySettingsModal || !currentUser) return;
    
    try {
        const communityDoc = await getDoc(doc(db, 'communities', communityId));
        if (!communityDoc.exists()) {
            alert('Community not found');
            return;
        }
        
        const communityData = communityDoc.data();
        
        // Check if user is owner/admin
        const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        
        if (!memberDoc.exists()) {
            alert('You do not have permission to edit this community');
            return;
        }
        
        const memberData = memberDoc.data();
        if (!['owner', 'admin'].includes(memberData.role)) {
            alert('Only owners and admins can edit community settings');
            return;
        }
        
        // Populate form
        const nameInput = document.getElementById('settingsCommunityName');
        const descInput = document.getElementById('settingsCommunityDescription');
        const isPublicInput = document.getElementById('settingsCommunityIsPublic');
        const inviteLinkInput = document.getElementById('communityInviteLink');
        const settingsPfpPreviewImage = document.getElementById('settingsPfpPreviewImage');
        const settingsPfpPlaceholder = document.getElementById('settingsPfpPreview')?.querySelector('.pfp-placeholder');
        const settingsPfpRemoveBtn = document.getElementById('settingsPfpRemoveBtn');
        
        if (nameInput) nameInput.value = communityData.name || '';
        if (descInput) descInput.value = communityData.description || '';
        if (isPublicInput) isPublicInput.checked = communityData.isPublic || false;
        if (inviteLinkInput) {
            const inviteUrl = `${window.location.origin}/community?invite=${communityData.inviteCode}`;
            inviteLinkInput.value = inviteUrl;
        }
        
        // Populate PFP preview if exists
        if (communityData.pfpUrl) {
            if (settingsPfpPreviewImage) {
                settingsPfpPreviewImage.src = communityData.pfpUrl;
                settingsPfpPreviewImage.classList.remove('hide');
            }
            if (settingsPfpPlaceholder) {
                settingsPfpPlaceholder.classList.add('hide');
            }
            if (settingsPfpRemoveBtn) {
                settingsPfpRemoveBtn.classList.remove('hide');
            }
        } else {
            if (settingsPfpPreviewImage) {
                settingsPfpPreviewImage.src = '';
                settingsPfpPreviewImage.classList.add('hide');
            }
            if (settingsPfpPlaceholder) {
                settingsPfpPlaceholder.classList.remove('hide');
            }
            if (settingsPfpRemoveBtn) {
                settingsPfpRemoveBtn.classList.add('hide');
            }
        }
        
        // Reset settings PFP state
        settingsPfpFile = null;
        settingsPfpDataUrl = null;
        settingsPfpRemoved = false; // Reset removal flag
        
        // Store community ID for form submission
        communitySettingsModal.setAttribute('data-community-id', communityId);
        
        communitySettingsModal.classList.remove('hide');
        document.body.classList.add('no-scroll');
    } catch (error) {
        console.error('Error opening community settings:', error);
        alert('Failed to load community settings');
    }
}

// Close community settings modal
function closeCommunitySettingsModal() {
    if (!communitySettingsModal) return;
    communitySettingsModal.classList.add('hide');
    document.body.style.overflow = '';
    const form = document.getElementById('communitySettingsForm');
    if (form) form.reset();
    
    // Reset settings PFP state
    settingsPfpFile = null;
    settingsPfpDataUrl = null;
    settingsPfpRemoved = false; // Reset removal flag
    const settingsPfpInput = document.getElementById('settingsCommunityPfp');
    const settingsPfpPreviewImage = document.getElementById('settingsPfpPreviewImage');
    const settingsPfpPlaceholder = document.getElementById('settingsPfpPreview')?.querySelector('.pfp-placeholder');
    const settingsPfpRemoveBtn = document.getElementById('settingsPfpRemoveBtn');
    
    if (settingsPfpInput) settingsPfpInput.value = '';
    if (settingsPfpPreviewImage) {
        settingsPfpPreviewImage.src = '';
        settingsPfpPreviewImage.classList.add('hide');
    }
    if (settingsPfpPlaceholder) settingsPfpPlaceholder.classList.remove('hide');
    if (settingsPfpRemoveBtn) settingsPfpRemoveBtn.classList.add('hide');
}

// Handle update community settings
async function handleUpdateCommunitySettings(e) {
    e.preventDefault();
    
    if (!currentUser) return;
    
    const communityId = communitySettingsModal.getAttribute('data-community-id');
    if (!communityId) return;
    
    const nameInput = document.getElementById('settingsCommunityName');
    const descInput = document.getElementById('settingsCommunityDescription');
    const isPublicInput = document.getElementById('settingsCommunityIsPublic');
    
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const isPublic = isPublicInput.checked;
    
    if (!name) {
        alert('Please enter a community name');
        return;
    }
    
    const submitBtn = document.getElementById('communitySettingsSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }
    
    try {
        const updateData = {
            name: name,
            description: description || '',
            isPublic: isPublic
        };
        
        // Update PFP if changed
        if (settingsPfpDataUrl) {
            // New PFP uploaded
            updateData.pfpUrl = settingsPfpDataUrl;
            updateData.emoji = null; // Clear emoji if PFP is set
        } else if (settingsPfpRemoved) {
            // PFP was removed - set to ape emoji
            updateData.pfpUrl = null;
            updateData.emoji = '🦍';
        }
        // If neither, keep existing PFP/emoji (no change)
        
        await updateDoc(doc(db, 'communities', communityId), updateData);
        
        closeCommunitySettingsModal();
        await loadUserCommunities();
        
        if (window.updateChannelSwitcher) {
            window.updateChannelSwitcher();
        }
        
        // Update community selector to show new PFP
        if (window.updateCommunitySelector) {
            window.updateCommunitySelector();
        }
        
        // Update settings button visibility
        if (window.updateCommunitySettingsButton) {
            await window.updateCommunitySettingsButton(communityId);
        }
        
        showToast('Community settings updated!');
    } catch (error) {
        console.error('Error updating community settings:', error);
        alert('Failed to update community settings');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
}

// Handle copy invite link
async function handleCopyInviteLink() {
    const inviteLinkInput = document.getElementById('communityInviteLink');
    if (!inviteLinkInput || !inviteLinkInput.value) {
        alert('Invite link is not available');
        return;
    }
    
    const textToCopy = inviteLinkInput.value;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(textToCopy);
            showToast('Invite link copied!');
            return;
        } catch (err) {
            console.warn('Clipboard API failed, trying fallback:', err);
        }
    }
    
    // Fallback for older browsers
    try {
        inviteLinkInput.select();
        inviteLinkInput.setSelectionRange(0, 99999); // For mobile devices
        document.execCommand('copy');
        inviteLinkInput.setSelectionRange(0, 0); // Deselect
        showToast('Invite link copied!');
    } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy invite link. Please select and copy manually.');
    }
}

// Handle regenerate invite code
async function handleRegenerateInviteCode() {
    if (!currentUser) return;
    
    const communityId = communitySettingsModal.getAttribute('data-community-id');
    if (!communityId) return;
    
    if (!confirm('Are you sure you want to regenerate the invite code? The old code will no longer work.')) {
        return;
    }
    
    try {
        const newCode = await generateUniqueInviteCode();
        
        await updateDoc(doc(db, 'communities', communityId), {
            inviteCode: newCode
        });
        
        // Update invite link display
        const inviteLinkInput = document.getElementById('communityInviteLink');
        if (inviteLinkInput) {
            const inviteUrl = `${window.location.origin}/community?invite=${newCode}`;
            inviteLinkInput.value = inviteUrl;
        }
        
        showToast('Invite code regenerated!');
    } catch (error) {
        console.error('Error regenerating invite code:', error);
        alert('Failed to regenerate invite code');
    }
}

// Open community members modal
async function openCommunityMembersModal(communityId) {
    if (!communityMembersModal || !currentUser) return;
    
    try {
        // Check if user is a member
        const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        
        if (!memberDoc.exists()) {
            alert('You must be a member to view members');
            return;
        }
        
        const memberData = memberDoc.data();
        const isOwnerOrAdmin = ['owner', 'admin'].includes(memberData.role);
        
        // Load members
        const membersRef = collection(db, 'communities', communityId, 'members');
        const q = query(membersRef, orderBy('joinedAt', 'asc'));
        const snapshot = await getDocs(q);
        
        const members = [];
        snapshot.forEach(doc => {
            members.push({ id: doc.id, ...doc.data() });
        });
        
        // Load user profiles for members
        const membersList = document.getElementById('communityMembersList');
        if (!membersList) return;
        
        membersList.innerHTML = '<div class="community-loading">Loading members...</div>';
        
        const membersWithProfiles = await Promise.all(members.map(async (member) => {
            try {
                const userDoc = await getDoc(doc(db, 'users', member.userId));
                if (userDoc.exists()) {
                    return { ...member, profile: userDoc.data() };
                }
            } catch (error) {
                console.error('Error loading user profile:', error);
            }
            return { ...member, profile: null };
        }));
        
        // Sort by role (owner, admin, moderator, member)
        const roleOrder = { owner: 0, admin: 1, moderator: 2, member: 3 };
        membersWithProfiles.sort((a, b) => {
            return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
        });
        
        membersList.innerHTML = membersWithProfiles.map(member => {
            const profile = member.profile;
            const username = profile?.username || 'Unknown';
            const joinedAt = member.joinedAt?.toDate ? member.joinedAt.toDate() : new Date();
            const dateStr = joinedAt.toLocaleDateString();
            
            return `
                <div class="community-member-item">
                    <div class="community-member-info">
                        <span class="community-member-name">${escapeHtml(username)}</span>
                        <span class="community-member-role">${member.role}</span>
                    </div>
                    <div class="community-member-meta">
                        <span class="community-member-date">Joined ${dateStr}</span>
                        ${isOwnerOrAdmin && member.role !== 'owner' && member.userId !== currentUser.uid
                            ? `<button class="btn btn-danger btn-sm" data-remove-member data-member-id="${member.userId}">Remove</button>`
                            : ''
                        }
                        ${memberData.role === 'owner' && member.role === 'member'
                            ? `<button class="btn btn-secondary btn-sm" data-promote-member data-member-id="${member.userId}">Make Admin</button>`
                            : ''
                        }
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners
        membersList.querySelectorAll('[data-remove-member]').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberId = btn.getAttribute('data-member-id');
                handleRemoveMember(communityId, memberId);
            });
        });
        
        membersList.querySelectorAll('[data-promote-member]').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberId = btn.getAttribute('data-member-id');
                handlePromoteMember(communityId, memberId);
            });
        });
        
        communityMembersModal.setAttribute('data-community-id', communityId);
        communityMembersModal.classList.remove('hide');
        document.body.classList.add('no-scroll');
    } catch (error) {
        console.error('Error opening community members:', error);
        alert('Failed to load members');
    }
}

// Close community members modal
function closeCommunityMembersModal() {
    if (!communityMembersModal) return;
    communityMembersModal.classList.add('hide');
    document.body.style.overflow = '';
}

// Handle remove member
async function handleRemoveMember(communityId, memberId) {
    if (!currentUser) return;
    
    if (!confirm('Are you sure you want to remove this member?')) {
        return;
    }
    
    try {
        // Check permissions
        const currentMemberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const currentMemberDoc = await getDoc(currentMemberRef);
        
        if (!currentMemberDoc.exists()) {
            alert('You do not have permission');
            return;
        }
        
        const currentMemberData = currentMemberDoc.data();
        if (!['owner', 'admin'].includes(currentMemberData.role)) {
            alert('Only owners and admins can remove members');
            return;
        }
        
        // Get member to remove
        const memberRef = doc(db, 'communities', communityId, 'members', memberId);
        const memberDoc = await getDoc(memberRef);
        
        if (!memberDoc.exists()) {
            alert('Member not found');
            return;
        }
        
        const memberData = memberDoc.data();
        
        // Prevent removing owner
        if (memberData.role === 'owner') {
            alert('Cannot remove the community owner');
            return;
        }
        
        // Remove member
        const batch = writeBatch(db);
        batch.delete(memberRef);
        
        // Update member count
        const communityDoc = await getDoc(doc(db, 'communities', communityId));
        const communityData = communityDoc.data();
        batch.update(doc(db, 'communities', communityId), {
            memberCount: Math.max(0, (communityData.memberCount || 1) - 1)
        });
        
        await batch.commit();
        
        // Reload members list
        await openCommunityMembersModal(communityId);
        
        showToast('Member removed');
    } catch (error) {
        console.error('Error removing member:', error);
        alert('Failed to remove member');
    }
}

// Handle promote member to admin
async function handlePromoteMember(communityId, memberId) {
    if (!currentUser) return;
    
    if (!confirm('Promote this member to admin? Admins can manage members and settings.')) {
        return;
    }
    
    try {
        // Check if current user is owner
        const currentMemberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
        const currentMemberDoc = await getDoc(currentMemberRef);
        
        if (!currentMemberDoc.exists() || currentMemberDoc.data().role !== 'owner') {
            alert('Only the owner can promote members to admin');
            return;
        }
        
        // Promote member
        await updateDoc(doc(db, 'communities', communityId, 'members', memberId), {
            role: 'admin'
        });
        
        // Reload members list
        await openCommunityMembersModal(communityId);
        
        showToast('Member promoted to admin');
    } catch (error) {
        console.error('Error promoting member:', error);
        alert('Failed to promote member');
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility function to show toast
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

// Close mobile drawer helper (if exists)
function closeMobileDrawer() {
    if (window.closeMobileDrawer) {
        window.closeMobileDrawer();
    } else {
        const drawerOverlay = document.getElementById('chatDrawerOverlay');
        const drawer = document.getElementById('chatMobileDrawer');
        
        if (drawerOverlay && drawer) {
            drawerOverlay.classList.add('hide');
            drawer.classList.add('hide');
            document.body.classList.remove('no-scroll');
        }
    }
}

// Export functions for use in chat-init.js
window.communityModule = {
    openCommunityJoinModal,
    openCommunityDiscoveryModal,
    openCommunitySettingsModal,
    openCommunityMembersModal,
    loadUserCommunities,
    get userCommunities() { return userCommunities; }
};
