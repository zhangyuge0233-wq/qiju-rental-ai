import { describe, expect, it } from 'vitest';

import { resolvePort } from '../../server/config.js';

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
