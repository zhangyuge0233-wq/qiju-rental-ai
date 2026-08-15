import { describe, expect, it, vi } from 'vitest';

import type { ServerConfig } from '../../server/config.js';
import {
  GenerationProviderError,
  PRESERVE_STRUCTURE_CONSTRAINT,
  type GenerationInput,
} from '../../server/providers/generation-provider.js';
import { createWanProvider } from '../../server/providers/wan.js';
import { createJpegFixture, createPngFixture, createWebpFixture } from '../helpers/image-fixtures.js';

const config: Pick<ServerConfig, 'dashscopeApiKey' | 'wanApiUrl' | 'wanModel'> = {
  dashscopeApiKey: 'test-dashscope-key',
  wanApiUrl: 'https://wan.example.test/generate',
  wanModel: 'wan2.7-image-pro',
};

const input = (overrides: Partial<GenerationInput> = {}): GenerationInput => ({
  roomImage: createJpegFixture(),
  roomMimeType: 'image/jpeg',
  presetStyle: '奶油风',
  constraint: PRESERVE_STRUCTURE_CONSTRAINT,
  ...overrides,
});

const upstreamSuccess = {
  output: {
    choices: [{
      message: {
        content: [{ type: 'image', image: 'https://dashscope-result.oss-cn-beijing.aliyuncs.com/result.png' }],
      },
    }],
  },
};

const fetchResponse = (body: unknown): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

