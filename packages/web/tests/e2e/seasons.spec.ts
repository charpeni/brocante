import { expect, test, type Page } from '@playwright/test';

async function observeWorld(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/src/scene/scene.js*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'this.container = container;',
        'this.container = container; window.__marketWorld = this;',
      ),
    });
  });
  await page.goto('/');
  await expect(page.locator('.shop-sign:not([hidden])').first()).toBeVisible();
  await page.evaluate(async () => {
    // Test-only reference injected by the route; no production debug API.
    // @ts-expect-error injected test world
    const world = window.__marketWorld;
    const render = world.render;
    world.render = function (...args: unknown[]) {
      const result = render.apply(this, args);
      const origin = this.lookTarget.clone().set(0, 0, 0).project(this.camera);
      document.documentElement.dataset.worldState = JSON.stringify({
        origin: origin.toArray(),
        angle: this.angle,
        zoom: this.zoom,
        target: this.lookTarget.toArray(),
        radius: Math.hypot(this.camera.position.x, this.camera.position.z),
        geometries: this.renderer.info.memory.geometries,
        snow: this.landscape.meshes.get('snow').visible,
        blossom: this.landscape.meshes.get('blossom').visible,
      });
      return result;
    };
  });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
}

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(document.documentElement.dataset.worldState!));
}

test('rotation stays anchored to the fountain after focusing a shop, with buttons and dragging', async ({
  page,
}, info) => {
  await observeWorld(page);
  await page
    .locator('.shop-row')
    .first()
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toBeVisible();
  if (info.project.name === 'mobile') await page.keyboard.press('Escape');
  const before = await state(page);
  expect(Math.hypot(...before.target)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  const turned = await state(page);
  expect(turned.angle).not.toBe(before.angle);
  expect(turned.origin[0]).toBeCloseTo(before.origin[0], 6);
  expect(turned.origin[1]).toBeCloseTo(before.origin[1], 6);
  expect(turned.radius).toBeCloseTo(before.radius, 6);
  await page.keyboard.press('Escape');
  const unselected = await state(page);
  const bounds = (await page.locator('.world canvas').boundingBox())!;
  await page.mouse.move(bounds.x + 6, bounds.y + bounds.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 90, bounds.y + bounds.height * 0.55, { steps: 8 });
  await page.mouse.up();
  const dragged = await state(page);
  expect(dragged.angle).not.toBe(unselected.angle);
  expect(dragged.origin[0]).toBeCloseTo(unselected.origin[0], 6);
  expect(dragged.origin[1]).toBeCloseTo(unselected.origin[1], 6);
  expect(dragged.radius).toBeCloseTo(unselected.radius, 6);
});

test('season toggle updates nature without replacing the canvas, moving the camera or resuming life', async ({
  page,
}) => {
  await observeWorld(page);
  await page.getByRole('button', { name: 'Pause life', exact: true }).click();
  await page
    .locator('.world canvas')
    .evaluate((element) => element.setAttribute('data-original', 'true'));
  await page
    .locator('.shop-row')
    .first()
    .evaluate((element: HTMLElement) => element.click());
  const before = await state(page);
  const counts: number[] = [];
  const seasonButtonWidth = (await page.getByRole('button', { name: /^Season:/ }).boundingBox())!
    .width;
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-season', 'autumn');
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const season of ['winter', 'spring', 'summer', 'autumn']) {
      // Close details to keep the controls reachable on mobile.
      if (cycle === 0 && season === 'winter') await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Season:/ }).click();
      await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-season', season);
      expect((await page.getByRole('button', { name: /^Season:/ }).boundingBox())!.width).toBe(
        seasonButtonWidth,
      );
      const current = await state(page);
      expect(current.angle).toBe(before.angle);
      expect(current.zoom).toBe(before.zoom);
      expect(current.target).toEqual(before.target);
      expect(current.snow).toBe(season === 'winter');
      expect(current.blossom).toBe(season === 'spring');
    }
    counts.push((await state(page)).geometries);
  }
  expect(new Set(counts).size).toBe(1);
  await expect(page.locator('.world canvas')).toHaveAttribute('data-original', 'true');
  await expect(page.getByRole('button', { name: 'Resume life', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
