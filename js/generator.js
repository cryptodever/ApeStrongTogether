// ============================================
// PROFILE PICTURE GENERATOR - PREMIUM VERSION

// Import base URL helper for route-safe asset paths
import { withBase } from './base-url.js';
        // ============================================
        // High-resolution export: 2048Ã—2048 PNG
        // Preloaded assets, layer locking, randomization
        // ============================================

        // Configuration
        const CONFIG = {
            PREVIEW_SIZE: 512,      // Display canvas size
            EXPORT_SIZE: 2048,      // High-res export size (always 2048x2048)
            
            // Fixed Safe Area (for 2048x2048 canvas) - adjusted for better ape fitting
            SAFE_W: 0.85 * 2048,    // Safe area width: 1740.8
            SAFE_H: 0.85 * 2048,    // Safe area height: 1740.8
            SAFE_X: (2048 - (0.85 * 2048)) / 2,  // Safe area X: 153.6
            SAFE_Y: (2048 - (0.85 * 2048)) / 2,  // Safe area Y: 153.6
            
            // Anchor point (bbox center target) - centered for better balance
            ANCHOR_X: 1024,         // Center X
            ANCHOR_Y: 1024,        // Center Y for even vertical distribution
            
            // Alpha threshold for bbox detection
            ALPHA_THRESHOLD: 10,    // Pixels with alpha > 10 are considered non-transparent
        };
        
        // Bounding box cache
        const bboxCache = {};
        
        // Safe Area Calculator (scales for preview/export)
        function getSafeArea(canvasSize) {
            const scale = canvasSize / CONFIG.EXPORT_SIZE;
            return {
                x: CONFIG.SAFE_X * scale,
                y: CONFIG.SAFE_Y * scale,
                width: CONFIG.SAFE_W * scale,
                height: CONFIG.SAFE_H * scale
            };
        }
        
        // Get anchor point (scales for preview/export)
        function getAnchor(canvasSize) {
            const scale = canvasSize / CONFIG.EXPORT_SIZE;
            return {
                x: CONFIG.ANCHOR_X * scale,
                y: CONFIG.ANCHOR_Y * scale
            };
        }
        
        // Compute bounding box of non-transparent pixels
        function computeBoundingBox(img) {
            // Check cache first
            if (bboxCache[img.src]) {
                return bboxCache[img.src];
            }
            
            // Create temporary canvas to scan pixels
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0);
            
            // Get image data
            const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            
            // Find bounding box
            let minX = img.width;
            let minY = img.height;
            let maxX = 0;
            let maxY = 0;
            
            for (let y = 0; y < img.height; y++) {
                for (let x = 0; x < img.width; x++) {
                    const alpha = data[(y * img.width + x) * 4 + 3];
                    if (alpha > CONFIG.ALPHA_THRESHOLD) {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }
            
            // If no non-transparent pixels found, use full image
            if (minX > maxX || minY > maxY) {
                minX = 0;
                minY = 0;
                maxX = img.width;
                maxY = img.height;
            }
            
            const bbox = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2
            };
            
            // Cache the result
            bboxCache[img.src] = bbox;
            
            return bbox;
        }
        
        // Scale and position ape using bbox normalization (LAYERED MODE)
        function scaleAndPositionApe(img, safeArea, anchor, canvasSize) {
            // Compute bounding box
            const bbox = computeBoundingBox(img);
            
            // Scale factor to fit bbox within safe area (contain behavior)
            // This ensures the image fits within the safe area while maintaining aspect ratio
            const scale = Math.min(safeArea.width / bbox.width, safeArea.height / bbox.height);
            
            // Scaled bbox dimensions
            const scaledBboxW = bbox.width * scale;
            const scaledBboxH = bbox.height * scale;
            
            // Full image scale - maintain aspect ratio by using the same scale for both dimensions
            const fullScale = scale;
            const drawWidth = img.width * fullScale;
            const drawHeight = img.height * fullScale;
            
            // Calculate the offset from image top-left to bbox center
            const bboxOffsetX = bbox.centerX;
            const bboxOffsetY = bbox.centerY;
            
            // Final draw position (anchor - scaled bbox center offset)
            const finalX = anchor.x - (bboxOffsetX * scale);
            const finalY = anchor.y - (bboxOffsetY * scale);
            
            return {
                x: finalX,
                y: finalY,
                width: drawWidth,
                height: drawHeight,
                bbox: {
                    x: anchor.x - scaledBboxW / 2,
                    y: anchor.y - scaledBboxH / 2,
                    width: scaledBboxW,
                    height: scaledBboxH,
                    centerX: anchor.x,
                    centerY: anchor.y
                },
                originalBbox: bbox
            };
        }
        
        // Scale and position ape using COVER behavior (BAKED MODE)
        function scaleAndPositionApeBaked(img, canvasSize, anchorOffset) {
            const canvasW = canvasSize;
            const canvasH = canvasSize;
            const imgW = img.width;
            const imgH = img.height;
            
            // Cover behavior: scale = max(canvasW/imgW, canvasH/imgH)
            const scale = Math.max(canvasW / imgW, canvasH / imgH);
            
            // Scaled image dimensions
            const scaledW = imgW * scale;
            const scaledH = imgH * scale;
            
            // Center the scaled image
            let dx = (canvasW - scaledW) / 2;
            let dy = (canvasH - scaledH) / 2;
            
            // Apply anchor offsets (scaled for current canvas size)
            const offsetScale = canvasSize / CONFIG.EXPORT_SIZE;
            dx += anchorOffset.x * offsetScale;
            dy += anchorOffset.y * offsetScale;
            
            return {
                x: dx,
                y: dy,
                width: scaledW,
                height: scaledH,
                scale: scale,
                // Crop bounds (what's visible on canvas)
                cropBounds: {
                    x: Math.max(0, -dx / scale),
                    y: Math.max(0, -dy / scale),
                    width: Math.min(imgW, canvasW / scale),
                    height: Math.min(imgH, canvasH / scale)
                }
            };
        }

        // State management with layer locking
        const state = {
            locks: {
                background: false,
                ape: false,
                accessories: false,
                text: false
            },
            renderMode: 'layered', // 'layered' or 'baked'
            useBakedBackground: false, // In baked mode: true = use baked bg, false = use selected bg
            background: {
                image: '/pfp_generator_images/pfp_bg1.png'
            },
            ape: {
                type: 'ape1'
            },
            // Per-ape anchor offsets for baked mode (in pixels, relative to 2048x2048)
            // Adjust these values to shift the cover crop position for each ape
            // Positive X = shift right, Positive Y = shift down
            // Example: { x: 50, y: -30 } shifts 50px right, 30px up
            apeAnchorOffsets: {
                ape1: { x: 0, y: 0 },
                ape2: { x: 0, y: 0 },
                ape3: { x: 0, y: 0 },
                ape4: { x: 0, y: 0 },
                ape5: { x: 0, y: 0 },
                ape6: { x: 0, y: 0 },
                ape7: { x: 0, y: 0 }
            },
            accessories: {
                hat: 'none',
                glasses: 'none',
                jewelry: 'none'
            },
            text: {
                content: '',
                font: 'Inter',
                color: '#ffffff',
                position: 'top',
                size: 40
            },
            debug: false  // Debug overlay toggle
        };

        // Image cache
        const imageCache = {
            backgrounds: {},
            apes: {}
        };

        // Canvas setup
        const canvas = document.getElementById('profileCanvas');
        const ctx = canvas.getContext('2d');
        
        // Set preview canvas to 2048x2048 bitmap (CSS will scale it down for display)
        canvas.width = 2048;
        canvas.height = 2048;
        
        // Optimize canvas rendering for iOS
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // High-resolution render canvas (lazy-loaded to save memory on iOS)
        let renderCanvas = null;
        let renderCtx = null;
        
        function getRenderCanvas() {
            // Only create high-res canvas when needed (iOS memory optimization)
            if (!renderCanvas) {
                renderCanvas = document.createElement('canvas');
                renderCanvas.width = CONFIG.EXPORT_SIZE;
                renderCanvas.height = CONFIG.EXPORT_SIZE;
                renderCtx = renderCanvas.getContext('2d');
                renderCtx.imageSmoothingEnabled = true;
                renderCtx.imageSmoothingQuality = 'high';
            }
            return { canvas: renderCanvas, ctx: renderCtx };
        }
        
        function cleanupRenderCanvas() {
            // Clean up render canvas after export to free memory (iOS optimization)
            if (renderCanvas) {
                renderCtx = null;
                renderCanvas.width = 0;
                renderCanvas.height = 0;
                renderCanvas = null;
            }
        }

        // ============================================
        // IMAGE LOADING & PRELOADING
        // ============================================

        function loadImage(src) {
            return new Promise((resolve, reject) => {
                // Normalize path: if it's already absolute (starts with /), use withBase() to ensure route safety
                // If it's relative (starts with ../), convert to absolute first, then use withBase()
                let normalizedSrc = src;
                if (src.startsWith('../')) {
                    // Convert relative path to absolute from root
                    // e.g., "../pfp_generator_images/bg1.png" -> "/pfp_generator_images/bg1.png"
                    normalizedSrc = '/' + src.replace(/^\.\.\//, '');
                }
                const resolvedSrc = src.startsWith('http') || src.startsWith('data:') 
                    ? src 
                    : withBase(normalizedSrc);
                
                if (imageCache.backgrounds[src] || imageCache.apes[src]) {
                    resolve(imageCache.backgrounds[src] || imageCache.apes[src]);
                    return;
                }
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                // iOS optimization: decode image asynchronously
                img.onload = () => {
                    // Use decode() API for better iOS performance if available
                    const processImage = () => {
                        if (src.includes('pfp_bg')) {
                            imageCache.backgrounds[src] = img;
                        } else {
                            imageCache.apes[src] = img;
                            // Pre-compute and cache bbox for ape images
                            computeBoundingBox(img);
                        }
                        resolve(img);
                    };
                    
                    if (img.decode) {
                        img.decode().then(() => {
                            processImage();
                        }).catch(() => {
                            // Fallback if decode fails
                            processImage();
                        });
                    } else {
                        // Fallback for browsers without decode() support
                        processImage();
                    }
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${resolvedSrc}`);
                    reject(new Error(`Failed to load: ${resolvedSrc}`));
                };
                // Use resolved path for actual image loading
                img.src = resolvedSrc;
            });
        }

        function getApeImagePath(apeType) {
            // New naming convention: ape_pfp_1.png, ape_pfp_2.png, etc.
            // Return absolute path from root - will be resolved with withBase() in loadImage()
            const apeNumber = apeType.slice(-1); // Extract number from 'ape1', 'ape2', etc.
            return `/pfp_generator_apes/ape_pfp_${apeNumber}.png`;
        }

        async function preloadAllImages() {
            const loadingIndicator = document.getElementById('loadingIndicator');
            loadingIndicator.classList.remove('hide');
            loadingIndicator.classList.add('show');
            
            const imagesToLoad = [];
            
            // Preload backgrounds - use absolute paths from root
            for (let i = 1; i <= 8; i++) {
                imagesToLoad.push(loadImage(`/pfp_generator_images/pfp_bg${i}.png`));
            }
            
            // Preload all ape images (7 apes)
            const apeTypes = ['ape1', 'ape2', 'ape3', 'ape4', 'ape5', 'ape6', 'ape7'];
            for (const apeType of apeTypes) {
                const path = getApeImagePath(apeType);
                imagesToLoad.push(loadImage(path));
            }
            
            try {
                // iOS optimization: Load in batches to prevent memory spikes
                const batchSize = 4;
                for (let i = 0; i < imagesToLoad.length; i += batchSize) {
                    const batch = imagesToLoad.slice(i, i + batchSize);
                    await Promise.all(batch);
                    // Small delay between batches to allow iOS to process
                    if (i + batchSize < imagesToLoad.length) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
                loadingIndicator.classList.add('hide');
                loadingIndicator.classList.remove('show');
                render();
            } catch (error) {
                console.error('Some images failed to load:', error);
                loadingIndicator.classList.add('hide');
                loadingIndicator.classList.remove('show');
                render();
            }
        }

        // ============================================
        // DETERMINISTIC RENDERING PIPELINE
        // ============================================

        // Helper: Draw image with CSS cover behavior
        function drawCover(ctx, img, x, y, w, h) {
            if (!img) return false;
            
            // Cover behavior: scale = max(canvasW/imgW, canvasH/imgH)
            const scale = Math.max(w / img.width, h / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            
            // Center the scaled image
            const dx = x + (w - dw) / 2;
            const dy = y + (h - dh) / 2;
            
            ctx.drawImage(img, dx, dy, dw, dh);
            return true;
        }

        // Single deterministic render pipeline - always renders at 2048x2048 internally
        function renderFinal(targetCanvas, targetCtx, state) {
            const CANVAS_SIZE = 2048; // Always use 2048x2048 internally
            
            // Ensure canvas is exactly 2048x2048 (actual bitmap size, not CSS)
            if (targetCanvas.width !== CANVAS_SIZE || targetCanvas.height !== CANVAS_SIZE) {
                targetCanvas.width = CANVAS_SIZE;
                targetCanvas.height = CANVAS_SIZE;
                targetCtx.imageSmoothingEnabled = true;
                targetCtx.imageSmoothingQuality = 'high';
            }
            
            // Clear canvas to transparent
            targetCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            
            // Calculate safe area
            const safeArea = getSafeArea(CANVAS_SIZE);
            const anchor = getAnchor(CANVAS_SIZE);
            
            // LAYER 1: Background (always drawn if selected, or fallback if no baked background)
            if (state.renderMode === 'layered' || !state.useBakedBackground) {
                const bgPath = state.background.image;
                const bgImg = imageCache.backgrounds[bgPath];
                if (!drawCover(targetCtx, bgImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE)) {
                    // Fallback: solid color
                    targetCtx.fillStyle = '#1a1a1a';
                    targetCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                }
            }
            
            // LAYER 2: Ape layer
            const apeType = state.ape.type;
            const apePath = getApeImagePath(apeType);
            const apeImg = imageCache.apes[apePath];
            let apeBounds = null;
            let apeBbox = null;
            let bakedBounds = null;
            
            if (apeImg) {
                if (state.renderMode === 'layered') {
                    // Layered Mode: transparent ape with bbox normalization
                    const normalized = scaleAndPositionApe(apeImg, safeArea, anchor, CANVAS_SIZE);
                    
                    apeBounds = {
                        x: normalized.x,
                        y: normalized.y,
                        width: normalized.width,
                        height: normalized.height
                    };
                    
                    apeBbox = normalized.bbox;
                    
                    // Draw the transparent ape image
                    targetCtx.drawImage(
                        apeImg,
                        normalized.x,
                        normalized.y,
                        normalized.width,
                        normalized.height
                    );
                } else {
                    // Baked Mode: full image with cover behavior
                    const anchorOffset = state.apeAnchorOffsets[apeType] || { x: 0, y: 0 };
                    bakedBounds = scaleAndPositionApeBaked(apeImg, CANVAS_SIZE, anchorOffset);
                    
                    apeBounds = {
                        x: bakedBounds.x,
                        y: bakedBounds.y,
                        width: bakedBounds.width,
                        height: bakedBounds.height
                    };
                    
                    // Draw the baked ape image (may include background)
                    targetCtx.drawImage(
                        apeImg,
                        bakedBounds.x,
                        bakedBounds.y,
                        bakedBounds.width,
                        bakedBounds.height
                    );
                }
            }
            
            // LAYER 3: Accessories (only in layered mode)
            if (state.renderMode === 'layered' && apeBounds && apeBbox) {
                drawAccessories(targetCtx, CANVAS_SIZE, safeArea, apeBounds, apeBbox);
            }
            
            // LAYER 4: Text overlay
            drawText(targetCtx, CANVAS_SIZE);
            
            // LAYER 5: Debug overlay (if enabled)
            if (state.debug || CONFIG.DEBUG_OVERLAY) {
                if (state.renderMode === 'layered') {
                    drawDebugOverlay(targetCtx, CANVAS_SIZE, safeArea, apeBbox, anchor, null, 'layered');
                } else {
                    drawDebugOverlay(targetCtx, CANVAS_SIZE, null, null, null, bakedBounds, 'baked');
                }
            }
        }

        // Debounce render calls for iOS performance (preview only)
        let renderFrameId = null;
        let pendingRender = false;

        function render() {
            // For preview renders, debounce using requestAnimationFrame
            if (renderFrameId !== null) {
                pendingRender = true;
                return;
            }
            
            renderFrameId = requestAnimationFrame(() => {
                // Update preview canvas using same render function
                renderFinal(canvas, ctx, state);
                
                // Apply subtle animation effect
                canvas.classList.add('updating');
                setTimeout(() => {
                    canvas.classList.remove('updating');
                }, 150);
                
                renderFrameId = null;
                if (pendingRender) {
                    pendingRender = false;
                    render();
                }
            });
        }

        // Legacy function for compatibility (now uses renderFinal)
        function renderImmediate(targetCtx = ctx, targetSize = CONFIG.PREVIEW_SIZE, animate = true) {
            // Subtle animation on preview canvas (using RAF for iOS)
            if (animate && targetCtx === ctx) {
                canvas.classList.add('updating');
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        canvas.classList.remove('updating');
                    }, 150);
                });
            }
            
            // Clear canvas
            targetCtx.clearRect(0, 0, targetSize, targetSize);
            
            // MODE 1: Layered Mode (background + transparent ape)
            if (state.renderMode === 'layered') {
                // Calculate safe area for this canvas size
                const safeArea = getSafeArea(targetSize);
                
                // Layer 1: Background (COVER - fills entire canvas)
                const bgPath = state.background.image;
                const bgImg = imageCache.backgrounds[bgPath];
                if (bgImg) {
                    // Cover behavior: scale to fill canvas
                    const bgScale = Math.max(targetSize / bgImg.width, targetSize / bgImg.height);
                    const bgDrawWidth = bgImg.width * bgScale;
                    const bgDrawHeight = bgImg.height * bgScale;
                    const bgDrawX = (targetSize - bgDrawWidth) / 2;
                    const bgDrawY = (targetSize - bgDrawHeight) / 2;
                    
                    targetCtx.drawImage(bgImg, bgDrawX, bgDrawY, bgDrawWidth, bgDrawHeight);
                } else {
                    targetCtx.fillStyle = '#1a1a1a';
                    targetCtx.fillRect(0, 0, targetSize, targetSize);
                }
                
                // Layer 2: Ape (normalized using bbox, anchored to anchor point)
                const apeType = state.ape.type;
                const apePath = getApeImagePath(apeType);
                const apeImg = imageCache.apes[apePath];
                let apeBounds = null;
                let apeBbox = null;
                
                if (apeImg) {
                    const anchor = getAnchor(targetSize);
                    const normalized = scaleAndPositionApe(apeImg, safeArea, anchor, targetSize);
                    
                    apeBounds = {
                        x: normalized.x,
                        y: normalized.y,
                        width: normalized.width,
                        height: normalized.height
                    };
                    
                    apeBbox = normalized.bbox;
                    
                    // Draw the ape image
                    targetCtx.drawImage(
                        apeImg,
                        normalized.x,
                        normalized.y,
                        normalized.width,
                        normalized.height
                    );
                }
                
                // Layer 3: Accessories (anchored to bbox)
                if (apeBounds && apeBbox) {
                    drawAccessories(targetCtx, targetSize, safeArea, apeBounds, apeBbox);
                }
                
                // Layer 4: Text
                drawText(targetCtx, targetSize);
                
                // Debug overlay (if enabled)
                if (state.debug || CONFIG.DEBUG_OVERLAY) {
                    drawDebugOverlay(targetCtx, targetSize, safeArea, apeBbox, getAnchor(targetSize), null, 'layered');
                }
            }
            // MODE 2: Baked Mode (single image with background included)
            else {
                const apeType = state.ape.type;
                const apePath = getApeImagePath(apeType);
                const apeImg = imageCache.apes[apePath];
                let bakedBounds = null;
                
                if (apeImg) {
                    // Get anchor offset for this ape
                    const anchorOffset = state.apeAnchorOffsets[apeType] || { x: 0, y: 0 };
                    bakedBounds = scaleAndPositionApeBaked(apeImg, targetSize, anchorOffset);
                    
                    // Draw the baked ape image (includes background)
                    targetCtx.drawImage(
                        apeImg,
                        bakedBounds.x,
                        bakedBounds.y,
                        bakedBounds.width,
                        bakedBounds.height
                    );
                } else {
                    // Fallback: solid color
                    targetCtx.fillStyle = '#1a1a1a';
                    targetCtx.fillRect(0, 0, targetSize, targetSize);
                }
                
                // Layer 3: Accessories (disabled in baked mode - image already includes them)
                // Note: If you want accessories in baked mode, you'd need to draw them here
                // but typically baked images already include accessories
                
                // Layer 4: Text
                drawText(targetCtx, targetSize);
                
                // Debug overlay (if enabled)
                if (state.debug || CONFIG.DEBUG_OVERLAY) {
                    drawDebugOverlay(targetCtx, targetSize, null, null, null, bakedBounds, 'baked');
                }
            }
        }

        function drawAccessories(targetCtx = ctx, targetSize = CONFIG.PREVIEW_SIZE, safeArea = null, apeBounds = null, apeBbox = null) {
            if (!apeBounds || !safeArea || !apeBbox) {
                return;
            }
            
            // Use bbox-based positioning (no hard-coded offsets)
            const bboxTop = apeBbox.y;
            const bboxBottom = apeBbox.y + apeBbox.height;
            const bboxCenterX = apeBbox.centerX;
            const bboxHeight = apeBbox.height;
            const bboxWidth = apeBbox.width;
            
            // Accessory anchor points (relative to bbox, as specified)
            // Hats anchor to top of bbox
            const hatY = bboxTop;
            
            // Eye-line estimated as bboxY + 0.38 * bboxH
            const eyeY = apeBbox.y + (bboxHeight * 0.38);
            
            // Mask/chin area estimated as bboxY + 0.52 * bboxH
            const maskY = apeBbox.y + (bboxHeight * 0.52);
            
            // Neck/jewelry area (lower on bbox)
            const neckY = apeBbox.y + (bboxHeight * 0.65);
            const neckRadius = bboxWidth * 0.25; // 25% of bbox width
            
            // Eye spacing (15% of bbox width between eyes)
            const eyeSpacing = bboxWidth * 0.15;

            // Draw hat (anchored to top of bbox)
            if (state.accessories.hat === 'cap') {
                const hatWidth = bboxWidth * 0.9;
                const hatHeight = bboxHeight * 0.08;
                const hatTop = hatY - hatHeight * 0.5;
                
                targetCtx.fillStyle = '#1a1a1a';
                targetCtx.beginPath();
                targetCtx.arc(bboxCenterX, hatY, hatWidth * 0.5, Math.PI, 0);
                targetCtx.fill();
                targetCtx.fillRect(bboxCenterX - hatWidth * 0.5, hatY, hatWidth, hatHeight);
                // Brim
                targetCtx.fillStyle = '#2a2a2a';
                const brimWidth = hatWidth * 1.1;
                const brimHeight = hatHeight * 0.3;
                targetCtx.fillRect(bboxCenterX - brimWidth * 0.5, hatY + hatHeight, brimWidth, brimHeight);
            } else if (state.accessories.hat === 'beanie') {
                const beanieWidth = bboxWidth * 0.85;
                const beanieHeight = bboxHeight * 0.12;
                const beanieTop = hatY - beanieHeight * 0.3;
                
                targetCtx.fillStyle = '#ff0000';
                targetCtx.beginPath();
                targetCtx.arc(bboxCenterX, hatY, beanieWidth * 0.5, Math.PI, 0);
                targetCtx.fill();
                targetCtx.fillRect(bboxCenterX - beanieWidth * 0.5, beanieTop, beanieWidth, beanieHeight);
            } else if (state.accessories.hat === 'crown') {
                const crownWidth = bboxWidth * 0.6;
                const crownHeight = bboxHeight * 0.1;
                const crownTop = hatY - crownHeight;
                
                targetCtx.fillStyle = '#ffd700';
                targetCtx.fillRect(bboxCenterX - crownWidth * 0.5, crownTop, crownWidth, crownHeight);
                // Crown points
                const pointCount = 5;
                const pointWidth = crownWidth / (pointCount - 1);
                for (let i = 0; i < pointCount; i++) {
                    const x = bboxCenterX - crownWidth * 0.5 + pointWidth * i;
                    targetCtx.beginPath();
                    targetCtx.moveTo(x, crownTop);
                    targetCtx.lineTo(x + pointWidth * 0.3, crownTop - crownHeight * 0.5);
                    targetCtx.lineTo(x + pointWidth * 0.6, crownTop);
                    targetCtx.fill();
                }
            }

            // Draw glasses (anchored to eye-line: bboxY + 0.38 * bboxH)
            if (state.accessories.glasses === 'sunglasses' && state.accessories.hat === 'none') {
                const lensWidth = bboxWidth * 0.15;
                const lensHeight = bboxHeight * 0.08;
                const lensSpacing = bboxWidth * 0.1;
                
                targetCtx.fillStyle = '#000000';
                // Left lens
                targetCtx.fillRect(bboxCenterX - lensSpacing - lensWidth, eyeY - lensHeight * 0.5, lensWidth, lensHeight);
                // Right lens
                targetCtx.fillRect(bboxCenterX + lensSpacing, eyeY - lensHeight * 0.5, lensWidth, lensHeight);
                // Bridge
                targetCtx.fillRect(bboxCenterX - lensSpacing * 0.5, eyeY - lensHeight * 0.3, lensSpacing, lensHeight * 0.25);
            } else if (state.accessories.glasses === 'glasses' && state.accessories.hat === 'none') {
                const frameRadius = bboxHeight * 0.08;
                const frameSpacing = bboxWidth * 0.12;
                
                targetCtx.strokeStyle = '#333333';
                targetCtx.lineWidth = Math.max(2, bboxWidth * 0.008);
                // Left frame
                targetCtx.beginPath();
                targetCtx.arc(bboxCenterX - frameSpacing, eyeY, frameRadius, 0, Math.PI * 2);
                targetCtx.stroke();
                // Right frame
                targetCtx.beginPath();
                targetCtx.arc(bboxCenterX + frameSpacing, eyeY, frameRadius, 0, Math.PI * 2);
                targetCtx.stroke();
                // Bridge
                targetCtx.beginPath();
                targetCtx.moveTo(bboxCenterX - frameSpacing * 0.5, eyeY);
                targetCtx.lineTo(bboxCenterX + frameSpacing * 0.5, eyeY);
                targetCtx.stroke();
            }

            // Draw jewelry (positioned at neck level)
            if (state.accessories.jewelry === 'chain') {
                targetCtx.strokeStyle = '#ffd700';
                targetCtx.lineWidth = Math.max(4, bboxWidth * 0.015);
                targetCtx.beginPath();
                targetCtx.arc(bboxCenterX, neckY, neckRadius, 0.3, Math.PI - 0.3);
                targetCtx.stroke();
                // Chain links
                const linkCount = 8;
                for (let i = 0; i < linkCount; i++) {
                    const angle = 0.3 + (Math.PI - 0.6) * (i / (linkCount - 1));
                    const x = bboxCenterX + Math.cos(angle) * neckRadius;
                    const y = neckY + Math.sin(angle) * neckRadius;
                    targetCtx.fillStyle = '#ffd700';
                    targetCtx.beginPath();
                    targetCtx.arc(x, y, Math.max(3, bboxWidth * 0.012), 0, Math.PI * 2);
                    targetCtx.fill();
                }
            } else if (state.accessories.jewelry === 'necklace') {
                targetCtx.strokeStyle = '#c0c0c0';
                targetCtx.lineWidth = Math.max(3, bboxWidth * 0.012);
                targetCtx.beginPath();
                targetCtx.arc(bboxCenterX, neckY, neckRadius * 0.85, 0.4, Math.PI - 0.4);
                targetCtx.stroke();
            }
        }
        
        // Debug overlay to visualize safe area, anchor point, and detected bbox (LAYERED) or cover bounds (BAKED)
        function drawDebugOverlay(targetCtx, targetSize, safeArea, apeBbox, anchor, bakedBounds, mode) {
            // Save context state
            targetCtx.save();
            
            // Always draw 2048x2048 canvas boundary (red)
            targetCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
            targetCtx.lineWidth = Math.max(3, targetSize * 0.003);
            targetCtx.setLineDash([]);
            targetCtx.strokeRect(0, 0, targetSize, targetSize);
            
            // Draw center crosshair (yellow)
            const centerX = targetSize / 2;
            const centerY = targetSize / 2;
            const crosshairSize = Math.max(30, targetSize * 0.03);
            targetCtx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
            targetCtx.lineWidth = Math.max(2, targetSize * 0.002);
            targetCtx.beginPath();
            targetCtx.moveTo(centerX - crosshairSize, centerY);
            targetCtx.lineTo(centerX + crosshairSize, centerY);
            targetCtx.moveTo(centerX, centerY - crosshairSize);
            targetCtx.lineTo(centerX, centerY + crosshairSize);
            targetCtx.stroke();
            
            if (mode === 'layered' && safeArea && anchor) {
                // LAYERED MODE: Draw safe area, anchor, and bbox
                
                // Draw safe area rectangle (green)
                targetCtx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
                targetCtx.lineWidth = Math.max(2, targetSize * 0.002);
                targetCtx.setLineDash([10, 5]);
                targetCtx.strokeRect(safeArea.x, safeArea.y, safeArea.width, safeArea.height);
                
                // Draw anchor point crosshair (red, different from canvas boundary)
                targetCtx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
                targetCtx.lineWidth = Math.max(2, targetSize * 0.002);
                targetCtx.setLineDash([]);
                const anchorCrosshairSize = Math.max(20, targetSize * 0.02);
                // Horizontal line
                targetCtx.beginPath();
                targetCtx.moveTo(anchor.x - anchorCrosshairSize, anchor.y);
                targetCtx.lineTo(anchor.x + anchorCrosshairSize, anchor.y);
                targetCtx.stroke();
                // Vertical line
                targetCtx.beginPath();
                targetCtx.moveTo(anchor.x, anchor.y - anchorCrosshairSize);
                targetCtx.lineTo(anchor.x, anchor.y + anchorCrosshairSize);
                targetCtx.stroke();
                // Anchor point circle
                targetCtx.beginPath();
                targetCtx.arc(anchor.x, anchor.y, Math.max(4, targetSize * 0.006), 0, Math.PI * 2);
                targetCtx.fillStyle = 'rgba(255, 0, 255, 0.8)';
                targetCtx.fill();
                
                // Draw detected bbox rectangle (blue)
                if (apeBbox) {
                    targetCtx.strokeStyle = 'rgba(0, 0, 255, 0.6)';
                    targetCtx.lineWidth = Math.max(2, targetSize * 0.002);
                    targetCtx.setLineDash([5, 5]);
                    targetCtx.strokeRect(apeBbox.x, apeBbox.y, apeBbox.width, apeBbox.height);
                    
                    // Draw bbox center point
                    targetCtx.fillStyle = 'rgba(0, 0, 255, 0.8)';
                    targetCtx.beginPath();
                    targetCtx.arc(apeBbox.centerX, apeBbox.centerY, Math.max(3, targetSize * 0.005), 0, Math.PI * 2);
                    targetCtx.fill();
                    
                    // Draw eye-line (bboxY + 0.38 * bboxH)
                    const eyeY = apeBbox.y + (apeBbox.height * 0.38);
                    targetCtx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
                    targetCtx.lineWidth = Math.max(1, targetSize * 0.001);
                    targetCtx.setLineDash([3, 3]);
                    targetCtx.beginPath();
                    targetCtx.moveTo(apeBbox.x, eyeY);
                    targetCtx.lineTo(apeBbox.x + apeBbox.width, eyeY);
                    targetCtx.stroke();
                    
                    // Draw mask line (bboxY + 0.52 * bboxH)
                    const maskY = apeBbox.y + (apeBbox.height * 0.52);
                    targetCtx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
                    targetCtx.beginPath();
                    targetCtx.moveTo(apeBbox.x, maskY);
                    targetCtx.lineTo(apeBbox.x + apeBbox.width, maskY);
                    targetCtx.stroke();
                }
            } else if (mode === 'baked' && bakedBounds) {
                // BAKED MODE: Draw cover rect and final crop bounds
                
                // Draw full cover rectangle (green - shows where image is drawn)
                targetCtx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
                targetCtx.lineWidth = Math.max(2, targetSize * 0.002);
                targetCtx.setLineDash([10, 5]);
                targetCtx.strokeRect(bakedBounds.x, bakedBounds.y, bakedBounds.width, bakedBounds.height);
                
                // Draw crop bounds on source image (blue - what part of source is visible)
                if (bakedBounds.cropBounds) {
                    const crop = bakedBounds.cropBounds;
                    const cropX = bakedBounds.x + (crop.x * bakedBounds.scale);
                    const cropY = bakedBounds.y + (crop.y * bakedBounds.scale);
                    const cropW = crop.width * bakedBounds.scale;
                    const cropH = crop.height * bakedBounds.scale;
                    
                    targetCtx.strokeStyle = 'rgba(0, 0, 255, 0.6)';
                    targetCtx.lineWidth = Math.max(2, targetSize * 0.002);
                    targetCtx.setLineDash([5, 5]);
                    targetCtx.strokeRect(cropX, cropY, cropW, cropH);
                }
            }
            
            // Restore context state
            targetCtx.restore();
        }

        function drawText(targetCtx = ctx, targetSize = CONFIG.PREVIEW_SIZE) {
            if (!state.text.content) return;

            const scale = targetSize / CONFIG.PREVIEW_SIZE;
            targetCtx.font = `bold ${state.text.size * scale}px "${state.text.font}", sans-serif`;
            targetCtx.fillStyle = state.text.color;
            targetCtx.textAlign = 'center';
            targetCtx.textBaseline = 'middle';

            let y;
            if (state.text.position === 'top') {
                y = 80 * scale;
            } else if (state.text.position === 'center') {
                y = targetSize / 2;
            } else {
                y = targetSize - 80 * scale;
            }

            // Add text shadow for visibility
            targetCtx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            targetCtx.shadowBlur = 10 * scale;
            targetCtx.shadowOffsetX = 2 * scale;
            targetCtx.shadowOffsetY = 2 * scale;

            targetCtx.fillText(state.text.content, targetSize / 2, y);

            // Reset shadow
            targetCtx.shadowColor = 'transparent';
            targetCtx.shadowBlur = 0;
            targetCtx.shadowOffsetX = 0;
            targetCtx.shadowOffsetY = 0;
        }

        // ============================================
        // RANDOMIZATION
        // ============================================

        function getRandomBackground() {
            const backgrounds = [];
            document.querySelectorAll('#backgroundOptions .bg-option').forEach(opt => {
                backgrounds.push(opt.dataset.bg);
            });
            return backgrounds[Math.floor(Math.random() * backgrounds.length)];
        }

        function getRandomApeType() {
            const apeTypes = ['ape1', 'ape2', 'ape3', 'ape4', 'ape5', 'ape6', 'ape7'];
            return apeTypes[Math.floor(Math.random() * apeTypes.length)];
        }

        function getRandomAccessory(options) {
            const values = ['none', ...options];
            return values[Math.floor(Math.random() * values.length)];
        }

        function randomizeLayer(layer) {
            if (state.locks[layer]) return; // Skip if locked

            if (layer === 'background') {
                const newBg = getRandomBackground();
                state.background.image = newBg;
                document.querySelectorAll('#backgroundOptions .bg-option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.bg === newBg);
                });
            } else if (layer === 'ape') {
                const newApeType = getRandomApeType();
                state.ape.type = newApeType;
                
                document.querySelectorAll('#apeOptions .trait-option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.ape === newApeType);
                });
            } else if (layer === 'accessories') {
                state.accessories.hat = getRandomAccessory(['cap', 'beanie', 'crown']);
                state.accessories.glasses = getRandomAccessory(['sunglasses', 'glasses']);
                state.accessories.jewelry = getRandomAccessory(['chain', 'necklace']);
                
                document.getElementById('hatSelect').value = state.accessories.hat;
                document.getElementById('glassesSelect').value = state.accessories.glasses;
                document.getElementById('jewelrySelect').value = state.accessories.jewelry;
            } else if (layer === 'text') {
                const colors = ['#ffffff', '#4ade80', '#ffd700', '#000000'];
                const positions = ['top', 'center', 'bottom'];
                const fonts = ['Inter', 'Space Grotesk', 'Arial', 'Impact'];
                
                state.text.color = colors[Math.floor(Math.random() * colors.length)];
                state.text.position = positions[Math.floor(Math.random() * positions.length)];
                state.text.font = fonts[Math.floor(Math.random() * fonts.length)];
                state.text.size = 30 + Math.floor(Math.random() * 40); // 30-70
                
                document.querySelectorAll('#textColors .color-option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.color === state.text.color);
                });
                document.getElementById('textPosition').value = state.text.position;
                document.getElementById('fontSelect').value = state.text.font;
                document.getElementById('textSize').value = state.text.size;
                document.getElementById('textSizeValue').textContent = state.text.size;
            }
        }

        function randomize() {
            randomizeLayer('background');
            randomizeLayer('ape');
            randomizeLayer('accessories');
            randomizeLayer('text');
            render();
        }

        // ============================================
        // LAYER LOCKING
        // ============================================

        function toggleLayerLock(layer) {
            state.locks[layer] = !state.locks[layer];
            const toggle = document.querySelector(`[data-layer="${layer}"]`);
            const icon = toggle.querySelector('.lock-icon');
            if (state.locks[layer]) {
                toggle.classList.add('locked');
                icon.textContent = '🔒';
            } else {
                toggle.classList.remove('locked');
                icon.textContent = '🔓';
            }
        }

        // ============================================
        // HIGH-RESOLUTION EXPORT
        // ============================================

        function downloadPNG() {
            // Get or create render canvas
            const { canvas: exportCanvas, ctx: exportCtx } = getRenderCanvas();
            
            // Disable debug for export
            const originalDebug = state.debug;
            state.debug = false;
            
            // Use same render function as preview (always 2048x2048)
            renderFinal(exportCanvas, exportCtx, state);
            
            // Restore debug state
            state.debug = originalDebug;
            
            // Export as PNG with maximum quality
            exportCanvas.toBlob((blob) => {
                if (!blob) {
                    console.error('Failed to generate PNG blob');
                    alert('Export failed. Please try again.');
                    return;
                }
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ape-profile-pic-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                // Clean up after a delay to allow download to start
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    // Clean up render canvas to free memory (iOS optimization)
                    cleanupRenderCanvas();
                }, 1000);
            }, 'image/png', 1.0);
        }

        // ============================================
        // EVENT LISTENERS
        // ============================================

        // iOS optimization: Use passive event listeners where possible
        const passiveOptions = { passive: true };

        // Background image options
        document.querySelectorAll('#backgroundOptions .bg-option').forEach(option => {
            addIOSFriendlyClickListener(option, () => {
                if (state.locks.background) return;
                document.querySelectorAll('#backgroundOptions .bg-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                state.background.image = option.dataset.bg;
                render();
            });
        });

        // Helper function for iOS-friendly touch handling
        function addIOSFriendlyClickListener(element, handler) {
            let touchStartTime = 0;
            let touchMoved = false;
            
            element.addEventListener('touchstart', () => {
                touchStartTime = Date.now();
                touchMoved = false;
            }, passiveOptions);
            
            element.addEventListener('touchmove', () => {
                touchMoved = true;
            }, passiveOptions);
            
            element.addEventListener('touchend', (e) => {
                if (!touchMoved && Date.now() - touchStartTime < 300) {
                    e.preventDefault();
                    handler(e);
                }
            });
            
            element.addEventListener('click', handler);
        }

        // Ape type options
        document.querySelectorAll('#apeOptions .trait-option').forEach(option => {
            addIOSFriendlyClickListener(option, () => {
                if (state.locks.ape) return;
                document.querySelectorAll('#apeOptions .trait-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                state.ape.type = option.dataset.ape;
                render();
            });
        });


        // Render mode toggle
        document.getElementById('renderMode').addEventListener('change', (e) => {
            state.renderMode = e.target.value;
            // Show/hide panels based on mode
            const bgGroup = document.getElementById('backgroundImageGroup');
            const bakedBgGroup = document.getElementById('bakedBackgroundGroup');
            if (state.renderMode === 'baked') {
                bgGroup.classList.remove('hide');
                bgGroup.classList.add('show');
                bakedBgGroup.classList.remove('hide');
                bakedBgGroup.classList.add('show');
            } else {
                bgGroup.classList.remove('hide');
                bgGroup.classList.add('show');
                bakedBgGroup.classList.add('hide');
                bakedBgGroup.classList.remove('show');
            }
            render();
        });
        
        // Baked background toggle
        document.getElementById('useBakedBackground').addEventListener('change', (e) => {
            state.useBakedBackground = e.target.value === 'true';
            render();
        });
        
        // Initialize panel visibility
        const bgGroup = document.getElementById('backgroundImageGroup');
        const bakedBgGroup = document.getElementById('bakedBackgroundGroup');
        if (state.renderMode === 'baked') {
            bgGroup.classList.remove('hide');
            bgGroup.classList.add('show');
            bakedBgGroup.classList.remove('hide');
            bakedBgGroup.classList.add('show');
        } else {
            bakedBgGroup.classList.add('hide');
            bakedBgGroup.classList.remove('show');
        }

        // Accessories
        document.getElementById('hatSelect').addEventListener('change', (e) => {
            if (state.locks.accessories) return;
            state.accessories.hat = e.target.value;
            render();
        });

        document.getElementById('glassesSelect').addEventListener('change', (e) => {
            if (state.locks.accessories) return;
            state.accessories.glasses = e.target.value;
            render();
        });

        document.getElementById('jewelrySelect').addEventListener('change', (e) => {
            if (state.locks.accessories) return;
            state.accessories.jewelry = e.target.value;
            render();
        });

        // Text controls
        document.getElementById('textInput').addEventListener('input', (e) => {
            if (state.locks.text) return;
            state.text.content = e.target.value;
            render();
        });

        document.getElementById('fontSelect').addEventListener('change', (e) => {
            if (state.locks.text) return;
            state.text.font = e.target.value;
            render();
        });

        document.querySelectorAll('#textColors .color-option').forEach(option => {
            addIOSFriendlyClickListener(option, () => {
                if (state.locks.text) return;
                document.querySelectorAll('#textColors .color-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                state.text.color = option.dataset.color;
                render();
            });
        });

        document.getElementById('textPosition').addEventListener('change', (e) => {
            if (state.locks.text) return;
            state.text.position = e.target.value;
            render();
        });

        document.getElementById('textSize').addEventListener('input', (e) => {
            if (state.locks.text) return;
            state.text.size = parseInt(e.target.value);
            document.getElementById('textSizeValue').textContent = state.text.size;
            render();
        });

        // Layer lock toggles
        document.querySelectorAll('.lock-toggle').forEach(toggle => {
            addIOSFriendlyClickListener(toggle, (e) => {
                const layer = toggle.dataset.layer;
                toggleLayerLock(layer);
            });
        });

        // Buttons
        document.getElementById('downloadBtn').addEventListener('click', downloadPNG);
        
        document.getElementById('randomizeBtn').addEventListener('click', () => {
            randomize();
        });
        
        document.getElementById('debugBtn').addEventListener('click', () => {
            state.debug = !state.debug;
            const btn = document.getElementById('debugBtn');
            if (state.debug) {
                btn.classList.add('active', 'debug-btn-active');
            } else {
                btn.classList.remove('active', 'debug-btn-active');
            }
            render();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            // Reset state
            state.renderMode = 'layered';
            state.background.image = '/pfp_generator_images/pfp_bg1.png';
            state.ape.type = 'ape1';
            state.accessories.hat = 'none';
            state.accessories.glasses = 'none';
            state.accessories.jewelry = 'none';
            state.text.content = '';
            state.text.font = 'Inter';
            state.text.color = '#ffffff';
            state.text.position = 'top';
            state.text.size = 40;
            state.debug = false;
            
            // Reset render mode selector
            document.getElementById('renderMode').value = 'layered';
            const bgGroup = document.getElementById('backgroundImageGroup');
            const bakedBgGroup = document.getElementById('bakedBackgroundGroup');
            if (bgGroup) {
                bgGroup.classList.remove('hide');
                bgGroup.classList.add('show');
            }
            if (bakedBgGroup) {
                bakedBgGroup.classList.add('hide');
                bakedBgGroup.classList.remove('show');
            }
            const useBakedBgSelect = document.getElementById('useBakedBackground');
            if (useBakedBgSelect) useBakedBgSelect.value = 'false';

            // Reset locks
            Object.keys(state.locks).forEach(layer => {
                state.locks[layer] = false;
                const toggle = document.querySelector(`[data-layer="${layer}"]`);
                if (toggle) {
                    toggle.classList.remove('locked');
                    toggle.querySelector('.lock-icon').textContent = '🔓';
                }
            });

            // Reset UI
            document.querySelectorAll('#backgroundOptions .bg-option').forEach((opt, i) => {
                opt.classList.toggle('selected', i === 0);
            });
            document.querySelectorAll('#apeOptions .trait-option').forEach((opt, i) => {
                opt.classList.toggle('selected', i === 0);
            });
            document.getElementById('hatSelect').value = 'none';
            document.getElementById('glassesSelect').value = 'none';
            document.getElementById('jewelrySelect').value = 'none';
            document.getElementById('textInput').value = '';
            document.getElementById('fontSelect').value = 'Inter';
            document.querySelectorAll('#textColors .color-option').forEach((opt, i) => {
                opt.classList.toggle('selected', i === 0);
            });
            document.getElementById('textPosition').value = 'top';
            document.getElementById('textSize').value = 40;
            document.getElementById('textSizeValue').textContent = 40;
            
            // Reset debug button
            const debugBtn = document.getElementById('debugBtn');
            debugBtn.classList.remove('active', 'debug-btn-active');

            render();
        });

        // ============================================
        // INITIALIZATION
        // ============================================

        // ============================================
        // AUTHENTICATION
        // ============================================
        // Auth is initialized by js/header.js automatically

        // ============================================
        // AUTHENTICATION GATE
        // ============================================
        
        // Block access to generator unless authenticated
        (async () => {
            try {
                const { initAuthGate } = await import('/js/auth-gate.js');
                initAuthGate();
            } catch (error) {
                console.error('Auth gate initialization error:', error);
                // If auth gate fails, show overlay as fallback
                const overlay = document.getElementById('authGateOverlay');
                if (overlay) {
                    overlay.classList.add('show');
                }
            }
        })();

        // Preload all images and then render
        preloadAllImages();
