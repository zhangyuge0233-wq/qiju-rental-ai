import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../server/app.js';
import type { ServerConfig } from '../../server/config.js';
import type { GenerationProvider } from '../../server/providers/generation-provider.js';
import { createJpegFixture } from '../helpers/image-fixtures.js';

describe('GET /api/health', () => {
  it('不返回密钥且报告 MiniMax 未配置', async () => {
    const response = await request(createApp({})).get('/api/health');

    expect(response.body).toEqual({ ok: true, aiConfigured: false, provider: 'minimax' });
    expect(JSON.stringify(response.body)).not.toContain('apiKey');
  });

  it('将 MiniMax 配置交给供应商工厂，并且接口不泄露密钥', async () => {
    const apiKey = 'fixture-minimax-secret';
    const jpegBytes = createJpegFixture();
    let receivedConfig: ServerConfig | undefined;
    const providerFactory = (config: ServerConfig): GenerationProvider => {
      receivedConfig = config;
      return {
        generate: async () => ({ bytes: jpegBytes, mimeType: 'image/jpeg' }),
      };
    };
    const app = createApp({
      MINIMAX_API_KEY: apiKey,
      MINIMAX_API_URL: 'https://example.test/minimax',
      MINIMAX_MODEL: 'image-fixture',
    }, undefined, providerFactory);

    const health = await request(app).get('/api/health');
    const generated = await request(app)
      .post('/api/generate')
      .attach('roomImage', jpegBytes, 'room.jpg')
      .field('presetStyle', '奶油风');

    expect(receivedConfig).toMatchObject({
      minimaxApiKey: apiKey,
      minimaxApiUrl: 'https://example.test/minimax',
      minimaxModel: 'image-fixture',
    });
    expect(health.body).toEqual({ ok: true, aiConfigured: true, provider: 'minimax' });
    expect(generated.body).toEqual({
      ok: true,
      imageMimeType: 'image/jpeg',
      imageBase64: jpegBytes.toString('base64'),
    });
    expect(JSON.stringify({ health: health.body, generated: generated.body })).not.toContain(apiKey);
  });
});
