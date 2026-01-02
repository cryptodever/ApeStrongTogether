/**
 * Profile Page Initialization Module
 * Handles authentication gate, profile loading, and saving to Firestore
 */

import { auth, db, app } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { 
    doc, 
    getDoc, 
    getDocs,
    setDoc, 
    deleteDoc,
    writeBatch,
    collection,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js';

// Initialize auth gate for profile page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Profile init: Auth gate initialization error:', error);
        // If auth gate fails, show overlay as fallback
        const overlay = document.getElementById('authGateOverlay');
        if (overlay) {
            overlay.classList.add('show');
        }
    }
})();

// Profile state
let currentUser = null;
let profileListener = null;
let postsListener = null;
let isSaving = false;
let isVerifying = false;

// Initialize profile page
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadProfile();
        setupEventListeners();
        loadProfilePosts();
    } else {
        // Clean up listener when user logs out
        if (profileListener) {
            profileListener();
            profileListener = null;
        }
        if (followersListener) {
            followersListener();
            followersListener = null;
        }
        if (followingListener) {
            followingListener();
            followingListener = null;
        }
        if (postsListener) {
            postsListener();
            postsListener = null;
        }
        currentUser = null;
        listenersAttached = false; // Reset flag for next login
    }
});

// Check and reset rate limits if 24 hours have passed
async function checkAndResetRateLimit(userData, userDocRef) {
    const attempts = userData.xVerificationAttempts || 0;
    const firstAttemptAt = userData.xVerificationFirstAttemptAt;
    const RATE_LIMIT_HOURS = 24;
    
    if (firstAttemptAt && attempts > 0) {
        const firstAttemptTime = new Date(firstAttemptAt).getTime();
        const now = Date.now();
        const hoursSinceFirstAttempt = (now - firstAttemptTime) / (1000 * 60 * 60);
        
        if (hoursSinceFirstAttempt >= RATE_LIMIT_HOURS) {
            // Reset attempts after 24 hours
            await setDoc(userDocRef, {
                xVerificationAttempts: 0,
                xVerificationFirstAttemptAt: null
            }, { merge: true });
            return true; // Rate limit was reset
        }
    }
    return false; // Rate limit not reset
}

// Load user profile from Firestore
async function loadProfile() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Set up real-time listener for profile updates
        if (profileListener) {
            profileListener();
        }
        
        profileListener = onSnapshot(userDocRef, async (userDoc) => {
            if (userDoc.exists()) {
                let userData = userDoc.data();
                
                // Check and reset rate limit if needed (only if attempts > 0 to avoid unnecessary writes)
                if ((userData.xVerificationAttempts || 0) > 0) {
                    const wasReset = await checkAndResetRateLimit(userData, userDocRef);
                    // If reset, the listener will fire again with updated data, so we can return early
                    if (wasReset) {
                        return; // Wait for the next snapshot with reset data
                    }
                }
                
                // Load username
                const usernameElement = document.getElementById('profileUsername');
                if (usernameElement && userData.username) {
                    usernameElement.textContent = userData.username;
                }
                
                // Load and sync level from quests system
                const profileRankEl = document.getElementById('profileRank');
                const rankProgressFillEl = document.getElementById('rankProgressFill');
                
                if (profileRankEl || rankProgressFillEl) {
                    try {
                        // Import level calculation functions from quests system
                        const { calculateLevel, getLevelProgress } = await import('/js/quests-init.js');
                        
                        // Calculate level from points (sync with quests system)
                        const points = userData.points || 0;
                        const levelProgress = getLevelProgress(points);
                        const calculatedLevel = levelProgress.level;
                        
                        // Update stored level if it's different (sync)
                        if (userData.level !== calculatedLevel) {
                            const userDocRef = doc(db, 'users', currentUser.uid);
                            await setDoc(userDocRef, {
                                level: calculatedLevel
                            }, { merge: true });
                            userData.level = calculatedLevel;
                        }
                        
                        // Update level display
                        if (profileRankEl) {
                            if (levelProgress.isMaxLevel) {
                                profileRankEl.textContent = 'MAX';
                            } else {
                                profileRankEl.textContent = calculatedLevel;
                            }
                        }
                        
                        // Update level progress bar
                        if (rankProgressFillEl) {
                            if (levelProgress.isMaxLevel) {
                                rankProgressFillEl.style.setProperty('width', '100%');
                            } else {
                                const progressPercent = (levelProgress.xpInCurrentLevel / levelProgress.xpNeededForNextLevel) * 100;
                                rankProgressFillEl.style.setProperty('width', `${Math.min(progressPercent, 100)}%`);
                            }
                        }
                    } catch (error) {
                        console.error('Error syncing level from quests system:', error);
                        // Fallback to stored level or default
                        if (profileRankEl) {
                            profileRankEl.textContent = userData.level || 1;
                        }
                    }
                }
                
                // Load bio
                const bioTextarea = document.getElementById('profileBio');
                if (bioTextarea && userData.bio) {
                    bioTextarea.value = userData.bio;
                    updateCharCount();
                }
                
                // Load country
                const countrySelect = document.getElementById('profileCountry');
                if (countrySelect && userData.country) {
                    countrySelect.value = userData.country;
                }
                
                // Load X account
                const xAccountInput = document.getElementById('profileXAccount');
                if (xAccountInput && userData.xAccount) {
                    xAccountInput.value = userData.xAccount;
                    // Show verification section if X account exists
                    updateXVerificationUI(userData);
                }
                
                // Check if user is already verified and update quest if needed
                // Use setTimeout to ensure quest system is fully initialized
                if (userData.xAccountVerified === true) {
                    setTimeout(async () => {
                        try {
                            const { updateQuestProgress } = await import('/js/quests-init.js');
                            console.log('[loadProfile] User is verified, updating quest progress...');
                            await updateQuestProgress('weekly_verify_x', 1);
                            console.log('[loadProfile] Quest progress updated for verified user');
                        } catch (error) {
                            console.error('[loadProfile] Error updating quest for verified user:', error);
                        }
                    }, 1000);
                }
                
                // Load followers/following counts
                await loadFollowStats(currentUser.uid);
                
                // Sync followers quest progress after loading stats
                // Wait a bit for the listener to set followersCount
                setTimeout(async () => {
                    try {
                        await syncFollowersQuestProgress(followersCount);
                    } catch (error) {
                        console.error('Error syncing followers quest on profile load:', error);
                    }
                }, 1000);
                
                // Load banner image
                const bannerImg = document.getElementById('profileBannerImg');
                if (bannerImg && userData.bannerImage) {
                    // Ensure path starts with / if it's a relative path
                    const bannerPath = userData.bannerImage.startsWith('/') 
                        ? userData.bannerImage 
                        : '/' + userData.bannerImage;
                    bannerImg.src = bannerPath;
                }
                
                // Load banner background
                const bannerBg = document.getElementById('profileBannerBg');
                if (bannerBg && userData.bannerBackground) {
                    // Ensure path starts with / if it's a relative path
                    const bgPath = userData.bannerBackground.startsWith('/')
                        ? userData.bannerBackground
                        : '/' + userData.bannerBackground;
                    bannerBg.style.setProperty('background-image', `url(${bgPath})`);
                }
                
                // Update selected banner in grid (only if bannerImage exists)
                if (userData.bannerImage) {
                    updateBannerSelection(userData.bannerImage);
                }
                
                // Update selected banner background in grid (only if bannerBackground exists)
                if (userData.bannerBackground) {
                    updateBannerBgSelection(userData.bannerBackground);
                }
            } else {
                // Profile doesn't exist yet, use defaults
                console.log('Profile does not exist yet, using defaults');
            }
        }, (error) => {
            console.error('Error loading profile:', error);
            // Provide user feedback for load errors
            if (error.code === 'permission-denied') {
                console.error('Permission denied loading profile. User may not have access.');
            } else if (error.code === 'unavailable') {
                console.error('Firestore unavailable. Check internet connection.');
            }
        });
    } catch (error) {
        console.error('Error setting up profile listener:', error);
    }
}

