import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base required for Capacitor file:// / WebView loading
  base: './',
  server: {
    port: 10000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:11000',
        changeOrigin: true,
      },
    },
  },
});
