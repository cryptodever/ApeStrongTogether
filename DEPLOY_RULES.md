# Firestore Rules Deployment & Verification

## Why Previous Rules Were Denying

1. **`meta/rules` read denied:**
   - Previous rule used `match /meta/rules` which should have worked, but the more explicit pattern `match /meta/{docId}` with `docId == "rules"` ensures proper matching
   - The rule now explicitly allows `get` on `meta/rules` only

2. **`/users/{uid}` create denied:**
   - The previous rule had an optional check `(!('createdAt' in request.resource.data) || ...)` which may have caused validation order issues
   - The new rule directly validates `createdAt is timestamp`, which properly handles `serverTimestamp()` sentinels
   - Removed `keys().hasAll()` check that was redundant with `hasOnly()` and could cause validation conflicts

3. **Transaction commit denied:**
   - Both `usernames/{username}` and `users/{uid}` create rules now use direct `is timestamp` validation
   - `serverTimestamp()` sentinels correctly pass the `is timestamp` type check in Firestore security rules
   - Key validation simplified to use `hasOnly()` which is more strict and clear

## Deployment Instructions

### Step 1: Deploy Rules
```bash
firebase deploy --only firestore:rules
```

### Step 2: Verify Deployment
```bash
# Check deployment status
firebase deploy --only firestore:rules --debug
```

### Step 3: Wait for Propagation
Rules typically take 1-2 minutes to propagate. Wait before testing.

## Verification Checklist

### ✅ 1. Rules Version Check
- [ ] Deploy rules successfully (check for errors in output)
- [ ] Wait 1-2 minutes for propagation
- [ ] Visit your site and check browser console for rules version log
- [ ] Should see: `📋 Firestore rules version: 2025-12-24-1200`

### ✅ 2. Meta/Rules Read Access
- [ ] Open browser console on your site
- [ ] Navigate to a page that checks rules version (e.g., login page)
- [ ] Should see successful rules version fetch (no PERMISSION_DENIED errors)
- [ ] Or manually test: `firebase firestore:rules:test` (if using CLI)

### ✅ 3. Signup Transaction Test
- [ ] Go to `/login/?mode=signup`
- [ ] Fill out signup form with a new username
- [ ] Submit the form
- [ ] Check browser console for transaction logs
- [ ] Should see: `✅ Transaction success: username "..." reserved for uid ...`
- [ ] Should NOT see: `PERMISSION_DENIED` errors

### ✅ 4. Firestore Console Verification
- [ ] Open Firebase Console → Firestore Database
- [ ] Verify `usernames/{username}` document was created
- [ ] Verify `users/{uid}` document was created
- [ ] Check that both have `createdAt` field as a timestamp
- [ ] Verify `username` in `users/{uid}` matches the username document ID

### ✅ 5. Error Handling Test
- [ ] Try to signup with an existing username
- [ ] Should see: `Username was just taken. Please choose another.`
- [ ] Verify no orphaned documents were created

### ✅ 6. Username Availability Check
- [ ] On signup page, type a username
- [ ] Should see availability check (green "Available" or red "Taken")
- [ ] Verify no PERMISSION_DENIED errors in console

## Troubleshooting

**If `meta/rules` still returns PERMISSION_DENIED:**
- Verify the rule path matches exactly: `match /meta/{docId}` with `docId == "rules"`
- Check that rules deployed successfully
- Wait 2-3 minutes and try again (propagation delay)

**If transaction still fails with PERMISSION_DENIED:**
- Check browser console for exact error code and message
- Verify user is authenticated before transaction runs
- Ensure `createdAt` field is being set with `serverTimestamp()`
- Verify all field types match rule requirements (string, int, timestamp)

**If rules don't deploy:**
- Check you're logged into Firebase CLI: `firebase login`
- Verify you're in the correct project: `firebase projects:list`
- Check rules syntax: `firebase deploy --only firestore:rules --debug`

## Rules Summary

- **`meta/rules`**: Public read access only
- **`usernames/{username}`**: Public read, authenticated create/delete (owner only), no update
- **`users/{uid}`**: Owner read/create only, no update/delete
- **All other paths**: Denied by default

