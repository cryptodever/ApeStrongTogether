/**
 * Hard Reset Script: Wipe all player game progress
 * 
 * This script resets all gameGold and gameUpgrades for all users in Firestore.
 * This is a HARD RESET - all progress will be lost!
 * 
 * Usage:
 *   1. Install dependencies: npm install firebase-admin
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable to your service account key
 *   3. Run with dry-run: node scripts/reset-game-progress.js --dry-run
 *   4. Run for real: node scripts/reset-game-progress.js --execute
 * 
 * Safety:
 *   - Default is dry-run mode (no changes)
 *   - Logs all operations before execution
 *   - Requires explicit --execute flag to actually reset
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
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
    console.log('🔍 DRY-RUN MODE: No data will be reset');
    console.log('   Run with --execute to perform actual reset\n');
} else {
    console.log('⚠️  EXECUTION MODE: Game data WILL be reset');
    console.log('   This cannot be undone!\n');
}

/**
 * Reset game data for a single user
 */
async function resetUserGameData(userId, userData) {
    const resetData = {
        gameGold: 0,
        gameUpgrades: {
            weaponDamage: 1,
            weaponFireRate: 1,
            apeHealth: 1
        }
    };
    
    if (isDryRun) {
        console.log(`  [DRY-RUN] Would reset game data for user: ${userId}`);
        if (isVerbose) {
            console.log(`    Current: gold=${userData.gameGold || 0}, upgrades=${JSON.stringify(userData.gameUpgrades || {})}`);
            console.log(`    Reset to: ${JSON.stringify(resetData)}`);
        }
        return { reset: false, userId };
    } else {
        try {
            const userRef = db.collection('users').doc(userId);
            await userRef.update(resetData);
            console.log(`  ✅ Reset game data for user: ${userId}`);
            return { reset: true, userId };
        } catch (error) {
            console.error(`  ❌ Error resetting user ${userId}:`, error.message);
            return { reset: false, userId, error: error.message };
        }
    }
}

/**
 * Main function to reset all game progress
 */
async function resetAllGameProgress() {
    console.log('Starting game progress reset...\n');
    
    let totalUsers = 0;
    let resetCount = 0;
    let errorCount = 0;
    
    try {
        const usersSnapshot = await db.collection('users').get();
        totalUsers = usersSnapshot.size;
        
        console.log(`Found ${totalUsers} users in database\n`);
        
        if (totalUsers === 0) {
            console.log('No users found. Nothing to reset.');
            return;
        }
        
        // Process each user
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            
            // Check if user has game data
            if (userData.gameGold !== undefined || userData.gameUpgrades !== undefined) {
                const result = await resetUserGameData(userId, userData);
                if (result.reset) {
                    resetCount++;
                } else if (result.error) {
                    errorCount++;
                }
            } else {
                if (isVerbose) {
                    console.log(`  ⏭️  Skipping user ${userId} (no game data)`);
                }
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('Reset Summary:');
        console.log(`  Total users: ${totalUsers}`);
        console.log(`  Users with game data reset: ${resetCount}`);
        console.log(`  Errors: ${errorCount}`);
        console.log('='.repeat(50));
        
        if (isDryRun) {
            console.log('\n⚠️  This was a dry-run. No data was actually changed.');
            console.log('   Run with --execute to perform the actual reset.');
        } else {
            console.log('\n✅ Game progress reset complete!');
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the reset
resetAllGameProgress()
    .then(() => {
        console.log('\nScript completed.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Unhandled error:', error);
        process.exit(1);
    });
