# Default Community Creation Script

## Overview

This script creates the default "Apes Together Strong" community with 4 channels (General, Raid, Trading, Support) and sets the owner (apelover69) as the creator.

## Prerequisites

1. Install dependencies:
   ```bash
   npm install firebase-admin
   ```

2. Set up Firebase Admin credentials:
   - Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to your service account key file path
   - Or place service account JSON in the project root

## Usage

```bash
node scripts/create-default-community.js
```

## What It Does

1. Finds the owner user (username: 'apelover69') and gets their userId
2. Creates the default community document with ID 'default'
3. Adds the owner as a member with 'owner' role
4. Creates 4 channels: General, Raid, Trading, Support

## Safety

- Idempotent: Safe to run multiple times
- Checks if community/channels already exist before creating
- Won't overwrite existing data

## Notes

- The default community ID is hardcoded as 'default'
- Owner must exist in the users collection with username 'apelover69'
- Script will fail if owner user is not found
