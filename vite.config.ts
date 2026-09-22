import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/randomsubway/' : '/',
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
