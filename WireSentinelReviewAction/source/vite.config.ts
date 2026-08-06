import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import uipathCodedApps from '@uipath/coded-apps-dev/vite';

export default defineConfig({
  plugins: [react(), uipathCodedApps()],
  base: './',
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@uipath/uipath-typescript', '@uipath/coded-action-app'],
  },
});
