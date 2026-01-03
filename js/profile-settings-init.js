/**
 * Profile Settings Page Initialization Module
 * Handles authentication gate, profile settings loading, and saving to Firestore
 * Similar to profile-init.js but for the settings page (no banner display, no followers/following)
 */

import { auth, db, app } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js';

// Initialize auth gate for settings page
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Settings init: Auth gate initialization error:', error);
        const overlay = document.getElementById('authGateOverlay');
        if (overlay) {
            overlay.classList.add('show');
        }
    }
})();

// Settings state
let currentUser = null;
let profileListener = null;
let isSaving = false;
let isVerifying = false;
let listenersAttached = false;
let selectedBannerImage = null; // Store selected banner
let selectedBannerBackground = null; // Store selected banner background

// Initialize settings page
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadProfile();
        setupEventListeners();
    } else {
        if (profileListener) {
            profileListener();
            profileListener = null;
        }
        currentUser = null;
        listenersAttached = false;
    }
});

// Load user profile from Firestore
async function loadProfile() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Set up real-time listener for profile updates
        if (profileListener) {
            profileListener();
        }
        
        profileListener = (await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js')).onSnapshot(userDocRef, async (snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.data();
                
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
                    await updateXVerificationUI(userData);
                }
                
                // Store current banner values
                if (userData.bannerImage) {
                    selectedBannerImage = userData.bannerImage;
                } else {
                    // Default to first banner if none selected
                    selectedBannerImage = '/pfp_apes/bg1.png';
                }
                if (userData.bannerBackground) {
                    selectedBannerBackground = userData.bannerBackground;
                } else {
                    // Default to first background if none selected
                    selectedBannerBackground = '/pfp_generator_images/pfp_bg1.png';
                }
                
                // Update selected banner in grid
                if (userData.bannerImage) {
                    updateBannerSelection(userData.bannerImage);
                }
                
                // Update selected banner background in grid
                if (userData.bannerBackground) {
                    updateBannerBgSelection(userData.bannerBackground);
                }
                
                // Update preview with current selections
                updateBannerPreview();
                
                // Update banner unlock states based on user level
                let userLevel = userData.level || 1;
                console.log('[loadProfile] Initial level from userData:', userLevel);
                
                // Try to get calculated level from quests system
                try {
                    const { getLevelProgress } = await import('/js/quests-init.js');
                    const points = userData.points || 0;
                    const levelProgress = getLevelProgress(points);
                    userLevel = levelProgress.level;
                    console.log('[loadProfile] Calculated level from quests:', userLevel, 'Points:', points);
                } catch (error) {
                    console.error('[loadProfile] Error calculating level:', error);
                    // Use stored level if calculation fails
                }
                
                // Update unlock states after a delay to ensure DOM is ready
                setTimeout(() => {
                    console.log('[loadProfile] Calling updateBannerUnlockStates with level:', userLevel);
                    updateBannerUnlockStates(userLevel);
                }, 500);
            }
        }, (error) => {
            console.error('Error loading profile:', error);
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
        
        if (!bioTextarea || !countrySelect) {
            throw new Error('Required profile elements not found');
        }
        
        const bio = bioTextarea.value || '';
        const country = countrySelect.value || '';
        const xAccount = document.getElementById('profileXAccount')?.value || '';
        
        // Get existing data to preserve banner values if not changed
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const existingData = userDoc.exists() ? userDoc.data() : {};
        const xAccountVerified = existingData.xAccountVerified || false;
        
        // Use selected banner values or existing ones
        const bannerImage = selectedBannerImage || existingData.bannerImage || '';
        const bannerBackground = selectedBannerBackground || existingData.bannerBackground || '';
        
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Update profile data
        await setDoc(userDocRef, {
            ...existingData,
            bio: bio.trim(),
            country: country,
            xAccount: xAccount.trim(),
            xAccountVerified: xAccountVerified,
            bannerImage: bannerImage,
            bannerBackground: bannerBackground,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        // If X account changed, reset verification
        if (xAccount.trim() !== (existingData.xAccount || '')) {
            await setDoc(userDocRef, {
                xAccountVerified: false,
                xVerificationAttempts: 0,
                xVerificationFirstAttemptAt: null
            }, { merge: true });
            updateXVerificationUI({ xAccountVerified: false, xAccount: xAccount.trim() });
        }
        
        console.log('Profile saved successfully');
        
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
        
        let errorMessage = 'Error - Try Again';
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission Denied';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Network Error';
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
            if (userData.xVerificationCode) {
                return userData.xVerificationCode;
            }
        }
        
        const code = generateVerificationCode(currentUser.uid);
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
    return path.startsWith('/') ? path : '/' + path;
}

// Get banner index (1-based) from banner path
function getBannerIndex(bannerPath) {
    const banners = [
        '/pfp_apes/bg1.png',
        '/pfp_apes/bg2.png',
        '/pfp_apes/bg3.png',
        '/pfp_apes/bg4.png',
        '/pfp_apes/tg_1.png',
        '/pfp_apes/tg_2.png',
        '/pfp_apes/tg_3.png',
        '/pfp_apes/tg_4.png'
    ];
    const normalizedPath = normalizePath(bannerPath);
    const index = banners.findIndex(b => normalizePath(b) === normalizedPath);
    return index >= 0 ? index + 1 : 0;
}

// Get banner background index (1-based) from background path
function getBannerBgIndex(bgPath) {
    const backgrounds = [
        '/pfp_generator_images/pfp_bg1.png',
        '/pfp_generator_images/pfp_bg2.png',
        '/pfp_generator_images/pfp_bg3.png',
        '/pfp_generator_images/pfp_bg4.png',
        '/pfp_generator_images/pfp_bg5.png',
        '/pfp_generator_images/pfp_bg6.png',
        '/pfp_generator_images/pfp_bg7.png',
        '/pfp_generator_images/pfp_bg8.png'
    ];
    const normalizedPath = normalizePath(bgPath);
    const index = backgrounds.findIndex(b => normalizePath(b) === normalizedPath);
    return index >= 0 ? index + 1 : 0;
}

// Check if banner is unlocked based on level
function isBannerUnlocked(bannerIndex, userLevel) {
    // First 4 are always unlocked
    if (bannerIndex <= 4) return true;
    // Every 5 levels after level 1 unlocks a new banner
    // Banner 5 unlocks at level 5, banner 6 at level 10, etc.
    const requiredLevel = (bannerIndex - 4) * 5;
    return userLevel >= requiredLevel;
}

// Check if banner background is unlocked based on level
function isBannerBgUnlocked(bgIndex, userLevel) {
    // First 4 are always unlocked
    if (bgIndex <= 4) return true;
    // Every 5 levels after level 1 unlocks a new background
    // Background 5 unlocks at level 5, background 6 at level 10, etc.
    const requiredLevel = (bgIndex - 4) * 5;
    return userLevel >= requiredLevel;
}

// Get required level for banner unlock
function getBannerRequiredLevel(bannerIndex) {
    if (bannerIndex <= 4) return 1;
    return (bannerIndex - 4) * 5;
}

// Get required level for banner background unlock
function getBannerBgRequiredLevel(bgIndex) {
    if (bgIndex <= 4) return 1;
    return (bgIndex - 4) * 5;
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
    
    if (bannerItem.classList.contains('locked')) {
        const bannerIndex = getBannerIndex(bannerPath);
        const requiredLevel = getBannerRequiredLevel(bannerIndex);
        alert(`This banner is locked. Unlock it at Level ${requiredLevel}!`);
        return;
    }
    
    // Store selected banner
    selectedBannerImage = bannerPath;
    
    // Update selection in grid
    updateBannerSelection(bannerPath);
    
    // Update preview
    updateBannerPreview();
    
    // Auto-save banner selection
    saveProfile();
}

// Handle banner background selection
function selectBannerBg(bgPath) {
    if (!currentUser) return;
    
    const bannerBgItem = document.querySelector(`#bannerBgGrid [data-banner-bg="${bgPath}"]`);
    if (!bannerBgItem) return;
    
    if (bannerBgItem.classList.contains('locked')) {
        console.log('Banner background is locked');
        return;
    }
    
    // Store selected banner background
    selectedBannerBackground = bgPath;
    
    // Update selection in grid
    updateBannerBgSelection(bgPath);
    
    // Update preview
    updateBannerPreview();
    
    // Auto-save banner background selection
    saveProfile();
}

// Update banner preview
function updateBannerPreview() {
    const previewImg = document.getElementById('bannerPreviewImg');
    const previewBg = document.getElementById('bannerPreviewBg');
    
    if (previewImg) {
        previewImg.src = selectedBannerImage || '/pfp_apes/bg1.png';
    }
    
    if (previewBg) {
        const bgUrl = selectedBannerBackground || '/pfp_generator_images/pfp_bg1.png';
        previewBg.style.backgroundImage = `url(${bgUrl})`;
    }
}

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
        
        if (attempts > 0 && !isRateLimited) {
            verificationStatus.textContent = `Unverified (${attempts}/${RATE_LIMIT_ATTEMPTS} attempts)`;
        }
        
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
    const code = await getOrCreateVerificationCode();
    if (!code) {
        console.error('No verification code available');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(code);
        const copyBtn = document.getElementById('copyVerificationCode');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
    } catch (error) {
        console.error('Failed to copy code:', error);
    }
}

