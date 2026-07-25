import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `node` rather than jsdom: the engine is plain TypeScript and only needs a
    // handful of browser globals, which setup.ts provides explicitly.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
