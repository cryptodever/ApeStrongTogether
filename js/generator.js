    <script type="module">
        // ============================================
        // PROFILE PICTURE GENERATOR - PREMIUM VERSION
        
        // Import base URL helper for route-safe asset paths
        const { withBase } = await import('../js/base-url.js');
        // ============================================
        // High-resolution export: 2048Ã—2048 PNG
        // Preloaded assets, layer locking, randomization
        // ============================================

        // Configuration
        const CONFIG = {
            PREVIEW_SIZE: 512,      // Display canvas size
            EXPORT_SIZE: 2048,      // High-res export size (always 2048x2048)
            
            // Fixed Safe Area (for 2048x2048 canvas)
            SAFE_W: 0.82 * 2048,    // Safe area width: 1679.36
            SAFE_H: 0.82 * 2048,    // Safe area height: 1679.36
            SAFE_X: (2048 - (0.82 * 2048)) / 2,  // Safe area X: 184.32
            SAFE_Y: (2048 - (0.82 * 2048)) / 2,  // Safe area Y: 184.32
            
            // Anchor point (bbox center target)
            ANCHOR_X: 1024,         // Center X
            ANCHOR_Y: 900,          // Slightly above center for avatar framing
            
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
            const scale = Math.min(safeArea.width / bbox.width, safeArea.height / bbox.height);
            
            // Scaled bbox dimensions
            const scaledBboxW = bbox.width * scale;
            const scaledBboxH = bbox.height * scale;
            
            // Position so bbox center aligns to anchor point
            const drawX = anchor.x - (bbox.centerX * scale);
            const drawY = anchor.y - (bbox.centerY * scale);
            
            // Full image scale
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
