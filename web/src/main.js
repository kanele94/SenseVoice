import { AudioRecorder } from "./audio-recorder.js";
import { blobToWav16k } from "./wav-encoder.js";
import { transcribe, transcribeUrls, keyFromUrl } from "./asr-client.js";
import { createAudioCard } from "./audio-card.js";
import "./style.css";

const apiUrlInput = document.getElementById("api-url");
const recordButton = document.getElementById("record-button");
const fileInput = document.getElementById("file-input");
const urlForm = document.getElementById("url-form");
const audioUrlInput = document.getElementById("audio-url");
const languageSelect = document.getElementById("language");
const useItnCheckbox = document.getElementById("use-itn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const recorder = new AudioRecorder();

const API_URL_STORAGE_KEY = "sensevoice-api-url";
const DEFAULT_API_URL = "http://172.16.1.22:5000";
apiUrlInput.value = localStorage.getItem(API_URL_STORAGE_KEY) ?? DEFAULT_API_URL;
apiUrlInput.addEventListener("change", () => {
  localStorage.setItem(API_URL_STORAGE_KEY, apiUrlInput.value.trim());
});

recordButton.addEventListener("click", async () => {
  if (!recorder.isRecording) {
    try {
      await recorder.start();
      recordButton.textContent = "⏹️ Stop & transcribe";
      recordButton.classList.add("recording");
      setStatus("Recording… speak now.");
    } catch (error) {
      setStatus(`Microphone unavailable: ${error.message}`, true);
    }
    return;
  }

  recordButton.disabled = true;
  try {
    const rawBlob = await recorder.stop();
    setStatus("Converting recording to 16 kHz WAV…");
    const wavBlob = await blobToWav16k(rawBlob);
    const file = new File([wavBlob], `recording-${timestamp()}.wav`, { type: "audio/wav" });
    await runTranscription([file]);
  } catch (error) {
    setStatus(`Recording failed: ${error.message}`, true);
  } finally {
    recordButton.textContent = "🎙️ Start recording";
    recordButton.classList.remove("recording");
    recordButton.disabled = false;
  }
});

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  if (files.length > 0) await runTranscription(files);
});

urlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  // Several URLs may be pasted at once, separated by commas or whitespace.
  const urls = audioUrlInput.value.split(/[\s,]+/).filter(Boolean);
  if (urls.length === 0) return;
  audioUrlInput.value = "";
  await runUrlTranscription(urls);
});

async function runTranscription(files) {
  const sources = files.map((file) => ({ name: file.name, src: URL.createObjectURL(file) }));
  await runJob(sources, (options) => transcribe(files, options));
}

async function runUrlTranscription(urls) {
  const sources = urls.map((url) => ({ name: keyFromUrl(url), src: url }));
  await runJob(sources, (options) => transcribeUrls(urls, options));
}

async function runJob(sources, transcribeFn) {
  // Every clip becomes a playground card immediately, so it is playable
  // while (and after) transcription runs.
  const cards = sources.map((source) => {
    const card = createAudioCard(source);
    resultsEl.prepend(card.element);
    return card;
  });

  setStatus(`Transcribing ${sources.map((s) => s.name).join(", ")}…`);
  try {
    const results = await transcribeFn({
      apiUrl: apiUrlInput.value.trim(),
      lang: languageSelect.value,
      useItn: useItnCheckbox.checked,
    });
    cards.forEach((card, i) => {
      const item = results.find((r) => r.key === sources[i].name) ?? results[i];
      if (item) {
        card.setResult(item);
      } else {
        card.setStatus("No speech detected.", true);
      }
    });
    setStatus("Done.");
  } catch (error) {
    cards.forEach((card) => card.setStatus("Transcription failed.", true));
    setStatus(error.message, true);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
