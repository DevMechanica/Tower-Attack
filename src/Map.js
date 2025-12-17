export class Map {
    constructor(game) {
        this.game = game;

        // Create two video elements: intro (plays once) and loop (plays forever)
        this.introVideo = document.createElement('video');
        this.introVideo.src = 'assets/maps/Default/2dd77380-cce6-4b16-a8ca-25a0c97343cf.mp4';
        this.introVideo.muted = true;
        this.introVideo.playsInline = true;
        this.introVideo.loop = false; // Play once only

        this.loopVideo = document.createElement('video');
        this.loopVideo.src = 'assets/maps/Default/a19be687-ec10-421d-8d5a-556fcd208e55.mp4';
        this.loopVideo.muted = true;
        this.loopVideo.playsInline = true;
        this.loopVideo.loop = true; // Loop forever

        // Track which video is currently active
        this.background = this.introVideo; // Start with intro
        this.introPlayed = false;

        // When intro ends, switch to loop video
        this.introVideo.addEventListener('ended', () => {
            console.log('[Map] Intro video ended, switching to loop video');
            this.background = this.loopVideo;
            this.introPlayed = true;
            this.loopVideo.play().catch(err => console.warn('Loop video play failed:', err));
            this.updateDimensions(this.game.canvas.width, this.game.canvas.height);
        });

        // Start playing the intro video
        this.introVideo.play().catch(err => {
            console.warn('Intro video autoplay failed:', err);
        });

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
        this.cameraOffsetY = 20; // Shift down by 100px to reveal top portal

        // Waypoints provided by user
        this.path = [
            { x: 131, y: 147 },
            { x: 317, y: 353 },
            { x: 301, y: 456 },
            { x: 153, y: 651 },
            { x: 178, y: 810 },
            { x: 301, y: 888 },
            { x: 459, y: 826 },
            { x: 604, y: 888 },
            { x: 715, y: 785 },
            { x: 615, y: 520 },
            { x: 640, y: 309 },
            { x: 771, y: 184 },
            { x: 918, y: 306 },
            { x: 824, y: 501 },
            { x: 757, y: 643 },
            { x: 915, y: 849 }
        ];

        // Tower Slots provided by user (Defender build spots)
        this.towerSlots = [
            { x: 486, y: 532, occupied: false }, // Updated per user debug
            { x: 668, y: 417, occupied: false },
            { x: 726, y: 334, occupied: false },
            { x: 779, y: 262, occupied: false },
            { x: 840, y: 339, occupied: false },
            { x: 768, y: 434, occupied: false },
            { x: 712, y: 526, occupied: false },
            { x: 857, y: 634, occupied: false },
            { x: 893, y: 551, occupied: false },
            { x: 779, y: 810, occupied: false },
            { x: 634, y: 799, occupied: false },
            { x: 467, y: 715, occupied: false },
            { x: 334, y: 754, occupied: false },
            { x: 250, y: 654, occupied: false },
            { x: 534, y: 652, occupied: false } // New slot added per user request
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
        // Update entities
    }

    render(ctx) {
        if (!this.loaded) {
            ctx.fillStyle = '#000';
            ctx.fillText('Loading...', 50, 50);
            return;
        }

        // Draw Background Video with vertical offset to show top portal
        ctx.drawImage(
            this.background,
            0, 0, this.background.videoWidth, this.background.videoHeight,
            this.offsetX, this.offsetY + this.cameraOffsetY, this.drawWidth, this.drawHeight
        );
    }
}
