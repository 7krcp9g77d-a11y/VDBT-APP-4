import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Hierdoor kunnen Aidan en Oliver de app op hun beginscherm zetten.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Tuinplanner",
        short_name: "Planning",
        description: "Planning en tijdsregistratie op de werf",
        lang: "nl-BE",
        start_url: "/",
        display: "standalone",
        background_color: "#fafaf9",
        theme_color: "#065f46",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        // De app-schil blijft offline beschikbaar. De registraties zelf
        // offline bufferen is een aparte stap — zie README, stap 8.
        navigateFallback: "index.html",
      },
    }),
  ],
});
