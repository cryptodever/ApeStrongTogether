# Create meta/rules Document in Firestore

## Purpose
Create the `meta/rules` document to store the Firestore rules version for client-side verification.

## Firestore Console Steps

### Step 1: Open Firestore Database
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **apes-365b0** (or your project name)
3. Click **Firestore Database** in the left sidebar

### Step 2: Create Collection (if needed)
1. If `meta` collection doesn't exist, click **Start collection**
2. Collection ID: `meta`
3. Click **Next**

### Step 3: Create Document
1. Document ID: `rules`
2. Click **Set document ID** (toggle to manual entry)
3. Enter `rules` as the document ID

### Step 4: Add Field
1. Click **Add field**
2. Field name: `version`
3. Field type: **string**
4. Field value: `2025-12-24-0348`
5. Click **Save**

## Quick Method (Using Firebase Console UI)

1. **Firebase Console** → **Firestore Database**
2. Click **Start collection** (if no collections exist) or click the **+** icon next to existing collections
3. Collection ID: `meta`
4. Click **Next**
5. Document ID: `rules` (toggle "Auto-ID" off and enter manually)
6. Add field:
   - Field: `version`
   - Type: `string`
   - Value: `2025-12-24-0348`
7. Click **Save**

## Expected Result

The document should exist at:
```
Collection: meta
Document ID: rules
Fields:
  version: "2025-12-24-0348" (string)
```

## Verify Creation

After creating, you should see:
- Collection: `meta`
- Document: `rules`
- Field: `version` with value `"2025-12-24-0348"`

## Alternative: Using Firebase CLI

If you prefer command line:

```bash
# Using firebase-tools (requires firebase CLI)
firebase firestore:data:set meta/rules --data '{"version":"2025-12-24-0348"}'
```

Or create a script:

```javascript
// scripts/create-meta-rules.js
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function createMetaRules() {
  await db.collection('meta').doc('rules').set({
    version: '2025-12-24-0348'
  });
  console.log('✅ Created meta/rules document');
  process.exit(0);
}

createMetaRules().catch(console.error);
```

```bash
node scripts/create-meta-rules.js
```

