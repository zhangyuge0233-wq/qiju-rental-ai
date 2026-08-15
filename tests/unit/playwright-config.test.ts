import { afterEach, describe, expect, it, vi } from 'vitest';

const channelBeforeTest = process.env.PLAYWRIGHT_CHANNEL;

afterEach(() => {
  if (channelBeforeTest === undefined) {
    delete process.env.PLAYWRIGHT_CHANNEL;
  } else {
    process.env.PLAYWRIGHT_CHANNEL = channelBeforeTest;
  }
  vi.resetModules();
});

describe('Playwright E2E configuration', () => {
  it('defaults to Playwright Chromium and waits for the Vite-proxied API health endpoint', async () => {
    // Adding a default Chrome channel or only checking the Vite root would hide missing API readiness.
    delete process.env.PLAYWRIGHT_CHANNEL;
    vi.resetModules();
    const config = (await import('../../playwright.config')).default;

    expect(config.use).toMatchObject({
      baseURL: 'http://127.0.0.1:5173',
      headless: true,
    });
    expect(config.use).not.toHaveProperty('channel');
    expect(config.webServer).toMatchObject({
      url: 'http://127.0.0.1:5173/api/health',
      timeout: 20_000,
    });
  });

  it('only uses a browser channel when the caller explicitly requests one', async () => {
    process.env.PLAYWRIGHT_CHANNEL = 'chrome';
    vi.resetModules();
    const config = (await import('../../playwright.config')).default;

    expect(config.use).toMatchObject({ channel: 'chrome' });
  });
});
