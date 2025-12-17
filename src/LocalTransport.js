export class LocalTransport {
    constructor(channelName = 'tower_attack_local_v2') {
        this.channel = new BroadcastChannel(channelName);
        this.isConnected = true; // Always connected for local
        this.onMessage = null;

        this.channel.onmessage = (event) => {
            console.log(`[LocalTransport] Received:`, event.data);
            if (this.onMessage) {
                this.onMessage(event.data);
            }
        };
    }

    send(data) {
        console.log(`[LocalTransport] Sending:`, data);
        this.channel.postMessage(data);
    }

    disconnect() {
        this.channel.close();
    }
}
