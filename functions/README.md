# Firebase Cloud Functions

## cleanupUserData

Automatically cleans up Firestore documents when a Firebase Auth user is deleted.

### What it does:

1. Triggers when a Firebase Auth user is deleted
2. Reads the user document from `users/{uid}` to get the username
3. Deletes the username reservation document from `usernames/{usernameLower}`
4. Deletes the user document from `users/{uid}`

This ensures that usernames are released and can be reused after account deletion.

### Deployment:

```bash
cd functions
npm install
firebase deploy --only functions:cleanupUserData
```

### Requirements:

- Firebase Admin SDK initialized
- Firestore database with collections:
  - `users/{uid}` - User documents with `username` and `usernameLower` fields
  - `usernames/{usernameLower}` - Username reservation documents

### Error Handling:

- Gracefully handles missing documents (no crashes)
- Logs errors for monitoring
- Attempts to clean up what it can even if one operation fails

