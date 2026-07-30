import { AudioRecorder } from "./audio-recorder.js";
import { blobToWav16k } from "./wav-encoder.js";
import { transcribe } from "./asr-client.js";
import "./style.css";

const apiUrlInput = document.getElementById("api-url");
const recordButton = document.getElementById("record-button");
const fileInput = document.getElementById("file-input");
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

async function runTranscription(files) {
  setStatus(`Transcribing ${files.map((f) => f.name).join(", ")}…`);
  try {
    const results = await transcribe(files, {
      apiUrl: apiUrlInput.value.trim(),
      lang: languageSelect.value,
      useItn: useItnCheckbox.checked,
    });
    renderResults(results);
    setStatus(results.length > 0 ? "Done." : "No speech detected.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderResults(results) {
  for (const item of results) {
    const card = document.createElement("article");
    card.className = "result-card";

    const title = document.createElement("h3");
    title.textContent = item.key;

    const text = document.createElement("p");
    text.className = "result-text";
    text.textContent = item.text;

    const raw = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Raw output (language/emotion tags)";
    const rawText = document.createElement("code");
    rawText.textContent = item.raw_text;
    raw.append(summary, rawText);

    card.append(title, text, raw);
    resultsEl.prepend(card);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
