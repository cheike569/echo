export default class ReceivedTranscript {
    private transcript: string[] = [];

    public add(transcript: string) {
        this.transcript.push(transcript);
    }

    public getTranscript() {
        return this.transcript;
    }

    public getTextTranscript() {
        return this.transcript.join(' ');
    }
}