# Community Chat Feature - Implementation Plan

## Overview

This document outlines the plan for implementing Discord-style community chat functionality within the Apes Together Strong platform. The feature allows users to create and join communities with their own chat channels, expanding beyond the current 4 public channels (General, Raid, Trading, Support).

---

## Current State Analysis

### ✅ Already Implemented

1. **Basic Chat Infrastructure**
   - Real-time messaging with Firestore
   - 4 public channels (General, Raid, Trading, Support)
   - Message reactions, editing, deletion
   - Typing indicators
   - Online presence tracking
   - User profiles and avatars
   - Message reporting
   - Profanity filtering
   - Rate limiting per channel

2. **Community Management (community-init.js)**
   - Create communities with name, description, privacy settings
   - Join communities via invite codes
   - Community discovery (public communities)
   - Community settings management (owner/admin only)
   - Member management (view, remove, promote)
   - Invite code generation and regeneration
   - Role-based permissions (owner, admin, member)

3. **UI Components**
   - Community creation modal
   - Community join modal
   - Community discovery modal
   - Community settings modal
   - Community members modal
   - Channel switcher UI (partial)
   - Mobile-responsive design

### ❌ Missing / Incomplete

1. **Community Chat Integration**
   - Messages not stored/retrieved for communities
   - No channel switching between communities and public channels
   - Community channels not displayed in channel switcher
   - No message routing based on `currentCommunityId`
   - `switchToCommunity()` function referenced but not implemented
   - `updateChannelSwitcher()` function referenced but incomplete

2. **Community-Specific Features**
   - Community members-only chat access
   - Community message storage structure
   - Community channel info display
   - Community-specific online users
   - Community typing indicators
   - Community presence tracking

3. **Advanced Features (Future)**
   - Multiple channels within communities
   - Channel categories
   - Channel permissions
   - Voice channels (Phase 3)
   - Channel-specific roles

---

## Goals & Requirements

### Primary Goals
1. Enable users to chat within their created/joined communities
2. Seamlessly switch between public channels and community chats
3. Maintain real-time messaging functionality for communities
4. Ensure proper access control (members only)
5. Display community-specific information and member lists

### Technical Requirements
1. Extend Firestore message structure to support communities
2. Update message queries to filter by community ID
3. Integrate community switching with existing chat UI
4. Maintain backward compatibility with public channels
5. Ensure proper security rules for community messages

---

## Database Structure

### Current Structure

**Messages Collection** (`messages`)
```
{
  id: string (auto-generated)
  userId: string
  username: string
  text: string
  channel: string ('general' | 'raid' | 'trading' | 'support')
  timestamp: Timestamp
  edited: boolean
  editedAt: Timestamp (optional)
  deleted: boolean
  reactions: { [emoji: string]: string[] } (array of user IDs)
}
```

**Communities Collection** (`communities`)
```
{
  id: string (auto-generated)
  name: string
  description: string
  creatorId: string
  createdAt: Timestamp
  isPublic: boolean
  inviteCode: string (8 chars, uppercase alphanumeric)
  memberCount: number
  settings: {
    allowInvites: boolean
    approvalRequired: boolean
  }
}
```

**Community Members Subcollection** (`communities/{communityId}/members`)
```
{
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: Timestamp
}
```

### Required Changes

**Messages Collection - Enhanced Structure**
```
{
  id: string (auto-generated)
  userId: string
  username: string
  text: string
  channel: string ('general' | 'raid' | 'trading' | 'support' | 'community')
  communityId: string | null (null for public channels)
  timestamp: Timestamp
  edited: boolean
  editedAt: Timestamp (optional)
  deleted: boolean
  reactions: { [emoji: string]: string[] }
}
```

**Alternative Approach: Separate Community Messages Collection**
```
communities/{communityId}/messages
{
  id: string (auto-generated)
  userId: string
  username: string
  text: string
  timestamp: Timestamp
  edited: boolean
  editedAt: Timestamp (optional)
  deleted: boolean
  reactions: { [emoji: string]: string[] }
}
```

