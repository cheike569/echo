import chalk from "chalk";
import OpenAI from "openai";
import { registerInterimTranscriptCallback } from "../deepgram/stt";
class AssertError extends Error {
    constructor(message) {
        super(chalk.white.bgRed.bold(message));
        this.name = 'AssertError';
    }
}
export default class Assert {
    constructor(callProcess) {
        this.assertions = 0;
        this.callProcess = callProcess;
        registerInterimTranscriptCallback((message) => {
            this.lastSpeechBitReceived = Date.now();
        });
    }
    pass() {
        if (this.assertions === 0) {
            console.log(chalk.white.bgYellow.bold('Caution. No assertions were made.'));
            return;
        }
        console.log(chalk.white.bgGreen.bold(`Test passed! ${this.assertions} assertions passed.`));
    }
    async fail(message) {
        await this.escalateError(message);
    }
    async escalateError(message) {
        // await this.callProcess.terminateCallAndTranscribeRecording();
        throw new AssertError(message);
    }
    async assertLastTranscriptIncludes(phrase) {
        this.assertions++;
        const transcript = this.callProcess.getReceivedTranscripts().getTranscript();
        if (transcript.length === 0 || !transcript[transcript.length - 1].toLowerCase().includes(phrase.toLowerCase())) {
            await this.escalateError(`Latest transcript does not include the phrase "${phrase}"`);
        }
    }
    async assertTranscriptIncludes(phrase) {
        this.assertions++;
        const transcript = this.callProcess.getReceivedTranscripts().getTranscript();
        if (transcript.length === 0 || !transcript.some((t) => t.toLowerCase().includes(phrase.toLowerCase()))) {
            await this.escalateError(`Transcript does not include the phrase "${phrase}"`);
        }
    }
    async assertFinalTranscriptIncludes(phrase) {
        this.assertions++;
        const transcript = this.callProcess.getFinalTranscriptFromRecording();
        if (!transcript.toLowerCase().includes(phrase.toLowerCase())) {
            await this.escalateError(`Final transcript does not include the phrase "${phrase}"`);
        }
    }
    async pause(milliseconds) {
        this.assertions++;
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
    async pauseInSpeech(milliseconds) {
        this.assertions++;
        // Reset timer
        this.lastSpeechBitReceived = Date.now();
        await new Promise((resolve) => {
            const interval = setInterval(() => {
                if (Date.now() - this.lastSpeechBitReceived > milliseconds) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }
    async assertPauseNotLongerThan(milliseconds) {
        this.assertions++;
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
        const lastSpeech = this.callProcess.getLastSpeech();
        if (Date.now() - lastSpeech > milliseconds) {
            await this.escalateError(`Pause between speech is longer than ${milliseconds} milliseconds`);
        }
    }
    async analyzeTranscribedTextWithAI(goal) {
        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'],
        });
        const chatCompletion = await client.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Your task is to analyze the given transcript and determine if it meets the goal. Respond with "yes" or "no".'
                },
                {
                    role: 'user',
                    content: `Here is the transcript:\n\n${this.callProcess.getFinalTranscriptFromRecording()}`
                },
                { role: 'user', content: `Goal: ${goal}` }
            ],
            model: process.env.EVALUATION_MODEL || 'gpt-4o',
        });
        const response = chatCompletion.choices[0].message.content;
        if (response.toLowerCase().includes('no')) {
            await this.escalateError(`The AI determined that the goal '${goal}' was not met.`);
        }
    }
}
//# sourceMappingURL=assert.js.map