
// --- 3D ENGINE VARIABLES ---
let scene, camera, renderer, groundPlane;
const meshes = new Map();

// --- ASSET LOADING & SHADER MATERIAL ---
const assets = {};
// Use pre-generated base64 assets if available, else fallback (though fallback will likely fail CORS locally)
const assetSources = window.GAME_ASSETS || {
    knight: 'unit_knight.png',
    archer: 'unit_archer.png',
    giant: 'unit_giant.png',
    tower_player: 'tower_blue.png',
    tower_enemy: 'tower_red.png',
    arena: 'arena_bg.png'
};

// Custom Shader to remove white background on GPU
const chromaVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const chromaFragmentShader = `
    uniform sampler2D map;
    varying vec2 vUv;
    void main() {
        vec4 texColor = texture2D(map, vUv);
        if (texColor.r > 0.85 && texColor.g > 0.85 && texColor.b > 0.85) discard;
        gl_FragColor = texColor;
    }
`;

function createChromaMaterial(texture) {
    return new THREE.ShaderMaterial({
        uniforms: { map: { value: texture } },
        vertexShader: chromaVertexShader,
        fragmentShader: chromaFragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });
}

function loadAssets() {
    let loaded = 0;
    const total = Object.keys(assetSources).length;
    const loader = new THREE.TextureLoader();
    for (const [key, src] of Object.entries(assetSources)) {
        loader.load(src, (tex) => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            assets[key] = tex;
            loaded++;
            if (loaded === total) {
                console.log("Assets Loaded");
                init3D();
            }
        });
    }
}
loadAssets();

// --- 3D ENGINE VARIABLES MOVED TO TOP ---

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2c3e50);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 800, 600);
    camera.lookAt(0, 0, 0);

    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 500, 300);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const geometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
    const arenaMat = new THREE.MeshStandardMaterial({ map: assets.arena, side: THREE.DoubleSide });
    groundPlane = new THREE.Mesh(geometry, arenaMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    lastTime = Date.now();
    requestAnimationFrame(gameLoop);
}

// --- LOGIC MAPPING ---
const LOGICAL_WIDTH = window.innerWidth;
const LOGICAL_HEIGHT = window.innerHeight;
const OFF_X = -LOGICAL_WIDTH / 2;
const OFF_Z = -LOGICAL_HEIGHT / 2;

function to3D(x, y) {
    return { x: x + OFF_X, z: y + OFF_Z };
}

function syncScene(dt) {
    if (!scene) return;
    const allEntities = [...state.entities, ...state.towers, ...state.projectiles];
    const keepIds = new Set(allEntities.map(e => e.id));

    for (const [id, mesh] of meshes) {
        if (!keepIds.has(id)) {
            scene.remove(mesh);
            meshes.delete(id);
        }
    }

    for (const e of allEntities) {
        let mesh = meshes.get(e.id);
        if (!mesh) {
            let tex;
            let width, height;
            if (e instanceof Unit) {
                tex = assets[e.type];
                width = e.radius * 4;
                height = width;
            } else if (e instanceof Tower) {
                tex = assets[e.team === 'player' ? 'tower_player' : 'tower_enemy'];
                width = e.radius * 5;
                height = width;
            } else if (e instanceof Projectile) {
                const geo = new THREE.SphereGeometry(5, 8, 8);
                const mat = new THREE.MeshBasicMaterial({ color: e.type === 'fireball' ? 0xe67e22 : 0xecf0f1 });
                mesh = new THREE.Mesh(geo, mat);
                mesh.position.y = 20;
                scene.add(mesh);
                meshes.set(e.id, mesh);
                continue;
            }

            if (!tex) continue;

            const geo = new THREE.PlaneGeometry(width, height);
            const mat = createChromaMaterial(tex);
            mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            meshes.set(e.id, mesh);
        }

        const pos3D = to3D(e.x, e.y);
        mesh.position.x = pos3D.x;
        mesh.position.z = pos3D.z;

        if (e instanceof Projectile) {
            mesh.position.y = 25;
        } else {
            mesh.rotation.x = -Math.PI / 4;
            if (e instanceof Unit && e.state === 'moving') {
                const bounce = Math.sin(Date.now() / 100) * 5;
                mesh.position.y = (e.radius * 2) + Math.abs(bounce);
            } else if (e instanceof Tower) {
                mesh.position.y = (e.radius * 2.5);
            } else {
                mesh.position.y = (e.radius * 2);
            }
        }
    }
}

// --- GAME LOGIC ---
class Entity {
    constructor(x, y, radius, color, team) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.team = team;
        this.isDead = false;
        this.id = Math.random().toString(36).substr(2, 9);
    }
}

class Projectile extends Entity {
    constructor(x, y, target, damage, speed, type) {
        super(x, y, 5, null, null);
        this.target = target;
        this.damage = damage;
        this.speed = speed;
        this.type = type;
    }

    update(dt) {
        if (this.isDead || !this.target || this.target.isDead) {
            this.isDead = true;
            return;
        }
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {
            this.target.takeDamage(this.damage);
            this.isDead = true;
        } else {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        }
    }
}

