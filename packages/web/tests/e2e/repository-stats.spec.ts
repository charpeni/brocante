import { expect, test } from '@playwright/test';
import { demoMarket } from '../../src/lib/demo';

test('historical report keeps repository scope, fits the map, and links to bilan', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { configured: true, login: 'tester', installUrl: null } }),
  );
  await page.route('**/api/market?*', (route) =>
    route.fulfill({
      json: {
        ...demoMarket(),
        repository: 'withastro/astro',
        url: 'https://github.com/withastro/astro',
        total: new URL(route.request().url()).searchParams.has('q') ? 2 : 24,
      },
    }),
  );
  await page.goto('/withastro/astro');
  const panel = page.getByRole('region', { name: 'Repository activity', exact: true });
  await expect(panel).toBeVisible();
  const toggle = panel.getByRole('button', { name: 'Repository report', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(panel.getByText('Last 30 days')).toBeVisible();
  await expect(panel.locator('dd').first()).toContainText('42');
  await expect(panel.getByText('+7', { exact: true })).toBeVisible();
  await expect(panel.getByText('−4', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link')).toHaveAttribute(
    'href',
    'https://bilan.dev/withastro/astro',
  );
  await expect(panel.getByRole('link')).toHaveAttribute('target', '_blank');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stats = document.querySelector('.repository-stats')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('.shop-sign:not([hidden])')].every(
          (node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.right <= stats.left ||
              rect.left >= stats.right ||
              rect.bottom <= stats.top ||
              rect.top >= stats.bottom
            );
          },
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('repository-report.png') });
  await page.getByRole('searchbox').fill('label:bug');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(panel.locator('dd').first()).toContainText('42');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
