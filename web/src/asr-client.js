// Thin client for the SenseVoice FastAPI endpoint. With no apiUrl the
// request stays same-origin (/api/...) and the Vite dev/preview proxy
// forwards it; with an apiUrl the browser calls the API directly, which
// relies on the CORS middleware in api.py.

export async function transcribe(files, { apiUrl = "", lang = "auto", useItn = false } = {}) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  form.append("keys", files.map((f) => f.name).join(","));
  form.append("lang", lang);
  form.append("use_itn", useItn ? "true" : "false");

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/v1/asr`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`ASR request failed (${response.status}): ${detail}`);
  }
  const payload = await response.json();
  return payload.result ?? [];
}
