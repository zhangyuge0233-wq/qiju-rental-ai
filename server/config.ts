export type Environment = Record<string, string | undefined>;

export interface ServerConfig {
  minimaxApiKey?: string;
  minimaxApiUrl?: string;
  port: number;
}

const readOptionalValue = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue || undefined;
};

export const createServerConfig = (environment: Environment): ServerConfig => {
  const configuredPort = Number.parseInt(environment.PORT ?? '', 10);

  return {
    minimaxApiKey: readOptionalValue(environment.MINIMAX_API_KEY),
    minimaxApiUrl: readOptionalValue(environment.MINIMAX_API_URL),
    port: Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000,
  };
};
