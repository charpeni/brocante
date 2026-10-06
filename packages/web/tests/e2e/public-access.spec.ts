import { expect, test } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';

test('anonymous public browsing supports search and pauses refreshes until the shared quota resets', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: { configured: true, publicAccess: true, login: null, installUrl: null },
    }),
  );
  let requests = 0;
  let limited = false;
  let lastSearch: string | null = null;
  await page.route('**/api/market?*', (route) => {
    requests++;
    lastSearch = new URL(route.request().url()).searchParams.get('q');
    return limited
      ? route.fulfill({
          status: 429,
          headers: { 'Retry-After': '180' },
          json: { error: 'The shared public GitHub allowance has reached its limit.' },
        })
      : route.fulfill({ json: { ...demoMarket(), repository: 'withastro/astro' } });
  });
  await page.goto('/withastro/astro');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.getByText('Bring your repository to the market.')).not.toBeVisible();
  await page.getByRole('searchbox').fill('label:bug');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => lastSearch).toBe('label:bug');
  const canvas = await page.locator('.world canvas').elementHandle();
  limited = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByText('The shared public GitHub allowance has reached its limit.'),
  ).toBeVisible();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  const before = requests;
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await page.clock.fastForward(120_000);
  expect(requests).toBe(before);
  limited = false;
  await page.clock.fastForward(61_000);
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(await canvas!.evaluate((node) => node === document.querySelector('.world canvas'))).toBe(
    true,
  );
});

test('public access works without OAuth configuration and private access errors offer sign-in', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: { configured: false, publicAccess: true, login: null, installUrl: null },
    }),
  );
  await page.route('**/api/market?*', (route) =>
    route.fulfill({ json: { ...demoMarket(), repository: 'withastro/astro' } }),
  );
  await page.goto('/withastro/astro');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.getByText('Public browsing', { exact: true })).toBeVisible();
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: { configured: true, publicAccess: true, login: null, installUrl: null },
    }),
  );
  await page.route('**/api/market?*', (route) =>
    route.fulfill({
      status: 403,
      json: { error: 'This repository is unavailable through public access.' },
    }),
  );
  await page.reload();
  await expect(page.locator('.shop-row')).toHaveCount(0);
  await expect(
    page.locator('.market-status').getByRole('link', { name: 'Sign in with GitHub' }),
  ).toBeVisible();
});
