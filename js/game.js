/**
 * Retro Orbital Game Engine
 * Canvas-based shooter with orbital view
 */

export class Game {
    constructor(canvas, onEnemyKill, onPlayerDeath) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true }); // Ensure alpha channel is preserved
        this.onEnemyKill = onEnemyKill; // Callback for when enemy is killed
        this.onPlayerDeath = onPlayerDeath; // Callback for when player dies
        
        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Game state
        this.state = 'menu'; // 'menu', 'playing', 'paused', 'dead', 'shop'
        this.score = 0;
        this.kills = 0; // Track total enemies killed for difficulty scaling
        this.round = 1; // Track current round (increases after each boss defeat)
        
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
            shake: { intensity: 0, duration: 0, currentTime: 0 }
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
            lastY: 0
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
        if (this.imagesLoaded && this.images.background && this.images.background.complete && this.images.background.naturalWidth > 0) {
            const bgWidth = this.images.background.naturalWidth;
            const bgHeight = this.images.background.naturalHeight;
            
            // Calculate viewport size at current zoom
            const viewportWidth = this.width / this.camera.zoom;
            const viewportHeight = this.height / this.camera.zoom;
            
            // Background bounds (centered at 0,0)
            const bgMinX = -bgWidth / 2;
            const bgMaxX = bgWidth / 2;
            const bgMinY = -bgHeight / 2;
            const bgMaxY = bgHeight / 2;
            
            // Constrain camera position so viewport stays within background
            const minX = bgMinX + viewportWidth / 2;
            const maxX = bgMaxX - viewportWidth / 2;
            const minY = bgMinY + viewportHeight / 2;
            const maxY = bgMaxY - viewportHeight / 2;
            
            // Only constrain if viewport is smaller than background
            if (viewportWidth < bgWidth) {
                targetX = Math.max(minX, Math.min(maxX, targetX));
            } else {
                // If viewport is larger than background, center it
                targetX = 0;
            }
            
            if (viewportHeight < bgHeight) {
                targetY = Math.max(minY, Math.min(maxY, targetY));
            } else {
                // If viewport is larger than background, center it
                targetY = 0;
            }
        }
        
        this.camera.x = targetX;
        this.camera.y = targetY;
        
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
        
        // Update hit flash timers
        if (this.player.hitFlash > 0) {
            this.player.hitFlash -= deltaTime;
            if (this.player.hitFlash < 0) this.player.hitFlash = 0;
        }
        if (this.boss && this.boss.hitFlash > 0) {
            this.boss.hitFlash -= deltaTime;
            if (this.boss.hitFlash < 0) this.boss.hitFlash = 0;
        }
        
        // Check collisions
        this.checkCollisions();
        
        // Auto-shoot if mouse is held
        if (this.mouse.down) {
            this.shoot();
        }
    }
    
    updatePlayer(deltaTime) {
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
        
        // Calculate velocity for boss prediction (before constraints)
        this.player.vx = dx * this.player.speed;
        this.player.vy = dy * this.player.speed;
        
        let newX = this.player.x + dx * this.player.speed * timeFactor;
        let newY = this.player.y + dy * this.player.speed * timeFactor;
        
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
        // Round-based difficulty: mobs get 2x health per round
        // Round 1: 1x, Round 2: 2x, Round 3: 4x, etc.
        return Math.pow(2, this.round - 1);
    }
    
    getBossDifficultyMultiplier() {
        // Boss gets 2x harder per round (health, damage, etc.)
        // Round 1: 1x, Round 2: 2x, Round 3: 4x, etc.
        return Math.pow(2, this.round - 1);
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
            
            // Get round-based difficulty multiplier (2x health per round)
            const roundMultiplier = this.getDifficultyMultiplier();
            
            // Determine enemy type: 60% normal, 25% fast, 15% big
            const rand = Math.random();
            let enemyType = 'normal';
            let baseSpeed = 1.5;
            let health = 10; // Base health values
            let radius = 12;
            let goldReward = 1;
            
            if (rand < 0.15) {
                // Big enemy (15% chance)
                enemyType = 'big';
                baseSpeed = 1.0; // Slower than normal
                health = 30;
                radius = 18; // Larger size
                goldReward = 5;
            } else if (rand < 0.40) {
                // Fast enemy (25% chance)
                enemyType = 'fast';
                baseSpeed = 1.5 * 1.5; // 1.5x faster
                health = 5;
                radius = 15; // Increased from 12 to make speedmob larger
                goldReward = 2;
            } else {
                // Normal enemy (60% chance)
                enemyType = 'normal';
                baseSpeed = 1.5;
                health = 10;
                radius = 12;
                goldReward = 1;
            }
            
            // Calculate initial rotation toward player
            const dx = this.player.x - x;
            const dy = this.player.y - y;
            const rotation = Math.atan2(dy, dx);
            
            // Apply round multiplier to health only (mobs get 2x health per round)
            // Speed and radius stay the same, only health scales
            this.enemies.push({
                x: x,
                y: y,
                radius: radius, // No scaling on radius
                speed: baseSpeed, // No scaling on speed
                health: health * roundMultiplier, // Only health scales with rounds
                maxHealth: health * roundMultiplier,
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
                // Enemy hit player
                this.player.health -= 5;
                this.player.hitFlash = 150; // Flash on hit
                this.enemies.splice(i, 1);
                
                // Screen shake on damage
                this.addScreenShake(0.5, 200);
                
                // Spawn hit particles
                this.spawnParticles(this.player.x, this.player.y, 15, 'blood'); // Increased count for better visibility
                
                // Spawn damage number
                this.spawnDamageNumber(this.player.x, this.player.y - this.player.radius, 5, false);
                
                if (this.player.health <= 0) {
                    this.player.health = 0;
                    this.die();
                }
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
        
        this.boss = {
            x: 0,
            y: 0,
            radius: 40 * bossMultiplier,
            health: 20000 * bossMultiplier, // 2x harder per round
            maxHealth: 20000 * bossMultiplier,
            speed: 0, // Stationary
            rotation: 0,
            lastAttack: Date.now(),
            attackCooldown: 1200, // Reduced from 2000ms to 1200ms (faster attacks)
            attackPattern: 0, // Current attack pattern (0-3)
            attackTimer: 0, // Timer for pattern-specific timing
            color: '#ff0000',
            hitFlash: 0,
            damageMultiplier: bossMultiplier // Store damage multiplier for attacks
        };
        
        this.bossSpawned = true;
        
        // Screen shake on boss spawn
        this.addScreenShake(1.0, 500);
    }
    
    updateBoss(deltaTime) {
        if (!this.boss) return;
        
        // Check if boss is dead first, before doing anything else
        if (this.boss.health <= 0) {
            // Boss defeated - reward gold
            const goldReward = 50;
            this.score += goldReward * 10;
            if (this.onEnemyKill) {
                this.onEnemyKill(goldReward);
            }
            
            // Save boss position for particles
            const bossX = this.boss.x;
            const bossY = this.boss.y;
            
            // Spawn boss death particles
            this.spawnParticles(bossX, bossY, 40, 'bossDeath');
            
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
        
        // Boss stays stationary and static (no rotation)
        const now = Date.now();
        this.boss.attackTimer += deltaTime;
        
        // Randomize attack cooldown slightly (800-1600ms instead of fixed 1200ms)
        const randomCooldown = this.boss.attackCooldown + (Math.random() - 0.5) * 800;
        
        // Attack with randomized timing and patterns
        if (now - this.boss.lastAttack >= randomCooldown) {
            this.boss.lastAttack = now;
            this.boss.attackTimer = 0;
            
            // Screen shake on boss attack
            this.addScreenShake(0.3, 150);
            
            // Randomly select attack pattern instead of cycling (more unpredictable)
            if (!this.boss) return;
            
            // 30% chance to use a random pattern, 70% chance to use next in sequence
            let attackPattern;
            if (Math.random() < 0.3) {
                attackPattern = Math.floor(Math.random() * 4);
            } else {
                attackPattern = (this.boss.attackPattern + 1) % 4;
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
            }
            
            // Random chance (40-60%) to do a second attack immediately
            if (this.boss && Math.random() < (0.4 + Math.random() * 0.2)) {
                // 50% chance to use same pattern, 50% chance to use different pattern
                let secondPattern = attackPattern;
                if (Math.random() < 0.5) {
                    secondPattern = Math.floor(Math.random() * 4);
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
                }
            }
        }
    }
    
    bossAttackDirect() {
        // Direct shot at player with prediction (aims ahead of player)
        if (!this.boss) return;
        
        // Calculate predicted position based on player velocity
        const predictTime = 0.3 + Math.random() * 0.4; // Random prediction time (0.3-0.7s)
        const predictedX = this.player.x + this.player.vx * predictTime;
        const predictedY = this.player.y + this.player.vy * predictTime;
        
        // 70% chance to aim at predicted position, 30% chance to aim at current position
        const targetX = Math.random() < 0.7 ? predictedX : this.player.x;
        const targetY = Math.random() < 0.7 ? predictedY : this.player.y;
        
        // Add slight random offset to make it less predictable
        const offsetAngle = (Math.random() - 0.5) * 0.2; // ±0.1 radians (~±6 degrees)
        const dx = targetX - this.boss.x;
        const dy = targetY - this.boss.y;
        const baseAngle = Math.atan2(dy, dx);
        const angle = baseAngle + offsetAngle;
        
        const damage = 15 * (this.boss.damageMultiplier || 1);
        this.bossProjectiles.push({
            x: this.boss.x,
            y: this.boss.y,
            vx: Math.cos(angle) * 4.5,
            vy: Math.sin(angle) * 4.5,
            radius: 10,
            damage: damage,
            color: '#ff0000'
        });
    }
    
    bossAttackSpread() {
        // Spread shot - 7 projectiles in a cone with prediction
        if (!this.boss) return;
        
        // Calculate predicted position
        const predictTime = 0.2 + Math.random() * 0.3; // Random prediction time (0.2-0.5s)
        const predictedX = this.player.x + this.player.vx * predictTime;
        const predictedY = this.player.y + this.player.vy * predictTime;
        
        // 60% chance to aim at predicted position
        const targetX = Math.random() < 0.6 ? predictedX : this.player.x;
        const targetY = Math.random() < 0.6 ? predictedY : this.player.y;
        
        const dx = targetX - this.boss.x;
        const dy = targetY - this.boss.y;
        const baseAngle = Math.atan2(dy, dx);
        const spread = Math.PI / 5 + Math.random() * 0.2; // Variable spread (36-50 degrees)
        
        const damage = 12 * (this.boss.damageMultiplier || 1);
        for (let i = 0; i < 7; i++) {
            const angle = baseAngle + (i - 3) * (spread / 6);
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * (4.0 + Math.random() * 1.0), // Variable speed (4.0-5.0)
                vy: Math.sin(angle) * (4.0 + Math.random() * 1.0),
                radius: 7.5,
                damage: damage,
                color: '#ff6600'
            });
        }
    }
    
    bossAttackSpiral() {
        // Spiral attack - multiple projectiles in a spiral pattern
        if (!this.boss) return;
        
        const spiralCount = 12; // Increased from 8 to 12
        // Use a rotating base angle that changes each time this attack is called
        const timeBasedAngle = (Date.now() / 50) % (Math.PI * 2);
        
        const damage = 10 * (this.boss.damageMultiplier || 1);
        for (let i = 0; i < spiralCount; i++) {
            const angle = timeBasedAngle + (i * Math.PI * 2 / spiralCount);
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * 3.75, // Increased speed (was 3.125)
                vy: Math.sin(angle) * 3.75,
                radius: 8.75,
                damage: damage,
                color: '#ff00ff'
            });
        }
    }
    
    bossAttackRing() {
        // Ring attack - projectiles in all directions
        if (!this.boss) return;
        
        const ringCount = 16; // Increased from 12 to 16
        
        const damage = 9 * (this.boss.damageMultiplier || 1);
        for (let i = 0; i < ringCount; i++) {
            const angle = (i * Math.PI * 2 / ringCount);
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * 3.75, // Increased speed (was 3.125)
                vy: Math.sin(angle) * 3.75,
                radius: 7.5,
                damage: damage,
                color: '#00ffff'
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
            
            // Move projectile (frame-rate independent)
            const timeFactor = deltaTime / 16.67;
            projectile.x += projectile.vx * timeFactor;
            projectile.y += projectile.vy * timeFactor;
            
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
            
            // Remove if too far from center or if boss is dead
            if (dist > Math.max(this.width, this.height) * 1.5 || !this.boss) {
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
        if (now - this.weapon.lastShot < this.weapon.fireRate) return;
        
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
        
        // Create bullet with trail
        this.bullets.push({
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(angle) * this.weapon.bulletSpeed,
            vy: Math.sin(angle) * this.weapon.bulletSpeed,
            radius: 4,
            damage: this.weapon.damage,
            trail: [] // For bullet trail effect
        });
    }
    
    checkCollisions() {
        // Bullet vs Enemy (optimized with squared distances)
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            const bulletRadius = bullet.radius;
            
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
                    this.bullets.splice(i, 1);
                    
                    // Spawn hit particles
                    this.spawnParticles(enemy.x, enemy.y, 5, 'hit');
                    
                    // Spawn damage number
                    this.spawnDamageNumber(enemy.x, enemy.y - enemy.radius, bullet.damage, false);
                    
                    if (enemy.health <= 0) {
                        // Enemy killed
                        this.kills++; // Increment kill counter
                        
                        const goldReward = enemy.goldReward || 1;
                        this.score += goldReward * 10; // Score is 10x gold for display
                        if (this.onEnemyKill) {
                            this.onEnemyKill(goldReward);
                        }
                        
                        // Spawn death particles
                        this.spawnParticles(enemy.x, enemy.y, 25, 'enemyDeath'); // Increased count for better visibility
                        
                        // Spawn gold popup
                        this.spawnGoldPopup(enemy.x, enemy.y, goldReward);
                        
                        this.enemies.splice(j, 1);
                        
                        // Spawn 1.5x enemies when one is killed (rounded up)
                        const spawnCount = Math.ceil(1 * 1.5); // 2 enemies per kill
                        this.spawnEnemies(spawnCount);
                    }
                    
                    break;
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
                // Player hit by boss projectile
                this.player.health -= projectile.damage;
                this.player.hitFlash = 150; // Flash on hit
                this.bossProjectiles.splice(i, 1);
                
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
        }
    }
    
    start() {
        // Reset game state
        this.state = 'playing';
        this.score = 0;
        this.kills = 0; // Reset kill counter
        this.round = 1; // Reset round
        this.player.health = this.player.maxHealth;
        this.player.hitFlash = 0;
        this.enemies = [];
        this.bullets = [];
        this.boss = null;
        this.bossProjectiles = [];
        this.bossSpawned = false;
        this.lastSpawn = Date.now();
        // Reset camera zoom to starting value
        this.camera.zoom = 2.0;
        this.camera.targetZoom = 2.0;
        // Reset visual effects
        this.particles = [];
        this.damageNumbers = [];
        this.camera.shake = { intensity: 0, duration: 0, currentTime: 0 };
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
            'blood': ['#8b0000', '#a00000', '#cc0000', '#990000', '#660000'] // Darker blood reds
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
        const multiplier = Math.pow(2, round - 1);
        popup.innerHTML = `<div class="round-popup-content"><h2>Round ${round}</h2><p>Mobs are now ${multiplier}x stronger!</p></div>`;
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
    
    spawnGoldPopup(x, y, gold) {
        // Use damage number system for gold popup (different color)
        if (this.damageNumbers.length >= this.maxDamageNumbers) {
            this.damageNumbers.shift();
        }
        
        this.damageNumbers.push({
            x: x,
            y: y,
            startY: y,
            value: `+${gold}`,
            life: 1500,
            maxLife: 1500,
            color: '#ffd700',
            size: 20,
            isGold: true
        });
        
        // Also spawn gold particles
        this.spawnParticles(x, y, 8, 'gold');
    }
    
    render() {
        // Clear canvas with fallback background color
        this.ctx.fillStyle = '#1a1a2e'; // Dark blue-gray background (fallback)
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Transform to camera view (orbital) with screen shake
        this.ctx.save();
        this.ctx.translate(this.width / 2, this.height / 2);
        
        // Apply screen shake offset
        let shakeX = 0;
        let shakeY = 0;
        if (this.camera.shake.currentTime > 0) {
            const shakeAmount = this.camera.shake.intensity * (this.camera.shake.currentTime / this.camera.shake.duration);
            shakeX = (Math.random() - 0.5) * shakeAmount * 10;
            shakeY = (Math.random() - 0.5) * shakeAmount * 10;
        }
        
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);
        
        // Draw background image (moves with camera so player can walk around)
        if (this.imagesLoaded && this.images.background && this.images.background.complete && this.images.background.naturalWidth > 0) {
            const bgWidth = this.images.background.naturalWidth;
            const bgHeight = this.images.background.naturalHeight;
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
        
        // Calculate viewport bounds for culling
        const viewportWidth = this.width / this.camera.zoom;
        const viewportHeight = this.height / this.camera.zoom;
        const viewportLeft = this.camera.x - viewportWidth / 2 - this.viewportMargin;
        const viewportRight = this.camera.x + viewportWidth / 2 + this.viewportMargin;
        const viewportTop = this.camera.y - viewportHeight / 2 - this.viewportMargin;
        const viewportBottom = this.camera.y + viewportHeight / 2 + this.viewportMargin;
        
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
        
        this.ctx.restore();
        
        // Draw damage numbers (screen space, after camera transform)
        this.drawDamageNumbers();
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
        
        // Hit flash effect
        if (this.player.hitFlash > 0) {
            const flashAlpha = (this.player.hitFlash / 150) * 0.5;
            this.ctx.globalAlpha = flashAlpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius * 3.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
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
        
        requestAnimationFrame(() => this.gameLoop());
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
