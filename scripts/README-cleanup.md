# Orphaned Username Cleanup

## Overview

This cleanup removes orphaned `usernames/{username}` documents that have no corresponding `users/{uid}` document. These can occur from failed signups before the atomic transaction fix.

## Option 1: Standalone Node.js Script (Recommended for One-Time Use)

### Setup

1. **Install dependencies:**
   ```bash
   npm install firebase-admin
   ```

2. **Set up Firebase Admin credentials:**
   - Download service account key from Firebase Console
   - Go to: Project Settings → Service Accounts → Generate New Private Key
   - Save the JSON file securely

3. **Set environment variable:**
   ```bash
   # Linux/Mac
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   
   # Windows PowerShell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account-key.json"
   
   # Windows CMD
   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json
   ```

### Usage

**Step 1: Dry Run (see what would be deleted)**
```bash
node scripts/cleanup-orphaned-usernames.js --dry-run
```

**Step 2: Execute (actually delete)**
```bash
node scripts/cleanup-orphaned-usernames.js --execute
```

**Verbose mode (see all checks)**
```bash
node scripts/cleanup-orphaned-usernames.js --dry-run --verbose
```

### Safety Features

- ✅ **Dry-run by default** - Nothing deleted unless `--execute` is provided
- ✅ **Detailed logging** - Shows exactly what will be deleted
- ✅ **Error handling** - Continues even if individual checks fail
- ✅ **Summary report** - Shows total checked, orphaned found, deleted count

---

## Option 2: Cloud Function (Alternative)

If you prefer to run this as a Cloud Function:

### Setup

1. **Deploy the function:**
   ```bash
   cd functions
   firebase deploy --only functions:cleanupOrphanedUsernames
   ```

2. **Run dry-run via HTTP:**
   ```bash
   curl -X POST "https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/cleanupOrphanedUsernames?dryRun=true"
   ```

3. **Execute cleanup:**
   ```bash
   curl -X POST "https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/cleanupOrphanedUsernames?execute=true"
   ```

### Cloud Function Features

- Can be called via HTTP
- Returns JSON response with results
- Supports dry-run mode via query parameter
- Can be invoked from Firebase Console

---

## What the Script Does

1. **Fetches all `usernames/*` documents**
2. **For each username doc:**
   - Extracts the `uid` field
   - Checks if `users/{uid}` document exists
   - If missing → marks as orphaned
3. **Deletes orphaned documents** (if not dry-run)
4. **Reports summary** of what was found and deleted

## Example Output

```
🔍 DRY-RUN MODE: No documents will be deleted
   Run with --execute to perform actual deletions

📋 Starting orphaned username cleanup...

📖 Fetching all username documents...
   Found 10 username document(s)

🚨 ORPHANED: usernames/testuser123 (users/abc123xyz does not exist)
  🗑️  WOULD DELETE: usernames/testuser123

🚨 ORPHANED: usernames/deleted_user (users/xyz789abc does not exist)
  🗑️  WOULD DELETE: usernames/deleted_user

==================================================
📊 CLEANUP SUMMARY
==================================================
Total checked:        10
Orphaned found:       2
Successfully deleted: 0
Errors:               0
Unknown (check failed): 0

💡 Run with --execute to delete orphaned documents
```

## Important Notes

⚠️ **Before Running:**
- Test on a development/staging project first if possible
- Consider exporting your Firestore data as backup
- Review dry-run output carefully before executing

✅ **After Running:**
- Verify the summary matches your expectations
- Check Firestore Console to confirm orphaned docs are gone
- Monitor signups to ensure no new orphaned usernames appear

## Troubleshooting

**"Failed to initialize Firebase Admin"**
- Verify `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set
- Check that the service account key file path is correct
- Ensure the JSON file is valid

**"Permission denied"**
- Verify service account has Firestore read/write permissions
- Check that you're using the correct Firebase project's service account key

**No orphaned usernames found but you know some exist**
- Verify the UID values in username documents are correct
- Check if user documents exist under different UIDs
- Run with `--verbose` to see all checks
