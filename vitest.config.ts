import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      'WireSentinelApp/src/**/*.test.{ts,tsx}',
      'WireSentinelCockpitShared/src/**/*.test.{ts,tsx}',
    ],
    css: true,
  },
});
