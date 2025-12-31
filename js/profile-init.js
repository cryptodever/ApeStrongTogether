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
let isSaving = false;
let isVerifying = false;

// Initialize profile page
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadProfile();
        setupEventListeners();
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
        
        // Update quest progress for profile update
        try {
            const { updateQuestProgress } = await import('/js/quests-init.js');
            await updateQuestProgress('daily_profile_update', 1);
        } catch (error) {
            // Quest module might not be loaded, ignore silently
        }
        
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
    
    // Followers/Following buttons
    const followersBtn = document.getElementById('followersBtn');
    if (followersBtn) {
        followersBtn.addEventListener('click', () => showFollowersList(currentUser.uid));
    }
    
    const followingBtn = document.getElementById('followingBtn');
    if (followingBtn) {
        followingBtn.addEventListener('click', () => showFollowingList(currentUser.uid));
    }
    
    // Modal close buttons
    const closeFollowersModal = document.getElementById('closeFollowersModal');
    if (closeFollowersModal) {
        closeFollowersModal.addEventListener('click', () => {
            document.getElementById('followersModal').classList.add('hide');
        });
    }
    
    const closeFollowingModal = document.getElementById('closeFollowingModal');
    if (closeFollowingModal) {
        closeFollowingModal.addEventListener('click', () => {
            document.getElementById('followingModal').classList.add('hide');
        });
    }
    
    // Close modals on overlay click
    const followersModal = document.getElementById('followersModal');
    if (followersModal) {
        followersModal.addEventListener('click', (e) => {
            if (e.target === followersModal) {
                followersModal.classList.add('hide');
            }
        });
    }
    
    const followingModal = document.getElementById('followingModal');
    if (followingModal) {
        followingModal.addEventListener('click', (e) => {
            if (e.target === followingModal) {
                followingModal.classList.add('hide');
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

// Show followers list
async function showFollowersList(userId) {
    const modal = document.getElementById('followersModal');
    const listEl = document.getElementById('followersList');
    
    if (!modal || !listEl) return;
    
    modal.classList.remove('hide');
    listEl.innerHTML = '<div class="follow-list-loading">Loading...</div>';
    
    try {
        const followersRef = collection(db, 'followers', userId, 'followers');
        const followersSnapshot = await getDocs(followersRef);
        
        if (followersSnapshot.empty) {
            listEl.innerHTML = '<div class="follow-list-empty">No followers yet</div>';
            return;
        }
        
        listEl.innerHTML = '';
        
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
        
        followers.forEach((follower) => {
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
    } catch (error) {
        console.error('Error loading followers:', error);
        listEl.innerHTML = '<div class="follow-list-error">Error loading followers</div>';
    }
}

// Show following list
async function showFollowingList(userId) {
    const modal = document.getElementById('followingModal');
    const listEl = document.getElementById('followingList');
    
    if (!modal || !listEl) return;
    
    modal.classList.remove('hide');
    listEl.innerHTML = '<div class="follow-list-loading">Loading...</div>';
    
    try {
        const followingRef = collection(db, 'following', userId, 'following');
        const followingSnapshot = await getDocs(followingRef);
        
        if (followingSnapshot.empty) {
            listEl.innerHTML = '<div class="follow-list-empty">Not following anyone yet</div>';
            return;
        }
        
        listEl.innerHTML = '';
        
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
        
        // If viewing own profile, all users in following list are already being followed
        // If viewing someone else's profile, check if current user follows them
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
            // Viewing own following list - all are being followed
            following.forEach(f => followingStatus.set(f.id, true));
        }
        
        following.forEach((followed) => {
            const followingItem = document.createElement('div');
            followingItem.className = 'follow-list-item';
            const isFollowing = currentUser && followed.id !== currentUser.uid ? followingStatus.get(followed.id) : false;
            const isOwnProfile = currentUser && followed.id === currentUser.uid;
            const isViewingOwnProfile = currentUser && userId === currentUser.uid;
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
    } catch (error) {
        console.error('Error loading following:', error);
        listEl.innerHTML = '<div class="follow-list-error">Error loading following</div>';
    }
}

// Export functions for use in other modules (e.g., chat popup)
if (typeof window !== 'undefined') {
    window.followUser = followUser;
    window.unfollowUser = unfollowUser;
    window.checkIfFollowing = checkIfFollowing;
}

console.log('Profile page initialized');

