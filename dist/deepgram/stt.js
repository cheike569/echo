import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
let callbacks = [];
let interimCallbacks = [];
export function registerTranscriptCallback(callback) {
    callbacks.push(callback);
}
export function registerInterimTranscriptCallback(callback) {
    interimCallbacks.push(callback);
}
export function initializeDeepgram() {
    return new Promise((resolve) => {
        const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
        const listenClient = deepgramClient.listen.live({
            smart_format: true,
            model: "nova-2",
            encoding: "mulaw",
            sample_rate: 8000,
            channels: 1,
            interim_results: true,
            utterance_end_ms: 1500,
            punctuate: true,
        });
        let keepAlive;
        if (keepAlive)
            clearInterval(keepAlive);
        keepAlive = setInterval(() => {
            if (listenClient.getReadyState() === 1 /* OPEN */) {
                listenClient.keepAlive();
            }
        }, 5 * 1000);
        listenClient.addListener(LiveTranscriptionEvents.Open, async () => {
            resolve(listenClient);
            let tempTranscription = '';
            listenClient.addListener(LiveTranscriptionEvents.UtteranceEnd, async (transcription) => {
                // Call callbacks
                callbacks.forEach(callback => {
                    console.log(tempTranscription);
                    callback(tempTranscription);
                });
                tempTranscription = '';
            });
            listenClient.addListener(LiveTranscriptionEvents.Transcript, async (transcription) => {
                const message = transcription.channel.alternatives[0].transcript;
                if (message.length > 0) {
                    // console.log(`Deepgram: ${message}`);
                    interimCallbacks.forEach(callback => {
                        callback(message);
                    });
                }
                if (transcription.is_final) {
                    tempTranscription += " " + message;
                }
            });
            listenClient.addListener(LiveTranscriptionEvents.Close, async () => {
                // console.log("Deepgram: disconnected");
                clearInterval(keepAlive);
                try {
                    listenClient.finish();
                }
                catch (e) {
                    console.error(e);
                }
            });
            listenClient.addListener(LiveTranscriptionEvents.Error, async (error) => {
                console.error("Deepgram: error received, " + JSON.stringify(error));
            });
            listenClient.addListener(LiveTranscriptionEvents.Unhandled, async (warning) => {
                console.warn("Deepgram: unhandled received, " + JSON.stringify(warning));
            });
            listenClient.addListener(LiveTranscriptionEvents.Metadata, (data) => {
                // console.log(data);
            });
        });
    });
}
//# sourceMappingURL=stt.js.map