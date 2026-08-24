import { describe, expect, it, vi } from 'vitest';

import type { ServerConfig } from '../../server/config.js';
import {
  GenerationProviderError,
  PRESERVE_STRUCTURE_CONSTRAINT,
  type GenerationInput,
} from '../../server/providers/generation-provider.js';
import { createMiniMaxProvider } from '../../server/providers/minimax.js';
import { createJpegFixture, createPngFixture, createWebpFixture } from '../helpers/image-fixtures.js';

const jpegBytes = createJpegFixture();
const config = {
  minimaxApiKey: 'fixture-secret',
  minimaxApiUrl: 'https://example.test/minimax',
  minimaxModel: 'image-01',
} satisfies Pick<ServerConfig, 'minimaxApiKey' | 'minimaxApiUrl' | 'minimaxModel'>;

const input = (overrides: Partial<GenerationInput> = {}): GenerationInput => ({
  roomImage: createJpegFixture(),
  roomMimeType: 'image/jpeg',
  presetStyle: '奶油风',
  constraint: PRESERVE_STRUCTURE_CONSTRAINT,
  ...overrides,
});

const successResponse = (base64 = jpegBytes.toString('base64')) => new Response(JSON.stringify({
  data: { image_base64: [base64] },
  metadata: { success_count: '1', failed_count: '0' },
  base_resp: { status_code: 0, status_msg: 'success' },
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const streamedResponse = (
  chunks: Uint8Array[],
  headers: HeadersInit = {},
  closeAfterChunks = true,
) => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (closeAfterChunks) {
        controller.close();
      } else {
        setTimeout(() => {
          try {
            controller.close();
          } catch {
            // The provider may have already cancelled this oversized stream.
          }
        }, 0);
      }
    },
    cancel,
  }), { status: 200, headers });

  return { response, cancel };
};

const expectUpstreamError = async (operation: Promise<unknown>) => {
  await expect(operation).rejects.toMatchObject({
    code: 'UPSTREAM_ERROR',
    name: GenerationProviderError.name,
    message: 'AI 生成失败，请再次尝试',
  });
};

const expectSanitizedUpstreamError = async (operation: Promise<unknown>, privateDetails: string[]) => {
  let error: unknown;
  try {
    await operation;
  } catch (caught) {
    error = caught;
  }

  expect(error).toMatchObject({
    code: 'UPSTREAM_ERROR',
    name: GenerationProviderError.name,
    message: 'AI 生成失败，请再次尝试',
  });
  const publicError = error as Error;
  const publicText = `${publicError.message}\n${publicError.stack}\n${JSON.stringify(error)}`;
  for (const detail of privateDetails) {
    expect(publicText).not.toContain(detail);
  }
};

