/**
 * Retro Orbital Game Engine
 * Canvas-based shooter with orbital view
 */

export class Game {
    constructor(canvas, onEnemyKill, onPlayerDeath, characterType = 1) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true }); // Ensure alpha channel is preserved
        this.onEnemyKill = onEnemyKill; // Callback for when enemy is killed
        this.onPlayerDeath = onPlayerDeath; // Callback for when player dies
        this.characterType = characterType; // 1 = Standard, 2 = Shotgun, 3 = Sniper
        
        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Game state
        this.state = 'menu'; // 'menu', 'playing', 'paused', 'dead', 'shop'
        this.score = 0;
        this.kills = 0; // Track total enemies killed for difficulty scaling
        this.round = 1; // Track current round (increases after each boss defeat)
        
        // Kill streak/combo system
        this.combo = 0; // Current combo count
        this.maxCombo = 0; // Highest combo achieved
        this.lastKillTime = 0; // Timestamp of last kill
        this.comboDecayTime = 3000; // Combo decays after 3 seconds of no kills
        this.comboMultiplier = 1.0; // Score multiplier based on combo
        
        // Image assets
        this.images = {
            player: {}, // Will hold directional ape images
            normalMob: {}, // Will hold directional normal mob images
            speedMob: {}, // Will hold directional speed mob images
            bigMob: {}, // Will hold directional big mob images
            enemy: null, // Fallback enemy image (for fallback only)
            bullet: null, // Bullet sprite
            boss: null, // Boss sprite
            bossBullet: null, // Boss projectile sprite
            background: null // Game background image
        };
        this.imagesLoaded = false;
        
        // Load images
        this.loadImages();
        
        // Camera (orbital view)
        this.camera = {
            x: 0,
            y: 0,
            zoom: 2.0, // Start zoomed in at 200% (much closer)
            targetZoom: 2.0, // Target zoom for smooth transitions
            shake: { intensity: 0, duration: 0, currentTime: 0 },
            flash: { intensity: 0, duration: 0, currentTime: 0, color: '#ffffff' }
        };
        
        // Player
        this.player = {
            x: 0,
            y: 0,
            radius: 15,
            health: 20, // Default health (will be set by setPlayerHealth)
            maxHealth: 20, // Default max health (will be set by setPlayerHealth)
            speed: 3,
            rotation: 0,
            color: '#00ff00',
            hitFlash: 0,
            vx: 0, // Velocity for prediction
            vy: 0,
            lastX: 0,
            lastY: 0,
            // Dash mechanic
            isDashing: false,
            dashCooldown: 0,
            dashCooldownTime: 5000, // 5 seconds cooldown
            dashDuration: 200, // 200ms dash duration
            dashTimeRemaining: 0,
            dashSpeed: 12, // Dash speed multiplier
            dashTrail: [] // Trail particles for visual effect
        };
        
        // Weapon
        this.weapon = {
            damage: 10,
            fireRate: 500, // milliseconds between shots
            lastShot: 0,
            bulletSpeed: 8
        };
        
        // Entities
        this.enemies = [];
        this.bullets = [];
        this.boss = null; // Boss entity
        this.bossProjectiles = []; // Boss projectiles
        this.bossSpawned = false; // Track if boss has been spawned
        this.zoomBeforeBoss = null; // Store zoom level before boss spawns
        
        // Power-ups system
        this.powerUps = []; // Array of active power-up items on field
        this.activeEffects = {
            speed: { count: 0, multiplier: 1.0, timers: [] },
            damage: { count: 0, multiplier: 1.0, timers: [] },
            fireRate: { count: 0, multiplier: 1.0, timers: [] },
            shield: { count: 0, active: false, timers: [] }
        };
        this.powerUpDuration = 10000; // 10 seconds in milliseconds
        this.goldMultiplierActive = false;
        this.goldMultiplierTimer = 0; // Timer for gold multiplier (in milliseconds)
        this.goldMultiplierDuration = 10000; // 10 seconds duration
        this.powerUpSpawnRateBonus = 0.0; // Bonus added to power-up spawn rate (upgradeable, 0.05% per level)
        
        // Gold pickups system
        this.goldPickups = []; // Array of collectible gold items
        this.goldMagnetRange = 100; // Range at which gold starts magnetizing (will be set by upgrade)
        this.pickupRange = 100; // Pickup range for gold and power-ups (set by upgrade)
        this.goldMagnetSpeed = 0.15; // Speed at which gold moves toward player
        
        // Visual effects
        this.particles = [];
        this.damageNumbers = [];
        this.maxParticles = 300; // Performance limit
        this.maxDamageNumbers = 30; // Performance limit
        
        // Performance optimizations
        this.viewportMargin = 200; // Extra margin for culling
        this.cachedMath = {
            PI2: Math.PI * 2,
            PI_4: Math.PI / 4,
            PI_8: Math.PI / 8
        };
        
        // Cache frequently accessed values
        this.cachedViewport = {
            width: 0,
            height: 0,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            zoom: 0,
            needsUpdate: true
        };
        
        // Cache background dimensions
        this.cachedBgDimensions = {
            width: 0,
            height: 0,
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0,
            loaded: false
        };
        
        // Bind gameLoop to avoid creating new function each frame
        this.gameLoopBound = this.gameLoop.bind(this);
        
        // Spawning
        this.lastSpawn = 0;
        this.spawnInterval = 1000; // 1 second (faster initial spawn)
        this.maxEnemies = 100; // Increased to allow scaling
        
        // Input
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false };
        
        // Setup event listeners
        this.setupInput();
        
        // Start game loop
        this.lastFrame = performance.now();
        this.gameLoop();
    }
    
    getCharacterBaseStats(characterType) {
        switch(characterType) {
            case 1: // Pistol
                return { fireRate: 300, speed: 3, bulletSpeed: 8, minFireRate: 50 };
            case 2: // Shotgun
                return { fireRate: 600, speed: 3, bulletSpeed: 8, minFireRate: 200 };
            case 3: // Sniper
                return { fireRate: 900, speed: 2.0, bulletSpeed: 8, minFireRate: 300 };
            default:
                return { fireRate: 300, speed: 3, bulletSpeed: 8, minFireRate: 50 };
        }
    }
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Ensure transparency is preserved
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }
    
    loadImages() {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        let loadedCount = 0;
        const totalImages = directions.length * 4 + 5; // 8 player directions + 8 normal mob directions + 8 speed mob directions + 8 big mob directions + 1 enemy fallback + 1 bullet + 1 boss + 1 boss bullet + 1 background
        
        const checkAllLoaded = () => {
            loadedCount++;
            if (loadedCount === totalImages) {
                this.imagesLoaded = true;
            }
        };
        
        // Load player directional images (now PNG with transparency)
        directions.forEach(dir => {
            const img = new Image();
            img.onload = checkAllLoaded;
            img.onerror = () => {
                console.warn(`Failed to load player image: ape-${dir}.png`);
                checkAllLoaded(); // Still count as loaded to not block game
            };
            img.src = `/game-jpegs/ape-${dir}.png`;
            this.images.player[dir] = img;
        });
        
        // Load normal mob directional images
        directions.forEach(dir => {
            const img = new Image();
            img.onload = checkAllLoaded;
            img.onerror = () => {
                console.warn(`Failed to load normal mob image: normalmob-${dir}.png`);
                checkAllLoaded();
            };
            img.src = `/game-jpegs/normalmob-${dir}.png`;
            this.images.normalMob[dir] = img;
        });
        
        // Load speed mob directional images
        directions.forEach(dir => {
            const img = new Image();
            img.onload = checkAllLoaded;
            img.onerror = () => {
                console.warn(`Failed to load speed mob image: speedmob_${dir}.png`);
                checkAllLoaded();
            };
            img.src = `/game-jpegs/speedmob_${dir}.png`;
            this.images.speedMob[dir] = img;
        });
        
        // Load big mob directional images
        directions.forEach(dir => {
            const img = new Image();
            img.onload = checkAllLoaded;
            img.onerror = () => {
                console.warn(`Failed to load big mob image: bigmob_${dir}.png`);
                checkAllLoaded();
            };
            img.src = `/game-jpegs/bigmob_${dir}.png`;
            this.images.bigMob[dir] = img;
        });
        
        // Load enemy fallback image (for fallback only)
        const enemyImg = new Image();
        enemyImg.onload = checkAllLoaded;
        enemyImg.onerror = () => {
            console.warn('Failed to load enemy fallback image, using fallback');
            checkAllLoaded();
        };
        enemyImg.src = '/pfp_apes/tg_1.png';
        this.images.enemy = enemyImg;
        
        // Load bullet sprite
        const bulletImg = new Image();
        bulletImg.onload = checkAllLoaded;
        bulletImg.onerror = () => {
            console.warn('Failed to load bullet sprite, using fallback');
            checkAllLoaded();
        };
        bulletImg.src = '/game-jpegs/bullet_sprite.png';
        this.images.bullet = bulletImg;
        
        // Load boss sprite
        const bossImg = new Image();
        bossImg.onload = checkAllLoaded;
        bossImg.onerror = () => {
            console.warn('Failed to load boss sprite, using fallback');
            checkAllLoaded();
        };
        bossImg.src = '/game-jpegs/mobboss-1.png';
        this.images.boss = bossImg;
        
        // Load boss bullet sprite
        const bossBulletImg = new Image();
        bossBulletImg.onload = checkAllLoaded;
        bossBulletImg.onerror = () => {
            console.warn('Failed to load boss bullet sprite, using fallback');
            checkAllLoaded();
        };
        bossBulletImg.src = '/game-jpegs/mobboss-bullets.png';
        this.images.bossBullet = bossBulletImg;
        
        // Load background image
        const bgImg = new Image();
        bgImg.onload = checkAllLoaded;
        bgImg.onerror = () => {
            console.warn('Failed to load background image, using fallback color');
            checkAllLoaded();
        };
        bgImg.src = '/game-jpegs/background_game.png';
        this.images.background = bgImg;
    }
    
    getPlayerDirection() {
        // Convert rotation angle to direction (optimized with cached values)
        const angle = this.player.rotation;
        const normalized = ((angle % this.cachedMath.PI2) + this.cachedMath.PI2) % this.cachedMath.PI2;
        
        // Map angle to 8 directions
        const sector = Math.floor((normalized + this.cachedMath.PI_8) / (this.cachedMath.PI_4)) % 8;
        const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
        return directions[sector];
    }
    
    getEnemyDirection(enemy) {
        // Calculate direction from enemy to player (optimized with cached values)
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const angle = Math.atan2(dy, dx);
        const normalized = ((angle % this.cachedMath.PI2) + this.cachedMath.PI2) % this.cachedMath.PI2;
        
        // Map angle to 8 directions
        const sector = Math.floor((normalized + this.cachedMath.PI_8) / (this.cachedMath.PI_4)) % 8;
        const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
        return directions[sector];
    }
    
    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            
            // Handle ESC key for pause
            if (key === 'escape') {
                if (this.state === 'playing') {
                    this.pause();
                } else if (this.state === 'paused') {
                    this.resume();
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        
        // Mouse
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouse.down = true;
            this.shoot();
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.mouse.down = false;
        });
        
        // Touch
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.mouse.x = touch.clientX - rect.left;
            this.mouse.y = touch.clientY - rect.top;
        });
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.mouse.down = true;
            this.shoot();
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.mouse.down = false;
        });
    }
    
    update(deltaTime) {
        if (this.state !== 'playing') return; // Don't update if paused or other states
        
        // Update player movement
        this.updatePlayer(deltaTime);
        
        // Update camera to follow player, but constrain to background bounds
        let targetX = this.player.x;
        let targetY = this.player.y;
        
        // Constrain camera so viewport doesn't show outside background
        // Cache background dimensions (only calculated once when background loads)
        if (this.imagesLoaded && this.images.background && this.images.background.complete && this.images.background.naturalWidth > 0) {
            if (!this.cachedBgDimensions.loaded) {
                const bgWidth = this.images.background.naturalWidth;
                const bgHeight = this.images.background.naturalHeight;
                this.cachedBgDimensions.width = bgWidth;
                this.cachedBgDimensions.height = bgHeight;
                this.cachedBgDimensions.minX = -bgWidth / 2;
                this.cachedBgDimensions.maxX = bgWidth / 2;
                this.cachedBgDimensions.minY = -bgHeight / 2;
                this.cachedBgDimensions.maxY = bgHeight / 2;
                this.cachedBgDimensions.loaded = true;
            }
            
            // Calculate viewport size at current zoom
            const viewportWidth = this.width / this.camera.zoom;
            const viewportHeight = this.height / this.camera.zoom;
            
            // Constrain camera position so viewport stays within background
            const minX = this.cachedBgDimensions.minX + viewportWidth / 2;
            const maxX = this.cachedBgDimensions.maxX - viewportWidth / 2;
            const minY = this.cachedBgDimensions.minY + viewportHeight / 2;
            const maxY = this.cachedBgDimensions.maxY - viewportHeight / 2;
            
            // Only constrain if viewport is smaller than background
            if (viewportWidth < this.cachedBgDimensions.width) {
                targetX = Math.max(minX, Math.min(maxX, targetX));
            } else {
                // If viewport is larger than background, center it
                targetX = 0;
            }
            
            if (viewportHeight < this.cachedBgDimensions.height) {
                targetY = Math.max(minY, Math.min(maxY, targetY));
            } else {
                // If viewport is larger than background, center it
                targetY = 0;
            }
        }
        
        this.camera.x = targetX;
        this.camera.y = targetY;
        
        // Mark viewport for update (camera moved)
        this.cachedViewport.needsUpdate = true;
        
        // Update camera zoom based on enemy count (or maintain zoom if boss is active)
        if (this.boss) {
            // Keep current zoom when boss is active (don't change)
            // Don't update targetZoom, let it stay at current value
        } else {
            // After boss dies, restore the zoom level from before boss spawned
            if (this.zoomBeforeBoss !== null && this.enemies.length < 10) {
                // Restore zoom from before boss if we have few enemies (just after boss death)
                this.camera.targetZoom = this.zoomBeforeBoss;
                // Clear the stored zoom once we have enough enemies to recalculate
                if (this.enemies.length >= 10) {
                    this.zoomBeforeBoss = null;
                }
            } else if (this.enemies.length > 0) {
                // Recalculate zoom based on enemy count (normal behavior)
                const enemyRatio = Math.min(this.enemies.length / this.maxEnemies, 1);
                this.camera.targetZoom = 2.0 - (enemyRatio * 0.8); // 2.0 to 1.2 (stays zoomed in)
            }
            // If no enemies (boss just died), maintain current zoom - don't update targetZoom
        }
        
        // Smoothly interpolate zoom
        const zoomSpeed = 0.002 * deltaTime; // Smooth zoom transition
        if (this.camera.zoom < this.camera.targetZoom) {
            this.camera.zoom = Math.min(this.camera.zoom + zoomSpeed, this.camera.targetZoom);
        } else if (this.camera.zoom > this.camera.targetZoom) {
            this.camera.zoom = Math.max(this.camera.zoom - zoomSpeed, this.camera.targetZoom);
        }
        
        // Check combo decay
        if (this.combo > 0) {
            const currentTime = Date.now();
            if (currentTime - this.lastKillTime >= this.comboDecayTime) {
                // Combo expired
                this.combo = 0;
                this.comboMultiplier = 1.0;
            }
        }
        
        // Spawn boss if 1000 kills reached
        if (this.kills >= 1000 && !this.bossSpawned && !this.boss) {
            this.spawnBoss();
        }
        
        // Spawn enemies
        this.spawnEnemies();
        
        // Update enemies
        this.updateEnemies(deltaTime);
        
        // Update boss
        if (this.boss) {
            this.updateBoss(deltaTime);
        }
        
        // Update bullets
        this.updateBullets(deltaTime);
        
        // Update boss projectiles
        this.updateBossProjectiles(deltaTime);
        
        // Update visual effects
        this.updateParticles(deltaTime);
        this.updateDamageNumbers(deltaTime);
        this.updateScreenShake(deltaTime);
        this.updateScreenFlash(deltaTime);
        
        // Update hit flash timers
        if (this.player.hitFlash > 0) {
            this.player.hitFlash -= deltaTime;
            if (this.player.hitFlash < 0) this.player.hitFlash = 0;
        }
        if (this.boss && this.boss.hitFlash > 0) {
            this.boss.hitFlash -= deltaTime;
            if (this.boss.hitFlash < 0) this.boss.hitFlash = 0;
        }
        
        // Update power-ups and active effects
        this.updatePowerUps(deltaTime);
        this.updateActiveEffects(deltaTime);
        
        // Update gold pickups
        this.updateGoldPickups(deltaTime);
        
        // Check collisions
        this.checkCollisions();
        
        // Auto-shoot if mouse is held
        if (this.mouse.down) {
            this.shoot();
        }
    }
    
    updatePlayer(deltaTime) {
        // Update dash cooldown
        if (this.player.dashCooldown > 0) {
            this.player.dashCooldown -= deltaTime;
            if (this.player.dashCooldown < 0) this.player.dashCooldown = 0;
        }
        
        // Update dash duration
        if (this.player.isDashing) {
            this.player.dashTimeRemaining -= deltaTime;
            if (this.player.dashTimeRemaining <= 0) {
                this.player.isDashing = false;
                this.player.dashTimeRemaining = 0;
            }
        }
        
        // Check for dash input (spacebar)
        if ((this.keys[' '] || this.keys['space']) && !this.player.isDashing && this.player.dashCooldown <= 0) {
            this.player.isDashing = true;
            this.player.dashTimeRemaining = this.player.dashDuration;
            this.player.dashCooldown = this.player.dashCooldownTime;
            this.addScreenShake(0.2, 100);
            // Clear dash trail
            this.player.dashTrail = [];
        }
        
        let dx = 0;
        let dy = 0;
        
        // Movement input
        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;
        
        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }
        
        // Apply movement (frame-rate independent: deltaTime is in ms, normalize to ~16.67ms for 60fps)
        const timeFactor = deltaTime / 16.67;
        
        // Apply speed boost if active (unless dashing - dash uses fixed speed)
        const speedMultiplier = this.player.isDashing ? this.player.dashSpeed : (this.activeEffects.speed.multiplier || 1.0);
        const effectiveSpeed = this.player.speed * speedMultiplier;
        
        // If no movement input but dashing, dash in last movement direction or toward mouse
        if (this.player.isDashing && dx === 0 && dy === 0) {
            // Dash in direction of mouse
            const screenX = this.mouse.x - this.width / 2;
            const screenY = this.mouse.y - this.height / 2;
            const worldX = (screenX / this.camera.zoom) + this.camera.x;
            const worldY = (screenY / this.camera.zoom) + this.camera.y;
            const mouseDx = worldX - this.player.x;
            const mouseDy = worldY - this.player.y;
            const dist = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
            if (dist > 0.01) {
                dx = mouseDx / dist;
                dy = mouseDy / dist;
            } else {
                // Fallback: dash in last movement direction
                dx = this.player.lastX !== 0 ? (this.player.lastX > 0 ? 1 : -1) : 1;
                dy = this.player.lastY !== 0 ? (this.player.lastY > 0 ? 1 : -1) : 0;
            }
        }
        
        // Calculate velocity for boss prediction (before constraints)
        this.player.vx = dx * effectiveSpeed;
        this.player.vy = dy * effectiveSpeed;
        
        // Add dash trail particles
        if (this.player.isDashing) {
            if (this.player.dashTrail.length >= 10) {
                this.player.dashTrail.shift();
            }
            this.player.dashTrail.push({ x: this.player.x, y: this.player.y });
        } else {
            // Fade trail when not dashing
            if (this.player.dashTrail.length > 0) {
                this.player.dashTrail.shift();
            }
        }
        
        let newX = this.player.x + dx * effectiveSpeed * timeFactor;
        let newY = this.player.y + dy * effectiveSpeed * timeFactor;
        
        // Constrain player within background boundaries
        if (this.imagesLoaded && this.images.background && this.images.background.complete && this.images.background.naturalWidth > 0) {
            const bgWidth = this.images.background.naturalWidth;
            const bgHeight = this.images.background.naturalHeight;
            
            // Background is centered at (0, 0), so boundaries are half the size
            const minX = -bgWidth / 2 + this.player.radius;
            const maxX = bgWidth / 2 - this.player.radius;
            const minY = -bgHeight / 2 + this.player.radius;
            const maxY = bgHeight / 2 - this.player.radius;
            
            // Clamp position to boundaries
            newX = Math.max(minX, Math.min(maxX, newX));
            newY = Math.max(minY, Math.min(maxY, newY));
        }
        
        // Store last position for velocity smoothing
        this.player.lastX = this.player.x;
        this.player.lastY = this.player.y;
        
        this.player.x = newX;
        this.player.y = newY;
        
        // Rotate player toward mouse (convert screen to world coordinates)
        const screenX = this.mouse.x - this.width / 2;
        const screenY = this.mouse.y - this.height / 2;
        
        // Convert screen space to world space (accounting for zoom)
        const worldX = (screenX / this.camera.zoom) + this.camera.x;
        const worldY = (screenY / this.camera.zoom) + this.camera.y;
        
        // Calculate direction from player to world mouse position
        const mouseDx = worldX - this.player.x;
        const mouseDy = worldY - this.player.y;
        this.player.rotation = Math.atan2(mouseDy, mouseDx);
    }
    
    getDifficultyMultiplier() {
        // Optimized round-based difficulty: softer scaling to prevent exponential explosion
        // Uses tiered multipliers for more balanced progression
        const round = this.round;
        
        if (round === 1) {
            return 1.0;
        } else if (round <= 5) {
            // Early rounds: 1.3x per round (moderate growth)
            return Math.pow(1.3, round - 1);
        } else if (round <= 10) {
            // Mid rounds: 1.25x per round (slower growth)
            const earlyMultiplier = Math.pow(1.3, 4); // Multiplier at round 5
            return earlyMultiplier * Math.pow(1.25, round - 5);
        } else {
            // Late rounds: 1.2x per round (much slower growth)
            const earlyMultiplier = Math.pow(1.3, 4); // Multiplier at round 5
            const midMultiplier = earlyMultiplier * Math.pow(1.25, 5); // Multiplier at round 10
            return midMultiplier * Math.pow(1.2, round - 10);
        }
    }
    
    getBossDifficultyMultiplier() {
        // Boss gets same optimized scaling as mobs
        return this.getDifficultyMultiplier();
    }
    
    spawnEnemies(count = 1) {
        // Don't spawn enemies if boss is active
        if (this.boss) return;
        
        const now = Date.now();
        if (count === 1) {
            // Regular timed spawning
            if (now - this.lastSpawn < this.spawnInterval) return;
            if (this.enemies.length >= this.maxEnemies) return;
            this.lastSpawn = now;
        }
        
        // Spawn 'count' number of enemies
        for (let i = 0; i < count; i++) {
            if (this.enemies.length >= this.maxEnemies) break;
            
            // Spawn from random edge
            const edge = Math.floor(Math.random() * 4);
            let x, y;
            const spawnDistance = Math.max(this.width, this.height) * 0.6;
            
            switch (edge) {
                case 0: // Top
                    x = this.player.x + (Math.random() - 0.5) * spawnDistance;
                    y = this.player.y - spawnDistance;
                    break;
                case 1: // Right
                    x = this.player.x + spawnDistance;
                    y = this.player.y + (Math.random() - 0.5) * spawnDistance;
                    break;
                case 2: // Bottom
                    x = this.player.x + (Math.random() - 0.5) * spawnDistance;
                    y = this.player.y + spawnDistance;
                    break;
                case 3: // Left
                    x = this.player.x - spawnDistance;
                    y = this.player.y + (Math.random() - 0.5) * spawnDistance;
                    break;
            }
            
            // Get round-based difficulty multiplier
            const roundMultiplier = this.getDifficultyMultiplier();
            
            // Determine enemy type: 60% normal, 25% fast, 15% big
            const rand = Math.random();
            let enemyType = 'normal';
            let baseSpeed = 1.5;
            let health = 10; // Base health values
            let radius = 15; // Increased from 12 by 25% (12 * 1.25 = 15)
            let baseDamage = 5; // Base damage when hitting player
            let goldReward = 1;
            
            if (rand < 0.15) {
                // Big enemy (15% chance)
                enemyType = 'big';
                baseSpeed = 1.0; // Slower than normal
                health = 30;
                radius = 23; // Increased from 18 by 25% (18 * 1.25 = 22.5, rounded to 23)
                baseDamage = 8; // Big enemies hit harder
                goldReward = 5;
            } else if (rand < 0.40) {
                // Fast enemy (25% chance)
                enemyType = 'fast';
                baseSpeed = 1.5 * 1.5; // 1.5x faster
                health = 5;
                radius = 19; // Increased from 15 by 25% (15 * 1.25 = 18.75, rounded to 19)
                baseDamage = 4; // Fast enemies hit slightly less
                goldReward = 2;
            } else {
                // Normal enemy (60% chance)
                enemyType = 'normal';
                baseSpeed = 1.5;
                health = 10;
                radius = 15; // Increased from 12 by 25% (12 * 1.25 = 15)
                baseDamage = 5;
                goldReward = 1;
            }
            
            // Calculate initial rotation toward player
            const dx = this.player.x - x;
            const dy = this.player.y - y;
            const rotation = Math.atan2(dy, dx);
            
            // Apply round multiplier to multiple stats (optimized scaling)
            // Health: full multiplier
            // Damage: 70% of multiplier (softer scaling)
            // Size: 30% of multiplier (minimal size increase)
            // Speed: 20% of multiplier (slight speed increase)
            const healthMultiplier = roundMultiplier;
            const damageMultiplier = 1.0 + (roundMultiplier - 1.0) * 0.7; // 70% scaling
            const sizeMultiplier = 1.0 + (roundMultiplier - 1.0) * 0.3; // 30% scaling
            const speedMultiplier = 1.0 + (roundMultiplier - 1.0) * 0.2; // 20% scaling
            
            this.enemies.push({
                x: x,
                y: y,
                radius: radius * sizeMultiplier, // Slight size increase
                speed: baseSpeed * speedMultiplier, // Slight speed increase
                health: health * healthMultiplier, // Full health scaling
                maxHealth: health * healthMultiplier,
                damage: baseDamage * damageMultiplier, // Damage scaling
                rotation: rotation, // Track rotation for directional sprites
                color: enemyType === 'big' ? '#8b0000' : (enemyType === 'fast' ? '#ff6600' : '#ff0000'),
                enemyType: enemyType,
                goldReward: goldReward
            });
        }
    }
    
    updateEnemies(deltaTime) {
        const timeFactor = deltaTime / 16.67;
        const playerRadius = this.player.radius;
        const playerX = this.player.x;
        const playerY = this.player.y;
        
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            // Calculate desired movement toward player (use squared distance for optimization)
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const distSq = dx * dx + dy * dy;
            
            let moveX = 0;
            let moveY = 0;
            
            if (distSq > 0.01) { // Avoid division by zero
                const dist = Math.sqrt(distSq);
                moveX = (dx / dist) * enemy.speed * timeFactor;
                moveY = (dy / dist) * enemy.speed * timeFactor;
                
                // Update enemy rotation toward player
                enemy.rotation = Math.atan2(dy, dx);
            }
            
            // Check collision with other enemies before moving (optimized with squared distance)
            const newX = enemy.x + moveX;
            const newY = enemy.y + moveY;
            const enemyRadius = enemy.radius;
            
            // Only check nearby enemies (spatial optimization)
            const checkRadius = enemyRadius * 4;
            const checkRadiusSq = checkRadius * checkRadius;
            
            // Only check enemies in viewport for collision (further optimization)
            for (let j = 0; j < this.enemies.length; j++) {
                if (i === j) continue;
                
                const other = this.enemies[j];
                
                // Early exit if other enemy is far away
                const otherDx = newX - other.x;
                const otherDy = newY - other.y;
                const otherDistSq = otherDx * otherDx + otherDy * otherDy;
                
                if (otherDistSq > checkRadiusSq) continue;
                
                const minDist = enemyRadius + other.radius;
                const minDistSqCheck = minDist * minDist;
                
                if (otherDistSq < minDistSqCheck && otherDistSq > 0.01) {
                    // Collision detected - push away from other enemy
                    const otherDist = Math.sqrt(otherDistSq);
                    const invDist = 1 / otherDist;
                    const pushAmount = (minDist - otherDist) * 0.5;
                    moveX += otherDx * invDist * pushAmount;
                    moveY += otherDy * invDist * pushAmount;
                }
            }
            
            // Apply movement
            enemy.x += moveX;
            enemy.y += moveY;
            
            // Check collision with player (use squared distance)
            const playerDistSq = distSq;
            const collisionDistSq = (enemy.radius + playerRadius) ** 2;
            
            if (playerDistSq < collisionDistSq) {
                // Enemy hit player - but ignore damage if dashing (invincibility frames)
                let damage = 0;
                if (!this.player.isDashing) {
                    // Enemy hit player - use enemy's damage value (scales with rounds)
                    damage = enemy.damage || 5; // Fallback to 5 if damage not set
                    
                    // Apply shield effect if active (50% damage reduction)
                    if (this.activeEffects.shield.active) {
                        damage = Math.ceil(damage * 0.5);
                    }
                    
                    this.player.health -= damage;
                    this.player.hitFlash = 150; // Flash on hit
                    
                    // Screen shake on damage
                    this.addScreenShake(0.5, 200);
                    
                    // Spawn hit particles
                    this.spawnParticles(this.player.x, this.player.y, 15, 'blood'); // Increased count for better visibility
                    
                    // Spawn damage number
                    this.spawnDamageNumber(this.player.x, this.player.y - this.player.radius, damage, false);
                    
                    if (this.player.health <= 0) {
                        this.player.health = 0;
                        this.die();
                    }
                }
                // Still remove enemy on contact (even if dashing through)
                this.enemies.splice(i, 1);
            }
        }
    }
    
    spawnBoss() {
        // Store current zoom level before boss spawns
        this.zoomBeforeBoss = this.camera.zoom;
        
        // Clear all existing enemies when boss spawns
        this.enemies = [];
        
        // Spawn boss at center of background
        const bossMultiplier = this.getBossDifficultyMultiplier();
        
        // Calculate round-based attack speed and projectile speed multipliers
        let baseCooldown = 1200;
        let attackSpeedMultiplier = 1.0;
        let projectileSpeedMultiplier = 1.0;
        
        if (this.round <= 2) {
            baseCooldown = 1200;
            projectileSpeedMultiplier = 1.0;
        } else if (this.round <= 5) {
            baseCooldown = 1000;
            projectileSpeedMultiplier = 1.15;
        } else if (this.round <= 9) {
            baseCooldown = 800;
            projectileSpeedMultiplier = 1.30;
        } else {
            baseCooldown = 600;
            projectileSpeedMultiplier = 1.50;
        }
        
        // Determine movement type based on round
        let movementType = 'stationary';
        if (this.round >= 10) {
            movementType = 'follow';
        } else if (this.round >= 7) {
            movementType = 'charge';
        } else if (this.round >= 5) {
            movementType = 'teleport';
        } else if (this.round >= 3) {
            movementType = 'circle';
        }
        
        // Determine unlocked attacks based on round
        // 0=Direct, 1=Spread, 2=Spiral, 3=Ring, 4=Wave, 5=Cross, 6=Homing, 7=Laser, 8=Minefield
        const unlockedAttacks = [0, 1, 2, 3]; // Base attacks: Direct, Spread, Spiral, Ring
        if (this.round >= 12) unlockedAttacks.push(8); // Minefield
        if (this.round >= 10) unlockedAttacks.push(7); // Laser
        if (this.round >= 7) unlockedAttacks.push(6); // Homing
        if (this.round >= 5) unlockedAttacks.push(5); // Cross
        if (this.round >= 3) unlockedAttacks.push(4); // Wave
        
        this.boss = {
            x: 0,
            y: 0,
            radius: 60 * bossMultiplier, // Increased from 40 by 50% (40 * 1.5 = 60)
            health: 20000 * bossMultiplier,
            maxHealth: 20000 * bossMultiplier,
            speed: 0,
            vx: 0,
            vy: 0,
            rotation: 0,
            lastAttack: Date.now(),
            attackCooldown: baseCooldown,
            attackPattern: 0,
            attackTimer: 0,
            color: '#ff0000',
            hitFlash: 0,
            damageMultiplier: bossMultiplier,
            phase: 'normal', // 'normal', 'enraged', 'desperate', 'finalStand'
            movementType: movementType,
            movementTimer: 0,
            movementAngle: 0,
            teleportTimer: 0,
            chargeTimer: 0,
            minionSpawnTimer: 0,
            minionSpawnCooldown: this.round >= 10 ? 3000 : (this.round >= 7 ? 5000 : (this.round >= 4 ? 7000 : 999999)),
            unlockedAttacks: unlockedAttacks,
            attackSpeedMultiplier: attackSpeedMultiplier,
            projectileSpeedMultiplier: projectileSpeedMultiplier,
            lastTeleport: Date.now(),
            chargeCooldown: 5000
        };
        
        this.bossSpawned = true;
        
        // Screen shake on boss spawn
        this.addScreenShake(1.0, 500);
    }
    
    updateBoss(deltaTime) {
        if (!this.boss) return;
        
        // Check if boss is dead first, before doing anything else
        if (this.boss.health <= 0) {
            // Boss defeated - spawn gold pickups around boss
            const goldReward = 50;
            const bossGoldPickupCount = 5 + Math.floor(Math.random() * 5); // 5-9 gold pickups
            const bossX = this.boss.x;
            const bossY = this.boss.y;
            
            for (let i = 0; i < bossGoldPickupCount; i++) {
                const angle = (i * Math.PI * 2 / bossGoldPickupCount) + Math.random() * 0.5;
                const distance = 30 + Math.random() * 40;
                const spawnX = bossX + Math.cos(angle) * distance;
                const spawnY = bossY + Math.sin(angle) * distance;
                this.spawnGoldPickup(spawnX, spawnY, Math.floor(goldReward / bossGoldPickupCount) + (i < goldReward % bossGoldPickupCount ? 1 : 0));
            }
            
            // Reset combo on boss death (milestone reached)
            this.combo = 0;
            this.comboMultiplier = 1.0;
            this.lastKillTime = 0;
            
            // Spawn boss death particles
            this.spawnParticles(bossX, bossY, 40, 'bossDeath');
            
            // Spawn guaranteed power-ups on boss death (1-2 power-ups)
            const bossPowerUpCount = 1 + Math.floor(Math.random() * 2);
            for (let i = 0; i < bossPowerUpCount; i++) {
                const angle = (i * Math.PI * 2 / bossPowerUpCount) + Math.random() * 0.5;
                const distance = 50 + Math.random() * 50;
                const spawnX = bossX + Math.cos(angle) * distance;
                const spawnY = bossY + Math.sin(angle) * distance;
                // Boss drops have higher chance for rare types
                const types = ['speed', 'damage', 'fireRate', 'shield', 'health', 'gold'];
                const rareTypes = ['shield', 'gold', 'damage'];
                const type = Math.random() < 0.4 ? rareTypes[Math.floor(Math.random() * rareTypes.length)] : types[Math.floor(Math.random() * types.length)];
                this.spawnPowerUp(spawnX, spawnY, type);
            }
            
            // Screen shake on boss death
            this.addScreenShake(1.5, 800);
            
            // Clear boss projectiles when boss dies
            this.bossProjectiles = [];
            this.boss = null;
            
            // Increment round and reset kills for next round
            this.round++;
            this.kills = 0; // Reset kills for the new round
            
            // Show round popup
            this.showRoundPopup(this.round);
            
            // Reset bossSpawned so boss can spawn again at 1000 kills
            this.bossSpawned = false;
            
            return;
        }
        
        // Check and update boss phase based on health
        const healthPercent = this.boss.health / this.boss.maxHealth;
        if (healthPercent <= 0.25 && this.boss.phase !== 'finalStand') {
            this.boss.phase = 'finalStand';
            this.boss.minionSpawnCooldown = 2000; // Constant minion spawning
        } else if (healthPercent <= 0.50 && this.boss.phase !== 'desperate' && this.boss.phase !== 'finalStand') {
            this.boss.phase = 'desperate';
            this.boss.minionSpawnCooldown = Math.min(this.boss.minionSpawnCooldown, 4000);
        } else if (healthPercent <= 0.75 && this.boss.phase === 'normal') {
            this.boss.phase = 'enraged';
        }
        
        // Update boss movement
        this.updateBossMovement(deltaTime);
        
        // Update minion spawning
        if (this.round >= 4) {
            this.boss.minionSpawnTimer += deltaTime;
            if (this.boss.minionSpawnTimer >= this.boss.minionSpawnCooldown) {
                this.boss.minionSpawnTimer = 0;
                this.spawnBossMinions();
            }
        }
        
        const now = Date.now();
        this.boss.attackTimer += deltaTime;
        
        // Apply phase-based attack speed multiplier
        const phaseMultiplier = this.boss.phase === 'enraged' ? 0.8 : (this.boss.phase === 'desperate' ? 0.7 : (this.boss.phase === 'finalStand' ? 0.5 : 1.0));
        const effectiveCooldown = this.boss.attackCooldown * phaseMultiplier;
        
        // Randomize attack cooldown slightly
        const randomCooldown = effectiveCooldown + (Math.random() - 0.5) * (effectiveCooldown * 0.3);
        
        // Attack with randomized timing and patterns
        if (now - this.boss.lastAttack >= randomCooldown) {
            this.boss.lastAttack = now;
            this.boss.attackTimer = 0;
            
            // Screen shake on boss attack
            this.addScreenShake(0.3, 150);
            
            // Randomly select attack pattern instead of cycling (more unpredictable)
            if (!this.boss) return;
            
            // Select from unlocked attacks
            const availableAttacks = this.boss.unlockedAttacks || [0, 1, 2, 3];
            let attackPattern;
            if (Math.random() < 0.3) {
                attackPattern = availableAttacks[Math.floor(Math.random() * availableAttacks.length)];
            } else {
                const currentIndex = availableAttacks.indexOf(this.boss.attackPattern);
                const nextIndex = (currentIndex + 1) % availableAttacks.length;
                attackPattern = availableAttacks[nextIndex];
            }
            this.boss.attackPattern = attackPattern;
            
            // Execute attack pattern
            switch (attackPattern) {
                case 0:
                    this.bossAttackDirect();
                    break;
                case 1:
                    this.bossAttackSpread();
                    break;
                case 2:
                    this.bossAttackSpiral();
                    break;
                case 3:
                    this.bossAttackRing();
                    break;
                case 4:
                    this.bossAttackWave();
                    break;
                case 5:
                    this.bossAttackCross();
                    break;
                case 6:
                    this.bossAttackHoming();
                    break;
                case 7:
                    this.bossAttackLaser();
                    break;
                case 8:
                    this.bossAttackMinefield();
                    break;
            }
            
            // Random chance (40-60%) to do a second attack immediately
            if (this.boss && Math.random() < (0.4 + Math.random() * 0.2)) {
                // 50% chance to use same pattern, 50% chance to use different pattern
                let secondPattern = attackPattern;
                if (Math.random() < 0.5) {
                    secondPattern = availableAttacks[Math.floor(Math.random() * availableAttacks.length)];
                }
                
                switch (secondPattern) {
                    case 0:
                        this.bossAttackDirect();
                        break;
                    case 1:
                        this.bossAttackSpread();
                        break;
                    case 2:
                        this.bossAttackSpiral();
                        break;
                    case 3:
                        this.bossAttackRing();
                        break;
                    case 4:
                        this.bossAttackWave();
                        break;
                    case 5:
                        this.bossAttackCross();
                        break;
                    case 6:
                        this.bossAttackHoming();
                        break;
                    case 7:
                        this.bossAttackLaser();
                        break;
                    case 8:
                        this.bossAttackMinefield();
                        break;
                }
            }
        }
    }
    
    updateBossMovement(deltaTime) {
        if (!this.boss) return;
        
        const timeFactor = deltaTime / 16.67;
        
        switch (this.boss.movementType) {
            case 'circle':
                // Move in a circle pattern
                this.boss.movementAngle += 0.02 * timeFactor;
                const circleRadius = 100;
                this.boss.x = Math.cos(this.boss.movementAngle) * circleRadius;
                this.boss.y = Math.sin(this.boss.movementAngle) * circleRadius;
                break;
                
            case 'teleport':
                // Teleport to random position every few seconds
                this.boss.teleportTimer += deltaTime;
                if (this.boss.teleportTimer >= 3000) {
                    this.boss.teleportTimer = 0;
                    const maxDistance = 200;
                    this.boss.x = (Math.random() - 0.5) * maxDistance * 2;
                    this.boss.y = (Math.random() - 0.5) * maxDistance * 2;
                    this.addScreenShake(0.5, 200);
                }
                break;
                
            case 'charge':
                // Charge toward player occasionally
                this.boss.chargeTimer += deltaTime;
                if (this.boss.chargeTimer >= this.boss.chargeCooldown) {
                    this.boss.chargeTimer = 0;
                    this.boss.chargeCooldown = 5000 + Math.random() * 3000;
                    const dx = this.player.x - this.boss.x;
                    const dy = this.player.y - this.boss.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0) {
                        this.boss.speed = 2.0;
                        this.boss.vx = (dx / dist) * this.boss.speed;
                        this.boss.vy = (dy / dist) * this.boss.speed;
                    }
                }
                // Apply charge movement
                if (this.boss.speed > 0) {
                    this.boss.x += this.boss.vx * timeFactor;
                    this.boss.y += this.boss.vy * timeFactor;
                    this.boss.speed *= 0.95; // Decelerate
                    if (this.boss.speed < 0.1) {
                        this.boss.speed = 0;
                    }
                }
                break;
                
            case 'follow':
                // Follow player at slow speed
                const followSpeed = 0.5 * (this.boss.phase === 'desperate' ? 1.3 : (this.boss.phase === 'finalStand' ? 1.5 : 1.0));
                const followDx = this.player.x - this.boss.x;
                const followDy = this.player.y - this.boss.y;
                const followDist = Math.sqrt(followDx * followDx + followDy * followDy);
                if (followDist > 50) { // Don't get too close
                    const moveX = (followDx / followDist) * followSpeed * timeFactor;
                    const moveY = (followDy / followDist) * followSpeed * timeFactor;
                    this.boss.x += moveX;
                    this.boss.y += moveY;
                }
                break;
        }
    }
    
    spawnBossMinions() {
        if (!this.boss) return;
        
        let minionCount = 2;
        if (this.round >= 10) {
            minionCount = 5 + Math.floor(Math.random() * 4); // 5-8 minions
        } else if (this.round >= 7) {
            minionCount = 3 + Math.floor(Math.random() * 3); // 3-5 minions
        } else if (this.round >= 4) {
            minionCount = 2 + Math.floor(Math.random() * 2); // 2-3 minions
        }
        
        const spawnDistance = 150;
        for (let i = 0; i < minionCount; i++) {
            const angle = (i * Math.PI * 2 / minionCount) + Math.random() * 0.5;
            const x = this.boss.x + Math.cos(angle) * spawnDistance;
            const y = this.boss.y + Math.sin(angle) * spawnDistance;
            
            // Determine minion type based on round
            let enemyType = 'normal';
            if (this.round >= 10 && Math.random() < 0.3) {
                enemyType = 'big';
            } else if (this.round >= 7 && Math.random() < 0.4) {
                enemyType = 'fast';
            }
            
            const roundMultiplier = this.getDifficultyMultiplier();
            let health = 10;
            let radius = 15; // Increased from 12 by 25% (12 * 1.25 = 15)
            let baseSpeed = 1.5;
            let baseDamage = 5;
            
            if (enemyType === 'big') {
                health = 30;
                radius = 23; // Increased from 18 by 25% (18 * 1.25 = 22.5, rounded to 23)
                baseSpeed = 1.0;
                baseDamage = 8;
            } else if (enemyType === 'fast') {
                health = 5;
                radius = 19; // Increased from 15 by 25% (15 * 1.25 = 18.75, rounded to 19)
                baseSpeed = 1.5 * 1.5;
                baseDamage = 4;
            }
            
            const healthMultiplier = roundMultiplier;
            const damageMultiplier = 1.0 + (roundMultiplier - 1.0) * 0.7;
            const sizeMultiplier = 1.0 + (roundMultiplier - 1.0) * 0.3;
            const speedMultiplier = 1.0 + (roundMultiplier - 1.0) * 0.2;
            
            const dx = this.player.x - x;
            const dy = this.player.y - y;
            const rotation = Math.atan2(dy, dx);
            
            this.enemies.push({
                x: x,
                y: y,
                radius: radius * sizeMultiplier,
                speed: baseSpeed * speedMultiplier,
                health: health * healthMultiplier,
                maxHealth: health * healthMultiplier,
                damage: baseDamage * damageMultiplier,
                rotation: rotation,
                color: enemyType === 'big' ? '#8b0000' : (enemyType === 'fast' ? '#ff6600' : '#ff0000'),
                enemyType: enemyType,
                goldReward: enemyType === 'big' ? 5 : (enemyType === 'fast' ? 2 : 1)
            });
        }
    }
    
    bossAttackDirect() {
        // Direct shot at player with prediction (aims ahead of player)
        if (!this.boss) return;
        
        // Round-based projectile count
        let projectileCount = 1;
        if (this.round >= 6) {
            projectileCount = 3 + Math.floor((this.round - 6) / 3); // 3-4 projectiles
        } else if (this.round >= 3) {
            projectileCount = 2; // 2-3 projectiles
        }
        
        const baseSpeed = 4.5 * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 15 * (this.boss.damageMultiplier || 1);
        
        // Calculate predicted position based on player velocity
        const predictTime = 0.3 + Math.random() * 0.4;
        const predictedX = this.player.x + this.player.vx * predictTime;
        const predictedY = this.player.y + this.player.vy * predictTime;
        
        // 70% chance to aim at predicted position, 30% chance to aim at current position
        const targetX = Math.random() < 0.7 ? predictedX : this.player.x;
        const targetY = Math.random() < 0.7 ? predictedY : this.player.y;
        
        const dx = targetX - this.boss.x;
        const dy = targetY - this.boss.y;
        const baseAngle = Math.atan2(dy, dx);
        
        // Fire multiple projectiles with slight spread if round >= 3
        for (let i = 0; i < projectileCount; i++) {
            const spread = projectileCount > 1 ? (i - (projectileCount - 1) / 2) * 0.15 : 0;
            const angle = baseAngle + spread;
            
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * baseSpeed,
                vy: Math.sin(angle) * baseSpeed,
                radius: 10,
                damage: damage,
                color: '#ff0000'
            });
        }
    }
    
    bossAttackSpread() {
        // Spread shot - projectiles in a cone with prediction
        if (!this.boss) return;
        
        // Round-based projectile count
        let projectileCount = 7;
        if (this.round >= 6) {
            projectileCount = 12 + Math.floor((this.round - 6) * 0.75); // 12-15 projectiles
        } else if (this.round >= 3) {
            projectileCount = 9 + Math.floor((this.round - 3) * 0.5); // 9-11 projectiles
        }
        
        // Calculate predicted position
        const predictTime = 0.2 + Math.random() * 0.3;
        const predictedX = this.player.x + this.player.vx * predictTime;
        const predictedY = this.player.y + this.player.vy * predictTime;
        
        // 60% chance to aim at predicted position
        const targetX = Math.random() < 0.6 ? predictedX : this.player.x;
        const targetY = Math.random() < 0.6 ? predictedY : this.player.y;
        
        const dx = targetX - this.boss.x;
        const dy = targetY - this.boss.y;
        const baseAngle = Math.atan2(dy, dx);
        
        // Tighter spread at higher rounds
        const baseSpread = this.round >= 6 ? Math.PI / 6 : (this.round >= 3 ? Math.PI / 5 : Math.PI / 5);
        const spread = baseSpread + Math.random() * 0.2;
        
        const baseSpeed = (4.0 + Math.random() * 1.0) * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 12 * (this.boss.damageMultiplier || 1);
        
        for (let i = 0; i < projectileCount; i++) {
            const angle = baseAngle + (i - (projectileCount - 1) / 2) * (spread / (projectileCount - 1));
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * baseSpeed,
                vy: Math.sin(angle) * baseSpeed,
                radius: 7.5,
                damage: damage,
                color: '#ff6600'
            });
        }
    }
    
    bossAttackSpiral() {
        // Spiral attack - multiple projectiles in a spiral pattern
        if (!this.boss) return;
        
        // Round-based projectile count
        let spiralCount = 12;
        if (this.round >= 6) {
            spiralCount = 24; // Multiple spirals at high rounds
        } else if (this.round >= 3) {
            spiralCount = 16 + Math.floor((this.round - 3) * 1.33); // 16-20 projectiles
        }
        
        // Use a rotating base angle that changes each time this attack is called
        const timeBasedAngle = (Date.now() / 50) % (Math.PI * 2);
        const baseSpeed = 3.75 * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 10 * (this.boss.damageMultiplier || 1);
        
        // At round 6+, create multiple spirals
        if (this.round >= 6) {
            const spiralOffset = Math.PI / 12; // Offset between spirals
            for (let spiral = 0; spiral < 2; spiral++) {
                const spiralAngle = timeBasedAngle + (spiral * spiralOffset);
                for (let i = 0; i < spiralCount / 2; i++) {
                    const angle = spiralAngle + (i * Math.PI * 2 / (spiralCount / 2));
                    this.bossProjectiles.push({
                        x: this.boss.x,
                        y: this.boss.y,
                        vx: Math.cos(angle) * baseSpeed,
                        vy: Math.sin(angle) * baseSpeed,
                        radius: 8.75,
                        damage: damage,
                        color: '#ff00ff'
                    });
                }
            }
        } else {
            for (let i = 0; i < spiralCount; i++) {
                const angle = timeBasedAngle + (i * Math.PI * 2 / spiralCount);
                this.bossProjectiles.push({
                    x: this.boss.x,
                    y: this.boss.y,
                    vx: Math.cos(angle) * baseSpeed,
                    vy: Math.sin(angle) * baseSpeed,
                    radius: 8.75,
                    damage: damage,
                    color: '#ff00ff'
                });
            }
        }
    }
    
    bossAttackRing() {
        // Ring attack - projectiles in all directions
        if (!this.boss) return;
        
        // Round-based projectile count
        let ringCount = 16;
        if (this.round >= 6) {
            ringCount = 32; // Double ring at high rounds
        } else if (this.round >= 3) {
            ringCount = 20 + Math.floor((this.round - 3) * 1.33); // 20-24 projectiles
        }
        
        const baseSpeed = 3.75 * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 9 * (this.boss.damageMultiplier || 1);
        
        // At round 6+, create double ring (inner + outer)
        if (this.round >= 6) {
            // Inner ring
            for (let i = 0; i < ringCount / 2; i++) {
                const angle = (i * Math.PI * 2 / (ringCount / 2));
                this.bossProjectiles.push({
                    x: this.boss.x,
                    y: this.boss.y,
                    vx: Math.cos(angle) * baseSpeed * 0.8, // Slightly slower inner ring
                    vy: Math.sin(angle) * baseSpeed * 0.8,
                    radius: 7.5,
                    damage: damage,
                    color: '#00ffff'
                });
            }
            // Outer ring
            for (let i = 0; i < ringCount / 2; i++) {
                const angle = (i * Math.PI * 2 / (ringCount / 2)) + (Math.PI / (ringCount / 2)); // Offset by half
                this.bossProjectiles.push({
                    x: this.boss.x,
                    y: this.boss.y,
                    vx: Math.cos(angle) * baseSpeed,
                    vy: Math.sin(angle) * baseSpeed,
                    radius: 7.5,
                    damage: damage,
                    color: '#00ffff'
                });
            }
        } else {
            for (let i = 0; i < ringCount; i++) {
                const angle = (i * Math.PI * 2 / ringCount);
                this.bossProjectiles.push({
                    x: this.boss.x,
                    y: this.boss.y,
                    vx: Math.cos(angle) * baseSpeed,
                    vy: Math.sin(angle) * baseSpeed,
                    radius: 7.5,
                    damage: damage,
                    color: '#00ffff'
                });
            }
        }
    }
    
    bossAttackWave() {
        // Wave attack - horizontal/vertical wave of projectiles (Round 3+)
        if (!this.boss) return;
        
        const waveCount = 8 + Math.floor((this.round - 3) * 1.5); // 8-15 projectiles
        const isHorizontal = Math.random() < 0.5;
        const baseSpeed = 4.0 * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 11 * (this.boss.damageMultiplier || 1);
        
        if (isHorizontal) {
            // Horizontal wave
            const startY = this.boss.y - 100;
            const spacing = 200 / (waveCount - 1);
            for (let i = 0; i < waveCount; i++) {
                const y = startY + (i * spacing);
                const direction = this.player.x > this.boss.x ? 1 : -1;
                this.bossProjectiles.push({
                    x: this.boss.x,
                    y: y,
                    vx: direction * baseSpeed,
                    vy: 0,
                    radius: 8,
                    damage: damage,
                    color: '#00ff00'
                });
            }
        } else {
            // Vertical wave
            const startX = this.boss.x - 100;
            const spacing = 200 / (waveCount - 1);
            for (let i = 0; i < waveCount; i++) {
                const x = startX + (i * spacing);
                const direction = this.player.y > this.boss.y ? 1 : -1;
                this.bossProjectiles.push({
                    x: x,
                    y: this.boss.y,
                    vx: 0,
                    vy: direction * baseSpeed,
                    radius: 8,
                    damage: damage,
                    color: '#00ff00'
                });
            }
        }
    }
    
    bossAttackCross() {
        // Cross attack - 4 directions expanding (Round 5+)
        if (!this.boss) return;
        
        const armsPerDirection = 3 + Math.floor((this.round - 5) * 0.5); // 3-5 projectiles per arm
        const baseSpeed = 3.5 * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 10 * (this.boss.damageMultiplier || 1);
        
        const directions = [
            { vx: 0, vy: -1 },   // Up
            { vx: 1, vy: 0 },    // Right
            { vx: 0, vy: 1 },    // Down
            { vx: -1, vy: 0 }    // Left
        ];
        
        for (const dir of directions) {
            for (let i = 0; i < armsPerDirection; i++) {
                const offset = i * 15; // Spacing between projectiles
                this.bossProjectiles.push({
                    x: this.boss.x + dir.vx * offset,
                    y: this.boss.y + dir.vy * offset,
                    vx: dir.vx * baseSpeed,
                    vy: dir.vy * baseSpeed,
                    radius: 8,
                    damage: damage,
                    color: '#ffff00'
                });
            }
        }
    }
    
    bossAttackHoming() {
        // Homing attack - slow projectiles that track player (Round 7+)
        if (!this.boss) return;
        
        const homingCount = 3 + Math.floor((this.round - 7) * 0.5); // 3-5 homing projectiles
        const baseSpeed = 2.0 * (this.boss.projectileSpeedMultiplier || 1.0);
        const damage = 13 * (this.boss.damageMultiplier || 1);
        
        for (let i = 0; i < homingCount; i++) {
            const angle = (i * Math.PI * 2 / homingCount) + Math.random() * 0.5;
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * baseSpeed,
                vy: Math.sin(angle) * baseSpeed,
                radius: 9,
                damage: damage,
                color: '#ff00ff',
                isHoming: true,
                homingStrength: 0.05
            });
        }
    }
    
    bossAttackLaser() {
        // Laser attack - continuous beam (damage over time) (Round 10+)
        if (!this.boss) return;
        
        const laserCount = 1 + Math.floor((this.round - 10) / 3); // 1-2 lasers
        const damage = 8 * (this.boss.damageMultiplier || 1);
        
        for (let i = 0; i < laserCount; i++) {
            const angle = i === 0 ? Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x) : 
                         Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x) + (Math.PI / 4);
            
            // Create multiple projectiles in a line to simulate a beam
            const beamLength = 500;
            const beamSegments = 20;
            const segmentSpacing = beamLength / beamSegments;
            const speed = 6.0 * (this.boss.projectileSpeedMultiplier || 1.0);
            
            for (let j = 0; j < beamSegments; j++) {
                this.bossProjectiles.push({
                    x: this.boss.x + Math.cos(angle) * (j * segmentSpacing),
                    y: this.boss.y + Math.sin(angle) * (j * segmentSpacing),
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: 6,
                    damage: damage,
                    color: '#ff0000',
                    isLaser: true
                });
            }
        }
    }
    
    bossAttackMinefield() {
        // Minefield attack - stationary mines that explode on contact (Round 12+)
        if (!this.boss) return;
        
        const mineCount = 8 + Math.floor((this.round - 12) * 2); // 8-12 mines
        const damage = 20 * (this.boss.damageMultiplier || 1);
        const mineRadius = 200;
        
        for (let i = 0; i < mineCount; i++) {
            const angle = (i * Math.PI * 2 / mineCount) + Math.random() * 0.3;
            const distance = 80 + Math.random() * 120;
            this.bossProjectiles.push({
                x: this.boss.x + Math.cos(angle) * distance,
                y: this.boss.y + Math.sin(angle) * distance,
                vx: 0,
                vy: 0,
                radius: 12,
                damage: damage,
                color: '#ff8800',
                isMine: true,
                explosionRadius: 40,
                armed: false,
                armTimer: 0,
                armTime: 500 // Mines arm after 0.5 seconds
            });
        }
    }
    
    updateBossProjectiles(deltaTime) {
        // If no boss and no projectiles, nothing to update
        if (!this.boss && this.bossProjectiles.length === 0) {
            return;
        }
        
        for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.bossProjectiles[i];
            
            // Handle delayed projectiles (for cross attack)
            if (projectile.delay !== undefined) {
                projectile.delayTimer += deltaTime;
                if (projectile.delayTimer < projectile.delay) {
                    continue; // Skip movement until delay is over
                }
            }
            
            // Handle mine arming
            if (projectile.isMine) {
                projectile.armTimer += deltaTime;
                if (!projectile.armed && projectile.armTimer >= projectile.armTime) {
                    projectile.armed = true;
                    projectile.color = '#ff0000'; // Change color when armed
                }
                // Mines don't move, but check for player collision
                if (projectile.armed) {
                    const dx = this.player.x - projectile.x;
                    const dy = this.player.y - projectile.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < (this.player.radius + projectile.explosionRadius) ** 2) {
                        // Mine exploded - damage player (unless dashing)
                        if (!this.player.isDashing) {
                            this.player.health -= projectile.damage;
                            this.player.hitFlash = 150;
                            this.addScreenShake(0.8, 300);
                            this.spawnParticles(projectile.x, projectile.y, 20, 'hit');
                            this.spawnDamageNumber(this.player.x, this.player.y - this.player.radius, projectile.damage, false);
                            if (this.player.health <= 0) {
                                this.player.health = 0;
                                this.die();
                            }
                        }
                        this.bossProjectiles.splice(i, 1);
                        continue;
                    }
                }
                // Mines stay in place, skip movement
                continue;
            }
            
            // Handle homing projectiles
            if (projectile.isHoming) {
                const dx = this.player.x - projectile.x;
                const dy = this.player.y - projectile.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.1) {
                    const angle = Math.atan2(dy, dx);
                    const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy);
                    projectile.vx = Math.cos(angle) * speed;
                    projectile.vy = Math.sin(angle) * speed;
                    // Gradually increase homing strength
                    const homingAdjust = projectile.homingStrength || 0.05;
                    projectile.vx += (dx / dist) * homingAdjust;
                    projectile.vy += (dy / dist) * homingAdjust;
                    // Normalize to maintain speed
                    const newSpeed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy);
                    if (newSpeed > 0) {
                        projectile.vx = (projectile.vx / newSpeed) * speed;
                        projectile.vy = (projectile.vy / newSpeed) * speed;
                    }
                }
            }
            
            // Move projectile (frame-rate independent)
            const timeFactor = deltaTime / 16.67;
            projectile.x += projectile.vx * timeFactor;
            projectile.y += projectile.vy * timeFactor;
            
            // Check collision with player (skip mines, they handle their own collision)
            if (!projectile.isMine) {
                const playerDx = projectile.x - this.player.x;
                const playerDy = projectile.y - this.player.y;
                const playerDistSq = playerDx * playerDx + playerDy * playerDy;
                const playerCollisionDistSq = (projectile.radius + this.player.radius) ** 2;
                
                if (playerDistSq < playerCollisionDistSq) {
                    // Player hit by projectile (unless dashing)
                    if (!this.player.isDashing) {
                        this.player.health -= projectile.damage;
                        this.player.hitFlash = 150;
                        
                        // Screen shake on damage
                        this.addScreenShake(0.5, 200);
                        
                        // Spawn hit particles
                        this.spawnParticles(this.player.x, this.player.y, 15, 'blood');
                        
                        // Spawn damage number
                        this.spawnDamageNumber(this.player.x, this.player.y - this.player.radius, projectile.damage, false);
                        
                        if (this.player.health <= 0) {
                            this.player.health = 0;
                            this.die();
                        }
                    }
                    // Remove projectile on contact (even if dashing through)
                    this.bossProjectiles.splice(i, 1);
                    continue;
                }
            }
            
            // Remove if too far from center (or boss if it exists)
            let centerX = 0;
            let centerY = 0;
            if (this.boss) {
                centerX = this.boss.x;
                centerY = this.boss.y;
            }
            
            const dist = Math.sqrt(
                (projectile.x - centerX) ** 2 + 
                (projectile.y - centerY) ** 2
            );
            
            // Remove if too far from center or if boss is dead (mines persist until exploded)
            if (!projectile.isMine && (dist > Math.max(this.width, this.height) * 1.5 || !this.boss)) {
                this.bossProjectiles.splice(i, 1);
            }
        }
    }
    
    updateBullets(deltaTime) {
        const timeFactor = deltaTime / 16.67;
        const maxDistSq = (Math.max(this.width, this.height) * 0.8) ** 2;
        const playerX = this.player.x;
        const playerY = this.player.y;
        
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            // Update trail (store last 5 positions) - only if trail exists
            if (bullet.trail) {
                bullet.trail.push({ x: bullet.x, y: bullet.y });
                if (bullet.trail.length > 5) {
                    bullet.trail.shift();
                }
            }
            
            // Move bullet (frame-rate independent)
            bullet.x += bullet.vx * timeFactor;
            bullet.y += bullet.vy * timeFactor;
            
            // Remove if too far (use squared distance)
            const dx = bullet.x - playerX;
            const dy = bullet.y - playerY;
            const distSq = dx * dx + dy * dy;
            
            if (distSq > maxDistSq) {
                this.bullets.splice(i, 1);
            }
        }
    }
    
    shoot() {
        const now = Date.now();
        
        // Apply fire rate boost if active
        const fireRateEffect = this.activeEffects.fireRate;
        const fireRateMultiplier = (fireRateEffect && fireRateEffect.count > 0 && fireRateEffect.timers.length > 0) ? fireRateEffect.multiplier : 1.0;
        const effectiveFireRate = this.weapon.fireRate / fireRateMultiplier; // Lower fireRate = faster shooting
        // Apply minimum fire rate cap even with boost (but allow boost to go below 50ms for noticeable effect)
        const finalFireRate = Math.max(30, effectiveFireRate); // Minimum 30ms with boost (vs 50ms without)
        
        if (now - this.weapon.lastShot < finalFireRate) return;
        
        this.weapon.lastShot = now;
        
        // Convert mouse screen coordinates to world coordinates
        // Account for camera zoom and position
        const screenX = this.mouse.x - this.width / 2;
        const screenY = this.mouse.y - this.height / 2;
        
        // Convert screen space to world space (accounting for zoom)
        const worldX = (screenX / this.camera.zoom) + this.camera.x;
        const worldY = (screenY / this.camera.zoom) + this.camera.y;
        
        // Calculate direction from player to world mouse position
        const mouseDx = worldX - this.player.x;
        const mouseDy = worldY - this.player.y;
        const angle = Math.atan2(mouseDy, mouseDx);
        
        // Apply damage boost if active
        const damageMultiplier = this.activeEffects.damage.multiplier || 1.0;
        const effectiveDamage = this.weapon.damage * damageMultiplier;
        
        // Character-specific shooting mechanics
        if (this.characterType === 2) {
            // Shotgun: 5 bullet spread in cone pattern (~30 degrees total)
            const spreadAngle = Math.PI / 6; // 30 degrees in radians
            const bulletCount = 5;
            const angleStep = spreadAngle / (bulletCount - 1);
            const startAngle = angle - spreadAngle / 2;
            
            for (let i = 0; i < bulletCount; i++) {
                const bulletAngle = startAngle + (angleStep * i);
                this.bullets.push({
                    x: this.player.x,
                    y: this.player.y,
                    vx: Math.cos(bulletAngle) * this.weapon.bulletSpeed,
                    vy: Math.sin(bulletAngle) * this.weapon.bulletSpeed,
                    radius: 4,
                    damage: effectiveDamage,
                    trail: [], // For bullet trail effect
                    pierceCount: 0 // Not piercing
                });
            }
        } else if (this.characterType === 3) {
            // Sniper: Single bullet with piercing (through 3 enemies)
            this.bullets.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * this.weapon.bulletSpeed,
                vy: Math.sin(angle) * this.weapon.bulletSpeed,
                radius: 4,
                damage: effectiveDamage,
                trail: [], // For bullet trail effect
                pierceCount: 3, // Can pierce through 3 enemies
                hitsRemaining: 3 // Track remaining pierces
            });
        } else {
            // Standard/Pistol: Single bullet
            this.bullets.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * this.weapon.bulletSpeed,
                vy: Math.sin(angle) * this.weapon.bulletSpeed,
                radius: 4,
                damage: effectiveDamage,
                trail: [], // For bullet trail effect
                pierceCount: 0 // Not piercing
            });
        }
    }
    
    checkCollisions() {
        // Bullet vs Enemy (optimized with squared distances)
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            const bulletRadius = bullet.radius;
            let bulletRemoved = false;
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                
                // Use squared distance to avoid Math.sqrt
                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const distSq = dx * dx + dy * dy;
                const minDistSq = (bulletRadius + enemy.radius) ** 2;
                
                if (distSq < minDistSq) {
                    // Hit!
                    enemy.health -= bullet.damage;
                    enemy.hitFlash = 100; // Flash on hit
                    
                    // Spawn hit particles
                    this.spawnParticles(enemy.x, enemy.y, 5, 'hit');
                    
                    // Spawn damage number
                    this.spawnDamageNumber(enemy.x, enemy.y - enemy.radius, bullet.damage, false);
                    
                    // Check if bullet should pierce (sniper character)
                    const isSniperBullet = bullet.pierceCount > 0 && bullet.hitsRemaining !== undefined;
                    
                    if (isSniperBullet && bullet.hitsRemaining > 0) {
                        // Sniper bullet: reduce hits remaining
                        bullet.hitsRemaining--;
                        if (bullet.hitsRemaining <= 0) {
                            // No more pierces left, remove bullet after this hit
                            this.bullets.splice(i, 1);
                            bulletRemoved = true;
                        }
                        // Continue to next enemy (bullet keeps going if hitsRemaining > 0)
                    } else {
                        // Standard or shotgun bullet: remove after hit
                        this.bullets.splice(i, 1);
                        bulletRemoved = true;
                    }
                    
                    if (enemy.health <= 0) {
                        // Enemy killed
                        this.kills++; // Increment kill counter
                        
                        // Update combo system
                        const currentTime = Date.now();
                        if (currentTime - this.lastKillTime < this.comboDecayTime) {
                            // Within combo window, increment combo
                            this.combo++;
                        } else {
                            // Combo expired, reset to 1
                            this.combo = 1;
                        }
                        this.lastKillTime = currentTime;
                        
                        // Update max combo
                        if (this.combo > this.maxCombo) {
                            this.maxCombo = this.combo;
                        }
                        
                        // Calculate combo multiplier (1x at 0-4, 2x at 5-9, 3x at 10-19, 5x at 20+)
                        if (this.combo >= 20) {
                            this.comboMultiplier = 5.0;
                        } else if (this.combo >= 10) {
                            this.comboMultiplier = 3.0;
                        } else if (this.combo >= 5) {
                            this.comboMultiplier = 2.0;
                        } else {
                            this.comboMultiplier = 1.0;
                        }
                        
                        // Visual feedback for combo milestones
                        if (this.combo === 5 || this.combo === 10 || this.combo === 20 || this.combo === 50) {
                            this.addScreenShake(0.3, 200);
                            this.spawnComboNotification(enemy.x, enemy.y, this.combo);
                        }
                        
                        // Reset combo on boss death (handled separately below)
                        
                        let goldReward = enemy.goldReward || 1;
                        
                        // Apply gold multiplier if active (timer-based)
                        if (this.goldMultiplierActive && this.goldMultiplierTimer > 0) {
                            goldReward *= 2;
                        }
                        
                        // Apply combo multiplier to gold and score
                        goldReward = Math.floor(goldReward * this.comboMultiplier);
                        this.score += goldReward * 10; // Score is 10x gold for display
                        
                        if (this.onEnemyKill) {
                            this.onEnemyKill(goldReward);
                        }
                        
                        // Spawn death particles (more particles with higher combo)
                        const particleCount = Math.min(30 + (this.combo * 3), 60);
                        this.spawnParticles(enemy.x, enemy.y, particleCount, 'enemyDeath');
                        
                        // Screen flash on kill (very subtle)
                        if (this.combo >= 10) {
                            // Much more subtle flash at higher combos only
                            const flashIntensity = Math.min(0.05 + (this.combo * 0.002), 0.15);
                            this.addScreenFlash(flashIntensity, 80);
                        }
                        
                        // Larger explosion effect for big enemies
                        if (enemy.enemyType === 'big') {
                            this.addScreenShake(0.4, 200);
                            this.spawnParticles(enemy.x, enemy.y, 40, 'enemyDeath');
                        }
                        
                        // Spawn gold pickup (collectible item)
                        this.spawnGoldPickup(enemy.x, enemy.y, goldReward);
                        
                        // Spawn power-up (rare chance)
                        this.trySpawnPowerUp(enemy.x, enemy.y, enemy.enemyType);
                        
                        this.enemies.splice(j, 1);
                        
                        // Spawn 1.5x enemies when one is killed (rounded up)
                        const spawnCount = Math.ceil(1 * 1.5); // 2 enemies per kill
                        this.spawnEnemies(spawnCount);
                    }
                    
                    // Break out of enemy loop if bullet was removed (standard/shotgun/sniper out of pierces)
                    // For sniper bullets with hitsRemaining > 0, continue to next enemy
                    if (bulletRemoved) {
                        break;
                    }
                    // If sniper bullet still has hits remaining, continue checking other enemies
                }
            }
            
            // Bullet vs Boss (optimized with squared distance)
            if (this.boss) {
                const dx = bullet.x - this.boss.x;
                const dy = bullet.y - this.boss.y;
                const distSq = dx * dx + dy * dy;
                const minDistSq = (bullet.radius + this.boss.radius) ** 2;
                
                if (distSq < minDistSq) {
                    // Hit boss!
                    this.boss.health -= bullet.damage;
                    this.boss.hitFlash = 100; // Flash on hit
                    this.bullets.splice(i, 1);
                    
                    // Spawn hit particles
                    this.spawnParticles(this.boss.x, this.boss.y, 8, 'hit');
                    
                    // Spawn damage number
                    this.spawnDamageNumber(this.boss.x, this.boss.y - this.boss.radius - 20, bullet.damage, false);
                    
                    break;
                }
            }
        }
        
        // Boss Projectile vs Player (optimized with squared distance)
        const playerRadius = this.player.radius;
        for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.bossProjectiles[i];
            
            const dx = projectile.x - this.player.x;
            const dy = projectile.y - this.player.y;
            const distSq = dx * dx + dy * dy;
            const minDistSq = (projectile.radius + playerRadius) ** 2;
            
            if (distSq < minDistSq) {
                // Player hit by boss projectile (unless dashing)
                if (!this.player.isDashing) {
                    this.player.health -= projectile.damage;
                    this.player.hitFlash = 150; // Flash on hit
                    
                    // Screen shake on damage
                    this.addScreenShake(0.5, 200);
                    
                    // Spawn hit particles
                    this.spawnParticles(this.player.x, this.player.y, 15, 'blood'); // Increased count for better visibility
                    
                    // Spawn damage number
                    this.spawnDamageNumber(this.player.x, this.player.y - this.player.radius, projectile.damage, false);
                    
                    if (this.player.health <= 0) {
                        this.player.health = 0;
                        this.die();
                    }
                }
                // Remove projectile on contact (even if dashing through)
                this.bossProjectiles.splice(i, 1);
            }
        }
    }
    
    start() {
        // Reset game state
        this.state = 'playing';
        this.score = 0;
        this.kills = 0; // Reset kill counter
        this.round = 1; // Reset round
        this.combo = 0; // Reset combo
        this.maxCombo = 0; // Reset max combo
        this.comboMultiplier = 1.0; // Reset combo multiplier
        this.lastKillTime = 0; // Reset last kill time
        this.player.health = this.player.maxHealth;
        this.player.hitFlash = 0;
        this.player.isDashing = false;
        this.player.dashCooldown = 0;
        this.player.dashTimeRemaining = 0;
        this.player.dashTrail = [];
        this.enemies = [];
        this.bullets = [];
        this.boss = null;
        this.bossProjectiles = [];
        this.bossSpawned = false;
        this.lastSpawn = Date.now();
        this.powerUps = [];
        this.goldPickups = [];
        // Reset camera zoom to starting value
        this.camera.zoom = 2.0;
        this.camera.targetZoom = 2.0;
        // Reset visual effects
        this.particles = [];
        this.damageNumbers = [];
        this.camera.shake = { intensity: 0, duration: 0, currentTime: 0 };
        this.camera.flash = { intensity: 0, duration: 0, currentTime: 0, color: '#ffffff' };
    }
    
    pause() {
        if (this.state === 'playing') {
            this.state = 'paused';
        }
    }
    
    resume() {
        if (this.state === 'paused') {
            this.state = 'playing';
        }
    }
    
    die() {
        this.state = 'dead';
        if (this.onPlayerDeath) {
            this.onPlayerDeath(this.score);
        }
    }
    
    // ========== VISUAL EFFECTS ==========
    
    spawnParticles(x, y, count, type) {
        if (this.particles.length >= this.maxParticles) return; // Performance limit
        
        const colors = {
            'enemyDeath': ['#8b0000', '#a00000', '#cc0000', '#990000', '#660000'], // Darker blood reds for splatters
            'bossDeath': ['#ff0000', '#ff0088', '#8800ff', '#ff6600'],
            'hit': ['#ffff00', '#ffaa00', '#ffffff'],
            'gold': ['#ffd700', '#ffaa00', '#ffff00'],
            'blood': ['#8b0000', '#a00000', '#cc0000', '#990000', '#660000'], // Darker blood reds
            'combo': ['#4ade80', '#22c55e', '#fbbf24', '#f97316', '#ffffff'] // Green to orange for combo
        };
        
        const colorSet = colors[type] || colors['hit'];
        
        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const speed = 0.5 + Math.random() * 2;
            const life = 300 + Math.random() * 500; // 300-800ms
            
            // Make blood splatters larger and more varied
            let particleSize = 2 + Math.random() * 3;
            let ellipseWidth = particleSize;
            let ellipseHeight = particleSize;
            let ellipseRotation = 0;
            
            if (type === 'enemyDeath' || type === 'blood') {
                particleSize = 3 + Math.random() * 6; // Larger blood splatters (3-9px)
                ellipseWidth = particleSize;
                ellipseHeight = particleSize * (0.7 + Math.random() * 0.6); // Vary height for splatter shape
                ellipseRotation = Math.random() * Math.PI * 2; // Random rotation for splatter direction
            }
            
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: life,
                maxLife: life,
                size: particleSize,
                ellipseWidth: ellipseWidth,
                ellipseHeight: ellipseHeight,
                ellipseRotation: ellipseRotation,
                color: colorSet[Math.floor(Math.random() * colorSet.length)],
                alpha: 1,
                type: type
            });
        }
    }
    
    updateParticles(deltaTime) {
        const timeFactor = deltaTime / 16.67;
        const gravity = 0.05 * timeFactor;
        
        // Calculate viewport bounds for culling
        const viewportWidth = this.width / this.camera.zoom;
        const viewportHeight = this.height / this.camera.zoom;
        const viewportLeft = this.camera.x - viewportWidth / 2 - this.viewportMargin;
        const viewportRight = this.camera.x + viewportWidth / 2 + this.viewportMargin;
        const viewportTop = this.camera.y - viewportHeight / 2 - this.viewportMargin;
        const viewportBottom = this.camera.y + viewportHeight / 2 + this.viewportMargin;
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // Update position
            p.x += p.vx * timeFactor;
            p.y += p.vy * timeFactor;
            
            // Update life and alpha
            p.life -= deltaTime;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            p.alpha = p.life / p.maxLife;
            
            // Apply gravity for some particle types
            if (p.type === 'enemyDeath' || p.type === 'bossDeath' || p.type === 'blood') {
                p.vy += gravity;
            }
            
            // Cull off-screen particles
            if (p.x < viewportLeft || p.x > viewportRight || 
                p.y < viewportTop || p.y > viewportBottom) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    drawParticles() {
        // Draw particles directly without batching (faster than creating arrays)
        const PI2 = this.cachedMath.PI2;
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            // Skip invisible particles
            if (p.alpha <= 0) continue;
            
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            
            // Draw blood splatters as ellipses, others as circles
            if (p.type === 'enemyDeath' || p.type === 'blood') {
                this.ctx.ellipse(p.x, p.y, p.ellipseWidth / 2, p.ellipseHeight / 2, p.ellipseRotation, 0, PI2);
            } else {
                this.ctx.arc(p.x, p.y, p.size, 0, PI2);
            }
            
            this.ctx.fill();
            this.ctx.restore();
        }
    }
    
    addScreenShake(intensity, duration) {
        // Override existing shake if new one is stronger or add together
        if (intensity > this.camera.shake.intensity || this.camera.shake.currentTime <= 0) {
            this.camera.shake.intensity = intensity;
            this.camera.shake.duration = duration;
            this.camera.shake.currentTime = duration;
        }
    }
    
    updateScreenShake(deltaTime) {
        if (this.camera.shake.currentTime > 0) {
            this.camera.shake.currentTime -= deltaTime;
            if (this.camera.shake.currentTime < 0) {
                this.camera.shake.currentTime = 0;
                this.camera.shake.intensity = 0;
            }
        }
    }
    
    addScreenFlash(intensity, duration, color = '#ffffff') {
        // Add screen flash effect
        if (intensity > this.camera.flash.intensity || this.camera.flash.currentTime <= 0) {
            this.camera.flash.intensity = intensity;
            this.camera.flash.duration = duration;
            this.camera.flash.currentTime = duration;
            this.camera.flash.color = color;
        }
    }
    
    updateScreenFlash(deltaTime) {
        if (this.camera.flash.currentTime > 0) {
            this.camera.flash.currentTime -= deltaTime;
            if (this.camera.flash.currentTime < 0) {
                this.camera.flash.currentTime = 0;
                this.camera.flash.intensity = 0;
            }
        }
    }
    
    spawnDamageNumber(x, y, damage, isCrit) {
        if (this.damageNumbers.length >= this.maxDamageNumbers) {
            // Remove oldest if at limit
            this.damageNumbers.shift();
        }
        
        this.damageNumbers.push({
            x: x,
            y: y,
            startY: y,
            value: Math.round(damage),
            life: 1200, // 1.2 seconds
            maxLife: 1200,
            color: isCrit ? '#ff6600' : '#ffff00',
            size: isCrit ? 24 : 18
        });
    }
    
    updateDamageNumbers(deltaTime) {
        const floatSpeed = 0.3 * (deltaTime / 16.67);
        
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dn = this.damageNumbers[i];
            
            // Float upward
            dn.y -= floatSpeed;
            
            // Fade out
            dn.life -= deltaTime;
            
            // Remove dead numbers
            if (dn.life <= 0) {
                this.damageNumbers.splice(i, 1);
            }
        }
    }
    
    drawDamageNumbers() {
        // Convert to screen space after camera transform
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to screen space
        
        // Cache camera values
        const camX = this.camera.x;
        const camY = this.camera.y;
        const zoom = this.camera.zoom;
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        
        // Calculate viewport bounds for culling
        const viewportLeft = -halfWidth / zoom;
        const viewportRight = halfWidth / zoom;
        const viewportTop = -halfHeight / zoom;
        const viewportBottom = halfHeight / zoom;
        
        for (let i = 0; i < this.damageNumbers.length; i++) {
            const dn = this.damageNumbers[i];
            
            // Cull off-screen damage numbers
            const worldX = dn.x - camX;
            const worldY = dn.y - camY;
            if (worldX < viewportLeft || worldX > viewportRight || 
                worldY < viewportTop || worldY > viewportBottom) {
                continue;
            }
            
            // Convert world position to screen position
            const screenX = worldX * zoom + halfWidth;
            const screenY = worldY * zoom + halfHeight;
            
            const alpha = dn.life / dn.maxLife;
            if (alpha <= 0) continue;
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = dn.color;
            this.ctx.font = `bold ${dn.size}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 3;
            const valueStr = dn.value.toString();
            this.ctx.strokeText(valueStr, screenX, screenY);
            this.ctx.fillText(valueStr, screenX, screenY);
            this.ctx.restore();
        }
        
        this.ctx.restore();
    }
    
    showRoundPopup(round) {
        // Create round popup element
        const popup = document.createElement('div');
        popup.className = 'round-popup';
        // Calculate multiplier using the same logic as getDifficultyMultiplier
        let multiplier;
        if (round === 1) {
            multiplier = 1.0;
        } else if (round <= 5) {
            multiplier = Math.pow(1.3, round - 1);
        } else if (round <= 10) {
            const earlyMultiplier = Math.pow(1.3, 4);
            multiplier = earlyMultiplier * Math.pow(1.25, round - 5);
        } else {
            const earlyMultiplier = Math.pow(1.3, 4);
            const midMultiplier = earlyMultiplier * Math.pow(1.25, 5);
            multiplier = midMultiplier * Math.pow(1.2, round - 10);
        }
        const multiplierText = multiplier.toFixed(1);
        popup.innerHTML = `<div class="round-popup-content"><h2>Round ${round}</h2><p>Enemies are stronger!<br>Health: ${multiplierText}x | Damage: ${(1.0 + (multiplier - 1.0) * 0.7).toFixed(1)}x | Size: ${(1.0 + (multiplier - 1.0) * 0.3).toFixed(1)}x</p></div>`;
        document.body.appendChild(popup);
        
        // Animate in
        setTimeout(() => {
            popup.classList.add('show');
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            popup.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(popup)) {
                    document.body.removeChild(popup);
                }
            }, 500);
        }, 3000);
    }
    
    trySpawnPowerUp(x, y, enemyType) {
        // Determine spawn chance based on enemy type (made more rare)
        let spawnChance = 0.005; // 0.5% base chance (1 in 200)
        if (enemyType === 'big') {
            spawnChance = 0.02; // 2% for big enemies (1 in 50)
        } else if (enemyType === 'fast') {
            spawnChance = 0.01; // 1% for fast enemies (1 in 100)
        }
        
        // Apply spawn rate bonus from upgrade (adds 0.05% per level)
        spawnChance += this.powerUpSpawnRateBonus;
        
        if (Math.random() < spawnChance) {
            // Weight power-up types based on player health
            const healthPercent = this.player.health / this.player.maxHealth;
            let types = ['speed', 'damage', 'fireRate', 'shield', 'health', 'gold'];
            
            // If low health, increase chance for health pickups
            if (healthPercent < 0.3) {
                // 40% chance for health, 60% for others
                const type = Math.random() < 0.4 ? 'health' : types[Math.floor(Math.random() * (types.length - 1))];
                this.spawnPowerUp(x, y, type);
            } else {
                // Normal distribution
                const type = types[Math.floor(Math.random() * types.length)];
                this.spawnPowerUp(x, y, type);
            }
        }
    }
    
    spawnPowerUp(x, y, type) {
        const powerUpTypes = {
            'speed': { color: '#00aaff', icon: '→', name: 'Speed' },
            'damage': { color: '#ff0000', icon: '⚔', name: 'Damage' },
            'fireRate': { color: '#ffaa00', icon: '⚡', name: 'Fire Rate' },
            'shield': { color: '#aa00ff', icon: '🛡', name: 'Shield' },
            'health': { color: '#00ff00', icon: '+', name: 'Health' },
            'gold': { color: '#ffd700', icon: '★', name: 'Gold' }
        };
        
        const powerUpData = powerUpTypes[type] || powerUpTypes['speed'];
        
        this.powerUps.push({
            x: x,
            y: y,
            radius: 12,
            type: type,
            color: powerUpData.color,
            icon: powerUpData.icon,
            name: powerUpData.name,
            bobOffset: Math.random() * Math.PI * 2, // Random starting position for bobbing
            rotation: 0,
            life: 30000, // Power-ups despawn after 30 seconds if not collected
            maxLife: 30000
        });
    }
    
    updatePowerUps(deltaTime) {
        const timeFactor = deltaTime / 16.67;
        const playerRadius = this.player.radius;
        
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            
            // Update animation
            powerUp.bobOffset += 0.05 * timeFactor;
            powerUp.rotation += 0.02 * timeFactor;
            powerUp.life -= deltaTime;
            
            // Remove if expired
            if (powerUp.life <= 0) {
                this.powerUps.splice(i, 1);
                continue;
            }
            
            // Check collection (player collision)
            // Use pickupRange upgrade for magnet effect and collection
            const dx = this.player.x - powerUp.x;
            const dy = this.player.y - powerUp.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq);
            
            // Ensure pickupRange is set (fallback to 100)
            const pickupRange = this.pickupRange || 100;
            
            // Activate magnet if within pickup range
            if (dist < pickupRange) {
                // Move power-up toward player (magnet effect)
                const timeFactor = deltaTime / 16.67;
                const speed = 0.15 * timeFactor * (this.player.speed * 2);
                const moveX = (dx / dist) * speed;
                const moveY = (dy / dist) * speed;
                powerUp.x += moveX;
                powerUp.y += moveY;
                
                // Recalculate distance after movement
                const newDx = this.player.x - powerUp.x;
                const newDy = this.player.y - powerUp.y;
                const newDistSq = newDx * newDx + newDy * newDy;
            }
            
            // Check collection after potential magnet movement
            const collectionRadius = playerRadius + powerUp.radius + 5; // Collection buffer
            const collectionDistSq = collectionRadius * collectionRadius;
            const finalDistSq = (dist < pickupRange) ? 
                (this.player.x - powerUp.x) ** 2 + (this.player.y - powerUp.y) ** 2 : distSq;
            
            if (finalDistSq < collectionDistSq) {
                this.collectPowerUp(powerUp);
                this.powerUps.splice(i, 1);
            }
        }
    }
    
    collectPowerUp(powerUp) {
        // Visual feedback
        this.spawnParticles(powerUp.x, powerUp.y, 15, 'gold');
        this.addScreenShake(0.2, 100);
        
        // Apply effect based on type
        switch (powerUp.type) {
            case 'speed':
            case 'damage':
            case 'fireRate':
            case 'shield':
                // Temporary boost - add to active effects
                this.applyPowerUpEffect(powerUp.type);
                break;
            case 'health':
                // Permanent pickup - restore health
                const healAmount = Math.ceil(this.player.maxHealth * 0.25);
                const oldHealth = this.player.health;
                this.player.health = Math.min(this.player.health + healAmount, this.player.maxHealth);
                const actualHeal = this.player.health - oldHealth;
                if (actualHeal > 0) {
                    this.spawnDamageNumber(this.player.x, this.player.y - this.player.radius, actualHeal, true);
                }
                break;
            case 'gold':
                // Gold multiplier - 10 second timer (stackable - adds time)
                this.goldMultiplierActive = true;
                this.goldMultiplierTimer += this.goldMultiplierDuration; // Add 10 seconds to timer
                break;
        }
    }
    
    applyPowerUpEffect(type) {
        const effect = this.activeEffects[type];
        if (!effect) return;
        
        // Check if there's already an active timer - if so, extend it instead of stacking
        if (effect.timers.length > 0) {
            // Extend the longest remaining timer by adding duration
            const longestTimer = effect.timers.reduce((max, timer) => 
                timer.remaining > max.remaining ? timer : max
            );
            longestTimer.remaining += this.powerUpDuration;
            // Cap at reasonable maximum (e.g., 60 seconds)
            longestTimer.remaining = Math.min(longestTimer.remaining, 60000);
        } else {
            // No active timer, add a new one
            effect.timers.push({
                remaining: this.powerUpDuration,
                id: Date.now() + Math.random() // Unique ID
            });
        }
        
        // Update count and multiplier (count is still number of timers, but we only extend)
        effect.count = effect.timers.length;
        
        if (type === 'shield') {
            effect.active = effect.count > 0;
        } else {
            // Multiplier stays at 1.5x (50% boost) regardless of how many times you pick it up
            // The timer just gets extended
            effect.multiplier = 1.5; // Fixed 50% boost
        }
    }
    
    removePowerUpEffect(type) {
        const effect = this.activeEffects[type];
        if (!effect) return;
        
        // Remove expired timers
        effect.timers = effect.timers.filter(timer => timer.remaining > 0);
        effect.count = effect.timers.length;
        
        if (type === 'shield') {
            effect.active = effect.count > 0;
        } else {
            effect.multiplier = effect.count > 0 ? (1.0 + (effect.count - 1) * 0.5) : 1.0;
        }
    }
    
    updateActiveEffects(deltaTime) {
        // Update all effect timers
        for (const type in this.activeEffects) {
            const effect = this.activeEffects[type];
            for (let i = effect.timers.length - 1; i >= 0; i--) {
                effect.timers[i].remaining -= deltaTime;
                if (effect.timers[i].remaining <= 0) {
                    effect.timers.splice(i, 1);
                }
            }
            
            // Update count and multiplier
            effect.count = effect.timers.length;
            if (type === 'shield') {
                effect.active = effect.count > 0;
            } else {
                // Fixed multiplier - picking up same boost extends timer, doesn't increase multiplier
                effect.multiplier = effect.count > 0 ? 1.5 : 1.0; // Always 50% boost
            }
        }
        
        // Update gold multiplier timer
        if (this.goldMultiplierActive) {
            this.goldMultiplierTimer -= deltaTime;
            if (this.goldMultiplierTimer <= 0) {
                this.goldMultiplierActive = false;
                this.goldMultiplierTimer = 0;
            }
        }
    }
    
    drawPowerUps() {
        const viewportLeft = this.cachedViewport.left;
        const viewportRight = this.cachedViewport.right;
        const viewportTop = this.cachedViewport.top;
        const viewportBottom = this.cachedViewport.bottom;
        
        for (let i = 0; i < this.powerUps.length; i++) {
            const powerUp = this.powerUps[i];
            
            // Viewport culling
            if (powerUp.x < viewportLeft || powerUp.x > viewportRight ||
                powerUp.y < viewportTop || powerUp.y > viewportBottom) {
                continue;
            }
            
            // Bobbing animation
            const bobAmount = Math.sin(powerUp.bobOffset) * 5;
            const drawY = powerUp.y + bobAmount;
            
            this.ctx.save();
            
            // Glow effect
            const glowAlpha = 0.3 + Math.sin(powerUp.bobOffset * 2) * 0.2;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = powerUp.color;
            
            // Draw power-up circle (in world space, camera transform already applied)
            this.ctx.fillStyle = powerUp.color;
            this.ctx.beginPath();
            this.ctx.arc(powerUp.x, drawY, powerUp.radius, 0, this.cachedMath.PI2);
            this.ctx.fill();
            
            // Draw border
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw icon/text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowBlur = 0;
            this.ctx.fillText(powerUp.icon, powerUp.x, drawY);
            
            this.ctx.restore();
        }
    }
    
    spawnGoldPickup(x, y, gold) {
        // Spawn a collectible gold item with magnet effect
        this.goldPickups.push({
            x: x,
            y: y,
            value: gold,
            radius: 3, // Further reduced to make pickups smaller
            life: 15000, // 15 seconds to collect
            maxLife: 15000,
            collected: false,
            magnetActive: false,
            bobOffset: Math.random() * Math.PI * 2,
            rotation: Math.random() * Math.PI * 2
        });
        
        // Also spawn gold particles for visual feedback
        this.spawnParticles(x, y, 8, 'gold');
    }
    
    updateGoldPickups(deltaTime) {
        const timeFactor = deltaTime / 16.67;
        const playerX = this.player.x;
        const playerY = this.player.y;
        const playerRadius = this.player.radius;
        
        // Ensure pickupRange is set (fallback to goldMagnetRange or 100)
        const pickupRange = this.pickupRange || this.goldMagnetRange || 100;
        
        for (let i = this.goldPickups.length - 1; i >= 0; i--) {
            const pickup = this.goldPickups[i];
            
            // Update animation
            pickup.bobOffset += 0.05 * timeFactor;
            pickup.rotation += 0.02 * timeFactor;
            pickup.life -= deltaTime;
            
            // Remove if expired
            if (pickup.life <= 0 || pickup.collected) {
                this.goldPickups.splice(i, 1);
                continue;
            }
            
            // Calculate distance to player
            const dx = playerX - pickup.x;
            const dy = playerY - pickup.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq);
            
            // Activate magnet if within range (uses pickupRange upgrade)
            if (dist < pickupRange) {
                pickup.magnetActive = true;
            }
            
            // Move toward player if magnet is active
            if (pickup.magnetActive && dist > 5) {
                const speed = this.goldMagnetSpeed * timeFactor * (this.player.speed * 2); // Faster magnet
                const moveX = (dx / dist) * speed;
                const moveY = (dy / dist) * speed;
                pickup.x += moveX;
                pickup.y += moveY;
            }
            
            // Check collection (player collision)
            const collisionDistSq = (pickup.radius + playerRadius) ** 2;
            if (distSq < collisionDistSq) {
                // Collect gold
                this.collectGoldPickup(pickup);
                this.goldPickups.splice(i, 1);
            }
        }
    }
    
    collectGoldPickup(pickup) {
        pickup.collected = true;
        
        // Visual feedback
        this.spawnParticles(pickup.x, pickup.y, 12, 'gold');
        
        // Spawn floating "+X GOLD" text
        if (this.damageNumbers.length >= this.maxDamageNumbers) {
            this.damageNumbers.shift();
        }
        this.damageNumbers.push({
            x: pickup.x,
            y: pickup.y,
            startY: pickup.y,
            value: `+${pickup.value} GOLD`,
            life: 1200,
            maxLife: 1200,
            color: '#ffd700',
            size: 18,
            isGold: true
        });
        
        // Trigger gold callback (this actually adds the gold)
        if (this.onEnemyKill) {
            this.onEnemyKill(pickup.value);
        }
    }
    
    drawGoldPickups() {
        for (let i = 0; i < this.goldPickups.length; i++) {
            const pickup = this.goldPickups[i];
            
            // Skip if not in viewport
            const viewportLeft = this.cachedViewport.left;
            const viewportRight = this.cachedViewport.right;
            const viewportTop = this.cachedViewport.top;
            const viewportBottom = this.cachedViewport.bottom;
            
            if (pickup.x < viewportLeft || pickup.x > viewportRight ||
                pickup.y < viewportTop || pickup.y > viewportBottom) {
                continue;
            }
            
            this.ctx.save();
            
            // Bob animation
            const bobY = Math.sin(pickup.bobOffset) * 3;
            
            // Draw gold coin
            const size = pickup.radius * 2;
            this.ctx.translate(pickup.x, pickup.y + bobY);
            this.ctx.rotate(pickup.rotation);
            
            // Glow effect if magnet is active
            if (pickup.magnetActive) {
                this.ctx.globalAlpha = 0.6;
                this.ctx.fillStyle = '#ffd700';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
            }
            
            // Draw coin
            this.ctx.fillStyle = '#ffd700';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Coin outline
            this.ctx.strokeStyle = '#ffaa00';
            this.ctx.lineWidth = 1; // Reduced further for smaller coin
            this.ctx.stroke();
            
            // "$" symbol
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold ' + (size * 0.8) + 'px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('$', 0, 0);
            
            this.ctx.restore();
        }
    }
    
    spawnComboNotification(x, y, combo) {
        // Spawn a special combo notification
        if (this.damageNumbers.length >= this.maxDamageNumbers) {
            this.damageNumbers.shift();
        }
        
        let text = '';
        let color = '#ffffff';
        let size = 24;
        
        if (combo === 5) {
            text = 'x2 COMBO!';
            color = '#4ade80';
        } else if (combo === 10) {
            text = 'x3 COMBO!';
            color = '#22c55e';
            size = 28;
        } else if (combo === 20) {
            text = 'x5 COMBO!';
            color = '#fbbf24';
            size = 32;
        } else if (combo === 50) {
            text = 'x5 LEGENDARY!';
            color = '#f97316';
            size = 36;
        }
        
        this.damageNumbers.push({
            x: x,
            y: y,
            startY: y,
            value: text,
            life: 2000,
            maxLife: 2000,
            color: color,
            size: size,
            isCombo: true
        });
        
        // Extra particles for combo milestones
        this.spawnParticles(x, y, 30, 'combo');
    }
    
    render() {
        // Clear canvas with fallback background color
        this.ctx.fillStyle = '#1a1a2e'; // Dark blue-gray background (fallback)
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Transform to camera view (orbital) with screen shake
        this.ctx.save();
        this.ctx.translate(this.width / 2, this.height / 2);
        
        // Apply screen shake offset (optimized - only calculate if shaking)
        let shakeX = 0;
        let shakeY = 0;
        if (this.camera.shake.currentTime > 0) {
            const shakeProgress = this.camera.shake.currentTime / this.camera.shake.duration;
            const shakeAmount = this.camera.shake.intensity * shakeProgress;
            const shakeMultiplier = shakeAmount * 10;
            // Use single random call and derive both values
            const rand1 = Math.random();
            const rand2 = Math.random();
            shakeX = (rand1 - 0.5) * shakeMultiplier;
            shakeY = (rand2 - 0.5) * shakeMultiplier;
        }
        
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);
        
        // Draw background image (moves with camera so player can walk around)
        if (this.imagesLoaded && this.images.background && this.images.background.complete && this.images.background.naturalWidth > 0) {
            // Use cached dimensions
            const bgWidth = this.cachedBgDimensions.width || this.images.background.naturalWidth;
            const bgHeight = this.cachedBgDimensions.height || this.images.background.naturalHeight;
            // Center background at world origin (0, 0) - player can walk around it
            this.ctx.drawImage(
                this.images.background,
                -bgWidth / 2,
                -bgHeight / 2,
                bgWidth,
                bgHeight
            );
        }
        
        // Draw grid background (optional, for retro feel - can be removed if background image is used)
        // this.drawGrid();
        
        // Calculate viewport bounds for culling (cache when zoom changes)
        if (this.cachedViewport.needsUpdate || this.cachedViewport.zoom !== this.camera.zoom) {
            this.cachedViewport.zoom = this.camera.zoom;
            this.cachedViewport.width = this.width / this.camera.zoom;
            this.cachedViewport.height = this.height / this.camera.zoom;
            this.cachedViewport.left = this.camera.x - this.cachedViewport.width / 2 - this.viewportMargin;
            this.cachedViewport.right = this.camera.x + this.cachedViewport.width / 2 + this.viewportMargin;
            this.cachedViewport.top = this.camera.y - this.cachedViewport.height / 2 - this.viewportMargin;
            this.cachedViewport.bottom = this.camera.y + this.cachedViewport.height / 2 + this.viewportMargin;
            this.cachedViewport.needsUpdate = false;
        }
        
        // Use cached viewport values
        const viewportLeft = this.cachedViewport.left;
        const viewportRight = this.cachedViewport.right;
        const viewportTop = this.cachedViewport.top;
        const viewportBottom = this.cachedViewport.bottom;
        
        // Draw enemies (with viewport culling)
        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            // Only draw if in viewport
            if (enemy.x >= viewportLeft && enemy.x <= viewportRight && 
                enemy.y >= viewportTop && enemy.y <= viewportBottom) {
                this.drawEnemy(enemy);
            }
        }
        
        // Draw boss
        if (this.boss) {
            this.drawBoss();
        }
        
        // Draw particles (behind entities but visible)
        this.drawParticles();
        
        // Draw power-ups (with viewport culling)
        this.drawPowerUps();
        
        // Draw bullets (with viewport culling)
        for (let i = 0; i < this.bullets.length; i++) {
            const bullet = this.bullets[i];
            // Only draw if in viewport
            if (bullet.x >= viewportLeft && bullet.x <= viewportRight && 
                bullet.y >= viewportTop && bullet.y <= viewportBottom) {
                this.drawBullet(bullet);
            }
        }
        
        // Draw boss projectiles (with viewport culling)
        for (let i = 0; i < this.bossProjectiles.length; i++) {
            const projectile = this.bossProjectiles[i];
            // Only draw if in viewport
            if (projectile.x >= viewportLeft && projectile.x <= viewportRight && 
                projectile.y >= viewportTop && projectile.y <= viewportBottom) {
                this.drawBossProjectile(projectile);
            }
        }
        
        // Draw player
        this.drawPlayer();
        
        // Draw gold pickups last (after player) so they're always visible and never overlap enemies
        this.drawGoldPickups();
        
        this.ctx.restore();
        
        // Draw damage numbers (screen space, after camera transform)
        this.drawDamageNumbers();
        
        // Draw screen flash (screen space, on top of everything)
        this.drawScreenFlash();
    }
    
    drawScreenFlash() {
        if (this.camera.flash.currentTime > 0) {
            const flashProgress = this.camera.flash.currentTime / this.camera.flash.duration;
            const flashAlpha = this.camera.flash.intensity * flashProgress * 0.15; // Reduced to 15% max opacity for much subtler flashes
            
            this.ctx.save();
            this.ctx.globalAlpha = flashAlpha;
            this.ctx.fillStyle = this.camera.flash.color;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
        }
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        const startX = Math.floor((this.camera.x - this.width / 2) / gridSize) * gridSize;
        const startY = Math.floor((this.camera.y - this.height / 2) / gridSize) * gridSize;
        const endX = this.camera.x + this.width / 2;
        const endY = this.camera.y + this.height / 2;
        
        for (let x = startX; x < endX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }
        
        for (let y = startY; y < endY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }
    }
    
    drawPlayer() {
        this.ctx.save();
        
        // Draw dash trail
        if (this.player.dashTrail && this.player.dashTrail.length > 1) {
            this.ctx.strokeStyle = '#00aaff';
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.6;
            this.ctx.beginPath();
            const trail = this.player.dashTrail;
            this.ctx.moveTo(trail[0].x, trail[0].y);
            for (let i = 1; i < trail.length; i++) {
                const alpha = i / trail.length;
                this.ctx.globalAlpha = alpha * 0.4;
                this.ctx.lineTo(trail[i].x, trail[i].y);
            }
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        }
        
        // Dash visual effect - semi-transparent during dash
        if (this.player.isDashing) {
            this.ctx.globalAlpha = 0.7;
        }
        
        // Hit flash effect
        if (this.player.hitFlash > 0) {
            const flashAlpha = (this.player.hitFlash / 150) * 0.5;
            this.ctx.globalAlpha = flashAlpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius * 3.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = this.player.isDashing ? 0.7 : 1;
        }
        
        if (!this.imagesLoaded) {
            // Fallback: draw circle while images load
            this.ctx.fillStyle = this.player.color;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
            return;
        }
        
        const direction = this.getPlayerDirection();
        const img = this.images.player[direction];
        
        if (img && img.complete && img.naturalWidth > 0) {
            const size = this.player.radius * 3.5; // Larger size for better visibility
            // Ensure transparency is preserved
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.translate(this.player.x, this.player.y);
            // Draw image with transparency preserved (PNG alpha channel)
            this.ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
            // Fallback: draw circle if image not ready
            this.ctx.fillStyle = this.player.color;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    drawEnemy(enemy) {
        // Increased size multiplier for better visibility
        const size = enemy.radius * 3.5;
        
        this.ctx.save();
        
        // Hit flash effect
        if (enemy.hitFlash !== undefined && enemy.hitFlash > 0) {
            const flashAlpha = (enemy.hitFlash / 100) * 0.6;
            this.ctx.globalAlpha = flashAlpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(enemy.x, enemy.y, size / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }
        
        // Scale for big enemies
        const scale = enemy.enemyType === 'big' ? 1.5 : 1.0;
        
        // Use directional sprites for ALL mob types (normal, fast, big)
        const direction = this.getEnemyDirection(enemy);
        let img = null;
        
        // Choose sprite based on enemy type
        if (enemy.enemyType === 'fast' && this.imagesLoaded && this.images.speedMob) {
            img = this.images.speedMob[direction];
        } else if (enemy.enemyType === 'big' && this.imagesLoaded && this.images.bigMob) {
            img = this.images.bigMob[direction];
        } else if (this.imagesLoaded && this.images.normalMob) {
            img = this.images.normalMob[direction];
        }
        
        if (img && img.complete && img.naturalWidth > 0) {
            // Draw directional sprite
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.drawImage(
                img,
                enemy.x - (size * scale) / 2,
                enemy.y - (size * scale) / 2,
                size * scale,
                size * scale
            );
            
            // Apply visual effects based on enemy type
            if (enemy.enemyType === 'big') {
                // Draw health bar for big enemies
                const barWidth = size * scale;
                const barHeight = 6;
                const barX = enemy.x - barWidth / 2;
                const barY = enemy.y - (size * scale) / 2 - 12;
                
                // Background
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Health fill
                const healthPercent = enemy.health / enemy.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : (healthPercent > 0.25 ? '#ffff00' : '#ff0000');
                this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
                
                // Outline
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(barX, barY, barWidth, barHeight);
            }
            
            this.ctx.restore();
            return; // Early return after drawing sprite
        }
        
        // Fallback: use enemy image if sprites aren't loaded
        if (this.imagesLoaded && this.images.enemy && this.images.enemy.complete && this.images.enemy.naturalWidth > 0) {
            // Draw the image first (preserves transparency)
            this.ctx.drawImage(
                this.images.enemy,
                enemy.x - (size * scale) / 2,
                enemy.y - (size * scale) / 2,
                size * scale,
                size * scale
            );
            
            // Apply tint based on enemy type (overlay mode to preserve transparency)
            if (enemy.enemyType === 'big') {
                // Draw health bar for big enemies
                const barWidth = size * scale;
                const barHeight = 6;
                const barX = enemy.x - barWidth / 2;
                const barY = enemy.y - (size * scale) / 2 - 12;
                
                // Background
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Health fill
                const healthPercent = enemy.health / enemy.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : (healthPercent > 0.25 ? '#ffff00' : '#ff0000');
                this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
                
                // Outline
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(barX, barY, barWidth, barHeight);
            }
            
            this.ctx.restore();
        } else {
            // Fallback: draw rectangle while images load
            this.ctx.fillStyle = enemy.color;
            this.ctx.fillRect(
                enemy.x - enemy.radius,
                enemy.y - enemy.radius,
                enemy.radius * 2,
                enemy.radius * 2
            );
            
            // Health bar for big enemies (fallback only)
            if (enemy.enemyType === 'big') {
                const barWidth = enemy.radius * 2;
                const barHeight = 6;
                const barX = enemy.x - enemy.radius;
                const barY = enemy.y - enemy.radius - 12;
                
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                
                const healthPercent = enemy.health / enemy.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : (healthPercent > 0.25 ? '#ffff00' : '#ff0000');
                this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            }
            
            this.ctx.restore();
        }
    }
    
    drawBullet(bullet) {
        this.ctx.save();
        
        // Draw bullet trail
        if (bullet.trail && bullet.trail.length > 1) {
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(bullet.trail[0].x, bullet.trail[0].y);
            for (let i = 1; i < bullet.trail.length; i++) {
                const alpha = i / bullet.trail.length;
                this.ctx.globalAlpha = alpha * 0.5;
                this.ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
            }
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        }
        
        if (this.imagesLoaded && this.images.bullet && this.images.bullet.complete && this.images.bullet.naturalWidth > 0) {
            // Draw bullet sprite - enlarged for better visibility
            const size = bullet.radius * 4;
            this.ctx.globalCompositeOperation = 'source-over';
            
            // Calculate bullet rotation from velocity
            const angle = Math.atan2(bullet.vy, bullet.vx);
            this.ctx.translate(bullet.x, bullet.y);
            this.ctx.rotate(angle);
            
            this.ctx.drawImage(
                this.images.bullet,
                -size / 2,
                -size / 2,
                size,
                size
            );
        } else {
            // Fallback: draw circle while bullet sprite loads (also enlarged)
            const radius = bullet.radius * 2;
            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    drawBoss() {
        if (!this.boss) return;
        
        this.ctx.save();
        
        // Hit flash effect
        if (this.boss.hitFlash > 0) {
            const flashAlpha = (this.boss.hitFlash / 100) * 0.6;
            this.ctx.globalAlpha = flashAlpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(this.boss.x, this.boss.y, this.boss.radius * 2.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }
        
        // Attack charge indicator - pulsing ring before attacks
        const timeSinceLastAttack = Date.now() - this.boss.lastAttack;
        const timeUntilNextAttack = this.boss.attackCooldown - timeSinceLastAttack;
        if (timeUntilNextAttack < 400 && timeUntilNextAttack > 0) {
            const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
            const chargeAlpha = (1 - timeUntilNextAttack / 400) * 0.5 * pulse;
            this.ctx.globalAlpha = chargeAlpha;
            this.ctx.strokeStyle = '#ff6600';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(this.boss.x, this.boss.y, this.boss.radius * 2.5 + 10, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        }
        
        const size = this.boss.radius * 2.5; // Slightly larger for better visibility
        
        // Draw boss sprite if loaded
        if (this.imagesLoaded && this.images.boss && this.images.boss.complete && this.images.boss.naturalWidth > 0) {
            // Draw boss sprite static (no rotation)
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.drawImage(
                this.images.boss,
                this.boss.x - size / 2,
                this.boss.y - size / 2,
                size,
                size
            );
        } else {
            // Fallback: draw boss as a large red circle with pulsing effect
            const pulse = Math.sin(Date.now() / 200) * 0.1 + 1; // Pulsing effect
            const drawSize = size * pulse;
            
            // Outer glow
            const gradient = this.ctx.createRadialGradient(
                this.boss.x, this.boss.y, 0,
                this.boss.x, this.boss.y, drawSize / 2
            );
            gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(this.boss.x, this.boss.y, drawSize / 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Boss body
            this.ctx.fillStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(this.boss.x, this.boss.y, this.boss.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Boss outline
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(this.boss.x, this.boss.y, this.boss.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            this.ctx.restore();
        }
        
        // Health bar (always drawn)
        const barWidth = this.boss.radius * 2;
        const barHeight = 8;
        const barX = this.boss.x - barWidth / 2;
        const barY = this.boss.y - this.boss.radius - 20;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health fill
        const healthPercent = this.boss.health / this.boss.maxHealth;
        this.ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : (healthPercent > 0.25 ? '#ffff00' : '#ff0000');
        this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        
        // Health bar glow when low
        if (healthPercent < 0.25) {
            const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
            this.ctx.globalAlpha = pulse * 0.5;
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            this.ctx.globalAlpha = 1;
        }
        
        // Outline
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        this.ctx.restore();
    }
    
    drawBossProjectile(projectile) {
        if (this.imagesLoaded && this.images.bossBullet && this.images.bossBullet.complete && this.images.bossBullet.naturalWidth > 0) {
            // Draw boss bullet sprite
            const size = projectile.radius * 3;
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'source-over';
            
            // Calculate projectile rotation from velocity
            const angle = Math.atan2(projectile.vy, projectile.vx);
            this.ctx.translate(projectile.x, projectile.y);
            this.ctx.rotate(angle);
            
            this.ctx.drawImage(
                this.images.bossBullet,
                -size / 2,
                -size / 2,
                size,
                size
            );
            this.ctx.restore();
        } else {
            // Fallback: draw colored circle while sprite loads
            this.ctx.save();
            this.ctx.fillStyle = projectile.color;
            this.ctx.beginPath();
            this.ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Glow effect
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            this.ctx.restore();
        }
    }
    
    gameLoop() {
        const now = performance.now();
        const deltaTime = now - this.lastFrame;
        this.lastFrame = now;
        
        this.update(deltaTime);
        this.render();
        
        // Use bound method reference instead of arrow function (faster)
        requestAnimationFrame(this.gameLoopBound);
    }
    
    // Public methods for external control
    setWeaponDamage(damage) {
        this.weapon.damage = damage;
    }
    
    setWeaponFireRate(fireRate) {
        this.weapon.fireRate = fireRate;
    }
    
    setPlayerHealth(maxHealth) {
        this.player.maxHealth = maxHealth;
        this.player.health = maxHealth;
    }
    
    setPlayerSpeed(speed) {
        this.player.speed = speed;
    }
    
    setPowerUpSpawnRateBonus(bonus) {
        this.powerUpSpawnRateBonus = bonus;
    }
    
    setPickupRange(range) {
        this.goldMagnetRange = range;
        this.pickupRange = range;
    }
    
    restart() {
        this.state = 'playing';
        this.score = 0;
        this.kills = 0; // Reset kill counter
        this.round = 1; // Reset round
        this.player.x = 0;
        this.player.y = 0;
        this.player.health = this.player.maxHealth;
        this.player.hitFlash = 0;
        this.enemies = [];
        this.bullets = [];
        this.boss = null;
        this.bossProjectiles = [];
        this.bossSpawned = false;
        this.lastSpawn = 0;
        // Reset camera zoom to starting value
        this.camera.zoom = 2.0;
        this.camera.targetZoom = 2.0;
        // Reset visual effects
        this.particles = [];
        this.damageNumbers = [];
        this.camera.shake = { intensity: 0, duration: 0, currentTime: 0 };
    }
    
    getHealth() {
        return this.player.health;
    }
    
    getMaxHealth() {
        return this.player.maxHealth;
    }
    
    getScore() {
        return this.score;
    }
}
