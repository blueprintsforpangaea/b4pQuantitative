import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
  server: {
    proxy: {
      "/items": "http://127.0.0.1:8000",
      "/kpis": "http://127.0.0.1:8000",
      "/stock-alerts": "http://127.0.0.1:8000",
      "/sync-status": "http://127.0.0.1:8000",
      "/requests": "http://127.0.0.1:8000",
      "/shipments": "http://127.0.0.1:8000",
      "/allocations": "http://127.0.0.1:8000",
    },
  },
});
