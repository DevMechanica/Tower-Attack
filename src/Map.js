export class Map {
    constructor(game) {
        this.game = game;

        // Create two video elements: intro (plays once) and loop (plays forever)
        this.introVideo = document.createElement('video');
        this.introVideo.src = 'assets/maps/Default/download (15).mp4';
        this.introVideo.muted = true;
        this.introVideo.playsInline = true;
        this.introVideo.loop = false; // Play once only

        this.loopVideo = document.createElement('video');
        this.loopVideo.src = 'assets/maps/Default/download (17).mp4';
        this.loopVideo.muted = true;
        this.loopVideo.playsInline = true;
        this.loopVideo.loop = true; // Loop forever
        this.loopVideo.preload = 'auto'; // Preload the video to avoid flash

        // Track which video is currently active
        this.background = this.introVideo; // Start with intro
        this.introPlayed = false;

        // Crossfade transition state
        this.isTransitioning = false;
        this.transitionProgress = 0; // 0 = intro only, 1 = loop only
        this.transitionDuration = 1000; // 1 second crossfade

        // Preload and buffer the loop video (start playing but paused at first frame)
        this.loopVideo.addEventListener('loadeddata', () => {
            console.log('[Map] Loop video preloaded and ready');
        });

        // Start crossfade transition 1 second before intro ends
        this.introVideo.addEventListener('timeupdate', () => {
            if (!this.introPlayed && this.introVideo.duration &&
                this.introVideo.currentTime >= this.introVideo.duration - 1.0) {
                console.log('[Map] Starting crossfade transition to loop video');
                this.isTransitioning = true;
                this.transitionProgress = 0;
                this.introPlayed = true;
                this.loopVideo.play().catch(err => console.warn('Loop video play failed:', err));
                this.updateDimensions(this.game.canvas.width, this.game.canvas.height);
            }
        });

        // Fallback: Also listen for 'ended' in case timeupdate misses it
        this.introVideo.addEventListener('ended', () => {
            if (!this.introPlayed) {
                console.log('[Map] Intro video ended (fallback), starting crossfade');
                this.isTransitioning = true;
                this.transitionProgress = 0;
                this.introPlayed = true;
                this.loopVideo.play().catch(err => console.warn('Loop video play failed:', err));
                this.updateDimensions(this.game.canvas.width, this.game.canvas.height);
            }
        });

        // Start playing the intro video
        this.introVideo.play().catch(err => {
            console.warn('Intro video autoplay failed:', err);
        });

        // Start buffering the loop video immediately (but don't show it yet)
        // This ensures it's ready when the intro ends
        this.loopVideo.load();

        // Asset Loading
        this.assets = {};

        // Load individual assets with explicit paths
        this.loadImage('Main_unit', 'assets/units/soldier/Main_soldier.png');
        this.loadImage('unit_tank', 'assets/units/unit_tank.png');
        this.loadImage('Main_tower', 'assets/towers/Main_tower.png');
        this.loadImage('tower_mage', 'assets/towers/MageTower/TowerMage.png');
        this.loadImage('tower_tesla', 'assets/towers/TeslaTowerAnima/TeslaTower-removebg-preview.png');
        this.loadImage('unit_golem', 'unit_golem.png');
        this.loadImage('unit_mecha_dino', 'assets/units/mecha_dino/mecha_dino.png');
        this.loadImage('unit_saber_rider', 'assets/units/saber_rider.png');
        this.loadImage('explosion', 'explosion.png'); // Kept in root

        // Load Animations
        this.loadAnimation('soldier_walk', 'assets/units/soldier/soldier_walk', 7, 'jpg');
        this.loadAnimation('soldier_attack', 'assets/units/soldier/soldier_attack', 4, 'jpg');

        // Tesla Tower Animation
        // Files are TeslaAnim1-removebg-preview.png to TeslaAnim5-removebg-preview.png
        // Tesla Tower Animation
        // Files are TeslaAnim1-removebg-preview.png to TeslaAnim5-removebg-preview.png
        this.assets['tower_tesla_anim'] = [];
        for (let i = 1; i <= 4; i++) {
            const img = new Image();
            img.src = `assets/towers/TeslaTowerAnima/TeslaTowerAttack/TeslaAnim${i}-removebg-preview.png`;
            this.assets['tower_tesla_anim'].push(img);
        }

        // Tesla Idle
        this.assets['tower_tesla_idle'] = [];
        for (let i = 1; i <= 4; i++) {
            const img = new Image();
            img.src = `assets/towers/TeslaTowerAnima/TeslaTowerIdle/TeslaAnimIdle${i}.png`;
            this.assets['tower_tesla_idle'].push(img);
        }

        // Mage Tower Animation
        this.assets['tower_mage_anim'] = [];
        for (let i = 1; i <= 5; i++) {
            const img = new Image();
            img.src = `assets/towers/MageTower/MageTowerAttack/TowerMageAnim${i}.png`;
            this.assets['tower_mage_anim'].push(img);
        }

        // Mage Tower Idle
        this.assets['tower_mage_idle'] = [];
        for (let i = 1; i <= 3; i++) {
            const img = new Image();
            img.src = `assets/towers/MageTower/MageTowerIdle/MageTowerIdle${i}.png`;
            this.assets['tower_mage_idle'].push(img);
        }

        this.loaded = false;

        const checkLoad = () => {
            // Check if intro video is loaded and ready
            if (this.introVideo.readyState >= 2) {
                this.loaded = true;
                this.updateDimensions(this.game.canvas.width, this.game.canvas.height);
            }
        };

        // Listen for loadeddata on intro video
        this.introVideo.addEventListener('loadeddata', checkLoad);
        // Also check immediately in case already loaded
        checkLoad();
        // Note: Simple individual onload management for lists is tricky, 
        // usually we'd use a Promise.all or a counter. 
        // For this simple engine, we'll assume they load fast enough or check actively in render (which fails gracefully).
        // Let's add a basic counter for robustness if needed, but existing logic was also loose.

        // Improve loading check to be more robust later if needed.


        // Logic coordinates (we'll assume a standard base resolution, e.g., 1920x1080)
        this.baseWidth = 1920;
        this.baseHeight = 1080;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Camera vertical offset to show more of the top (portal area)
        this.cameraOffsetY = 0; // No offset - fill entire screen

        // Waypoints provided by user
        this.path = [
            { x: 393, y: 309 },
            { x: 505, y: 381 },
            { x: 606, y: 441 },
            { x: 525, y: 553 },
            { x: 391, y: 634 },
            { x: 383, y: 722 },
            { x: 483, y: 834 },
            { x: 657, y: 864 },
            { x: 839, y: 794 },
            { x: 971, y: 874 },
            { x: 1214, y: 806 },
            { x: 1299, y: 723 },
            { x: 1453, y: 772 },
            { x: 1561, y: 836 }
        ];

        // Tower Slots provided by user (Defender build spots)
        this.towerSlots = [
            { x: 1079.7891036906854, y: 782.390158172232, occupied: false },
            { x: 1204.639718804921, y: 689.0333919156415, occupied: false },
            { x: 1465.5887521968366, y: 440.45694200351494, occupied: false },
            { x: 1348.6115992970124, y: 350.47451669595785, occupied: false },
            { x: 1085.4130052724079, y: 451.7047451669596, occupied: false },
            { x: 1484.7100175746925, y: 648.5413005272408, occupied: false },
            { x: 1335.1142355008787, y: 843.128295254833, occupied: false },
            { x: 1627.5571177504394, y: 543.9367311072057, occupied: false }
        ];
    }

    loadImageDirect(path) {
        const img = new Image();
        img.src = path;
        return img;
    }

    loadImage(key, src) {
        const img = new Image();
        img.src = src;
        this.assets[key] = img;
    }

    loadAssets(names) {
        // Deprecated or can be removed if not used anymore
        // keeping implementation just in case but we use loadImage now
        names.forEach(name => {
            const img = new Image();
            img.src = `${name}.png`;
            this.assets[name] = img;
        });
    }

    loadAnimation(key, pathPrefix, count, ext = 'png') {
        this.assets[key] = [];
        for (let i = 1; i <= count; i++) {
            const img = new Image();
            const num = i.toString().padStart(2, '0');
            img.src = `${pathPrefix}_${num}.${ext}`;
            this.assets[key].push(img);
        }
    }

    updateDimensions(width, height) {
        if (!this.loaded) return;

        // Use "cover" strategy to fill the entire viewport
        // This will crop the video edges if needed but ensures full coverage (like CSS background-size: cover)

        const scaleX = width / this.background.videoWidth;
        const scaleY = height / this.background.videoHeight;
        this.scale = Math.max(scaleX, scaleY); // Changed from Math.min to Math.max for "cover" behavior

        this.drawWidth = this.background.videoWidth * this.scale;
        this.drawHeight = this.background.videoHeight * this.scale;

        this.offsetX = (width - this.drawWidth) / 2;
        this.offsetY = (height - this.drawHeight) / 2;
    }

    // Helper method to calculate dimensions for a specific video element
    getVideoDimensions(video, canvasWidth, canvasHeight) {
        const scaleX = canvasWidth / video.videoWidth;
        const scaleY = canvasHeight / video.videoHeight;
        const scale = Math.max(scaleX, scaleY);

        const drawWidth = video.videoWidth * scale;
        const drawHeight = video.videoHeight * scale;

        const offsetX = (canvasWidth - drawWidth) / 2;
        const offsetY = (canvasHeight - drawHeight) / 2;

        return { offsetX, offsetY, drawWidth, drawHeight };
    }

    // Convert screen coordinate to game background coordinate
    getGameCoordinates(clientX, clientY) {
        if (!this.loaded) return null;
        const x = (clientX - this.offsetX) / this.scale;
        const y = (clientY - this.offsetY - this.cameraOffsetY) / this.scale;
        return { x, y };
    }

    // Reset video sequence for new match
    resetVideoSequence() {
        this.introPlayed = false;
        this.background = this.introVideo;
        this.introVideo.currentTime = 0;
        this.loopVideo.pause();
        this.loopVideo.currentTime = 0;
        this.introVideo.play().catch(err => console.warn('Intro restart failed:', err));
    }

    update(deltaTime) {
        // Update crossfade transition
        if (this.isTransitioning) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            if (this.transitionProgress >= 1) {
                this.transitionProgress = 1;
                this.isTransitioning = false;
                this.background = this.loopVideo; // Switch to loop as primary
                console.log('[Map] Crossfade complete');
            }
        }
    }

    render(ctx) {
        if (!this.loaded) {
            ctx.fillStyle = '#000';
            ctx.fillText('Loading...', 50, 50);
            return;
        }

        // Draw Background Video with crossfade transition
        if (this.isTransitioning) {
            const canvasWidth = this.game.canvas.width;
            const canvasHeight = this.game.canvas.height;

            // Calculate dimensions for intro video
            const introDims = this.getVideoDimensions(this.introVideo, canvasWidth, canvasHeight);

            // Draw intro video with fading alpha
            ctx.globalAlpha = 1 - this.transitionProgress;
            ctx.drawImage(
                this.introVideo,
                0, 0, this.introVideo.videoWidth, this.introVideo.videoHeight,
                introDims.offsetX, introDims.offsetY, introDims.drawWidth, introDims.drawHeight
            );

            // Calculate dimensions for loop video
            const loopDims = this.getVideoDimensions(this.loopVideo, canvasWidth, canvasHeight);

            // Draw loop video with increasing alpha
            ctx.globalAlpha = this.transitionProgress;
            ctx.drawImage(
                this.loopVideo,
                0, 0, this.loopVideo.videoWidth, this.loopVideo.videoHeight,
                loopDims.offsetX, loopDims.offsetY, loopDims.drawWidth, loopDims.drawHeight
            );

            // Reset alpha
            ctx.globalAlpha = 1;
        } else {
            // Draw current background video normally
            ctx.drawImage(
                this.background,
                0, 0, this.background.videoWidth, this.background.videoHeight,
                this.offsetX, this.offsetY, this.drawWidth, this.drawHeight
            );
        }
    }
}
