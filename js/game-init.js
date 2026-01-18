/**
 * Game Page Initialization Module
 * Handles authentication, game data loading, and Firestore integration
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    doc,
    getDoc,
    updateDoc,
    setDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { Game } from './game.js';

// Mobile detection
function isMobileDevice() {
    // Check for touch device and small screen
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth < 1024 || window.innerHeight < 600;
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    
    // Consider it mobile if it's a mobile user agent OR (has touch AND small screen)
    return isMobileUA || (hasTouchScreen && isSmallScreen);
}

// Check for mobile device and show message
const isMobile = isMobileDevice();
if (isMobile) {
    const mobileMessage = document.getElementById('mobileMessage');
    const gameContainer = document.getElementById('gameContainer');
    
    if (mobileMessage) {
        mobileMessage.style.display = 'flex';
    }
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }
} else {
    // Only initialize game on desktop
    // Initialize auth gate
    (async () => {
        try {
            const { initAuthGate } = await import('/js/auth-gate.js');
            initAuthGate();
        } catch (error) {
            console.error('Game init: Auth gate initialization error:', error);
        }
    })();
}

// State
let currentUser = null;
let game = null;
let lastCombo = 0; // Track last combo value for change detection
let userGameData = {
    gameGold: 0,
    selectedCharacter: 1, // Default character (1 = Pistol, 2 = Shotgun, 3 = Sniper)
    unlockedCharacters: [1], // Character 1 unlocked by default
    gameUpgrades: {
        character1: {
            weaponDamage: 1,
            weaponFireRate: 1,
            apeHealth: 1,
            apeSpeed: 1,
            powerUpSpawnRate: 1,
            pickupRange: 1
        },
        character2: {
            weaponDamage: 1,
            weaponFireRate: 1,
            apeHealth: 1,
            apeSpeed: 1,
            powerUpSpawnRate: 1,
            pickupRange: 1
        },
        character3: {
            weaponDamage: 1,
            weaponFireRate: 1,
            apeHealth: 1,
            apeSpeed: 1,
            powerUpSpawnRate: 1,
            pickupRange: 1
        }
    }
};

// DOM Elements
let canvasEl;
let healthFillEl, healthValueEl;
let goldValueEl, scoreValueEl;
let comboDisplayEl, comboValueEl, comboMultiplierEl;
let upgradeShopEl;
let powerUpsDisplayEl;
let shopGoldEl;
let damageLevelEl, damageCostEl, upgradeDamageBtn, damageCurrentEl, damageNextEl, refundDamageBtn;
let fireRateLevelEl, fireRateCostEl, upgradeFireRateBtn, fireRateCurrentEl, fireRateNextEl, refundFireRateBtn;
let healthLevelEl, healthCostEl, upgradeHealthBtn, healthCurrentEl, healthNextEl, refundHealthBtn;
let speedLevelEl, speedCostEl, upgradeSpeedBtn, speedCurrentEl, speedNextEl, refundSpeedBtn;
let powerUpSpawnRateLevelEl, powerUpSpawnRateCostEl, upgradePowerUpSpawnRateBtn, powerUpSpawnRateCurrentEl, powerUpSpawnRateNextEl, refundPowerUpSpawnRateBtn;
let pickupRangeLevelEl, pickupRangeCostEl, upgradePickupRangeBtn, pickupRangeCurrentEl, pickupRangeNextEl, refundPickupRangeBtn;
let restartBtn;
let startScreenEl, startGameBtn;
let pauseMenuEl, resumeBtn, restartPauseBtn;

// Initialize game page (only on desktop)
if (!isMobile) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadUserGameData();
            await updateLeaderboardUsername(); // Fix username in existing leaderboard entry
            initializeGame();
            setupEventListeners();
        } else {
            currentUser = null;
        }
    });
}

// Load user game data from Firestore
async function loadUserGameData() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.gameGold !== undefined) {
                userGameData.gameGold = data.gameGold || 0;
            }
            
            // Migration: Convert old upgrade structure to new per-character structure
            if (data.gameUpgrades && !data.gameUpgrades.character1) {
                // Old structure detected - migrate to new structure
                const oldUpgrades = data.gameUpgrades;
                userGameData.gameUpgrades = {
                    character1: {
                        weaponDamage: oldUpgrades.weaponDamage || 1,
                        weaponFireRate: oldUpgrades.weaponFireRate || 1,
                        apeHealth: oldUpgrades.apeHealth || 1,
                        apeSpeed: oldUpgrades.apeSpeed || 1,
                        powerUpSpawnRate: oldUpgrades.powerUpSpawnRate || 1,
                        pickupRange: oldUpgrades.pickupRange || 1
                    },
                    character2: {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    },
                    character3: {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    }
                };
                // Save migrated data
                await saveGameData();
            } else if (data.gameUpgrades) {
                // New structure - load as-is
                userGameData.gameUpgrades = {
                    character1: data.gameUpgrades.character1 || {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    },
                    character2: data.gameUpgrades.character2 || {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    },
                    character3: data.gameUpgrades.character3 || {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    }
                };
            }
            
            // Load character selection data
            if (data.selectedCharacter !== undefined) {
                userGameData.selectedCharacter = data.selectedCharacter;
            }
            if (data.unlockedCharacters && Array.isArray(data.unlockedCharacters)) {
                userGameData.unlockedCharacters = data.unlockedCharacters;
            } else if (!data.unlockedCharacters) {
                // Initialize unlocked characters if not present
                userGameData.unlockedCharacters = [1];
            }
        } else {
            // Create initial game data
            await setDoc(userDocRef, {
                gameGold: 0,
                selectedCharacter: 1,
                unlockedCharacters: [1],
                gameUpgrades: {
                    character1: {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    },
                    character2: {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    },
                    character3: {
                        weaponDamage: 1,
                        weaponFireRate: 1,
                        apeHealth: 1,
                        apeSpeed: 1,
                        powerUpSpawnRate: 1,
                        pickupRange: 1
                    }
                },
                createdAt: serverTimestamp()
            }, { merge: true });
        }
        
        updateUI();
    } catch (error) {
        console.error('Error loading game data:', error);
    }
}

// Save game data to Firestore
async function saveGameData() {
    if (!currentUser) return;
    
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            gameGold: userGameData.gameGold,
            selectedCharacter: userGameData.selectedCharacter,
            unlockedCharacters: userGameData.unlockedCharacters,
            gameUpgrades: userGameData.gameUpgrades
        });
    } catch (error) {
        console.error('Error saving game data:', error);
    }
}

// Update leaderboard username (fixes existing entries)
async function updateLeaderboardUsername() {
    if (!currentUser) return;
    
    try {
        // Get username from user profile
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const username = userData.username || currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous';
        
        const leaderboardRef = doc(db, 'gameLeaderboard', currentUser.uid);
        const leaderboardDoc = await getDoc(leaderboardRef);
        
        if (leaderboardDoc.exists()) {
            // Update username if it's different
            const currentUsername = leaderboardDoc.data().username;
            if (currentUsername !== username) {
                await updateDoc(leaderboardRef, {
                    username: username,
                    updatedAt: serverTimestamp()
                });
            }
        }
    } catch (error) {
        console.error('Error updating leaderboard username:', error);
    }
}

// Save score to leaderboard (only highest score per user)
async function saveScoreToLeaderboard(score) {
    if (!currentUser) return;
    
    try {
        // Get username from user profile
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const username = userData.username || currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous';
        
        const leaderboardRef = doc(db, 'gameLeaderboard', currentUser.uid);
        const leaderboardDoc = await getDoc(leaderboardRef);
        
        if (leaderboardDoc.exists()) {
            const currentScore = leaderboardDoc.data().score || 0;
            // Only update score if new score is higher, but always update username
            if (score > currentScore) {
                await updateDoc(leaderboardRef, {
                    score: score,
                    username: username,
                    updatedAt: serverTimestamp()
                });
            } else {
                // Update username even if score isn't higher (to fix existing entries)
                await updateDoc(leaderboardRef, {
                    username: username,
                    updatedAt: serverTimestamp()
                });
            }
        } else {
            // Create new entry
            await setDoc(leaderboardRef, {
                userId: currentUser.uid,
                username: username,
                score: score,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Error saving score to leaderboard:', error);
    }
}

// Initialize game instance
async function initializeGame() {
    canvasEl = document.getElementById('gameCanvas');
    if (!canvasEl) return;
    
    // Clean up existing game if any
    if (game) {
        // Game will be garbage collected, but we clear the reference
        game = null;
    }
    
    // Get selected character's upgrades
    const selectedCharacter = userGameData.selectedCharacter;
    const characterKey = `character${selectedCharacter}`;
    const characterUpgrades = userGameData.gameUpgrades[characterKey] || {
        weaponDamage: 1,
        weaponFireRate: 1,
        apeHealth: 1,
        apeSpeed: 1,
        powerUpSpawnRate: 1,
        pickupRange: 1
    };
    
    // Calculate upgrade values
    // Character-specific base damage: Sniper gets 2x damage
    const baseDamage = selectedCharacter === 3 ? 10 : 5; // Sniper (character 3) gets 2x damage
    const baseHealth = 20; // Base health starts at 20
    const baseSpeed = 3;
    
    // Character-specific fire rate calculation
    // Pistol: 300ms at level 1, 50ms at level 100
    // Shotgun: 600ms at level 1, 200ms at level 100
    // Sniper: 900ms at level 1, 300ms at level 100
    function getCharacterFireRate(characterType, level) {
        let startFireRate, endFireRate;
        switch(characterType) {
            case 1: // Pistol
                startFireRate = 300;
                endFireRate = 50;
                break;
            case 2: // Shotgun
                startFireRate = 600;
                endFireRate = 200;
                break;
            case 3: // Sniper
                startFireRate = 900;
                endFireRate = 300;
                break;
            default:
                startFireRate = 300;
                endFireRate = 50;
        }
        
        if (level >= 100) {
            return endFireRate;
        }
        
        // Linear interpolation from start to end
        const progress = (level - 1) / 99; // 0 at level 1, 1 at level 100
        return startFireRate - (startFireRate - endFireRate) * progress;
    }
    
    // Upgrade scaling: each level multiplies the base value
    const weaponDamage = baseDamage * characterUpgrades.weaponDamage;
    
    // Fire rate scaling: character-specific linear interpolation
    const fireRateLevel = characterUpgrades.weaponFireRate;
    const weaponFireRate = getCharacterFireRate(selectedCharacter, fireRateLevel);
    
    const playerHealth = baseHealth * characterUpgrades.apeHealth; // Health multiplies by level
    
    // Speed scaling: each level increases speed by 5%
    const speedLevel = characterUpgrades.apeSpeed || 1;
    const playerSpeed = baseSpeed * (1 + (speedLevel - 1) * 0.05); // Level 1 = 100%, Level 2 = 105%, Level 3 = 110%, etc.
    
    // Power-up spawn rate bonus: each level adds 0.05% to base spawn chances
    const powerUpSpawnRateLevel = characterUpgrades.powerUpSpawnRate || 1;
    const powerUpSpawnRateBonus = (powerUpSpawnRateLevel - 1) * 0.0005; // Level 1 = 0, Level 2 = 0.0005 (0.05%), etc.
    
    // Pickup range: each level adds +8 to base range of 100 (reduced from +15 for balance)
    // Ensure pickupRange exists, default to 1 if not set
    if (!characterUpgrades.hasOwnProperty('pickupRange') || characterUpgrades.pickupRange === undefined || characterUpgrades.pickupRange === null || isNaN(characterUpgrades.pickupRange)) {
        characterUpgrades.pickupRange = 1;
        // Save the default value if it was missing
        await saveGameData();
    }
    const pickupRangeLevel = Number(characterUpgrades.pickupRange) || 1;
    const pickupRange = 100 + (pickupRangeLevel - 1) * 8; // Level 1 = 100, Level 2 = 108, Level 3 = 116, etc.
    
    
    // Create game instance with character type
    game = new Game(
        canvasEl,
        onEnemyKilled,
        onPlayerDied,
        selectedCharacter
    );
    
    // Set power-up spawn rate bonus
    game.setPowerUpSpawnRateBonus(powerUpSpawnRateBonus);
    // Set pickup range
    game.setPickupRange(pickupRange);
    
    // Apply upgrades
    game.setWeaponDamage(weaponDamage);
    game.setWeaponFireRate(weaponFireRate);
    game.setPlayerHealth(playerHealth);
    game.setPlayerSpeed(playerSpeed);
    
    // Reset combo tracker for new game
    lastCombo = 0;
    
    // Start update loop for UI
    updateGameUI();
}

// Callback when enemy is killed
async function onEnemyKilled(goldEarned) {
    userGameData.gameGold += goldEarned;
    await saveGameData();
    updateUI();
}

// Callback when player dies
async function onPlayerDied(score) {
    updateUI();
    // Save score to leaderboard
    await saveScoreToLeaderboard(score);
    showUpgradeShop();
}

// Show upgrade shop modal
function showUpgradeShop(fromMainMenu = false) {
    if (upgradeShopEl) {
        upgradeShopEl.style.display = 'flex';
    }
    // Show close button if accessed from main menu, hide if from death screen
    const closeBtn = document.getElementById('closeUpgradeBtn');
    if (closeBtn) {
        closeBtn.style.display = fromMainMenu ? 'block' : 'none';
    }
    // Hide restart button if from main menu, show if from death screen
    if (restartBtn) {
        restartBtn.style.display = fromMainMenu ? 'none' : 'block';
    }
    updateCharacterSelectionUI();
    updateUpgradeShopUI();
}

// Hide upgrade shop modal
function hideUpgradeShop() {
    if (upgradeShopEl) {
        upgradeShopEl.style.display = 'none';
    }
}

// Get character unlock cost
function getCharacterUnlockCost(characterId) {
    if (characterId === 1) return 0; // Free (unlocked by default)
    if (characterId === 2) return 20000; // 20,000 gold
    if (characterId === 3) return 30000; // 30,000 gold
    // Future characters: 30,000 + (characterId - 3) * 10,000
    return 30000 + (characterId - 3) * 10000;
}

// Get character name
function getCharacterName(characterId) {
    switch(characterId) {
        case 1: return 'Pistol';
        case 2: return 'Shotgun';
        case 3: return 'Sniper';
        default: return `Character ${characterId}`;
    }
}

// Get character description
function getCharacterDescription(characterId) {
    switch(characterId) {
        case 1: return 'Pistol weapon with balanced stats';
        case 2: return '5 bullet spread, slower fire rate';
        case 3: return 'Piercing bullets, 2x damage, slower fire rate and movement';
        default: return '';
    }
}

// Unlock character
async function unlockCharacter(characterId) {
    if (!currentUser) return;
    
    // Check if already unlocked
    if (userGameData.unlockedCharacters.includes(characterId)) {
        return;
    }
    
    // Check cost
    const cost = getCharacterUnlockCost(characterId);
    if (userGameData.gameGold < cost) {
        return; // Not enough gold
    }
    
    // Deduct gold
    userGameData.gameGold -= cost;
    
    // Add to unlocked characters
    userGameData.unlockedCharacters.push(characterId);
    
    // Initialize character upgrades (already initialized in data structure, but ensure they exist)
    if (!userGameData.gameUpgrades[`character${characterId}`]) {
        userGameData.gameUpgrades[`character${characterId}`] = {
            weaponDamage: 1,
            weaponFireRate: 1,
            apeHealth: 1,
            apeSpeed: 1,
            powerUpSpawnRate: 1,
            pickupRange: 1
        };
    }
    
    // Save to Firestore
    await saveGameData();
    
    // Update UI
    updateUI();
    updateCharacterSelectionUI();
    updateUpgradeShopUI();
}

// Select character
async function selectCharacter(characterId) {
    if (!currentUser) return;
    
    // Check if unlocked
    if (!userGameData.unlockedCharacters.includes(characterId)) {
        return;
    }
    
    // Set selected character
    userGameData.selectedCharacter = characterId;
    
    // Save to Firestore
    await saveGameData();
    
    // Reinitialize game with new character (if game is not currently playing)
    if (game && game.state === 'menu') {
        initializeGame();
    }
    
    // Update UI
    updateCharacterSelectionUI();
    updateUpgradeShopUI();
}

// Calculate upgrade cost - optimized scaling (slower growth at high levels)
function getUpgradeCost(level) {
    // Base cost for level 1
    const baseCost = 10;
    
    // Use a softer exponential curve that grows slower at high levels
    // Level 1-10: ~1.15x per level
    // Level 11-30: ~1.12x per level  
    // Level 31+: ~1.1x per level
    // This prevents costs from becoming astronomical at high levels
    
    if (level <= 10) {
        // Early levels: 1.15x multiplier
        const cost = baseCost * Math.pow(1.15, level - 1);
        return Math.ceil(cost);
    } else if (level <= 30) {
        // Mid levels: 1.12x multiplier (slower growth)
        const earlyCost = baseCost * Math.pow(1.15, 10); // Cost at level 10
        const cost = earlyCost * Math.pow(1.12, level - 10);
        return Math.ceil(cost);
    } else {
        // High levels: 1.1x multiplier (much slower growth)
        const earlyCost = baseCost * Math.pow(1.15, 10); // Cost at level 10
        const midCost = earlyCost * Math.pow(1.12, 20); // Cost at level 30
        const cost = midCost * Math.pow(1.1, level - 30);
        return Math.ceil(cost);
    }
}

// Update character selection UI
function updateCharacterSelectionUI() {
    const characterSelectionEl = document.getElementById('characterSelection');
    if (!characterSelectionEl) return;
    
    const selectedCharacter = userGameData.selectedCharacter;
    const unlockedCharacters = userGameData.unlockedCharacters;
    
    // Update each character card
    for (let i = 1; i <= 3; i++) {
        const cardEl = document.getElementById(`characterCard${i}`);
        const unlockBtnEl = document.getElementById(`unlockCharacter${i}`);
        const selectBtnEl = document.getElementById(`selectCharacter${i}`);
        const costEl = document.getElementById(`characterCost${i}`);
        const badgeEl = cardEl ? cardEl.querySelector('.character-badge') : null;
        
        if (!cardEl) continue;
        
        const isUnlocked = unlockedCharacters.includes(i);
        const isSelected = selectedCharacter === i;
        const cost = getCharacterUnlockCost(i);
        
        // Update card classes
        cardEl.classList.toggle('character-locked', !isUnlocked);
        cardEl.classList.toggle('character-selected', isSelected);
        
        // Update badge
        if (badgeEl) {
            if (i === 1) {
                // Character 1 always shows "Default"
                badgeEl.textContent = 'Default';
                badgeEl.classList.remove('locked-badge');
            } else if (isUnlocked) {
                // Unlocked characters show no badge (or could show "Unlocked")
                badgeEl.textContent = '';
                badgeEl.classList.remove('locked-badge');
            } else {
                // Locked characters show lock emoji
                badgeEl.textContent = '🔒';
                badgeEl.classList.add('locked-badge');
            }
        }
        
        // Update buttons
        if (unlockBtnEl) {
            unlockBtnEl.style.display = isUnlocked ? 'none' : 'block';
            unlockBtnEl.disabled = userGameData.gameGold < cost;
            unlockBtnEl.textContent = `${cost.toLocaleString()} gold`;
        }
        
        if (selectBtnEl) {
            selectBtnEl.style.display = isUnlocked ? 'block' : 'none';
            selectBtnEl.disabled = isSelected;
            selectBtnEl.textContent = isSelected ? 'Selected' : 'Select';
        }
        
        if (costEl) {
            if (isUnlocked) {
                costEl.style.display = 'none';
            } else {
                costEl.style.display = 'block';
                costEl.textContent = `${cost.toLocaleString()} gold`;
            }
        }
    }
}

// Update upgrade shop UI
function updateUpgradeShopUI() {
    if (!upgradeShopEl) return;
    
    // Get current character's upgrades
    const selectedCharacter = userGameData.selectedCharacter;
    const characterKey = `character${selectedCharacter}`;
    const characterUpgrades = userGameData.gameUpgrades[characterKey] || {
        weaponDamage: 1,
        weaponFireRate: 1,
        apeHealth: 1,
        apeSpeed: 1,
        powerUpSpawnRate: 1
    };
    
    // Character-specific base damage: Sniper gets 2x damage
    const baseDamage = selectedCharacter === 3 ? 10 : 5; // Sniper (character 3) gets 2x damage
    const baseHealth = 20;
    const baseSpeed = 3;
    
    // Character-specific fire rate calculation function
    function getCharacterFireRate(characterType, level) {
        let startFireRate, endFireRate;
        switch(characterType) {
            case 1: // Pistol
                startFireRate = 300;
                endFireRate = 50;
                break;
            case 2: // Shotgun
                startFireRate = 600;
                endFireRate = 200;
                break;
            case 3: // Sniper
                startFireRate = 900;
                endFireRate = 300;
                break;
            default:
                startFireRate = 300;
                endFireRate = 50;
        }
        
        if (level >= 100) {
            return endFireRate;
        }
        
        // Linear interpolation from start to end
        const progress = (level - 1) / 99; // 0 at level 1, 1 at level 100
        return startFireRate - (startFireRate - endFireRate) * progress;
    }
    
    // Update gold display
    if (shopGoldEl) {
        shopGoldEl.textContent = userGameData.gameGold;
    }
    
    // Update character name display
    const characterNameEl = document.getElementById('currentCharacterName');
    if (characterNameEl) {
        characterNameEl.textContent = getCharacterName(selectedCharacter);
    }
    
    // Update upgrade levels and costs
    const damageLevel = characterUpgrades.weaponDamage;
    const fireRateLevel = characterUpgrades.weaponFireRate;
    const healthLevel = characterUpgrades.apeHealth;
    const speedLevel = characterUpgrades.apeSpeed || 1;
    const powerUpSpawnRateLevel = characterUpgrades.powerUpSpawnRate || 1;
    
    // Damage upgrade
    if (damageLevelEl) damageLevelEl.textContent = damageLevel;
    const currentDamage = baseDamage * damageLevel;
    const nextDamage = damageLevel >= 100 ? currentDamage : baseDamage * (damageLevel + 1);
    if (damageCurrentEl) damageCurrentEl.textContent = currentDamage;
    if (damageNextEl) damageNextEl.textContent = damageLevel >= 100 ? 'MAX' : nextDamage;
    const damageCost = damageLevel >= 100 ? 0 : getUpgradeCost(damageLevel);
    if (damageCostEl) damageCostEl.textContent = damageLevel >= 100 ? 'MAX' : damageCost.toLocaleString();
    if (upgradeDamageBtn) {
        upgradeDamageBtn.disabled = damageLevel >= 100 || userGameData.gameGold < damageCost;
    }
    if (refundDamageBtn) {
        refundDamageBtn.disabled = damageLevel <= 1;
    }
    
    // Fire Rate upgrade (character-specific)
    if (fireRateLevelEl) fireRateLevelEl.textContent = fireRateLevel;
    const currentFireRate = getCharacterFireRate(selectedCharacter, fireRateLevel);
    const nextFireRate = fireRateLevel >= 100 ? currentFireRate : getCharacterFireRate(selectedCharacter, fireRateLevel + 1);
    if (fireRateCurrentEl) fireRateCurrentEl.textContent = Math.round(currentFireRate) + 'ms';
    if (fireRateNextEl) fireRateNextEl.textContent = fireRateLevel >= 100 ? 'MAX' : Math.round(nextFireRate) + 'ms';
    const fireRateCost = fireRateLevel >= 100 ? 0 : getUpgradeCost(fireRateLevel);
    if (fireRateCostEl) fireRateCostEl.textContent = fireRateLevel >= 100 ? 'MAX' : fireRateCost.toLocaleString();
    if (upgradeFireRateBtn) {
        upgradeFireRateBtn.disabled = fireRateLevel >= 100 || userGameData.gameGold < fireRateCost;
    }
    if (refundFireRateBtn) {
        refundFireRateBtn.disabled = fireRateLevel <= 1;
    }
    
    // Health upgrade
    if (healthLevelEl) healthLevelEl.textContent = healthLevel;
    const currentHealth = baseHealth * healthLevel;
    const nextHealth = healthLevel >= 100 ? currentHealth : baseHealth * (healthLevel + 1);
    if (healthCurrentEl) healthCurrentEl.textContent = currentHealth;
    if (healthNextEl) healthNextEl.textContent = healthLevel >= 100 ? 'MAX' : nextHealth;
    const healthCost = healthLevel >= 100 ? 0 : getUpgradeCost(healthLevel);
    if (healthCostEl) healthCostEl.textContent = healthLevel >= 100 ? 'MAX' : healthCost.toLocaleString();
    if (upgradeHealthBtn) {
        upgradeHealthBtn.disabled = healthLevel >= 100 || userGameData.gameGold < healthCost;
    }
    if (refundHealthBtn) {
        refundHealthBtn.disabled = healthLevel <= 1;
    }
    
    // Speed upgrade
    if (speedLevelEl) speedLevelEl.textContent = speedLevel;
    const currentSpeedPercent = Math.round((1 + (speedLevel - 1) * 0.05) * 100);
    const nextSpeedPercent = speedLevel >= 100 ? currentSpeedPercent : Math.round((1 + speedLevel * 0.05) * 100);
    if (speedCurrentEl) speedCurrentEl.textContent = currentSpeedPercent + '%';
    if (speedNextEl) speedNextEl.textContent = speedLevel >= 100 ? 'MAX' : nextSpeedPercent + '%';
    const speedCost = speedLevel >= 100 ? 0 : getUpgradeCost(speedLevel);
    if (speedCostEl) speedCostEl.textContent = speedLevel >= 100 ? 'MAX' : speedCost.toLocaleString();
    if (upgradeSpeedBtn) {
        upgradeSpeedBtn.disabled = speedLevel >= 100 || userGameData.gameGold < speedCost;
    }
    if (refundSpeedBtn) {
        refundSpeedBtn.disabled = speedLevel <= 1;
    }
    
    // Power-up Spawn Rate upgrade
    if (powerUpSpawnRateLevelEl) powerUpSpawnRateLevelEl.textContent = powerUpSpawnRateLevel;
    const baseSpawnChance = 0.005; // 0.5% base
    const currentSpawnRate = (baseSpawnChance + (powerUpSpawnRateLevel - 1) * 0.0005) * 100;
    const nextSpawnRate = powerUpSpawnRateLevel >= 100 ? currentSpawnRate : (baseSpawnChance + powerUpSpawnRateLevel * 0.0005) * 100;
    if (powerUpSpawnRateCurrentEl) powerUpSpawnRateCurrentEl.textContent = currentSpawnRate.toFixed(2) + '%';
    if (powerUpSpawnRateNextEl) powerUpSpawnRateNextEl.textContent = powerUpSpawnRateLevel >= 100 ? 'MAX' : nextSpawnRate.toFixed(2) + '%';
    const powerUpSpawnRateCost = powerUpSpawnRateLevel >= 100 ? 0 : getUpgradeCost(powerUpSpawnRateLevel);
    if (powerUpSpawnRateCostEl) powerUpSpawnRateCostEl.textContent = powerUpSpawnRateLevel >= 100 ? 'MAX' : powerUpSpawnRateCost.toLocaleString();
    if (upgradePowerUpSpawnRateBtn) {
        upgradePowerUpSpawnRateBtn.disabled = powerUpSpawnRateLevel >= 100 || userGameData.gameGold < powerUpSpawnRateCost;
    }
    if (refundPowerUpSpawnRateBtn) {
        refundPowerUpSpawnRateBtn.disabled = powerUpSpawnRateLevel <= 1;
    }
    
    // Pickup Range upgrade
    const pickupRangeLevel = characterUpgrades.pickupRange || 1;
    if (pickupRangeLevelEl) pickupRangeLevelEl.textContent = pickupRangeLevel;
    const basePickupRange = 100;
    const currentPickupRange = basePickupRange + (pickupRangeLevel - 1) * 8; // +8 per level
    const nextPickupRange = pickupRangeLevel >= 100 ? currentPickupRange : basePickupRange + pickupRangeLevel * 8;
    if (pickupRangeCurrentEl) pickupRangeCurrentEl.textContent = currentPickupRange + 'px';
    if (pickupRangeNextEl) pickupRangeNextEl.textContent = pickupRangeLevel >= 100 ? 'MAX' : nextPickupRange + 'px';
    const pickupRangeCost = pickupRangeLevel >= 100 ? 0 : getUpgradeCost(pickupRangeLevel);
    if (pickupRangeCostEl) pickupRangeCostEl.textContent = pickupRangeLevel >= 100 ? 'MAX' : pickupRangeCost.toLocaleString();
    if (upgradePickupRangeBtn) {
        upgradePickupRangeBtn.disabled = pickupRangeLevel >= 100 || userGameData.gameGold < pickupRangeCost;
    }
    if (refundPickupRangeBtn) {
        refundPickupRangeBtn.disabled = pickupRangeLevel <= 1;
    }
}

// Purchase upgrade
async function purchaseUpgrade(upgradeType) {
    const selectedCharacter = userGameData.selectedCharacter;
    const characterKey = `character${selectedCharacter}`;
    const characterUpgrades = userGameData.gameUpgrades[characterKey];
    
    if (!characterUpgrades) return;
    
    // Ensure upgrade level exists (default to 1 if undefined)
    if (characterUpgrades[upgradeType] === undefined) {
        characterUpgrades[upgradeType] = 1;
    }
    
    const level = characterUpgrades[upgradeType];
    const cost = getUpgradeCost(level);
    
    // Check max upgrade level (100)
    if (level >= 100) {
        return; // Already at max level
    }
    
    if (userGameData.gameGold < cost) {
        return; // Not enough gold
    }
    
    userGameData.gameGold -= cost;
    // Ensure the upgrade exists before incrementing
    if (characterUpgrades[upgradeType] === undefined || characterUpgrades[upgradeType] === null || isNaN(characterUpgrades[upgradeType])) {
        characterUpgrades[upgradeType] = 1;
    }
    characterUpgrades[upgradeType] = Number(characterUpgrades[upgradeType]) + 1;
    
    console.log('Purchase upgrade:', upgradeType, 'New level:', characterUpgrades[upgradeType], 'characterUpgrades:', JSON.stringify(characterUpgrades)); // Debug
    
    await saveGameData();
    
    // Update UI first
    updateUpgradeShopUI();
    updateUI();
    
    // Update running game instance if it exists
    if (game && typeof game.setPickupRange === 'function') {
        if (upgradeType === 'pickupRange') {
            const pickupRangeLevel = Number(characterUpgrades.pickupRange) || 1;
            const pickupRange = 100 + (pickupRangeLevel - 1) * 8; // +8 per level
            console.log('Updating pickup range to:', pickupRange, 'from level:', pickupRangeLevel, 'characterUpgrades.pickupRange:', characterUpgrades.pickupRange); // Debug log
            game.setPickupRange(pickupRange);
        } else if (upgradeType === 'apeSpeed') {
            const baseSpeed = 3;
            const speedLevel = characterUpgrades.apeSpeed || 1;
            const playerSpeed = baseSpeed * (1 + (speedLevel - 1) * 0.05);
            game.setPlayerSpeed(playerSpeed);
        } else if (upgradeType === 'weaponDamage') {
            // Character-specific base damage: Sniper gets 2x damage
            const baseDamage = selectedCharacter === 3 ? 10 : 5; // Sniper (character 3) gets 2x damage
            const weaponDamage = baseDamage * characterUpgrades.weaponDamage;
            game.setWeaponDamage(weaponDamage);
        } else if (upgradeType === 'weaponFireRate') {
            function getCharacterFireRate(characterType, level) {
                let startFireRate, endFireRate;
                switch(characterType) {
                    case 1: startFireRate = 300; endFireRate = 50; break;
                    case 2: startFireRate = 600; endFireRate = 200; break;
                    case 3: startFireRate = 900; endFireRate = 300; break;
                    default: startFireRate = 300; endFireRate = 50;
                }
                if (level >= 100) return endFireRate;
                const progress = (level - 1) / 99;
                return startFireRate - (startFireRate - endFireRate) * progress;
            }
            const fireRateLevel = characterUpgrades.weaponFireRate;
            const weaponFireRate = getCharacterFireRate(userGameData.selectedCharacter, fireRateLevel);
            game.setWeaponFireRate(weaponFireRate);
        } else if (upgradeType === 'apeHealth') {
            const baseHealth = 20;
            const playerHealth = baseHealth * characterUpgrades.apeHealth;
            game.setPlayerHealth(playerHealth);
        } else if (upgradeType === 'powerUpSpawnRate') {
            const powerUpSpawnRateLevel = characterUpgrades.powerUpSpawnRate || 1;
            const powerUpSpawnRateBonus = (powerUpSpawnRateLevel - 1) * 0.0005;
            game.setPowerUpSpawnRateBonus(powerUpSpawnRateBonus);
        }
    }
    
    updateUpgradeShopUI();
    updateUI();
}

// Refund upgrade (remove 1 level, get 50% gold back)
async function refundUpgrade(upgradeType) {
    const selectedCharacter = userGameData.selectedCharacter;
    const characterKey = `character${selectedCharacter}`;
    const characterUpgrades = userGameData.gameUpgrades[characterKey];
    
    if (!characterUpgrades) return;
    
    const level = characterUpgrades[upgradeType];
    
    // Can't refund if at level 1
    if (level <= 1) {
        return; // Already at minimum level
    }
    
    // Calculate refund: 50% of the cost to go from (level - 1) to level
    const previousLevel = level - 1;
    const costToUpgrade = getUpgradeCost(previousLevel);
    const refundAmount = Math.floor(costToUpgrade * 0.5); // 50% back
    
    // Refund the upgrade
    characterUpgrades[upgradeType] -= 1;
    userGameData.gameGold += refundAmount;
    
    await saveGameData();
    
    // Update running game instance if it exists
    if (game && game.setPickupRange) {
        if (upgradeType === 'pickupRange') {
            // Read the value AFTER increment (should be the new level)
            const pickupRangeLevel = characterUpgrades.pickupRange || 1;
            const pickupRange = 100 + (pickupRangeLevel - 1) * 8; // +8 per level
            game.setPickupRange(pickupRange);
        } else if (upgradeType === 'apeSpeed') {
            const baseSpeed = 3;
            const speedLevel = characterUpgrades.apeSpeed || 1;
            const playerSpeed = baseSpeed * (1 + (speedLevel - 1) * 0.05);
            game.setPlayerSpeed(playerSpeed);
        } else if (upgradeType === 'weaponDamage') {
            // Character-specific base damage: Sniper gets 2x damage
            const baseDamage = selectedCharacter === 3 ? 10 : 5; // Sniper (character 3) gets 2x damage
            const weaponDamage = baseDamage * characterUpgrades.weaponDamage;
            game.setWeaponDamage(weaponDamage);
        } else if (upgradeType === 'weaponFireRate') {
            function getCharacterFireRate(characterType, level) {
                let startFireRate, endFireRate;
                switch(characterType) {
                    case 1: startFireRate = 300; endFireRate = 50; break;
                    case 2: startFireRate = 600; endFireRate = 200; break;
                    case 3: startFireRate = 900; endFireRate = 300; break;
                    default: startFireRate = 300; endFireRate = 50;
                }
                if (level >= 100) return endFireRate;
                const progress = (level - 1) / 99;
                return startFireRate - (startFireRate - endFireRate) * progress;
            }
            const fireRateLevel = characterUpgrades.weaponFireRate;
            const weaponFireRate = getCharacterFireRate(userGameData.selectedCharacter, fireRateLevel);
            game.setWeaponFireRate(weaponFireRate);
        } else if (upgradeType === 'apeHealth') {
            const baseHealth = 20;
            const playerHealth = baseHealth * characterUpgrades.apeHealth;
            game.setPlayerHealth(playerHealth);
        } else if (upgradeType === 'powerUpSpawnRate') {
            const powerUpSpawnRateLevel = characterUpgrades.powerUpSpawnRate || 1;
            const powerUpSpawnRateBonus = (powerUpSpawnRateLevel - 1) * 0.0005;
            game.setPowerUpSpawnRateBonus(powerUpSpawnRateBonus);
        }
    }
    
    updateUpgradeShopUI();
    updateUI();
}

// Update main UI
function updateUI() {
    if (goldValueEl) {
        goldValueEl.textContent = userGameData.gameGold;
    }
}

// Show pause menu
function showPauseMenu() {
    if (pauseMenuEl) {
        pauseMenuEl.style.display = 'flex';
    }
}

// Hide pause menu
function hidePauseMenu() {
    if (pauseMenuEl) {
        pauseMenuEl.style.display = 'none';
    }
}

// Trigger exciting combo animation in HUD
function triggerComboAnimation(comboDisplayEl, comboValueEl, comboMultiplierEl, combo) {
    // Remove any existing animation classes
    comboDisplayEl.classList.remove('combo-pop', 'combo-pop-large', 'combo-pop-legendary');
    comboValueEl.classList.remove('combo-value-pop');
    comboMultiplierEl.classList.remove('combo-multiplier-pop');
    
    // Force reflow to ensure classes are removed
    void comboDisplayEl.offsetWidth;
    
    // Determine animation intensity based on combo level
    let animationClass = 'combo-pop';
    let textClass = 'combo-value-pop';
    
    // Create floating combo text for combos >= 5
    if (combo >= 5) {
        const comboText = document.createElement('span');
        comboText.className = 'combo-notification-text';
        
        // Determine text, color, and size based on combo level
        let animationDuration;
        if (combo >= 50) {
            animationClass = 'combo-pop-legendary';
            comboText.textContent = `${combo}x LEGENDARY!`;
            comboText.style.fontSize = '1.2rem';
            comboText.style.fontWeight = '900';
            comboText.style.color = '#f97316';
            comboText.style.textShadow = '0 0 10px #f97316, 0 0 20px #f97316, 0 0 30px #f97316';
            comboText.style.animation = 'comboTextFloat 1s ease-out forwards';
            comboText.style.top = '-30px';
            animationDuration = 800;
        } else if (combo >= 20) {
            animationClass = 'combo-pop-large';
            comboText.textContent = `${combo}x COMBO!`;
            comboText.style.fontSize = '0.95rem';
            comboText.style.fontWeight = '800';
            comboText.style.color = '#fbbf24';
            comboText.style.textShadow = '0 0 6px #fbbf24, 0 0 12px #fbbf24';
            comboText.style.animation = 'comboTextFloat 0.6s ease-out forwards';
            comboText.style.top = '-28px';
            animationDuration = 600;
        } else if (combo >= 10) {
            animationClass = 'combo-pop-large';
            comboText.textContent = `${combo}x COMBO!`;
            comboText.style.fontSize = '0.9rem';
            comboText.style.fontWeight = '800';
            comboText.style.color = '#22c55e';
            comboText.style.textShadow = '0 0 5px #22c55e, 0 0 10px #22c55e';
            comboText.style.animation = 'comboTextFloat 0.5s ease-out forwards';
            comboText.style.top = '-26px';
            animationDuration = 500;
        } else {
            comboText.textContent = `${combo}x COMBO!`;
            comboText.style.fontSize = '0.85rem';
            comboText.style.fontWeight = '700';
            comboText.style.color = '#4ade80';
            comboText.style.textShadow = '0 0 3px #4ade80, 0 0 6px #4ade80';
            comboText.style.animation = 'comboTextFloat 0.5s ease-out forwards';
            comboText.style.top = '-24px';
            animationDuration = 500;
        }
        
        // Common styles for all combo texts
        comboText.style.position = 'absolute';
        comboText.style.left = '50%';
        comboText.style.transform = 'translateX(-50%)';
        comboText.style.whiteSpace = 'nowrap';
        comboText.style.zIndex = '10001';
        comboText.style.pointerEvents = 'none';
        comboText.style.userSelect = 'none';
        
        comboDisplayEl.appendChild(comboText);
        
        // Remove text after animation
        setTimeout(() => {
            if (comboText.parentNode) {
                comboText.remove();
            }
        }, animationDuration);
    }
    
    // Add animation classes
    comboDisplayEl.classList.add(animationClass);
    comboValueEl.classList.add(textClass);
    comboMultiplierEl.classList.add('combo-multiplier-pop');
    
    // Remove animation classes after animation completes
    setTimeout(() => {
        comboDisplayEl.classList.remove(animationClass);
        comboValueEl.classList.remove(textClass);
        comboMultiplierEl.classList.remove('combo-multiplier-pop');
    }, 400);
}

// Update game UI (health, score)
function updateGameUI() {
    if (!game) {
        // If no game, try again next frame (game might be initializing)
        requestAnimationFrame(updateGameUI);
        return;
    }
    
    // Check pause state
    if (game.state === 'paused') {
        showPauseMenu();
    } else {
        hidePauseMenu();
    }
    
    const health = game.getHealth();
    const maxHealth = game.getMaxHealth();
    const score = game.getScore();
    
    // Update health bar
    if (healthFillEl) {
        const percent = Math.max(0, (health / maxHealth) * 100);
        healthFillEl.style.width = percent + '%';
    }
    
    if (healthValueEl) {
        healthValueEl.textContent = Math.max(0, Math.floor(health));
    }
    
    if (scoreValueEl) {
        scoreValueEl.textContent = score;
    }
    
    // Update dash cooldown indicator
    if (game && game.player) {
        let dashIndicatorEl = document.getElementById('dashIndicator');
        let dashCooldownFillEl = document.getElementById('dashCooldownFill');
        
        if (!dashIndicatorEl) {
            dashIndicatorEl = document.createElement('div');
            dashIndicatorEl.id = 'dashIndicator';
            dashIndicatorEl.className = 'dash-indicator';
            dashIndicatorEl.innerHTML = `
                <div class="dash-cooldown-bar">
                    <div class="dash-cooldown-fill" id="dashCooldownFill"></div>
                </div>
                <span class="dash-label">Dash</span>
            `;
            // Find game UI overlay and append to it
            const gameUIEl = document.querySelector('.game-ui-overlay');
            if (gameUIEl) {
                gameUIEl.appendChild(dashIndicatorEl);
            }
            dashCooldownFillEl = document.getElementById('dashCooldownFill');
        }
        
        if (dashIndicatorEl && dashCooldownFillEl) {
            if (game.player.dashCooldown > 0) {
                dashIndicatorEl.style.display = 'flex';
                const cooldownPercent = ((game.player.dashCooldownTime - game.player.dashCooldown) / game.player.dashCooldownTime) * 100;
                dashCooldownFillEl.style.width = cooldownPercent + '%';
            } else {
                dashIndicatorEl.style.display = 'none';
            }
        }
    }
    
    // Update combo display
    if (game && game.combo !== undefined) {
        if (!comboDisplayEl) {
            comboDisplayEl = document.getElementById('comboDisplay');
            comboValueEl = document.getElementById('comboValue');
            comboMultiplierEl = document.getElementById('comboMultiplier');
        }
        
        if (comboDisplayEl && comboValueEl && comboMultiplierEl) {
            // Detect combo change and trigger animation
            if (game.combo !== lastCombo && game.combo > 0) {
                // Combo changed - trigger exciting animation
                triggerComboAnimation(comboDisplayEl, comboValueEl, comboMultiplierEl, game.combo);
                lastCombo = game.combo;
            }
            
            if (game.combo > 0) {
                comboDisplayEl.style.display = 'flex';
                comboValueEl.textContent = game.combo;
                
                // Update multiplier display
                let multiplierText = 'x1';
                let multiplierColor = '#ffffff';
                
                if (game.combo >= 20) {
                    multiplierText = 'x5';
                    multiplierColor = '#f97316';
                } else if (game.combo >= 10) {
                    multiplierText = 'x3';
                    multiplierColor = '#22c55e';
                } else if (game.combo >= 5) {
                    multiplierText = 'x2';
                    multiplierColor = '#4ade80';
                }
                
                comboMultiplierEl.textContent = multiplierText;
                comboMultiplierEl.style.color = multiplierColor;
                comboDisplayEl.style.color = multiplierColor;
            } else {
                comboDisplayEl.style.display = 'none';
                lastCombo = 0;
            }
        }
    }
    
    // Update power-ups display
    updatePowerUpsDisplay();
    
    // Continue updating
    requestAnimationFrame(updateGameUI);
}

// Update power-ups display
function updatePowerUpsDisplay() {
    if (!game) return;
    
    // Ensure element is found (in case it wasn't found during setup)
    if (!powerUpsDisplayEl) {
        powerUpsDisplayEl = document.getElementById('powerUpsDisplay');
        if (!powerUpsDisplayEl) {
            // Try alternative selectors
            powerUpsDisplayEl = document.querySelector('.power-ups-display');
            if (!powerUpsDisplayEl) {
                // Create element if it doesn't exist
                powerUpsDisplayEl = document.createElement('div');
                powerUpsDisplayEl.id = 'powerUpsDisplay';
                powerUpsDisplayEl.className = 'power-ups-display';
                document.body.appendChild(powerUpsDisplayEl);
            }
        }
    }
    
    const activeEffects = game.activeEffects;
    if (!activeEffects) {
        console.warn('Active effects not found on game object');
        return;
    }
    
    const powerUpsHTML = [];
    
    // Speed boost
    if (activeEffects.speed && activeEffects.speed.count > 0 && activeEffects.speed.timers.length > 0) {
        const maxTimer = Math.max(...activeEffects.speed.timers.map(t => t.remaining));
        const seconds = Math.ceil(maxTimer / 1000);
        powerUpsHTML.push(`<div class="power-up-item" data-type="speed"><span class="power-up-icon" style="color: #00aaff;">→</span><span class="power-up-name">Speed</span><span class="power-up-timer">${seconds}s</span></div>`);
    }
    
    // Damage boost
    if (activeEffects.damage && activeEffects.damage.count > 0 && activeEffects.damage.timers.length > 0) {
        const maxTimer = Math.max(...activeEffects.damage.timers.map(t => t.remaining));
        const seconds = Math.ceil(maxTimer / 1000);
        powerUpsHTML.push(`<div class="power-up-item" data-type="damage"><span class="power-up-icon" style="color: #ff0000;">⚔</span><span class="power-up-name">Damage</span><span class="power-up-timer">${seconds}s</span></div>`);
    }
    
    // Fire rate boost
    if (activeEffects.fireRate && activeEffects.fireRate.count > 0 && activeEffects.fireRate.timers.length > 0) {
        const maxTimer = Math.max(...activeEffects.fireRate.timers.map(t => t.remaining));
        const seconds = Math.ceil(maxTimer / 1000);
        powerUpsHTML.push(`<div class="power-up-item" data-type="fireRate"><span class="power-up-icon" style="color: #ffaa00;">⚡</span><span class="power-up-name">Fire Rate</span><span class="power-up-timer">${seconds}s</span></div>`);
    }
    
    // Shield
    if (activeEffects.shield && activeEffects.shield.active && activeEffects.shield.timers.length > 0) {
        const maxTimer = Math.max(...activeEffects.shield.timers.map(t => t.remaining));
        const seconds = Math.ceil(maxTimer / 1000);
        powerUpsHTML.push(`<div class="power-up-item" data-type="shield"><span class="power-up-icon" style="color: #aa00ff;">🛡</span><span class="power-up-name">Shield</span><span class="power-up-timer">${seconds}s</span></div>`);
    }
    
    // Gold multiplier
    if (game.goldMultiplierActive && game.goldMultiplierTimer > 0) {
        const seconds = Math.ceil(game.goldMultiplierTimer / 1000);
        powerUpsHTML.push(`<div class="power-up-item" data-type="gold"><span class="power-up-icon" style="color: #ffd700;">★</span><span class="power-up-name">Gold x2</span><span class="power-up-timer">${seconds}s</span></div>`);
    }
    
    // Always update the innerHTML, even if empty (to clear old items)
    const htmlContent = powerUpsHTML.join('');
    
    if (powerUpsHTML.length > 0) {
        // Set innerHTML first
        powerUpsDisplayEl.innerHTML = htmlContent;
        
        // Check if combo display is visible to adjust position
        const comboDisplayEl = document.getElementById('comboDisplay');
        let topPosition = 90; // Default position below combo display area
        if (comboDisplayEl && comboDisplayEl.style.display !== 'none' && comboDisplayEl.offsetHeight > 0) {
            // Position power-ups below combo display with some spacing
            const comboRect = comboDisplayEl.getBoundingClientRect();
            const gameContainer = document.querySelector('.game-canvas-wrapper');
            const containerRect = gameContainer ? gameContainer.getBoundingClientRect() : { top: 0 };
            topPosition = comboRect.bottom - containerRect.top + 10; // 10px spacing
        }
        
        // Position relative to game container (which has position: relative)
        powerUpsDisplayEl.style.cssText = `
            position: absolute !important;
            top: ${topPosition}px !important;
            right: 20px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.5rem !important;
            pointer-events: none !important;
            z-index: 10000 !important;
            opacity: 1 !important;
            visibility: visible !important;
            min-width: 140px !important;
            max-width: 180px !important;
        `;
        
        // Also force styles on child elements
        const items = powerUpsDisplayEl.querySelectorAll('.power-up-item');
        items.forEach(item => {
            item.style.display = 'flex';
            item.style.visibility = 'visible';
            item.style.opacity = '1';
        });
    } else {
        powerUpsDisplayEl.innerHTML = htmlContent;
        // Reset styles when empty
        powerUpsDisplayEl.style.cssText = '';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Get DOM elements
    healthFillEl = document.getElementById('healthFill');
    healthValueEl = document.getElementById('healthValue');
    goldValueEl = document.getElementById('goldValue');
    scoreValueEl = document.getElementById('scoreValue');
    powerUpsDisplayEl = document.getElementById('powerUpsDisplay');
    upgradeShopEl = document.getElementById('upgradeShop');
    shopGoldEl = document.getElementById('shopGold');
    
    damageLevelEl = document.getElementById('damageLevel');
    damageCostEl = document.getElementById('damageCost');
    upgradeDamageBtn = document.getElementById('upgradeDamage');
    damageCurrentEl = document.getElementById('damageCurrent');
    damageNextEl = document.getElementById('damageNext');
    refundDamageBtn = document.getElementById('refundDamage');
    
    fireRateLevelEl = document.getElementById('fireRateLevel');
    fireRateCostEl = document.getElementById('fireRateCost');
    upgradeFireRateBtn = document.getElementById('upgradeFireRate');
    fireRateCurrentEl = document.getElementById('fireRateCurrent');
    fireRateNextEl = document.getElementById('fireRateNext');
    refundFireRateBtn = document.getElementById('refundFireRate');
    
    healthLevelEl = document.getElementById('healthLevel');
    healthCostEl = document.getElementById('healthCost');
    upgradeHealthBtn = document.getElementById('upgradeHealth');
    healthCurrentEl = document.getElementById('healthCurrent');
    healthNextEl = document.getElementById('healthNext');
    refundHealthBtn = document.getElementById('refundHealth');
    
    speedLevelEl = document.getElementById('speedLevel');
    speedCostEl = document.getElementById('speedCost');
    upgradeSpeedBtn = document.getElementById('upgradeSpeed');
    speedCurrentEl = document.getElementById('speedCurrent');
    speedNextEl = document.getElementById('speedNext');
    refundSpeedBtn = document.getElementById('refundSpeed');
    
    powerUpSpawnRateLevelEl = document.getElementById('powerUpSpawnRateLevel');
    powerUpSpawnRateCostEl = document.getElementById('powerUpSpawnRateCost');
    upgradePowerUpSpawnRateBtn = document.getElementById('upgradePowerUpSpawnRate');
    powerUpSpawnRateCurrentEl = document.getElementById('powerUpSpawnRateCurrent');
    powerUpSpawnRateNextEl = document.getElementById('powerUpSpawnRateNext');
    refundPowerUpSpawnRateBtn = document.getElementById('refundPowerUpSpawnRate');
    
    pickupRangeLevelEl = document.getElementById('pickupRangeLevel');
    pickupRangeCostEl = document.getElementById('pickupRangeCost');
    upgradePickupRangeBtn = document.getElementById('upgradePickupRange');
    pickupRangeCurrentEl = document.getElementById('pickupRangeCurrent');
    pickupRangeNextEl = document.getElementById('pickupRangeNext');
    refundPickupRangeBtn = document.getElementById('refundPickupRange');
    
    restartBtn = document.getElementById('restartBtn');
    
    // Start screen elements
    startScreenEl = document.getElementById('startScreen');
    startGameBtn = document.getElementById('startGameBtn');
    const leaderboardBtn = document.getElementById('leaderboardBtn');
    
    // Pause menu elements
    pauseMenuEl = document.getElementById('pauseMenu');
    resumeBtn = document.getElementById('resumeBtn');
    restartPauseBtn = document.getElementById('restartPauseBtn');
    
    // Upgrade buttons
    if (upgradeDamageBtn) {
        upgradeDamageBtn.addEventListener('click', () => purchaseUpgrade('weaponDamage'));
    }
    
    if (upgradeFireRateBtn) {
        upgradeFireRateBtn.addEventListener('click', () => purchaseUpgrade('weaponFireRate'));
    }
    
    if (upgradeHealthBtn) {
        upgradeHealthBtn.addEventListener('click', () => purchaseUpgrade('apeHealth'));
    }
    
    if (upgradeSpeedBtn) {
        upgradeSpeedBtn.addEventListener('click', () => purchaseUpgrade('apeSpeed'));
    }
    
    if (upgradePowerUpSpawnRateBtn) {
        upgradePowerUpSpawnRateBtn.addEventListener('click', () => purchaseUpgrade('powerUpSpawnRate'));
    }
    
    if (upgradePickupRangeBtn) {
        upgradePickupRangeBtn.addEventListener('click', () => purchaseUpgrade('pickupRange'));
    }
    
    // Refund buttons
    if (refundDamageBtn) {
        refundDamageBtn.addEventListener('click', () => refundUpgrade('weaponDamage'));
    }
    
    if (refundFireRateBtn) {
        refundFireRateBtn.addEventListener('click', () => refundUpgrade('weaponFireRate'));
    }
    
    if (refundHealthBtn) {
        refundHealthBtn.addEventListener('click', () => refundUpgrade('apeHealth'));
    }
    
    if (refundSpeedBtn) {
        refundSpeedBtn.addEventListener('click', () => refundUpgrade('apeSpeed'));
    }
    
    if (refundPowerUpSpawnRateBtn) {
        refundPowerUpSpawnRateBtn.addEventListener('click', () => refundUpgrade('powerUpSpawnRate'));
    }
    
    if (refundPickupRangeBtn) {
        refundPickupRangeBtn.addEventListener('click', () => refundUpgrade('pickupRange'));
    }
    
    // Restart button
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            hideUpgradeShop();
            // Reinitialize with current upgrades (may have been upgraded)
            initializeGame();
            // Show start screen again
            if (startScreenEl) {
                startScreenEl.classList.remove('hide');
            }
            // Hide game UI overlay
            const gameUIOverlay = document.querySelector('.game-ui-overlay');
            if (gameUIOverlay) {
                gameUIOverlay.style.opacity = '0';
            }
        });
    }
    
    // Start game button
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (game) {
                game.start();
                // Hide start screen
                if (startScreenEl) {
                    startScreenEl.classList.add('hide');
                }
                // Show game UI overlay
                const gameUIOverlay = document.querySelector('.game-ui-overlay');
                if (gameUIOverlay) {
                    gameUIOverlay.style.opacity = '1';
                }
            }
        });
    }
    
    // Upgrades button
    const upgradesBtn = document.getElementById('upgradesBtn');
    if (upgradesBtn) {
        upgradesBtn.addEventListener('click', () => {
            // Hide start screen
            if (startScreenEl) {
                startScreenEl.classList.add('hide');
            }
            // Show upgrade shop (from main menu)
            showUpgradeShop(true);
        });
    }
    
    // Close upgrade button
    const closeUpgradeBtn = document.getElementById('closeUpgradeBtn');
    if (closeUpgradeBtn) {
        closeUpgradeBtn.addEventListener('click', () => {
            hideUpgradeShop();
            // Show start screen again
            if (startScreenEl) {
                startScreenEl.classList.remove('hide');
            }
        });
    }
    
    // Leaderboard button
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            window.location.href = '/game/leaderboard/index.html';
        });
    }
    
    // Pause menu buttons
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (game) {
                game.resume();
                hidePauseMenu();
            }
        });
    }
    
    if (restartPauseBtn) {
        restartPauseBtn.addEventListener('click', () => {
            hidePauseMenu();
            // Reinitialize with current upgrades
            initializeGame();
            // Show start screen again
            if (startScreenEl) {
                startScreenEl.classList.remove('hide');
            }
            // Hide game UI overlay
            const gameUIOverlay = document.querySelector('.game-ui-overlay');
            if (gameUIOverlay) {
                gameUIOverlay.style.opacity = '0';
            }
        });
    }
    
    // Initially hide game UI overlay (show when start screen is hidden)
    const gameUIOverlay = document.querySelector('.game-ui-overlay');
    if (gameUIOverlay && startScreenEl && !startScreenEl.classList.contains('hide')) {
        gameUIOverlay.style.opacity = '0';
    }
    
    // Character selection buttons
    for (let i = 1; i <= 3; i++) {
        const unlockBtn = document.getElementById(`unlockCharacter${i}`);
        const selectBtn = document.getElementById(`selectCharacter${i}`);
        
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => unlockCharacter(i));
        }
        
        if (selectBtn) {
            selectBtn.addEventListener('click', () => selectCharacter(i));
        }
    }
    
    // Initial UI update
    updateUI();
    updateCharacterSelectionUI();
}
