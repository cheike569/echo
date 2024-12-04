import WebSocket from "ws";
import { WebsocketServer } from "../server/websocket";

export type CartesiaWebsocket = {
    generateText: (text: string) => Promise<void>;
    close: () => void;
}

/**
 * Opens a WebSocket connection to Cartesia and sets up message handling.
 * @param callWebsocketServer - The WebSocket server to communicate with.
 * @returns An object with methods to generate text and close the connection.
 */
export default async function openCartesiaWebsocket(callWebsocketServer: WebsocketServer): Promise<CartesiaWebsocket> {
    const uri = `wss://api.cartesia.ai/tts/websocket?api_key=${process.env.CARTESIA_API_KEY}&cartesia_version=2024-06-10`;
    const cartesiaWebsocket = new WebSocket(uri);
    let markCallback: (value: void | PromiseLike<void>) => void;

    // Promise to handle WebSocket connection opening
    const promise = await new Promise<void>((resolve) => {
        cartesiaWebsocket.on('open', async () => {
            resolve();

            // Handle incoming messages from Cartesia
            cartesiaWebsocket.on('message', async (response: string) => {
                const json = JSON.parse(response);

                if (json.data) {
                    const audioBase64 = json.data;

                    const message = {
                        event: 'media',
                        media: { payload: audioBase64 },
                    };

                    callWebsocketServer.send(message);
                }

                if (json.type === 'done') {
                    callWebsocketServer.send({
                        event: "mark",
                        mark: { name: "cartesia" }
                    });
                }
            });
        });
    });

    // Register listener for mark events
    callWebsocketServer.registerListener((message) => {
        if (message.event === 'mark') {
            markCallback();
        }
    });

    // Handle WebSocket errors
    cartesiaWebsocket.on('error', (error) => {
        console.error('WebSocket to Cartesia error:', error);
    });

    /**
     * Generates text using Cartesia's TTS service.
     * @param text - The text to be converted to speech.
     * @returns A promise that resolves when the text generation is complete.
     */
    const generateText = async (text: string) => {
        return new Promise<void>(resolve => {
            cartesiaWebsocket.send(JSON.stringify({
                context_id: "test",
                model_id: "sonic-english",
                voice: {
                    mode: "id",
                    id: "a0e99841-438c-4a64-b679-ae501e7d6091",
                },
                output_format: {
                    container: "raw",
                    encoding: "pcm_mulaw",
                    sample_rate: 8000
                },
                transcript: text
            }));

            // Timeout to resolve the promise if no mark is received
            setTimeout(() => {
                resolve(); // no mark received
            }, 15000);

            if (markCallback) {
                markCallback(); // Clear previous mark callback
            }

            markCallback = resolve;
        });
    };

    /**
     * Closes the WebSocket connection to Cartesia.
     */
    const close = () => {
        cartesiaWebsocket.close();
    };

    return {
        generateText,
        close
    };
}