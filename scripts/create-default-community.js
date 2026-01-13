/**
 * Create Default Community Script
 * 
 * Creates the default "Apes Together Strong" community with 4 channels:
 * - General, Raid, Trading, Support
 * 
 * Sets the owner (username: 'apelover69') as the creator.
 * 
 * Usage:
 *   1. Install dependencies: npm install firebase-admin
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable to your service account key
 *   3. Run: node scripts/create-default-community.js
 * 
 * Safety:
 *   - Checks if default community already exists before creating
 *   - Idempotent - safe to run multiple times
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            projectId: 'apes-365b0'
        });
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
        console.error('   Make sure GOOGLE_APPLICATION_CREDENTIALS is set or provide credentials');
        process.exit(1);
    }
}

const db = admin.firestore();
const OWNER_USERNAME = 'apelover69';
const DEFAULT_COMMUNITY_ID = 'default';

// Default channels configuration
const DEFAULT_CHANNELS = [
    { id: 'general', name: 'General', description: 'General discussion for the Ape community', order: 0, type: 'text' },
    { id: 'raid', name: 'Raid', description: 'Coordinate raids and community actions', order: 1, type: 'text' },
    { id: 'trading', name: 'Trading', description: 'Share trading tips and market insights', order: 2, type: 'text' },
    { id: 'support', name: 'Support', description: 'Get help and support from the community', order: 3, type: 'text' }
];

/**
 * Find owner's userId from username
 */
async function findOwnerUserId() {
    try {
        // First, try to find via usernames collection
        const usernameDoc = await db.collection('usernames').doc(OWNER_USERNAME.toLowerCase()).get();
        
        if (usernameDoc.exists) {
            const data = usernameDoc.data();
            if (data.uid) {
                // Verify the user exists
                const userDoc = await db.collection('users').doc(data.uid).get();
                if (userDoc.exists) {
                    return data.uid;
                }
            }
        }
        
        // Fallback: search users collection by username
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('username', '==', OWNER_USERNAME).limit(1).get();
        
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
        
        throw new Error(`Owner user with username '${OWNER_USERNAME}' not found`);
    } catch (error) {
        console.error('Error finding owner userId:', error);
        throw error;
    }
}

/**
 * Create default community
 */
async function createDefaultCommunity(ownerUserId) {
    const communityRef = db.collection('communities').doc(DEFAULT_COMMUNITY_ID);
    const communityDoc = await communityRef.get();
    
    if (communityDoc.exists) {
        console.log('✅ Default community already exists');
        return communityDoc.id;
    }
    
    console.log('📝 Creating default community...');
    
    const communityData = {
        name: 'Apes Together Strong',
        description: 'The main community for all apes',
        creatorId: ownerUserId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isPublic: true,
        isDefault: true,
        memberCount: 0,
        inviteCode: 'DEFAULT',
        settings: {
            allowInvites: true,
            approvalRequired: false
        }
    };
    
    await communityRef.set(communityData);
    console.log(`✅ Created default community with ID: ${DEFAULT_COMMUNITY_ID}`);
    
    // Add owner as member with 'owner' role
    const memberRef = communityRef.collection('members').doc(ownerUserId);
    await memberRef.set({
        userId: ownerUserId,
        role: 'owner',
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update member count
    await communityRef.update({
        memberCount: 1
    });
    
    console.log(`✅ Added owner as member`);
    
    return DEFAULT_COMMUNITY_ID;
}

/**
 * Create channels for the default community
 */
async function createChannels(communityId) {
    const communityRef = db.collection('communities').doc(communityId);
    const channelsRef = communityRef.collection('channels');
    
    console.log('📝 Creating channels...');
    
    for (const channel of DEFAULT_CHANNELS) {
        const channelRef = channelsRef.doc(channel.id);
        const channelDoc = await channelRef.get();
        
        if (channelDoc.exists) {
            console.log(`   ⏭️  Channel '${channel.name}' already exists`);
            continue;
        }
        
        await channelRef.set({
            name: channel.name,
            description: channel.description,
            order: channel.order,
            type: channel.type,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`   ✅ Created channel: ${channel.name}`);
    }
    
    console.log('✅ All channels created');
}

/**
 * Main execution
 */
async function main() {
    try {
        console.log('🚀 Starting default community creation...\n');
        
        // Find owner's userId
        console.log(`🔍 Looking for owner user: ${OWNER_USERNAME}...`);
        const ownerUserId = await findOwnerUserId();
        console.log(`✅ Found owner userId: ${ownerUserId}\n`);
        
        // Create default community
        const communityId = await createDefaultCommunity(ownerUserId);
        console.log('');
        
        // Create channels
        await createChannels(communityId);
        console.log('');
        
        console.log('🎉 Default community setup complete!');
        console.log(`   Community ID: ${communityId}`);
        console.log(`   Channels: ${DEFAULT_CHANNELS.map(c => c.name).join(', ')}`);
        
    } catch (error) {
        console.error('❌ Error creating default community:', error);
        process.exit(1);
    }
}

// Run the script
main();