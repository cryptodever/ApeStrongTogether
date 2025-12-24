/**
 * One-time cleanup script: Remove orphaned username documents
 * 
 * This script scans all usernames/{username} documents and checks if their
 * corresponding users/{uid} document exists. If not, the username doc is
 * considered orphaned and can be deleted.
 * 
 * Usage:
 *   1. Install dependencies: npm install firebase-admin
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable to your service account key
 *   3. Run with dry-run: node scripts/cleanup-orphaned-usernames.js --dry-run
 *   4. Run for real: node scripts/cleanup-orphaned-usernames.js
 * 
 * Safety:
 *   - Default is dry-run mode (no deletions)
 *   - Logs all operations before execution
 *   - Requires explicit --execute flag to actually delete
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
// Make sure GOOGLE_APPLICATION_CREDENTIALS is set, or initialize with service account
if (!admin.apps.length) {
    try {
        admin.initializeApp();
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
        console.error('   Make sure GOOGLE_APPLICATION_CREDENTIALS is set or provide credentials');
        process.exit(1);
    }
}

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const isVerbose = args.includes('--verbose');

if (isDryRun) {
    console.log('🔍 DRY-RUN MODE: No documents will be deleted');
    console.log('   Run with --execute to perform actual deletions\n');
} else {
    console.log('⚠️  EXECUTION MODE: Documents WILL be deleted');
    console.log('   This cannot be undone!\n');
}

/**
 * Check if a user document exists for the given UID
 */
async function userExists(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        return userDoc.exists;
    } catch (error) {
        console.error(`  ⚠️  Error checking users/${uid}:`, error.message);
        return null; // Return null on error (treat as "unknown")
    }
}

/**
 * Delete an orphaned username document
 */
async function deleteOrphanedUsername(username, usernameDoc) {
    try {
        if (!isDryRun) {
            await db.collection('usernames').doc(username).delete();
            console.log(`  ✅ DELETED: usernames/${username}`);
        } else {
            console.log(`  🗑️  WOULD DELETE: usernames/${username}`);
        }
        return true;
    } catch (error) {
        console.error(`  ❌ Failed to delete usernames/${username}:`, error.message);
        return false;
    }
}

/**
 * Main cleanup function
 */
async function cleanupOrphanedUsernames() {
    console.log('📋 Starting orphaned username cleanup...\n');
    
    let totalChecked = 0;
    let orphanedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;
    let unknownCount = 0;
    
    try {
        // Get all username documents
        console.log('📖 Fetching all username documents...');
        const usernamesSnapshot = await db.collection('usernames').get();
        
        if (usernamesSnapshot.empty) {
            console.log('✅ No username documents found. Nothing to clean up.');
            return;
        }
        
        console.log(`   Found ${usernamesSnapshot.size} username document(s)\n`);
        totalChecked = usernamesSnapshot.size;
        
        // Process each username document
        for (const usernameDoc of usernamesSnapshot.docs) {
            const username = usernameDoc.id;
            const data = usernameDoc.data();
            const uid = data.uid;
            
            if (!uid) {
                console.log(`⚠️  usernames/${username}: Missing uid field`);
                errorCount++;
                continue;
            }
            
            if (isVerbose) {
                console.log(`🔍 Checking usernames/${username} -> users/${uid}...`);
            }
            
            // Check if corresponding user document exists
            const userExistsResult = await userExists(uid);
            
            if (userExistsResult === null) {
                // Error checking (unknown state)
                console.log(`❓ usernames/${username}: Could not verify users/${uid} (check failed)`);
                unknownCount++;
                continue;
            }
            
            if (!userExistsResult) {
                // Orphaned username - user doc doesn't exist
                orphanedCount++;
                console.log(`🚨 ORPHANED: usernames/${username} (users/${uid} does not exist)`);
                
                const deleted = await deleteOrphanedUsername(username, usernameDoc);
                if (deleted) {
                    deletedCount++;
                } else {
                    errorCount++;
                }
            } else {
                // Valid - user doc exists
                if (isVerbose) {
                    console.log(`  ✅ Valid: users/${uid} exists`);
                }
            }
        }
        
        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 CLEANUP SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total checked:        ${totalChecked}`);
        console.log(`Orphaned found:       ${orphanedCount}`);
        console.log(`Successfully deleted: ${deletedCount}`);
        console.log(`Errors:               ${errorCount}`);
        console.log(`Unknown (check failed): ${unknownCount}`);
        
        if (isDryRun && orphanedCount > 0) {
            console.log('\n💡 Run with --execute to delete orphaned documents');
        } else if (!isDryRun && deletedCount > 0) {
            console.log('\n✅ Cleanup completed successfully');
        } else if (orphanedCount === 0) {
            console.log('\n✅ No orphaned usernames found - database is clean!');
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error during cleanup:', error);
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        process.exit(1);
    }
}

// Run the cleanup
cleanupOrphanedUsernames()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });

