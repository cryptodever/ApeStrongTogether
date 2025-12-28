/**
 * Quick script to verify a user's email using Firebase Admin SDK
 * 
 * Usage: node verify-email.js
 * 
 * Make sure you have firebase-admin installed:
 * npm install firebase-admin
 * 
 * Or use Firebase CLI service account
 */

// Method 1: Using Firebase CLI (if you have it set up)
// Run: firebase auth:export users.json
// Then manually edit, or use the Admin SDK method below

// Method 2: Using Admin SDK (requires service account)
// Uncomment and configure:

/*
const admin = require('firebase-admin');

// Initialize with service account (download from Firebase Console → Project Settings → Service Accounts)
const serviceAccount = require('./path-to-service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function verifyEmail(uid) {
    try {
        await admin.auth().updateUser(uid, {
            emailVerified: true
        });
        const user = await admin.auth().getUser(uid);
        console.log(`✅ Email verified for: ${user.email} (${uid})`);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Verify your friend's email
verifyEmail('Gz1UdzwKuGUoKjGVuqt1yNSQcg33');
*/

console.log('To use this script:');
console.log('1. Install firebase-admin: npm install firebase-admin');
console.log('2. Download service account key from Firebase Console');
console.log('3. Uncomment the code above and configure');
console.log('');
console.log('OR use Option 1 (Browser Console) which is easier!');

