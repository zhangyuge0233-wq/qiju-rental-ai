import { describe, expect, it } from 'vitest';
import { generationErrorMessage } from '../../shared/generation';

describe('generationErrorMessage', () => {
  it('把未配置错误转换为中文提示', () => {
    expect(generationErrorMessage('AI_NOT_CONFIGURED'))
      .toBe('AI 服务尚未配置，请稍后再试');
  });
});