// Verify X account
async function verifyXAccount() {
    if (!currentUser || isVerifying) return;
    
    const xAccountInput = document.getElementById('profileXAccount');
    const verifyBtn = document.getElementById('verifyXAccountBtn');
    const verificationStatus = document.getElementById('xVerificationStatus');
    
    if (!xAccountInput || !verifyBtn) return;
    
    const xAccount = xAccountInput.value.trim();
    if (!xAccount) {
        alert('Please enter your X account username first');
        return;
    }
    
    const username = xAccount.replace(/^@/, '').trim();
    
    // Rate limiting check
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const attempts = userData.xVerificationAttempts || 0;
        const firstAttemptAt = userData.xVerificationFirstAttemptAt;
        const RATE_LIMIT_HOURS = 24;
        const RATE_LIMIT_ATTEMPTS = 5;
        
        if (firstAttemptAt) {
            const firstAttemptTime = new Date(firstAttemptAt).getTime();
            const now = Date.now();
            const hoursSinceFirstAttempt = (now - firstAttemptTime) / (1000 * 60 * 60);
            
            if (hoursSinceFirstAttempt >= RATE_LIMIT_HOURS) {
                await setDoc(userDocRef, {
                    xVerificationAttempts: 0,
                    xVerificationFirstAttemptAt: null
                }, { merge: true });
            } else if (attempts >= RATE_LIMIT_ATTEMPTS) {
                const hoursRemaining = RATE_LIMIT_HOURS - hoursSinceFirstAttempt;
                const minutesRemaining = Math.ceil(hoursRemaining * 60);
                let timeMessage = formatTimeRemaining(hoursRemaining);
                alert(`Too many verification attempts (${attempts}/${RATE_LIMIT_ATTEMPTS}).\n\nPlease try again in ${timeMessage}.`);
                return;
            }
        } else if (attempts >= RATE_LIMIT_ATTEMPTS) {
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
        const verificationCode = await getOrCreateVerificationCode();
        if (!verificationCode) {
            throw new Error('Failed to get verification code');
        }
        
        const functions = getFunctions(app, 'us-central1');
        const verifyXAccountCallable = httpsCallable(functions, 'verifyXAccount');
        
        const result = await verifyXAccountCallable({ username, verificationCode });
        
        if (result.data.success) {
            await setDoc(doc(db, 'users', currentUser.uid), {
                xAccountVerified: true
            }, { merge: true });
            
            if (verificationStatus) {
                verificationStatus.textContent = '✓ Verified';
                verificationStatus.className = 'x-verification-status verified';
            }
            if (verifyBtn) {
                verifyBtn.textContent = 'Verified';
            }
            if (verificationSection) {
                verificationSection.classList.add('hide');
            }
            
            // Update quest progress
            try {
                const { updateQuestProgress } = await import('/js/quests-init.js');
                await updateQuestProgress('verify_x_account', 1);
            } catch (error) {
                // Ignore
            }
        } else {
            throw new Error(result.data.error || 'Verification failed');
        }
    } catch (error) {
        console.error('Error verifying X account:', error);
        
        // Increment attempt count
        try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.exists() ? userDoc.data() : {};
            const attempts = (userData.xVerificationAttempts || 0) + 1;
            const firstAttemptAt = userData.xVerificationFirstAttemptAt || new Date().toISOString();
            
            await setDoc(userDocRef, {
                xVerificationAttempts: attempts,
                xVerificationFirstAttemptAt: firstAttemptAt
            }, { merge: true });
            
            await updateXVerificationUI({ ...userData, xVerificationAttempts: attempts, xVerificationFirstAttemptAt: firstAttemptAt });
        } catch (updateError) {
            console.error('Error updating attempt count:', updateError);
        }
        
        if (verificationStatus) {
            verificationStatus.textContent = 'Verification failed';
            verificationStatus.className = 'x-verification-status unverified';
        }
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify X Account';
        }
    } finally {
        isVerifying = false;
    }
}

