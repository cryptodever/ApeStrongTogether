# Firestore 403 Debugging Guide

This guide provides a step-by-step process to isolate why Firestore writes are returning 403 PERMISSION_DENIED errors.

## Overview

The debugging process has 4 parts:
- **Part A:** Verify client project matches deployed rules
- **Part B:** Test basic write access with permissive rules
- **Part C:** Binary isolation - test each path separately
- **Part D:** Check App Check status

---

## Part A: Verify Firebase Project Matching

### Step 1: Check Browser Console

1. Open your site in browser (login page)
2. Open browser DevTools Console
3. Look for these logs:

```
📋 PROJECT VERIFICATION:
  - projectId: apes-365b0
  - appId: 1:827150303070:web:6837682b7748deb88199cf
  - apiKey (last 6 chars): 9JFDww
```

### Step 2: Verify in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **apes-365b0**
3. Go to **Firestore Database** → **Rules** tab
4. Verify you are editing rules for the **same projectId** shown in browser console

**Expected:** Console projectId matches Firebase Console project

**If mismatch:** You are editing rules for the wrong project!

---

## Part B: Ping Test (Permissive Rules)

### Step 1: Deploy Permissive Rules

```bash
cp firestore.rules.PART_B_PING_TEST firestore.rules
firebase deploy --only firestore:rules
```

Wait 1-2 minutes for propagation.

### Step 2: Sign In

1. Go to `/login/`
2. Sign in with any account

### Step 3: Run Ping Test

In browser console, run:

```javascript
window.debugFirestore.ping()
```

### Step 4: Interpret Results

**✅ SUCCESS:**
```
✅ Write to meta/ping succeeded
✅ Read from meta/ping succeeded
```
→ Rules deployment is working, basic write access works

**❌ FAILURE (permission-denied):**
```
❌ Ping test FAILED
   Error code: permission-denied
```
→ **This means one of:**
1. Rules are NOT deployed (wrong project, wrong deploy command)
2. App Check is blocking writes (if enforcement is ON)
3. Client is pointing to different project

**Action:** Check Firebase Console → Firestore → Rules to verify deployment

---

## Part C: Binary Isolation Tests

These tests isolate which specific path is failing.

### Test C.1: Usernames Create Only

#### Step 1: Deploy Test Rules

```bash
cp firestore.rules.PART_C_TEST_A firestore.rules
firebase deploy --only firestore:rules
```

Wait 1-2 minutes.

#### Step 2: Run Test

In browser console (while signed in):

```javascript
window.debugFirestore.testUsernames()
```

#### Step 3: Interpret Results

**✅ SUCCESS:**
```
✅ usernames/{username} create succeeded
```
→ Rules allow usernames create (this path is OK)

**❌ FAILURE:**
```
❌ usernames/{username} create FAILED
   Error code: permission-denied
```
→ Rules are blocking usernames create OR App Check is blocking

### Test C.2: Users Create Only

#### Step 1: Deploy Test Rules

```bash
cp firestore.rules.PART_C_TEST_B firestore.rules
firebase deploy --only firestore:rules
```

Wait 1-2 minutes.

#### Step 2: Run Test

In browser console (while signed in):

```javascript
window.debugFirestore.testUsers()
```

#### Step 3: Interpret Results

**✅ SUCCESS:**
```
✅ users/{uid} create succeeded
```
→ Rules allow users create (this path is OK)

**❌ FAILURE:**
```
❌ users/{uid} create FAILED
   Error code: permission-denied
```
→ Rules are blocking users create OR App Check is blocking

---

## Part D: App Check Status

### Check Browser Console

Look for these logs on page load:

```
🔍 PART D: App Check Status
═══════════════════════════════════════════════════════
✅ App Check: INITIALIZED
```

OR

```
⚠️  App Check: NOT INITIALIZED
   If App Check enforcement is ON in Firebase Console, Firestore writes will return 403
```

### Check Firebase Console

1. Go to Firebase Console → **App Check**
2. Check **Firestore** enforcement status

**If enforcement is ON but client shows "NOT INITIALIZED":**
→ **This is the problem!** App Check is blocking all writes

**Solution:**
- Either initialize App Check properly in `firebase.js`
- OR turn off App Check enforcement for Firestore (temporary, for debugging)

---

## Complete Test Sequence

Run tests in this order:

### 1. Part A: Verify Project
- [ ] Check browser console for projectId
- [ ] Verify Firebase Console shows same projectId
- **Outcome:** Confirms client/project matching

### 2. Part D: Check App Check
- [ ] Check browser console for App Check status
- [ ] Check Firebase Console → App Check → Firestore enforcement
- **Outcome:** Identifies if App Check is blocking

### 3. Part B: Ping Test
- [ ] Deploy `firestore.rules.PART_B_PING_TEST`
- [ ] Sign in
- [ ] Run `window.debugFirestore.ping()`
- **Outcome:** Confirms basic write access works

### 4. Part C.1: Test Usernames
- [ ] Deploy `firestore.rules.PART_C_TEST_A`
- [ ] Run `window.debugFirestore.testUsernames()`
- **Outcome:** Identifies if usernames path is blocked

### 5. Part C.2: Test Users
- [ ] Deploy `firestore.rules.PART_C_TEST_B`
- [ ] Run `window.debugFirestore.testUsers()`
- **Outcome:** Identifies if users path is blocked

---

## Common Outcomes & Solutions

### Outcome 1: Part B fails with permission-denied

**Meaning:** Rules deployment not working OR App Check blocking

**Solutions:**
1. Verify `firebase deploy --only firestore:rules` succeeds
2. Check Firebase Console → Firestore → Rules (verify deployment)
3. Check App Check enforcement (Part D)
4. Verify projectId matches (Part A)

### Outcome 2: Part C.1 fails, Part C.2 succeeds

**Meaning:** Rules are blocking `usernames/{username}` create specifically

**Solution:** Focus on `usernames/{username}` create rule

### Outcome 3: Part C.1 succeeds, Part C.2 fails

**Meaning:** Rules are blocking `users/{uid}` create specifically

**Solution:** Focus on `users/{uid}` create rule

### Outcome 4: Both Part C tests fail

**Meaning:** App Check is likely blocking OR rules deployment issue

**Solutions:**
1. Check App Check status (Part D)
2. Verify rules deployment (check Firebase Console)
3. Check project matching (Part A)

### Outcome 5: Part B succeeds but signup transaction fails

**Meaning:** Transaction-specific issue OR field validation failing

**Solution:** Check transaction code and field names match rules exactly

---

## After Diagnosis

Once you've identified the issue:

1. **If App Check:** Initialize App Check properly or disable enforcement
2. **If wrong project:** Use correct project or update client config
3. **If rules not deployed:** Deploy rules correctly
4. **If specific path blocked:** Fix that specific rule

Then restore final rules:

```bash
# After fixing the issue, deploy final rules
cp firestore.rules firestore.rules.backup  # Backup current
# Edit firestore.rules with correct rules
firebase deploy --only firestore:rules
```

---

## Important Notes

- **Wait 1-2 minutes** after each `firebase deploy --only firestore:rules` for propagation
- **Sign in** before running ping/test functions
- **Clean up** test documents if tests succeed (or ignore if rules deny delete)
- **Revert** to final rules after debugging

