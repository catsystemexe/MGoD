import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 80),
    strictPort: true,

    // Replit preview hosty (subdomain wildcard)
    allowedHosts: [
      ".replit.dev",
      ".replit.app",
      ".repl.co",
      "localhost",
      "127.0.0.1",
    ],
  },
});