**Recommendation:** Use separate subcollection (`communities/{communityId}/messages`) for better:
- Data isolation
- Security rules
- Scalability
- Query performance
- Easier community deletion

---

## Implementation Phases

### Phase 1: Core Community Chat Integration 🔴 (HIGH PRIORITY)

**Goal:** Enable basic community chat functionality

#### Tasks:
1. **Update Database Structure**
   - [ ] Create Firestore rules for `communities/{communityId}/messages`
   - [ ] Add indexes for community messages queries
   - [ ] Update Firestore indexes JSON

2. **Message Storage & Retrieval**
   - [ ] Update `sendMessage()` to store in community subcollection when in community
   - [ ] Update `loadMessages()` to query community messages
   - [ ] Update `setupRealtimeListeners()` for community messages
   - [ ] Handle message routing based on `currentCommunityId`

3. **Community Switching**
   - [ ] Implement `switchToCommunity(communityId)` function
   - [ ] Update `switchChannel()` to handle community switching
   - [ ] Update `updateChannelSwitcher()` to include user communities
   - [ ] Integrate with `communityModule.loadUserCommunities()`

4. **Channel Switcher UI**
   - [ ] Display user's communities in channel switcher
   - [ ] Add visual distinction between public channels and communities
   - [ ] Update mobile channel list in drawer
   - [ ] Add community context menu (settings, members, leave)

5. **Access Control**
   - [ ] Verify membership before loading community messages
   - [ ] Prevent non-members from sending messages
   - [ ] Update Firestore security rules

6. **Channel Info Display**
   - [ ] Show community name and description in channel info
   - [ ] Display community member count
   - [ ] Add community settings link (for owners/admins)
   - [ ] Add members list link

#### Estimated Time: 2-3 days

---

### Phase 2: Enhanced Community Features 🟡 (MEDIUM PRIORITY)

**Goal:** Improve community chat experience and management

#### Tasks:
1. **Community-Specific Features**
   - [ ] Community-only online users list
   - [ ] Community-specific typing indicators
   - [ ] Community presence tracking
   - [ ] Community message search

2. **Community Management Integration**
   - [ ] "Leave Community" functionality
   - [ ] Community context menu in channel switcher
   - [ ] Quick access to community settings
   - [ ] Quick access to members list
   - [ ] Community notification preferences

3. **UI/UX Improvements**
   - [ ] Community badges/icons in channel list
   - [ ] Community member count in channel switcher
   - [ ] Active community indicator
   - [ ] Community creation shortcut in channel switcher
   - [ ] Better visual hierarchy (public vs community channels)

4. **Invite Flow**
   - [ ] Auto-join via invite code in URL (`/chat?invite=CODE`)
   - [ ] Invite code validation
   - [ ] Invite acceptance flow

#### Estimated Time: 2-3 days

---

### Phase 3: Multiple Channels Per Community 🟢 (FUTURE)

**Goal:** Enable multiple channels within communities (Discord-style)

#### Tasks:
1. **Database Structure**
   - [ ] Add `channels` subcollection to communities
   - [ ] Channel structure: `{ name, description, type, order, permissions }`
   - [ ] Update message structure to include `channelId`

2. **Channel Management**
   - [ ] Create channel UI (owner/admin only)
   - [ ] Edit channel settings
   - [ ] Delete channel
   - [ ] Reorder channels

3. **Channel Switching**
   - [ ] Channel list within community
   - [ ] Switch between community channels
   - [ ] Channel-specific message loading

4. **Channel Permissions**
   - [ ] Role-based channel access
   - [ ] Channel-specific permissions
   - [ ] Member-only channels

#### Estimated Time: 5-7 days

---

## Technical Implementation Details

### 1. Message Storage Strategy

