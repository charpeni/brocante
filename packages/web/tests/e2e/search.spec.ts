import { expect, test } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';

test('cats share the scene pause and reduced-motion controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.world canvas')).toBeVisible();
  await page.evaluate(async () => {
    const moduleUrl = performance
      .getEntriesByType('resource')
      .find((entry) => new URL(entry.name).pathname.endsWith('/scene/cats.js'))!.name;
    const { MarketCats } = await import(/* @vite-ignore */ moduleUrl);
    const update = MarketCats.prototype.update;
    MarketCats.prototype.update = function (time: number) {
      update.call(this, time);
      document.documentElement.dataset.catFrame = JSON.stringify({
        time,
        positions: this.animals.map((cat: { object: { position: { toArray(): number[] } } }) =>
          cat.object.position.toArray(),
        ),
      });
    };
  });
  const frame = () => page.evaluate(() => document.documentElement.dataset.catFrame);
  await expect.poll(frame).toBeTruthy();
  expect(JSON.parse((await frame())!).positions).toHaveLength(2);
  await page.getByRole('button', { name: 'Pause life', exact: true }).click();
  const paused = await frame();
  await page.waitForTimeout(200);
  expect(await frame()).toBe(paused);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Resume life', exact: true }).click();
  await page.waitForTimeout(200);
  expect(await frame()).toBe(paused);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(frame).not.toBe(paused);
});

test('selecting and closing shops preserves the user zoom', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.shop-sign:not([hidden])').first()).toBeVisible();
  // Observe the real world's camera while exercising the public controls.
  await page.evaluate(async () => {
    const moduleUrl = performance
      .getEntriesByType('resource')
      .find((entry) => new URL(entry.name).pathname.endsWith('/scene/scene.js'))!.name;
    const { MarketWorld } = await import(/* @vite-ignore */ moduleUrl);
    const focus = MarketWorld.prototype.focus;
    const home = MarketWorld.prototype.home;
    MarketWorld.prototype.focus = function (...args: unknown[]) {
      const before = this.zoom;
      focus.apply(this, args);
      document.documentElement.dataset.selectionZoom = JSON.stringify([before, this.zoom]);
    };
    MarketWorld.prototype.home = function (...args: unknown[]) {
      document.documentElement.dataset.cameraWasReset = 'true';
      home.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.locator('.shop-sign:not([hidden])').first().click();
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toBeVisible();
  const zoom = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.selectionZoom!),
  );
  expect(zoom[0]).toBeGreaterThan(1);
  expect(zoom[1]).toBe(zoom[0]);
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() => document.documentElement.dataset.cameraWasReset),
  ).toBeUndefined();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.cameraWasReset)).toBe('true');
});

test('market loading uses an animated shop and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let finishRequest!: () => void;
  const loading = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  await page.route('**/api/market?**', async (route) => {
    await loading;
    await route.fulfill({ json: demoMarket() });
  });
  await page.goto('/team/repo');
  const icon = page.locator('svg.loading-mark');
  await expect(icon).toBeVisible();
  expect(
    await icon.locator('.loading-awning').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('pitch-awning');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await icon.locator('.loading-awning').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  finishRequest();
  await expect(icon).toHaveCount(0);
  await expect(page.locator('.shop-row')).toHaveCount(24);
});

