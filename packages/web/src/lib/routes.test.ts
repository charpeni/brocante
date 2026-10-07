import { afterEach, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import { seal, unseal, challenge, session as readSession } from './auth';
import { GET as login } from '../pages/auth/login';
import { GET as callback } from '../pages/auth/callback';
import { GET as market } from '../pages/api/market';
import { GET as session } from '../pages/api/session';
import { GitHubError, loadMarket, github } from './github';
import { demoMarket } from './demo';

const env = {
  APP_URL: 'https://market.example',
  SESSION_KEY: btoa('0123456789abcdef0123456789abcdef'),
  GITHUB_CLIENT_ID: 'test',
  GITHUB_CLIENT_SECRET: 'test',
  GITHUB_PUBLIC_TOKEN: undefined as string | undefined,
};

vi.mock('./env', () => ({ appEnv: () => env }));

vi.mock('./github', async (original) => ({
  ...(await original<typeof import('./github')>()),
  loadMarket: vi.fn(),
  github: vi.fn(),
}));

afterEach(() => {
  env.GITHUB_PUBLIC_TOKEN = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('advertises public access without returning the server credential', async () => {
  env.GITHUB_PUBLIC_TOKEN = 'public-session-secret';
  const response = await session(context('/api/session', ''));
  expect(await response.json()).toEqual({
    configured: true,
    publicAccess: true,
    login: null,
    installUrl: null,
  });
  expect(github).not.toHaveBeenCalled();
});

it('requires sign-in when no public token is configured', async () => {
  const response = await market(context('/api/market?repo=a/b', ''));
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(loadMarket).not.toHaveBeenCalled();
});

it('loads public repositories without signing in and prefers a signed-in user token', async () => {
  env.GITHUB_PUBLIC_TOKEN = 'public-route-secret';
  vi.mocked(loadMarket).mockResolvedValue(demoMarket());
  const response = await market(context('/api/market?repo=a/b', ''));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).not.toContain(env.GITHUB_PUBLIC_TOKEN);
  expect(loadMarket).toHaveBeenLastCalledWith(
    env.GITHUB_PUBLIC_TOKEN,
    'a',
    'b',
    null,
    undefined,
    '',
  );
  const token = await seal(env, 'session', { accessToken: 'user-secret', login: 'mina' }, 60);
  await market(context('/api/market?repo=a/b', `market_session=${token}`));
  expect(loadMarket).toHaveBeenLastCalledWith('user-secret', 'a', 'b', null, undefined, '');
});

it('never exposes a private response to an anonymous visitor', async () => {
  env.GITHUB_PUBLIC_TOKEN = 'private-capable-test-token';
  vi.mocked(loadMarket).mockResolvedValue({
    ...demoMarket(),
    isPrivate: true,
    repository: 'private/sentinel',
  });
  const response = await market(context('/api/market?repo=a/b', ''));
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain('private/sentinel');
});

it('forwards public rate limits and stops subsequent anonymous upstream requests', async () => {
  env.GITHUB_PUBLIC_TOKEN = 'rate-limited-public-token';
  vi.mocked(loadMarket).mockRejectedValue(new GitHubError('Limit', 429, 180));
  for (const repo of ['a/b', 'c/d']) {
    const response = await market(context(`/api/market?repo=${repo}`, ''));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(175);
    expect(response.headers.get('set-cookie')).toBeNull();
  }
  expect(loadMarket).toHaveBeenCalledTimes(1);
});

function context(path: string, cookies: string) {
  const url = new URL(path, env.APP_URL);
  return { url, request: new Request(url, { headers: { cookie: cookies } }) } as APIContext;
}

it('starts login on the configured origin before creating a transaction cookie', async () => {
  const response = await login(context('http://192.168.4.244:4321/auth/login', ''));
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('https://market.example/auth/login');
  expect(response.headers.get('set-cookie')).toBeNull();
});

it.each(['/', '/team/repo?q=label%3Abug', '/r/auth/login?q=author%3Amina'])(
  'completes GitHub App login with state, PKCE, and returns to %s',
  async (returnTo) => {
    const start = await login(context(`/auth/login?${new URLSearchParams({ returnTo })}`, ''));
    const authorize = new URL(start.headers.get('location')!);
    const loginCookie = start.headers.get('set-cookie')!.split(';')[0];
    const transaction = await unseal(env, 'login', loginCookie.slice('market_login='.length));
    expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(authorize.searchParams.get('client_id')).toBe(env.GITHUB_CLIENT_ID);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${env.APP_URL}/auth/callback`);
    expect(authorize.searchParams.get('state')).toBe(transaction.state);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toBe(
      await challenge(transaction.verifier as string),
    );
    expect(start.headers.get('set-cookie')).toContain(
      'HttpOnly; SameSite=Lax; Max-Age=600; Secure',
    );
    const exchange = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'github-user-token',
        expires_in: 86_400,
        refresh_token: 'discard',
      }),
    );
    vi.stubGlobal('fetch', exchange);
    vi.mocked(github).mockResolvedValue(Response.json({ login: 'mina' }));
    const finish = await callback(
      context(`/auth/callback?code=github-code&state=${transaction.state}`, loginCookie),
    );
    expect(exchange.mock.calls[0][0]).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(exchange.mock.calls[0][1].body)).toEqual({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: 'github-code',
      code_verifier: transaction.verifier,
      redirect_uri: `${env.APP_URL}/auth/callback`,
    });
    expect(github).toHaveBeenCalledWith('github-user-token', '/user');
    expect(finish.status).toBe(302);
    expect(finish.headers.get('location')).toBe(returnTo);
    const cookies = finish.headers.getSetCookie();
    const authenticated = cookies.find((cookie) => cookie.startsWith('market_session='))!;
    expect(authenticated).toContain('Max-Age=28800; Secure');
    expect(authenticated).not.toContain('github-user-token');
    expect(
      cookies.some((cookie) => cookie.startsWith('market_login=;') && cookie.includes('Max-Age=0')),
    ).toBe(true);
    expect(
      await readSession(
        new Request(env.APP_URL, {
          headers: { cookie: authenticated.split(';')[0] },
        }),
        env,
      ),
    ).toEqual({ accessToken: 'github-user-token', login: 'mina' });
    const payload = await unseal(
      env,
      'session',
      authenticated.split(';')[0].slice('market_session='.length),
    );
    expect(payload).not.toHaveProperty('refresh_token');
  },
);

it('preserves a safe return location when switching to the canonical origin', async () => {
  const params = new URLSearchParams({ returnTo: '/team/repo?q=label%3Abug' });
  const response = await login(context(`http://192.168.4.244:4321/auth/login?${params}`, ''));
  expect(response.headers.get('location')).toBe(`https://market.example/auth/login?${params}`);
  expect(response.headers.get('set-cookie')).toBeNull();
});

it('does not store an external redirect destination in the login transaction', async () => {
  const start = await login(context('/auth/login?returnTo=https%3A%2F%2Fevil.example', ''));
  const cookie = start.headers.get('set-cookie')!.split(';')[0];
  const transaction = await unseal(env, 'login', cookie.slice('market_login='.length));
  expect(transaction.returnTo).toBe('/');
});

it.each(['?error=access_denied', '?code=code&state=wrong', ''])(
  'preserves existing cookies on unvalidated callback %s',
  async (query) => {
    const login = await seal(
      env,
      'login',
      { state: 'expected', verifier: 'verifier', returnTo: '/team/repo?q=label%3Abug' },
      60,
    );
    const response = await callback(
      context('/auth/callback' + query, `market_session=existing; market_login=${login}`),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/?auth_error=login');
    expect(response.headers.get('set-cookie')).toBeNull();
  },
);

it.each(['error=access_denied', 'code=bad-code'])(
  'clears only a validated login transaction on failed OAuth %s',
  async (query) => {
    const login = await seal(
      env,
      'login',
      { state: 'expected', verifier: 'verifier', returnTo: '/team/repo?q=label%3Abug' },
      60,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    const response = await callback(
      context(
        `/auth/callback?state=expected&${query}`,
        `market_session=existing; market_login=${login}`,
      ),
    );
    expect(response.headers.get('set-cookie')).toContain('market_login=;');
    expect(response.headers.get('location')).toBe('/team/repo?q=label%3Abug&auth_error=login');
    expect(response.headers.get('set-cookie')).not.toContain('market_session');
  },
);

it('forwards sanitized retry timing through the market and session routes', async () => {
  const token = await seal(env, 'session', { accessToken: 'secret', login: 'mina' }, 60);
  const error = new GitHubError('Wait before refreshing.', 429, 180);
  vi.mocked(loadMarket).mockRejectedValue(error);
  vi.mocked(github).mockRejectedValue(error);
  for (const route of [market, session]) {
    const response = await route(context('/api/market?repo=a/b', `market_session=${token}`));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('180');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  }
});
