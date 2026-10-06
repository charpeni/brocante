import { expect, test, type Page } from '@playwright/test';

async function observeEntrance(
  page: Page,
  reducedMotion: 'reduce' | 'no-preference',
  hold = false,
) {
  await page.emulateMedia({ reducedMotion });
  await page.route('**/src/scene/scene.js*', async (route) => {
    const response = await route.fetch();
    let source = (await response.text()).replace(
      'this.container = container;',
      'this.container = container; window.__marketWorld = this;',
    );
    if (hold)
      source = source.replace(
        'this.entrance = new MarketEntrance(this.landscape, this.stalls);',
        'this.entrance = new MarketEntrance(this.landscape, this.stalls); this.entrance.duration = 60000;',
      );
    await route.fulfill({ response, body: source });
  });
  await page.goto('/');
  await expect(page.locator('.world canvas')).toBeVisible();
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const world = (
      window as unknown as {
        __marketWorld: {
          entrance?: unknown;
          entranceStarted?: boolean;
          landscape: { meshes: Map<string, { scale: { y: number } }> };
          stalls: Map<number, { group: { scale: { y: number } } }>;
        };
      }
    ).__marketWorld;
    return {
      active: !!world.entrance,
      started: !!world.entranceStarted,
      trees: world.landscape.meshes.get('bark')!.scale.y,
      shops: [...world.stalls.values()].map((stall) => stall.group.scale.y),
    };
  });
}

test('creation settles once and does not replay on filters or seasons', async ({ page }) => {
  await observeEntrance(page, 'no-preference');
  await expect.poll(async () => (await snapshot(page)).started).toBe(true);
  await expect.poll(async () => (await snapshot(page)).active).toBe(false);
  expect((await snapshot(page)).trees).toBe(1);
  expect((await snapshot(page)).shops.every((scale) => scale === 1)).toBe(true);
  await page
    .locator('.world canvas')
    .evaluate((canvas) => canvas.setAttribute('data-original', 'yes'));
  await page.getByRole('button', { name: /^Season:/ }).click();
  await page.getByRole('button', { name: /Open for a review/ }).click();
  expect((await snapshot(page)).active).toBe(false);
  await expect(page.locator('.world canvas')).toHaveAttribute('data-original', 'yes');
});

test('reduced motion shows the completed market immediately', async ({ page }) => {
  await observeEntrance(page, 'reduce');
  await expect.poll(async () => (await snapshot(page)).shops.length).toBe(24);
  const state = await snapshot(page);
  expect(state.active).toBe(false);
  expect(state.trees).toBe(1);
  expect(state.shops.every((scale) => scale === 1)).toBe(true);
});

test('pausing finishes an in-flight entrance', async ({ page }) => {
  await observeEntrance(page, 'no-preference');
  await expect.poll(async () => (await snapshot(page)).started).toBe(true);
  // Lengthen only this test's one-shot entrance, so browser scheduling cannot skip the interruption.
  await page.evaluate(() => {
    const world = (
      window as unknown as {
        __marketWorld: {
          entranceStarted: boolean;
          entrance?: { duration: number };
          startEntrance(): void;
          finishEntrance(): void;
        };
      }
    ).__marketWorld;
    world.finishEntrance();
    world.entranceStarted = false;
    world.startEntrance();
    requestAnimationFrame(() => {
      if (world.entrance) world.entrance.duration = 60_000;
    });
  });
  await expect.poll(async () => (await snapshot(page)).active).toBe(true);
  await page.getByRole('button', { name: 'Pause life', exact: true }).click();
  expect((await snapshot(page)).active).toBe(false);
  expect((await snapshot(page)).trees).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await snapshot(page)).active).toBe(false);
});

test('shop cards wait for construction, then enter with staggered delays', async ({ page }) => {
  await observeEntrance(page, 'no-preference', true);
  await expect.poll(async () => (await snapshot(page)).active).toBe(true);
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-entrance', 'growing');
  await expect(page.locator('.shop-sign:visible')).toHaveCount(0);
  const animations = await page.evaluate(async () => {
    // @ts-expect-error injected test world
    window.__marketWorld.finishEntrance();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return [...document.querySelectorAll('.shop-sign:not([hidden])')].map((node) => {
      const style = getComputedStyle(node);
      return { name: style.animationName, delay: style.animationDelay };
    });
  });
  expect(animations.length).toBeGreaterThan(0);
  expect(animations.every((animation) => animation.name === 'shop-card-arrive')).toBe(true);
  expect(new Set(animations.map((animation) => animation.delay)).size).toBe(animations.length);
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-entrance', 'ready');
  await expect(page.locator('.shop-sign:not([hidden])').first()).toBeVisible();
});

test('small hover title sits above the camera controls', async ({ page }) => {
  await observeEntrance(page, 'reduce');
  await page.evaluate(() => {
    // @ts-expect-error injected test world
    const world = window.__marketWorld;
    world.onHover([...world.stalls.keys()][0]);
  });
  await expect(page.locator('.hover-hint')).toBeVisible();
  const bounds = await page.evaluate(() => ({
    hint: document.querySelector('.hover-hint')!.getBoundingClientRect().toJSON(),
    controls: document.querySelector('.world-controls')!.getBoundingClientRect().toJSON(),
    width: innerWidth,
  }));
  expect(bounds.hint.bottom).toBeLessThanOrEqual(bounds.controls.top - 9);
  expect(bounds.hint.left).toBeGreaterThanOrEqual(0);
  expect(bounds.hint.right).toBeLessThanOrEqual(bounds.width);
});
