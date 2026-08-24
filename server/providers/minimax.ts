import type { ServerConfig } from '../config.js';
import { isValidGenerationInputImage } from '../input-image.js';
import {
  GenerationProviderError,
  type GeneratedImage,
  type GenerationInput,
  type GenerationProvider,
} from './generation-provider.js';

const requestTimeoutMs = 120_000;
const maxUpstreamResponseBytes = 4.25 * 1024 * 1024;
const maxGeneratedImageBytes = 3 * 1024 * 1024;

const buildPrompt = (input: GenerationInput) => [
  `生成一张${input.presetStyle ?? '温馨实用'}的年轻人出租屋室内设计效果图。`,
  '单一真实房间，固定正面广角机位，保持自然透视和真实比例。',
  '完整展示墙面、门窗、地面和吊顶，门窗位置不变，不改变空间边界。',
  '仅调整家具、软装、材质与灯光，生活化、温馨、可落地，不要豪宅感。',
].join('');

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const detectImageMimeType = (bytes: Buffer): string | undefined => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  return undefined;
};

const decodeImageBase64 = (value: unknown): Buffer => {
  if (typeof value !== 'string' || !value
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid MiniMax image Base64');
  }

  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxGeneratedImageBytes) {
    throw new Error('Empty MiniMax image');
  }

  return bytes;
};

const cancelResponseBody = async (body: { cancel: () => Promise<void> } | null) => {
  try {
    await body?.cancel();
  } catch {
    // Preserve the generic upstream error even if cancellation itself fails.
  }
};

const readUpstreamJson = async (response: Response): Promise<unknown> => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > maxUpstreamResponseBytes) {
    await cancelResponseBody(response.body);
    throw new Error('MiniMax response exceeds size limit');
  }

  if (!response.body) {
    throw new Error('Empty MiniMax response');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxUpstreamResponseBytes) {
        await cancelResponseBody(reader);
        throw new Error('MiniMax response exceeds size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'));
};

const readGeneratedImage = (payload: unknown): GeneratedImage => {
  if (!isRecord(payload)
    || !isRecord(payload.base_resp)
    || payload.base_resp.status_code !== 0
    || !isRecord(payload.data)
    || !Array.isArray(payload.data.image_base64)) {
    throw new Error('Invalid MiniMax response');
  }

  const bytes = decodeImageBase64(payload.data.image_base64[0]);
  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) {
    throw new Error('Invalid MiniMax image signature');
  }

  return { bytes, mimeType };
};

class MiniMaxProvider implements GenerationProvider {
  constructor(
    private readonly config: Pick<ServerConfig, 'minimaxApiKey' | 'minimaxApiUrl' | 'minimaxModel'>,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async generate(input: GenerationInput): Promise<GeneratedImage> {
    const hasReferenceImage = input.referenceImage !== undefined;
    const hasReferenceMimeType = input.referenceMimeType !== undefined;
    if (!isValidGenerationInputImage(input.roomImage, input.roomMimeType)
      || hasReferenceImage !== hasReferenceMimeType
      || (input.referenceImage
        && input.referenceMimeType
        && !isValidGenerationInputImage(input.referenceImage, input.referenceMimeType))) {
      throw new GenerationProviderError('INVALID_INPUT');
    }

    if (!this.config.minimaxApiKey) {
      throw new GenerationProviderError('AI_NOT_CONFIGURED');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await this.fetchImpl(this.config.minimaxApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.minimaxModel,
          prompt: buildPrompt(input),
          aspect_ratio: '3:4',
          response_format: 'base64',
          n: 1,
          prompt_optimizer: false,
          aigc_watermark: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('MiniMax generation failed');
      }

      return readGeneratedImage(await readUpstreamJson(response));
    } catch {
      throw new GenerationProviderError('UPSTREAM_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const createMiniMaxProvider = (
  config: Pick<ServerConfig, 'minimaxApiKey' | 'minimaxApiUrl' | 'minimaxModel'>,
  fetchImpl: typeof fetch = fetch,
): GenerationProvider => new MiniMaxProvider(config, fetchImpl);
