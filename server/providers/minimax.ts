import {
  GenerationProviderError,
  type GeneratedImage,
  type GenerationInput,
  type GenerationProvider,
} from './generation-provider.js';

export class MiniMaxUnavailableProvider implements GenerationProvider {
  async generate(_input: GenerationInput): Promise<GeneratedImage> {
    throw new GenerationProviderError('MINIMAX_NOT_CONFIGURED');
  }
}

export const createMiniMaxProvider = (): GenerationProvider => new MiniMaxUnavailableProvider();
