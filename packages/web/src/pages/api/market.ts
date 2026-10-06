import type { APIRoute } from 'astro';
import { appEnv } from '../../lib/env';
import { session, json, sessionCookie } from '../../lib/auth';
import { parseRepository } from '../../lib/market';
import { GitHubError, loadMarket } from '../../lib/github';
import { loadPublicMarket } from '../../lib/public-market';
export const GET: APIRoute = async ({ request, url }) => {
  const env = appEnv(),
    user = await session(request, env);
  const publicToken = env.GITHUB_PUBLIC_TOKEN?.trim();
  if (!user && !publicToken)
    return json({ error: 'Sign in with GitHub to open a repository.' }, 401);
  const repo = parseRepository(url.searchParams.get('repo') ?? '');
  const cursor = url.searchParams.get('cursor');
  const search = url.searchParams.get('q')?.trim() ?? '';
  if (!repo || (cursor && cursor.length > 512))
    return json({ error: 'Enter a repository as owner/name or its GitHub URL.' }, 400);
  try {
    return json(
      user
        ? await loadMarket(user.accessToken, repo.owner, repo.repo, cursor, undefined, search)
        : await loadPublicMarket(publicToken!, repo.owner, repo.repo, cursor, search),
    );
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 502;
    const headers = new Headers();
    if (status === 401 && user) headers.set('Set-Cookie', sessionCookie(env, '', 0));
    if (error instanceof GitHubError && error.retryAfter)
      headers.set('Retry-After', String(error.retryAfter));
    return json(
      {
        error:
          error instanceof GitHubError
            ? error.message
            : 'Unable to reach GitHub. Please try again.',
      },
      status,
      headers,
    );
  }
};
