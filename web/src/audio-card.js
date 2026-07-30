// One playground card per audio clip: playback player, transcription
// status, and the transcript once it arrives. The object URL is kept for
// the lifetime of the page so the clip stays replayable.

export function createAudioCard(file) {
  const card = document.createElement("article");
  card.className = "result-card";

  const title = document.createElement("h3");
  title.textContent = file.name;

  const player = document.createElement("audio");
  player.controls = true;
  player.src = URL.createObjectURL(file);
  player.className = "player";

  const download = document.createElement("a");
  download.href = player.src;
  download.download = file.name;
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
