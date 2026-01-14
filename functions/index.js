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

// Rate limiting for X API verification (in-memory cache)
// In production, consider using Redis or Firestore for distributed rate limiting
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const RATE_LIMIT_MAX_REQUESTS = 1; // 1 request per user per 30 seconds

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

exports.verifyXAccount = functions.region('us-central1').https.onCall(async (data, context) => {
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

    // Rate limiting: prevent abuse of X API
    const rateLimitKey = `${context.auth.uid}_${username}`;
    const now = Date.now();
    const userRateLimit = rateLimitCache.get(rateLimitKey);
    
    if (userRateLimit) {
        const timeSinceLastRequest = now - userRateLimit.lastRequest;
        if (timeSinceLastRequest < RATE_LIMIT_WINDOW) {
            const waitTime = Math.ceil((RATE_LIMIT_WINDOW - timeSinceLastRequest) / 1000);
            throw new functions.https.HttpsError(
                'resource-exhausted',
                `Please wait ${waitTime} second${waitTime !== 1 ? 's' : ''} before trying again`
            );
        }
    }
    
    // Update rate limit cache
    rateLimitCache.set(rateLimitKey, { lastRequest: now });
    
    // Clean up old entries (keep cache size manageable)
    if (rateLimitCache.size > 10000) {
        const entriesToDelete = [];
        for (const [key, value] of rateLimitCache.entries()) {
            if (now - value.lastRequest > RATE_LIMIT_WINDOW * 10) {
                entriesToDelete.push(key);
            }
        }
        entriesToDelete.forEach(key => rateLimitCache.delete(key));
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

        // Normalize bio and code for comparison
        // - Convert to uppercase for case-insensitive matching
        // - Replace multiple whitespace/newlines with single space
        // - Trim leading/trailing whitespace
        const normalizeText = (text) => {
            return text
                .replace(/\s+/g, ' ')  // Replace all whitespace (spaces, newlines, tabs) with single space
                .trim()
                .toUpperCase();
        };

        const normalizedBio = normalizeText(bio);
        const normalizedCode = normalizeText(verificationCode);

        // Check if verification code exists in bio (case-insensitive, whitespace-tolerant)
        const codeFound = normalizedBio.includes(normalizedCode);

        // Log verification attempt with details for debugging
        console.log(`[verifyXAccount:${uid}] Username: ${cleanUsername}`);
        console.log(`[verifyXAccount:${uid}] Looking for code: ${verificationCode} (normalized: ${normalizedCode})`);
        console.log(`[verifyXAccount:${uid}] Bio length: ${bio.length}`);
        console.log(`[verifyXAccount:${uid}] Bio content: "${bio}"`);
        console.log(`[verifyXAccount:${uid}] Normalized bio: "${normalizedBio}"`);
        console.log(`[verifyXAccount:${uid}] Code found: ${codeFound}`);

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

/**
 * Manually verify a user's email address (Admin only)
 * 
 * This function allows admins to manually verify user emails when verification emails fail to arrive.
 * 
 * Usage: Call from Firebase Console or via HTTP request
 * 
 * Parameters:
 * - uid: User ID to verify (required)
 * 
 * Security: Only users with admin role in Firestore can call this function
 */
exports.verifyUserEmail = functions.region('us-central1').https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { uid } = data;

    // Validate input
    if (!uid) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID (uid) is required');
    }

    try {
        // Check if caller is admin
        const callerDoc = await db.collection('users').doc(context.auth.uid).get();
        const callerData = callerDoc.exists ? callerDoc.data() : {};
        const isAdmin = callerData.role === 'admin' || callerData.role === 'moderator';

        if (!isAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can verify user emails');
        }

        // Get the user to verify
        const userToVerify = await admin.auth().getUser(uid);
        
        if (!userToVerify) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }

        // Verify the email using Admin SDK
        await admin.auth().updateUser(uid, {
            emailVerified: true
        });

        console.log(`[verifyUserEmail] Email verified for user: ${uid} (${userToVerify.email}) by admin: ${context.auth.uid}`);

        return {
            success: true,
            message: `Email verified for user ${userToVerify.email}`,
            uid: uid,
            email: userToVerify.email
        };

    } catch (error) {
        console.error('[verifyUserEmail] Error:', error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', `Failed to verify email: ${error.message}`);
    }
});