// Save profile to Firestore
async function saveProfile() {
    if (!currentUser) {
        console.warn('Cannot save profile: user not authenticated');
        return;
    }
    
    if (isSaving) {
        console.warn('Save already in progress, skipping...');
        return;
    }
    
    isSaving = true;
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
    
    try {
        // Validate required elements exist
        const bioTextarea = document.getElementById('profileBio');
        const countrySelect = document.getElementById('profileCountry');
        const bannerImg = document.getElementById('profileBannerImg');
        const bannerBg = document.getElementById('profileBannerBg');
        
        if (!bioTextarea || !countrySelect || !bannerImg || !bannerBg) {
            throw new Error('Required profile elements not found');
        }
        
        const bio = bioTextarea.value || '';
        const country = countrySelect.value || '';
        const xAccount = document.getElementById('profileXAccount')?.value || '';
        
        // Get existing verification status (don't overwrite if verified)
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const existingData = userDoc.exists() ? userDoc.data() : {};
        const xAccountVerified = existingData.xAccountVerified || false;
        
        // Extract banner image path (handle both full URL and relative path)
        let bannerImage = '';
        if (bannerImg.src) {
            try {
                // Extract path from full URL if needed, or use as-is if already a path
                const url = new URL(bannerImg.src, window.location.origin);
                bannerImage = url.pathname;
            } catch (e) {
                // If it's already a relative path, use as-is
                bannerImage = bannerImg.src.startsWith('/') ? bannerImg.src : '/' + bannerImg.src;
            }
        }
        
        // Extract banner background path
        let bannerBackground = '';
        if (bannerBg.style.backgroundImage) {
            const bgMatch = bannerBg.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
            if (bgMatch && bgMatch[1]) {
                // Extract path from full URL if needed
                try {
                    const bgUrl = new URL(bgMatch[1], window.location.origin);
                    bannerBackground = bgUrl.pathname;
                } catch {
                    // If it's already a relative path, ensure it starts with /
                    bannerBackground = bgMatch[1].startsWith('/') ? bgMatch[1] : '/' + bgMatch[1];
                }
            }
        }
        
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Update profile data
        await setDoc(userDocRef, {
            ...existingData,
            bio: bio.trim(),
            country: country,
            xAccount: xAccount.trim(),
            xAccountVerified: xAccountVerified, // Preserve verification status
            bannerImage: bannerImage,
            bannerBackground: bannerBackground,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        // If X account changed, reset verification
        if (xAccount.trim() !== (existingData.xAccount || '')) {
            await setDoc(userDocRef, {
                xAccountVerified: false,
                xVerificationAttempts: 0,
                xVerificationFirstAttemptAt: null // Reset timestamp when account changes
            }, { merge: true });
            updateXVerificationUI({ xAccountVerified: false, xAccount: xAccount.trim() });
        }
        
        console.log('Profile saved successfully', { bio: bio.trim(), country, xAccount: xAccount.trim(), bannerImage, bannerBackground });
        
        // Show success message
        if (saveBtn) {
            saveBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveBtn.textContent = 'Save Profile';
                saveBtn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Error - Try Again';
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission Denied';
            console.error('Firestore permission denied. Check Firestore rules.');
        } else if (error.code === 'unavailable') {
            errorMessage = 'Network Error';
            console.error('Firestore unavailable. Check internet connection.');
        }
        
        if (saveBtn) {
            saveBtn.textContent = errorMessage;
            saveBtn.disabled = false;
            setTimeout(() => {
                saveBtn.textContent = 'Save Profile';
            }, 3000);
        }
    } finally {
        isSaving = false;
    }
}

// Generate unique verification code for user
function generateVerificationCode(uid) {
    // Create a unique code based on user ID and timestamp
    // Format: ATS-[8 character code]
    const timestamp = Date.now().toString(36);
    const uidHash = uid.substring(0, 4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ATS-${uidHash}${random}`;
}

// Get or create verification code for user
async function getOrCreateVerificationCode() {
    if (!currentUser) return null;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Return existing code or generate new one
            if (userData.xVerificationCode) {
                return userData.xVerificationCode;
            }
        }
        
        // Generate new code
        const code = generateVerificationCode(currentUser.uid);
        
        // Save code to Firestore
        await setDoc(userDocRef, {
            xVerificationCode: code,
            xVerificationCodeGeneratedAt: new Date().toISOString()
        }, { merge: true });
        
        return code;
    } catch (error) {
        console.error('Error getting/creating verification code:', error);
        return null;
    }
}

// Update character count for bio
function updateCharCount() {
    const bioTextarea = document.getElementById('profileBio');
    const charCount = document.getElementById('bioCharCount');
    if (bioTextarea && charCount) {
        charCount.textContent = bioTextarea.value.length;
    }
}

// Helper function to normalize paths for comparison
function normalizePath(path) {
    if (!path) return '';
    // Remove leading slash for comparison, handle both /path and path
    return path.startsWith('/') ? path : '/' + path;
}

// Update banner selection in grid
function updateBannerSelection(selectedBanner) {
    if (!selectedBanner) return;
    
    const bannerItems = document.querySelectorAll('#bannerGrid .banner-item');
    const normalizedSelected = normalizePath(selectedBanner);
    
    bannerItems.forEach(item => {
        item.classList.remove('selected');
        const itemPath = normalizePath(item.dataset.banner);
        if (itemPath === normalizedSelected) {
            item.classList.add('selected');
        }
    });
}

// Update banner background selection in grid
function updateBannerBgSelection(selectedBg) {
    if (!selectedBg) return;
    
    const bannerBgItems = document.querySelectorAll('#bannerBgGrid .banner-item');
    const normalizedSelected = normalizePath(selectedBg);
    
    bannerBgItems.forEach(item => {
        item.classList.remove('selected');
        const itemPath = normalizePath(item.dataset.bannerBg);
        if (itemPath === normalizedSelected) {
            item.classList.add('selected');
        }
    });
}

// Handle banner selection
function selectBanner(bannerPath) {
    if (!currentUser) return;
    
    const bannerItem = document.querySelector(`#bannerGrid [data-banner="${bannerPath}"]`);
    if (!bannerItem) return;
    
    // Check if banner is locked
    if (bannerItem.classList.contains('locked')) {
        console.log('Banner is locked');
        return;
    }
    
    // Update banner image
    const bannerImg = document.getElementById('profileBannerImg');
    if (bannerImg) {
        bannerImg.src = bannerPath;
    }
    
    // Update selection in grid
    updateBannerSelection(bannerPath);
    
    // Auto-save banner selection
    saveProfile();
}

// Handle banner background selection
function selectBannerBg(bgPath) {
    if (!currentUser) return;
    
    const bannerBgItem = document.querySelector(`#bannerBgGrid [data-banner-bg="${bgPath}"]`);
    if (!bannerBgItem) return;
    
    // Check if banner background is locked
    if (bannerBgItem.classList.contains('locked')) {
        console.log('Banner background is locked');
        return;
    }
    
    // Update banner background
    const bannerBg = document.getElementById('profileBannerBg');
    if (bannerBg) {
        bannerBg.style.setProperty('background-image', `url(${bgPath})`);
    }
    
    // Update selection in grid
    updateBannerBgSelection(bgPath);
    
    // Auto-save banner background selection
    saveProfile();
}

// Update X verification UI based on status
// Helper function to format time remaining
function formatTimeRemaining(hoursRemaining) {
    if (hoursRemaining >= 1) {
        const hours = Math.floor(hoursRemaining);
        const minutes = Math.floor((hoursRemaining - hours) * 60);
        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            return `${days} day${days !== 1 ? 's' : ''}${remainingHours > 0 ? ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}` : ''}`;
        }
        return `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? ` and ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}`;
    } else {
        const minutes = Math.ceil(hoursRemaining * 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

async function updateXVerificationUI(userData) {
    const xAccountInput = document.getElementById('profileXAccount');
    const verificationSection = document.getElementById('xVerificationSection');
    const verificationStatus = document.getElementById('xVerificationStatus');
    const verificationCodeElement = document.getElementById('xVerificationCode');
    const verifyBtn = document.getElementById('verifyXAccountBtn');
    
    if (!xAccountInput || !verificationSection || !verificationStatus) return;
    
    const xAccount = xAccountInput.value.trim();
    const isVerified = userData.xAccountVerified === true;
    const verificationCode = userData.xVerificationCode;
    const attempts = userData.xVerificationAttempts || 0;
    const firstAttemptAt = userData.xVerificationFirstAttemptAt;
    const RATE_LIMIT_HOURS = 24;
    const RATE_LIMIT_ATTEMPTS = 5;
    
    // Check rate limit status
    let isRateLimited = false;
    let timeRemaining = null;
    
    if (firstAttemptAt && attempts >= RATE_LIMIT_ATTEMPTS) {
        const firstAttemptTime = new Date(firstAttemptAt).getTime();
        const now = Date.now();
        const hoursSinceFirstAttempt = (now - firstAttemptTime) / (1000 * 60 * 60);
        
        if (hoursSinceFirstAttempt < RATE_LIMIT_HOURS) {
            isRateLimited = true;
            timeRemaining = formatTimeRemaining(RATE_LIMIT_HOURS - hoursSinceFirstAttempt);
        }
    }
    
    // Update status indicator
    verificationStatus.className = 'x-verification-status';
    if (isVerified) {
        verificationStatus.textContent = '✓ Verified';
        verificationStatus.classList.add('verified');
        verificationSection.classList.add('hide');
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verified';
        }
    } else if (xAccount) {
        if (isRateLimited) {
            verificationStatus.textContent = `Rate Limited - Try again in ${timeRemaining}`;
            verificationStatus.classList.add('unverified');
            verificationSection.classList.remove('hide');
            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.textContent = `Rate Limited (${attempts}/${RATE_LIMIT_ATTEMPTS})`;
            }
        } else {
            verificationStatus.textContent = 'Unverified';
            verificationStatus.classList.add('unverified');
            verificationSection.classList.remove('hide');
            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Verify X Account';
            }
        }
        
        // Show attempt count if attempts > 0 but not rate limited
        if (attempts > 0 && !isRateLimited) {
            verificationStatus.textContent = `Unverified (${attempts}/${RATE_LIMIT_ATTEMPTS} attempts)`;
        }
        
        // Load or generate verification code
        if (verificationCodeElement) {
            const code = await getOrCreateVerificationCode();
            if (code) {
                verificationCodeElement.textContent = code;
            }
        }
    } else {
        verificationStatus.textContent = '';
        verificationSection.classList.add('hide');
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify X Account';
        }
    }
}

// Copy verification code to clipboard
async function copyVerificationCode() {
    // Get the code directly from Firestore to ensure accuracy
    const code = await getOrCreateVerificationCode();
    if (!code) {
        console.error('No verification code available');
        return;
    }
    
    try {
        // Copy the code to clipboard
        await navigator.clipboard.writeText(code);
        
        // Update button text to show success
        const copyBtn = document.getElementById('copyVerificationCode');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
        
        console.log('[copyVerificationCode] Copied code:', code);
    } catch (error) {
        console.error('Failed to copy code:', error);
        
        // Fallback: try to get from DOM element and select text
        const codeElement = document.getElementById('xVerificationCode');
        if (codeElement) {
            const codeFromElement = codeElement.textContent.trim();
            if (codeFromElement && codeFromElement !== 'Loading...') {
                try {
                    await navigator.clipboard.writeText(codeFromElement);
                    const copyBtn = document.getElementById('copyVerificationCode');
                    if (copyBtn) {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = '✓ Copied';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                        }, 2000);
                    }
                } catch (fallbackError) {
                    // Last resort: select text
                    const range = document.createRange();
                    range.selectNode(codeElement);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                }
            }
        }
    }
}

