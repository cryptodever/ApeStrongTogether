/**
 * Retro Orbital Game Engine
 * Canvas-based shooter with orbital view
 */

export class Game {
    constructor(canvas, onEnemyKill, onPlayerDeath) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onEnemyKill = onEnemyKill; // Callback for when enemy is killed
        this.onPlayerDeath = onPlayerDeath; // Callback for when player dies
        
        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Game state
        this.state = 'playing'; // 'playing', 'dead', 'shop'
        this.score = 0;
        
        // Camera (orbital view)
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1
        };
        
        // Player
        this.player = {
            x: 0,
            y: 0,
            radius: 15,
            health: 100,
            maxHealth: 100,
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
        
        // Update camera to follow player
        this.camera.x = this.player.x;
        this.camera.y = this.player.y;
        
        // Spawn enemies
        this.spawnEnemies();
        
        // Update enemies
        this.updateEnemies(deltaTime);
        
        // Update bullets
        this.updateBullets();
        
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
        
        // Apply movement
        this.player.x += dx * this.player.speed;
        this.player.y += dy * this.player.speed;
        
        // Rotate player toward mouse
        const screenX = this.mouse.x - this.width / 2;
        const screenY = this.mouse.y - this.height / 2;
        this.player.rotation = Math.atan2(screenY, screenX);
    }
    
    spawnEnemies(count = 1) {
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
            
            // Random chance for faster enemy (1.5x speed) - 25% chance
            const isFast = Math.random() < 0.25;
            const baseSpeed = 1.5;
            const speed = isFast ? baseSpeed * 1.5 : baseSpeed;
            
            this.enemies.push({
                x: x,
                y: y,
                radius: 12,
                speed: speed,
                health: 1,
                color: isFast ? '#ff6600' : '#ff0000', // Orange for fast, red for normal
                isFast: isFast
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
                moveX = (dx / dist) * enemy.speed;
                moveY = (dy / dist) * enemy.speed;
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
    
    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            // Move bullet
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            
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
        
        // Calculate direction from player to mouse (in world coordinates)
        const screenX = this.mouse.x - this.width / 2;
        const screenY = this.mouse.y - this.height / 2;
        const angle = Math.atan2(screenY, screenX);
        
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
                        this.enemies.splice(j, 1);
                        this.score += 10;
                        if (this.onEnemyKill) {
                            this.onEnemyKill(10); // 10 gold per kill
                        }
                        
                        // Spawn 1.5x enemies when one is killed (rounded up)
                        const spawnCount = Math.ceil(1 * 1.5); // 2 enemies per kill
                        this.spawnEnemies(spawnCount);
                    }
                    
                    break;
                }
            }
        }
    }
    
    die() {
        this.state = 'dead';
        if (this.onPlayerDeath) {
            this.onPlayerDeath(this.score);
        }
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Transform to camera view (orbital)
        this.ctx.save();
        this.ctx.translate(this.width / 2, this.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Draw grid background (optional, for retro feel)
        this.drawGrid();
        
        // Draw enemies
        this.enemies.forEach(enemy => {
            this.drawEnemy(enemy);
        });
        
        // Draw bullets
        this.bullets.forEach(bullet => {
            this.drawBullet(bullet);
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
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        this.ctx.rotate(this.player.rotation);
        
        // Draw player body (circle)
        this.ctx.fillStyle = this.player.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw gun (line pointing forward)
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.player.radius, 0);
        this.ctx.lineTo(this.player.radius + 10, 0);
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawEnemy(enemy) {
        // Draw enemy (square for "suit")
        this.ctx.fillStyle = enemy.color;
        this.ctx.fillRect(
            enemy.x - enemy.radius,
            enemy.y - enemy.radius,
            enemy.radius * 2,
            enemy.radius * 2
        );
        
        // Draw outline - different color for fast enemies
        if (enemy.isFast) {
            this.ctx.strokeStyle = '#ffaa00'; // Brighter orange for fast enemies
            this.ctx.lineWidth = 3; // Thicker outline for fast enemies
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
    }
    
    drawBullet(bullet) {
        this.ctx.fillStyle = '#ffff00';
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        this.ctx.fill();
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
        this.player.x = 0;
        this.player.y = 0;
        this.player.health = this.player.maxHealth;
        this.enemies = [];
        this.bullets = [];
        this.lastSpawn = 0;
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
