import type { ServerConfig } from '../config.js';
import { isValidWanInputImage } from '../input-image.js';
import {
  GenerationProviderError,
  type GeneratedImage,
  type GenerationInput,
  type GenerationProvider,
} from './generation-provider.js';

const toDataUrl = (bytes: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${bytes.toString('base64')}`;

const oneImagePrompt = (input: GenerationInput) => (
  `以房间图为基础生成${input.presetStyle ?? '合适的室内设计'}效果图。`
  + '保留墙体、门窗、地板、吊顶、透视和相机机位，仅调整家具、软装和灯光。'
);

const twoImagePrompt = (input: GenerationInput) => (
  `第一张是参考图，第二张是房间图。设计方向采用${input.presetStyle ?? '参考图的设计风格'}，`
  + '参考图在色彩、材质和氛围上优先；房间图用于保留空间结构。'
  + '保留墙体、门窗、地板、吊顶、透视和相机机位，仅调整家具、软装和灯光。'
);

const requestTimeoutMs = 120_000;
const maximumDownloadBytes = 25 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isTrustedResultUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.port === '' || url.port === '443')
      && (url.hostname === 'aliyuncs.com' || url.hostname.endsWith('.aliyuncs.com'));
  } catch {
    return false;
  }
};

const readImageUrl = (payload: unknown): string => {
  if (!isRecord(payload) || 'code' in payload || !isRecord(payload.output) || !Array.isArray(payload.output.choices)) {
    throw new Error('Invalid Wan response');
  }

  for (const choice of payload.output.choices) {
    if (!isRecord(choice) || !isRecord(choice.message) || !Array.isArray(choice.message.content)) {
      continue;
    }

    for (const item of choice.message.content) {
      if (isRecord(item) && item.type === 'image' && isTrustedResultUrl(item.image)) {
        return item.image;
      }
    }
  }

  throw new Error('Missing Wan image URL');
};

const readBoundedBody = async (
  response: Response,
  controller: AbortController,
): Promise<Buffer> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    if (!/^\d+$/.test(normalizedLength)
      || !Number.isSafeInteger(Number(normalizedLength))
      || Number(normalizedLength) > maximumDownloadBytes) {
      controller.abort();
      throw new Error('Wan image exceeds download limit');
    }
  }

  if (!response.body) {
    throw new Error('Wan image has no response body');
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
      if (!value?.byteLength) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maximumDownloadBytes) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        throw new Error('Wan image exceeds download limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
};

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

class WanProvider implements GenerationProvider {
  constructor(
    private readonly config: Pick<ServerConfig, 'dashscopeApiKey' | 'wanApiUrl' | 'wanModel'>,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async generate(input: GenerationInput): Promise<GeneratedImage> {
    const hasReferenceImage = input.referenceImage !== undefined;
    const hasReferenceMimeType = input.referenceMimeType !== undefined;
    if (!isValidWanInputImage(input.roomImage, input.roomMimeType)
      || hasReferenceImage !== hasReferenceMimeType
      || (input.referenceImage
        && input.referenceMimeType
        && !isValidWanInputImage(input.referenceImage, input.referenceMimeType))) {
      throw new GenerationProviderError('INVALID_INPUT');
    }

    if (!this.config.dashscopeApiKey) {
      throw new GenerationProviderError('AI_NOT_CONFIGURED');
    }

    const roomDataUrl = toDataUrl(input.roomImage, input.roomMimeType);
    const referenceDataUrl = input.referenceImage && input.referenceMimeType
      ? toDataUrl(input.referenceImage, input.referenceMimeType)
      : undefined;
    const content = referenceDataUrl
      ? [{ image: referenceDataUrl }, { image: roomDataUrl }, { text: twoImagePrompt(input) }]
      : [{ image: roomDataUrl }, { text: oneImagePrompt(input) }];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const generationResponse = await this.fetchImpl(this.config.wanApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.dashscopeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.wanModel,
          input: { messages: [{ role: 'user', content }] },
          parameters: { size: '2K', n: 1, watermark: false },
        }),
        signal: controller.signal,
      });

      if (!generationResponse.ok) {
        throw new Error('Wan generation failed');
      }

      const imageUrl = readImageUrl(await generationResponse.json());
      const downloadResponse = await this.fetchImpl(imageUrl, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!downloadResponse.ok) {
        throw new Error('Wan image download failed');
      }

      const bytes = await readBoundedBody(downloadResponse, controller);
      const mimeType = detectImageMimeType(bytes);
      if (!bytes.length || !mimeType) {
        throw new Error('Wan image has an invalid signature');
      }

      return { bytes, mimeType };
    } catch {
      throw new GenerationProviderError('UPSTREAM_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const createWanProvider = (
  config: Pick<ServerConfig, 'dashscopeApiKey' | 'wanApiUrl' | 'wanModel'>,
  fetchImpl: typeof fetch = fetch,
): GenerationProvider => new WanProvider(config, fetchImpl);