// Verify X account
async function verifyXAccount() {
    console.log('[verifyXAccount] Function called');
    
    if (!currentUser || isVerifying) {
        console.log('[verifyXAccount] Early return - no user or already verifying', { currentUser: !!currentUser, isVerifying });
        return;
    }
    
    const xAccountInput = document.getElementById('profileXAccount');
    const verifyBtn = document.getElementById('verifyXAccountBtn');
    const verificationStatus = document.getElementById('xVerificationStatus');
    
    if (!xAccountInput || !verifyBtn) {
        console.error('[verifyXAccount] Missing required elements', { xAccountInput: !!xAccountInput, verifyBtn: !!verifyBtn });
        return;
    }
    
    const xAccount = xAccountInput.value.trim();
    if (!xAccount) {
        alert('Please enter your X account username first');
        return;
    }
    
    // Extract username (remove @ if present)
    const username = xAccount.replace(/^@/, '').trim();
    console.log('[verifyXAccount] Starting verification for username:', username);
    
    // Rate limiting check with time-based reset (24 hours)
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const attempts = userData.xVerificationAttempts || 0;
        const firstAttemptAt = userData.xVerificationFirstAttemptAt;
        const RATE_LIMIT_HOURS = 24;
        const RATE_LIMIT_ATTEMPTS = 5;
        
        // Check if attempts should be reset (24 hours passed)
        if (firstAttemptAt) {
            const firstAttemptTime = new Date(firstAttemptAt).getTime();
            const now = Date.now();
            const hoursSinceFirstAttempt = (now - firstAttemptTime) / (1000 * 60 * 60);
            
            if (hoursSinceFirstAttempt >= RATE_LIMIT_HOURS) {
                // Reset attempts after 24 hours
                await setDoc(userDocRef, {
                    xVerificationAttempts: 0,
                    xVerificationFirstAttemptAt: null
                }, { merge: true });
            } else if (attempts >= RATE_LIMIT_ATTEMPTS) {
                // Still rate limited - calculate time remaining
                const hoursRemaining = RATE_LIMIT_HOURS - hoursSinceFirstAttempt;
                const minutesRemaining = Math.ceil(hoursRemaining * 60);
                
                let timeMessage;
                if (hoursRemaining >= 1) {
                    const hours = Math.floor(hoursRemaining);
                    const minutes = Math.floor((hoursRemaining - hours) * 60);
                    timeMessage = `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? ` and ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}`;
                } else {
                    timeMessage = `${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}`;
                }
                
                alert(`Too many verification attempts (${attempts}/${RATE_LIMIT_ATTEMPTS}).\n\nPlease try again in ${timeMessage}.`);
                return;
            }
        } else if (attempts >= RATE_LIMIT_ATTEMPTS) {
            // No timestamp but at limit - this shouldn't happen, but handle it
            alert(`Too many verification attempts (${attempts}/${RATE_LIMIT_ATTEMPTS}). Please try again in 24 hours.`);
            return;
        }
    } catch (error) {
        console.error('Error checking verification attempts:', error);
    }
    
    isVerifying = true;
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    
    if (verificationStatus) {
        verificationStatus.textContent = 'Verifying...';
        verificationStatus.className = 'x-verification-status verifying';
    }
    
    try {
        // Get verification code
        console.log('[verifyXAccount] Getting verification code...');
        const verificationCode = await getOrCreateVerificationCode();
        if (!verificationCode) {
            throw new Error('Failed to get verification code');
        }
        console.log('[verifyXAccount] Verification code:', verificationCode);
        
        // Call Firebase Cloud Function to verify X account
        console.log('[verifyXAccount] Initializing Firebase Functions...');
        const functions = getFunctions(app, 'us-central1'); // Specify region to match function deployment
        console.log('[verifyXAccount] Creating callable function...');
        const verifyXAccountCallable = httpsCallable(functions, 'verifyXAccount');
        
        console.log('[verifyXAccount] Calling function with:', { username, verificationCode, uid: currentUser.uid });
        const result = await verifyXAccountCallable({
            username: username,
            verificationCode: verificationCode,
            uid: currentUser.uid
        });
        console.log('[verifyXAccount] Function result:', result);
        console.log('[verifyXAccount] Result data:', result.data);
        
        // Firebase callable functions return data in result.data
        const verificationResult = result.data;
        
        if (verificationResult && verificationResult.verified) {
            // Update Firestore
            const userDocRef = doc(db, 'users', currentUser.uid);
            await setDoc(userDocRef, {
                xAccountVerified: true,
                xAccount: xAccount,
                xVerifiedAt: new Date().toISOString(),
                xVerificationAttempts: 0, // Reset on success
                xVerificationFirstAttemptAt: null // Reset timestamp on success
            }, { merge: true });
            
            // Update UI
            if (verificationStatus) {
                verificationStatus.textContent = '✓ Verified';
                verificationStatus.className = 'x-verification-status verified';
            }
            verifyBtn.textContent = 'Verified';
            verifyBtn.disabled = true;
            
            const verificationSection = document.getElementById('xVerificationSection');
            if (verificationSection) {
                verificationSection.classList.add('hide');
            }
            
            // Update quest progress for X verification
            try {
                const { updateQuestProgress } = await import('/js/quests-init.js');
                console.log('[verifyXAccount] Updating quest progress for weekly_verify_x');
                await updateQuestProgress('weekly_verify_x', 1);
                console.log('[verifyXAccount] Quest progress updated successfully');
            } catch (error) {
                console.error('[verifyXAccount] Error updating quest progress:', error);
                // Quest module might not be loaded, ignore silently
            }
        } else {
            throw new Error(verificationResult?.error || 'Verification code not found in bio');
        }
    } catch (error) {
        console.error('[verifyXAccount] Verification error:', error);
        console.error('[verifyXAccount] Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            stack: error.stack
        });
        
        // Handle Firebase Functions HttpsError
        let errorMessage = 'Verification failed';
        if (error.code) {
            // Firebase Functions error
            switch (error.code) {
                case 'not-found':
                    errorMessage = 'X account not found. Please check the username.';
                    break;
                case 'permission-denied':
                    errorMessage = 'Permission denied. Please try again.';
                    break;
                case 'resource-exhausted':
                    errorMessage = 'Too many requests. Please try again later.';
                    break;
                case 'failed-precondition':
                    errorMessage = 'X API not configured. Please contact support.';
                    break;
                default:
                    errorMessage = error.message || 'Verification failed';
            }
        } else {
            errorMessage = error.message || 'Verification failed';
        }
        
        // Increment attempt counter and track first attempt time
        try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.exists() ? userDoc.data() : {};
            const attempts = (userData.xVerificationAttempts || 0) + 1;
            const firstAttemptAt = userData.xVerificationFirstAttemptAt || new Date().toISOString();
            
            await setDoc(userDocRef, {
                xVerificationAttempts: attempts,
                xVerificationFirstAttemptAt: firstAttemptAt // Set on first attempt, keep same timestamp
            }, { merge: true });
        } catch (updateError) {
            console.error('Error updating attempt counter:', updateError);
        }
        
        alert(`${errorMessage}\n\nMake sure you've added the verification code to your X bio and try again.`);
        
        if (verificationStatus) {
            verificationStatus.textContent = 'Unverified';
            verificationStatus.className = 'x-verification-status unverified';
        }
        verifyBtn.textContent = 'Verify X Account';
    } finally {
        isVerifying = false;
        verifyBtn.disabled = false;
    }
}

// Event listener flags to prevent duplicates
let listenersAttached = false;

// Setup event listeners (only called once per auth state change)
function setupEventListeners() {
    // Prevent duplicate listeners
    if (listenersAttached) {
        console.warn('Event listeners already attached, skipping...');
        return;
    }
    
    // Bio character count
    const bioTextarea = document.getElementById('profileBio');
    if (bioTextarea) {
        bioTextarea.addEventListener('input', updateCharCount);
    }
    
    // Save profile button
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveProfile);
    }
    
    // Banner selection - use event delegation to handle dynamic items
    const bannerGrid = document.getElementById('bannerGrid');
    if (bannerGrid) {
        bannerGrid.addEventListener('click', handleBannerClick);
    }
    
    // Banner background selection - use event delegation
    const bannerBgGrid = document.getElementById('bannerBgGrid');
    if (bannerBgGrid) {
        bannerBgGrid.addEventListener('click', handleBannerBgClick);
    }
    
    // Followers/Following buttons - use event delegation on parent container
    // This is more reliable than direct attachment
    const followStatsContainer = document.querySelector('.profile-follow-stats');
    if (followStatsContainer) {
        console.log('Attaching event delegation to follow stats container');
        followStatsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            
            console.log('Button clicked:', button.id);
            
            if (button.id === 'followersBtn') {
                e.preventDefault();
                e.stopPropagation();
                console.log('Followers button clicked (via delegation)');
                if (currentUser) {
                    showFollowersList(currentUser.uid);
                } else {
                    console.warn('No current user');
                }
            } else if (button.id === 'followingBtn') {
                e.preventDefault();
                e.stopPropagation();
                console.log('Following button clicked (via delegation)');
                if (currentUser) {
                    showFollowingList(currentUser.uid);
                } else {
                    console.warn('No current user');
                }
            }
        });
        console.log('Event delegation attached successfully');
    } else {
        console.warn('Follow stats container not found');
    }
    
    // Also try direct attachment as backup
    const followersBtn = document.getElementById('followersBtn');
    const followingBtn = document.getElementById('followingBtn');
    
    if (followersBtn) {
        console.log('Directly attaching listener to followers button');
        followersBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Followers button clicked (direct)');
            if (currentUser) {
                showFollowersList(currentUser.uid);
            }
        });
    }
    
    if (followingBtn) {
        console.log('Directly attaching listener to following button');
        followingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Following button clicked (direct)');
            if (currentUser) {
                showFollowingList(currentUser.uid);
            }
        });
    }
    
    // Modal close buttons
    const closeFollowersModal = document.getElementById('closeFollowersModal');
    if (closeFollowersModal) {
        closeFollowersModal.addEventListener('click', () => {
            const modal = document.getElementById('followersModal');
            if (modal) {
                modal.classList.remove('show');
                modal.classList.add('hide');
                document.body.style.overflow = ''; // Restore scrolling
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
                document.body.style.overflow = ''; // Restore scrolling
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
                document.body.style.overflow = ''; // Restore scrolling
            }
        });
    }
    
    const followingModal = document.getElementById('followingModal');
    if (followingModal) {
        followingModal.addEventListener('click', (e) => {
            if (e.target === followingModal) {
                followingModal.classList.remove('show');
                followingModal.classList.add('hide');
                document.body.style.overflow = ''; // Restore scrolling
            }
        });
    }
    
    // X Account input - show verification section when account is entered
    const xAccountInput = document.getElementById('profileXAccount');
    if (xAccountInput) {
        xAccountInput.addEventListener('input', async () => {
            const xAccount = xAccountInput.value.trim();
            if (xAccount) {
                // Load user data to check verification status
                try {
                    const userDocRef = doc(db, 'users', currentUser.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        updateXVerificationUI(userDoc.data());
                    }
                } catch (error) {
                    console.error('Error loading user data:', error);
                }
            } else {
                const verificationSection = document.getElementById('xVerificationSection');
                const verificationStatus = document.getElementById('xVerificationStatus');
                if (verificationSection) verificationSection.classList.add('hide');
                if (verificationStatus) {
                    verificationStatus.textContent = '';
                    verificationStatus.className = 'x-verification-status';
                }
            }
        });
    }
    
    // Copy verification code button
    const copyCodeBtn = document.getElementById('copyVerificationCode');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', copyVerificationCode);
    }
    
    // Verify X account button
    const verifyXBtn = document.getElementById('verifyXAccountBtn');
    if (verifyXBtn) {
        verifyXBtn.addEventListener('click', verifyXAccount);
    }
    
    // View More button for banners
    const viewMoreBannersBtn = document.getElementById('viewMoreBannersBtn');
    if (viewMoreBannersBtn) {
        viewMoreBannersBtn.addEventListener('click', () => {
            const bannerGrid = document.getElementById('bannerGrid');
            if (bannerGrid) {
                const isExpanded = bannerGrid.classList.contains('expanded');
                if (isExpanded) {
                    bannerGrid.classList.remove('expanded');
                    viewMoreBannersBtn.textContent = 'View More';
                    // Scroll to top of banner section
                    bannerGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    bannerGrid.classList.add('expanded');
                    viewMoreBannersBtn.textContent = 'Show Less';
                }
            }
        });
    }
    
    // View More button for banner backgrounds
    const viewMoreBannerBgsBtn = document.getElementById('viewMoreBannerBgsBtn');
    if (viewMoreBannerBgsBtn) {
        viewMoreBannerBgsBtn.addEventListener('click', () => {
            const bannerBgGrid = document.getElementById('bannerBgGrid');
            if (bannerBgGrid) {
                const isExpanded = bannerBgGrid.classList.contains('expanded');
                if (isExpanded) {
                    bannerBgGrid.classList.remove('expanded');
                    viewMoreBannerBgsBtn.textContent = 'View More';
                    // Scroll to top of banner background section
                    bannerBgGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    bannerBgGrid.classList.add('expanded');
                    viewMoreBannerBgsBtn.textContent = 'Show Less';
                }
            }
        });
    }
    
    // X Account Instructions Modal
    const showInstructionsBtn = document.getElementById('showXInstructionsBtn');
    const closeInstructionsBtn = document.getElementById('closeXInstructionsBtn');
    const closeInstructionsBtn2 = document.getElementById('closeXInstructionsBtn2');
    const instructionsModal = document.getElementById('xInstructionsModal');
    
    if (showInstructionsBtn && instructionsModal) {
        showInstructionsBtn.addEventListener('click', () => {
            instructionsModal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        });
    }
    
    const closeModal = () => {
        if (instructionsModal) {
            instructionsModal.classList.remove('show');
            document.body.style.overflow = ''; // Restore scrolling
        }
    };
    
    if (closeInstructionsBtn) {
        closeInstructionsBtn.addEventListener('click', closeModal);
    }
    
    if (closeInstructionsBtn2) {
        closeInstructionsBtn2.addEventListener('click', closeModal);
    }
    
    // Close modal when clicking outside
    if (instructionsModal) {
        instructionsModal.addEventListener('click', (e) => {
            if (e.target === instructionsModal) {
                closeModal();
            }
        });
    }
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && instructionsModal && instructionsModal.classList.contains('show')) {
            closeModal();
        }
    });
    
    listenersAttached = true;
    console.log('Profile event listeners attached');
}

