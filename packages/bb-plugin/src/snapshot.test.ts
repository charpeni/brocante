import { afterEach, expect, it } from 'vitest';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from './server';

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
  ]);
  const result = await host.harness.behavior.runCli(['report', '--demo']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout!.length).toBeLessThan(1024);
  const url = result.stdout!.match(/http:\/\/localhost:9876\/\S+/)![0];
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
    paths.push(
      `/snapshot${new URL(result.stdout!.match(/http:\/\/localhost:9876\/\S+/)![0]).search}`,
    );
  }
  expect((await host.harness.behavior.fetchHttp('GET', paths[0])).status).toBe(404);
  expect((await host.harness.behavior.fetchHttp('GET', paths[10])).status).toBe(200);
});
