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

// Initialize auth gate
(async () => {
    try {
        const { initAuthGate } = await import('/js/auth-gate.js');
        initAuthGate();
    } catch (error) {
        console.error('Game init: Auth gate initialization error:', error);
    }
})();

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

// Initialize game page
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserGameData();
        initializeGame();
        setupEventListeners();
    } else {
        currentUser = null;
    }
});

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
    const baseHealth = 100;
    const baseSpeed = 3;
    
    const weaponDamage = baseDamage * userGameData.gameUpgrades.weaponDamage;
    const weaponFireRate = Math.max(100, baseFireRate / userGameData.gameUpgrades.weaponFireRate); // Min 100ms
    const playerHealth = baseHealth * userGameData.gameUpgrades.apeHealth;
    
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
function onPlayerDied(score) {
    updateUI();
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

// Update game UI (health, score)
function updateGameUI() {
    if (!game) {
        // If no game, try again next frame (game might be initializing)
        requestAnimationFrame(updateGameUI);
        return;
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
    
    // Initially hide game UI overlay (show when start screen is hidden)
    const gameUIOverlay = document.querySelector('.game-ui-overlay');
    if (gameUIOverlay && startScreenEl && !startScreenEl.classList.contains('hide')) {
        gameUIOverlay.style.opacity = '0';
    }
    
    // Initial UI update
    updateUI();
}
