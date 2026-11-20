import { defineConfig } from 'vite';

// Build da API para Node (SSR): dependências ficam externas e são resolvidas via node_modules.
export default defineConfig({
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
    target: 'node22',
    emptyOutDir: true,
    sourcemap: true,
  },
});
