import fs from 'fs';
import { decode } from 'wav-decoder';
import { createCanvas } from 'canvas';

export default class RecordingProcessor {
    private filename: string;

    constructor(filename) {
        this.filename = filename;
    }

    async process() {
        const buffer = fs.readFileSync(this.filename);
        const audioData = await decode(buffer);

        if (!audioData || !audioData.channelData) {
            throw new Error('Invalid or unsupported .wav file.');
        }

        const { channelData, sampleRate } = audioData;

        // Generate waveform images for each channel
        const waveforms = channelData.map((channel, index) =>
            this.generateWaveformImage(channel, index, sampleRate)
        );

        // Determine overlap
        const overlap = this.detectOverlap(channelData);

        // Detect longest pause
        const longestPause = this.detectLongestPause(channelData, sampleRate);

        return {
            waveforms, // Array of image file paths
            overlap,   // Boolean indicating if overlap exists
            longestPause, // Longest pause duration in seconds
        };
    }

    generateWaveformImage(channel: string | any[], index: number, sampleRate: number) {
        const width = 1000; // Arbitrary width
        const height = 200; // Arbitrary height
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#333';
        ctx.beginPath();

        const samplesPerPixel = Math.floor(channel.length / width);
        for (let x = 0; x < width; x++) {
            const startSample = x * samplesPerPixel;
            const endSample = Math.min(startSample + samplesPerPixel, channel.length);
            const segment = channel.slice(startSample, endSample);
            const max = Math.max(...segment);
            const min = Math.min(...segment);

            const yMax = ((1 - max) / 2) * height;
            const yMin = ((1 - min) / 2) * height;

            ctx.moveTo(x, yMax);
            ctx.lineTo(x, yMin);
        }

        ctx.stroke();

        // Add X-axis time markers

        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';

        ctx.fillText(`Channel ${index === 0 ? '0 / Agent' : '1 / Testlab'}`, 55, 12); // Place text near the bottom

        const duration = channel.length / sampleRate; // Total duration in seconds
        const secondsPerMarker = Math.ceil(duration / 10); // Spread 10 markers evenly
        const pixelsPerSecond = width / duration;

        for (let second = 0; second <= duration; second += secondsPerMarker) {
            const x = Math.floor(second * pixelsPerSecond);
            const textX = Math.floor(second * pixelsPerSecond) + ((second == 0) ? 10 : 0);
            ctx.fillText(`${second}s`, textX, height - 5); // Place text near the bottom
            ctx.beginPath();
            ctx.moveTo(x, height - 30);
            ctx.lineTo(x, height - 20); // Small tick mark
            ctx.stroke();
        }

        const basename = this.filename.split('/').pop().replace('.wav', '');

        const fileName = `recordings/${basename}_channel_${index + 1}_waveform.png`;
        fs.writeFileSync(fileName, canvas.toBuffer());
        return fileName;
    }

    detectOverlap(channelData: any[]) {
        const threshold = 0.01; // Threshold for silence detection
        const activeRegions = channelData.map((channel) =>
            channel.map((sample: number) => Math.abs(sample) > threshold)
        );

        for (let i = 0; i < activeRegions[0].length; i++) {
            const isOverlapping = activeRegions.every((regions) => regions[i]);
            if (isOverlapping) {
                return true;
            }
        }
        return false;
    }


    detectLongestPause(channelData: any[], sampleRate: number) {
        const threshold = 0.01; // Threshold for silence detection
        let longestPause = 0;
        let currentPause = 0;

        for (let i = 0; i < channelData[0].length; i++) {
            const isSilent = channelData.every((channel) => Math.abs(channel[i]) < threshold);
            if (isSilent) {
                currentPause++;
            } else {
                if (currentPause > longestPause) {
                    longestPause = currentPause;
                }
                currentPause = 0;
            }
        }

        // Convert the longest pause from samples to seconds
        return longestPause / sampleRate;
    }
}
