/**
 * Account Settings Module
 * Handles change password, change email, and delete account operations
 * Requires reauthentication for all sensitive operations
 * 
 * USAGE EXAMPLE:
 * 
 * import { changePassword, changeEmail, deleteAccount } from './account-settings.js';
 * 
 * // Change password
 * async function handleChangePassword() {
 *     const newPassword = document.getElementById('newPassword').value;
 *     const success = await changePassword(newPassword);
 *     if (success) {
 *         alert('Password changed successfully!');
 *     }
 * }
 * 
 * // Change email
 * async function handleChangeEmail() {
 *     const newEmail = document.getElementById('newEmail').value;
 *     const success = await changeEmail(newEmail);
 *     if (success) {
 *         alert('Email changed successfully!');
 *     }
 * }
 * 
 * // Delete account
 * async function handleDeleteAccount() {
 *     const confirmed = confirm('Are you sure you want to delete your account? This action cannot be undone.');
 *     if (confirmed) {
 *         const success = await deleteAccount();
 *         if (success) {
 *             alert('Account deleted successfully');
 *             window.location.href = '/';
 *         }
 *     }
 * }
 */

import { auth } from './firebase.js';
import { 
    updatePassword,
    updateEmail,
    deleteUser
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { requireReauth } from './reauth-modal.js';
import { doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { db } from './firebase.js';

/**
 * Change user password
 * @param {string} newPassword - New password (must be at least 6 characters)
 * @returns {Promise<boolean>} True if password was changed successfully
 */
export async function changePassword(newPassword) {
    const user = auth.currentUser;
    
    if (!user) {
        console.error('No user logged in');
        return false;
    }

    if (!newPassword || newPassword.length < 6) {
        console.error('Password must be at least 6 characters');
        return false;
    }

    // Require reauthentication
    const reauthSuccess = await requireReauth('Please enter your password to change your password.');
    if (!reauthSuccess) {
        console.log('Reauthentication cancelled or failed');
        return false;
    }

    try {
        // Reauthenticated successfully, now update password
        await updatePassword(user, newPassword);
        console.log('Password updated successfully');
        return true;
    } catch (error) {
        console.error('Error updating password:', error);
        throw error;
    }
}

/**
 * Change user email
 * @param {string} newEmail - New email address
 * @returns {Promise<boolean>} True if email was changed successfully
 */
export async function changeEmail(newEmail) {
    const user = auth.currentUser;
    
    if (!user) {
        console.error('No user logged in');
        return false;
    }

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        console.error('Invalid email address');
        return false;
    }

    // Require reauthentication
    const reauthSuccess = await requireReauth('Please enter your password to change your email address.');
    if (!reauthSuccess) {
        console.log('Reauthentication cancelled or failed');
        return false;
    }

    try {
        // Reauthenticated successfully, now update email
        await updateEmail(user, newEmail);
        console.log('Email updated successfully');
        return true;
    } catch (error) {
        console.error('Error updating email:', error);
        throw error;
    }
}

/**
 * Delete user account
 * Requires reauthentication and deletes both Auth user and Firestore user document
 * @returns {Promise<boolean>} True if account was deleted successfully
 */
export async function deleteAccount() {
    const user = auth.currentUser;
    
    if (!user) {
        console.error('No user logged in');
        return false;
    }

    // Require reauthentication
    const reauthSuccess = await requireReauth('Please enter your password to delete your account. This action cannot be undone.');
    if (!reauthSuccess) {
        console.log('Reauthentication cancelled or failed');
        return false;
    }

    try {
        const uid = user.uid;

        // Delete Firestore user document if it exists
        try {
            const userDocRef = doc(db, 'users', uid);
            await deleteDoc(userDocRef);
            console.log('User document deleted from Firestore');
        } catch (firestoreError) {
            console.error('Error deleting user document from Firestore:', firestoreError);
            // Continue with auth user deletion even if Firestore deletion fails
        }

        // Delete Auth user (this also logs them out)
        await deleteUser(user);
        console.log('Account deleted successfully');
        return true;
    } catch (error) {
        console.error('Error deleting account:', error);
        throw error;
    }
}

