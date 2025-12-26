/**
 * Profile Page Initialization Module
 * Handles authentication gate, profile loading, and saving to Firestore
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

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
        
        // Get existing profile data to merge
        const userDoc = await getDoc(userDocRef);
        const existingData = userDoc.exists() ? userDoc.data() : {};
        
        // Update profile data
        await setDoc(userDocRef, {
            ...existingData,
            bio: bio.trim(),
            country: country,
            bannerImage: bannerImage,
            bannerBackground: bannerBackground,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log('Profile saved successfully', { bio: bio.trim(), country, bannerImage, bannerBackground });
        
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

