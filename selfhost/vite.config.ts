import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: '../public',
  resolve: {
    alias: { '@': fileURLToPath(new URL('..', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: '../selfhost-dist/client',
    emptyOutDir: true,
    sourcemap: false,
  },
});
