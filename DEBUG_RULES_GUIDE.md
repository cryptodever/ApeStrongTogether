# Firestore Rules Debugging Guide - Staged Testing

## Purpose

Use staged rule versions to isolate which validation clause is causing `PERMISSION_DENIED` on `/users/{uid}` create operations.

## Testing Process

### Step 1: Deploy Version A (Minimal)
```bash
# Copy the active rule from firestore.rules.DEBUG_STAGED (Version A is uncommented)
cp firestore.rules.DEBUG_STAGED firestore.rules
firebase deploy --only firestore:rules
```

**Test:** Attempt signup transaction

- ✅ **If PASSES:** Ownership/auth is working, proceed to Version B
- ❌ **If FAILS:** Auth state issue - check `request.auth != null` and `request.auth.uid == uid`

---

### Step 2: Deploy Version B (Add keys().hasOnly)
Edit `firestore.rules.DEBUG_STAGED`:
1. Comment out Version A `match /users/{uid}` block
2. Uncomment Version B `match /users/{uid}` block

```bash
cp firestore.rules.DEBUG_STAGED firestore.rules
firebase deploy --only firestore:rules
```

**Test:** Attempt signup transaction

- ✅ **If PASSES:** Key validation works, proceed to Version C
- ❌ **If FAILS:** Issue with `keys().hasOnly()` - check exact keys: `['username', 'email', 'avatarCount', 'createdAt']`
  - Verify client sends exactly these 4 keys
  - Check for extra/missing keys in transaction

---

### Step 3: Deploy Version C (Add username + email type checks)
Edit `firestore.rules.DEBUG_STAGED`:
1. Comment out Version B
2. Uncomment Version C

```bash
cp firestore.rules.DEBUG_STAGED firestore.rules
firebase deploy --only firestore:rules
```

**Test:** Attempt signup transaction

- ✅ **If PASSES:** Username/email validation works, proceed to Version D
- ❌ **If FAILS:** Issue with username or email validation
  - Check username matches regex: `^[a-z0-9_]{3,20}$`
  - Check username is lowercase string
  - Check email is string type

---

### Step 4: Deploy Version D (Add avatarCount constraint)
Edit `firestore.rules.DEBUG_STAGED`:
1. Comment out Version C
2. Uncomment Version D

```bash
cp firestore.rules.DEBUG_STAGED firestore.rules
firebase deploy --only firestore:rules
```

**Test:** Attempt signup transaction

- ✅ **If PASSES:** avatarCount validation works, proceed to Version E
- ❌ **If FAILS:** Issue with avatarCount validation
  - Check `avatarCount` is integer type (not float)
  - Check `avatarCount >= 0`
  - Verify client sends `avatarCount: 0` (not missing)

---

### Step 5: Deploy Version E (Add createdAt constraint)
Edit `firestore.rules.DEBUG_STAGED`:
1. Comment out Version D
2. Uncomment Version E

```bash
cp firestore.rules.DEBUG_STAGED firestore.rules
firebase deploy --only firestore:rules
```

**Test:** Attempt signup transaction

- ✅ **If PASSES:** All validations work - use FINAL version
- ❌ **If FAILS:** Issue with createdAt validation
  - Most likely culprit: `serverTimestamp()` sentinel not passing `is timestamp` check
  - Check if `isValidCreatedAt()` helper handles sentinels correctly
  - Verify `createdAt` is in `request.resource.data` during transaction

---

## Expected Failure Point

**Most likely to fail: Version E (createdAt constraint)**

**Reason:** `serverTimestamp()` sentinels may not always pass `is timestamp` check in all Firestore SDK versions or transaction contexts. The `isValidCreatedAt()` helper should handle this, but if it fails:

**Diagnosis:**
- Check if `createdAt` exists in `request.resource.data` during transaction
- Check if sentinel passes `is timestamp` check
- May need to adjust helper function or use transform-aware validation

---

## After Diagnosis

1. **Identify which version fails** (A, B, C, D, or E)
2. **Note the exact error** from Firestore console or browser console
3. **Deploy final strict version** using `firestore.rules.FINAL`:

```bash
cp firestore.rules.FINAL firestore.rules
firebase deploy --only firestore:rules
```

---

## Quick Reference: Staged Versions Summary

| Version | Validations Included | Likely to Fail? |
|---------|---------------------|-----------------|
| **A** | Ownership only | ❌ No - basic check |
| **B** | + keys().hasOnly | ⚠️ Maybe - if extra keys present |
| **C** | + username/email types + regex | ⚠️ Maybe - if format wrong |
| **D** | + avatarCount type + >= 0 | ⚠️ Maybe - if type wrong |
| **E** | + createdAt with helper | ✅ **Most likely** - serverTimestamp sentinel |

---

## Notes

- Wait 1-2 minutes after each deploy for rules to propagate
- Test signup immediately after deploy
- Check browser console for exact error codes
- Keep `/usernames/{username}` rules unchanged during testing (they should already work)

