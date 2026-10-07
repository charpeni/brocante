import { test, expect } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';
test('demo renders, filters, selects, and offers a complete list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /A marketplace for pull requests/ }),
  ).toBeAttached();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.locator('.world canvas')).toBeVisible();
  await page.getByLabel('Search pull requests', { exact: true }).fill('export links');
  await expect(page.locator('.shop-row')).toHaveCount(1);
  await page.locator('.shop-row').click();
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toContainText(
    'Keep export links private',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toHaveCount(0);
  await page.getByLabel('Search pull requests', { exact: true }).fill('');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('logout rejects cross-origin requests', async ({ request }) => {
  const logout = await request.post('/auth/logout', {
    headers: { Origin: 'https://other.example' },
    maxRedirects: 0,
  });
  expect(logout.status()).toBe(403);
});
test('live UI paginates and hides snapshots after access is revoked', async ({ page }) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let revoked = false;
  const first = demoMarket();
  first.repository = 'team/private';
  first.isPrivate = true;
  first.nextCursor = 'next-page';
  first.total = 25;
  await page.route('**/api/market?**', (route) => {
    if (revoked)
      return route.fulfill({ status: 403, json: { error: 'Repository access revoked.' } });
    const next = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({
      json: next ? { ...first, pullRequests: [first.pullRequests[0]], nextCursor: null } : first,
    });
  });
  await page.goto('/?repo=team/private');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.getByRole('button', { name: 'Next 60 →' }).click();
  await expect(page.locator('.shop-row')).toHaveCount(1);
  revoked = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Repository access revoked.');
  await expect(page.locator('.shop-row')).toHaveCount(0);
  await expect(page.locator('.world canvas')).toHaveCount(0);
});
test('reduced motion and a unavailable WebGL context preserve the list', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.canvas-error')).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.locator('.shop-row').first().click();
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toBeVisible();
});

test('sign out succeeds through the browser form and clears cookies', async ({ page, context }) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  await context.addCookies([
    {
      name: 'market_session',
      value: 'existing-session',
      url: 'http://localhost:4321',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'market_login',
      value: 'existing-login',
      url: 'http://localhost:4321',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/');
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/auth/logout')),
    page.getByRole('button', { name: 'Sign out', exact: true }).click(),
  ]);
  expect(response.status()).toBe(302);
  expect((await response.request().allHeaders()).origin).toBe('http://localhost:4321');
  await expect
    .poll(async () =>
      (await context.cookies()).filter((cookie) => cookie.name.startsWith('market_')),
    )
    .toEqual([]);
});

test('details return focus to their opener on Escape and close', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const row = page.locator('.shop-row').nth(10);
  for (const closeWithEscape of [true, false]) {
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.detail h2')).toBeFocused();
    if (closeWithEscape) await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Close pull request' }).click();
    await expect(row).toBeFocused();
  }
});

test('refresh preserves the camera after rotating and zooming', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let loads = 0;
  await page.route('**/api/market?**', (r) => {
    loads++;
    return r.fulfill({
      json: {
        ...demoMarket(),
        repository: 'team/repo',
        fetchedAt: new Date(Date.now() + loads).toISOString(),
      },
    });
  });
  await page.goto('/?repo=team/repo');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.locator('.shop-sign:not([hidden])').first()).toBeVisible();
  const snapshot = () =>
    page
      .locator('.shop-sign:not([hidden])')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) => `${node.getAttribute('data-pr')}:${(node as HTMLElement).style.transform}`,
        ),
      );
  const initial = await snapshot();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const moved = await snapshot();
  expect(moved).not.toEqual(initial);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => loads).toBe(2);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(await snapshot()).toEqual(moved);
});

test('a session outage explains the failure and still permits local logout', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'market_session',
      value: 'existing',
      url: 'http://localhost:4321',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/session', (r) =>
    r.fulfill({
      status: 503,
      json: { error: 'Session check unavailable' },
      headers: { 'Retry-After': '60' },
    }),
  );
  await page.goto('/?repo=team/private');
  await expect(page.getByRole('alert')).toContainText('Unable to check your session');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(page.getByText(/GitHub sign-in has not been configured/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Retry in \d+s/ })).toBeDisabled();
  const [logout] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/auth/logout')),
    page.getByRole('button', { name: 'Sign out', exact: true }).click(),
  ]);
  expect(logout.status()).toBe(302);
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === 'market_session'))
    .toBe(false);
});

