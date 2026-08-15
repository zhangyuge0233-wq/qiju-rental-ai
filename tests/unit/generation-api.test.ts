/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerationApiError, generateRoom } from '../../src/services/generation-api';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generateRoom', () => {
  it('仅以约定的 multipart 字段提交输入并还原成功图片', async () => {
    // Missing or renamed fields, or returning JSON instead of the image Blob, must fail this test.
    const roomImage = new Blob(['room'], { type: 'image/jpeg' });
    const referenceImage = new Blob(['reference'], { type: 'image/png' });
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      imageMimeType: 'image/webp',
      imageBase64: btoa('generated image'),
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateRoom({ roomImage, referenceImage, presetStyle: '奶油风' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/generate');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    const form = options.body as FormData;
    expect(Array.from(form.keys())).toEqual(['roomImage', 'referenceImage', 'presetStyle']);
    expect(await (form.get('roomImage') as Blob).text()).toBe('room');
    expect(await (form.get('referenceImage') as Blob).text()).toBe('reference');
    expect(form.get('presetStyle')).toBe('奶油风');
    expect(result.type).toBe('image/webp');
    expect(await result.text()).toBe('generated image');
    expect(createImageBitmap).toHaveBeenCalledWith(result);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('只按错误码映射中文文案并忽略服务端敏感 message', async () => {
    // Rendering the server-provided message could disclose upstream implementation details.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'MINIMAX_NOT_CONFIGURED',
      message: 'Sensitive upstream trace at /Users/example/private-key.ts',
    }), { status: 503, headers: { 'content-type': 'application/json' } })));

    const request = generateRoom({
      roomImage: new Blob(['room'], { type: 'image/jpeg' }),
      presetStyle: '原木风',
    });

    await expect(request).rejects.toEqual(new GenerationApiError(
      'MINIMAX_NOT_CONFIGURED',
      'AI 服务尚未配置，请稍后再试',
    ));
  });

  it.each([
    ['空 Base64', 'image/png', ''],
    ['非法 Base64', 'image/png', '%%%not-base64%%%'],
    ['非法 MIME', 'image/gif', btoa('GIF89a')],
  ])('拒绝成功响应中的%s', async (_label, imageMimeType, imageBase64) => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 1,
      height: 1,
      close: vi.fn(),
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      imageMimeType,
      imageBase64,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(generateRoom({
      roomImage: new Blob(['room'], { type: 'image/jpeg' }),
      presetStyle: '原木风',
    })).rejects.toEqual(new GenerationApiError('UNKNOWN_ERROR', '发生未知错误，请再次尝试'));
  });

  it('拒绝虽为合法 Base64 但无法解码为图片的响应', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      imageMimeType: 'image/png',
      imageBase64: btoa('plain text, not an image'),
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(generateRoom({
      roomImage: new Blob(['room'], { type: 'image/jpeg' }),
      presetStyle: '原木风',
    })).rejects.toEqual(new GenerationApiError('UNKNOWN_ERROR', '发生未知错误，请再次尝试'));
  });

  it('将网络失败归类为共享的 NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(generateRoom({
      roomImage: new Blob(['room'], { type: 'image/jpeg' }),
      presetStyle: '原木风',
    })).rejects.toEqual(new GenerationApiError('NETWORK_ERROR', '网络连接失败，请检查网络后重试'));
  });

  it('保留调用方主动取消的 AbortError', async () => {
    // Mapping cancellation to NETWORK_ERROR would make intentional invalidation look like a failed request.
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const controller = new AbortController();

    await expect(generateRoom({
      roomImage: new Blob(['room'], { type: 'image/jpeg' }),
      presetStyle: '原木风',
    }, controller.signal)).rejects.toBe(abortError);
  });
});
