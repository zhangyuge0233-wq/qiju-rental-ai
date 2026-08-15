import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('未配置 MiniMax 时保留输入并展示真实错误', async ({ page }) => {
  // Removing the real API connection or clearing form state after a 503 must fail this flow.
  await page.goto('/');
  await page.setInputFiles('input[name="roomImage"]', 'tests/fixtures/room.jpg');
  await page.getByRole('button', { name: '奶油风' }).click();
  const generationResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/generate'
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '生成我的房间' }).click();

  expect((await generationResponse).status()).toBe(503);
  await expect(page.getByText('AI 服务尚未配置，请稍后再试')).toBeVisible();
  await expect(page.locator('img[alt="已上传的房间照片"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '奶油风' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '生成我的房间' })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))).toEqual({ scrollWidth: 390, viewportWidth: 390 });
});

test('首页可查看空历史并返回', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看历史记录' }).click();

  await expect(page.getByText('还没有设计记录')).toBeVisible();
  await page.getByRole('button', { name: '返回首页开始设计' }).click();
  await expect(page.getByRole('heading', { name: '让房间更像你' })).toBeVisible();
});

test('430 宽度下首页无横向溢出且核心区域可见', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');

  await expect(page.getByText('一张照片，看看你的出租屋还能有多好看。')).toBeVisible();
  const roomCard = page.locator('.room-picker');
  const uploadButton = roomCard.getByRole('button', { name: '选择图片' });
  await expect(roomCard).toBeVisible();
  await expect(uploadButton).toBeVisible();

  const layout = await page.evaluate(() => {
    const card = document.querySelector('.room-picker')?.getBoundingClientRect();
    const button = document.querySelector('.room-picker button')?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      cardRight: card?.right,
      buttonCenter: button ? button.left + button.width / 2 : undefined,
      cardCenter: card ? card.left + card.width / 2 : undefined,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.cardRight).toBeLessThanOrEqual(430);
  expect(layout.buttonCenter).toBeGreaterThan(layout.cardCenter ?? 0);
});