test('rate limits pause polling, tab-focus requests, and manual retries until reset', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  let loads = 0;
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  await page.route('**/api/market?**', (r) => {
    loads++;
    return loads === 1
      ? r.fulfill({
          status: 429,
          headers: { 'Retry-After': '180' },
          json: { error: 'GitHub request limit reached.' },
        })
      : r.fulfill({ json: demoMarket() });
  });
  await page.goto('/?repo=team/private');
  await expect(page.getByRole('alert')).toContainText('GitHub request limit reached.');
  await expect(page.getByRole('button', { name: /Retry in \d+s/ })).toBeDisabled();
  await page.clock.fastForward(120_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });
  expect(loads).toBe(1);
  await expect(page.getByRole('button', { name: /Retry in \d+s/ })).toBeDisabled();
  await page.clock.fastForward(61_000);
  await expect.poll(() => loads).toBe(2);
  await expect(page.locator('.shop-row')).toHaveCount(24);
  // Positive control: the same event really refetches when stale and unblocked.
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => loads).toBe(3);
});

test('GPU allocations stabilize across shop replacements and completed bird visits', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Resource ownership is independent of viewport.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.world canvas')).toBeVisible();
  const counts = await page.evaluate(async () => {
    const scenePath = '/src/scene/scene.js',
      lifePath = '/src/scene/life.js';
    const { MarketWorld } = await import(/* @vite-ignore */ scenePath);
    const { MarketLife } = await import(/* @vite-ignore */ lifePath);
    const container = document.createElement('div');
    container.style.cssText = 'width:1000px;height:700px;position:fixed;top:0;left:0';
    document.body.append(container);
    const world = new MarketWorld(
      container,
      () => {},
      () => {},
    );
    // Software renderers skip shadow maps; enable them so the shadow target's cleanup stays covered.
    world.renderer.shadowMap.enabled = true;
    world.shadowsDirty = true;
    const life = new MarketLife(world);
    life.setEnabled(false);
    life.nextVisit = Infinity;
    const shops: number[] = [],
      birds: number[] = [],
      programs: number[] = [];
    let expectedMaterialDisposals = 0,
      materialDisposals = 0,
      ageDisposals = 0,
      expectedAgeDisposals = 0;
    let ownedDisposals = 0,
      sharedDisposals = 0;
    const cleanup = { shadowDisposals: 0, contextLost: false };
    try {
      for (let i = 0; i < 8; i++) {
        const id = 1 + i * 20;
        world.setShops([
          { id, title: 'Review', skill: 'API', openedAtHours: -1, status: 'awaiting' },
        ]);
        world.highlight(new Set([id]), null);
        const stall = world.stalls.get(id);
        const ownedBefore = stall.ownedMaterials.size;
        world.highlight(new Set(), null);
        world.highlight(new Set([id]), null);
        if (stall.ownedMaterials.size !== ownedBefore)
          throw new Error('Repeated filtering allocated materials');
        world.highlight(new Set([id]), id);
        if (!world.halo.visible || !world.selectionMarker.visible)
          throw new Error('Selected shop has no quest highlight');
        world.highlight(new Set(), id);
        if (world.halo.visible || world.selectionMarker.visible)
          throw new Error('Filtered shop retained its quest highlight');
        world.highlight(new Set([id]), id);
        for (const material of stall.ownedMaterials) {
          expectedMaterialDisposals++;
          material.addEventListener('dispose', () => materialDisposals++);
        }
        if (i === 0) {
          stall.flag.geometry.addEventListener('dispose', () => ownedDisposals++);
          stall.stateSign.material.addEventListener('dispose', () => ownedDisposals++);
          stall.structure.children[0].geometry.addEventListener('dispose', () => sharedDisposals++);
        }
        world.setShops([]);
        if (world.halo.visible || world.selectionMarker.visible)
          throw new Error('Removed shop retained its quest highlight');
        shops.push(world.renderer.info.memory.geometries);
        programs.push(
          world.renderer.info.programs.reduce(
            (total: number, program: { usedTimes: number }) => total + program.usedTimes,
            0,
          ),
        );
      }
      world.setShops([
        { id: 1, title: 'Review', skill: 'API', openedAtHours: -1, status: 'awaiting' },
      ]);
      world.highlight(new Set([1]), null);
      const aging = world.stalls.get(1);
      const agedMaterials = new Set();
      aging.structure.traverse(
        (node: {
          material?: { addEventListener: (type: string, listener: () => void) => void };
        }) => {
          if (node.material && aging.ownedMaterials.has(node.material)) {
            agedMaterials.add(node.material);
            expectedAgeDisposals++;
            node.material.addEventListener('dispose', () => ageDisposals++);
          }
        },
      );
      world.setAge(80);
      for (const material of agedMaterials)
        if (aging.ownedMaterials.has(material))
          throw new Error('Discarded structure material remains owned');
      world.highlight(new Set([1]), null);
      for (let i = 0; i < 8; i++) {
        life.invite();
        world.render();
        life.depart(life.birds[0]);
        life.time += 6;
        life.nextVisit = Infinity;
        life.update();
        world.render();
        birds.push(world.renderer.info.memory.geometries);
      }
      return {
        shops,
        birds,
        programs,
        expectedMaterialDisposals,
        materialDisposals,
        expectedAgeDisposals,
        ageDisposals,
        ownedDisposals,
        sharedDisposals,
        remainingBirds: life.birds.length,
        cleanup,
      };
    } finally {
      world.sun.shadow.map.addEventListener('dispose', () => cleanup.shadowDisposals++);
      life.dispose();
      world.dispose();
      cleanup.contextLost = world.renderer.getContext().isContextLost();
      container.remove();
    }
  });
  expect(new Set(counts.shops).size).toBe(1);
  expect(new Set(counts.birds).size).toBe(1);
  expect(new Set(counts.programs).size).toBe(1);
  expect(counts.expectedMaterialDisposals).toBeGreaterThan(100);
  expect(counts.materialDisposals).toBe(counts.expectedMaterialDisposals);
  expect(counts.expectedAgeDisposals).toBeGreaterThan(0);
  expect(counts.ageDisposals).toBe(counts.expectedAgeDisposals);
  expect(counts.ownedDisposals).toBe(2);
  expect(counts.sharedDisposals).toBe(0);
  expect(counts.remainingBirds).toBe(0);
  expect(counts.cleanup).toEqual({ shadowDisposals: 1, contextLost: true });
});

