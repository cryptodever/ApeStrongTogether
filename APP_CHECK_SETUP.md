# Firebase App Check Setup Guide

## Overview

This guide explains how to set up Firebase App Check with reCAPTCHA v3 for web apps with strict CSP (Content Security Policy).

## Implementation Status

✅ **Code is implemented** in `js/firebase.js`
- Uses ES modules only (CSP-safe)
- Dynamically loads reCAPTCHA script
- Initializes App Check before Firestore usage
- No inline scripts required

## Setup Steps

### Step 1: Get reCAPTCHA v3 Site Key

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click **"+ Create"** to create a new site
3. Configure:
   - **Label:** "Apes Together Strong Web" (or any label)
   - **reCAPTCHA type:** Select **reCAPTCHA v3**
   - **Domains:** Add your domains:
     - `apetogetherstronger.com`
     - `*.github.io` (for GitHub Pages hosting)
     - `localhost` (for local development)
4. Accept reCAPTCHA Terms of Service
5. Click **Submit**
6. Copy the **Site Key** (starts with something like `6Le...`)

### Step 2: Update Firebase Code

1. Open `js/firebase.js`
2. Find the line:
   ```javascript
   const RECAPTCHA_SITE_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY_HERE';
   ```
3. Replace `YOUR_RECAPTCHA_V3_SITE_KEY_HERE` with your actual site key:
   ```javascript
   const RECAPTCHA_SITE_KEY = '6Le...your-actual-site-key';
   ```

### Step 3: Verify CSP (Already Configured)

The CSP is already configured to allow reCAPTCHA. Check your HTML files have:

```html
<meta http-equiv="Content-Security-Policy" content="
  script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net ...;
  connect-src ... https://www.google.com/recaptcha/ ...;
  frame-src https://www.google.com https://www.recaptcha.net ...;
">
```

**Current CSP already includes:**
- ✅ `script-src`: `https://www.google.com` and `https://www.recaptcha.net`
- ✅ `frame-src`: `https://www.google.com` and `https://www.recaptcha.net`
- ✅ `connect-src`: Includes Google domains (needed for token requests)

**No CSP changes needed!**

### Step 4: Remove Static reCAPTCHA Script Tags (Optional)

The code dynamically loads the reCAPTCHA script, so you can remove static `<script>` tags from HTML files:

**Before:**
```html
<script src="https://www.google.com/recaptcha/api.js?render=YOUR_RECAPTCHA_SITE_KEY" async defer></script>
```

**After:**
```html
<!-- reCAPTCHA is loaded dynamically by firebase.js -->
```

However, keeping them is fine too - the code checks for existing scripts.

### Step 5: Enable App Check in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **apes-365b0**
3. Go to **Build** → **App Check**
4. Click **Get started** (if first time)
5. Register your web app:
   - Click **Apps** tab
   - Find your web app (or register new one)
   - Click **Manage** or **Register**
6. Choose provider: **reCAPTCHA v3**
7. Enter your **reCAPTCHA site key** (same as Step 1)
8. Click **Save**
9. Go to **APIs** tab
10. Enable enforcement for:
    - ✅ **Cloud Firestore** (recommended)
    - ✅ **Cloud Storage** (recommended)
    - Optionally: Realtime Database, Cloud Functions, etc.

**Important:** Start with **unenforced** mode first to test, then enable enforcement after verifying it works.

## Module Loading Order

The initialization order in `firebase.js` is correct:

1. ✅ Firebase app initialized
2. ✅ Firebase Auth initialized
3. ✅ **App Check initialized** (before Firestore)
4. ✅ Firestore initialized (after App Check)
5. ✅ Storage initialized

This ensures App Check tokens are available when Firestore operations occur.

## Verification

### Check Browser Console

After setup, check browser console for:

**Success:**
```
✅ App Check initialized with reCAPTCHA v3
✅ App Check status: INITIALIZED
```

**Failure (not configured):**
```
⚠️  App Check not configured: RECAPTCHA_SITE_KEY not set
⚠️  App Check status: NOT INITIALIZED
```

**Failure (script load error):**
```
❌ App Check initialization failed: reCAPTCHA script not loaded
   Check CSP: script-src must allow https://www.google.com/recaptcha/
```

### Test Firestore Writes

1. Sign in to your app
2. Try a Firestore write operation (e.g., signup)
3. If App Check is working:
   - ✅ Writes succeed
   - ✅ Console shows no 403 errors
4. If App Check is blocking:
   - ❌ Writes fail with 403
   - ❌ Console shows "App Check token validation failed"

## Troubleshooting

### "App Check status: NOT INITIALIZED"

**Causes:**
1. Site key not set (still `YOUR_RECAPTCHA_V3_SITE_KEY_HERE`)
2. reCAPTCHA script failed to load (CSP blocking)
3. On localhost (intentionally skipped)

**Solutions:**
1. Verify `RECAPTCHA_SITE_KEY` is set correctly in `firebase.js`
2. Check browser console for CSP errors
3. Verify CSP allows `https://www.google.com/recaptcha/`
4. For localhost, App Check is skipped (normal behavior)

### "Failed to load reCAPTCHA script"

**Causes:**
- CSP blocking script load
- Network error
- Invalid site key

**Solutions:**
1. Check CSP meta tag includes `https://www.google.com` in `script-src`
2. Check browser console for CSP violation errors
3. Verify site key is correct

### "403 PERMISSION_DENIED" on Firestore writes

**Causes:**
1. App Check enforcement enabled but App Check not initialized
2. Invalid reCAPTCHA site key
3. Domain not registered in reCAPTCHA console

**Solutions:**
1. Check App Check initialization status in console
2. Verify site key matches reCAPTCHA console
3. Verify domain is registered in reCAPTCHA console
4. Temporarily disable App Check enforcement to test

## Code Location

**File:** `js/firebase.js`

**Key functions:**
- `initializeAppCheck()` - Main initialization function
- `loadRecaptchaScript(siteKey)` - Dynamically loads reCAPTCHA script

**Configuration:**
- `RECAPTCHA_SITE_KEY` constant (line ~97) - Set your site key here

## Notes

- App Check is **skipped on localhost** for development convenience
- Uses **ES modules only** - no inline scripts, CSP-safe
- Initializes **before Firestore** to ensure tokens are available
- **No CSP relaxation needed** - uses existing allowances

