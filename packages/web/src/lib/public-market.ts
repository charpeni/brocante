import { GitHubError, loadMarket } from './github';
import type { MarketData } from './market';

const publicLimitMessage =
  'The shared public GitHub allowance has reached its limit. Wait for the retry countdown, or sign in to use your own access.';

// Each Worker isolate shares its cooldown and concurrent requests across anonymous
// visitors. No PR data is cached after a request, and signed-in users bypass this gate.
export function createPublicMarketLoader(load = loadMarket) {
  let current:
    | {
        token: string;
        retryAt: number;
        inFlight: Map<string, Promise<MarketData>>;
      }
    | undefined;
  return async (
    token: string,
    owner: string,
    repo: string,
    cursor: string | null,
    search: string,
  ) => {
    // @me would otherwise refer to the deployment token's owner, not the visitor.
    if (/@me\b/i.test(search))
      throw new GitHubError('Sign in with GitHub to use personal searches such as @me.', 400);
    if (current?.token !== token) current = { token, retryAt: 0, inFlight: new Map() };
    const state = current;
    if (state.retryAt > Date.now())
      throw new GitHubError(
        publicLimitMessage,
        429,
        Math.ceil((state.retryAt - Date.now()) / 1000),
      );
    const key = JSON.stringify([owner.toLowerCase(), repo.toLowerCase(), cursor, search]);
    const existing = state.inFlight.get(key);
    if (existing) return existing;
    if (state.inFlight.size >= 4)
      throw new GitHubError('Public GitHub access is busy. Please retry shortly.', 503, 10);
    const pending = (async () => {
      try {
        const market = await load(token, owner, repo, cursor, undefined, search);
        // Fail closed even if an operator accidentally supplies a private-capable token.
        if (market.isPrivate !== false || market.visibility !== 'PUBLIC')
          throw new GitHubError('Sign in with GitHub to open private repositories.', 403);
        return market;
      } catch (error) {
        if (!(error instanceof GitHubError)) throw error;
        if (error.status === 429) {
          const delay = Number.isFinite(error.retryAfter)
            ? Math.max(60, error.retryAfter ?? 60)
            : 60;
          state.retryAt = Math.max(state.retryAt, Date.now() + delay * 1000);
          throw new GitHubError(
            publicLimitMessage,
            429,
            Math.ceil((state.retryAt - Date.now()) / 1000),
          );
        }
        if (error.status === 401)
          throw new GitHubError(
            'Public GitHub access is temporarily unavailable. Please sign in or try again later.',
            503,
            60,
          );
        if ([403, 404].includes(error.status))
          throw new GitHubError(
            'This repository is unavailable through public access. Check its name, or sign in if it is private.',
            403,
          );
        throw error;
      }
    })();
    state.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (state.inFlight.get(key) === pending) state.inFlight.delete(key);
    }
  };
}

export const loadPublicMarket = createPublicMarketLoader();