test('a disappearing PR restores list focus and stays closed if it returns', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  const market = demoMarket();
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let loads = 0;
  await page.route('**/api/market?**', (r) =>
    r.fulfill({
      json: {
        ...market,
        pullRequests: loads++ === 1 ? market.pullRequests.slice(1) : market.pullRequests,
      },
    }),
  );
  await page.goto('/?repo=team/repo');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.shop-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.detail h2')).toBeFocused();
  await page.clock.fastForward(61_000);
  await expect(page.locator('.shop-row')).toHaveCount(23);
  await expect(page.locator('.shop-row').first()).toBeFocused();
  if (!(await page.getByLabel('Your repository', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Change repository', exact: true }).click();
  await page.getByLabel('Your repository', { exact: true }).focus();
  await page.clock.fastForward(61_000);
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.getByLabel('Your repository', { exact: true })).toBeFocused();
});

test('retryable polling errors retain the same canvas, camera, rows and keyboard position', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let loads = 0;
  const market = demoMarket();
  await page.route('**/api/market?**', (r) => {
    loads++;
    return loads === 2
      ? r.fulfill({
          status: 502,
          headers: { 'Retry-After': '60' },
          json: { error: 'GitHub unavailable' },
        })
      : r.fulfill({ json: { ...market, fetchedAt: new Date().toISOString() } });
  });
  await page.goto('/?repo=team/repo');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.locator('.shop-row').nth(3).click();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const canvas = await page.locator('.world canvas').elementHandle();
  const snapshot = () =>
    page
      .locator('.shop-sign')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform));
  const before = await snapshot();
  const search = page.getByLabel('Search pull requests', { exact: true });
  await search.focus();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('alert')).toContainText('Showing the last successful snapshot');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  expect(await canvas?.evaluate((node) => node === document.querySelector('.world canvas'))).toBe(
    true,
  );
  await expect(search).toBeFocused();
  await page.clock.fastForward(61_000);
  await expect.poll(() => loads).toBe(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(await canvas?.evaluate((node) => node === document.querySelector('.world canvas'))).toBe(
    true,
  );
  expect(await snapshot()).toEqual(before);
  await expect(search).toBeFocused();
});

test('a session cooldown disables Refresh and re-enables it at expiry without dropping the market', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  let sessions = 0,
    markets = 0;
  await page.route('**/api/session', (r) => {
    sessions++;
    return sessions === 1
      ? r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } })
      : r.fulfill({ status: 429, headers: { 'Retry-After': '180' }, json: { error: 'Wait' } });
  });
  await page.route('**/api/market?**', (r) => {
    markets++;
    return r.fulfill({ json: demoMarket() });
  });
  await page.goto('/?repo=team/repo');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.clock.fastForward(61_000);
  await expect.poll(() => markets).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => sessions).toBe(2);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.clock.fastForward(179_000);
  expect(markets).toBe(2);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  await page.clock.fastForward(2_000);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.locator('.shop-row')).toHaveCount(24);
});

