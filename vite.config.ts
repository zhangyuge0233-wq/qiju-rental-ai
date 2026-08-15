import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { resolvePort, type Environment } from './server/config';

export const createViteConfig = (environment: Environment) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${resolvePort(environment)}`,
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});

export default defineConfig(({ mode }) => createViteConfig({
  ...loadEnv(mode, process.cwd(), ''),
  ...process.env,
}));