**Option A: Separate Subcollection (RECOMMENDED)**
```javascript
// Store in: communities/{communityId}/messages
const messagesRef = collection(db, 'communities', communityId, 'messages');
```

**Option B: Single Collection with Filter**
```javascript
// Store in: messages with communityId field
const messagesRef = query(
  collection(db, 'messages'),
  where('communityId', '==', communityId)
);
```

**Decision:** Use Option A for better data isolation and security.

### 2. Community Switching Logic

```javascript
async function switchToCommunity(communityId) {
  // 1. Verify membership
  const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
  const memberDoc = await getDoc(memberRef);
  
  if (!memberDoc.exists()) {
    alert('You must be a member to access this community');
    return;
  }
  
  // 2. Update state
  currentCommunityId = communityId;
  currentChannel = 'community'; // Or use community's default channel
  localStorage.setItem('selectedCommunity', communityId);
  localStorage.setItem('selectedChannel', 'community');
  
  // 3. Cleanup old listeners
  cleanupChat();
  
  // 4. Initialize community chat
  initializeChat();
  
  // 5. Update UI
  updateChannelSwitcher();
  updateChannelInfo();
}
```

### 3. Message Query Logic

```javascript
function getMessagesQuery() {
  if (currentCommunityId) {
    // Community messages
    const messagesRef = collection(db, 'communities', currentCommunityId, 'messages');
    return query(
      messagesRef,
      where('deleted', '==', false),
      orderBy('timestamp', 'desc'),
      limit(MESSAGES_PER_PAGE)
    );
  } else {
    // Public channel messages
    const messagesRef = collection(db, 'messages');
    return query(
      messagesRef,
      where('channel', '==', currentChannel),
      where('deleted', '==', false),
      orderBy('timestamp', 'desc'),
      limit(MESSAGES_PER_PAGE)
    );
  }
}
```

### 4. Channel Switcher Integration

```javascript
async function updateChannelSwitcher() {
  // Load user communities
  if (window.communityModule) {
    await window.communityModule.loadUserCommunities();
    userCommunities = window.communityModule.userCommunities;
  }
  
  // Render public channels
  AVAILABLE_CHANNELS.forEach(channel => { /* ... */ });
  
  // Render user communities
  userCommunities.forEach(community => {
    const isActive = currentCommunityId === community.id;
    // Render community button with indicator
  });
  
  // Add "Create Community" button
}
```

---

## Firestore Security Rules

### Required Rules Updates

```javascript
// Communities collection
match /communities/{communityId} {
  // Read: public communities OR if user is member
  allow read: if request.auth != null && (
    resource.data.isPublic == true ||
    exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid))
  );
  
  // Write: owner/admin only (handled in community-init.js)
  
  // Community messages subcollection
  match /messages/{messageId} {
    // Read: members only
    allow read: if request.auth != null &&
      exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid));
    
    // Create: members only
    allow create: if request.auth != null &&
      exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid)) &&
      request.resource.data.userId == request.auth.uid;
    
    // Update: message author only (with 5-minute edit limit)
    allow update: if request.auth != null &&
      request.resource.data.userId == request.auth.uid &&
      resource.data.timestamp.seconds > (request.time.seconds - 300);
    
    // Delete: message author OR community admin/owner
    allow delete: if request.auth != null && (
      resource.data.userId == request.auth.uid ||
      exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid)) &&
      get(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid)).data.role in ['owner', 'admin']
    );
  }
  
  // Community members subcollection
  match /members/{memberId} {
    // Existing rules...
  }
}
```

---

## Integration Points

### Files to Modify

1. **js/chat-init.js**
   - `loadMessages()` - Add community message loading
   - `sendMessage()` - Add community message storage
   - `setupRealtimeListeners()` - Add community listeners
   - `switchChannel()` - Handle community switching
   - `updateChannelSwitcher()` - Add communities to switcher
   - `setupChannelSwitcher()` - Update to include communities
   - Add `switchToCommunity()` function
   - Add `loadUserCommunities()` integration

