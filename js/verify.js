/**
 * Email Verification Page Module
 * Handles resend verification email and checking verification status
 */

import { auth, db } from './firebase.js';
import { 
    sendEmailVerification,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { createUserProfileAfterVerification } from './auth-ui.js';

const resendBtn = document.getElementById('resendBtn');
const continueBtn = document.getElementById('continueBtn');
const userEmailEl = document.getElementById('userEmail');
const errorMsg = document.getElementById('verifyError');
const successMsg = document.getElementById('verifySuccess');

function showMessage(type, message) {
    if (type === 'error') {
        errorMsg.textContent = message;
        errorMsg.classList.add('show');
        successMsg.classList.remove('show');
        setTimeout(() => errorMsg.classList.remove('show'), 5000);
    } else {
        successMsg.textContent = message;
        successMsg.classList.add('show');
        errorMsg.classList.remove('show');
        setTimeout(() => successMsg.classList.remove('show'), 5000);
    }
}

// Get current user email
onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmailEl.textContent = user.email || 'your email address';
    } else {
        // User not logged in, redirect to login
        window.location.href = '/login/';
    }
});

// Resend verification email
if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
            showMessage('error', 'You must be logged in to resend verification email.');
            return;
        }
        
        try {
            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending...';
            await sendEmailVerification(user);
            showMessage('success', 'Verification email sent! Check your inbox.');
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Verification Email';
        } catch (error) {
            console.error('Error sending verification email:', error);
            showMessage('error', error.message || 'Failed to send verification email. Please try again.');
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Verification Email';
        }
    });
}

// Check verification status and continue
if (continueBtn) {
    continueBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
            showMessage('error', 'You must be logged in.');
            return;
        }
        
        try {
            continueBtn.disabled = true;
            continueBtn.textContent = 'Checking...';
            
            // Reload user to get latest verification status
            await user.reload();
            const currentUser = auth.currentUser;
            
            // Check if verified
            if (currentUser && currentUser.emailVerified) {
                // Email is verified - create user profile if it doesn't exist yet
                console.log('Email verified! Creating user profile...');
                
                try {
                    // Get username from localStorage (stored during signup)
                    const pendingUsername = localStorage.getItem('pending_username');
                    
                    if (pendingUsername) {
                        console.log(`Found reserved username in localStorage: ${pendingUsername}`);
                        
                        // Check if profile already exists (it should have been created during signup)
                        const userDocRef = doc(db, 'users', currentUser.uid);
                        const userDoc = await getDoc(userDocRef);
                        
                        if (userDoc.exists()) {
                            console.log('✅ User profile already exists (created during signup)');
                            // Clear the pending username since profile exists
                            localStorage.removeItem('pending_username');
                            // Redirect to profile
                            window.location.href = '/profile/';
                        } else {
                            // Profile doesn't exist - create it now (fallback for edge cases)
                            console.log('⚠️ Profile not found, creating now...');
                            const profileResult = await createUserProfileAfterVerification(
                                currentUser.uid,
                                pendingUsername,
                                currentUser.email
                            );
                            
                            // Clear the pending username from localStorage
                            localStorage.removeItem('pending_username');
                            
                            if (profileResult.success) {
                                console.log('✅ User profile created successfully');
                                // Redirect to profile
                                window.location.href = '/profile/';
                            } else {
                                showMessage('error', 'Profile creation failed. Please try again.');
                                continueBtn.disabled = false;
                                continueBtn.textContent = 'I Verified, Continue';
                            }
                        }
                    } else {
                        console.warn('⚠️ No pending username found - profile may already exist');
                        // Still redirect - profile might already exist or user may have logged in previously
                        window.location.href = '/profile/';
                    }
                } catch (profileError) {
                    console.error('Error creating user profile:', profileError);
                    // Clear localStorage on error
                    localStorage.removeItem('pending_username');
                    // If profile creation fails, still redirect - user might already have profile
                    window.location.href = '/generator/';
                }
            } else {
                showMessage('error', 'Email not verified yet. Please check your inbox and click the verification link.');
                continueBtn.disabled = false;
                continueBtn.textContent = 'I Verified, Continue';
            }
        } catch (error) {
            console.error('Error checking verification status:', error);
            showMessage('error', error.message || 'Failed to check verification status. Please try again.');
            continueBtn.disabled = false;
            continueBtn.textContent = 'I Verified, Continue';
        }
    });
}

