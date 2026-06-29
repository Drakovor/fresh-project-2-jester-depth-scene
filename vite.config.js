import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/pixi.js/') || id.includes('/node_modules/@pixi/')) {
            return 'pixi';
          }
          if (id.includes('/node_modules/')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