2. **js/community-init.js**
   - `loadUserCommunities()` - Ensure proper loading
   - Export `userCommunities` getter
   - Ensure `switchToCommunity()` is callable from chat-init

3. **chat/index.html**
   - Channel switcher UI (may need updates)
   - Community context menu (if not exists)

4. **firestore.rules**
   - Add community messages rules
   - Update indexes

5. **firestore.indexes.json**
   - Add indexes for community messages queries

---

## Testing Strategy

### Unit Tests
- [ ] Message storage in community subcollection
- [ ] Message retrieval from community
- [ ] Community switching logic
- [ ] Access control verification
- [ ] Channel switcher rendering

### Integration Tests
- [ ] End-to-end message flow (create → store → retrieve)
- [ ] Community join → chat access
- [ ] Leave community → chat access revoked
- [ ] Multiple communities switching

### Manual Testing Scenarios
1. **Create Community → Chat**
   - Create community
   - Switch to community chat
   - Send message
   - Verify message appears
   - Verify other members see message

2. **Join Community → Chat**
   - Join community via invite code
   - Access community chat
   - Send/receive messages

3. **Access Control**
   - Try to access community chat without membership (should fail)
   - Leave community → verify chat access removed
   - Rejoin community → verify chat access restored

4. **Channel Switching**
   - Switch between public channels and communities
   - Verify correct messages load
   - Verify state persistence (localStorage)

5. **Real-time Updates**
   - Multiple users in same community
   - Verify real-time message updates
   - Verify typing indicators
   - Verify online presence

---

## UI/UX Considerations

### Channel Switcher Design

**Desktop:**
```
[GENERAL] [RAID] [TRADING] [SUPPORT] [+]
─────────────────────────────────────────
🦍 My Awesome Community (12)
🎮 Gaming Apes (45)
💰 Trading Pals (8)
```

**Mobile:**
- Drawer with sections:
  - "Public Channels"
  - "My Communities"
  - "Create Community" button

### Visual Indicators
- Community icon/emoji in channel name
- Member count badge
- Active community highlight
- Unread message indicators (future)

### Context Menu Actions
- "Community Settings" (owner/admin)
- "View Members"
- "Leave Community"
- "Copy Invite Link" (owner/admin)

---

## Performance Considerations

1. **Message Pagination**
   - Use same pagination strategy as public channels
   - Load 30 messages initially
   - Load older messages on scroll

2. **Listener Management**
   - Cleanup old listeners when switching communities
   - Use efficient queries (indexed fields)
   - Limit real-time listener subscriptions

3. **Caching**
   - Cache user communities list
   - Cache community metadata
   - Use localStorage for community preferences

4. **Scalability**
   - Separate subcollections prevent single collection bottlenecks
   - Indexed queries for performance
   - Consider message archiving for large communities

---

## Security Considerations

1. **Access Control**
   - Verify membership on every message operation
   - Firestore rules as primary security layer
   - Client-side checks for UX (not security)

2. **Rate Limiting**
   - Apply same rate limits to community messages
   - Consider community-specific rate limits (future)

3. **Content Moderation**
   - Existing profanity filter applies
   - Community admins can moderate (future)
   - Report functionality extends to communities

4. **Data Privacy**
   - Private communities not discoverable
   - Invite-only access
   - Member list privacy (future: opt-in public member lists)

---

## Future Enhancements (Post-Phase 3)

1. **Channel Categories**
   - Organize channels into categories
   - Collapsible categories

2. **Channel Permissions**
   - Role-based channel access
   - Read-only channels
   - Announcement channels

3. **Message Threading**
   - Threaded conversations
   - Reply to specific messages

4. **Pinned Messages**
   - Pin important messages
   - Community-level pinned messages

5. **Community Notifications**
   - Notification preferences per community
   - @mentions in communities
   - Community activity notifications