class Unit extends Entity {
    constructor(x, y, type, team) {
        const stats = Unit.getStats(type);
        super(x, y, stats.radius, null, team);
        this.type = type;
        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.damage = stats.damage;
        this.range = stats.range;
        this.speed = stats.speed;
        this.attackSpeed = stats.attackSpeed;
        this.isRanged = type === 'archer';
        this.projectileSpeed = 300;
        this.lastAttackTime = 0;
        this.target = null;
        this.state = 'moving';
    }

    static getStats(type) {
        const stats = {
            knight: { hp: 600, damage: 75, range: 40, speed: 60, attackSpeed: 1.2, radius: 15, cost: 3 },
            archer: { hp: 200, damage: 45, range: 120, speed: 70, attackSpeed: 0.8, radius: 12, cost: 3 },
            giant: { hp: 2000, damage: 120, range: 40, speed: 40, attackSpeed: 1.5, radius: 25, cost: 5, targetBuildings: true }
        };
        return stats[type] || stats.knight;
    }

    update(dt, enemies, towers, spawnProjectile) {
        if (this.isDead) return;
        if (!this.target || this.target.isDead) {
            this.target = this.findTarget(enemies, towers);
        }

        if (this.target) {
            const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            if (dist <= this.range + this.target.radius) {
                this.state = 'attacking';
                this.attack(dt, spawnProjectile);
            } else {
                this.state = 'moving';
                this.moveTo(this.target, dt);
            }
        } else {
            this.state = 'moving';
            const direction = this.team === 'player' ? -1 : 1;
            this.y += this.speed * dt * direction;
        }
    }

    moveTo(target, dt) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        }
    }

    attack(dt, spawnProjectile) {
        const now = Date.now() / 1000;
        if (now - this.lastAttackTime >= this.attackSpeed) {
            if (this.isRanged) {
                spawnProjectile(new Projectile(this.x, this.y, this.target, this.damage, this.projectileSpeed, 'arrow'));
            } else {
                this.target.takeDamage(this.damage);
            }
            this.lastAttackTime = now;
        }
    }

    findTarget(enemies, towers) {
        let potentialTargets = [...enemies, ...towers];
        potentialTargets = potentialTargets.filter(e => !e.isDead);
        if (this.type === 'giant') {
            const buildings = potentialTargets.filter(e => e instanceof Tower);
            if (buildings.length > 0) potentialTargets = buildings;
        }
        let closest = null;
        let minMsg = Infinity;
        for (const t of potentialTargets) {
            const dist = Math.hypot(t.x - this.x, t.y - this.y);
            if (dist < minMsg) {
                minMsg = dist;
                closest = t;
            }
        }
        return closest;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
    }
}

class Tower extends Entity {
    constructor(x, y, team, isKing) {
        const radius = isKing ? 35 : 25;
        super(x, y, radius, null, team);
        this.isKing = isKing;
        this.hp = isKing ? 4000 : 2500;
        this.maxHp = this.hp;
        this.damage = isKing ? 100 : 80;
        this.range = 150;
        this.attackSpeed = 1.0;
        this.lastAttackTime = 0;
        this.target = null;
    }

    update(dt, enemies, spawnProjectile) {
        if (this.isDead) return;
        if (!this.target || this.target.isDead || Math.hypot(this.target.x - this.x, this.target.y - this.y) > this.range) {
            this.target = this.findTarget(enemies);
        }
        if (this.target) {
            const now = Date.now() / 1000;
            if (now - this.lastAttackTime >= this.attackSpeed) {
                this.shoot(this.target, spawnProjectile);
                this.lastAttackTime = now;
            }
        }
    }

    findTarget(enemies) {
        let closest = null;
        let minMsg = this.range;
        for (const e of enemies) {
            if (e.isDead) continue;
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist <= minMsg) {
                minMsg = dist;
                closest = e;
            }
        }
        return closest;
    }

    shoot(target, spawnProjectile) {
        spawnProjectile(new Projectile(this.x, this.y, target, this.damage, 200, 'fireball'));
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
    }
}

// --- STATE & LOOP ---
let lastTime = 0;
let gameOver = false;
let startTime = 0;

const state = {
    entities: [],
    towers: [],
    projectiles: [],
    playerElixir: 5,
    maxElixir: 10,
    elixirRate: 0.5,
    selectedCard: null,
    enemySpawnTimer: 0,
    laneLeftX: 0,
    laneRightX: 0
};

