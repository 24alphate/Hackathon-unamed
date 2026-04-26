import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Browser calls same-origin `/api/*`; Vite forwards to the Node API.
 * loadEnv ensures `.env` values (e.g. API_PROXY) are visible here — plain `process.env` is not enough in Vite config.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = (env.API_PROXY || "http://127.0.0.1:3001").replace(/\/$/, "");
  const apiProxy = {
    "/api": {
      target: apiTarget,
      changeOrigin: true
    }
  };

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy: apiProxy
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: false,
      proxy: apiProxy
    }
  };
});