6. **Voice Channels** (Phase 3 of Roadmap)
   - Discord-style voice channels
   - Screen sharing
   - Video calls

---

## Success Metrics

1. **Functionality**
   - ✅ Users can create communities and chat
   - ✅ Messages stored and retrieved correctly
   - ✅ Real-time updates work
   - ✅ Access control enforced

2. **Performance**
   - Message load time < 500ms
   - Real-time updates < 100ms latency
   - Smooth channel switching

3. **User Experience**
   - Intuitive community discovery
   - Easy community creation
   - Clear visual distinction between channels and communities

---

## Next Steps

1. **Immediate Actions**
   - [ ] Review and approve this plan
   - [ ] Set up development branch
   - [ ] Create Firestore indexes
   - [ ] Update Firestore rules

2. **Phase 1 Implementation**
   - [ ] Start with database structure updates
   - [ ] Implement message storage/retrieval
   - [ ] Add community switching
   - [ ] Test thoroughly before moving to Phase 2

3. **Documentation**
   - [ ] Update code comments
   - [ ] Document API changes
   - [ ] Create user guide (if needed)

---

## Detailed Implementation Guide

### Step-by-Step Implementation Checklist

#### Step 1: Review Current Code Structure

**Current State:**
- `firestore.rules` already supports `communityId` field in messages collection (lines 117-123)
- Messages can be stored with `communityId` field OR in subcollection
- Current approach in rules: single messages collection with `communityId` filter
- Plan recommendation: separate subcollection for better isolation

**Decision Point:** 
- **Option A (Current Rules):** Use single `messages` collection with `communityId` field (already supported)
- **Option B (Recommended):** Use separate `communities/{communityId}/messages` subcollection (requires rule updates)

**Recommendation:** Start with Option A (current rules) for faster implementation, migrate to Option B later if needed.

---

#### Step 2: Update Chat Init Functions

**File: `js/chat-init.js`**

**2.1. Add Helper Functions**

```javascript
// Get messages collection reference based on context
function getMessagesCollection() {
  if (currentCommunityId) {
    // Community messages subcollection
    return collection(db, 'communities', currentCommunityId, 'messages');
  } else {
    // Public channel messages
    return collection(db, 'messages');
  }
}

// Build messages query
function buildMessagesQuery(messagesRef, limitCount = MESSAGES_PER_PAGE, startAfterDoc = null) {
  if (currentCommunityId) {
    // Community messages - query subcollection
    let q = query(
      messagesRef,
      where('deleted', '==', false),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }
    return q;
  } else {
    // Public channel messages
    let q = query(
      messagesRef,
      where('channel', '==', currentChannel),
      where('deleted', '==', false),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }
    return q;
  }
}

// Verify community membership
async function verifyCommunityMembership(communityId) {
  if (!currentUser) return false;
  try {
    const memberRef = doc(db, 'communities', communityId, 'members', currentUser.uid);
    const memberDoc = await getDoc(memberRef);
    return memberDoc.exists();
  } catch (error) {
    console.error('Error verifying membership:', error);
    return false;
  }
}
```

**2.2. Update `sendMessage()` Function**

```javascript
// Find the sendMessage function and update it
async function sendMessage() {
  // ... existing validation code ...
  
  // Check if in community and verify membership
  if (currentCommunityId) {
    const isMember = await verifyCommunityMembership(currentCommunityId);
    if (!isMember) {
      alert('You must be a member to send messages in this community');
      return;
    }
  }
  
  try {
    const messagesRef = getMessagesCollection();
    
    const messageData = {
      userId: currentUser.uid,
      username: userProfile.username,
      text: filteredText,
      timestamp: serverTimestamp(),
      edited: false,
      deleted: false,
      reactions: {},
      avatarCount: userProfile.avatarCount || 0
    };
    
    // Add channel field for public channels only
    if (!currentCommunityId) {
      messageData.channel = currentChannel;
    }
    // Note: For subcollection approach, communityId is implicit (path contains it)
    // For single collection approach, add: messageData.communityId = currentCommunityId || null;
    
    await addDoc(messagesRef, messageData);
    
    // ... rest of existing code (clear input, reset rate limit, etc.) ...
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Failed to send message. Please try again.');
  }
}
```

