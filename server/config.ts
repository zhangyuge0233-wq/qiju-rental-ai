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
  minimaxApiUrl: readOptionalValue(environment.MINIMAX_API_URL),
  port: resolvePort(environment),
});
