import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        game: resolve(import.meta.dirname, 'index.html'),
        credits: resolve(import.meta.dirname, 'credits.html'),
      },
    },
  },
});
