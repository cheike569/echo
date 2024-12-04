import {WebSocketServer} from "ws";
import {Server} from "http";
import {initializeDeepgram} from "../deepgram/stt";

export class WebsocketServer {
    private websocketServer: WebSocketServer;
    private deepgramClient: any;
    public ws: null | any;
    public streamSid: null | string;
    private messageListener: Array<(message: any) => void>

    constructor(server: Server) {
        this.websocketServer = new WebSocketServer({server, path: '/ws'});
        this.ws = null;
        this.messageListener = [];
    }

    public send(message: any) {
        if (this.ws) {
            this.ws.send(JSON.stringify({
                ...message,
                streamSid: this.streamSid
            }));
        }
    }

    public registerListener(listener: { (message: any): void; (message: any): void; }) {
        this.messageListener.push(listener);
    }

    public async listen() {
        this.deepgramClient = await initializeDeepgram();

        this.websocketServer.on("connection", async (ws, request) => {
            this.ws = ws;

            ws.on("message", async (data: string) => {
                const websocketMessage = JSON.parse(data);
                // Call registered listeners
                for(const listener of this.messageListener) {
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

                    } else if (this.deepgramClient.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
                        console.log("ws: data couldn't be sent to deepgram");
                        console.log("ws: retrying connection to deepgram");
                        /* Attempt to reopen the Deepgram connection */
                        this.deepgramClient.finish();
                        this.deepgramClient.removeAllListeners();
                        this.deepgramClient = await initializeDeepgram();
                    } else {
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