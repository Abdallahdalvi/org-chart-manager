import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'selfhost/server.ts',
    outDir: 'selfhost-dist/server',
    emptyOutDir: true,
    target: 'node22',
    rolldownOptions: {
      output: { entryFileNames: 'server.mjs', codeSplitting: false },
    },
  },
  ssr: { noExternal: ['zod', 'jose'] },
});
