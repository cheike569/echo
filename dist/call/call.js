import ExpressServer from "../server/express";
import { registerInterimTranscriptCallback, registerTranscriptCallback } from "../deepgram/stt";
import { hangupCall, makeCall, twilioClient } from "../twilio/service";
import { WebsocketServer } from "../server/websocket";
import ngrok from "@ngrok/ngrok";
import openCartesiaWebsocket from "../cartesia/stt";
import { printTable, transcribeFile } from "../deepgram/transcribe";
import Assert from "../assert/assert";
import ReceivedTranscript from "./receivedTranscript";
import ora from "ora";
import fs from "fs";
import fetch from "node-fetch";
import RecordingProcessor from "./recordingProcessor";
import chalk from "chalk";
export class CallProcess {
    constructor(speechTimeout = 1000 * 90) {
        this.recordingDownloaded = false;
        this.callEnded = false;
        this.receivedTranscripts = new ReceivedTranscript();
        this.lastSpeech = Date.now();
        this.speechTimeout = speechTimeout;
        this.transcriptPromise = new Promise((resolve) => {
            this.resolveNextTranscript = resolve;
        });
        this.identifier = Math.random().toString(36).substring(7);
        // Set up an interval to check for speech timeout
        this.timeoutInterval = setInterval(async () => {
            if (Date.now() - this.lastSpeech > this.speechTimeout) {
                clearTimeout(this.timeoutInterval);
                if (this.transcriptPromise) {
                    console.log(chalk.white.bgYellow.bold('No agent speech detected for 90 seconds. Hanging up.'));
                    this.resolveNextTranscript('');
                }
                // await this.terminateCallAndTranscribeRecording();
                // throw new Error('No speech detected for 15 seconds. Hanging up.');
            }
        });
    }
    setSpinnerText(text) {
        this.spinner.text = text;
    }
    async initiate(to) {
        this.spinner = ora({ text: 'Call in progress ', hideCursor: false, discardStdin: false }).start();
        this.setSpinnerText(`Starting express server`);
        this.server = new ExpressServer();
        this.server.spinUp((msg) => {
            this.onTwilioStatusCallback(msg);
        });
        this.setSpinnerText(`Starting websocket server`);
        this.callWebsocketServer = new WebsocketServer(this.server.server);
        await this.callWebsocketServer.listen();
        this.cartesiaWebsocket = await openCartesiaWebsocket(this.callWebsocketServer);
        // Register callback to handle received transcripts
        registerTranscriptCallback((transcription) => {
            // const isSpeechFinal = transcription.speech_final;
            // if (isSpeechFinal) {
            // const message = transcription.channel.alternatives[0].transcript;
            const message = transcription;
            this.setSpinnerText(`Agent: ${message}`);
            this.lastSpeech = Date.now();
            this.receivedTranscripts.add(message);
            // console.log(`Final Transcript: ${message}`);
            this.resolveNextTranscript(message);
            this.transcriptPromise = new Promise((resolve) => {
                setTimeout(() => {
                    resolve('');
                }, 90000);
                this.resolveNextTranscript = resolve;
            });
            // }
        });
        registerInterimTranscriptCallback((message) => {
            this.spinner.text = `Interim Transcript: ${message}`;
        });
        // Set up ngrok to forward requests to the local server
        this.setSpinnerText(`Starting ngrok server`);
        this.ngrokServer = await ngrok.forward({ addr: process.env.PORT || 3000, authtoken_from_env: true });
        const websocketUrl = this.ngrokServer.url().replace('https://', 'wss://');
        const callbackUrl = this.ngrokServer.url() + '/status';
        // Initiate the call using Twilio
        this.setSpinnerText(`Making outgoing call`);
        this.twilioCallObject = await makeCall(to, `${websocketUrl}/ws`, callbackUrl);
    }
    onTwilioStatusCallback(callback) {
        if (callback.CallStatus !== 'completed') {
            throw new Error(`Call status is not completed. Status: ${callback.CallStatus}`);
        }
        if (callback.CallSid) {
            this.twilioStatusCallbackObject = callback;
        }
    }
    waitForTwilioStatusCallback() {
        if (this.twilioStatusCallbackObject)
            return;
        return new Promise(async (resolve, reject) => {
            const int = setInterval(() => {
                var _a;
                if ((_a = this.twilioStatusCallbackObject) === null || _a === void 0 ? void 0 : _a.CallSid) {
                    clearInterval(int);
                    resolve();
                }
            }, 1000);
            setTimeout(() => {
                clearInterval(int);
                reject(`Twilio status callback not received in time.`);
            }, 10000);
        });
    }
    // Hangs up, shuts down all servers, and downloads the recording
    async terminateCallAndTranscribeRecording() {
        if (this.callEnded)
            return;
        this.callEnded = true;
        this.resolveNextTranscript('');
        await hangupCall(this.twilioCallObject.sid);
        await this.waitForTwilioStatusCallback();
        await this.shutDown();
        this.filename = await this.downloadRecording();
        this.recordingTranscript = await transcribeFile(this.filename);
    }
    // Shut down all servers and close connections
    async shutDown() {
        clearTimeout(this.timeoutInterval);
        this.server.shutDown();
        if (this.ngrokServer) {
            await this.ngrokServer.close();
        }
        if (this.cartesiaWebsocket) {
            this.cartesiaWebsocket.close();
        }
        if (this.callWebsocketServer) {
            this.callWebsocketServer.close();
        }
        if (this.spinner) {
            this.spinner.succeed("Phone call ended.");
        }
    }
    // Get the timestamp of the last speech detected
    getLastSpeech() {
        return this.lastSpeech;
    }
    getCompleteTextTranscript() {
        return this.receivedTranscripts.getTextTranscript();
    }
    async downloadRecording() {
        let interval;
        this.spinner = ora({
            text: 'Waiting for recording to be ready ',
            hideCursor: false,
            discardStdin: false
        }).start();
        return await new Promise((resolve) => {
            let downloadTimeout = setTimeout(() => {
                if (interval) {
                    clearInterval(interval);
                    throw new Error('Recording download timed out.');
                }
            }, 15000);
            interval = setInterval(async () => {
                const recordingList = await twilioClient.calls(this.twilioCallObject.sid).recordings.list();
                if (recordingList.length === 0)
                    return;
                const recording = recordingList[0];
                if (recording.status === 'completed') {
                    clearInterval(interval);
                    clearTimeout(downloadTimeout);
                    let recordingUrl = recording.uri;
                    const waveUrl = `https://api.twilio.com/` + recordingUrl.replace('.json', '.wav?RequestedChannels=2');
                    // Download the recording to disk
                    const response = await fetch(waveUrl);
                    const buffer = await response.buffer();
                    const target = `recordings/${Date.now()}.wav`;
                    fs.writeFileSync(target, buffer);
                    this.recordingDownloaded = true;
                    this.spinner.succeed("Recording downloaded.");
                    this.filename = target;
                    resolve(target);
                }
            }, 500);
        });
    }
    async nextTranscript() {
        return this.transcriptPromise;
    }
    getFinalTranscriptFromRecording() {
        if (!this.recordingDownloaded) {
            throw new Error('Recording has not been downloaded yet.');
        }
        return this.recordingTranscript;
    }
    async speak(text) {
        this.spinner.text = `Test: ${text}`;
        return this.cartesiaWebsocket.generateText(text);
    }
    getReceivedTranscripts() {
        return this.receivedTranscripts;
    }
}
export default async function (testDescription, evaluationCallback, afterCallEvaluationCallback, options = {}) {
    console.table({
        'Running test': testDescription,
        'Making outgoing call to': options.to || process.env.TO_NUMBER,
        'Time': new Date().toLocaleString()
    });
    const callProcess = new CallProcess();
    try {
        await callProcess.initiate(options.to || process.env.TO_NUMBER);
    }
    catch (e) {
        console.error(e);
        await callProcess.terminateCallAndTranscribeRecording();
        throw e;
    }
    // Assert helpers
    const assert = new Assert(callProcess);
    const params = {
        assert: assert,
        call: callProcess
    };
    let error;
    try {
        await evaluationCallback(params);
    }
    catch (evaluationError) {
        error = evaluationError;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await callProcess.terminateCallAndTranscribeRecording();
    if (!error && afterCallEvaluationCallback) {
        try {
            await afterCallEvaluationCallback(Object.assign(Object.assign({}, params), { transcribedText: callProcess.getFinalTranscriptFromRecording() }));
        }
        catch (evaluationError) {
            error = evaluationError;
        }
    }
    // Analyze audio waveform and make sure audio doesn't overlap
    const recordingProcessor = new RecordingProcessor(callProcess.filename);
    const result = await recordingProcessor.process();
    if (!result) {
        throw new Error('No result returned from recording processor');
    }
    console.table({
        'Overlap detected': result.overlap,
        'Longest silence': result.longestPause + 's',
        'Call Duration': callProcess.twilioStatusCallbackObject.CallDuration + 's',
        'From': callProcess.twilioStatusCallbackObject.From,
        'To': callProcess.twilioStatusCallbackObject.To,
        'Timestamp': callProcess.twilioStatusCallbackObject.Timestamp,
        'RecordingURL': callProcess.twilioStatusCallbackObject.RecordingUrl,
        'Call ID': callProcess.twilioStatusCallbackObject.CallSid,
    });
    console.log(chalk.bgGreen('Live transcripts during phone call:'));
    console.table(callProcess.receivedTranscripts.getTranscript());
    console.log(chalk.bgGreen('Transcribed text from audio recording:'));
    printTable(callProcess.getFinalTranscriptFromRecording());
    if (error) {
        throw error;
    }
    console.log('h');
    if (result.overlap) {
        await assert.fail('Overlap detected in audio waveform');
    }
    else {
        assert.pass();
    }
}
//# sourceMappingURL=call.js.map