function resize() {
    state.laneLeftX = window.innerWidth * 0.25;
    state.laneRightX = window.innerWidth * 0.75;
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
window.addEventListener('resize', resize);
resize();

function initGame() {
    state.entities = [];
    state.towers = [];
    state.projectiles = [];
    state.playerElixir = 5;
    state.selectedCard = null;
    gameOver = false;
    startTime = Date.now();

    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-title').innerText = "";

    // Use fixed logical coordinates for towers independent of window size initially?
    // Actually window.innerWidth is appropriate since we scale setup
    const towerYTop = 100;
    const towerYBot = window.innerHeight - 100;

    // We need to re-calc this because window size might change
    state.laneLeftX = window.innerWidth * 0.25;
    state.laneRightX = window.innerWidth * 0.75;

    // Enemy Towers
    state.towers.push(new Tower(state.laneLeftX, towerYTop + 180, 'enemy', false));
    state.towers.push(new Tower(state.laneRightX, towerYTop + 180, 'enemy', false));
    state.towers.push(new Tower(window.innerWidth / 2, towerYTop + 80, 'enemy', true));

    // Player Towers
    state.towers.push(new Tower(state.laneLeftX, towerYBot - 180, 'player', false));
    state.towers.push(new Tower(state.laneRightX, towerYBot - 180, 'player', false));
    state.towers.push(new Tower(window.innerWidth / 2, towerYBot - 80, 'player', true));
}

// Input (Raycast!)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

document.getElementById('game-canvas').addEventListener('mousedown', (e) => {
    if (gameOver) return;
    if (!state.selectedCard) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(groundPlane);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        const logicX = point.x - OFF_X;
        const logicY = point.z - OFF_Z;

        if (logicY < window.innerHeight / 2) {
            showFloatingText(point.x, point.z, "Invalid!", "red");
            return;
        }

        const stats = Unit.getStats(state.selectedCard);
        if (state.playerElixir >= stats.cost) {
            spawnUnit(state.selectedCard, logicX, logicY, 'player');
            state.playerElixir -= stats.cost;
            state.selectedCard = null;
            document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
        } else {
            showFloatingText(point.x, point.z, "No Elixir!", "orange");
        }
    }
});

document.getElementById('start-btn').addEventListener('click', initGame);
document.getElementById('restart-btn').addEventListener('click', initGame);
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.selectedCard = card.dataset.type;
    });
});

function spawnUnit(type, x, y, team) {
    state.entities.push(new Unit(x, y, type, team));
}

function spawnProjectile(p) {
    state.projectiles.push(p);
}

function showFloatingText(x, z, text, color) {
    console.log(text);
}

function update(dt) {
    if (gameOver) return;

    if (state.playerElixir < state.maxElixir) {
        state.playerElixir += state.elixirRate * dt;
        if (state.playerElixir > state.maxElixir) state.playerElixir = state.maxElixir;
    }

    state.enemySpawnTimer += dt;
    if (state.enemySpawnTimer > 4.5) {
        state.enemySpawnTimer = 0;
        const types = ['knight', 'archer', 'giant'];
        const type = types[Math.floor(Math.random() * types.length)];
        const lane = Math.random() > 0.5 ? state.laneLeftX : state.laneRightX;
        spawnUnit(type, lane, 200, 'enemy');
    }

    const playerUnits = state.entities.filter(u => u.team === 'player');
    const enemyUnits = state.entities.filter(u => u.team === 'enemy');
    const playerTowers = state.towers.filter(t => t.team === 'player');
    const enemyTowers = state.towers.filter(t => t.team === 'enemy');

    state.entities.forEach(u => u.update(dt, u.team === 'player' ? enemyUnits : playerUnits, u.team === 'player' ? enemyTowers : playerTowers, spawnProjectile));
    state.towers.forEach(t => t.update(dt, t.team === 'player' ? enemyUnits : playerUnits, spawnProjectile));
    state.projectiles.forEach(p => p.update(dt));

    state.entities = state.entities.filter(e => !e.isDead);
    state.towers = state.towers.filter(t => !t.isDead);
    state.projectiles = state.projectiles.filter(p => !p.isDead);

    const playerKing = playerTowers.find(t => t.isKing);
    const enemyKing = enemyTowers.find(t => t.isKing);

    if (!playerKing || !enemyKing) {
        gameOver = true;
        const msg = !enemyKing ? "You Win!" : "You Lose!";
        document.getElementById('game-over-title').innerText = msg;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }
}

function updateUI() {
    const fill = document.getElementById('elixir-bar-fill');
    const text = document.getElementById('elixir-text');
    const pct = (state.playerElixir / state.maxElixir) * 100;
    fill.style.width = `${pct}%`;
    text.innerText = `${Math.floor(state.playerElixir)} / ${state.maxElixir}`;

    document.querySelectorAll('.card').forEach(c => {
        const type = c.dataset.type;
        const cost = Unit.getStats(type).cost;
        if (state.playerElixir < cost) {
            c.style.opacity = 0.5;
            c.style.pointerEvents = 'none';
        } else {
            c.style.opacity = 1.0;
            c.style.pointerEvents = 'auto';
        }
    });

    if (!gameOver && startTime > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, 180 - elapsed);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60).toString().padStart(2, '0');
        document.querySelector('.timer').innerText = `${mins}:${secs}`;
    }
}

function gameLoop() {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (!gameOver) {
        update(dt);
        syncScene(dt);
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }

    updateUI();
    requestAnimationFrame(gameLoop);
}