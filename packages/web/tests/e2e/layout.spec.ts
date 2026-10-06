import { expect, test } from '@playwright/test';

test('definition relocates on smaller screens and shop cards keep the legend and titles readable', async ({
  page,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'This test explicitly checks desktop, tablet and phone widths.',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.shop-row')).toHaveCount(24);
  for (const width of [1440, 1024, 900, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.brocante-definition:visible')).toHaveCount(1);
    await expect(
      page.locator(width > 1100 ? '.brand-cluster .brocante-definition' : '.sidebar-definition'),
    ).toBeVisible();
    await expect(page.locator('.shop-sign:visible').first()).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const caption = document.querySelector('.market-caption')!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>('.shop-sign')]
            .filter((card) => !card.hidden)
            .every((card) => {
              const rect = card.getBoundingClientRect();
              return (
                rect.right <= caption.left ||
                rect.left >= caption.right ||
                rect.bottom <= caption.top ||
                rect.top >= caption.bottom
              );
            });
        }),
      )
      .toBe(true);
    const dimensions = await page.evaluate(() => {
      const repo = document.querySelector('.header-market strong')!.getBoundingClientRect();
      const state = document.querySelector<HTMLElement>('.shop-sign:not([hidden]) .sign-state')!;
      const title = document.querySelector<HTMLElement>('.shop-sign:not([hidden]) strong')!;
      const range = document.createRange();
      range.selectNodeContents(state);
      return {
        repositoryWidth: repo.width,
        overflow: document.documentElement.scrollWidth > innerWidth,
        statusLines: new Set([...range.getClientRects()].map((rect) => rect.top)).size,
        titleHeight: title.clientHeight,
        requiredTitleHeight: Math.min(
          title.scrollHeight,
          parseFloat(getComputedStyle(title).lineHeight) * 2,
        ),
      };
    });
    expect(dimensions.repositoryWidth).toBeGreaterThan(50);
    expect(dimensions.overflow).toBe(false);
    expect(dimensions.statusLines).toBeLessThan(1.1);
    expect(dimensions.titleHeight + 1).toBeGreaterThanOrEqual(dimensions.requiredTitleHeight);
  }
});
