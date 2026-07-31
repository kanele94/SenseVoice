// One playground card per audio clip: playback player, transcription
// status, and the transcript once it arrives. `src` is an object URL for
// local clips (kept for the lifetime of the page so they stay replayable)
// or the remote audio URL when the server fetched the audio itself.

export function createAudioCard({ name, src }) {
  const card = document.createElement("article");
  card.className = "result-card";

  const title = document.createElement("h3");
  title.textContent = name;

  const player = document.createElement("audio");
  player.controls = true;
  player.src = src;
  player.className = "player";

  const download = document.createElement("a");
  download.href = src;
  // Cross-origin sources ignore the download hint and just open instead.
  download.download = name;
  download.textContent = "⬇ download";
  download.className = "download-link";

  const status = document.createElement("p");
  status.className = "card-status";
  status.textContent = "Transcribing…";

  const body = document.createElement("div");
  body.className = "card-body";

  card.append(title, player, download, status, body);

  return {
    element: card,

    setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle("error", isError);
    },

    setResult(item) {
      status.remove();

      const text = document.createElement("p");
      text.className = "result-text";
      text.textContent = item.text;

      const raw = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Raw output (language/emotion tags)";
      const rawText = document.createElement("code");
      rawText.textContent = item.raw_text;
      raw.append(summary, rawText);

      body.append(text, raw);
    },
  };
}