// Event handler for banner clicks (using event delegation)
function handleBannerClick(event) {
    const bannerItem = event.target.closest('.banner-item');
    if (bannerItem) {
        const bannerPath = bannerItem.dataset.banner;
        if (bannerPath) {
            selectBanner(bannerPath);
        }
    }
}

// Event handler for banner background clicks (using event delegation)
function handleBannerBgClick(event) {
    const bannerBgItem = event.target.closest('.banner-item');
    if (bannerBgItem) {
        const bgPath = bannerBgItem.dataset.bannerBg;
        if (bgPath) {
            selectBannerBg(bgPath);
        }
    }
}

// Admin utility: Sync missing user profiles
// This function can be called from the browser console by admins
// Usage: await syncMissingUserProfiles()
// Manual function to check and update X verification quest
window.checkXVerificationQuest = async function() {
    if (!currentUser) {
        console.error('No user logged in');
        return;
    }
    
    try {
        // Check if user is verified
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
            console.error('User profile not found');
            return;
        }
        
        const userData = userDoc.data();
        if (!userData.xAccountVerified) {
            console.log('User is not verified on X');
            return;
        }
        
        // Update quest progress
        const { updateQuestProgress } = await import('/js/quests-init.js');
        console.log('Checking and updating X verification quest...');
        await updateQuestProgress('weekly_verify_x', 1);
        console.log('Quest progress updated successfully');
    } catch (error) {
        console.error('Error checking X verification quest:', error);
    }
};

