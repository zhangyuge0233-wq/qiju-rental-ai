import { describe, expect, it } from 'vitest';

import { createServerConfig, resolvePort } from '../../server/config.js';

describe('createServerConfig', () => {
  it('未提供 MiniMax 配置时使用空密钥和默认值', () => {
    expect(createServerConfig({})).toEqual({
      minimaxApiKey: undefined,
      minimaxApiUrl: 'https://api.minimaxi.com/v1/image_generation',
      minimaxModel: 'image-01',
      port: 3000,
    });
  });

  it('修剪 MINIMAX_API_KEY、MINIMAX_API_URL 与 MINIMAX_MODEL 覆盖值', () => {
    expect(createServerConfig({
      MINIMAX_API_KEY: '  configured-key  ',
      MINIMAX_API_URL: '  https://example.test/minimax  ',
      MINIMAX_MODEL: '  image-fixture  ',
    })).toEqual({
      minimaxApiKey: 'configured-key',
      minimaxApiUrl: 'https://example.test/minimax',
      minimaxModel: 'image-fixture',
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