describe('createWanProvider', () => {
  it('向 Wan 发送指定模型、房间 Data URL 与结构保留提示词', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));

    await createWanProvider(config, fetchImpl).generate(input());

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(config.wanApiUrl);
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${config.dashscopeApiKey}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'wan2.7-image-pro',
      input: { messages: [{ role: 'user', content: [
        { image: `data:image/jpeg;base64,${createJpegFixture().toString('base64')}` },
        { text: expect.stringContaining('保留墙体、门窗、地板、吊顶、透视和相机机位') },
      ] }] },
      parameters: { size: '2K', n: 1, watermark: false },
    });
  });

  it('参考图 Data URL 在房间图前，并在提示词标明两者角色', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])));

    await createWanProvider(config, fetchImpl).generate(input({
      referenceImage: createPngFixture(),
      referenceMimeType: 'image/png',
      presetStyle: undefined,
    }));

    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const content = request.input.messages[0].content;
    expect(content).toMatchObject([
      { image: `data:image/png;base64,${createPngFixture().toString('base64')}` },
      { image: `data:image/jpeg;base64,${createJpegFixture().toString('base64')}` },
      { text: expect.stringContaining('参考图') },
    ]);
    expect(content[2].text).toContain('房间图');
  });

  it('同时选择参考图和预设时包含完整且不冲突的设计方向', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])));

    await createWanProvider(config, fetchImpl).generate(input({
      referenceImage: createPngFixture(),
      referenceMimeType: 'image/png',
      presetStyle: '奶油风',
    }));

    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const prompt = request.input.messages[0].content[2].text as string;
    expect(prompt).toContain('奶油风');
    expect(prompt).toContain('第一张是参考图');
    expect(prompt).toContain('第二张是房间图');
    expect(prompt).toContain('参考图在色彩、材质和氛围上优先');
    expect(prompt).toContain('保留墙体、门窗、地板、吊顶、透视和相机机位');
    expect(prompt).toContain('仅调整家具、软装和灯光');
  });

  it('单图提示词把灯光列为可编辑项并保留完整空间约束', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])));

    await createWanProvider(config, fetchImpl).generate(input());

    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const prompt = request.input.messages[0].content[1].text as string;
    expect(prompt).toContain('保留墙体、门窗、地板、吊顶、透视和相机机位');
    expect(prompt).toContain('仅调整家具、软装和灯光');
  });

  it('未配置密钥时返回 AI_NOT_CONFIGURED 且不发起请求', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(createWanProvider({ ...config, dashscopeApiKey: undefined }, fetchImpl).generate(input()))
      .rejects.toEqual(expect.objectContaining({
        code: 'AI_NOT_CONFIGURED',
        name: GenerationProviderError.name,
      }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['空字节', Buffer.alloc(0), 'image/jpeg'],
    ['MIME 与签名不一致', createPngFixture(), 'image/jpeg'],
    ['尺寸小于下限', createJpegFixture(239, 600), 'image/jpeg'],
    ['宽高比超过 8:1', createWebpFixture(2000, 240), 'image/webp'],
    ['PNG Alpha', createPngFixture(800, 600, 6), 'image/png'],
    ['畸形元数据', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'],
  ])('Provider 防御性拒绝%s并返回 INVALID_INPUT', async (_label, roomImage, roomMimeType) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(createWanProvider(config, fetchImpl).generate(input({ roomImage, roomMimeType })))
      .rejects.toMatchObject({
        code: 'INVALID_INPUT',
        name: GenerationProviderError.name,
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Provider 独立校验参考图元数据', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(createWanProvider(config, fetchImpl).generate(input({
      referenceImage: createPngFixture(800, 600, 4),
      referenceMimeType: 'image/png',
    }))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      name: GenerationProviderError.name,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('从有效阿里云 HTTPS URL 下载签名 PNG 并保留同一取消信号', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(png));

    const image = await createWanProvider(config, fetchImpl).generate(input());

    expect(image).toEqual({ bytes: png, mimeType: 'image/png' });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://dashscope-result.oss-cn-beijing.aliyuncs.com/result.png');
    expect(fetchImpl.mock.calls[1][1]?.signal).toBe(fetchImpl.mock.calls[0][1]?.signal);
  });

  it('从下载字节签名识别 WebP', async () => {
    const webp = Buffer.from('524946460400000057454250', 'hex');
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(webp));

    await expect(createWanProvider(config, fetchImpl).generate(input()))
      .resolves.toEqual({ bytes: webp, mimeType: 'image/webp' });
  });

  it('默认 120 秒超时中止请求并返回脱敏的 UPSTREAM_ERROR', async () => {
    vi.useFakeTimers();

    try {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('upstream private message test-dashscope-key /Users/private/local-file.png'));
        }, { once: true });
      }));
      const operation = createWanProvider(config, fetchImpl).generate(input());
      let settled = false;
      void operation.then(() => { settled = true; }, () => { settled = true; });

      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(90_000);
      await expect(operation).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
        name: GenerationProviderError.name,
        message: 'AI 生成失败，请再次尝试',
      });

      try {
        await operation;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain('test-dashscope-key');
        expect(message).not.toContain('upstream private message');
        expect(message).not.toContain('/Users/private/local-file.png');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  const expectUpstreamErrorWithoutSensitiveDetails = async (operation: Promise<unknown>) => {
    await expect(operation).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      name: GenerationProviderError.name,
      message: 'AI 生成失败，请再次尝试',
    });

    try {
      await operation;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('test-dashscope-key');
      expect(message).not.toContain('upstream private message');
      expect(message).not.toContain('data:image/jpeg;base64,/9j/');
      expect(message).not.toContain('/Users/private/local-file.png');
    }
  };

  it('拒绝下载非阿里云 HTTPS 结果 URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse({
        output: {
          choices: [{
            message: {
              content: [{ type: 'image', image: 'https://attacker.example/result.png' }],
            },
          }],
        },
      }));

    await expectUpstreamErrorWithoutSensitiveDetails(
      createWanProvider(config, fetchImpl).generate(input()),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('拒绝阿里云 HTTPS 非标准端口结果 URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse({
        output: {
          choices: [{
            message: {
              content: [{
                type: 'image',
                image: 'https://oss-cn-beijing.aliyuncs.com:444/result.png',
              }],
            },
          }],
        },
      }));

    await expectUpstreamErrorWithoutSensitiveDetails(
      createWanProvider(config, fetchImpl).generate(input()),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('跳过较早的无效图片项并下载后续首个可信 URL', async () => {
    const validUrl = 'https://dashscope-result.oss-cn-beijing.aliyuncs.com/later.png';
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse({
        output: {
          choices: [
            { message: { content: [{ type: 'image', image: 'https://attacker.example/first.png' }] } },
            { message: { content: [
              { type: 'image', image: 'http://oss-cn-beijing.aliyuncs.com/insecure.png' },
              { type: 'image', image: validUrl },
            ] } },
          ],
        },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ])));

    await expect(createWanProvider(config, fetchImpl).generate(input()))
      .resolves.toMatchObject({ mimeType: 'image/png' });
    expect(fetchImpl.mock.calls[1][0]).toBe(validUrl);
  });

  it('禁用结果下载重定向并在重定向时失败关闭', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockImplementationOnce(async (_url, init) => {
        if (init?.redirect === 'error') {
          throw new TypeError('fetch failed');
        }
        return new Response(png);
      });

    await expectUpstreamErrorWithoutSensitiveDetails(
      createWanProvider(config, fetchImpl).generate(input()),
    );
    expect(fetchImpl.mock.calls[1][1]?.redirect).toBe('error');
  });

  it('拒绝 Content-Length 声明超过 25 MiB 的结果', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(png, {
        headers: { 'Content-Length': String(25 * 1024 * 1024 + 1) },
      }));

    await expectUpstreamErrorWithoutSensitiveDetails(
      createWanProvider(config, fetchImpl).generate(input()),
    );
  });

  it('流式结果累计超过 25 MiB 时立即取消并拒绝', async () => {
    const chunkSize = 1024 * 1024;
    const totalChunks = 30;
    let pullCount = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount > totalChunks) {
          controller.close();
          return;
        }

        const chunk = Buffer.alloc(chunkSize);
        if (pullCount === 1) {
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(chunk);
        }
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(new Response(body));

    const outcome = await createWanProvider(config, fetchImpl).generate(input()).then(
      () => 'resolved',
      (error: unknown) => error instanceof GenerationProviderError ? error.code : 'unexpected-error',
    );
    expect(outcome).toBe('UPSTREAM_ERROR');
    expect(cancelled).toBe(true);
    expect(pullCount).toBeLessThan(totalChunks);
  });

  it.each([
    ['生成请求返回非 2xx', () => vi.fn<typeof fetch>().mockResolvedValue(new Response('upstream private message', { status: 401 }))],
    ['生成响应包含顶层 code', () => vi.fn<typeof fetch>().mockResolvedValue(fetchResponse({ code: 'InvalidParameter', message: 'upstream private message' }))],
    ['生成响应缺少 HTTPS 图片 URL', () => vi.fn<typeof fetch>().mockResolvedValue(fetchResponse({
      output: { choices: [{ message: { content: [{ type: 'image', image: 'http://images.example.test/result.png' }] } }] },
    }))],
    ['生成请求被拒绝', () => vi.fn<typeof fetch>().mockRejectedValue(new Error('upstream private message /Users/private/local-file.png'))],
  ])('%s时返回脱敏的 UPSTREAM_ERROR', async (_label, createFetch) => {
    await expectUpstreamErrorWithoutSensitiveDetails(
      createWanProvider(config, createFetch()).generate(input()),
    );
  });

  it.each([
    ['下载返回非 2xx', new Response('upstream private message', { status: 403 })],
    ['下载为空字节', new Response(Buffer.alloc(0))],
    ['下载为无效图片签名', new Response(Buffer.from('not an image'))],
  ])('%s时返回脱敏的 UPSTREAM_ERROR', async (_label, downloadResponse) => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(fetchResponse(upstreamSuccess))
      .mockResolvedValueOnce(downloadResponse);

    await expectUpstreamErrorWithoutSensitiveDetails(
      createWanProvider(config, fetchImpl).generate(input()),
    );
  });
});
