import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../server/app.js';

describe('POST /api/generate', () => {
  it('未配置时返回真实错误而非图片', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .attach('roomImage', Buffer.from('room'), 'room.jpg')
      .field('presetStyle', '奶油风');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ ok: false, code: 'MINIMAX_NOT_CONFIGURED' });
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
    const response = await request(createApp({}))
      .post('/api/generate')
      .attach('roomImage', Buffer.from('room'), 'room.jpg');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('重复房间图时返回不含堆栈的 JSON 输入错误', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .attach('roomImage', Buffer.from('room-one'), 'room-one.jpg')
      .attach('roomImage', Buffer.from('room-two'), 'room-two.jpg')
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
      .attach('roomImage', Buffer.from('room'), 'room.jpg')
      .attach('unexpectedImage', Buffer.from('unexpected'), 'unexpected.jpg')
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

  it('超限房间图时返回不含堆栈的 JSON 输入错误', async () => {
    const response = await request(createApp({}))
      .post('/api/generate')
      .attach('roomImage', Buffer.alloc(5 * 1024 * 1024 + 1), 'oversized.jpg')
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
});
