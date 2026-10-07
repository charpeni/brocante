import { afterEach, expect, it, vi } from 'vitest';
import { createPublicMarketLoader } from './public-market';
import { GitHubError, type loadMarket } from './github';
import { demoMarket } from './demo';

afterEach(() => vi.useRealTimers());

it.each(['INTERNAL', undefined] as const)(
  'rejects non-public or missing visibility even with isPrivate false: %s',
  async (visibility) => {
    const load = vi
      .fn<typeof loadMarket>()
      .mockResolvedValue({ ...demoMarket(), isPrivate: false, visibility });
    await expect(
      createPublicMarketLoader(load)('token', 'owner', 'repo', null, ''),
    ).rejects.toMatchObject({ status: 403 });
  },
);

it.each([true, undefined])(
  'fails closed on private or missing visibility: %s',
  async (isPrivate) => {
    const load = vi
      .fn<typeof loadMarket>()
      .mockResolvedValue({ ...demoMarket(), isPrivate: isPrivate as boolean });
    await expect(
      createPublicMarketLoader(load)('token', 'owner', 'repo', null, ''),
    ).rejects.toMatchObject({ status: 403 });
  },
);

it('does not run personal searches under the deployment identity', async () => {
  const load = vi.fn<typeof loadMarket>();
  await expect(
    createPublicMarketLoader(load)('token', 'owner', 'repo', null, 'author:@me'),
  ).rejects.toMatchObject({ status: 400 });
  expect(load).not.toHaveBeenCalled();
});

it('shares the rate-limit cooldown across repositories and clients, then recovers', async () => {
  vi.useFakeTimers();
  const load = vi
    .fn<typeof loadMarket>()
    .mockRejectedValueOnce(new GitHubError('Limit', 429, 180))
    .mockResolvedValue(demoMarket());
  const publicMarket = createPublicMarketLoader(load);
  await expect(publicMarket('token', 'a', 'b', null, '')).rejects.toMatchObject({
    status: 429,
    retryAfter: 180,
  });
  vi.advanceTimersByTime(30_000);
  await expect(publicMarket('token', 'c', 'd', null, '')).rejects.toMatchObject({
    status: 429,
    retryAfter: 150,
  });
  expect(load).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(150_000);
  await expect(publicMarket('token', 'c', 'd', null, '')).resolves.toMatchObject({
    isPrivate: false,
  });
  expect(load).toHaveBeenCalledTimes(2);
});

it('deduplicates simultaneous identical reads, but does not retain public data after completion', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof demoMarket>>();
  const load = vi
    .fn<typeof loadMarket>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue(demoMarket());
  const publicMarket = createPublicMarketLoader(load);
  const first = publicMarket('token', 'a', 'b', null, '');
  const second = publicMarket('token', 'a', 'b', null, '');
  expect(load).toHaveBeenCalledTimes(1);
  pending.resolve(demoMarket());
  await Promise.all([first, second]);
  await publicMarket('token', 'a', 'b', null, '');
  expect(load).toHaveBeenCalledTimes(2);
});

it('keeps a newer cooldown when an earlier concurrent request succeeds', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof demoMarket>>();
  const load = vi
    .fn<typeof loadMarket>()
    .mockReturnValueOnce(pending.promise)
    .mockRejectedValueOnce(new GitHubError('Limit', 429, 120));
  const publicMarket = createPublicMarketLoader(load);
  const success = publicMarket('token', 'a', 'b', null, '');
  await expect(publicMarket('token', 'c', 'd', null, '')).rejects.toMatchObject({ status: 429 });
  pending.resolve(demoMarket());
  await success;
  await expect(publicMarket('token', 'a', 'b', null, '')).rejects.toMatchObject({ status: 429 });
  expect(load).toHaveBeenCalledTimes(2);
});

it('limits concurrent public requests and reports bad service credentials without a user 401', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof demoMarket>>();
  const load = vi.fn<typeof loadMarket>().mockReturnValue(pending.promise);
  const publicMarket = createPublicMarketLoader(load);
  const requests = Array.from({ length: 4 }, (_, i) =>
    publicMarket('token', 'a', `repo${i}`, null, ''),
  );
  await expect(publicMarket('token', 'a', 'fifth', null, '')).rejects.toMatchObject({
    status: 503,
  });
  pending.resolve(demoMarket());
  await Promise.all(requests);
  load.mockRejectedValue(new GitHubError('Bad credentials', 401));
  await expect(publicMarket('replacement-token', 'a', 'b', null, '')).rejects.toMatchObject({
    status: 503,
    retryAfter: 60,
  });
});
