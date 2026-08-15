import { fileURLToPath } from 'node:url';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../server/app';

const clientDistDirectory = fileURLToPath(new URL('../fixtures/production-dist', import.meta.url));

describe('production static hosting', () => {
  it('在保留 API 的同时提供前端入口', async () => {
    // Removing production static hosting would leave npm run start serving only /api.
    const app = createApp({}, clientDistDirectory);

    const [home, health] = await Promise.all([
      request(app).get('/').expect(200),
      request(app).get('/api/health').expect(200),
    ]);

    expect(home.text).toContain('栖居生产前端');
    expect(health.body).toEqual({ ok: true, minimaxConfigured: false });
  });
});