/**
 * Create a default user profile for a user who doesn't have one
 * 
 * This function:
 * 1. Checks if a user profile exists in Firestore
 * 2. If not, creates a default profile with username, email, avatarCount, and createdAt
 * 3. Can be called by any authenticated user to create their own profile, or by admins for any user
 * 
 * Parameters:
 * - uid: User ID to create profile for (optional, defaults to caller's uid)
 * 
 * Returns:
 * - success: boolean indicating if profile was created
 * - alreadyExists: boolean indicating if profile already existed
 * - username: the username assigned to the profile
 */
exports.createDefaultUserProfile = functions.region('us-central1').https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { uid } = data;
    const targetUid = uid || context.auth.uid;

    // If creating profile for another user, check if caller is admin
    if (targetUid !== context.auth.uid) {
        try {
            const callerDoc = await db.collection('users').doc(context.auth.uid).get();
            const callerData = callerDoc.exists ? callerDoc.data() : {};
            const isAdmin = callerData.role === 'admin' || callerData.role === 'moderator';

            if (!isAdmin) {
                throw new functions.https.HttpsError('permission-denied', 'Only admins can create profiles for other users');
            }
        } catch (error) {
            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            throw new functions.https.HttpsError('internal', `Failed to check admin status: ${error.message}`);
        }
    }

    try {
        // Check if profile already exists
        const userDocRef = db.collection('users').doc(targetUid);
        const userDoc = await userDocRef.get();

        if (userDoc.exists) {
            const existingData = userDoc.data();
            return {
                success: true,
                alreadyExists: true,
                username: existingData.username || 'Unknown',
                message: 'Profile already exists'
            };
        }

        // Get user info from Firebase Auth
        let email = '';
        let username = '';
        
        try {
            const authUser = await admin.auth().getUser(targetUid);
            email = authUser.email || '';
            username = email ? email.split('@')[0] : 'user';
        } catch (authError) {
            console.warn(`[createDefaultUserProfile:${targetUid}] Could not get user from Auth:`, authError.message);
            // Try to get from presence collection as fallback
            const presenceRef = db.collection('presence').doc(targetUid);
            const presenceDoc = await presenceRef.get();
            
            if (presenceDoc.exists) {
                const presenceData = presenceDoc.data();
                username = presenceData.username || '';
                email = presenceData.email || '';
            }
            
            if (!username || username.trim() === '') {
                username = 'user_' + Date.now().toString(36).substring(0, 10);
            }
        }

        // Normalize username to match Firestore rules
        const normalizedUsername = username.toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .substring(0, 20)
            .replace(/^_+|_+$/g, '');

        const finalUsername = normalizedUsername.length >= 3 
            ? normalizedUsername 
            : 'user_' + Date.now().toString(36).substring(0, 10);

        // Create user profile with required fields
        const userData = {
            username: finalUsername,
            email: email || '',
            avatarCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await userDocRef.set(userData);

        console.log(`[createDefaultUserProfile:${targetUid}] Created default profile with username: ${finalUsername}`);

        return {
            success: true,
            alreadyExists: false,
            username: finalUsername,
            message: 'Default profile created successfully'
        };

    } catch (error) {
        console.error(`[createDefaultUserProfile:${targetUid}] Error:`, error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', `Failed to create default profile: ${error.message}`);
    }
});

/**
 * Sync missing user profiles - creates default profiles for users who have usernames but no profile
 * 
 * This function:
 * 1. Gets all usernames from the usernames collection
 * 2. For each username, checks if a user profile exists in the users collection
 * 3. Creates default profiles for any missing users
 * 
 * Security: Only admins can call this function
 * 
 * Returns:
 * - totalUsernames: number of usernames found
 * - existingProfiles: number of profiles that already existed
 * - createdProfiles: number of profiles created
 * - results: array of results for each username
 */
