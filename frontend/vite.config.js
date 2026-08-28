import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base required for Capacitor file:// / WebView loading
  base: './',
  build: {
    target: 'es2018',
    cssMinify: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep heavy PDF/canvas libs out of screen chunks; load only when exporting.
          if (id.includes('node_modules/html2canvas') || id.includes('node_modules/jspdf')) return 'export';
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) return 'charts';
          if (id.includes('node_modules/qrcode')) return 'qrcode';
        },
      },
    },
  },
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