**2.3. Update `loadMessages()` Function**

```javascript
async function loadMessages() {
  if (!currentUser) return;
  
  // Verify membership if in community
  if (currentCommunityId) {
    const isMember = await verifyCommunityMembership(currentCommunityId);
    if (!isMember) {
      chatMessagesEl.innerHTML = '<div class="chat-error">You must be a member to view messages</div>';
      return;
    }
  }
  
  try {
    chatLoadingEl?.classList.remove('hide');
    chatEmptyEl?.classList.add('hide');
    
    const messagesRef = getMessagesCollection();
    const q = buildMessagesQuery(messagesRef);
    
    const snapshot = await getDocs(q);
    
    // ... existing message processing code ...
  } catch (error) {
    console.error('Error loading messages:', error);
    chatMessagesEl.innerHTML = '<div class="chat-error">Error loading messages</div>';
  } finally {
    chatLoadingEl?.classList.add('hide');
  }
}
```

**2.4. Update `setupRealtimeListeners()` Function**

```javascript
function setupRealtimeListeners() {
  // Cleanup old listeners
  if (messagesListener) {
    messagesListener();
    messagesListener = null;
  }
  
  // Verify membership if in community
  if (currentCommunityId) {
    verifyCommunityMembership(currentCommunityId).then(isMember => {
      if (!isMember) {
        console.warn('Not a member, skipping listener setup');
        return;
      }
      setupMessagesListener();
    });
  } else {
    setupMessagesListener();
  }
  
  function setupMessagesListener() {
    const messagesRef = getMessagesCollection();
    const q = buildMessagesQuery(messagesRef);
    
    messagesListener = onSnapshot(q, (snapshot) => {
      // ... existing real-time update code ...
    }, (error) => {
      console.error('Error in messages listener:', error);
    });
  }
  
  // ... existing typing and presence listeners (update for communities) ...
}
```

**2.5. Implement `switchToCommunity()` Function**

```javascript
// Switch to a community chat
async function switchToCommunity(communityId) {
  if (!currentUser) {
    alert('You must be logged in to access communities');
    return;
  }
  
  // Verify membership
  const isMember = await verifyCommunityMembership(communityId);
  if (!isMember) {
    alert('You must be a member to access this community');
    // Optionally open join modal
    if (window.communityModule?.openCommunityJoinModal) {
      window.communityModule.openCommunityJoinModal();
    }
    return;
  }
  
  try {
    // Update state
    currentCommunityId = communityId;
    currentChannel = 'community'; // Special channel type for communities
    localStorage.setItem('selectedCommunity', communityId);
    localStorage.setItem('selectedChannel', 'community');
    
    // Cleanup old listeners
    cleanupChat();
    
    // Clear messages
    if (chatMessagesEl) {
      chatMessagesEl.innerHTML = '';
    }
    
    // Reset pagination
    loadedMessageIds.clear();
    oldestMessageDoc = null;
    hasMoreMessages = true;
    
    // Reload messages for community
    await loadMessages();
    
    // Setup real-time listeners
    setupRealtimeListeners();
    
    // Update UI
    updateChannelSwitcher();
    updateChannelInfo();
    updateMobileChannelName();
    
    // Close mobile drawer if open
    if (window.closeMobileDrawer) {
      window.closeMobileDrawer();
    }
  } catch (error) {
    console.error('Error switching to community:', error);
    alert('Failed to switch to community');
  }
}

// Export for use by community-init.js
window.switchToCommunity = switchToCommunity;
```

**2.6. Update `switchChannel()` Function**

