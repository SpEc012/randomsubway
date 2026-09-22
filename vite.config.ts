import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base: the same build works at /randomsubway/ on Pages, a custom domain, or locally.
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
