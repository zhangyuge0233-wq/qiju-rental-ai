import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import {
  type GenerateFailure,
  type GenerateSuccess,
  generationErrorMessage,
} from '../../shared/generation.js';
import {
  GenerationProviderError,
  PRESERVE_STRUCTURE_CONSTRAINT,
  type GenerationProvider,
} from '../providers/generation-provider.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 2,
    fields: 1,
    parts: 3,
    fieldNameSize: 50,
    fieldSize: 32,
  },
});

const presetStyles = new Set([
  '奶油风',
  '原木风',
  '北欧风',
  '复古风',
  '极简风',
  '多巴胺风',
]);
const generatedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

class InvalidGenerationInputError extends Error {
  constructor() {
    super('Invalid generation input');
    this.name = 'InvalidGenerationInputError';
  }
}

type UploadedFiles = Record<string, Express.Multer.File[]>;

const getUploadedFile = (request: Request, fieldName: string): Express.Multer.File | undefined => {
  const files = request.files as UploadedFiles | undefined;
  return files?.[fieldName]?.[0];
};

const getPresetStyle = (request: Request): string | undefined => {
  const presetStyle = request.body?.presetStyle;
  return typeof presetStyle === 'string' && presetStyle.trim() ? presetStyle.trim() : undefined;
};

const hasOnlyExpectedTextFields = (request: Request): boolean => {
  const body = request.body as Record<string, unknown> | undefined;
  return !body || Object.keys(body).every((fieldName) => fieldName === 'presetStyle');
};

const hasPrefix = (buffer: Buffer, prefix: readonly number[]): boolean => (
  buffer.length >= prefix.length && prefix.every((byte, index) => buffer[index] === byte)
);

const hasExpectedImageSignature = (file: Express.Multer.File): boolean => {
  if (file.mimetype === 'image/jpeg') {
    return hasPrefix(file.buffer, [0xff, 0xd8, 0xff]);
  }

  if (file.mimetype === 'image/png') {
    return hasPrefix(file.buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (file.mimetype === 'image/webp') {
    return file.buffer.length >= 12
      && file.buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && file.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
};

const failure = (code: GenerateFailure['code']): GenerateFailure => ({
  ok: false,
  code,
  message: generationErrorMessage(code),
});

export const createGenerateRouter = (provider: GenerationProvider): Router => {
  const router = Router();

  router.post(
    '/',
    (request, response, next) => {
      upload.fields([
        { name: 'roomImage', maxCount: 1 },
        { name: 'referenceImage', maxCount: 1 },
      ])(request, response, (error) => {
        next(error ? new InvalidGenerationInputError() : undefined);
      });
    },
    async (request, response, next) => {
      const roomImage = getUploadedFile(request, 'roomImage');
      const referenceImage = getUploadedFile(request, 'referenceImage');
      const presetStyle = getPresetStyle(request);

      const validInput = hasOnlyExpectedTextFields(request)
        && Boolean(roomImage)
        && (!presetStyle || presetStyles.has(presetStyle))
        && Boolean(presetStyle || referenceImage)
        && Boolean(roomImage && hasExpectedImageSignature(roomImage))
        && Boolean(!referenceImage || hasExpectedImageSignature(referenceImage));

      if (!validInput || !roomImage) {
        response.status(400).json(failure('INVALID_INPUT'));
        return;
      }

      try {
        const image = await provider.generate({
          roomImage: roomImage.buffer,
          roomMimeType: roomImage.mimetype,
          referenceImage: referenceImage?.buffer,
          referenceMimeType: referenceImage?.mimetype,
          presetStyle,
          constraint: PRESERVE_STRUCTURE_CONSTRAINT,
        });

        if (!image.bytes.length || !generatedImageMimeTypes.has(image.mimeType)) {
          throw new GenerationProviderError('UPSTREAM_ERROR');
        }

        const payload: GenerateSuccess = {
          ok: true,
          imageMimeType: image.mimeType,
          imageBase64: image.bytes.toString('base64'),
        };

        response.json(payload);
      } catch (error) {
        next(error);
      }
    },
  );

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof InvalidGenerationInputError || error instanceof multer.MulterError) {
      response.status(400).json(failure('INVALID_INPUT'));
      return;
    }

    if (error instanceof GenerationProviderError) {
      const status = error.code === 'AI_NOT_CONFIGURED' ? 503 : 502;
      response.status(status).json(failure(error.code));
      return;
    }

    response.status(500).json(failure('UNKNOWN_ERROR'));
  });

  return router;
};
