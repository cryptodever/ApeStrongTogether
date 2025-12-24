# Quick Debugging Guide

## Immediate Steps

1. **Open your site in browser** (login page)
2. **Open browser DevTools Console** (F12)
3. **Run comprehensive diagnostics:**

```javascript
window.debugFirestore.all()
```

This will run all checks and show exactly what's failing.

## What to Look For

### ✅ If Everything Works
You'll see:
- ✅ Project matches
- ✅ App Check initialized (or warning if not configured)
- ✅ Firestore read access works
- ✅ meta/rules read succeeded
- ✅ Basic write succeeded

### ❌ If Something Fails

**Part B shows "App Check: NOT INITIALIZED"**
- **If App Check enforcement is ON** → This is why writes fail
- **Solution:** Either initialize App Check properly OR disable enforcement in Firebase Console

**Part C or E shows "permission-denied"**
- **This means Firestore rules are blocking access**
- **Solution:** Check which path is failing and verify rules are deployed

**Part D shows "permission-denied"**
- **meta/rules read is blocked**
- **Solution:** Check rules allow: `match /meta/{docId} { allow read: if docId == "rules"; }`

## Individual Tests

### Test Basic Write/Read
```javascript
window.debugFirestore.ping()
```

### Test Usernames Create (if rules allow)
```javascript
window.debugFirestore.testUsernames()
```

### Test Users Create (if rules allow)
```javascript
window.debugFirestore.testUsers()
```

## Most Common Issues

### 1. App Check Enforcement ON but Not Initialized
**Symptom:** All writes return 403, App Check status shows "NOT INITIALIZED"

**Fix:**
- Option A: Set `RECAPTCHA_SITE_KEY` in `firebase.js` and configure App Check
- Option B: Temporarily disable App Check enforcement in Firebase Console → App Check → APIs → Firestore (set to "Unenforced")

### 2. Wrong Project
**Symptom:** Part A shows different projectId than Firebase Console

**Fix:** Update `firebaseConfig` in `firebase.js` to match correct project

### 3. Rules Not Deployed
**Symptom:** Part C/E shows permission-denied even with permissive rules

**Fix:** Run `firebase deploy --only firestore:rules` and wait 1-2 minutes

### 4. Rules Deployed to Wrong Project
**Symptom:** Part A project matches, but writes still fail

**Fix:** Verify you're deploying to correct project: `firebase use <project-id>`

## Next Steps After Diagnosis

1. **If App Check issue:** Follow `APP_CHECK_SETUP.md`
2. **If Rules issue:** Check `firestore.rules` and deploy
3. **If Project mismatch:** Update `firebase.js` config

Run `window.debugFirestore.all()` after each fix to verify.

