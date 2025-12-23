/**
 * Email Verification Page Module
 * Handles resend verification email and checking verification status
 */

import { auth } from './firebase.js';
import { 
    sendEmailVerification,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

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
                // Redirect to generator
                window.location.href = '/generator/';
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

