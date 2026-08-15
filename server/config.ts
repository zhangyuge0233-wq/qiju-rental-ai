export type Environment = Record<string, string | undefined>;

export interface ServerConfig {
  dashscopeApiKey?: string;
  wanApiUrl: string;
  wanModel: string;
  port: number;
}

const defaultWanApiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const defaultWanModel = 'wan2.7-image-pro';

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
  dashscopeApiKey: readOptionalValue(environment.DASHSCOPE_API_KEY),
  wanApiUrl: readOptionalValue(environment.WAN_API_URL) ?? defaultWanApiUrl,
  wanModel: readOptionalValue(environment.WAN_MODEL) ?? defaultWanModel,
  port: resolvePort(environment),
});
