import { describe, expect, it } from 'vitest';

import { resolvePort } from '../../server/config';
import { createViteConfig } from '../../vite.config';

describe('development API proxy configuration', () => {
  it('uses the same custom PORT for Vite proxying and Express resolution', () => {
    // A fixed :3000 proxy would fail whenever the server receives a custom PORT.
    const environment = { PORT: '4312' };
    const config = createViteConfig(environment);

    expect(resolvePort(environment)).toBe(4312);
    expect(config.server?.proxy).toMatchObject({
      '/api': 'http://127.0.0.1:4312',
    });
  });

  it('falls back to the same default port when PORT is absent or invalid', () => {
    expect(resolvePort({})).toBe(3000);
    expect(createViteConfig({}).server?.proxy).toMatchObject({
      '/api': 'http://127.0.0.1:3000',
    });
  });
});
