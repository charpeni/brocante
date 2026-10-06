import { expect, test } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';

test('one server-rendered loader stays aligned through hydration, session check and market fetch', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let releaseScripts!: () => void;
  let releaseSession!: () => void;
  let releaseMarket!: () => void;
  const scripts = new Promise<void>((resolve) => (releaseScripts = resolve));
  const session = new Promise<void>((resolve) => (releaseSession = resolve));
  const market = new Promise<void>((resolve) => (releaseMarket = resolve));
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') await scripts;
    await route.continue();
  });
  let sessionStarted = false;
  let marketStarted = false;
  await page.route('**/api/session', async (route) => {
    sessionStarted = true;
    await session;
    await route.fulfill({ json: { login: 'mina', configured: true, installUrl: null } });
  });
  await page.route('**/api/market?**', async (route) => {
    marketStarted = true;
    await market;
    await route.fulfill({ json: { ...demoMarket(), repository: 'team/repo' } });
  });
  try {
    await page.goto('/team/repo?q=label%3Abug', { waitUntil: 'commit' });
    const loader = page.locator('.market-loading');
    await expect(loader).toBeVisible();
    await expect(page.locator('.boot')).toHaveCount(0);
    await expect(page.getByLabel('Search pull requests', { exact: true })).toHaveValue('label:bug');
    await page.evaluate(() => document.fonts.ready);
    const location = () =>
      page.evaluate(() => {
        const icon = document.querySelector('.loading-mark')!.getBoundingClientRect();
        const text = document.querySelector('.market-loading p')!.getBoundingClientRect();
        return { x: icon.x + icon.width / 2, y: (icon.top + text.bottom) / 2 };
      });
    const before = await location();
    await loader.evaluate((element) => {
      (window as unknown as { initialLoader: Element }).initialLoader = element;
    });
    expect(sessionStarted).toBe(false);
    releaseScripts();
    await expect.poll(() => sessionStarted).toBe(true);
    await expect(loader).toBeVisible();
    const afterHydration = await location();
    expect(Math.abs(afterHydration.x - before.x)).toBeLessThan(2);
    expect(Math.abs(afterHydration.y - before.y)).toBeLessThan(2);
    releaseSession();
    await expect.poll(() => marketStarted).toBe(true);
    const afterSession = await location();
    expect(Math.abs(afterSession.x - before.x)).toBeLessThan(2);
    expect(Math.abs(afterSession.y - before.y)).toBeLessThan(2);
    expect(
      await loader.evaluate(
        (element) => element === (window as unknown as { initialLoader: Element }).initialLoader,
      ),
    ).toBe(true);
    releaseMarket();
    await expect(page.locator('.shop-row')).toHaveCount(24);
    await expect(loader).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    releaseScripts();
    releaseSession();
    releaseMarket();
  }
});
