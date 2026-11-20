import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
    // Carrega .env + .env.test (o último tem prioridade) — testes usam o banco de teste real.
    env: loadEnv('test', process.cwd(), ''),
    globalSetup: ['./tests/global-setup.ts'],
    // Testes de integração compartilham o mesmo banco: evitar concorrência entre arquivos.
    fileParallelism: false,
  },
});