exports.syncMissingUserProfiles = functions.region('us-central1').https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
        // Check if caller is admin
        const callerDoc = await db.collection('users').doc(context.auth.uid).get();
        const callerData = callerDoc.exists ? callerDoc.data() : {};
        const isAdmin = callerData.role === 'admin' || callerData.role === 'moderator';

        if (!isAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can sync user profiles');
        }

        console.log(`[syncMissingUserProfiles] Starting sync by admin: ${context.auth.uid}`);

        // Get all usernames from usernames collection
        const usernamesSnapshot = await db.collection('usernames').get();
        
        if (usernamesSnapshot.empty) {
            return {
                success: true,
                totalUsernames: 0,
                existingProfiles: 0,
                createdProfiles: 0,
                results: [],
                message: 'No usernames found in database'
            };
        }

        const results = [];
        let existingCount = 0;
        let createdCount = 0;
        let errorCount = 0;

        // Process each username
        for (const usernameDoc of usernamesSnapshot.docs) {
            const username = usernameDoc.id;
            const usernameData = usernameDoc.data();
            const uid = usernameData.uid;

            if (!uid) {
                console.warn(`[syncMissingUserProfiles] Username ${username} has no uid, skipping`);
                results.push({
                    username: username,
                    uid: null,
                    status: 'skipped',
                    reason: 'No uid in username document'
                });
                continue;
            }

            try {
                // Check if user profile exists
                const userDocRef = db.collection('users').doc(uid);
                const userDoc = await userDocRef.get();

                if (userDoc.exists) {
                    existingCount++;
                    results.push({
                        username: username,
                        uid: uid,
                        status: 'exists',
                        message: 'Profile already exists'
                    });
                    continue;
                }

                // Profile doesn't exist, create it
                let email = '';
                let finalUsername = username;

                // Try to get user info from Firebase Auth
                try {
                    const authUser = await admin.auth().getUser(uid);
                    email = authUser.email || '';
                    // Use the username from usernames collection (already normalized)
                    finalUsername = username;
                } catch (authError) {
                    console.warn(`[syncMissingUserProfiles] Could not get user ${uid} from Auth:`, authError.message);
                    // Try to get from presence collection as fallback
                    const presenceRef = db.collection('presence').doc(uid);
                    const presenceDoc = await presenceRef.get();
                    
                    if (presenceDoc.exists) {
                        const presenceData = presenceDoc.data();
                        email = presenceData.email || '';
                        finalUsername = presenceData.username || username;
                    }
                }

                // Create user profile with required fields
                const userData = {
                    username: finalUsername,
                    email: email || '',
                    avatarCount: 0,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };

                await userDocRef.set(userData);
                createdCount++;
                
                console.log(`[syncMissingUserProfiles] Created profile for ${username} (uid: ${uid})`);
                results.push({
                    username: username,
                    uid: uid,
                    status: 'created',
                    message: 'Profile created successfully'
                });

            } catch (error) {
                errorCount++;
                console.error(`[syncMissingUserProfiles] Error processing ${username} (uid: ${uid}):`, error);
                results.push({
                    username: username,
                    uid: uid,
                    status: 'error',
                    error: error.message
                });
            }
        }

        const summary = {
            success: true,
            totalUsernames: usernamesSnapshot.size,
            existingProfiles: existingCount,
            createdProfiles: createdCount,
            errors: errorCount,
            results: results,
            message: `Sync complete: ${createdCount} profiles created, ${existingCount} already existed, ${errorCount} errors`
        };

        console.log(`[syncMissingUserProfiles] Sync complete:`, summary);
        return summary;

    } catch (error) {
        console.error('[syncMissingUserProfiles] Error:', error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', `Failed to sync user profiles: ${error.message}`);
    }
});

/**
 * Make a user an admin by username
 * Only callable by existing admins (or manually via Firebase Console for first admin)
 * 
 * Usage from client:
 * const makeUserAdmin = httpsCallable(functions, 'makeUserAdmin');
 * await makeUserAdmin({ username: 'apelover69' });
 */
exports.makeUserAdmin = functions.region('us-central1').https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { username } = data;
    if (!username || typeof username !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Username is required and must be a string');
    }

    const callerUid = context.auth.uid;
    const logPrefix = `[makeUserAdmin:${callerUid}]`;

    try {
        // Check if caller is admin
        const callerDoc = await db.collection('users').doc(callerUid).get();
        const callerData = callerDoc.exists ? callerDoc.data() : {};
        const isCallerAdmin = callerData.role === 'admin';

        // Only admins can grant admin role
        if (!isCallerAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can grant admin role');
        }


        console.log(`${logPrefix} Making user "${username}" an admin`);

        // Find user by username
        const usernameLower = username.toLowerCase();
        const usernameDoc = await db.collection('usernames').doc(usernameLower).get();

        if (!usernameDoc.exists) {
            throw new functions.https.HttpsError('not-found', `User "${username}" not found`);
        }

        const targetUserId = usernameDoc.data().uid;
        console.log(`${logPrefix} Found user ID: ${targetUserId}`);

        // Get target user document
        const targetUserRef = db.collection('users').doc(targetUserId);
        const targetUserDoc = await targetUserRef.get();

        if (!targetUserDoc.exists) {
            throw new functions.https.HttpsError('not-found', `User profile for "${username}" not found`);
        }

        // Update user role to admin
        await targetUserRef.update({
            role: 'admin'
        });

        console.log(`${logPrefix} Successfully set "${username}" as admin`);
        return {
            success: true,
            message: `User "${username}" is now an admin.`,
            username: username,
            userId: targetUserId
        };
    } catch (error) {
        console.error(`${logPrefix} Error:`, error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', `Failed to make user admin: ${error.message}`);
    }
});

