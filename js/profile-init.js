/**
 * Profile Page Initialization Module
 * Handles authentication gate, profile loading, and saving to Firestore
 */

import { auth, db, app } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
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
        currentUser = null;
        listenersAttached = false; // Reset flag for next login
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
        
        profileListener = onSnapshot(userDocRef, (userDoc) => {
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Load username
                const usernameElement = document.getElementById('profileUsername');
                if (usernameElement && userData.username) {
                    usernameElement.textContent = userData.username;
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
                    bannerBg.style.backgroundImage = `url(${bgPath})`;
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
                xVerificationAttempts: 0
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
        bannerBg.style.backgroundImage = `url(${bgPath})`;
    }
    
    // Update selection in grid
    updateBannerBgSelection(bgPath);
    
    // Auto-save banner background selection
    saveProfile();
}

// Update X verification UI based on status
async function updateXVerificationUI(userData) {
    const xAccountInput = document.getElementById('profileXAccount');
    const verificationSection = document.getElementById('xVerificationSection');
    const verificationStatus = document.getElementById('xVerificationStatus');
    const verificationCodeElement = document.getElementById('xVerificationCode');
    
    if (!xAccountInput || !verificationSection || !verificationStatus) return;
    
    const xAccount = xAccountInput.value.trim();
    const isVerified = userData.xAccountVerified === true;
    const verificationCode = userData.xVerificationCode;
    
    // Update status indicator
    verificationStatus.className = 'x-verification-status';
    if (isVerified) {
        verificationStatus.textContent = '✓ Verified';
        verificationStatus.classList.add('verified');
        verificationSection.style.display = 'none';
    } else if (xAccount) {
        verificationStatus.textContent = 'Unverified';
        verificationStatus.classList.add('unverified');
        verificationSection.style.display = 'block';
        
        // Load or generate verification code
        if (verificationCodeElement) {
            const code = await getOrCreateVerificationCode();
            if (code) {
                verificationCodeElement.textContent = code;
            }
        }
    } else {
        verificationStatus.textContent = '';
        verificationSection.style.display = 'none';
    }
}

// Copy verification code to clipboard
async function copyVerificationCode() {
    const codeElement = document.getElementById('xVerificationCode');
    if (!codeElement) return;
    
    const code = codeElement.textContent;
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
        // Fallback: select text
        const range = document.createRange();
        range.selectNode(codeElement);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
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
    
    // Extract username (remove @ if present)
    const username = xAccount.replace(/^@/, '').trim();
    
    // Rate limiting check
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const attempts = userData.xVerificationAttempts || 0;
        
        if (attempts >= 5) {
            alert('Too many verification attempts. Please try again later.');
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
        const verificationCode = await getOrCreateVerificationCode();
        if (!verificationCode) {
            throw new Error('Failed to get verification code');
        }
        
        // Call Firebase Cloud Function to verify X account
        const functions = getFunctions(app);
        const verifyXAccount = httpsCallable(functions, 'verifyXAccount');
        
        const result = await verifyXAccount({
            username: username,
            verificationCode: verificationCode,
            uid: currentUser.uid
        });
        
        if (result.verified) {
            // Update Firestore
            const userDocRef = doc(db, 'users', currentUser.uid);
            await setDoc(userDocRef, {
                xAccountVerified: true,
                xAccount: xAccount,
                xVerifiedAt: new Date().toISOString(),
                xVerificationAttempts: 0 // Reset on success
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
                verificationSection.style.display = 'none';
            }
        } else {
            throw new Error(result.error || 'Verification code not found in bio');
        }
    } catch (error) {
        console.error('Verification error:', error);
        
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
        
        // Increment attempt counter
        try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.exists() ? userDoc.data() : {};
            const attempts = (userData.xVerificationAttempts || 0) + 1;
            
            await setDoc(userDocRef, {
                xVerificationAttempts: attempts
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
                if (verificationSection) verificationSection.style.display = 'none';
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

console.log('Profile page initialized');

