// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",

  server: {
    host: true,
    port: Number(process.env.PORT) || 80,
    strictPort: true,

    allowedHosts: [
      "localhost",
      ".replit.dev", // ✅ povolí VŠECHNY replit preview hosty
    ],
  },
});