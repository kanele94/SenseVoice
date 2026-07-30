# SenseVoice Web UI

Minimal Vite site for the SenseVoice STT API (`POST /api/v1/asr`). Record from
the microphone or upload audio files; the browser converts audio to 16 kHz mono
WAV before uploading.

## Run

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 and enter the API address (e.g.
`http://<gpu-server>:5000`) in the **API URL** field — it is remembered in
localStorage. Direct calls like this rely on the CORS middleware in `api.py`,
so the API container must run a build that includes it.

Leave the field empty to call the same origin instead: `/api/*` is then
forwarded by the Vite proxy (target from `SENSEVOICE_API_URL`, default
`http://localhost:5000`), which works even without CORS.

For a production build: `npm run build`, then `npm run preview` (the preview
server reuses the same proxy), or serve `dist/` behind any reverse proxy that
forwards `/api` to the SenseVoice container.

Note: browsers only allow microphone access on `localhost` or HTTPS origins.
File upload works everywhere.
