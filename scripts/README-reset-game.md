# Game Progress Reset Script

This script performs a hard reset of all player game progress in Firestore.

## What It Does

- Resets `gameGold` to 0 for all users
- Resets `gameUpgrades` to default values:
  - `weaponDamage: 1`
  - `weaponFireRate: 1`
  - `apeHealth: 1`

## Prerequisites

1. Install Firebase Admin SDK:
   ```bash
   npm install firebase-admin
   ```

2. Set up Firebase Admin credentials:
   - Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to your service account key file path
   - Or provide credentials in another supported way

## Usage

### Dry Run (Safe - No Changes)
```bash
node scripts/reset-game-progress.js --dry-run
```

This will show what would be reset without actually making changes.

### Verbose Dry Run
```bash
node scripts/reset-game-progress.js --dry-run --verbose
```

Shows detailed information about each user's current and reset values.

### Execute Reset (DANGEROUS!)
```bash
node scripts/reset-game-progress.js --execute
```

**WARNING:** This will permanently delete all game progress for all users. This cannot be undone!

## Safety Features

- Default mode is dry-run (safe)
- Requires explicit `--execute` flag to make changes
- Logs all operations before execution
- Only resets users who have game data

## Example Output

```
🔍 DRY-RUN MODE: No data will be reset
   Run with --execute to perform actual reset

Starting game progress reset...

Found 150 users in database

  [DRY-RUN] Would reset game data for user: abc123
  [DRY-RUN] Would reset game data for user: def456
  ...

==================================================
Reset Summary:
  Total users: 150
  Users with game data reset: 45
  Errors: 0
==================================================

⚠️  This was a dry-run. No data was actually changed.
   Run with --execute to perform the actual reset.
```
