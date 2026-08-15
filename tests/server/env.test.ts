import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadProjectEnvironment, projectEnvironmentPath } from '../../server/env';

const fixturePath = fileURLToPath(new URL('../fixtures/server.env', import.meta.url));

describe('project .env loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads PORT and MiniMax settings from the selected project env file without logging values', () => {
    // Removing the loader would leave the explicitly passed environment empty.
    const environment: Record<string, string | undefined> = {};
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    loadProjectEnvironment(environment, fixturePath);

    expect(environment).toEqual({
      PORT: '4312',
      MINIMAX_API_KEY: 'fixture-key',
      MINIMAX_API_URL: 'https://example.test/minimax',
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('uses the working project root as the default .env location', () => {
    expect(projectEnvironmentPath).toBe(resolve(process.cwd(), '.env'));
  });
});
