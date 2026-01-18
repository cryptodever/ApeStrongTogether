/**
 * Delete User Communities Script
 * 
 * Deletes all communities created by a specific user (except the default community)
 * 
 * Usage: node scripts/delete-user-communities.js <userId>
 * Or: node scripts/delete-user-communities.js <username> (if userId is username)
 */

const admin = require('firebase-admin');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        let serviceAccount;
        
        // Try to load from environment variable first
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            if (fs.existsSync(keyPath)) {
                serviceAccount = require(keyPath);
            }
        }
        
        // Fallback: try to load from project root
        if (!serviceAccount) {
            const keyPath = path.join(__dirname, '..', 'service-account-key.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = require(keyPath);
            }
        }
        
        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id || 'apes-365b0'
            });
        } else {
            // If no key found, try with just project ID (will use default credentials)
            admin.initializeApp({
                projectId: 'apes-365b0'
            });
        }
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
        console.error('   Make sure GOOGLE_APPLICATION_CREDENTIALS is set or service-account-key.json exists in project root');
        process.exit(1);
    }
}

const db = admin.firestore();

async function findUserByUsername(username) {
    // First, try to find via usernames collection
    const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
    
    if (usernameDoc.exists) {
        const data = usernameDoc.data();
        if (data.uid) {
            // Verify the user exists
            const userDoc = await db.collection('users').doc(data.uid).get();
            if (userDoc.exists) {
                return {
                    id: data.uid,
                    data: userDoc.data()
                };
            }
        }
    }
    
    // Fallback: search users collection by username
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).limit(1).get();
    
    if (snapshot.empty) {
        return null;
    }
    
    return {
        id: snapshot.docs[0].id,
        data: snapshot.docs[0].data()
    };
}

async function deleteCommunity(communityId) {
    console.log(`\nDeleting community ${communityId}...`);
    
    try {
        // Get all members
        const membersRef = db.collection('communities').doc(communityId).collection('members');
        const membersSnapshot = await membersRef.get();
        
        // Get all messages
        const messagesRef = db.collection('communities').doc(communityId).collection('messages');
        const messagesSnapshot = await messagesRef.get();
        
        const batch = db.batch();
        let operationCount = 0;
        
        // Delete all members (in batches of 500)
        for (const memberDoc of membersSnapshot.docs) {
            if (operationCount >= 500) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
            }
            batch.delete(memberDoc.ref);
            operationCount++;
        }
        
        // Delete all messages (in batches of 500)
        for (const messageDoc of messagesSnapshot.docs) {
            if (operationCount >= 500) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
            }
            batch.delete(messageDoc.ref);
            operationCount++;
        }
        
        // Commit remaining operations
        if (operationCount > 0) {
            await batch.commit();
        }
        
        // Delete the main community document
        await db.collection('communities').doc(communityId).delete();
        
        console.log(`✓ Successfully deleted community ${communityId}`);
        return true;
    } catch (error) {
        console.error(`✗ Error deleting community ${communityId}:`, error.message);
        return false;
    }
}

async function listUserCommunities(userId) {
    console.log(`\nFinding communities created by user ${userId}...`);
    
    const communitiesRef = db.collection('communities');
    const snapshot = await communitiesRef.where('creatorId', '==', userId).get();
    
    if (snapshot.empty) {
        console.log('No communities found for this user.');
        return [];
    }
    
    const communities = [];
    for (const doc of snapshot.docs) {
        const data = doc.data();
        // Skip default community
        if (doc.id === 'default') {
            console.log(`\nSkipping default community (ID: ${doc.id})`);
            continue;
        }
        
        communities.push({
            id: doc.id,
            name: data.name || 'Unnamed',
            description: data.description || '',
            createdAt: data.createdAt?.toDate() || null,
            memberCount: data.memberCount || 0
        });
    }
    
    return communities;
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node scripts/delete-user-communities.js <userId or username>');
        console.log('Example: node scripts/delete-user-communities.js apelover69');
        console.log('Example: node scripts/delete-user-communities.js YZxEdaNbSxWYlCeGCvWFj4YLSPe2');
        process.exit(1);
    }
    
    const identifier = args[0];
    let userId = identifier;
    
    // Try to find user by username if identifier looks like a username
    if (!identifier.startsWith('auth') && identifier.length < 30) {
        console.log(`Looking up user by username: ${identifier}...`);
        const user = await findUserByUsername(identifier);
        if (user) {
            userId = user.id;
            console.log(`Found user: ${user.data.username} (ID: ${userId})`);
        } else {
            console.log(`User not found by username, trying as userId...`);
        }
    }
    
    // List communities
    const communities = await listUserCommunities(userId);
    
    if (communities.length === 0) {
        console.log('\nNo communities to delete (excluding default community).');
        process.exit(0);
    }
    
    // Display communities
    console.log(`\nFound ${communities.length} community(ies) created by this user:\n`);
    communities.forEach((comm, index) => {
        console.log(`${index + 1}. ${comm.name} (ID: ${comm.id})`);
        console.log(`   Description: ${comm.description || 'None'}`);
        console.log(`   Members: ${comm.memberCount}`);
        console.log(`   Created: ${comm.createdAt ? comm.createdAt.toLocaleString() : 'Unknown'}`);
        console.log('');
    });
    
    // Confirm deletion
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question(`\nDo you want to delete all ${communities.length} community(ies)? (yes/no): `, async (answer) => {
        if (answer.toLowerCase() !== 'yes') {
            console.log('Deletion cancelled.');
            rl.close();
            process.exit(0);
        }
        
        console.log('\nDeleting communities...\n');
        
        let successCount = 0;
        let failCount = 0;
        
        for (const community of communities) {
            const success = await deleteCommunity(community.id);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }
        
        console.log(`\n=== Deletion Complete ===`);
        console.log(`Successfully deleted: ${successCount}`);
        console.log(`Failed: ${failCount}`);
        
        rl.close();
        process.exit(failCount > 0 ? 1 : 0);
    });
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
