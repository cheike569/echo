import { WebSocketServer } from "ws";
import { initializeDeepgram } from "../deepgram/stt.js";
export class WebsocketServer {
    constructor(server) {
        this.websocketServer = new WebSocketServer({ server, path: '/ws' });
        this.ws = null;
        this.messageListener = [];
    }
    send(message) {
        if (this.ws) {
            this.ws.send(JSON.stringify(Object.assign(Object.assign({}, message), { streamSid: this.streamSid })));
        }
    }
    registerListener(listener) {
        this.messageListener.push(listener);
    }
    async listen() {
        this.deepgramClient = await initializeDeepgram();
        this.websocketServer.on("connection", async (ws, request) => {
            this.ws = ws;
            ws.on("message", async (data) => {
                const websocketMessage = JSON.parse(data);
                // Call registered listeners
                for (const listener of this.messageListener) {
                    listener(websocketMessage);
                }
                /**
                 * Twilio Start Procedure
                 */
                if (websocketMessage.event === "start") {
                    this.streamSid = websocketMessage.start.streamSid;
                }
                if (websocketMessage.event === "media" && this.deepgramClient) {
                    if (this.deepgramClient.getReadyState() === 1 /* OPEN */) {
                        if (websocketMessage.media.track === 'inbound') {
                            const media = websocketMessage.media;
                            const audio = Buffer.from(media.payload, "base64");
                            // Send the audio to Deepgram for transcription
                            this.deepgramClient.send(audio);
                        }
                    }
                    else if (this.deepgramClient.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
                        console.log("ws: data couldn't be sent to deepgram");
                        console.log("ws: retrying connection to deepgram");
                        /* Attempt to reopen the Deepgram connection */
                        this.deepgramClient.finish();
                        this.deepgramClient.removeAllListeners();
                        this.deepgramClient = await initializeDeepgram();
                    }
                    else {
                        // console.log("ws: data couldn't be sent to deepgram");
                    }
                }
            });
            ws.on("close", async () => {
            });
            ws.onerror = function () {
            };
        });
    }
    close() {
        this.websocketServer.close();
    }
}
//# sourceMappingURL=websocket.js.map