test('pretty repository routes search GitHub, paginate results, and support back and reload', async ({
  page,
}) => {
  // Multiple scene loads and history navigations can exceed 30s with software WebGL.
  test.setTimeout(60_000);
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  const requests: { repo: string | null; q: string | null; cursor: string | null }[] = [];
  await page.route('**/api/market?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const request = { repo: params.get('repo'), q: params.get('q'), cursor: params.get('cursor') };
    requests.push(request);
    const data = demoMarket();
    data.repository = request.repo!;
    if (request.q) {
      data.pullRequests = [data.pullRequests[request.cursor ? 1 : 0]];
      data.nextCursor = request.cursor ? null : 'search-next';
      data.total = 2;
    }
    return route.fulfill({ json: data });
  });
  await page.goto('/?repo=withastro%2Fastro');
  await expect(page).toHaveURL(/\/withastro\/astro$/);
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page).toHaveTitle('withastro/astro · Brocante');
  await expect(page.locator('.topbar .header-market')).toContainText('withastro/astro');
  await expect(page.locator('.topbar .header-market')).toContainText('Live from GitHub');
  const repositoryLink = page.getByRole('link', { name: 'withastro/astro', exact: true });
  await expect(repositoryLink).toHaveAttribute('href', 'https://github.com/withastro/astro');
  await expect(repositoryLink).toHaveAttribute('target', '_blank');
  await expect(repositoryLink).toHaveAttribute('rel', 'noopener noreferrer');
  const overlay = await page.locator('.market-search').boundingBox();
  const canvas = await page.locator('.world canvas').boundingBox();
  expect(overlay!.height).toBeLessThanOrEqual(75);
  expect(canvas!.y).toBeCloseTo(overlay!.y, 0);
  await expect(
    page.getByRole('button', { name: 'Search: Needs my review', exact: true }),
  ).toBeHidden();
  const search = page.getByLabel('Search pull requests', { exact: true });
  await search.fill('label:bug');
  await page.waitForTimeout(100);
  expect(requests.every((r) => !r.q)).toBe(true);
  await search.press('Enter');
  await expect(page.locator('.shop-row')).toHaveCount(1);
  await expect(page).toHaveURL(/\/withastro\/astro\?q=label%3Abug$/);
  expect(requests.at(-1)).toEqual({ repo: 'withastro/astro', q: 'label:bug', cursor: null });
  await page.getByRole('button', { name: 'Next 60 →' }).click();
  await expect(page.getByRole('button', { name: '← Previous' })).toBeVisible();
  expect(requests.at(-1)?.cursor).toBe('search-next');
  await page.getByRole('button', { name: 'Search options', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Search options', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search options', exact: true }).click();
  await page.getByRole('button', { name: 'Search: Needs my review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Search options', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(search).toHaveValue('review-requested:@me');
  await expect.poll(() => requests.at(-1)?.q).toBe('review-requested:@me');
  expect(requests.at(-1)?.cursor).toBeNull();
  await expect(page.getByRole('button', { name: '← Previous' })).toHaveCount(0);
  await page.goBack();
  await expect(search).toHaveValue('label:bug');
  await expect.poll(() => requests.at(-1)?.q).toBe('label:bug');
  await page.reload();
  await expect(search).toHaveValue('label:bug');
  await expect(page.locator('.shop-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page).toHaveURL(/\/withastro\/astro$/);
  await expect(page.locator('.shop-row')).toHaveCount(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Markdown descriptions fit the panel and selected shops have a persistent quest badge', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  const data = demoMarket();
  data.repository = 'team/repo';
  data.pullRequests[0].body = [
    '# Summary',
    '',
    '**Formatted** description with [a link](https://example.com).',
    '',
    '- [x] Complete',
    '- [ ] Pending',
    '',
    '```js',
    'const veryLongExample = "' + 'long'.repeat(50) + '";',
    '```',
    '',
    '| Column one | Column two | Column three | Column four |',
    '| --- | --- | --- | --- |',
    '| A | B | C | D |',
    '',
    '<script>window.untrustedMarkdownExecuted = true</script>',
  ].join('\n');
  await page.route('**/api/market?**', (route) => route.fulfill({ json: data }));
  await page.goto('/team/repo');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.shop-row').first().click();
  const details = page.getByRole('complementary', { name: 'Pull request details' });
  await expect(details.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(details.locator('strong')).toContainText('Formatted');
  await expect(details.getByRole('checkbox').first()).toBeChecked();
  await expect(details.getByRole('checkbox').first()).toBeDisabled();
  await expect(details.getByRole('link', { name: 'a link' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  expect(await details.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => Object.hasOwn(window, 'untrustedMarkdownExecuted'))).toBe(false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Market', exact: true }).click();
  const sign = page.locator('.shop-sign:not([hidden])').first();
  await sign.click();
  await expect(page.locator('.shop-sign[aria-pressed="true"] .selection-label')).toHaveText(
    '◆ Selected',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.selection-label')).toHaveCount(0);
});
