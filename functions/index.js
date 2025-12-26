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

/**
 * Verify X (Twitter) account ownership by checking if verification code exists in user's bio
 * 
 * This function:
 * 1. Accepts X username and verification code from client
 * 2. Uses X API to fetch user's profile/bio
 * 3. Checks if verification code exists in bio
 * 4. Returns verification status
 * 
 * Requires X API credentials to be set in Firebase Functions config:
 * - X_API_BEARER_TOKEN (for OAuth 2.0 Bearer Token authentication)
 * 
 * To set config: firebase functions:config:set x.api_bearer_token="YOUR_TOKEN"
 */
const axios = require('axios');

exports.verifyXAccount = functions.https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { username, verificationCode, uid } = data;

    // Validate input
    if (!username || !verificationCode || !uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    // Verify the uid matches the authenticated user
    if (uid !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'UID mismatch');
    }

    // Get X API Bearer Token from config
    const bearerToken = functions.config().x?.api_bearer_token;
    if (!bearerToken) {
        console.error('X API Bearer Token not configured');
        throw new functions.https.HttpsError('failed-precondition', 'X API not configured');
    }

    try {
        // Clean username (remove @ if present)
        const cleanUsername = username.replace(/^@/, '').trim();

        // Call X API v2 to get user by username
        // Endpoint: GET https://api.twitter.com/2/users/by/username/:username
        const apiUrl = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(cleanUsername)}?user.fields=description`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data || !response.data.data) {
            throw new Error('User not found on X');
        }

        const userData = response.data.data;
        const bio = userData.description || '';

        // Check if verification code exists in bio
        const codeFound = bio.includes(verificationCode);

        // Log verification attempt
        console.log(`[verifyXAccount:${uid}] Username: ${cleanUsername}, Code found: ${codeFound}`);

        return {
            verified: codeFound,
            username: cleanUsername,
            error: codeFound ? null : 'Verification code not found in X bio. Make sure you\'ve added the code to your bio.'
        };

    } catch (error) {
        console.error(`[verifyXAccount:${uid}] Error:`, error);

        // Handle specific X API errors
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;

            if (status === 404) {
                throw new functions.https.HttpsError('not-found', 'X account not found');
            } else if (status === 401 || status === 403) {
                throw new functions.https.HttpsError('permission-denied', 'X API authentication failed. Check API credentials.');
            } else if (status === 429) {
                throw new functions.https.HttpsError('resource-exhausted', 'X API rate limit exceeded. Please try again later.');
            } else {
                throw new functions.https.HttpsError('internal', `X API error: ${errorData?.title || error.message}`);
            }
        }

        // Handle network/other errors
        throw new functions.https.HttpsError('internal', `Verification failed: ${error.message}`);
    }
});