```javascript
function switchChannel(channelId) {
  // If switching to a public channel, clear community
  if (AVAILABLE_CHANNELS.find(c => c.id === channelId)) {
    currentCommunityId = null;
    localStorage.removeItem('selectedCommunity');
    currentChannel = channelId;
    localStorage.setItem('selectedChannel', channelId);
    
    // Cleanup and reload
    cleanupChat();
    loadMessages();
    setupRealtimeListeners();
    updateChannelSwitcher();
    updateChannelInfo();
    updateMobileChannelName();
    return;
  }
  
  // If it's a community ID, switch to community
  if (channelId && channelId.startsWith('community-')) {
    const communityId = channelId.replace('community-', '');
    switchToCommunity(communityId);
    return;
  }
  
  // Existing channel switching logic...
}
```

**2.7. Update `updateChannelSwitcher()` Function**

```javascript
async function updateChannelSwitcher() {
  // Load user communities
  if (window.communityModule) {
    await window.communityModule.loadUserCommunities();
    userCommunities = window.communityModule.userCommunities || [];
  }
  
  const channelButtonsEl = document.getElementById('channelButtons');
  const channelButtonsMobileEl = document.getElementById('channelButtonsMobile');
  const mobileChannelsEl = document.getElementById('chatMobileChannels');
  
  if (!channelButtonsEl || !channelButtonsMobileEl) return;
  
  // Clear existing buttons
  channelButtonsEl.innerHTML = '';
  channelButtonsMobileEl.innerHTML = '';
  
  // Render public channels
  AVAILABLE_CHANNELS.forEach(channel => {
    const isActive = !currentCommunityId && currentChannel === channel.id;
    
    // Desktop
    const button = document.createElement('button');
    button.className = `channel-btn ${isActive ? 'active' : ''}`;
    button.setAttribute('data-channel', channel.id);
    button.innerHTML = `<span>${channel.emoji}</span> ${channel.name}`;
    button.addEventListener('click', () => switchChannel(channel.id));
    channelButtonsEl.appendChild(button);
    
    // Mobile
    const mobileButton = button.cloneNode(true);
    channelButtonsMobileEl.appendChild(mobileButton);
  });
  
  // Render user communities
  if (userCommunities.length > 0) {
    // Add separator
    const separator = document.createElement('div');
    separator.className = 'channel-separator';
    separator.textContent = 'My Communities';
    channelButtonsEl.appendChild(separator);
    
    userCommunities.forEach(community => {
      const isActive = currentCommunityId === community.id;
      
      // Desktop
      const button = document.createElement('button');
      button.className = `channel-btn community-btn ${isActive ? 'active' : ''}`;
      button.setAttribute('data-community', community.id);
      button.innerHTML = `<span>🦍</span> ${escapeHtml(community.name)} <span class="member-count">(${community.memberCount || 0})</span>`;
      button.addEventListener('click', () => switchToCommunity(community.id));
      channelButtonsEl.appendChild(button);
      
      // Mobile drawer
      const item = document.createElement('div');
      item.className = `chat-mobile-channel-item ${isActive ? 'active' : ''}`;
      item.setAttribute('data-community', community.id);
      item.innerHTML = `
        <span class="channel-emoji">🦍</span>
        <span class="channel-name">${escapeHtml(community.name)}</span>
        <span class="channel-member-count">${community.memberCount || 0}</span>
      `;
      item.addEventListener('click', () => {
        switchToCommunity(community.id);
        closeMobileDrawer();
      });
      if (mobileChannelsEl) {
        mobileChannelsEl.appendChild(item);
      }
    });
  }
  
  // Add "Create Community" button (existing code)
  // ...
}
```

**2.8. Update `updateChannelInfo()` Function**

