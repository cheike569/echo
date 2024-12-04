export default class ReceivedTranscript {
    constructor() {
        this.transcript = [];
    }
    add(transcript) {
        this.transcript.push(transcript);
    }
    getTranscript() {
        return this.transcript;
    }
    getTextTranscript() {
        return this.transcript.join(' ');
    }
}
//# sourceMappingURL=receivedTranscript.js.map