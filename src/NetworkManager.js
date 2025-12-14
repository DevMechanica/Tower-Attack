
export class NetworkManager {
    constructor() {
        this.onCommand = null;
        this.clientId = 'player_' + Math.floor(Math.random() * 10000);

        // BroadcastChannel for Local functionality (Tab-to-Tab)
        this.channel = new BroadcastChannel('tower_attack_local');

        this.channel.onmessage = (event) => {
            const command = event.data;
            // console.log(`[Network] Received: ${command.type} from ${command.playerId}`);
            if (this.onCommand) {
                this.onCommand(command);
            }
        };
    }

    sendCommand(command) {
        if (!command.playerId) {
            command.playerId = this.clientId;
        }

        // console.log(`[Network] Sending: ${command.type}`);

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
