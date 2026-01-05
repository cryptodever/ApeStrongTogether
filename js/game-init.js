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
let userGameData = {
    gameGold: 0,
    gameUpgrades: {
        weaponDamage: 1,
        weaponFireRate: 1,
        apeHealth: 1
    }
};

// DOM Elements
let canvasEl;
let healthFillEl, healthValueEl;
let goldValueEl, scoreValueEl;
let upgradeShopEl;
let shopGoldEl;
let damageLevelEl, damageCostEl, upgradeDamageBtn;
let fireRateLevelEl, fireRateCostEl, upgradeFireRateBtn;
let healthLevelEl, healthCostEl, upgradeHealthBtn;
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
            if (data.gameUpgrades) {
                userGameData.gameUpgrades = {
                    weaponDamage: data.gameUpgrades.weaponDamage || 1,
                    weaponFireRate: data.gameUpgrades.weaponFireRate || 1,
                    apeHealth: data.gameUpgrades.apeHealth || 1
                };
            }
        } else {
            // Create initial game data
            await setDoc(userDocRef, {
                gameGold: 0,
                gameUpgrades: {
                    weaponDamage: 1,
                    weaponFireRate: 1,
                    apeHealth: 1
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
function initializeGame() {
    canvasEl = document.getElementById('gameCanvas');
    if (!canvasEl) return;
    
    // Clean up existing game if any
    if (game) {
        // Game will be garbage collected, but we clear the reference
        game = null;
    }
    
    // Calculate upgrade values
    const baseDamage = 5;
    const baseFireRate = 500;
    const baseHealth = 20; // Base health starts at 20
    const baseSpeed = 3;
    
    // Upgrade scaling: each level multiplies the base value
    const weaponDamage = baseDamage * userGameData.gameUpgrades.weaponDamage;
    
    // Fire rate scaling: continues to improve beyond level 5 with diminishing returns
    // Formula: baseFireRate / (1 + (level - 1) * 0.5)
    // This gives: Level 1 = 500ms, Level 2 = 333ms, Level 3 = 250ms, Level 5 = 200ms, Level 10 = 111ms, Level 20 = 63ms, etc.
    // Minimum of 50ms to keep it fair
    const fireRateLevel = userGameData.gameUpgrades.weaponFireRate;
    const weaponFireRate = Math.max(50, baseFireRate / (1 + (fireRateLevel - 1) * 0.5));
    
    const playerHealth = baseHealth * userGameData.gameUpgrades.apeHealth; // Health multiplies by level
    
    // Create game instance
    game = new Game(
        canvasEl,
        onEnemyKilled,
        onPlayerDied
    );
    
    // Apply upgrades
    game.setWeaponDamage(weaponDamage);
    game.setWeaponFireRate(weaponFireRate);
    game.setPlayerHealth(playerHealth);
    game.setPlayerSpeed(baseSpeed); // Always use base speed
    
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
function showUpgradeShop() {
    if (upgradeShopEl) {
        upgradeShopEl.style.display = 'flex';
    }
    updateUpgradeShopUI();
}

// Hide upgrade shop modal
function hideUpgradeShop() {
    if (upgradeShopEl) {
        upgradeShopEl.style.display = 'none';
    }
}

// Calculate upgrade cost - slower scaling
function getUpgradeCost(level) {
    // Linear scaling: 10, 20, 30, 40, 50... (much slower than exponential)
    return 10 + (level - 1) * 10;
}

// Update upgrade shop UI
function updateUpgradeShopUI() {
    if (!upgradeShopEl) return;
    
    // Update gold display
    if (shopGoldEl) {
        shopGoldEl.textContent = userGameData.gameGold;
    }
    
    // Update upgrade levels and costs
    const damageLevel = userGameData.gameUpgrades.weaponDamage;
    const fireRateLevel = userGameData.gameUpgrades.weaponFireRate;
    const healthLevel = userGameData.gameUpgrades.apeHealth;
    
    if (damageLevelEl) damageLevelEl.textContent = damageLevel;
    if (damageCostEl) damageCostEl.textContent = damageLevel >= 100 ? 'MAX' : getUpgradeCost(damageLevel);
    if (upgradeDamageBtn) {
        const cost = getUpgradeCost(damageLevel);
        upgradeDamageBtn.disabled = damageLevel >= 100 || userGameData.gameGold < cost;
    }
    
    if (fireRateLevelEl) fireRateLevelEl.textContent = fireRateLevel;
    if (fireRateCostEl) fireRateCostEl.textContent = fireRateLevel >= 100 ? 'MAX' : getUpgradeCost(fireRateLevel);
    if (upgradeFireRateBtn) {
        const cost = getUpgradeCost(fireRateLevel);
        upgradeFireRateBtn.disabled = fireRateLevel >= 100 || userGameData.gameGold < cost;
    }
    
    if (healthLevelEl) healthLevelEl.textContent = healthLevel;
    if (healthCostEl) healthCostEl.textContent = healthLevel >= 100 ? 'MAX' : getUpgradeCost(healthLevel);
    if (upgradeHealthBtn) {
        const cost = getUpgradeCost(healthLevel);
        upgradeHealthBtn.disabled = healthLevel >= 100 || userGameData.gameGold < cost;
    }
}

// Purchase upgrade
async function purchaseUpgrade(upgradeType) {
    const level = userGameData.gameUpgrades[upgradeType];
    const cost = getUpgradeCost(level);
    
    // Check max upgrade level (100)
    if (level >= 100) {
        return; // Already at max level
    }
    
    if (userGameData.gameGold < cost) {
        return; // Not enough gold
    }
    
    userGameData.gameGold -= cost;
    userGameData.gameUpgrades[upgradeType] += 1;
    
    await saveGameData();
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
    
    // Continue updating
    requestAnimationFrame(updateGameUI);
}

// Setup event listeners
function setupEventListeners() {
    // Get DOM elements
    healthFillEl = document.getElementById('healthFill');
    healthValueEl = document.getElementById('healthValue');
    goldValueEl = document.getElementById('goldValue');
    scoreValueEl = document.getElementById('scoreValue');
    upgradeShopEl = document.getElementById('upgradeShop');
    shopGoldEl = document.getElementById('shopGold');
    
    damageLevelEl = document.getElementById('damageLevel');
    damageCostEl = document.getElementById('damageCost');
    upgradeDamageBtn = document.getElementById('upgradeDamage');
    
    fireRateLevelEl = document.getElementById('fireRateLevel');
    fireRateCostEl = document.getElementById('fireRateCost');
    upgradeFireRateBtn = document.getElementById('upgradeFireRate');
    
    healthLevelEl = document.getElementById('healthLevel');
    healthCostEl = document.getElementById('healthCost');
    upgradeHealthBtn = document.getElementById('upgradeHealth');
    
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
    
    // Initial UI update
    updateUI();
}
