import { LocalTransport } from './LocalTransport.js';
import { SocketTransport } from './SocketTransport.js';

export class NetworkManager {
    constructor() {
        this.onCommand = null;
        this.onRoleAssigned = null;
        this.onPeerDiscovered = null;
        this.onStatusChange = null;
        this.clientId = 'player_' + Math.floor(Math.random() * 10000);
        this.isHost = false;
        this.role = undefined;
        this.transport = null;

        // Determine Mode
        const params = new URLSearchParams(window.location.search);
        const urlMode = params.get('mode');
        this.mode = urlMode || 'local'; // Default to local for now, or 'online' if preferred

        console.log(`[Network] Mode initialized to: ${this.mode}`);
    }

    connect() {
        if (this.mode === 'online') {
            console.log("[Network] Connecting Online...");
            this.transport = new SocketTransport();
            this.transport.onOpen = () => {
                // Online Discovery / Lobby logic would go here
                // For MVP: First to connect is Host? Or Server assigns?
                // check if server sent role?
                this.startDiscovery();
            };
        } else {
            console.log("[Network] Connecting Local (BroadcastChannel)...");
            this.transport = new LocalTransport();
            this.startDiscovery();
        }

        this.transport.onMessage = (data) => this.handleMessage(data);
        if (this.transport.connect) this.transport.connect();
    }

    handleMessage(message) {
        if (message.type === 'WAITING_FOR_OPPONENT') {
            console.log("[Network] Waiting for opponent...");
            // UI Update: Could show "Waiting for player..."
            if (this.onStatusChange) this.onStatusChange("Waiting for opponent...");
        } else if (message.type === 'ASSIGN_ROLE') {
            const role = message.role === 'host' || message.role === 'defender' ? true : false;
            console.log(`[Network] Server assigned role: ${message.role}`);
            this.isHost = role;
            this.handleRoleAssignment(role);
            if (this.onStatusChange) this.onStatusChange("Opponent Found! Starting...");
            // If Peer Discovered logic needed?
            if (this.onPeerDiscovered) this.onPeerDiscovered();
        } else if (message.type === 'OPPONENT_DISCONNECTED') {
            console.log("[Network] Opponent Disconnected");
            if (this.onStatusChange) this.onStatusChange("Opponent Disconnected.");
            // Reset?
        } else if (message.type === 'DISCOVERY_REQUEST' || message.type === 'DISCOVERY_RESPONSE') {
            // Legacy P2P / Local Logic
            if (this.mode === 'local') {
                if (message.type === 'DISCOVERY_REQUEST' && this.isHost) {
                    this.transport.send({ type: 'DISCOVERY_RESPONSE', hostId: this.clientId });
                    // Notify Game that peer connected, so we can re-broadcast state (READY)
                    // Add slight delay to ensure Client has processed the Response and initialized
                    setTimeout(() => {
                        if (this.onPeerDiscovered) this.onPeerDiscovered();
                    }, 500);
                } else if (message.type === 'DISCOVERY_RESPONSE') {
                    this.handleRoleAssignment(false);
                    // Notify Game that we found host
                    if (this.onPeerDiscovered) this.onPeerDiscovered();
                }
            }
        } else {
            // Game Command
            if (this.onCommand) {
                this.onCommand(message);
            }
        }
    }

    startDiscovery() {
        if (this.mode === 'online') {
            console.log("[Network] (Online) Joining Lobby...");
            // No custom payload needed, connection triggers matching
            // But we can send a "READY_TO_MATCH" if we wanted.
            // Current server logic matches on 'connection' + 'waitingPlayer', so just connecting is enough.
            // BUT we should probably send a hello if we want to support reconnects later.
            // For now, simple.

            // NO TIMEOUT for online. We wait for server.
        } else {
            // Local P2P Discovery
            console.log("[Network] (Local) Looking for Host...");
            this.transport.send({ type: 'DISCOVERY_REQUEST', senderId: this.clientId });

            setTimeout(() => {
                if (this.role === undefined) {
                    console.log("[Network] (Local) No Host found. I am Host (Defender).");
                    this.isHost = true;
                    this.handleRoleAssignment(true);
                }
            }, 500);
        }
    }

    handleRoleAssignment(isHost) {
        if (this.role !== undefined) return;
        this.role = isHost ? 'defender' : 'attacker';
        if (this.onRoleAssigned) {
            this.onRoleAssigned(this.role);
        }
    }

    sendCommand(command) {
        if (!command.playerId) {
            command.playerId = this.clientId;
        }

        // 1. Send via Transport
        if (this.transport) {
            this.transport.send(command);
        }

        // 2. Echo locally (unless Online? - Online usually waits for server echo)
        // For 'local', we must echo manually.
        // For 'online', usually we predict or wait.
        // Let's stick to "Echo Locally" for responsiveness for now, 
        // BUT if online, server will likely broadcast it back.
        // To avoid double execution: 
        if (this.mode === 'local') {
            if (this.onCommand) this.onCommand(command);
        }
        // Online: Expect server to echo back 'command' to us? 
        // If server broadcasts to ALL (including sender), then we don't echo here.
        // My server.js implementation: broadcast(sender, data) excludes sender!
        // So we MUST echo locally here too.
        if (this.mode === 'online') {
            if (this.onCommand) this.onCommand(command);
        }
    }

    setCommandHandler(callback) {
        this.onCommand = callback;
    }
}
