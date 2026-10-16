import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['apps/web/**/*.test.tsx'],
    setupFiles: ['./apps/web/test/setup.ts'],
  },
});
