/**
 * Firebase Cloud Function: One-time cleanup of orphaned usernames
 * 
 * This can be called via HTTP or manually triggered to clean up
 * username documents that have no corresponding user document.
 * 
 * Usage:
 *   - Deploy: firebase deploy --only functions:cleanupOrphanedUsernames
 *   - Call: curl -X POST https://your-region-your-project.cloudfunctions.net/cleanupOrphanedUsernames?dryRun=true
 * 
 * Or use Firebase Console Functions tab to invoke manually.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only if not already initialized)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * HTTP Cloud Function to clean up orphaned username documents
 * 
 * Query params:
 *   - dryRun=true: Only report, don't delete (default)
 *   - dryRun=false or ?execute: Actually delete orphaned documents
 */
exports.cleanupOrphanedUsernames = functions.https.onRequest(async (req, res) => {
    // CORS headers (adjust as needed for your domain)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    const isDryRun = req.query.dryRun !== 'false' && !req.query.execute;
    const isVerbose = req.query.verbose === 'true';

    const results = {
        mode: isDryRun ? 'dry-run' : 'execute',
        totalChecked: 0,
        orphanedFound: 0,
        deletedCount: 0,
        errorCount: 0,
        unknownCount: 0,
        orphanedUsernames: []
    };

    try {
        console.log(`Starting orphaned username cleanup (mode: ${results.mode})...`);

        // Get all username documents
        const usernamesSnapshot = await db.collection('usernames').get();

        if (usernamesSnapshot.empty) {
            results.message = 'No username documents found';
            res.status(200).json(results);
            return;
        }

        results.totalChecked = usernamesSnapshot.size;
        console.log(`Found ${results.totalChecked} username document(s)`);

        // Process each username document
        for (const usernameDoc of usernamesSnapshot.docs) {
            const username = usernameDoc.id;
            const data = usernameDoc.data();
            const uid = data.uid;

            if (!uid) {
                console.warn(`usernames/${username}: Missing uid field`);
                results.errorCount++;
                continue;
            }

            // Check if corresponding user document exists
            try {
                const userDoc = await db.collection('users').doc(uid).get();
                
                if (!userDoc.exists) {
                    // Orphaned username
                    results.orphanedFound++;
                    results.orphanedUsernames.push({
                        username: username,
                        uid: uid
                    });

                    if (!isDryRun) {
                        try {
                            await db.collection('usernames').doc(username).delete();
                            results.deletedCount++;
                            console.log(`Deleted orphaned usernames/${username}`);
                        } catch (deleteError) {
                            console.error(`Failed to delete usernames/${username}:`, deleteError);
                            results.errorCount++;
                        }
                    } else {
                        console.log(`Would delete orphaned usernames/${username} (users/${uid} missing)`);
                    }
                } else if (isVerbose) {
                    console.log(`Valid: usernames/${username} -> users/${uid} exists`);
                }
            } catch (checkError) {
                console.error(`Error checking users/${uid} for usernames/${username}:`, checkError);
                results.unknownCount++;
            }
        }

        // Prepare response
        if (isDryRun && results.orphanedFound > 0) {
            results.message = `Found ${results.orphanedFound} orphaned username(s). Add ?execute to delete them.`;
        } else if (!isDryRun && results.deletedCount > 0) {
            results.message = `Successfully deleted ${results.deletedCount} orphaned username document(s)`;
        } else if (results.orphanedFound === 0) {
            results.message = 'No orphaned usernames found - database is clean!';
        }

        console.log('Cleanup completed:', results);
        res.status(200).json(results);

    } catch (error) {
        console.error('Fatal error during cleanup:', error);
        res.status(500).json({
            error: 'Cleanup failed',
            message: error.message,
            code: error.code
        });
    }
});

