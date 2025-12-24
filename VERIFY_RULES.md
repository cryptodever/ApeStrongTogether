# Firestore Rules Verification Checklist

## Rules File Status

✅ **Confirmed:** `firestore.rules` has been replaced with serverTimestamp-safe version

**Key Changes:**
- Uses helper functions (`isSignedIn()`, `isOwner()`, `isValidUsername()`)
- Allows `createdAt` to be omitted (handles serverTimestamp transforms)
- Allows public read of `meta/rules` (while signed out)
- Maintains strict validation and deny-by-default behavior

---

## Deployment

### Step 1: Deploy Rules
```bash
firebase deploy --only firestore:rules
```

### Step 2: Wait for Propagation
Rules typically take 1-2 minutes to propagate. Wait before testing.

---

## Verification Checklist

### ✅ 1. Meta/Rules Read Access (Public)
**Test:** Read `meta/rules` while signed out

- [ ] Open browser console (signed out or in incognito)
- [ ] Navigate to any page that checks rules version (e.g., `/login/`)
- [ ] Check console for rules version fetch
- [ ] Should see: `📋 Firestore rules version: [version]` or successful fetch
- [ ] Should NOT see: `PERMISSION_DENIED` errors
- [ ] Or manually test: `db.collection('meta').doc('rules').get()` should succeed

**Expected:** ✅ Read succeeds while signed out

---

### ✅ 2. Signup Transaction Commit
**Test:** Complete signup flow and verify transaction succeeds

- [ ] Go to `/login/?mode=signup`
- [ ] Fill out signup form:
  - Username: `testuser123` (new, valid format)
  - Email: `test@example.com`
  - Password: Valid password
- [ ] Submit the form
- [ ] Check browser console for transaction logs

**Expected Console Output:**
```
🔄 Starting atomic username reservation transaction:
  - UID: [uid]
  - Username: testuser123
  ...
✅ Transaction success: username "testuser123" reserved for uid [uid]
```

- [ ] Should NOT see: `PERMISSION_DENIED` errors
- [ ] Should NOT see: `Missing or insufficient permissions`
- [ ] Should see: `✅ Transaction success`

**Expected:** ✅ Transaction commits successfully

---

### ✅ 3. Firestore Documents Created
**Test:** Verify both documents exist in Firestore

- [ ] Open Firebase Console → Firestore Database
- [ ] Navigate to `usernames` collection
- [ ] Verify `usernames/testuser123` document exists
  - Should have field: `uid` (string)
  - Should have field: `createdAt` (timestamp)
- [ ] Navigate to `users` collection
- [ ] Verify `users/[uid]` document exists
  - Should have field: `username` (string, value: "testuser123")
  - Should have field: `email` (string)
  - Should have field: `avatarCount` (number, value: 0)
  - Should have field: `createdAt` (timestamp)
- [ ] Verify `createdAt` timestamps are recent (within last minute)

**Expected:** ✅ Both documents created with all fields

---

### ✅ 4. Security Validation (Negative Tests)
**Test:** Verify rules still block unauthorized access

- [ ] Try to create `users/{uid}` with different uid → Should fail
- [ ] Try to create `usernames/{username}` without auth → Should fail
- [ ] Try to create `users/{uid}` with extra fields → Should fail
- [ ] Try to create `users/{uid}` with invalid username format → Should fail
- [ ] Try to read another user's `users/{uid}` doc → Should fail
- [ ] Try to list `users` collection → Should fail

**Expected:** ✅ All unauthorized operations denied

---

## Troubleshooting

### If `meta/rules` still returns PERMISSION_DENIED:
- Verify rule path: `match /meta/{docId}` with `allow read: if docId == "rules"`
- Check that rules deployed successfully
- Wait 2-3 minutes and try again (propagation delay)
- Clear browser cache and retry

### If transaction still fails:
- Check browser console for exact error code and message
- Verify user is authenticated before transaction runs
- Verify `createdAt` is set via `serverTimestamp()` in transaction
- Check that all field types match requirements:
  - `username`: string, matches `^[a-z0-9_]{3,20}$`
  - `email`: string
  - `avatarCount`: int, >= 0
  - `createdAt`: omitted or timestamp (serverTimestamp transform)

### If documents don't appear:
- Wait a few seconds for Firestore sync
- Refresh Firestore Console
- Check browser console for any errors after transaction success
- Verify transaction actually committed (check console logs)

---

## Rules Summary

- ✅ **Public read:** `meta/rules` only
- ✅ **Username registry:** Public read, authenticated create/delete (owner), no update
- ✅ **User profiles:** Owner read/create only, no update/delete
- ✅ **All other paths:** Denied by default
- ✅ **serverTimestamp safe:** `createdAt` can be omitted (applied via transform)

