import { Router, type Request } from 'express';
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

const upload = multer({ storage: multer.memoryStorage() });

type UploadedFiles = Record<string, Express.Multer.File[]>;

const getUploadedFile = (request: Request, fieldName: string): Express.Multer.File | undefined => {
  const files = request.files as UploadedFiles | undefined;
  return files?.[fieldName]?.[0];
};

const getPresetStyle = (request: Request): string | undefined => {
  const presetStyle = request.body?.presetStyle;
  return typeof presetStyle === 'string' && presetStyle.trim() ? presetStyle.trim() : undefined;
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
    upload.fields([
      { name: 'roomImage', maxCount: 1 },
      { name: 'referenceImage', maxCount: 1 },
    ]),
    async (request, response) => {
      const roomImage = getUploadedFile(request, 'roomImage');
      const referenceImage = getUploadedFile(request, 'referenceImage');
      const presetStyle = getPresetStyle(request);

      if (!roomImage || (!presetStyle && !referenceImage)) {
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
        const payload: GenerateSuccess = {
          ok: true,
          imageMimeType: image.mimeType,
          imageBase64: image.bytes.toString('base64'),
        };

        response.json(payload);
      } catch (error) {
        if (error instanceof GenerationProviderError) {
          const status = error.code === 'MINIMAX_NOT_CONFIGURED' ? 503 : 502;
          response.status(status).json(failure(error.code));
          return;
        }

        response.status(500).json(failure('UNKNOWN_ERROR'));
      }
    },
  );

  return router;
};
