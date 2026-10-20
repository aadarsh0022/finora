import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
  },
});
