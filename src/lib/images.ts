export type ImageValidation =
  | { ok: true }
  | { ok: false; message: string };

export interface ImageCompressionOptions {
  maxDimension?: number;
  maxBytes?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export type AcceptedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const ACCEPTED_IMAGE_TYPES = new Set<AcceptedImageMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_UPLOAD_IMAGE_SIZE = 1.5 * 1024 * 1024;
const IMAGE_PROCESSING_ERROR_MESSAGE = '图片无法解析，请更换后重试';

export class ImageProcessingError extends Error {
  constructor(message = IMAGE_PROCESSING_ERROR_MESSAGE) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

export function isAcceptedImageMimeType(value: string): value is AcceptedImageMimeType {
  return ACCEPTED_IMAGE_TYPES.has(value as AcceptedImageMimeType);
}

export function imageFileExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return extensions[mimeType] ?? 'img';
}

export function validateImage(file: File): ImageValidation {
  if (!isAcceptedImageMimeType(file.type)) {
    return { ok: false, message: '仅支持 JPG、PNG 或 WebP 图片' };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return { ok: false, message: '图片大小不能超过 15 MB' };
  }

  return { ok: true };
}

export async function verifyImageBlob(blob: Blob): Promise<void> {
  if (!blob.size || !isAcceptedImageMimeType(blob.type)) {
    throw new ImageProcessingError();
  }

  let decodedImage: DecodedImage | undefined;

  try {
    decodedImage = await decodeImage(blob);
    if (decodedImage.width <= 0 || decodedImage.height <= 0) {
      throw new ImageProcessingError();
    }
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error;
    }

    throw new ImageProcessingError();
  } finally {
    decodedImage?.dispose();
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  if (typeof Image === 'undefined') {
    throw new ImageProcessingError();
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ImageProcessingError());
      image.src = objectUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => {
        image.src = '';
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    image.src = '';
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new ImageProcessingError());
      },
      mimeType,
      quality,
    );
  });
}

export async function compressImage(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? 1600;
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_IMAGE_SIZE;
  const quality = options.quality ?? 0.82;
  const mimeType = options.mimeType ?? 'image/webp';
  let decodedImage: DecodedImage | undefined;
  let canvas: HTMLCanvasElement | undefined;

  try {
    decodedImage = await decodeImage(file);
    const scale = Math.min(1, maxDimension / Math.max(decodedImage.width, decodedImage.height));
    const width = Math.max(1, Math.round(decodedImage.width * scale));
    const height = Math.max(1, Math.round(decodedImage.height * scale));
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new ImageProcessingError();
    }

    context.drawImage(decodedImage.source, 0, 0, width, height);
    const qualitySteps = mimeType === 'image/jpeg' || mimeType === 'image/webp'
      ? [quality, 0.68, 0.54, 0.4]
      : [undefined];

    for (const currentQuality of qualitySteps) {
      const compressed = await canvasBlob(canvas, mimeType, currentQuality);
      if (compressed.size <= maxBytes) {
        return compressed;
      }
    }

    throw new ImageProcessingError('图片压缩后仍过大，请选择较小图片');
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error;
    }

    throw new ImageProcessingError();
  } finally {
    decodedImage?.dispose();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
