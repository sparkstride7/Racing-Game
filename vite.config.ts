import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the game works from any web address,
  // e.g. https://<user>.github.io/<repo>/ on GitHub Pages.
  base: './',
  build: {
    target: 'es2022',
    // The physics engine ships its WebAssembly inside the JavaScript bundle,
    // so the bundle is legitimately large.
    chunkSizeWarningLimit: 6000,
  },
});
