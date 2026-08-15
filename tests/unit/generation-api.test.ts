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
  });

  it('将非 2xx 的服务端失败响应转换为 GenerationApiError 而非图片', async () => {
    // Turning HTTP errors into a Blob would hide real API failures from the state machine.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'MINIMAX_NOT_CONFIGURED',
      message: 'AI 服务尚未配置，请稍后再试',
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
