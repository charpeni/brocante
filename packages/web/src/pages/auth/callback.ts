import type { APIRoute } from 'astro';
import { appEnv } from '../../lib/env';
import {
  appOrigin,
  loginValue,
  unseal,
  seal,
  sessionCookie,
  loginCookie,
  redirect,
} from '../../lib/auth';
import { github } from '../../lib/github';
import { returnMarketPath } from '../../lib/auth-location';

export const GET: APIRoute = async ({ request, url }) => {
  const env = appEnv();
  let validated = false;
  let returnTo = '/';
  try {
    const stored = loginValue(request),
      code = url.searchParams.get('code');
    if (!stored) throw new Error('Missing login transaction.');
    const payload = await unseal(env, 'login', stored);
    if (
      typeof payload.state !== 'string' ||
      payload.state !== url.searchParams.get('state') ||
      typeof payload.verifier !== 'string'
    )
      throw new Error('Invalid login state.');
    validated = true;
    returnTo = returnMarketPath(payload.returnTo);
    if (!code || url.searchParams.has('error')) throw new Error('Incomplete login.');
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier: payload.verifier,
        redirect_uri: `${appOrigin(env)}/auth/callback`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const token = (await response.json()) as { access_token?: string; expires_in?: number };
    if (
      !response.ok ||
      !token.access_token ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in! <= 0
    )
      throw new Error('An expiring access token is required.');
    const userResponse = await github(token.access_token, '/user');
    const user = (await userResponse.json()) as { login?: string };
    if (!user.login) throw new Error('Unable to identify GitHub user.');
    const seconds = Math.min(28_800, Math.floor(token.expires_in!));
    const encrypted = await seal(
      env,
      'session',
      { accessToken: token.access_token, login: user.login },
      seconds,
    );
    return redirect(returnTo, [sessionCookie(env, encrypted, seconds), loginCookie(env, '', 0)]);
  } catch {
    const destination = new URL(returnTo, 'https://brocante.invalid');
    destination.searchParams.set('auth_error', 'login');
    return redirect(
      destination.pathname + destination.search,
      validated ? [loginCookie(env, '', 0)] : [],
    );
  }
};
