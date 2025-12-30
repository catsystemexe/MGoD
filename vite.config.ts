import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,

    // 🔥 vypnout HMR (kvůli reload loop na iPadu / Replitu)
    hmr: false,

    // ✅ povolit Replit doménu (Brave / security)
    allowedHosts: [
      "1308b564-0904-4ca4-a992-6715d78015ee-00-1gx2x9giuiegj.riker.replit.dev"
    ]
  }
});
