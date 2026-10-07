import { expect, test } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';

test('search and pagination preserve the canvas, camera and paused life', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let release: (() => void) | undefined;
  await page.route('**/api/market?**', async (r) => {
    const params = new URL(r.request().url()).searchParams;
    if (params.has('q')) await new Promise<void>((resolve) => (release = resolve));
    const data = demoMarket();
    data.repository = 'team/repo';
    data.nextCursor = params.has('cursor') ? null : 'next';
    if (params.has('q'))
      data.pullRequests = data.pullRequests.slice(params.has('cursor') ? 2 : 0, 4);
    await r.fulfill({ json: data });
  });
  await page.goto('/team/repo');
  const canvas = page.locator('.world canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((el) => el.setAttribute('data-original', 'true'));
  await page.getByRole('button', { name: 'Pause life', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/scene/scene.js';
    const { MarketWorld } = await import(/* @vite-ignore */ path);
    const render = MarketWorld.prototype.render;
    MarketWorld.prototype.render = function (...args: unknown[]) {
      document.documentElement.dataset.camera = JSON.stringify([
        this.angle,
        this.zoom,
        this.lookTarget.toArray(),
      ]);
      return render.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const camera = await page.evaluate(() => document.documentElement.dataset.camera);
  const search = page.getByLabel('Search pull requests', { exact: true });
  await search.fill('label:bug');
  await search.press('Enter');
  await expect(
    page.getByText('Loading results… Showing the previous results', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect.poll(() => !!release).toBe(true);
  release!();
  release = undefined;
  await expect(page.locator('.shop-row')).toHaveCount(4);
  await expect(canvas).toHaveAttribute('data-original', 'true');
  expect(await page.evaluate(() => document.documentElement.dataset.camera)).toBe(camera);
  await expect(page.getByRole('button', { name: 'Resume life', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next 60 →' }).click();
  await expect.poll(() => !!release).toBe(true);
  await expect(page.locator('.shop-row')).toHaveCount(4);
  release!();
  await expect(page.locator('.shop-row')).toHaveCount(2);
  await expect(canvas).toHaveAttribute('data-original', 'true');
  expect(await page.evaluate(() => document.documentElement.dataset.camera)).toBe(camera);
  await expect(page.getByRole('button', { name: 'Resume life', exact: true })).toBeVisible();
});

test('long descriptions have a bounded panel and pinned GitHub action; images load on request', async ({
  page,
}, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true } }),
  );
  const data = demoMarket();
  data.repository = 'team/repo';
  const pr = data.pullRequests[0];
  pr.title =
    'A detailed pull request title explaining several important changes to repository workflows and their effect on every contributor '.repeat(
      2,
    );
  pr.url = 'https://github.com/team/repo/pull/1';
  pr.body =
    '![Screenshot](https://image.example.test/private.png)\n\n' +
    'Description paragraph with useful review context.\n\n'.repeat(80);
  pr.bodyTruncated = true;
  let imageRequests = 0;
  await page.route('https://image.example.test/**', (r) => {
    imageRequests++;
    return r.fulfill({ status: 403, body: '' });
  });
  await page.route('**/api/market?**', (r) => r.fulfill({ json: data }));
  await page.goto('/team/repo');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  // Open without scrolling the scene out of view, as clicking a 3D shop does.
  const browse = await page.getByRole('link', { name: 'Browse 24 shops below' }).boundingBox();
  const initialFooter = await page.locator('.market-footer').boundingBox();
  expect(browse!.y + browse!.height).toBeLessThanOrEqual(initialFooter!.y);
  await page
    .locator('.shop-row')
    .first()
    .evaluate((el: HTMLElement) => el.click());
  const panel = page.getByRole('complementary', { name: 'Pull request details' });
  const action = panel.getByRole('link', { name: 'Review on GitHub' });
  await expect(action).toBeInViewport();
  const bounds = await panel.boundingBox();
  const footer = await page.locator('.market-footer').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y);
  expect(await panel.locator('.detail-scroll').evaluate((el) => el.clientHeight)).toBeGreaterThan(
    140,
  );
  await panel.getByRole('button', { name: 'Show full title' }).click();
  await expect(panel.getByRole('heading', { name: pr.title.trim(), exact: true })).toHaveClass(
    'expanded-title',
  );
  await expect(action).toBeInViewport();
  expect(imageRequests).toBe(0);
  await panel.getByRole('button', { name: 'Load image: Screenshot' }).click();
  await expect.poll(() => imageRequests).toBe(1);
  await expect(
    panel.getByText('This image could not load. It may require GitHub sign-in.'),
  ).toBeVisible();
  await panel.locator('.detail-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(
    panel.getByRole('link', { name: 'Read the full description on GitHub' }),
  ).toBeInViewport();
  await expect(action).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ordinary wheel scrolls the page and modified wheel zooms the camera', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Mouse wheel behavior.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.world canvas')).toBeVisible();
  await page.mouse.move(800, 500);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(800, 500);
  const before = await page.locator('.shop-sign:not([hidden])').first().getAttribute('style');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -150);
  await page.keyboard.up('Control');
  await expect
    .poll(() => page.locator('.shop-sign:not([hidden])').first().getAttribute('style'))
    .not.toBe(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('link', { name: 'Browse 24 shops below' }).click();
  await expect(page.locator('#shop-list')).toBeInViewport();
});

test('WebGL restoration clears the overlay while preserving the paused preference', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'WebGL lifecycle is viewport independent.');
  await page.goto('/');
  const canvas = page.locator('.world canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Pause life', exact: true }).click();
  await canvas.evaluate((el: HTMLCanvasElement) => {
    const context = el.getContext('webgl2')!;
    const extension = context.getExtension('WEBGL_lose_context')!;
    (window as unknown as { restoreContext: () => void }).restoreContext = () =>
      extension.restoreContext();
    extension.loseContext();
  });
  await expect(page.locator('.canvas-error')).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreContext: () => void }).restoreContext());
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume life', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(page.locator('.shop-sign:not([hidden])').first()).toBeVisible();
});

test('vertical touch swipes over the market scroll to the list', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Native touch scrolling.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.world canvas')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const x = 350;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 650 }] });
  for (let y = 630; y >= 350; y -= 35) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await cdp.detach();
});

test('reserved repository paths render the marketplace without starting OAuth', async ({
  page,
}) => {
  await page.route('**/api/session', (r) => r.fulfill({ json: { login: null, configured: true } }));
  await page.goto('/?repo=auth/login');
  await expect(page).toHaveURL(/\/r\/auth\/login$/);
  await expect(
    page.getByRole('heading', { name: 'Bring your repository to the market.' }),
  ).toBeVisible();
  await expect(
    page.locator('.empty-state').getByRole('link', { name: 'Sign in with GitHub' }),
  ).toHaveAttribute('href', '/auth/login?returnTo=%2Fr%2Fauth%2Flogin');
  await expect(page.getByRole('link', { name: 'auth/login', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/auth/login',
  );
});
