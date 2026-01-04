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
        this.state = 'menu'; // 'menu', 'playing', 'dead', 'shop'
        this.score = 0;
        this.kills = 0; // Track total enemies killed for difficulty scaling
        
        // Image assets
        this.images = {
            player: {}, // Will hold directional ape images
            normalMob: {}, // Will hold directional normal mob images
            enemy: null, // Fallback enemy image (for fast/big mobs)
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
            targetZoom: 2.0 // Target zoom for smooth transitions
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
            color: '#00ff00'
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
        const totalImages = directions.length * 2 + 5; // 8 player directions + 8 normal mob directions + 1 enemy fallback + 1 bullet + 1 boss + 1 boss bullet + 1 background
        
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
        
        // Load enemy fallback image (for fast/big mobs that use tints)
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
        // Convert rotation angle to direction
        // Rotation is in radians, 0 = right (E), PI/2 = down (S), etc.
        const angle = this.player.rotation;
        const normalized = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        
        // Map angle to 8 directions
        const sector = Math.floor((normalized + Math.PI / 8) / (Math.PI / 4)) % 8;
        const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
        return directions[sector];
    }
    
    getEnemyDirection(enemy) {
        // Calculate direction from enemy to player
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const angle = Math.atan2(dy, dx);
        const normalized = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        
        // Map angle to 8 directions
        const sector = Math.floor((normalized + Math.PI / 8) / (Math.PI / 4)) % 8;
        const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
        return directions[sector];
    }
    
    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
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
        if (this.state !== 'playing') return;
        
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
            // Start at 2.0 (200% zoomed in), zoom out to 1.2 as enemies approach max
            const enemyRatio = Math.min(this.enemies.length / this.maxEnemies, 1);
            this.camera.targetZoom = 2.0 - (enemyRatio * 0.8); // 2.0 to 1.2 (stays zoomed in)
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
        // Every 150 kills = 1.15x multiplier (compounding)
        // 0-149 kills: 1.0x
        // 150-299 kills: 1.15x
        // 300-449 kills: 1.3225x (1.15^2)
        // 450-599 kills: 1.5209x (1.15^3)
        // 600-749 kills: 1.749x (1.15^4)
        // etc.
        const difficultyLevel = Math.floor(this.kills / 150);
        return Math.pow(1.15, difficultyLevel);
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
            
            // Get difficulty multiplier
            const difficultyMultiplier = this.getDifficultyMultiplier();
            
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
                radius = 12;
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
            
            // Apply difficulty multiplier to enemy stats
            this.enemies.push({
                x: x,
                y: y,
                radius: radius * difficultyMultiplier,
                speed: baseSpeed * difficultyMultiplier,
                health: health * difficultyMultiplier,
                maxHealth: health * difficultyMultiplier,
                rotation: rotation, // Track rotation for directional sprites
                color: enemyType === 'big' ? '#8b0000' : (enemyType === 'fast' ? '#ff6600' : '#ff0000'),
                enemyType: enemyType,
                goldReward: goldReward
            });
        }
    }
    
    updateEnemies(deltaTime) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            // Calculate desired movement toward player
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            let moveX = 0;
            let moveY = 0;
            
            if (dist > 0) {
                // Frame-rate independent movement
                const timeFactor = deltaTime / 16.67;
                moveX = (dx / dist) * enemy.speed * timeFactor;
                moveY = (dy / dist) * enemy.speed * timeFactor;
                
                // Update enemy rotation toward player
                enemy.rotation = Math.atan2(dy, dx);
            }
            
            // Check collision with other enemies before moving
            const newX = enemy.x + moveX;
            const newY = enemy.y + moveY;
            
            // Collision detection with other enemies
            let canMove = true;
            for (let j = 0; j < this.enemies.length; j++) {
                if (i === j) continue; // Skip self
                
                const other = this.enemies[j];
                const otherDx = newX - other.x;
                const otherDy = newY - other.y;
                const otherDist = Math.sqrt(otherDx * otherDx + otherDy * otherDy);
                const minDist = enemy.radius + other.radius;
                
                if (otherDist < minDist) {
                    // Collision detected - push away from other enemy
                    if (otherDist > 0) {
                        const pushX = (otherDx / otherDist) * (minDist - otherDist) * 0.5;
                        const pushY = (otherDy / otherDist) * (minDist - otherDist) * 0.5;
                        moveX += pushX;
                        moveY += pushY;
                    }
                }
            }
            
            // Apply movement
            enemy.x += moveX;
            enemy.y += moveY;
            
            // Check collision with player
            const playerDist = Math.sqrt(
                (enemy.x - this.player.x) ** 2 + 
                (enemy.y - this.player.y) ** 2
            );
            
            if (playerDist < enemy.radius + this.player.radius) {
                // Enemy hit player
                this.player.health -= 5;
                this.enemies.splice(i, 1);
                
                if (this.player.health <= 0) {
                    this.player.health = 0;
                    this.die();
                }
            }
        }
    }
    
    spawnBoss() {
        // Clear all existing enemies when boss spawns
        this.enemies = [];
        
        // Spawn boss at center of background
        const difficultyMultiplier = this.getDifficultyMultiplier();
        
        this.boss = {
            x: 0,
            y: 0,
            radius: 40 * difficultyMultiplier,
            health: 10000 * difficultyMultiplier,
            maxHealth: 10000 * difficultyMultiplier,
            speed: 0, // Stationary
            rotation: 0,
            lastAttack: Date.now(),
            attackCooldown: 2000, // 2 seconds between attacks
            attackPattern: 0, // Current attack pattern (0-3)
            attackTimer: 0, // Timer for pattern-specific timing
            color: '#ff0000'
        };
        
        this.bossSpawned = true;
    }
    
    updateBoss(deltaTime) {
        if (!this.boss) return;
        
        // Boss stays stationary and static (no rotation)
        const now = Date.now();
        this.boss.attackTimer += deltaTime;
        
        // Cycle through attack patterns
        if (now - this.boss.lastAttack >= this.boss.attackCooldown) {
            this.boss.lastAttack = now;
            this.boss.attackTimer = 0;
            
            // Execute current attack pattern
            switch (this.boss.attackPattern) {
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
            
            // Cycle to next pattern
            this.boss.attackPattern = (this.boss.attackPattern + 1) % 4;
        }
        
        // Check if boss is dead
        if (this.boss.health <= 0) {
            // Boss defeated - reward gold
            const goldReward = 50;
            this.score += goldReward * 10;
            if (this.onEnemyKill) {
                this.onEnemyKill(goldReward);
            }
            this.boss = null;
        }
    }
    
    bossAttackDirect() {
        // Direct shot at player
        const dx = this.player.x - this.boss.x;
        const dy = this.player.y - this.boss.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        this.bossProjectiles.push({
            x: this.boss.x,
            y: this.boss.y,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3,
            radius: 8,
            damage: 10,
            color: '#ff0000'
        });
    }
    
    bossAttackSpread() {
        // Spread shot - 5 projectiles in a cone
        const dx = this.player.x - this.boss.x;
        const dy = this.player.y - this.boss.y;
        const baseAngle = Math.atan2(dy, dx);
        const spread = Math.PI / 6; // 30 degree spread
        
        for (let i = 0; i < 5; i++) {
            const angle = baseAngle + (i - 2) * (spread / 4);
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3,
                radius: 6,
                damage: 8,
                color: '#ff6600'
            });
        }
    }
    
    bossAttackSpiral() {
        // Spiral attack - multiple projectiles in a spiral pattern
        const spiralCount = 8;
        // Use a rotating base angle that changes each time this attack is called
        const timeBasedAngle = (Date.now() / 50) % (Math.PI * 2);
        
        for (let i = 0; i < spiralCount; i++) {
            const angle = timeBasedAngle + (i * Math.PI * 2 / spiralCount);
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * 2.5,
                vy: Math.sin(angle) * 2.5,
                radius: 7,
                damage: 7,
                color: '#ff00ff'
            });
        }
    }
    
    bossAttackRing() {
        // Ring attack - projectiles in all directions
        const ringCount = 12;
        
        for (let i = 0; i < ringCount; i++) {
            const angle = (i * Math.PI * 2 / ringCount);
            this.bossProjectiles.push({
                x: this.boss.x,
                y: this.boss.y,
                vx: Math.cos(angle) * 2.5,
                vy: Math.sin(angle) * 2.5,
                radius: 6,
                damage: 6,
                color: '#00ffff'
            });
        }
    }
    
    updateBossProjectiles(deltaTime) {
        for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.bossProjectiles[i];
            
            // Move projectile (frame-rate independent)
            const timeFactor = deltaTime / 16.67;
            projectile.x += projectile.vx * timeFactor;
            projectile.y += projectile.vy * timeFactor;
            
            // Remove if too far from boss
            const dist = Math.sqrt(
                (projectile.x - this.boss.x) ** 2 + 
                (projectile.y - this.boss.y) ** 2
            );
            
            if (dist > Math.max(this.width, this.height) * 1.5) {
                this.bossProjectiles.splice(i, 1);
            }
        }
    }
    
    updateBullets(deltaTime) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            // Move bullet (frame-rate independent)
            const timeFactor = deltaTime / 16.67;
            bullet.x += bullet.vx * timeFactor;
            bullet.y += bullet.vy * timeFactor;
            
            // Remove if too far
            const dist = Math.sqrt(
                (bullet.x - this.player.x) ** 2 + 
                (bullet.y - this.player.y) ** 2
            );
            
            if (dist > Math.max(this.width, this.height) * 0.8) {
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
        
        // Create bullet
        this.bullets.push({
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(angle) * this.weapon.bulletSpeed,
            vy: Math.sin(angle) * this.weapon.bulletSpeed,
            radius: 4,
            damage: this.weapon.damage
        });
    }
    
    checkCollisions() {
        // Bullet vs Enemy
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                
                const dist = Math.sqrt(
                    (bullet.x - enemy.x) ** 2 + 
                    (bullet.y - enemy.y) ** 2
                );
                
                if (dist < bullet.radius + enemy.radius) {
                    // Hit!
                    enemy.health -= bullet.damage;
                    this.bullets.splice(i, 1);
                    
                    if (enemy.health <= 0) {
                        // Enemy killed
                        this.kills++; // Increment kill counter
                        
                        const goldReward = enemy.goldReward || 1;
                        this.score += goldReward * 10; // Score is 10x gold for display
                        if (this.onEnemyKill) {
                            this.onEnemyKill(goldReward);
                        }
                        
                        this.enemies.splice(j, 1);
                        
                        // Spawn 1.5x enemies when one is killed (rounded up)
                        const spawnCount = Math.ceil(1 * 1.5); // 2 enemies per kill
                        this.spawnEnemies(spawnCount);
                    }
                    
                    break;
                }
            }
            
            // Bullet vs Boss
            if (this.boss) {
                const dist = Math.sqrt(
                    (bullet.x - this.boss.x) ** 2 + 
                    (bullet.y - this.boss.y) ** 2
                );
                
                if (dist < bullet.radius + this.boss.radius) {
                    // Hit boss!
                    this.boss.health -= bullet.damage;
                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }
        
        // Boss Projectile vs Player
        for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.bossProjectiles[i];
            
            const dist = Math.sqrt(
                (projectile.x - this.player.x) ** 2 + 
                (projectile.y - this.player.y) ** 2
            );
            
            if (dist < projectile.radius + this.player.radius) {
                // Player hit by boss projectile
                this.player.health -= projectile.damage;
                this.bossProjectiles.splice(i, 1);
                
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
        this.player.health = this.player.maxHealth;
        this.enemies = [];
        this.bullets = [];
        this.boss = null;
        this.bossProjectiles = [];
        this.bossSpawned = false;
        this.lastSpawn = Date.now();
        // Reset camera zoom to starting value
        this.camera.zoom = 2.0;
        this.camera.targetZoom = 2.0;
    }
    
    die() {
        this.state = 'dead';
        if (this.onPlayerDeath) {
            this.onPlayerDeath(this.score);
        }
    }
    
    render() {
        // Clear canvas with fallback background color
        this.ctx.fillStyle = '#1a1a2e'; // Dark blue-gray background (fallback)
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Transform to camera view (orbital)
        this.ctx.save();
        this.ctx.translate(this.width / 2, this.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
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
        
        // Draw enemies
        this.enemies.forEach(enemy => {
            this.drawEnemy(enemy);
        });
        
        // Draw boss
        if (this.boss) {
            this.drawBoss();
        }
        
        // Draw bullets
        this.bullets.forEach(bullet => {
            this.drawBullet(bullet);
        });
        
        // Draw boss projectiles
        this.bossProjectiles.forEach(projectile => {
            this.drawBossProjectile(projectile);
        });
        
        // Draw player
        this.drawPlayer();
        
        this.ctx.restore();
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
        if (!this.imagesLoaded) {
            // Fallback: draw circle while images load
            this.ctx.fillStyle = this.player.color;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
            this.ctx.fill();
            return;
        }
        
        const direction = this.getPlayerDirection();
        const img = this.images.player[direction];
        
        if (img && img.complete && img.naturalWidth > 0) {
            const size = this.player.radius * 3.5; // Larger size for better visibility
            this.ctx.save();
            // Ensure transparency is preserved
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.translate(this.player.x, this.player.y);
            // Draw image with transparency preserved (PNG alpha channel)
            this.ctx.drawImage(img, -size / 2, -size / 2, size, size);
            this.ctx.restore();
        } else {
            // Fallback: draw circle if image not ready
            this.ctx.fillStyle = this.player.color;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawEnemy(enemy) {
        // Increased size multiplier for better visibility
        const size = enemy.radius * 3.5;
        
        this.ctx.save();
        
        // Scale for big enemies
        const scale = enemy.enemyType === 'big' ? 1.5 : 1.0;
        
        // Use directional sprites for ALL mob types (normal, fast, big)
        if (this.imagesLoaded && this.images.normalMob) {
            const direction = this.getEnemyDirection(enemy);
            const img = this.images.normalMob[direction];
            
            if (img && img.complete && img.naturalWidth > 0) {
                // Draw normal mob directional sprite for all enemy types
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.drawImage(
                    img,
                    enemy.x - (size * scale) / 2,
                    enemy.y - (size * scale) / 2,
                    size * scale,
                    size * scale
                );
                
                // Apply visual effects based on enemy type
                if (enemy.enemyType === 'fast') {
                    // Orange tint for fast enemies
                    this.ctx.globalCompositeOperation = 'overlay';
                    this.ctx.fillStyle = 'rgba(255, 165, 0, 0.4)';
                    this.ctx.fillRect(enemy.x - (size * scale) / 2, enemy.y - (size * scale) / 2, size * scale, size * scale);
                    this.ctx.globalCompositeOperation = 'source-over';
                    
                    // Draw outline for fast enemies
                    this.ctx.strokeStyle = '#ffaa00';
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.arc(enemy.x, enemy.y, (size * scale) / 2, 0, Math.PI * 2);
                    this.ctx.stroke();
                } else if (enemy.enemyType === 'big') {
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
                    
                    // Draw thick outline for big enemies
                    this.ctx.strokeStyle = '#8b0000';
                    this.ctx.lineWidth = 4;
                    this.ctx.beginPath();
                    this.ctx.arc(enemy.x, enemy.y, (size * scale) / 2, 0, Math.PI * 2);
                    this.ctx.stroke();
                }
                
                this.ctx.restore();
                return; // Early return after drawing sprite
            }
        }
        
        // Fallback: use enemy image if normal mob sprites aren't loaded
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
            if (enemy.enemyType === 'fast') {
                this.ctx.globalCompositeOperation = 'overlay';
                this.ctx.fillStyle = 'rgba(255, 165, 0, 0.4)'; // Orange tint
                this.ctx.fillRect(enemy.x - (size * scale) / 2, enemy.y - (size * scale) / 2, size * scale, size * scale);
                this.ctx.globalCompositeOperation = 'source-over';
                
                // Draw outline for fast enemies
                this.ctx.strokeStyle = '#ffaa00';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(enemy.x, enemy.y, (size * scale) / 2, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (enemy.enemyType === 'big') {
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
                
                // Draw thick outline for big enemies
                this.ctx.strokeStyle = '#8b0000';
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.arc(enemy.x, enemy.y, (size * scale) / 2, 0, Math.PI * 2);
                this.ctx.stroke();
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
            
            // Draw outline - different color/style for different types
            if (enemy.enemyType === 'fast') {
                this.ctx.strokeStyle = '#ffaa00';
                this.ctx.lineWidth = 3;
            } else if (enemy.enemyType === 'big') {
                this.ctx.strokeStyle = '#8b0000';
                this.ctx.lineWidth = 4;
                
                // Health bar for big enemies (fallback)
                const barWidth = enemy.radius * 2;
                const barHeight = 6;
                const barX = enemy.x - enemy.radius;
                const barY = enemy.y - enemy.radius - 12;
                
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                
                const healthPercent = enemy.health / enemy.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : (healthPercent > 0.25 ? '#ffff00' : '#ff0000');
                this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            } else {
                this.ctx.strokeStyle = '#ff6666';
                this.ctx.lineWidth = 2;
            }
            
            this.ctx.strokeRect(
                enemy.x - enemy.radius,
                enemy.y - enemy.radius,
                enemy.radius * 2,
                enemy.radius * 2
            );
            
            this.ctx.restore();
        }
    }
    
    drawBullet(bullet) {
        if (this.imagesLoaded && this.images.bullet && this.images.bullet.complete && this.images.bullet.naturalWidth > 0) {
            // Draw bullet sprite - enlarged for better visibility
            const size = bullet.radius * 4;
            this.ctx.save();
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
            this.ctx.restore();
        } else {
            // Fallback: draw circle while bullet sprite loads (also enlarged)
            const radius = bullet.radius * 2;
            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawBoss() {
        if (!this.boss) return;
        
        this.ctx.save();
        
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
        this.player.x = 0;
        this.player.y = 0;
        this.player.health = this.player.maxHealth;
        this.enemies = [];
        this.bullets = [];
        this.boss = null;
        this.bossProjectiles = [];
        this.bossSpawned = false;
        this.lastSpawn = 0;
        // Reset camera zoom to starting value
        this.camera.zoom = 2.0;
        this.camera.targetZoom = 2.0;
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