window.syncMissingUserProfiles = async function() {
    if (!currentUser) {
        console.error('❌ Not authenticated');
        return { error: 'Not authenticated' };
    }

    try {
        // Check if user is admin
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const isAdmin = userData.role === 'admin' || userData.role === 'moderator';

        if (!isAdmin) {
            console.error('❌ Only admins can sync user profiles');
            return { error: 'Permission denied: Only admins can sync user profiles' };
        }

        console.log('🔄 Starting sync of missing user profiles...');
        
        const functions = getFunctions(app, 'us-central1');
        const syncProfiles = httpsCallable(functions, 'syncMissingUserProfiles');
        
        const result = await syncProfiles({});
        
        if (result.data && result.data.success) {
            console.log('✅ Sync complete!', result.data);
            console.log(`   - Total usernames: ${result.data.totalUsernames}`);
            console.log(`   - Existing profiles: ${result.data.existingProfiles}`);
            console.log(`   - Created profiles: ${result.data.createdProfiles}`);
            console.log(`   - Errors: ${result.data.errors}`);
            
            if (result.data.results) {
                console.log('📋 Detailed results:');
                result.data.results.forEach(r => {
                    if (r.status === 'created') {
                        console.log(`   ✅ Created: ${r.username} (${r.uid})`);
                    } else if (r.status === 'exists') {
                        console.log(`   ℹ️  Exists: ${r.username} (${r.uid})`);
                    } else if (r.status === 'error') {
                        console.log(`   ❌ Error: ${r.username} (${r.uid}) - ${r.error}`);
                    }
                });
            }
            
            alert(`Sync complete!\n\nCreated: ${result.data.createdProfiles} profiles\nAlready existed: ${result.data.existingProfiles}\nErrors: ${result.data.errors}`);
            
            return result.data;
        } else {
            console.error('❌ Sync failed:', result.data);
            return { error: 'Sync failed', data: result.data };
        }
    } catch (error) {
        console.error('❌ Error syncing profiles:', error);
        alert(`Error: ${error.message}`);
        return { error: error.message };
    }
};