```javascript
async function updateChannelInfo() {
  if (currentCommunityId) {
    // Load community info
    try {
      const communityDoc = await getDoc(doc(db, 'communities', currentCommunityId));
      if (communityDoc.exists()) {
        const communityData = communityDoc.data();
        
        if (currentChannelNameEl) {
          currentChannelNameEl.textContent = communityData.name || 'Community';
        }
        if (currentChannelDescEl) {
          currentChannelDescEl.textContent = communityData.description || 'Community chat';
        }
        
        // Mobile
        const mobileChannelNameEl = document.getElementById('currentChannelNameMobile');
        const mobileChannelDescEl = document.getElementById('currentChannelDescMobile');
        if (mobileChannelNameEl) {
          mobileChannelNameEl.textContent = communityData.name || 'Community';
        }
        if (mobileChannelDescEl) {
          mobileChannelDescEl.textContent = communityData.description || 'Community chat';
        }
      }
    } catch (error) {
      console.error('Error loading community info:', error);
    }
  } else {
    // Existing public channel info code...
    const channel = AVAILABLE_CHANNELS.find(c => c.id === currentChannel);
    // ... existing code ...
  }
}
```

---

#### Step 3: Update Firestore Rules (If Using Subcollection Approach)

**File: `firestore.rules`**

If using Option B (subcollection), add rules:

```javascript
// Communities collection
match /communities/{communityId} {
  // ... existing rules ...
  
  // Community messages subcollection
  match /messages/{messageId} {
    // Read: members only
    allow read: if isSignedIn() &&
      exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid));
    
    // Create: members only
    allow create: if isSignedIn() &&
      exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid)) &&
      request.resource.data.userId == request.auth.uid &&
      request.resource.data.username is string &&
      request.resource.data.text is string &&
      request.resource.data.deleted == false;
    
    // Update: message author only (with 5-minute edit limit)
    allow update: if isSignedIn() &&
      resource.data.userId == request.auth.uid &&
      resource.data.timestamp.seconds > (request.time.seconds - 300);
    
    // Delete: message author OR community admin/owner (soft delete via update)
    allow update: if isSignedIn() && (
      resource.data.userId == request.auth.uid ||
      (exists(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/communities/$(communityId)/members/$(request.auth.uid)).data.role in ['owner', 'admin'])
    );
  }
}
```

**Note:** Current rules already support `communityId` in messages collection. Subcollection approach requires rule updates.

---

#### Step 4: Update Firestore Indexes (If Using Subcollection)

**File: `firestore.indexes.json`**

Add index for community messages:

```json
{
  "collectionGroup": "messages",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    {
      "fieldPath": "deleted",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "timestamp",
      "order": "DESCENDING"
    }
  ]
}
```

**Note:** Only needed if using subcollection approach. Current indexes support single collection with `communityId`.

---

#### Step 5: Integration Testing Checklist

- [ ] Create community → verify chat access
- [ ] Join community → verify chat access
- [ ] Send message in community → verify storage
- [ ] Receive real-time updates in community
- [ ] Switch between public channels and communities
- [ ] Verify membership check prevents non-member access
- [ ] Test message editing in communities
- [ ] Test message deletion in communities
- [ ] Test reactions in communities
- [ ] Verify typing indicators work in communities
- [ ] Verify online presence works in communities
- [ ] Test mobile drawer with communities
- [ ] Test channel switcher UI updates

---

## Notes & Decisions

- **Message Storage:** 
  - Current rules support single `messages` collection with `communityId` field
  - Plan recommends subcollection for better isolation, but can start with current approach
  - Decision: Start with Option A (single collection) for faster implementation, migrate if needed
  
- **Channel Structure:** Single channel per community initially, expand to multiple channels in Phase 3
- **Backward Compatibility:** Public channels remain unchanged
- **Access Control:** Membership verification required for all community operations
- **Implementation Order:** Start with message storage/retrieval, then UI updates, then advanced features

---

*Last Updated: January 2025*
*Status: Planning Phase - Ready for Implementation*
*Next Step: Begin Phase 1 Implementation*