export class Map {
    constructor(game) {
        this.game = game;
        this.background = new Image();
        this.background.src = 'background.jpg'; // Relative to index.html (in root)

        // Asset Loading
        this.assets = {};
        this.loadAssets(['Main_unit', 'unit_tank', 'Main_tower', 'tower_mage', 'explosion']);

        // Load Animations
        this.loadAnimation('soldier_walk', 7, 'jpg');
        this.loadAnimation('soldier_attack', 4, 'jpg');

        this.loaded = false;

        const checkLoad = () => {
            // Check if background + all assets are loaded
            // Basic check: just ensure background is done for now, or improve logic
            // Ideally we count outstanding loads.
            if (this.background.complete) {
                this.loaded = true;
                this.updateDimensions(this.game.canvas.width, this.game.canvas.height);
            }
        };

        this.background.onload = checkLoad;
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
            { x: 487, y: 520, occupied: false },
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
            { x: 479, y: 529, occupied: false }, // Duplicate close to first? Keeping both for now.
            { x: 334, y: 754, occupied: false },
            { x: 250, y: 654, occupied: false }
        ];
    }

    loadAssets(names) {
        names.forEach(name => {
            const img = new Image();
            img.src = `${name}.png`;
            this.assets[name] = img;
        });
    }

    loadAnimation(baseName, count, ext = 'png') {
        this.assets[baseName] = [];
        for (let i = 1; i <= count; i++) {
            const img = new Image();
            const num = i.toString().padStart(2, '0');
            img.src = `${baseName}_${num}.${ext}`;
            this.assets[baseName].push(img);
        }
    }

    updateDimensions(width, height) {
        if (!this.loaded) return;

        // Scale to fit "contain" style or "cover" - User wants "one to one", so probably "contain" to see full map
        // or "cover" to utilize full mobile screen. 
        // Strategy: "Contain" to ensure gameplay area is visible, with potential black bars if aspect ratio differs wildly.

        const scaleX = width / this.background.width;
        const scaleY = height / this.background.height;
        this.scale = Math.min(scaleX, scaleY);

        this.drawWidth = this.background.width * this.scale;
        this.drawHeight = this.background.height * this.scale;

        this.offsetX = (width - this.drawWidth) / 2;
        this.offsetY = (height - this.drawHeight) / 2;
    }

    // Convert screen coordinate to game background coordinate
    getGameCoordinates(clientX, clientY) {
        if (!this.loaded) return null;
        const x = (clientX - this.offsetX) / this.scale;
        const y = (clientY - this.offsetY) / this.scale;
        return { x, y };
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

        // Draw Background
        ctx.drawImage(
            this.background,
            0, 0, this.background.width, this.background.height,
            this.offsetX, this.offsetY, this.drawWidth, this.drawHeight
        );
    }
}