describe('createMiniMaxProvider', () => {
  it('sends one text-only request and never uploads room bytes', async () => {
    const generationInput = input({
      referenceImage: createPngFixture(),
      referenceMimeType: 'image/png',
    });
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        model: 'image-01',
        prompt: '生成一张奶油风的年轻人出租屋室内设计效果图。单一真实房间，固定正面广角机位，保持自然透视和真实比例。完整展示墙面、门窗、地面和吊顶，门窗位置不变，不改变空间边界。仅调整家具、软装、材质与灯光，生活化、温馨、可落地，不要豪宅感。',
        aspect_ratio: '3:4',
        response_format: 'base64',
        n: 1,
        prompt_optimizer: false,
        aigc_watermark: false,
      });
      expect(body.subject_reference).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(generationInput.roomImage.toString('base64'));
      expect(JSON.stringify(body)).not.toContain(generationInput.referenceImage?.toString('base64'));
      return successResponse();
    });

    await expect(createMiniMaxProvider(config, fetchImpl).generate(generationInput))
      .resolves.toEqual({ bytes: jpegBytes, mimeType: 'image/jpeg' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the configured URL, model, and Bearer authorization', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(successResponse());

    await createMiniMaxProvider({
      ...config,
      minimaxApiUrl: 'https://example.test/alternate',
      minimaxModel: 'image-custom',
    }, fetchImpl).generate(input());

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/alternate');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer fixture-secret',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body)).model).toBe('image-custom');
  });

  it('returns AI_NOT_CONFIGURED without calling upstream when the key is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(createMiniMaxProvider({ ...config, minimaxApiKey: undefined }, fetchImpl).generate(input()))
      .rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', name: GenerationProviderError.name });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['JPEG', createJpegFixture(), 'image/jpeg'],
    ['PNG', createPngFixture(), 'image/png'],
    ['WebP', createWebpFixture(), 'image/webp'],
  ])('detects a %s image from its returned signature', async (_label, bytes, mimeType) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(successResponse(bytes.toString('base64')));

    await expect(createMiniMaxProvider(config, fetchImpl).generate(input()))
      .resolves.toEqual({ bytes, mimeType });
  });

  it.each([
    ['non-2xx response', new Response('private upstream response', { status: 502 })],
    ['non-zero base response code', new Response(JSON.stringify({
      data: { image_base64: [jpegBytes.toString('base64')] },
      base_resp: { status_code: 1001, status_msg: 'private upstream response' },
    }), { status: 200 })],
    ['missing output image', new Response(JSON.stringify({
      data: { image_base64: [] },
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 })],
    ['malformed Base64', successResponse('%%%')],
    ['invalid image signature', successResponse(Buffer.from('not-an-image').toString('base64'))],
  ])('maps %s to UPSTREAM_ERROR', async (_label, response) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expectUpstreamError(createMiniMaxProvider(config, fetchImpl).generate(input()));
  });

  it('rejects a decoded image larger than 3 MiB before it reaches the Vercel response boundary', async () => {
    const oversizedImage = Buffer.alloc(3 * 1024 * 1024 + 1);
    jpegBytes.copy(oversizedImage);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      successResponse(oversizedImage.toString('base64')),
    );

    await expectUpstreamError(createMiniMaxProvider(config, fetchImpl).generate(input()));
  });

  it('maps a direct network rejection to a generic error without private details', async () => {
    const privateDetails = [
      config.minimaxApiKey,
      '/private/credentials/minimax.json',
      'opaque upstream diagnostic text',
    ];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error(privateDetails.join(' | ')));

    await expectSanitizedUpstreamError(
      createMiniMaxProvider(config, fetchImpl).generate(input()),
      privateDetails,
    );
  });

  it('maps malformed upstream JSON to the same generic public error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"data":', { status: 200 }));

    await expectSanitizedUpstreamError(
      createMiniMaxProvider(config, fetchImpl).generate(input()),
      ['{"data":'],
    );
  });

  it('rejects an upstream response declaring more than 4.25 MiB and cancels its body', async () => {
    const { response, cancel } = streamedResponse(
      [new TextEncoder().encode('{"private":"upstream response"}')],
      { 'Content-Length': String(4.25 * 1024 * 1024 + 1) },
    );
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expectUpstreamError(createMiniMaxProvider(config, fetchImpl).generate(input()));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects a streamed upstream response exceeding 4.25 MiB and cancels its body', async () => {
    const { response, cancel } = streamedResponse([
      new Uint8Array(4.25 * 1024 * 1024),
      new Uint8Array([123]),
    ], {}, false);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expectUpstreamError(createMiniMaxProvider(config, fetchImpl).generate(input()));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('maps timeout failures to UPSTREAM_ERROR after 120 seconds', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('private upstream timeout')), { once: true });
      }));
      const operation = createMiniMaxProvider(config, fetchImpl).generate(input());
      const outcome = expectUpstreamError(operation);

      await vi.advanceTimersByTimeAsync(120_000);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['empty room bytes', Buffer.alloc(0), 'image/jpeg'],
    ['room MIME/signature mismatch', createPngFixture(), 'image/jpeg'],
    ['invalid reference bytes', Buffer.alloc(0), 'image/jpeg'],
  ])('preserves INVALID_INPUT validation for %s', async (label, bytes, mimeType) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const invalidInput = label === 'invalid reference bytes'
      ? input({ referenceImage: bytes, referenceMimeType: mimeType })
      : input({ roomImage: bytes, roomMimeType: mimeType });

    await expect(createMiniMaxProvider(config, fetchImpl).generate(invalidInput))
      .rejects.toMatchObject({ code: 'INVALID_INPUT', name: GenerationProviderError.name });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
