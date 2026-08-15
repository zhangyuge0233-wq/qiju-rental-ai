import { describe, expect, it } from 'vitest';

import { createServerConfig, resolvePort } from '../../server/config.js';

describe('createServerConfig', () => {
  it('未提供 WAN 配置时使用空密钥和北京地域的默认值', () => {
    expect(createServerConfig({})).toEqual({
      dashscopeApiKey: undefined,
      wanApiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      wanModel: 'wan2.7-image-pro',
      port: 3000,
    });
  });

  it('修剪 DASHSCOPE_API_KEY、WAN_API_URL 与 WAN_MODEL 覆盖值', () => {
    expect(createServerConfig({
      DASHSCOPE_API_KEY: '  configured-key  ',
      WAN_API_URL: '  https://example.test/wan  ',
      WAN_MODEL: '  custom-wan-model  ',
    })).toEqual({
      dashscopeApiKey: 'configured-key',
      wanApiUrl: 'https://example.test/wan',
      wanModel: 'custom-wan-model',
      port: 3000,
    });
  });

  it('忽略遗留的 MiniMax 配置变量', () => {
    expect(createServerConfig({
      MINIMAX_API_KEY: 'legacy-key',
      MINIMAX_API_URL: 'https://legacy.example.test',
    })).toEqual({
      dashscopeApiKey: undefined,
      wanApiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      wanModel: 'wan2.7-image-pro',
      port: 3000,
    });
  });
});

describe('resolvePort', () => {
  it.each([
    ['最小端口', '1', 1],
    ['常用端口', '4312', 4312],
    ['最大端口', '65535', 65535],
  ])('接受%s %s', (_label, configuredPort, expected) => {
    expect(resolvePort({ PORT: configuredPort })).toBe(expected);
  });

  it.each([
    ['尾随字符', '4312abc'],
    ['零', '0'],
    ['负数', '-1'],
    ['超上限', '65536'],
    ['小数', '4312.5'],
    ['十六进制', '0x10'],
    ['首尾空格', ' 4312 '],
    ['空值', ''],
  ])('%s不是完整合法端口时回退 3000', (_label, configuredPort) => {
    expect(resolvePort({ PORT: configuredPort })).toBe(3000);
  });
});
