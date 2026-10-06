import { expect, test } from '@playwright/test';

test('diff size changes only the building, preserving picking, aging, perches and dense plots', async ({
  page,
}) => {
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
  await expect(page.locator('.shop-sign:visible').first()).toBeVisible();
  const result = await page.evaluate(async () => {
    // @ts-expect-error injected test world
    const world = window.__marketWorld;
    const original = [...world.stalls.values()].map((stall) => stall.shop);
    const shop = {
      id: 700,
      title: 'Size probe',
      skill: 'Frontend',
      openedAtHours: -1,
      status: 'awaiting',
      size: 'standard',
    };
    world.setShops([shop]);
    const stall = world.stalls.get(700);
    const snapshot = () => {
      world.scene.updateMatrixWorld(true);
      return {
        plotScale: stall.group.scale.toArray(),
        hitbox: stall.hitbox.matrixWorld.toArray(),
        sign: stall.stateSign.matrixWorld.toArray(),
        person: stall.owner.matrixWorld.toArray(),
        building: stall.building.scale.toArray(),
        camera: world.camera.position.toArray(),
      };
    };
    const standard = snapshot();
    world.setShops([{ ...shop, size: 'compact' }]);
    const compact = snapshot();
    // Pick the same plot edge even though the compact roof is narrower.
    const edge = stall.hitbox.position.clone().add({ x: 1.6, y: 0, z: 0 });
    stall.group.localToWorld(edge).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    const picked = world.pick({
      clientX: rect.left + ((edge.x + 1) * rect.width) / 2,
      clientY: rect.top + ((1 - edge.y) * rect.height) / 2,
    });
    world.setAge(600);
    const aged = {
      size: stall.building.scale.toArray(),
      parent: stall.structure.parent === stall.building,
    };
    const url = '/src/scene/life.js';
    const { MarketLife } = await import(/* @vite-ignore */ url);
    const perch = MarketLife.prototype.targets.call({ world }, 'shop')[0].resolve();
    const expectedPerch = stall.building.localToWorld(
      stall.group.position.clone().set(-0.7, 3.29 - stall.wear * 0.08, -0.45),
    );
    const perchError = perch.distanceTo(expectedPerch);
    world.setShops([{ ...shop, size: undefined }]);
    const unknown = stall.building.scale.toArray();
    world.setShops(
      Array.from({ length: 60 }, (_, i) => ({
        ...shop,
        id: 700 + i,
        size: i % 2 ? 'standard' : 'compact',
      })),
    );
    const densePlotScales = [...world.stalls.values()].map((item) => item.group.scale.x);
    world.setShops(original);
    return { standard, compact, picked, aged, unknown, perchError, densePlotScales };
  });
  expect(result.compact.building).toEqual([0.82, 0.9, 0.82]);
  expect(result.standard.building).toEqual([1, 1, 1]);
  for (const key of ['plotScale', 'hitbox', 'sign', 'person', 'camera'] as const)
    expect(result.compact[key]).toEqual(result.standard[key]);
  expect(result.picked).toBe(700);
  expect(result.aged).toEqual({ size: [0.82, 0.9, 0.82], parent: true });
  expect(result.unknown).toEqual([1, 1, 1]);
  expect(result.perchError).toBeLessThan(0.000001);
  expect(new Set(result.densePlotScales)).toEqual(new Set([0.73]));
});
