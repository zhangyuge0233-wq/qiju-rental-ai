/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  GENERATION_LIMIT,
  getGenerationUsage,
  recordSuccessfulGeneration,
} from '../../src/lib/generation-limit';

describe('generation limit', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts with three free generations', () => {
    expect(getGenerationUsage()).toEqual({ used: 0, remaining: GENERATION_LIMIT });
  });

  it('records one successful generation and never exceeds the limit', () => {
    recordSuccessfulGeneration();
    recordSuccessfulGeneration();
    recordSuccessfulGeneration();
    recordSuccessfulGeneration();

    expect(getGenerationUsage()).toEqual({ used: 3, remaining: 0 });
  });

  it('recovers from malformed stored usage', () => {
    window.localStorage.setItem('qiju-generation-usage', '{bad json');

    expect(getGenerationUsage()).toEqual({ used: 0, remaining: GENERATION_LIMIT });
  });
});