/**
 * Cleanup old posts - marks posts older than 7 days as deleted
 * Runs daily at 2 AM UTC
 */
exports.cleanupOldPosts = functions.pubsub.schedule('0 2 * * *')
    .timeZone('UTC')
    .onRun(async (context) => {
        console.log('[cleanupOldPosts] Starting cleanup of posts older than 7 days');
        
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const sevenDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
            
            // Query posts that are not deleted and older than 7 days
            const postsQuery = db.collection('posts')
                .where('deleted', '==', false)
                .where('createdAt', '<', sevenDaysAgoTimestamp);
            
            const snapshot = await postsQuery.get();
            
            if (snapshot.empty) {
                console.log('[cleanupOldPosts] No old posts to clean up');
                return null;
            }
            
            console.log(`[cleanupOldPosts] Found ${snapshot.size} posts to mark as deleted`);
            
            const batch = db.batch();
            let batchCount = 0;
            const maxBatchSize = 500; // Firestore batch limit
            
            for (const doc of snapshot.docs) {
                batch.update(doc.ref, {
                    deleted: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                batchCount++;
                
                // Firestore batches are limited to 500 operations
                if (batchCount >= maxBatchSize) {
                    await batch.commit();
                    console.log(`[cleanupOldPosts] Committed batch of ${batchCount} posts`);
                    batchCount = 0;
                }
            }
            
            // Commit remaining updates
            if (batchCount > 0) {
                await batch.commit();
                console.log(`[cleanupOldPosts] Committed final batch of ${batchCount} posts`);
            }
            
            console.log(`[cleanupOldPosts] Successfully marked ${snapshot.size} posts as deleted`);
            return null;
            
        } catch (error) {
            console.error('[cleanupOldPosts] Error:', error);
            throw error;
        }
    });

/**
 * Cleanup old messages - deletes messages older than 24 hours from all channels
 * Runs daily at 3 AM UTC
 */
exports.cleanupOldMessages = functions.pubsub.schedule('0 3 * * *')
    .timeZone('UTC')
    .onRun(async (context) => {
        console.log('[cleanupOldMessages] Starting cleanup of messages older than 24 hours');
        
        try {
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
            const twentyFourHoursAgoTimestamp = admin.firestore.Timestamp.fromDate(twentyFourHoursAgo);
            
            const channels = ['general', 'raid', 'trading', 'support'];
            let totalDeleted = 0;
            
            for (const channel of channels) {
                try {
                    // Query messages in this channel that are not deleted and older than 24 hours
                    const messagesQuery = db.collection('messages')
                        .where('channel', '==', channel)
                        .where('deleted', '==', false)
                        .where('timestamp', '<', twentyFourHoursAgoTimestamp);
                    
                    const snapshot = await messagesQuery.get();
                    
                    if (snapshot.empty) {
                        console.log(`[cleanupOldMessages] No old messages to delete in channel: ${channel}`);
                        continue;
                    }
                    
                    console.log(`[cleanupOldMessages] Found ${snapshot.size} messages to delete in channel: ${channel}`);
                    
                    const batch = db.batch();
                    let batchCount = 0;
                    const maxBatchSize = 500; // Firestore batch limit
                    
                    for (const doc of snapshot.docs) {
                        batch.delete(doc.ref);
                        batchCount++;
                        
                        // Firestore batches are limited to 500 operations
                        if (batchCount >= maxBatchSize) {
                            await batch.commit();
                            console.log(`[cleanupOldMessages] Committed batch of ${batchCount} messages from channel: ${channel}`);
                            batchCount = 0;
                        }
                    }
                    
                    // Commit remaining deletions
                    if (batchCount > 0) {
                        await batch.commit();
                        console.log(`[cleanupOldMessages] Committed final batch of ${batchCount} messages from channel: ${channel}`);
                    }
                    
                    totalDeleted += snapshot.size;
                    console.log(`[cleanupOldMessages] Successfully deleted ${snapshot.size} messages from channel: ${channel}`);
                    
                } catch (channelError) {
                    console.error(`[cleanupOldMessages] Error cleaning channel ${channel}:`, channelError);
                    // Continue with other channels even if one fails
                }
            }
            
            console.log(`[cleanupOldMessages] Cleanup complete. Total messages deleted: ${totalDeleted}`);
            return null;
            
        } catch (error) {
            console.error('[cleanupOldMessages] Error:', error);
            throw error;
        }
    });
