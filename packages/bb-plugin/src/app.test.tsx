// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import app from './app';

const market = {
  id: '12345678-1234-4123-8123-123456789abc',
  repository: 'team/repo',
  createdAt: 1791388800000,
};
const slots: ReturnType<typeof renderSlot>[] = [];
afterEach(() => {
  for (const slot of slots.splice(0)) slot.lifecycle.unmount();
});

it('lists bb project repositories and captures the selected repository', async () => {
  const registration = (await loadPluginApp(app)).navPanels[0]!;
  const capturedMarket = { ...market, repository: 'team/web' };
  const capture = vi.fn().mockResolvedValue(capturedMarket);
  let saved = false;
  const projects = [
    { id: 'api', name: 'API', gitRemoteUrl: 'git@github.com:team/api.git' },
    { id: 'web', name: 'Website', gitRemoteUrl: 'https://github.com/team/web.git' },
    { id: 'local', name: 'Local only', gitRemoteUrl: null },
  ].map((project) => ({
    ...project,
    kind: 'standard' as const,
    createdAt: 1,
    updatedAt: 1,
    sources: [],
  }));
  const slot = renderSlot(
    registration,
    { subPath: '' },
    {
      pluginId: 'brocante',
      context: { projectId: 'api' },
      sdk: { projects: { list: async () => projects } },
      rpc: {
        listSnapshots: () => ({ configured: true, snapshots: saved ? [capturedMarket] : [] }),
        capture: async (input) => {
          const result = await capture(input);
          saved = true;
          return result;
        },
      },
    },
  );
  slots.push(slot);
  await waitFor(() =>
    expect(
      (slot.getByRole('combobox', { name: 'Project repository' }) as HTMLSelectElement).value,
    ).toBe('api'),
  );
  expect(slot.getByRole('option', { name: 'Website · team/web' })).toBeDefined();
  expect(slot.queryByRole('option', { name: /Local only/ })).toBeNull();
  fireEvent.change(slot.getByRole('combobox', { name: 'Project repository' }), {
    target: { value: 'web' },
  });
  fireEvent.click(slot.getByRole('button', { name: 'Capture market' }));
  await slot.findByTitle('Brocante market for team/web');
  expect(capture).toHaveBeenCalledWith({ repository: 'team/web' });
});

it('opens stored snapshots in a sandboxed preview and keeps the HTML download', async () => {
  const registration = (await loadPluginApp(app)).navPanels[0]!;
  const slot = renderSlot(
    registration,
    { subPath: market.id },
    {
      pluginId: 'brocante',
      sdk: { projects: { list: async () => [] } },
      rpc: { listSnapshots: () => ({ configured: false, snapshots: [market] }) },
    },
  );
  slots.push(slot);
  const frame = await slot.findByTitle('Brocante market for team/repo');
  expect(frame.getAttribute('src')).toBe(`/api/v1/plugins/brocante/http/preview?id=${market.id}`);
  expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  expect(slot.getByRole('link', { name: 'Download HTML' }).getAttribute('href')).toBe(
    `/api/v1/plugins/brocante/http/snapshot?id=${market.id}`,
  );
  expect((slot.getByRole('button', { name: 'Capture market' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('captures and opens a demo without credentials, and shows failures without removing the preview', async () => {
  const registration = (await loadPluginApp(app)).navPanels[0]!;
  const capture = vi.fn().mockResolvedValue(market);
  let saved = false;
  const slot = renderSlot(
    registration,
    { subPath: '' },
    {
      pluginId: 'brocante',
      sdk: { projects: { list: async () => [] } },
      rpc: {
        listSnapshots: () => ({ configured: false, snapshots: saved ? [market] : [] }),
        capture: async (input) => {
          const result = await capture(input);
          saved = true;
          return result;
        },
      },
    },
  );
  slots.push(slot);
  await slot.findByText('Your market in bb');
  fireEvent.click(slot.getByRole('button', { name: 'Load demo' }));
  await slot.findByTitle('Brocante market for team/repo');
  expect(capture).toHaveBeenCalledWith({ demo: true });
  expect(slot.inspection.navigateCalls).toContainEqual({
    method: 'toPluginPanel',
    path: 'market',
    options: { subPath: market.id },
  });
  capture.mockRejectedValue(new Error('GitHub request limit reached.'));
  await waitFor(() =>
    expect((slot.getByRole('button', { name: 'Load demo' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(slot.getByRole('button', { name: 'Load demo' }));
  expect(await slot.findByRole('alert')).toHaveProperty(
    'textContent',
    'GitHub request limit reached.',
  );
  expect(slot.getByTitle('Brocante market for team/repo')).toBeDefined();
});
