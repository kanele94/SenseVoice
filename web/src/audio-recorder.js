// Microphone capture via MediaRecorder. stop() resolves with the raw
// recording blob; callers convert it to WAV with blobToWav16k().

export class AudioRecorder {
  #mediaRecorder = null;
  #chunks = [];

  get isRecording() {
    return this.#mediaRecorder?.state === "recording";
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.#chunks = [];
    this.#mediaRecorder = new MediaRecorder(stream);
    this.#mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data);
    };
    this.#mediaRecorder.start();
  }

  stop() {
    return new Promise((resolve, reject) => {
      const recorder = this.#mediaRecorder;
      if (!recorder || recorder.state !== "recording") {
        reject(new Error("Not recording"));
        return;
      }
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(this.#chunks, { type: recorder.mimeType }));
      };
      recorder.onerror = (event) => reject(event.error);
      recorder.stop();
    });
  }
}
