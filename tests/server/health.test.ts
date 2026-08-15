import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../server/app.js';

describe('GET /api/health', () => {
  it('不返回密钥且报告 MiniMax 未配置', async () => {
    const response = await request(createApp({})).get('/api/health');

    expect(response.body).toEqual({ ok: true, minimaxConfigured: false });
    expect(JSON.stringify(response.body)).not.toContain('apiKey');
  });
});
