# X Account Verification Setup Guide

## Overview
The X account verification system is now implemented. Users can verify their X (Twitter) account ownership by adding a verification code to their X bio.

## What's Been Implemented

✅ **Frontend UI**
- Verification status indicator
- Verification code display with copy button
- Verify button
- Instructions for users

✅ **Backend Function**
- Firebase Cloud Function: `verifyXAccount`
- Handles X API calls
- Error handling and rate limiting

✅ **Firestore Integration**
- Saves verification status
- Tracks verification attempts
- Stores verification codes

## Next Steps: Set Up X API Access

### 1. Sign Up for X Developer Account
1. Go to https://developer.twitter.com
2. Sign up for a developer account
3. Create a new project
4. Create a new app within the project

### 2. Get API Credentials
You'll need:
- **Bearer Token** (for OAuth 2.0 authentication)

### 3. Configure Firebase Functions
Set the Bearer Token in Firebase Functions config:

```bash
firebase functions:config:set x.api_bearer_token="YOUR_BEARER_TOKEN_HERE"
```

### 4. Deploy the Function
```bash
cd functions
npm install  # Install axios dependency
cd ..
firebase deploy --only functions:verifyXAccount
```

## Important Notes

⚠️ **X API Pricing:**
- Free tier is very limited
- Reading public profiles may require **Basic tier ($100/month)** or higher
- Check X API documentation for current pricing: https://developer.twitter.com/en/docs/twitter-api

⚠️ **Alternative if API is too expensive:**
- Manual verification by admins
- Or implement a different verification method

## Testing

Once deployed, users can:
1. Enter their X username in the profile
2. See their unique verification code
3. Add the code to their X bio
4. Click "Verify X Account"
5. System checks if code exists in bio
6. Account is marked as verified if code is found

## Troubleshooting

**Function not found:**
- Make sure you've deployed: `firebase deploy --only functions:verifyXAccount`

**API authentication failed:**
- Check that Bearer Token is set correctly
- Verify token is valid and has proper permissions

**Rate limit errors:**
- X API has rate limits based on your plan
- Consider implementing caching or request queuing

**User not found:**
- Verify the X username is correct
- Check that the account exists and is public

