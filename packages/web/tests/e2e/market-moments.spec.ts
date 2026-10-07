import { expect, test } from '@playwright/test';

test('sword and apple-crate discoveries support hover, touch, and keyboard without selecting a PR', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/src/scene/life.js*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'this.world = world;',
        'this.world = world; window.__marketLife = this;',
      ),
    });
  });
  await page.goto('/');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  for (const [id, label, message] of [
    ['sword', 'Inspect the sword in the stone', 'Perhaps after your next review.'],
    ['worm', 'Inspect the apple crate', 'Keeping the peace. For now.'],
  ]) {
    await page.evaluate((id) => {
      // @ts-expect-error test-only instrumentation
      const life = window.__marketLife;
      life.world.lookTarget.copy(life.moments.hintTargets[id].position);
      life.world.zoom = 2.6;
      life.world.render();
    }, id);
    const target = page.getByRole('button', { name: label, exact: true });
    await expect(target).toBeVisible();
    if (info.project.name === 'desktop') await target.hover();
    else await target.click();
    await expect(page.getByRole('tooltip')).toHaveText(message);
    await expect(target).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: info.outputPath(`${id}-discovery.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).not.toBeVisible();
    await target.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tooltip')).toHaveText(message);
    await expect(
      page.getByRole('complementary', { name: 'Pull request details' }),
    ).not.toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('ambient moments share pause and reduced motion and leave PR selection usable', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/src/scene/life.js*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'this.world = world;',
        'this.world = world; window.__marketLife = this;',
      ),
    });
  });
  await page.goto('/');
  await expect(page.locator('.shop-sign:visible').first()).toBeVisible();
  const state = () =>
    page.evaluate(() => {
      // @ts-expect-error test-only module instrumentation
      const life = window.__marketLife;
      return {
        time: life.time,
        running: life.canMove(),
        balloon: life.moments.balloon.visible,
        fisher: life.moments.fisher.visible,
        cats: life.cats.animals.map((cat) => cat.phase),
        worm: life.moments.discoveries.worm.position.toArray(),
      };
    });
  expect(await state()).toMatchObject({ time: 0, running: false, balloon: false, fisher: true });
  const hiddenGift = page.locator('.floating-gift-target[aria-label="Inspect the floating gift"]');
  await expect(hiddenGift).toHaveJSProperty('hidden', true);
  await expect(hiddenGift).toBeHidden();
  await expect(hiddenGift).toHaveCSS('display', 'none');
  expect(
    await hiddenGift.evaluate((button: HTMLElement) => {
      button.focus();
      return document.activeElement === button;
    }),
  ).toBe(false);
  expect(await page.locator('.world').ariaSnapshot()).not.toContain('Inspect the floating gift');
  await page.getByRole('button', { name: 'Search', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(hiddenGift).not.toBeFocused();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Reading MediaQueryList.matches before the next frame swallows its change event.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect.poll(async () => (await state()).time).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause life', exact: true }).click();
  const paused = await state();
  await page.waitForTimeout(250);
  expect(await state()).toEqual(paused);
  await page.evaluate((mobile) => {
    // @ts-expect-error test-only module instrumentation
    const life = window.__marketLife;
    life.time = 35;
    life.update();
    // The mobile camera needs more room below the translucent search bar.
    life.world.zoom = mobile ? 0.8 : 1;
    life.world.render();
  }, info.project.name === 'mobile');
  expect(await state()).toMatchObject({ time: 35, running: false, balloon: true });
  const gift = page.getByRole('button', { name: 'Inspect the floating gift' });
  await expect(gift).toBeVisible();
  if (info.project.name === 'desktop') {
    await gift.hover();
    await expect(gift).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.getByRole('tooltip')).toHaveText('If only you had a slingshot…');
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).not.toBeVisible();
  }
  await gift.click();
  await expect(page.getByRole('tooltip')).toHaveText('If only you had a slingshot…');
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).not.toBeVisible();
  await gift.focus();
  await expect(gift).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.screenshot({ path: info.outputPath('balloon-and-fisher.png') });
  await page.getByRole('button', { name: 'Resume life', exact: true }).click();
  await expect.poll(async () => (await state()).time).toBeGreaterThan(35);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await state();
  await page.waitForTimeout(250);
  expect(await state()).toEqual(reduced);
  await page
    .locator('.shop-row')
    .first()
    .evaluate((el: HTMLElement) => el.click());
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toBeVisible();
});