// Follow/Unfollow functionality
let followersCount = 0;
let followingCount = 0;
let followersListener = null;
let followingListener = null;

// Load followers/following counts
async function loadFollowStats(userId) {
    if (!userId || !currentUser) return;
    
    try {
        const followersRef = collection(db, 'followers', userId, 'followers');
        const followingRef = collection(db, 'following', userId, 'following');
        
        // Set up real-time listeners
        if (followersListener) {
            followersListener();
            followersListener = null;
        }
        if (followingListener) {
            followingListener();
            followingListener = null;
        }
        
        // Only set up listeners if user is authenticated
        if (currentUser) {
            followersListener = onSnapshot(followersRef, 
                async (snapshot) => {
                    const newFollowersCount = snapshot.size;
                    const oldFollowersCount = followersCount;
                    followersCount = newFollowersCount;
                    
                    const followersCountEl = document.getElementById('followersCount');
                    if (followersCountEl) {
                        followersCountEl.textContent = followersCount;
                    }
                    
                    // Track quest progress: weekly_get_25_followers
                    // Update quest progress to match current follower count
                    if (userId === currentUser?.uid && newFollowersCount > oldFollowersCount) {
                        try {
                            const { updateQuestProgress } = await import('/js/quests-init.js');
                            // Update quest to current follower count (not increment)
                            // The quest system will handle capping at targetValue
                            await updateQuestProgress('weekly_get_25_followers', newFollowersCount);
                        } catch (error) {
                            console.error('Error updating followers quest progress:', error);
                        }
                    }
                },
                (error) => {
                    // Only suppress warnings for other users' profiles, not own profile
                    if (error.code === 'permission-denied') {
                        if (userId !== currentUser?.uid) {
                            // Expected for other users' profiles
                            console.warn('Permission denied for followers listener (viewing other user profile)');
                        } else {
                            // This shouldn't happen for own profile - rules might not be deployed
                            console.error('Permission denied for own followers listener. Make sure Firestore rules are deployed.');
                        }
                    } else {
                        console.error('Error in followers listener:', error);
                    }
                }
            );
            
            followingListener = onSnapshot(followingRef, 
                (snapshot) => {
                    followingCount = snapshot.size;
                    const followingCountEl = document.getElementById('followingCount');
                    if (followingCountEl) {
                        followingCountEl.textContent = followingCount;
                    }
                },
                (error) => {
                    // Only suppress warnings for other users' profiles, not own profile
                    if (error.code === 'permission-denied') {
                        if (userId !== currentUser?.uid) {
                            // Expected for other users' profiles
                            console.warn('Permission denied for following listener (viewing other user profile)');
                        } else {
                            // This shouldn't happen for own profile - rules might not be deployed
                            console.error('Permission denied for own following listener. Make sure Firestore rules are deployed.');
                        }
                    } else {
                        console.error('Error in following listener:', error);
                    }
                }
            );
        }
    } catch (error) {
        console.error('Error loading follow stats:', error);
    }
}

