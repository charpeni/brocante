import { afterEach, expect, it, vi } from 'vitest';
import { CooldownError, createApiClient } from './client-api';
import { retryAfterMs } from './retry';
afterEach(() => vi.useRealTimers());
it('blocks every request path until Retry-After, then allows recovery', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response('{"error":"Wait"}', { status: 429, headers: { 'Retry-After': '180' } }),
    )
    .mockResolvedValue(new Response('{"ok":true}'));
  const api = createApiClient(fetcher),
    signal = new AbortController().signal;
  await expect(api.request('/api/market?repo=a/b', signal)).rejects.toMatchObject({ status: 429 });
  expect(api.canRequest()).toBe(false);
  expect(api.getRetryAt() - Date.now()).toBe(180_000);
  vi.advanceTimersByTime(120_000);
  for (const path of ['/api/session', '/api/market?repo=c/d', '/api/market?repo=a/b'])
    await expect(api.request(path, signal)).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60_000);
  expect(api.canRequest()).toBe(true);
  await expect(api.request('/api/market?repo=a/b', signal)).resolves.toEqual({ ok: true });
  expect(api.getRetryAt()).toBe(0);
});
it('backs off repeated outages and resets after a successful response', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response('{}', { status: 503 }));
  const api = createApiClient(fetcher),
    signal = new AbortController().signal;
  await expect(api.request('/api/session', signal)).rejects.toMatchObject({ status: 503 });
  vi.advanceTimersByTime(60_000);
  await expect(api.request('/api/session', signal)).rejects.toMatchObject({ status: 503 });
  expect(api.getRetryAt() - Date.now()).toBe(120_000);
  vi.advanceTimersByTime(120_000);
  fetcher.mockResolvedValueOnce(new Response('{}'));
  await api.request('/api/session', signal);
  expect(api.getRetryAt()).toBe(0);
});
it('supports HTTP-date retry headers and ignores malformed values', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  expect(retryAfterMs('Sun, 04 Oct 2026 12:02:00 GMT', now)).toBe(120_000);
  expect(retryAfterMs('bad', now)).toBe(0);
  expect(retryAfterMs('-1', now)).toBe(0);
});

it('keeps a newer rate limit when a concurrent request succeeds', async () => {
  const first = Promise.withResolvers<Response>(),
    second = Promise.withResolvers<Response>();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const api = createApiClient(fetcher),
    signal = new AbortController().signal;
  const market = api.request('/api/market?repo=a/b', signal);
  const session = api.request('/api/session', signal);
  first.resolve(new Response('{}', { status: 429, headers: { 'Retry-After': '180' } }));
  await expect(market).rejects.toMatchObject({ status: 429 });
  second.resolve(new Response('{}'));
  await session;
  expect(api.canRequest()).toBe(false);
  await expect(api.request('/api/market?repo=c/d', signal)).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('honors retry headers on non-JSON proxy errors', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response('<h1>Wait</h1>', { status: 429, headers: { 'Retry-After': '180' } }),
    );
  const api = createApiClient(fetcher);
  await expect(api.request('/api/session', new AbortController().signal)).rejects.toMatchObject({
    status: 429,
  });
  expect(api.getRetryAt() - Date.now()).toBe(180_000);
});

it('notifies every subscriber when a shared cooldown begins and expires', async () => {
  vi.useFakeTimers();
  const api = createApiClient(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '180' } })),
  );
  const snapshots: number[] = [];
  const unsubscribe = api.subscribe(() => snapshots.push(api.getRetryAt()));
  await expect(api.request('/api/session', new AbortController().signal)).rejects.toMatchObject({
    status: 429,
  });
  expect(snapshots.at(-1)).toBe(Date.now() + 180_000);
  vi.advanceTimersByTime(179_999);
  expect(api.getRetryAt()).toBeGreaterThan(0);
  vi.advanceTimersByTime(1);
  expect(snapshots.at(-1)).toBe(0);
  expect(api.canRequest()).toBe(true);
  unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not fire an overflowing timer early for a long Retry-After', async () => {
  vi.useFakeTimers();
  const api = createApiClient(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{}', { status: 429, headers: { 'Retry-After': '3000000' } }),
      ),
  );
  const unsubscribe = api.subscribe(() => {});
  await expect(api.request('/api/session', new AbortController().signal)).rejects.toMatchObject({
    status: 429,
  });
  vi.advanceTimersByTime(2_147_483_647);
  expect(api.canRequest()).toBe(false);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(3_000_000_000 - 2_147_483_647);
  expect(api.getRetryAt()).toBe(0);
  unsubscribe();
});

it('uses neutral wording for locally paused requests and preserves the shared deadline', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('{"error":"Unable to verify your GitHub session."}', {
      status: 503,
      headers: { 'Retry-After': '120' },
    }),
  );
  const api = createApiClient(fetcher),
    signal = new AbortController().signal;
  await expect(api.request('/api/session', signal)).rejects.toThrow(
    'Unable to verify your GitHub session.',
  );
  const request = api.request('/api/market?repo=other/repo', signal);
  await expect(request).rejects.toBeInstanceOf(CooldownError);
  await expect(request).rejects.toMatchObject({
    message: 'GitHub requests are paused. Please wait before trying again.',
    status: 503,
    retryAt: Date.now() + 120_000,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps a concurrent response’s own error text without shortening an existing cooldown', async () => {
  vi.useFakeTimers();
  const first = Promise.withResolvers<Response>(),
    second = Promise.withResolvers<Response>();
  const api = createApiClient(
    vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
  );
  const signal = new AbortController().signal;
  const session = api.request('/api/session', signal),
    market = api.request('/api/market?repo=o/r', signal);
  first.resolve(
    new Response('{"error":"Session limit"}', { status: 429, headers: { 'Retry-After': '180' } }),
  );
  await expect(session).rejects.toMatchObject({ status: 429 });
  second.resolve(new Response('{"error":"Market unavailable"}', { status: 503 }));
  await expect(market).rejects.toMatchObject({
    message: 'Market unavailable',
    status: 503,
    retryAt: Date.now() + 180_000,
  });
  expect(api.getRetryAt()).toBe(Date.now() + 180_000);
});
