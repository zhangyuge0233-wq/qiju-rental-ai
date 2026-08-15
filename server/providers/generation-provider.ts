import {
  type GenerationErrorCode,
  generationErrorMessage,
} from '../../shared/generation.js';

export const PRESERVE_STRUCTURE_CONSTRAINT =
  '保留墙面、门窗、地板、吊顶等硬装结构，仅调整家具和软装' as const;

export interface GenerationInput {
  roomImage: Buffer;
  roomMimeType: string;
  referenceImage?: Buffer;
  referenceMimeType?: string;
  presetStyle?: string;
  constraint: typeof PRESERVE_STRUCTURE_CONSTRAINT;
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

export interface GenerationProvider {
  generate(input: GenerationInput): Promise<GeneratedImage>;
}

export class GenerationProviderError extends Error {
  constructor(public readonly code: GenerationErrorCode) {
    super(generationErrorMessage(code));
    this.name = 'GenerationProviderError';
  }
}