// Follow a user
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

// Unfollow a user
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

// Sync followers quest progress with current follower count
async function syncFollowersQuestProgress(currentFollowerCount) {
    if (!currentUser) return;
    
    try {
        const { updateQuestProgress } = await import('/js/quests-init.js');
        
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

// Check if current user is following a target user
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

// Store followers/following data for search functionality
let currentFollowersData = [];
let currentFollowingData = [];

// Filter and render followers list
function renderFollowersList(followers, followingStatus, searchTerm = '') {
    const listEl = document.getElementById('followersList');
    if (!listEl) return;
    
    // Filter by search term
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
            
            // Handle profile click (navigate to profile) - both avatar and info
            const avatar = followerItem.querySelector('.follow-item-avatar');
            const infoSection = followerItem.querySelector('.follow-item-info');
            const navigateToProfile = (e) => {
                e.stopPropagation();
                window.location.href = `/profile/?user=${follower.id}`;
            };
            if (avatar) {
                avatar.addEventListener('click', navigateToProfile);
            }
            if (infoSection) {
                infoSection.addEventListener('click', navigateToProfile);
            }
            
            // Handle follow/unfollow button click
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

// Show followers list
async function showFollowersList(userId) {
    console.log('showFollowersList called with userId:', userId);
    const modal = document.getElementById('followersModal');
    const listEl = document.getElementById('followersList');
    const searchInput = document.getElementById('followersSearchInput');
    
    if (!modal || !listEl) {
        console.error('Modal elements not found:', { modal: !!modal, listEl: !!listEl });
        return;
    }
    
    // Remove hide first, then add show (hide has !important)
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
            currentFollowersData = [];
            return;
        }
        
        // Get user data for each follower
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
        currentFollowersData = followers;
        
        // Check which users the current user is following (if logged in)
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
            searchInput.addEventListener('input', (e) => {
                renderFollowersList(currentFollowersData, followingStatus, e.target.value);
            });
        }
        
        // Initial render
        renderFollowersList(followers, followingStatus);
    } catch (error) {
        console.error('Error loading followers:', error);
        listEl.innerHTML = '<div class="follow-list-error">Error loading followers</div>';
        currentFollowersData = [];
    }
}

// Show following list
async function showFollowingList(userId) {
    console.log('showFollowingList called with userId:', userId);
    const modal = document.getElementById('followingModal');
    const listEl = document.getElementById('followingList');
    const searchInput = document.getElementById('followingSearchInput');
    
    if (!modal || !listEl) {
        console.error('Modal elements not found:', { modal: !!modal, listEl: !!listEl });
        return;
    }
    
    // Remove hide first, then add show (hide has !important)
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
            currentFollowingData = [];
            return;
        }
        
        // Get user data for each followed user
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
        currentFollowingData = following;
        
        // Check which users the current user is following (if logged in)
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
            searchInput.addEventListener('input', (e) => {
                renderFollowingList(currentFollowingData, followingStatus, e.target.value, userId);
            });
        }
        
        // Initial render
        renderFollowingList(following, followingStatus, '', userId);
    } catch (error) {
        console.error('Error loading following:', error);
        listEl.innerHTML = '<div class="follow-list-error">Error loading following</div>';
        currentFollowingData = [];
    }
}

