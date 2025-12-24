/**
 * Script to create the meta/rules document in Firestore
 * 
 * This document contains the rules version string that matches the RULES_VERSION
 * comment in firestore.rules. This allows the client to verify it's using the
 * correct Firestore project and ruleset.
 * 
 * Usage:
 *   1. Update the version string below to match firestore.rules
 *   2. Run: node scripts/create-meta-rules.js
 * 
 * Or create manually in Firebase Console:
 *   - Collection: meta
 *   - Document ID: rules
 *   - Fields: { version: "2025-12-23-2213" }
 */

const version = '2025-12-23-2213';

console.log('To create the meta/rules document:');
console.log('');
console.log('Option 1: Firebase Console');
console.log('  1. Go to Firebase Console → Firestore Database → Data');
console.log('  2. Click "Start collection"');
console.log('  3. Collection ID: meta');
console.log('  4. Document ID: rules');
console.log('  5. Add field: version (string) =', version);
console.log('  6. Click "Save"');
console.log('');
console.log('Option 2: Firebase CLI');
console.log('  firebase firestore:set meta/rules --data \'{"version":"' + version + '"}\'');
console.log('');
console.log('Option 3: Use Firebase Admin SDK (if you have a Node.js script)');
console.log('  const admin = require("firebase-admin");');
console.log('  await admin.firestore().doc("meta/rules").set({ version: "' + version + '" });');
console.log('');
console.log('Current version to set:', version);

