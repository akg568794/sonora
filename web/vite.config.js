import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.SONORA_SERVER ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind on all interfaces so you can open the room on your phone over wifi.
    host: true,
    // Vite 6 rejects unrecognised Host headers by default; hosted preview/tunnel domains need this.
    allowedHosts: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  preview: {
    allowedHosts: true,
  },
});
