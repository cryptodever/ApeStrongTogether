/**
 * Firebase Cloud Function to clean up Firestore user data when an Auth user is deleted
 * 
 * This function ensures that when a Firebase Auth user is deleted:
 * 1. The user document (users/{uid}) is deleted
 * 2. The username reservation document (usernames/{usernameLower}) is deleted
 * 
 * This allows usernames to be reused after account deletion.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only if not already initialized)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Triggered when a Firebase Auth user is deleted
 * Automatically cleans up associated Firestore documents
 */
exports.cleanupUserData = functions.auth.user().onDelete(async (user) => {
    const uid = user.uid;
    const logPrefix = `[cleanupUserData:${uid}]`;

    console.log(`${logPrefix} Starting cleanup for deleted auth user`);

    try {
        // Step 1: Read the user document from Firestore to get the username
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            console.log(`${logPrefix} User document does not exist in Firestore, skipping cleanup`);
            return null;
        }

        const userData = userDoc.data();
        const username = userData.username;
        const usernameLower = userData.usernameLower || (username ? username.toLowerCase() : null);

        if (!usernameLower) {
            console.warn(`${logPrefix} No username found in user document, deleting user doc only`);
            // Still try to delete the user document even if username is missing
            await userDocRef.delete();
            console.log(`${logPrefix} User document deleted (no username to clean up)`);
            return null;
        }

        console.log(`${logPrefix} Found username: ${usernameLower}`);

        // Step 2: Delete the username reservation document first (to free it up)
        const usernameDocRef = db.collection('usernames').doc(usernameLower);
        
        // Check if username document exists before attempting deletion
        const usernameDoc = await usernameDocRef.get();
        if (usernameDoc.exists) {
            await usernameDocRef.delete();
            console.log(`${logPrefix} Username reservation deleted: ${usernameLower}`);
        } else {
            console.log(`${logPrefix} Username document does not exist, skipping`);
        }

        // Step 3: Delete the user document
        await userDocRef.delete();

        console.log(`${logPrefix} Successfully deleted user document and username reservation (${usernameLower})`);
        return null;

    } catch (error) {
        // Handle errors gracefully - log but don't crash
        console.error(`${logPrefix} Error during cleanup:`, error);
        console.error(`${logPrefix} Error code: ${error.code}, message: ${error.message}`);

        // Try to delete user document even if username cleanup failed
        try {
            const userDocRef = db.collection('users').doc(uid);
            await userDocRef.delete();
            console.log(`${logPrefix} User document deleted despite username cleanup error`);
        } catch (deleteError) {
            console.error(`${logPrefix} Failed to delete user document:`, deleteError);
        }

        // Don't throw - we want the function to succeed even if cleanup is incomplete
        // The error is logged for monitoring
        return null;
    }
});

