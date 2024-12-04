import {createClient} from "@deepgram/sdk";
import fs from "fs";

type TranscriptionResult = {
    metadata: any;
    results: {
        channels: {
            alternatives: {
                transcript: string;
                confidence: number;
                words: {
                    word: string;
                    start: number;
                    end: number;
                    confidence: number;
                    punctuated_word: string;
                    sentiment: string;
                    sentiment_score: number;
                }[];
                paragraphs: {
                    transcript: string;
                    paragraphs: {
                        sentences: {
                            text: string;
                            start: number;
                            end: number;
                            sentiment: string;
                            sentiment_score: number;
                        }[];
                        sentiment: string;
                        sentiment_score: number;
                        num_words: number;
                        start: number;
                        end: number;
                    }[];
                };
            }[];
        }[];
    };
};

const formatTime = (seconds: number): string => {
    return `[${seconds.toFixed(3)}s]`;
};

// Generate transcription string with proper sorting and concatenation
const generateTranscription = (data: TranscriptionResult): string => {
    const allWords = [];

    // Collect all words across channels with metadata
    data.results.channels.forEach((channel, index) => {
        const speaker = `Speaker ${index + 1}`;
        const words = channel.alternatives[0].words;
        words.forEach((word) => {
            allWords.push({
                time: word.start,
                text: word.punctuated_word,
                speaker,
            });
        });
    });

    // Sort all words by start time
    allWords.sort((a, b) => (a.time > b.time) ? 1 : -1);

    // Build transcription, grouping by speaker and time
    let transcription = '';
    let currentSpeaker = '';
    let currentTime = '';
    let currentText = '';

    allWords.forEach((word, index) => {
        // If the speaker changes, finalize the current line
        if (word.speaker !== currentSpeaker) {
            if (currentText) {
                transcription += `${currentTime} [${currentSpeaker}] ${currentText.trim()}\n`;
            }
            currentSpeaker = word.speaker;
            currentTime = formatTime(word.time);
            currentText = '';
        }

        // Append the current word
        currentText += `${word.text} `;

        // Finalize the last speaker's line at the end of the loop
        if (index === allWords.length - 1) {
            transcription += `${currentTime} [${currentSpeaker}] ${currentText.trim()}\n`;
        }
    });

    return transcription.trim();
};


export const transcribeFile = async (file: string) => {
    // STEP 1: Create a Deepgram client using the API key
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    // STEP 2: Call the transcribeFile method with the audio payload and options
    const {result, error} = await deepgram.listen.prerecorded.transcribeFile(
        fs.readFileSync(file),
        // STEP 3: Configure Deepgram options for audio analysis
        {
            model: "enhanced",
            // sentiment: true,
            smart_format: true,
            // intents: true,
            // summarize: "v2",
            // topics: true,
            punctuate: true,
            multichannel: true,
        }
    );

    if (error) throw error;
    // // STEP 4: Print the results
    // if (!error) console.dir(result, {depth: null});

    return generateTranscription(result as TranscriptionResult);
};

export const printTable = (transcriptionString: string) => {
    const lines = transcriptionString.split('\n');
    const table = lines.map((line) => {
        const [time, speaker, ...text] = line.split(/ (\[Speaker \d+\]) /).filter(Boolean);
        return {
            time,
            speaker,
            text: text.join(' '),
        };
    });
    console.table(table);
}