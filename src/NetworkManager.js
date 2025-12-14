
export class NetworkManager {
    constructor() {
        this.onCommand = null;
        this.onRoleAssigned = null;
        this.clientId = 'player_' + Math.floor(Math.random() * 10000);
        this.isHost = false;
        this.role = undefined;

        // BroadcastChannel for Local functionality (Tab-to-Tab)
        // usage v2 to clear ghost tabs from previous testing
        this.channel = new BroadcastChannel('tower_attack_local_v2');

        this.channel.onmessage = (event) => {
            const command = event.data;

            // Internal Handshake
            if (command.type === 'DISCOVERY_REQUEST') {
                if (this.isHost) {
                    // I am the host, tell them!
                    this.channel.postMessage({ type: 'DISCOVERY_RESPONSE', hostId: this.clientId });
                }
            } else if (command.type === 'DISCOVERY_RESPONSE') {
                // Someone else is host, so I am Client!
                this.handleRoleAssignment(false); // Client
            } else {
                // Game Command
                if (this.onCommand) {
                    this.onCommand(command);
                }
            }
        };
    }

    // Call this explicitly after listeners are set up
    connect() {
        this.startDiscovery();
    }

    startDiscovery() {
        console.log("[Network] Looking for Host...");
        // Send a ping
        this.channel.postMessage({ type: 'DISCOVERY_REQUEST', senderId: this.clientId });

        // Wait to see if anyone answers
        setTimeout(() => {
            if (this.role === undefined) {
                // No one answered. I am Host!
                console.log("[Network] No Host found. I am Host (Defender).");
                this.isHost = true;
                this.handleRoleAssignment(true); // Host
            }
        }, 500); // 500ms discovery window
    }

    handleRoleAssignment(isHost) {
        if (this.role !== undefined) return; // Already assigned
        this.role = isHost ? 'defender' : 'attacker';
        if (this.onRoleAssigned) {
            this.onRoleAssigned(this.role);
        }
    }

    sendCommand(command) {
        if (!command.playerId) {
            command.playerId = this.clientId;
        }

        // 1. Send to others
        this.channel.postMessage(command);

        // 2. Execute locally (BroadcastChannel doesn't echo to self)
        if (this.onCommand) {
            this.onCommand(command);
        }
    }

    setCommandHandler(callback) {
        this.onCommand = callback;
    }
}