function setupEventListeners() {
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
    
    // Banner selection
    const bannerGrid = document.getElementById('bannerGrid');
    if (bannerGrid) {
        bannerGrid.addEventListener('click', (e) => {
            const bannerItem = e.target.closest('.banner-item');
            if (bannerItem) {
                const bannerPath = bannerItem.dataset.banner;
                if (bannerPath) {
                    selectBanner(bannerPath);
                }
            }
        });
    }
    
    // Banner background selection
    const bannerBgGrid = document.getElementById('bannerBgGrid');
    if (bannerBgGrid) {
        bannerBgGrid.addEventListener('click', (e) => {
            const bannerBgItem = e.target.closest('.banner-item');
            if (bannerBgItem) {
                const bgPath = bannerBgItem.dataset.bannerBg;
                if (bgPath) {
                    selectBannerBg(bgPath);
                }
            }
        });
    }
    
    // X Account input
    const xAccountInput = document.getElementById('profileXAccount');
    if (xAccountInput) {
        xAccountInput.addEventListener('input', async () => {
            const xAccount = xAccountInput.value.trim();
            if (xAccount) {
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
    
    // View More buttons
    const viewMoreBannersBtn = document.getElementById('viewMoreBannersBtn');
    if (viewMoreBannersBtn) {
        viewMoreBannersBtn.addEventListener('click', () => {
            const bannerGrid = document.getElementById('bannerGrid');
            if (bannerGrid) {
                const isExpanded = bannerGrid.classList.contains('expanded');
                if (isExpanded) {
                    bannerGrid.classList.remove('expanded');
                    viewMoreBannersBtn.textContent = 'View More';
                } else {
                    bannerGrid.classList.add('expanded');
                    viewMoreBannersBtn.textContent = 'Show Less';
                }
            }
        });
    }
    
    const viewMoreBannerBgsBtn = document.getElementById('viewMoreBannerBgsBtn');
    if (viewMoreBannerBgsBtn) {
        viewMoreBannerBgsBtn.addEventListener('click', () => {
            const bannerBgGrid = document.getElementById('bannerBgGrid');
            if (bannerBgGrid) {
                const isExpanded = bannerBgGrid.classList.contains('expanded');
                if (isExpanded) {
                    bannerBgGrid.classList.remove('expanded');
                    viewMoreBannerBgsBtn.textContent = 'View More';
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
            document.body.style.overflow = 'hidden';
        });
    }
    
    const closeModal = () => {
        if (instructionsModal) {
            instructionsModal.classList.remove('show');
            document.body.style.overflow = '';
        }
    };
    
    if (closeInstructionsBtn) {
        closeInstructionsBtn.addEventListener('click', closeModal);
    }
    
    if (closeInstructionsBtn2) {
        closeInstructionsBtn2.addEventListener('click', closeModal);
    }
    
    if (instructionsModal) {
        instructionsModal.addEventListener('click', (e) => {
            if (e.target === instructionsModal) {
                closeModal();
            }
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && instructionsModal && instructionsModal.classList.contains('show')) {
            closeModal();
        }
    });
    
    listenersAttached = true;
    console.log('Settings event listeners attached');
}

// Update banner unlock states based on user level
// This function checks if the user's current level is sufficient to unlock items
// It will automatically unlock items if the user is already at or above the required level
function updateBannerUnlockStates(userLevel) {
    console.log('[updateBannerUnlockStates] Called with level:', userLevel);
    
    if (!userLevel || userLevel < 1) {
        userLevel = 1; // Default to level 1 if invalid
    }
    
    // Check if banner grid exists (only on settings page)
    const bannerGrid = document.getElementById('bannerGrid');
    const bannerBgGrid = document.getElementById('bannerBgGrid');
    
    console.log('[updateBannerUnlockStates] Banner grids found:', { bannerGrid: !!bannerGrid, bannerBgGrid: !!bannerBgGrid });
    
    if (!bannerGrid && !bannerBgGrid) {
        // Not on settings page, nothing to update
        console.log('[updateBannerUnlockStates] No banner grids found, returning');
        return;
    }
    
    // Wait a bit more if grids exist but items aren't loaded yet
    if (bannerGrid && bannerGrid.querySelectorAll('.banner-item').length === 0) {
        setTimeout(() => updateBannerUnlockStates(userLevel), 200);
        return;
    }
    if (bannerBgGrid && bannerBgGrid.querySelectorAll('.banner-item').length === 0) {
        setTimeout(() => updateBannerUnlockStates(userLevel), 200);
        return;
    }
    
    // Update banner items
    const bannerItems = bannerGrid ? document.querySelectorAll('#bannerGrid .banner-item') : [];
    
    bannerItems.forEach(item => {
        const bannerPath = item.dataset.banner;
        if (!bannerPath) return;
        
        const bannerIndex = getBannerIndex(bannerPath);
        if (bannerIndex === 0) return;
        
        const requiredLevel = getBannerRequiredLevel(bannerIndex);
        const isUnlocked = isBannerUnlocked(bannerIndex, userLevel);
        
        // Debug logging
        if (bannerIndex > 4) {
            console.log(`[Banner ${bannerIndex}] User Level: ${userLevel}, Required: ${requiredLevel}, Unlocked: ${isUnlocked}`);
        }
        
        // Check if user is already at or above required level - unlock if so
        if (isUnlocked) {
            // User is at required level or higher - unlock the item
            item.classList.remove('locked');
            const overlay = item.querySelector('.banner-lock-overlay');
            if (overlay) overlay.remove();
        } else {
            // User is below required level - keep locked and show requirement
            item.classList.add('locked');
            // Update or create lock overlay
            let overlay = item.querySelector('.banner-lock-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'banner-lock-overlay';
                item.appendChild(overlay);
            }
            overlay.innerHTML = `
                <span class="lock-icon">🔒</span>
                <span class="lock-text">Unlock at Level ${requiredLevel}</span>
            `;
        }
    });
    
    // Update banner background items
    const bannerBgItems = bannerBgGrid ? document.querySelectorAll('#bannerBgGrid .banner-item') : [];
    bannerBgItems.forEach(item => {
        const bgPath = item.dataset.bannerBg;
        if (!bgPath) return;
        
        const bgIndex = getBannerBgIndex(bgPath);
        if (bgIndex === 0) return;
        
        const requiredLevel = getBannerBgRequiredLevel(bgIndex);
        const isUnlocked = isBannerBgUnlocked(bgIndex, userLevel);
        
        // Debug logging
        if (bgIndex > 4) {
            console.log(`[Background ${bgIndex}] User Level: ${userLevel}, Required: ${requiredLevel}, Unlocked: ${isUnlocked}`);
        }
        
        // Check if user is already at or above required level - unlock if so
        if (isUnlocked) {
            // User is at required level or higher - unlock the item
            item.classList.remove('locked');
            const overlay = item.querySelector('.banner-lock-overlay');
            if (overlay) overlay.remove();
        } else {
            // User is below required level - keep locked and show requirement
            item.classList.add('locked');
            // Update or create lock overlay
            let overlay = item.querySelector('.banner-lock-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'banner-lock-overlay';
                item.appendChild(overlay);
            }
            overlay.innerHTML = `
                <span class="lock-icon">🔒</span>
                <span class="lock-text">Unlock at Level ${requiredLevel}</span>
            `;
        }
    });
}
