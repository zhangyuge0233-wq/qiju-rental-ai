import express from 'express';
import { fileURLToPath } from 'node:url';

import { createServerConfig, type Environment, type ServerConfig } from './config.js';
import { createMiniMaxProvider } from './providers/minimax.js';
import type { GenerationProvider } from './providers/generation-provider.js';
import { createGenerateRouter } from './routes/generate.js';

const productionClientDirectory = fileURLToPath(new URL('../../dist', import.meta.url));

export const createApp = (
  environment: Environment = process.env,
  clientDirectory = productionClientDirectory,
  providerFactory: (config: ServerConfig) => GenerationProvider = createMiniMaxProvider,
): express.Express => {
  const config = createServerConfig(environment);
  const app = express();

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, aiConfigured: Boolean(config.minimaxApiKey), provider: 'minimax' });
  });
  app.use('/api/generate', createGenerateRouter(providerFactory(config)));
  app.use(express.static(clientDirectory));

  return app;
};
