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

test('关键图标和圆形入口的实际触控热区至少为 44 像素', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open('qiju-rental-ai', 1);
      openRequest.onupgradeneeded = () => {
        const store = openRequest.result.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('history', 'readwrite');
      transaction.objectStore('history').put({
        id: 'touch-target-record',
        roomImage: new Blob(['room'], { type: 'image/jpeg' }),
        presetStyle: '奶油风',
        resultImage: new Blob(['result'], { type: 'image/webp' }),
        createdAt: Date.now(),
        inputSnapshot: { presetStyle: '奶油风', hasReferenceImage: false },
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  const expectTouchTarget = async (locator: import('@playwright/test').Locator) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  };

  await expectTouchTarget(page.locator('.room-picker').getByRole('button', { name: '选择图片' }));
  await expectTouchTarget(page.locator('.reference-picker').getByRole('button', { name: '选择图片' }));
  await expectTouchTarget(page.getByRole('button', { name: '查看历史记录' }));

  await page.setInputFiles('input[name="referenceImage"]', 'tests/fixtures/room.jpg');
  const removeReference = page.getByRole('button', { name: '移除参考图' });
  await expect(removeReference).toBeVisible();
  await expectTouchTarget(removeReference);
  await expectTouchTarget(page.locator('.reference-picker').getByRole('button', { name: '选择图片' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await removeReference.click();
  await expect(removeReference).toBeHidden();

  await page.getByRole('button', { name: '查看历史记录' }).click();
  await expectTouchTarget(page.getByRole('button', { name: '返回首页' }));
  await expectTouchTarget(page.getByRole('button', { name: '查看设计详情' }));

  await page.getByRole('button', { name: '查看设计详情' }).click();
  await expectTouchTarget(page.getByRole('button', { name: '返回历史列表' }));
  await expectTouchTarget(page.getByRole('button', { name: '删除这条记录' }));

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth);
});
