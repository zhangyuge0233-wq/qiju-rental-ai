export type Environment = Record<string, string | undefined>;

export interface ServerConfig {
  minimaxApiKey?: string;
  minimaxApiUrl: string;
  minimaxModel: string;
  port: number;
}

const defaultMiniMaxApiUrl = 'https://api.minimaxi.com/v1/image_generation';
const defaultMiniMaxModel = 'image-01';

const readOptionalValue = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue || undefined;
};

export const resolvePort = (environment: Environment): number => {
  const rawPort = environment.PORT ?? '';
  if (!/^\d+$/.test(rawPort)) {
    return 3000;
  }

  const configuredPort = Number(rawPort);

  return Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65_535
    ? configuredPort
    : 3000;
};

export const createServerConfig = (environment: Environment): ServerConfig => ({
  minimaxApiKey: readOptionalValue(environment.MINIMAX_API_KEY),
  minimaxApiUrl: readOptionalValue(environment.MINIMAX_API_URL) ?? defaultMiniMaxApiUrl,
  minimaxModel: readOptionalValue(environment.MINIMAX_MODEL) ?? defaultMiniMaxModel,
  port: resolvePort(environment),
});
