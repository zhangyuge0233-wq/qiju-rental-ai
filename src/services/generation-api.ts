import {
  generationErrorMessage,
  type GenerationErrorCode,
  type GenerateFailure,
  type GenerateSuccess,
} from '../../shared/generation';

export interface GenerateRoomInput {
  roomImage: Blob;
  referenceImage?: Blob;
  presetStyle?: string;
}

export class GenerationApiError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    message = generationErrorMessage(code),
  ) {
    super(message);
    this.name = 'GenerationApiError';
  }
}

const generationErrorCodes = new Set<GenerationErrorCode>([
  'MINIMAX_NOT_CONFIGURED',
  'INVALID_INPUT',
  'UPSTREAM_ERROR',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
]);

function isGenerationFailure(payload: unknown): payload is GenerateFailure {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const { ok, code, message } = payload as Partial<GenerateFailure>;
  return ok === false && typeof code === 'string' && generationErrorCodes.has(code as GenerationErrorCode)
    && typeof message === 'string';
}

function isGenerationSuccess(payload: unknown): payload is GenerateSuccess {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const { ok, imageMimeType, imageBase64 } = payload as Partial<GenerateSuccess>;
  return ok === true && typeof imageMimeType === 'string' && typeof imageBase64 === 'string';
}

async function readFailure(response: Response): Promise<GenerationApiError> {
  try {
    const payload: unknown = await response.json();
    if (isGenerationFailure(payload)) {
      return new GenerationApiError(payload.code, payload.message);
    }
  } catch {
    // The fallback below keeps malformed service errors within the shared error contract.
  }

  return new GenerationApiError('UNKNOWN_ERROR');
}

function base64ToBlob(imageBase64: string, imageMimeType: string): Blob {
  const bytes = atob(imageBase64);
  const data = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    data[index] = bytes.charCodeAt(index);
  }

  return new Blob([data], { type: imageMimeType });
}

export async function generateRoom(
  input: GenerateRoomInput,
  signal?: AbortSignal,
): Promise<Blob> {
  const formData = new FormData();
  formData.append('roomImage', input.roomImage);
  if (input.referenceImage) {
    formData.append('referenceImage', input.referenceImage);
  }
  if (input.presetStyle) {
    formData.append('presetStyle', input.presetStyle);
  }

  let response: Response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      body: formData,
      signal,
    });
  } catch {
    throw new GenerationApiError('NETWORK_ERROR');
  }

  if (!response.ok) {
    throw await readFailure(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GenerationApiError('UNKNOWN_ERROR');
  }

  if (!isGenerationSuccess(payload)) {
    throw new GenerationApiError('UNKNOWN_ERROR');
  }

  try {
    return base64ToBlob(payload.imageBase64, payload.imageMimeType);
  } catch {
    throw new GenerationApiError('UNKNOWN_ERROR');
  }
}
