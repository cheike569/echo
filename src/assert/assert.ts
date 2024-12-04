import {CallProcess} from "../call/call";
import chalk from "chalk";
import OpenAI from "openai";
import {registerInterimTranscriptCallback} from "../deepgram/stt";

class AssertError extends Error {
    constructor(message: string) {
        super(chalk.white.bgRed.bold(message));
        this.name = 'AssertError';
    }
}

export default class Assert {
    private callProcess: CallProcess;
    private assertions = 0;
    private lastSpeechBitReceived: number;

    constructor(callProcess: CallProcess) {
        this.callProcess = callProcess;

        registerInterimTranscriptCallback((message) => {
            this.lastSpeechBitReceived = Date.now();
        });
    }

    public pass() {
        if (this.assertions === 0) {
            console.log(chalk.white.bgYellow.bold('Caution. No assertions were made.'));
            return;
        }

        console.log(chalk.white.bgGreen.bold(`Test passed! ${this.assertions} assertions passed.`));
    }

    public async fail(message: string) {
        await this.escalateError(message);
    }

    private async escalateError(message: string) {
        // await this.callProcess.terminateCallAndTranscribeRecording();

        throw new AssertError(message)
    }

    public async assertLastTranscriptIncludes(phrase: string) {
        this.assertions++;
        const transcript = this.callProcess.getReceivedTranscripts().getTranscript();
        if (transcript.length === 0 || !transcript[transcript.length - 1].toLowerCase().includes(phrase.toLowerCase())) {
            await this.escalateError(`Latest transcript does not include the phrase "${phrase}"`);
        }
    }

    public async assertTranscriptIncludes(phrase: string) {
        this.assertions++;
        const transcript = this.callProcess.getReceivedTranscripts().getTranscript();
        if (transcript.length === 0 || !transcript.some((t) => t.toLowerCase().includes(phrase.toLowerCase()))) {
            await this.escalateError(`Transcript does not include the phrase "${phrase}"`);
        }
    }

    public async assertFinalTranscriptIncludes(phrase: string) {
        this.assertions++;
        const transcript = this.callProcess.getFinalTranscriptFromRecording();
        if (!transcript.toLowerCase().includes(phrase.toLowerCase())) {
            await this.escalateError(`Final transcript does not include the phrase "${phrase}"`);
        }
    }

    public async pause(milliseconds: number) {
        this.assertions++;
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    public async pauseInSpeech(milliseconds: number) {
        this.assertions++;
        // Reset timer
        this.lastSpeechBitReceived = Date.now();

        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (Date.now() - this.lastSpeechBitReceived > milliseconds) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    public async assertPauseNotLongerThan(milliseconds: number) {
        this.assertions++;
        await new Promise((resolve) => setTimeout(resolve, milliseconds));

        const lastSpeech = this.callProcess.getLastSpeech();
        if (Date.now() - lastSpeech > milliseconds) {
            await this.escalateError(`Pause between speech is longer than ${milliseconds} milliseconds`);
        }
    }

    public async analyzeTranscribedTextWithAI(goal: string) {
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
                {role: 'user', content: `Goal: ${goal}`}
            ],
            model: process.env.EVALUATION_MODEL || 'gpt-4o',
        });

        const response = chatCompletion.choices[0].message.content;

        if (response.toLowerCase().includes('no')) {
            await this.escalateError(`The AI determined that the goal '${goal}' was not met.`);
        }
    }
}