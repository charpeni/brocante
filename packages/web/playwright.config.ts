import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  // Software WebGL needs time to compile shaders and competes for CPU across browsers.
  workers: process.env.CI ? 1 : 2,
  maxFailures: process.env.CI ? 5 : 0,
  // Leave time for GitHub Actions to upload diagnostics before the job times out.
  globalTimeout: process.env.CI ? 8 * 60_000 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:4321',
    // Screencast and DOM snapshots starve software WebGL on CI's small runners; keep actions, console and network.
    trace: process.env.CI
      ? { mode: 'retain-on-failure', screenshots: false, snapshots: false }
      : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
