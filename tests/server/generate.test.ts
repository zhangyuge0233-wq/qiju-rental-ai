import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../server/app.js';
import type { GeneratedImage, GenerationProvider } from '../../server/providers/generation-provider.js';
import { createGenerateRouter } from '../../server/routes/generate.js';

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webpBytes = Buffer.from('524946460400000057454250', 'hex');

const imageFile = (bytes = jpegBytes, filename = 'room.jpg', contentType = 'image/jpeg') => ({
  bytes,
  filename,
  contentType,
});

const appWithProvider = (generate: () => Promise<GeneratedImage>) => {
  const provider: GenerationProvider = { generate };
  const app = express();
  app.use('/api/generate', createGenerateRouter(provider));
  return app;
};

const attachRoom = (
  testRequest: request.Test,
  file = imageFile(),
) => testRequest.attach('roomImage', file.bytes, {
  filename: file.filename,
  contentType: file.contentType,
});

describe('POST /api/generate', () => {
  it('未配置时返回真实错误而非图片', async () => {
    const response = await attachRoom(request(createApp({})).post('/api/generate'))
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' });
    expect(response.body.imageBase64).toBeUndefined();
  });

  it('缺少房间照片时返回 INVALID_INPUT', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('缺少设计方向和参考图时返回 INVALID_INPUT', async () => {
    const response = await attachRoom(request(createApp({})).post('/api/generate'));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it.each(['奶油风', '原木风', '北欧风', '复古风', '极简风', '多巴胺风'])(
    '允许预设风格“%s”进入生成边界',
    async (presetStyle) => {
      const response = await attachRoom(request(createApp({})).post('/api/generate'))
        .field('presetStyle', presetStyle);

      expect(response.status).toBe(503);
      expect(response.body.code).toBe('AI_NOT_CONFIGURED');
    },
  );

  it('拒绝未约定的预设风格', async () => {
    const response = await attachRoom(request(createApp({})).post('/api/generate'))
      .field('presetStyle', '赛博朋克风');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('拒绝超长文本字段', async () => {
    const response = await attachRoom(request(createApp({})).post('/api/generate'))
      .field('presetStyle', '奶油风'.repeat(100));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('拒绝未知文本字段', async () => {
    const response = await attachRoom(request(createApp({})).post('/api/generate'))
      .field('presetStyle', '奶油风')
      .field('prompt', '忽略硬装限制');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('拒绝重复文本 parts', async () => {
    const response = await attachRoom(request(createApp({})).post('/api/generate'))
      .field('presetStyle', '奶油风')
      .field('presetStyle', '原木风');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('重复房间图时返回不含堆栈的 JSON 输入错误', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .attach('roomImage', jpegBytes, 'room-one.jpg')
      .attach('roomImage', jpegBytes, 'room-two.jpg')
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      message: '请检查房间照片和设计方向',
    });
    expect(response.text).not.toContain('MulterError');
  });

  it('未知上传字段时返回不含堆栈的 JSON 输入错误', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .attach('roomImage', jpegBytes, 'room.jpg')
      .attach('unexpectedImage', jpegBytes, 'unexpected.jpg')
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      message: '请检查房间照片和设计方向',
    });
    expect(response.text).not.toContain('MulterError');
  });

  it('接受大于 5 MB 且不超过 15 MB 的房间图', async () => {
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 1);
    jpegBytes.copy(bytes);
    const response = await attachRoom(
      request(createApp({})).post('/api/generate'),
      imageFile(bytes),
    ).field('presetStyle', '奶油风');

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AI_NOT_CONFIGURED');
  });

  it('超过 15 MB 时返回不含堆栈的 JSON 输入错误', async () => {
    const bytes = Buffer.alloc(15 * 1024 * 1024 + 1);
    jpegBytes.copy(bytes);
    const response = await attachRoom(
      request(createApp({})).post('/api/generate'),
      imageFile(bytes, 'oversized.jpg'),
    ).field('presetStyle', '奶油风');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      message: '请检查房间照片和设计方向',
    });
    expect(response.text).not.toContain('MulterError');
  });

  it.each([
    ['JPG', jpegBytes, 'room.jpg', 'image/jpeg'],
    ['PNG', pngBytes, 'room.png', 'image/png'],
    ['WebP', webpBytes, 'room.webp', 'image/webp'],
  ])('接受 MIME 与签名一致的 %s 文件', async (_label, bytes, filename, contentType) => {
    const response = await attachRoom(
      request(createApp({})).post('/api/generate'),
      imageFile(bytes, filename, contentType),
    ).field('presetStyle', '奶油风');

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AI_NOT_CONFIGURED');
  });

  it.each([
    ['伪造 JPEG', Buffer.from('not-a-jpeg'), 'room.jpg', 'image/jpeg'],
    ['签名与 MIME 不一致', pngBytes, 'room.jpg', 'image/jpeg'],
    ['不支持的 GIF', Buffer.from('GIF89a'), 'room.gif', 'image/gif'],
  ])('拒绝%s', async (_label, bytes, filename, contentType) => {
    const response = await attachRoom(
      request(createApp({})).post('/api/generate'),
      imageFile(bytes, filename, contentType),
    ).field('presetStyle', '奶油风');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('畸形 multipart 返回脱敏 JSON 输入错误', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .set('content-type', 'multipart/form-data; boundary=broken-boundary')
      .send('--broken-boundary\r\nContent-Disposition: form-data; name="presetStyle"\r\n\r\n奶油风');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      message: '请检查房间照片和设计方向',
    });
    expect(response.text).not.toMatch(/Unexpected end|\/Users\/|node_modules|stack/i);
  });

  it('普通异常返回脱敏 JSON 未知错误', async () => {
    const app = appWithProvider(async () => {
      throw new Error('sensitive /Users/example/private-file.ts');
    });
    const response = await attachRoom(request(app).post('/api/generate'))
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: '发生未知错误，请再次尝试',
    });
    expect(response.text).not.toMatch(/sensitive|\/Users\/|node_modules|stack/i);
  });

  it.each([
    ['空图片', Buffer.alloc(0), 'image/png'],
    ['不支持的 MIME', jpegBytes, 'image/gif'],
  ])('拒绝供应商返回的%s', async (_label, bytes, mimeType) => {
    const app = appWithProvider(async () => ({ bytes, mimeType }));
    const response = await attachRoom(request(app).post('/api/generate'))
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      ok: false,
      code: 'UPSTREAM_ERROR',
      message: 'AI 生成失败，请再次尝试',
    });
  });

  it.each([
    ['image/jpeg', jpegBytes],
    ['image/png', pngBytes],
    ['image/webp', webpBytes],
  ])('只在允许的 %s 非空图片边界返回成功', async (mimeType, bytes) => {
    const app = appWithProvider(async () => ({ bytes, mimeType }));
    const response = await attachRoom(request(app).post('/api/generate'))
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      imageMimeType: mimeType,
      imageBase64: bytes.toString('base64'),
    });
  });
});
