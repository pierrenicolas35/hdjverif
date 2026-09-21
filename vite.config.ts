import { defineConfig } from 'vite';

/**
 * `base: './'` rend le build portable : il fonctionne aussi bien servi à la
 * racine d'un domaine que depuis un sous-répertoire GitHub Pages
 * (https://<user>.github.io/hdjverif/).
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
});
