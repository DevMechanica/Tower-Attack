export class SocketTransport {
    constructor(url) {
        this.isConnected = false;

        // Socket.IO handles the URL parsing much better.
        // We just need to point it to the host.
        // 'io' automatically handles 'http' vs 'https' based on window.location

        // Determine URL (mostly for logging)
        if (!url) {
            this.url = window.location.origin; // e.g. https://tower-attack.appspot.com
        } else {
            this.url = url;
        }

        console.log(`[Socket] Transport URL (Socket.IO): ${this.url}`);

        // Connect!
        // transports: ['polling'] effectively forces HTTP long-polling first
        // which guarantees connection even through restrictive firewalls/proxies.
        // It will upgrade to websocket if possible.
        // Use global 'io' from script tag
        this.socket = io(this.url, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5
        });

        // Event Handling
        this.socket.on("connect", () => {
            console.log(`[Socket] Connected! ID: ${this.socket.id}`);
            this.isConnected = true;

            // Clear any error messages
            const statusParams = document.querySelector('#welcome-screen p');
            if (statusParams) {
                statusParams.innerText = "Connected! Waiting for match...";
                statusParams.style.color = "white"; // Reset color
            }
        });

        this.socket.on("connect_error", (err) => {
            console.error(`[Socket] Connection Error: ${err.message}`);
            const statusParams = document.querySelector('#welcome-screen p');
            if (statusParams) {
                statusParams.innerText = `Connection Error: ${err.message}. Retrying...`;
                statusParams.style.color = "red";
            }
        });

        this.socket.on("disconnect", (reason) => {
            console.log(`[Socket] Disconnected: ${reason}`);
            this.isConnected = false;
        });

        this.socket.on("message", (data) => {
            // Server sends JSON strings (for compatibility with original WS implementation)
            // But NetworkManager expects an Object ( accessing message.type )
            if (this.onMessage) {
                try {
                    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                    this.onMessage(parsed);
                } catch (e) {
                    console.error("[Socket] Failed to parse message:", e, data);
                }
            }
        });
    }

    send(data) {
        if (this.socket && this.isConnected) {
            // existing game code sends stringified JSON.
            // Socket.IO can send objects, but let's send string to match server expectation
            this.socket.emit("message", data);
        } else {
            console.warn('[Socket] Cannot send, not connected.');
        }
    }
}
