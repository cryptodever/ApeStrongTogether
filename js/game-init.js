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
        apeHealth: 1,
        apeSpeed: 1,
        powerUpSpawnRate: 1
    }
};

// DOM Elements
let canvasEl;
let healthFillEl, healthValueEl;
let goldValueEl, scoreValueEl;
let upgradeShopEl;
let powerUpsDisplayEl;
let shopGoldEl;
let damageLevelEl, damageCostEl, upgradeDamageBtn;
let fireRateLevelEl, fireRateCostEl, upgradeFireRateBtn;
let healthLevelEl, healthCostEl, upgradeHealthBtn;
let speedLevelEl, speedCostEl, upgradeSpeedBtn;
let powerUpSpawnRateLevelEl, powerUpSpawnRateCostEl, upgradePowerUpSpawnRateBtn;
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
                    apeHealth: data.gameUpgrades.apeHealth || 1,
                    apeSpeed: data.gameUpgrades.apeSpeed || 1,
                    powerUpSpawnRate: data.gameUpgrades.powerUpSpawnRate || 1
                };
            }
        } else {
            // Create initial game data
            await setDoc(userDocRef, {
                gameGold: 0,
                gameUpgrades: {
                    weaponDamage: 1,
                    weaponFireRate: 1,
                    apeHealth: 1,
                    apeSpeed: 1,
                    powerUpSpawnRate: 1
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
    
    // Speed scaling: each level increases speed by 5%
    const speedLevel = userGameData.gameUpgrades.apeSpeed || 1;
    const playerSpeed = baseSpeed * (1 + (speedLevel - 1) * 0.05); // Level 1 = 100%, Level 2 = 105%, Level 3 = 110%, etc.
    
    // Power-up spawn rate bonus: each level adds 0.05% to base spawn chances
    const powerUpSpawnRateLevel = userGameData.gameUpgrades.powerUpSpawnRate || 1;
    const powerUpSpawnRateBonus = (powerUpSpawnRateLevel - 1) * 0.0005; // Level 1 = 0, Level 2 = 0.0005 (0.05%), etc.
    
    // Create game instance
    game = new Game(
        canvasEl,
        onEnemyKilled,
        onPlayerDied
    );
    
    // Set power-up spawn rate bonus
    game.setPowerUpSpawnRateBonus(powerUpSpawnRateBonus);
    
    // Apply upgrades
    game.setWeaponDamage(weaponDamage);
    game.setWeaponFireRate(weaponFireRate);
    game.setPlayerHealth(playerHealth);
    game.setPlayerSpeed(playerSpeed);
    
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
    const speedLevel = userGameData.gameUpgrades.apeSpeed || 1;
    
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
    
    if (speedLevelEl) speedLevelEl.textContent = speedLevel;
    if (speedCostEl) speedCostEl.textContent = speedLevel >= 100 ? 'MAX' : getUpgradeCost(speedLevel);
    if (upgradeSpeedBtn) {
        const cost = getUpgradeCost(speedLevel);
        upgradeSpeedBtn.disabled = speedLevel >= 100 || userGameData.gameGold < cost;
    }
    
    const powerUpSpawnRateLevel = userGameData.gameUpgrades.powerUpSpawnRate || 1;
    if (powerUpSpawnRateLevelEl) powerUpSpawnRateLevelEl.textContent = powerUpSpawnRateLevel;
    if (powerUpSpawnRateCostEl) powerUpSpawnRateCostEl.textContent = powerUpSpawnRateLevel >= 100 ? 'MAX' : getUpgradeCost(powerUpSpawnRateLevel);
    if (upgradePowerUpSpawnRateBtn) {
        const cost = getUpgradeCost(powerUpSpawnRateLevel);
        upgradePowerUpSpawnRateBtn.disabled = powerUpSpawnRateLevel >= 100 || userGameData.gameGold < cost;
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
        
        // Position relative to game container (which has position: relative)
        powerUpsDisplayEl.style.cssText = `
            position: absolute !important;
            top: 20px !important;
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
    
    fireRateLevelEl = document.getElementById('fireRateLevel');
    fireRateCostEl = document.getElementById('fireRateCost');
    upgradeFireRateBtn = document.getElementById('upgradeFireRate');
    
    healthLevelEl = document.getElementById('healthLevel');
    healthCostEl = document.getElementById('healthCost');
    upgradeHealthBtn = document.getElementById('upgradeHealth');
    
    speedLevelEl = document.getElementById('speedLevel');
    speedCostEl = document.getElementById('speedCost');
    upgradeSpeedBtn = document.getElementById('upgradeSpeed');
    
    powerUpSpawnRateLevelEl = document.getElementById('powerUpSpawnRateLevel');
    powerUpSpawnRateCostEl = document.getElementById('powerUpSpawnRateCost');
    upgradePowerUpSpawnRateBtn = document.getElementById('upgradePowerUpSpawnRate');
    
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
