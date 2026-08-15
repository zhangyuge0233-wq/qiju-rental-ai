import express from 'express';
import { fileURLToPath } from 'node:url';

import { createServerConfig, type Environment } from './config.js';
import { createMiniMaxProvider } from './providers/minimax.js';
import { createGenerateRouter } from './routes/generate.js';

const productionClientDirectory = fileURLToPath(new URL('../../dist', import.meta.url));

export const createApp = (
  environment: Environment = process.env,
  clientDirectory = productionClientDirectory,
): express.Express => {
  const config = createServerConfig(environment);
  const app = express();

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, minimaxConfigured: Boolean(config.minimaxApiKey) });
  });
  app.use('/api/generate', createGenerateRouter(createMiniMaxProvider()));
  app.use(express.static(clientDirectory));

  return app;
};
