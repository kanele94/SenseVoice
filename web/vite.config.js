import { defineConfig } from "vite";

// Point this at the running SenseVoice API container, e.g.
//   SENSEVOICE_API_URL=http://192.168.1.20:5000 npm run dev
const apiTarget = process.env.SENSEVOICE_API_URL || "http://172.16.1.22:5000";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  // `vite preview` reuses server.proxy by default, so the built site
  // also works without CORS changes on the API.
});
