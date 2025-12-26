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
                    bannerImg.src = userData.bannerImage;
                }
                
                // Load banner background
                const bannerBg = document.getElementById('profileBannerBg');
                if (bannerBg && userData.bannerBackground) {
                    bannerBg.style.backgroundImage = `url(${userData.bannerBackground})`;
                }
                
                // Update selected banner in grid
                updateBannerSelection(userData.bannerImage);
                
                // Update selected banner background in grid
                updateBannerBgSelection(userData.bannerBackground);
            } else {
                // Profile doesn't exist yet, use defaults
                console.log('Profile does not exist yet, using defaults');
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
    if (!currentUser || isSaving) return;
    
    isSaving = true;
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
    
    try {
        const bio = document.getElementById('profileBio')?.value || '';
        const country = document.getElementById('profileCountry')?.value || '';
        const bannerImage = document.getElementById('profileBannerImg')?.src || '';
        const bannerBg = document.getElementById('profileBannerBg');
        const bannerBackground = bannerBg?.style.backgroundImage 
            ? bannerBg.style.backgroundImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1')
            : '';
        
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
        if (saveBtn) {
            saveBtn.textContent = 'Error - Try Again';
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

// Update banner selection in grid
function updateBannerSelection(selectedBanner) {
    const bannerItems = document.querySelectorAll('#bannerGrid .banner-item');
    bannerItems.forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.banner === selectedBanner) {
            item.classList.add('selected');
        }
    });
}

// Update banner background selection in grid
function updateBannerBgSelection(selectedBg) {
    const bannerBgItems = document.querySelectorAll('#bannerBgGrid .banner-item');
    bannerBgItems.forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.bannerBg === selectedBg) {
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

// Setup event listeners
function setupEventListeners() {
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
    const bannerItems = document.querySelectorAll('#bannerGrid .banner-item');
    bannerItems.forEach(item => {
        item.addEventListener('click', () => {
            const bannerPath = item.dataset.banner;
            if (bannerPath) {
                selectBanner(bannerPath);
            }
        });
    });
    
    // Banner background selection
    const bannerBgItems = document.querySelectorAll('#bannerBgGrid .banner-item');
    bannerBgItems.forEach(item => {
        item.addEventListener('click', () => {
            const bgPath = item.dataset.bannerBg;
            if (bgPath) {
                selectBannerBg(bgPath);
            }
        });
    });
    
    // View More button
    const viewMoreBtn = document.getElementById('viewMoreBannersBtn');
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', () => {
            const bannerGrid = document.getElementById('bannerGrid');
            if (bannerGrid) {
                const isExpanded = bannerGrid.classList.contains('expanded');
                if (isExpanded) {
                    bannerGrid.classList.remove('expanded');
                    viewMoreBtn.textContent = 'View More';
                    // Scroll to top of banner section
                    bannerGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    bannerGrid.classList.add('expanded');
                    viewMoreBtn.textContent = 'Show Less';
                }
            }
        });
    }
}

console.log('Profile page initialized');

