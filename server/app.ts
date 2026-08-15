import express from 'express';

import { createServerConfig, type Environment } from './config.js';
import { createMiniMaxProvider } from './providers/minimax.js';
import { createGenerateRouter } from './routes/generate.js';

export const createApp = (environment: Environment = process.env): express.Express => {
  const config = createServerConfig(environment);
  const app = express();

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, minimaxConfigured: Boolean(config.minimaxApiKey) });
  });
  app.use('/api/generate', createGenerateRouter(createMiniMaxProvider()));

  return app;
};
