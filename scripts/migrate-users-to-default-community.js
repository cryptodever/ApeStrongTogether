/**
 * Migrate Existing Users to Default Community
 * 
 * Adds all existing users to the default "Apes Together Strong" community.
 * 
 * Usage:
 *   1. Install dependencies: npm install firebase-admin
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable to your service account key
 *   3. Run: node scripts/migrate-users-to-default-community.js
 * 
 * Safety:
 *   - Checks if user is already a member before adding
 *   - Idempotent - safe to run multiple times
 *   - Updates member count after adding users
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
const DEFAULT_COMMUNITY_ID = 'default';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const isVerbose = args.includes('--verbose');

if (isDryRun) {
    console.log('🔍 DRY-RUN MODE: No users will be added');
    console.log('   Run with --execute to perform actual migration\n');
} else {
    console.log('⚠️  EXECUTION MODE: Users WILL be added to default community');
    console.log('   This will update the database!\n');
}

/**
 * Check if default community exists
 */
async function checkDefaultCommunity() {
    try {
        const communityRef = db.collection('communities').doc(DEFAULT_COMMUNITY_ID);
        const communityDoc = await communityRef.get();
        
        if (!communityDoc.exists()) {
            throw new Error(`Default community (${DEFAULT_COMMUNITY_ID}) does not exist. Please run create-default-community.js first.`);
        }
        
        return communityDoc.data();
    } catch (error) {
        console.error('Error checking default community:', error);
        throw error;
    }
}

/**
 * Add user to default community
 */
async function addUserToDefaultCommunity(userId, batch) {
    try {
        const memberRef = db.collection('communities').doc(DEFAULT_COMMUNITY_ID)
            .collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        
        if (memberDoc.exists()) {
            if (isVerbose) {
                console.log(`   ⏭️  User ${userId} is already a member`);
            }
            return false; // Already a member
        }
        
        if (!isDryRun) {
            batch.set(memberRef, {
                userId: userId,
                role: 'member',
                joinedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        if (isVerbose) {
            console.log(`   ✅ ${isDryRun ? 'WOULD ADD' : 'ADDED'} user ${userId}`);
        }
        return true; // Added
    } catch (error) {
        console.error(`   ❌ Error adding user ${userId}:`, error.message);
        return false;
    }
}

/**
 * Main migration function
 */
async function migrateUsers() {
    try {
        console.log('🚀 Starting user migration to default community...\n');
        
        // Check if default community exists
        console.log(`🔍 Checking default community (${DEFAULT_COMMUNITY_ID})...`);
        const communityData = await checkDefaultCommunity();
        console.log(`✅ Default community exists: "${communityData.name}"\n`);
        
        // Get all users
        console.log('📖 Fetching all users...');
        const usersSnapshot = await db.collection('users').get();
        
        if (usersSnapshot.empty) {
            console.log('✅ No users found. Nothing to migrate.');
            return;
        }
        
        console.log(`   Found ${usersSnapshot.size} user(s)\n`);
        
        let totalChecked = 0;
        let alreadyMembers = 0;
        let addedCount = 0;
        let errorCount = 0;
        
        // Process users in batches (Firestore batch limit is 500)
        const BATCH_SIZE = 500;
        const users = usersSnapshot.docs;
        
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const batchUsers = users.slice(i, i + BATCH_SIZE);
            let batchAdded = 0;
            
            console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchUsers.length} users)...`);
            
            for (const userDoc of batchUsers) {
                totalChecked++;
                const userId = userDoc.id;
                
                if (isVerbose) {
                    console.log(`   Checking user: ${userId}`);
                }
                
                const wasAdded = await addUserToDefaultCommunity(userId, batch);
                
                if (wasAdded) {
                    batchAdded++;
                    addedCount++;
                } else {
                    alreadyMembers++;
                }
            }
            
            // Commit batch
            if (!isDryRun && batchAdded > 0) {
                try {
                    await batch.commit();
                    console.log(`   ✅ Committed batch: ${batchAdded} user(s) added`);
                } catch (error) {
                    console.error(`   ❌ Error committing batch:`, error.message);
                    errorCount += batchAdded;
                }
            } else if (isDryRun && batchAdded > 0) {
                console.log(`   🗑️  WOULD COMMIT batch: ${batchAdded} user(s) would be added`);
            } else {
                console.log(`   ⏭️  Batch: All users already members`);
            }
        }
        
        // Update member count
        if (!isDryRun && addedCount > 0) {
            console.log('\n📊 Updating member count...');
            const communityRef = db.collection('communities').doc(DEFAULT_COMMUNITY_ID);
            const currentCount = communityData.memberCount || 0;
            await communityRef.update({
                memberCount: currentCount + addedCount
            });
            console.log(`   ✅ Updated member count: ${currentCount} → ${currentCount + addedCount}`);
        }
        
        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total users checked:  ${totalChecked}`);
        console.log(`Already members:      ${alreadyMembers}`);
        console.log(`${isDryRun ? 'Would be added:' : 'Successfully added:'}     ${addedCount}`);
        console.log(`Errors:                ${errorCount}`);
        
        if (isDryRun && addedCount > 0) {
            console.log('\n💡 Run with --execute to add users to default community');
        } else if (!isDryRun && addedCount > 0) {
            console.log('\n✅ Migration completed successfully!');
        } else if (addedCount === 0 && alreadyMembers === totalChecked) {
            console.log('\n✅ All users are already members of the default community!');
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error during migration:', error);
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        process.exit(1);
    }
}

// Run the migration
migrateUsers()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
