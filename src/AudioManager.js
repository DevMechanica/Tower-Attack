export class AudioManager {
    constructor() {
        if (AudioManager.instance) {
            return AudioManager.instance;
        }

        this.sounds = {};
        this.enabled = true;

        // Preload sounds
        this.load('click', 'assets/music/PressingButton.wav');

        // Placeholders for other sounds (will fail silently or warn if missing)
        // this.load('shoot', 'assets/sounds/shoot.wav');
        // this.load('hit', 'assets/sounds/hit.wav');
        // this.load('explode', 'assets/sounds/explode.wav');

        AudioManager.instance = this;
    }

    load(name, path) {
        const audio = new Audio(path);
        audio.preload = 'auto'; // Preload the audio
        this.sounds[name] = audio;
    }

    play(name) {
        if (!this.enabled) return;

        const sound = this.sounds[name];
        if (sound) {
            // Clone node to allow overlapping sounds
            const clone = sound.cloneNode();
            clone.volume = 0.5; // Default volume
            clone.play().catch(e => console.warn(`Failed to play sound: ${name}`, e));
        } else {
            console.warn(`Sound not found: ${name}`);
        }
    }

    playClick() {
        this.play('click');
    }

    // Placeholder methods for future implementation
    playShoot() {
        // this.play('shoot');
    }

    playHit() {
        // this.play('hit');
    }

    playExplode() {
        // this.play('explode');
    }
}