// Filter and render following list
function renderFollowingList(following, followingStatus, searchTerm = '', viewingUserId = null) {
    const listEl = document.getElementById('followingList');
    if (!listEl) return;
    
    // Filter by search term
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
            
            // Handle profile click (navigate to profile) - both avatar and info
            const avatar = followingItem.querySelector('.follow-item-avatar');
            const infoSection = followingItem.querySelector('.follow-item-info');
            const navigateToProfile = (e) => {
                e.stopPropagation();
                window.location.href = `/profile/?user=${followed.id}`;
            };
            if (avatar) {
                avatar.addEventListener('click', navigateToProfile);
            }
            if (infoSection) {
                infoSection.addEventListener('click', navigateToProfile);
            }
            
            // Handle follow/unfollow button click
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

// Load profile posts
async function loadProfilePosts() {
    if (!currentUser) return;
    
    const postsFeedEl = document.getElementById('profilePostsFeed');
    if (!postsFeedEl) return;
    
    // Clear existing listener
    if (postsListener) {
        postsListener();
        postsListener = null;
    }
    
    // Set loading state
    postsFeedEl.innerHTML = '<div class="posts-loading">Loading posts...</div>';
    
    try {
        // Query posts for current user
        let postsQuery;
        try {
            postsQuery = query(
                collection(db, 'posts'),
                where('userId', '==', currentUser.uid),
                where('deleted', '==', false),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            
            // Set up real-time listener
            postsListener = onSnapshot(
                postsQuery,
                async (snapshot) => {
                    await renderProfilePosts(snapshot.docs);
                },
                (error) => {
                    console.error('Error loading posts:', error);
                    // Try fallback if index error
                    if (error.code === 'failed-precondition' || error.message.includes('index')) {
                        console.warn('Index not found for posts, using fallback query');
                        loadProfilePostsFallback();
                    } else {
                        if (postsFeedEl) {
                            postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts</div>';
                        }
                    }
                }
            );
        } catch (indexError) {
            console.warn('Index not found for posts, using fallback query:', indexError);
            loadProfilePostsFallback();
        }
    } catch (error) {
        console.error('Error setting up posts listener:', error);
        if (postsFeedEl) {
            postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts</div>';
        }
    }
}

// Fallback function to load posts without index
async function loadProfilePostsFallback() {
    if (!currentUser) return;
    
    const postsFeedEl = document.getElementById('profilePostsFeed');
    if (!postsFeedEl) return;
    
    try {
        // Fallback: simpler query without orderBy
        try {
            const postsQuery = query(
                collection(db, 'posts'),
                where('userId', '==', currentUser.uid),
                where('deleted', '==', false),
                limit(100)
            );
            
            const snapshot = await getDocs(postsQuery);
            
            // Sort by createdAt in JavaScript
            const postsArray = Array.from(snapshot.docs);
            postsArray.sort((a, b) => {
                const aData = a.data();
                const bData = b.data();
                const aTime = aData.createdAt?.toMillis ? aData.createdAt.toMillis() : (aData.createdAt?.seconds * 1000 || 0);
                const bTime = bData.createdAt?.toMillis ? bData.createdAt.toMillis() : (bData.createdAt?.seconds * 1000 || 0);
                return bTime - aTime; // DESC order
            });
            
            await renderProfilePosts(postsArray);
        } catch (fallbackError) {
            console.error('Fallback query also failed:', fallbackError);
            // Final fallback: get all user posts and filter/sort in JavaScript
            const allPostsQuery = query(
                collection(db, 'posts'),
                where('userId', '==', currentUser.uid),
                limit(500)
            );
            
            const snapshot = await getDocs(allPostsQuery);
            
            // Filter and sort in JavaScript
            const postsArray = Array.from(snapshot.docs)
                .filter(doc => {
                    const data = doc.data();
                    return data.deleted !== true;
                })
                .sort((a, b) => {
                    const aData = a.data();
                    const bData = b.data();
                    const aTime = aData.createdAt?.toMillis ? aData.createdAt.toMillis() : (aData.createdAt?.seconds * 1000 || 0);
                    const bTime = bData.createdAt?.toMillis ? bData.createdAt.toMillis() : (bData.createdAt?.seconds * 1000 || 0);
                    return bTime - aTime; // DESC order
                });
            
            await renderProfilePosts(postsArray);
        }
    } catch (error) {
        console.error('Error setting up posts listener:', error);
        if (postsFeedEl) {
            postsFeedEl.innerHTML = '<div class="posts-error">Error loading posts</div>';
        }
    }
}

// Render profile posts
async function renderProfilePosts(postDocs) {
    const postsFeedEl = document.getElementById('profilePostsFeed');
    if (!postsFeedEl) return;
    
    if (postDocs.length === 0) {
        postsFeedEl.innerHTML = '<div class="posts-empty">No posts yet. Share your first post on the <a href="/feed/">Feed</a>!</div>';
        return;
    }
    
    // Get user data for posts
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
            return {
                id: postDoc.id,
                ...postData,
                userData: null
            };
        }
    }));
    
    // Render posts
    postsFeedEl.innerHTML = posts.map(post => renderProfilePost(post)).join('');
    
    // Set up event listeners for posts
    posts.forEach(post => {
        setupProfilePostEventListeners(post.id, post);
    });
    
    // Set up image error handling
    posts.forEach(post => {
        setupPostImageErrors(post.id);
    });
}

// Render single profile post
function renderProfilePost(post) {
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

// Set up event listeners for a profile post
function setupProfilePostEventListeners(postId, post) {
    // Like button - import from feed.js or implement here
    const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
    if (likeBtn) {
        likeBtn.addEventListener('click', () => handleProfilePostLike(postId));
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
                loadProfilePostComments(postId);
            }
        });
    }
    
    // Comment submit
    const commentSubmit = document.querySelector(`.post-comment-submit[data-post-id="${postId}"]`);
    const commentInput = document.getElementById(`commentInput_${postId}`);
    if (commentSubmit && commentInput) {
        commentSubmit.addEventListener('click', () => handleProfileAddComment(postId, commentInput));
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleProfileAddComment(postId, commentInput);
            }
        });
    }
    
    // Delete button
    const deleteBtn = document.querySelector(`.post-delete-btn[data-post-id="${postId}"]`);
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleProfileDeletePost(postId));
    }
}

// Helper functions for profile posts (simplified versions)
async function handleProfilePostLike(postId) {
    if (!currentUser) {
        alert('Please log in to like posts');
        return;
    }
    
    try {
        const { updateDoc, increment } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js');
        const postRef = doc(db, 'posts', postId);
        const postDoc = await getDoc(postRef);
        
        if (!postDoc.exists()) {
            console.error('Post not found');
            return;
        }
        
        const postData = postDoc.data();
        const likes = postData.likes || {};
        const isLiked = likes[currentUser.uid] === true;
        
        const newLikes = { ...likes };
        if (isLiked) {
            delete newLikes[currentUser.uid];
        } else {
            newLikes[currentUser.uid] = true;
        }
        
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

async function loadProfilePostComments(postId) {
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
        
        commentsListEl.innerHTML = comments.map(comment => renderProfileComment(comment, postId)).join('');
        
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsListEl.innerHTML = '<div class="post-comments-error">Error loading comments</div>';
    }
}

function renderProfileComment(comment, postId) {
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

async function handleProfileAddComment(postId, commentInputEl) {
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
        const { addDoc, updateDoc, increment } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js');
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
            alert('User profile not found');
            return;
        }
        const userData = userDoc.data();
        
        await addDoc(collection(db, 'posts', postId, 'comments'), {
            userId: currentUser.uid,
            username: userData.username || 'Anonymous',
            content: content,
            createdAt: serverTimestamp(),
            deleted: false
        });
        
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
            commentsCount: increment(1),
            updatedAt: serverTimestamp()
        });
        
        commentInputEl.value = '';
        loadProfilePostComments(postId);
        
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Failed to add comment. Please try again.');
    }
}

async function handleProfileDeletePost(postId) {
    if (!currentUser) return;
    
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
        return;
    }
    
    try {
        const { updateDoc } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js');
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

// Helper function to get time ago
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

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions for use in other modules (e.g., chat popup)
if (typeof window !== 'undefined') {
    window.followUser = followUser;
    window.unfollowUser = unfollowUser;
    window.checkIfFollowing = checkIfFollowing;
}

console.log('Profile page initialized');

