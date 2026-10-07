import { afterEach, expect, it, vi } from 'vitest';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from './server';
import { resolveGitHubToken } from './github-auth';

vi.mock('./github-auth', () => ({
  resolveGitHubToken: vi.fn(async (override?: string) => override ?? ''),
}));

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});

it('returns a bounded download link for a real portable 3D snapshot', async () => {
  const host = createFakePluginHost({ pluginId: 'brocante', appUrl: 'http://localhost:9876' });
  hosts.push(host);
  plugin(host.bb);
  expect(host.harness.inspection.registrations.httpRoutes).toEqual([
    expect.objectContaining({ method: 'GET', path: '/snapshot', auth: 'local' }),
    expect.objectContaining({ method: 'GET', path: '/preview', auth: 'local' }),
  ]);
  const result = await host.harness.behavior.runCli(['report', '--demo']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout!.length).toBeLessThan(1024);
  expect(result.stdout).toContain('Preview in bb: http://localhost:9876/plugins/brocante/market/');
  const url = result.stdout!.match(/Portable 3D market: (\S+)/)![1];
  const parsed = new URL(url);
  const response = await host.harness.behavior.fetchHttp('GET', `/snapshot${parsed.search}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const html = await response.text();
  expect(html).toContain('<script type="application/json" id="brocante-data">');
  const report = JSON.parse(html.match(/id="brocante-data">(.*?)<\/script>/s)![1]);
  expect(report.demo).toBe(true);
  expect(report.pullRequests).toHaveLength(24);
  const preview = await host.harness.behavior.fetchHttp('GET', `/preview${parsed.search}`);
  expect(preview.status).toBe(200);
  expect(preview.headers.has('content-disposition')).toBe(false);
  expect(preview.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  expect(preview.headers.get('content-security-policy')).not.toContain('allow-same-origin');
  expect(await preview.text()).toBe(html);
});

it('refuses missing snapshots and expires the oldest download after ten new snapshots', async () => {
  const host = createFakePluginHost({ pluginId: 'brocante', appUrl: 'http://localhost:9876' });
  hosts.push(host);
  plugin(host.bb);
  expect((await host.harness.behavior.fetchHttp('GET', '/snapshot')).status).toBe(404);
  const paths: string[] = [];
  for (let index = 0; index < 11; index++) {
    const result = await host.harness.behavior.runCli(['report', '--demo']);
    expect(result.exitCode).toBe(0);
    paths.push(`/snapshot${new URL(result.stdout!.match(/Portable 3D market: (\S+)/)![1]).search}`);
  }
  expect((await host.harness.behavior.fetchHttp('GET', paths[0])).status).toBe(404);
  expect((await host.harness.behavior.fetchHttp('GET', paths[10])).status).toBe(200);
});

it('captures previews over RPC, exposes only metadata, and validates inputs before fetching', async () => {
  const host = createFakePluginHost({ pluginId: 'brocante' });
  hosts.push(host);
  plugin(host.bb);
  const captured = await host.harness.behavior.callRpc('capture', { demo: true });
  expect(captured).toMatchObject({ repository: 'weekend/brocante' });
  const listed = await host.harness.behavior.callRpc('listSnapshots');
  expect(listed).toMatchObject({ configured: false, snapshots: [captured] });
  expect(JSON.stringify(listed)).not.toMatch(/githubToken|<script|pullRequests/);
  await expect(
    host.harness.behavior.callRpc('capture', { repository: 'team/repo' }),
  ).rejects.toThrow('gh auth login on the bb server');
  await expect(
    host.harness.behavior.callRpc('capture', { demo: true, maxPages: 101 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('enables capture with an existing gh login without returning its credential over RPC', async () => {
  const host = createFakePluginHost({ pluginId: 'brocante' });
  hosts.push(host);
  plugin(host.bb);
  vi.mocked(resolveGitHubToken).mockResolvedValueOnce('existing-gh-secret');
  const listed = await host.harness.behavior.callRpc('listSnapshots');
  expect(listed).toEqual({ configured: true, snapshots: [] });
  expect(JSON.stringify(listed)).not.toContain('existing-gh-secret');
});
