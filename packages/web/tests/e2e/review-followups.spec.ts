import { expect, test } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';

test('sign-in links preserve the repository and submitted search', async ({ page }) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: null, configured: true } }),
  );
  await page.goto('/team/private-repo?q=label%3Abug');
  const links = page.getByRole('link', { name: 'Sign in with GitHub' });
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    const href = await link.getAttribute('href');
    const login = new URL(href!, 'http://localhost:4321');
    expect(login.pathname).toBe('/auth/login');
    expect(login.searchParams.get('returnTo')).toBe('/team/private-repo?q=label%3Abug');
  }
});

test('short repository owners remain readable at phone and tablet widths', async ({
  page,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'This test checks both phone and tablet widths explicitly.',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true } }),
  );
  await page.route('**/api/market?**', (route) =>
    route.fulfill({ json: { ...demoMarket(), repository: 'facebook/react' } }),
  );
  await page.goto('/facebook/react');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  for (const width of [390, 600, 900, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const owner = page.locator('.repository-owner');
    await expect(owner).toHaveText('facebook');
    await expect
      .poll(() => owner.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`repository-${width}.png`) });
  }
});

test('a rejected search identifies retained results and offers editing without automatic retries', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true } }),
  );
  const queries: string[] = [];
  await page.route('**/api/market?**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    queries.push(query);
    if (query === 'label:(bug')
      return route.fulfill({ status: 400, json: { error: 'Invalid search syntax.' } });
    const data = demoMarket();
    return route.fulfill({
      json: {
        ...data,
        repository: 'team/repo',
        pullRequests: data.pullRequests.slice(0, 2),
        total: 2,
      },
    });
  });
  await page.goto('/team/repo?q=label%3Abug');
  await expect(page.locator('.shop-row')).toHaveCount(2);
  await page.locator('.world canvas').evaluate((node) => {
    node.setAttribute('data-retained', 'yes');
  });
  const search = page.getByRole('searchbox', { name: 'Search pull requests' });
  await search.fill('label:(bug');
  await search.press('Enter');
  const notice = page.getByRole('alert');
  await expect(notice).toContainText('Invalid search syntax.');
  await expect(notice).toContainText('Showing results for “label:bug” (page 1).');
  await expect(page.locator('.shop-row')).toHaveCount(2);
  await expect(page.locator('.world canvas')).toHaveAttribute('data-retained', 'yes');
  await expect(notice.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await page.clock.install();
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await page.clock.fastForward(61_000);
  expect(queries).toEqual(['label:bug', 'label:(bug']);
  await notice.getByRole('button', { name: 'Edit search' }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('label:(bug');
  await search.fill('label:feature');
  await search.press('Enter');
  await expect(notice).toHaveCount(0);
  await expect(page).toHaveURL(/q=label%3Afeature$/);
  await expect(page.locator('.world canvas')).toHaveAttribute('data-retained', 'yes');
});

test('long owners leave repository names visible on narrow screens', async ({ page }, info) => {
  test.skip(
    info.project.name === 'mobile',
    'This test includes phone and tablet widths explicitly.',
  );
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true } }),
  );
  await page.route('**/api/market?**', (route) =>
    route.fulfill({
      json: {
        ...demoMarket(),
        repository: new URL(route.request().url()).searchParams.get('repo'),
        pullRequests: [],
        total: 0,
      },
    }),
  );
  for (const repository of [
    'GoogleCloudPlatform/golang-samples',
    'averylongorganizationname123456789012/a',
    'kubernetes-sigs/cluster-api-provider-aws',
    'withastro/astro',
  ]) {
    await page.goto(`/${repository}`);
    await expect(page.locator('.repository-name')).toHaveText(repository.split('/')[1]);
    // The pending sign-in label is wider than the signed-in actions and narrows the header.
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 360, 390, 600, 900, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await page.locator('.repository-link').evaluate((link) => {
        const owner = link.querySelector<HTMLElement>('.repository-owner')!;
        const name = link.querySelector<HTMLElement>('.repository-name')!;
        const rect = link.getBoundingClientRect();
        const nameRect = name.getBoundingClientRect();
        return {
          ownerWidth: owner.clientWidth,
          ownerFullWidth: owner.scrollWidth,
          nameWidth: name.clientWidth,
          nameFullWidth: name.scrollWidth,
          nameContained: nameRect.left >= rect.left && nameRect.right <= rect.right,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(dimensions.ownerWidth).toBeGreaterThan(0);
      expect(dimensions.nameWidth).toBeGreaterThanOrEqual(20);
      expect(dimensions.nameContained).toBe(true);
      expect(dimensions.overflow).toBe(false);
      if (width >= 600) {
        expect(dimensions.ownerFullWidth - dimensions.ownerWidth).toBeLessThanOrEqual(1);
      }
      if (repository.endsWith('/a')) expect(dimensions.nameWidth).toBe(dimensions.nameFullWidth);
      if (width === 390)
        await page.screenshot({ path: info.outputPath(`${repository.replace('/', '-')}-390.png`) });
    }
  }
});

test('a cooldown starts with the correct countdown after the page has been idle', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true } }),
  );
  let failing = false;
  let requests = 0;
  await page.route('**/api/market?**', (route) => {
    requests++;
    return failing
      ? route.fulfill({
          status: 502,
          headers: { 'Retry-After': '60' },
          json: { error: 'GitHub is temporarily unavailable.' },
        })
      : route.fulfill({ json: { ...demoMarket(), repository: 'team/repo' } });
  });
  await page.goto('/team/repo');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.clock.runFor(20_000);
  await page.evaluate(() => {
    const observations: string[] = [];
    const observer = new MutationObserver(() => {
      const label =
        document.querySelector('.market-status [role="alert"] button')?.textContent ?? '';
      if (label.startsWith('Retry in ')) observations.push(label);
    });
    observer.observe(document.querySelector('.market-status')!, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    Object.assign(window, { retryObservations: observations, retryObserver: observer });
  });
  failing = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const retry = page.getByRole('alert').getByRole('button', { name: /Retry in/ });
  await expect(retry).toHaveText('Retry in 60s');
  expect(
    await page.evaluate(
      () => (window as unknown as { retryObservations: string[] }).retryObservations[0],
    ),
  ).toBe('Retry in 60s');
  await page.clock.runFor(1000);
  await expect(retry).toHaveText('Retry in 59s');
  await page.clock.runFor(58_000);
  expect(requests).toBe(2);
  await expect(retry).toHaveText('Retry in 1s');
  failing = false;
  await page.clock.runFor(1000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toBe(3);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
});
