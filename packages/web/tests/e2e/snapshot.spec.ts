import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoMarket } from '../../../core/src/demo';
import { reportFromSnapshot } from '../../../core/src/report';
import { renderSnapshot } from '../../../snapshot/src/index';

let directory: string;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brocante-snapshot-e2e-'));
});
test.afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('portable demo renders the shared 3D scene, filters, and PR details while offline', async ({
  page,
  context,
}) => {
  const path = join(directory, 'demo.html');
  await writeFile(path, renderSnapshot({ ...reportFromSnapshot(demoMarket()), demo: true }));
  await context.setOffline(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator('.world canvas')).toBeVisible();
  await expect(page.locator('.shop-row')).toHaveCount(24);
  await expect(page.getByText('Local snapshot', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Sign in with GitHub/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByLabel('Search pull requests', { exact: true }).fill('export links');
  await expect(page.locator('.shop-row')).toHaveCount(1);
  await page.locator('.shop-row').click();
  await expect(page.getByRole('complementary', { name: 'Pull request details' })).toContainText(
    'Keep export links private',
  );
  expect(requests).toEqual([]);
});

test('portable snapshots paginate and search all captured PRs without executing GitHub content', async ({
  page,
  context,
}) => {
  const report = reportFromSnapshot(demoMarket());
  report.repository = 'team/private';
  report.isPrivate = true;
  report.total = 65;
  report.complete = false;
  report.search = 'label:bug';
  report.pullRequests = Array.from({ length: 65 }, (_, index) => ({
    ...report.pullRequests[0],
    number: 500 + index,
    title: `Offline shop ${index}`,
    body: '![image](https://example.invalid/image.png)\n\n<script>window.pwned=true</script>',
  }));
  report.pullRequests[0].title = '</script><script>window.pwned=true</script>';
  const path = join(directory, 'private.html');
  await writeFile(path, renderSnapshot(report));
  await context.setOffline(true);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes('webgl')
        ? null
        : original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto(pathToFileURL(path).href);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.shop-row')).toHaveCount(60);
  await expect(page.getByText(/Partial snapshot:/)).toBeVisible();
  await expect(page.locator('.shop-row').first()).toContainText(
    '</script><script>window.pwned=true</script>',
  );
  await page.getByRole('button', { name: 'Next 60 →', exact: true }).click();
  await expect(page.locator('.shop-row')).toHaveCount(5);
  await page.getByLabel('Search pull requests', { exact: true }).fill('Offline shop 3');
  await expect(page.locator('.shop-row')).toHaveCount(11);
  await page.locator('.shop-row').first().click();
  await expect(page.getByText('Images are not included in this snapshot.')).toBeVisible();
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
