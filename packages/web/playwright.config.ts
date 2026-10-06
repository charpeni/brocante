import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  // Software WebGL needs time to compile shaders and competes for CPU across browsers.
  workers: 2,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure' },
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
