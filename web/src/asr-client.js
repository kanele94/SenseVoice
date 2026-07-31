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

  return request(apiUrl, "/api/v1/asr", { method: "POST", body: form });
}

// The server downloads these itself, so the audio never passes through the
// browser -- useful for files already hosted somewhere the API can reach.
export async function transcribeUrls(urls, { apiUrl = "", lang = "auto", useItn = false } = {}) {
  return request(apiUrl, "/api/v1/asr/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_urls: urls, lang, use_itn: useItn }),
  });
}

// Filename the API will use as the result key for a URL: last path segment,
// query string dropped, percent-decoded. Mirrors key_from_url() in api.py.
export function keyFromUrl(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname).split("/").pop();
    return name || url;
  } catch {
    return url;
  }
}

async function request(apiUrl, path, init) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}${path}`, init);
  if (!response.ok) {
    throw new Error(`ASR request failed (${response.status}): ${await errorDetail(response)}`);
  }
  const payload = await response.json();
  return payload.result ?? [];
}

// FastAPI reports failures as {"detail": ...}; fall back to the raw body.
async function errorDetail(response) {
  const body = await response.text().catch(() => "");
  try {
    const detail = JSON.parse(body).detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    return body;
  }
}
