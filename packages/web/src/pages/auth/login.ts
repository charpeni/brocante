import type { APIRoute } from 'astro';
import { appEnv } from '../../lib/env';
import { returnMarketPath } from '../../lib/auth-location';
import {
  appOrigin,
  configured,
  randomValue,
  challenge,
  seal,
  loginCookie,
  redirect,
} from '../../lib/auth';

export const GET: APIRoute = async ({ url: requestUrl }) => {
  const env = appEnv();
  if (!configured(env)) return redirect('/?auth_error=configuration');
  try {
    const origin = appOrigin(env);
    const returnTo = returnMarketPath(requestUrl.searchParams.get('returnTo'));
    // The transaction cookie must be set on the same host as the OAuth callback.
    if (requestUrl.origin !== origin) {
      const loginUrl = new URL('/auth/login', origin);
      if (returnTo !== '/') loginUrl.searchParams.set('returnTo', returnTo);
      return redirect(loginUrl.href);
    }
    const state = randomValue(),
      verifier = randomValue();
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', env.GITHUB_CLIENT_ID!);
    url.searchParams.set('redirect_uri', `${origin}/auth/callback`);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', await challenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    return redirect(url.href, [
      loginCookie(env, await seal(env, 'login', { state, verifier, returnTo }, 600), 600),
    ]);
  } catch {
    return redirect('/?auth_error=configuration');
  }
};