test('access denial clears data permanently across subsequent transient failures', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let loads = 0;
  await page.route('**/api/market?**', (r) => {
    loads++;
    return loads === 1
      ? r.fulfill({ json: demoMarket() })
      : r.fulfill({
          status: loads === 2 ? 403 : 502,
          json: { error: loads === 2 ? 'Access revoked' : 'Unavailable' },
        });
  });
  await page.goto('/?repo=team/private');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Access revoked');
  await expect(page.locator('.shop-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unavailable');
  await expect(page.locator('.shop-row')).toHaveCount(0);
  await expect(page.locator('.world canvas')).toHaveCount(0);
});

test('a filtered-out PR stays closed when its review state matches again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  const market = demoMarket();
  let loads = 0;
  await page.route('**/api/market?**', (r) =>
    r.fulfill({
      json: {
        ...market,
        pullRequests: [
          {
            ...market.pullRequests[0],
            isDraft: false,
            requestedCount: 0,
            reviewDecision: loads++ === 1 ? 'APPROVED' : null,
          },
        ],
      },
    }),
  );
  await page.goto('/?repo=team/repo');
  await page.getByRole('button', { name: 'Open for a review' }).click();
  await page.locator('.shop-row').first().click();
  await expect(page.locator('.detail h2')).toBeFocused();
  await page.clock.fastForward(61_000);
  await expect(page.locator('.shop-row')).toHaveCount(0);
  await expect(page.locator('.detail')).toHaveCount(0);
  if (!(await page.getByLabel('Your repository', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Change repository', exact: true }).click();
  await page.getByLabel('Your repository', { exact: true }).focus();
  await page.clock.fastForward(61_000);
  await expect(page.locator('.shop-row')).toHaveCount(1);
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.getByLabel('Your repository', { exact: true })).toBeFocused();
});

test('restoring repository access does not reopen details or steal focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } }),
  );
  let loads = 0;
  await page.route('**/api/market?**', (r) => {
    loads++;
    return loads === 2
      ? r.fulfill({ status: 403, json: { error: 'Access revoked' } })
      : r.fulfill({ json: demoMarket() });
  });
  await page.goto('/?repo=team/repo');
  await page.locator('.shop-row').first().click();
  await expect(page.locator('.detail h2')).toBeFocused();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('alert')).toContainText('Access revoked');
  await expect(page.locator('.detail')).toHaveCount(0);
  if (!(await page.getByLabel('Your repository', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Change repository', exact: true }).click();
  await page.getByLabel('Your repository', { exact: true }).focus();
  await page.clock.fastForward(61_000);
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.getByLabel('Your repository', { exact: true })).toBeFocused();
});

test('cooldown disables pagination and a new repository waits without reusing old data', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  let sessions = 0,
    markets = 0;
  await page.route('**/api/session', (r) => {
    sessions++;
    return sessions === 1
      ? r.fulfill({ json: { login: 'mina', configured: true, installUrl: null } })
      : r.fulfill({
          status: 503,
          headers: { 'Retry-After': '120' },
          json: { error: 'Unable to verify your GitHub session.' },
        });
  });
  await page.route('**/api/market?**', (r) => {
    markets++;
    const repo = new URL(r.request().url()).searchParams.get('repo')!;
    const market = demoMarket();
    return r.fulfill({
      json: {
        ...market,
        repository: repo,
        nextCursor: 'next-page',
        total: 120,
        pullRequests: [{ ...market.pullRequests[0], title: `${repo} pull request` }],
      },
    });
  });
  await page.goto('/?repo=team/repo');
  await page.getByRole('button', { name: 'Next 60 →' }).click();
  await expect(page.getByRole('button', { name: '← Previous' })).toBeEnabled();
  await page.clock.fastForward(61_000);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => sessions).toBe(2);
  await expect(page.getByRole('button', { name: 'Next 60 →' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '← Previous' })).toBeDisabled();
  await expect(page.locator('.shop-row')).toContainText('team/repo pull request');
  const before = markets;
  if (!(await page.getByLabel('Your repository', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Change repository', exact: true }).click();
  await page.getByLabel('Your repository', { exact: true }).fill('other/repo');
  await page.getByRole('button', { name: 'Open repository', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for GitHub…' })).toBeVisible();
  await expect(page.locator('.empty-state')).not.toContainText(
    'Unable to verify your GitHub session',
  );
  await expect(page.locator('.shop-row')).toHaveCount(0);
  await expect(page.locator('.world canvas')).toHaveCount(0);
  expect(markets).toBe(before);
  await page.clock.fastForward(121_000);
  await expect(page.locator('.shop-row')).toContainText('other/repo pull request');
  await expect(page.getByRole('heading', { name: 'Waiting for GitHub…' })).toHaveCount(0);
  expect(markets).toBe(before + 1);
  await expect(page.getByRole('button', { name: 'Next 60 →' })).toBeEnabled();
});
