import type { APIRoute } from 'astro';
import { appEnv } from '../../lib/env';
import { configured, session, json, sessionCookie } from '../../lib/auth';
import { github, GitHubError } from '../../lib/github';
export const GET: APIRoute = async ({ request }) => {
  const env = appEnv();
  const info = {
    configured: configured(env),
    publicAccess: !!env.GITHUB_PUBLIC_TOKEN?.trim(),
    installUrl:
      env.GITHUB_APP_SLUG && /^[a-z0-9-]+$/.test(env.GITHUB_APP_SLUG)
        ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
        : null,
  };
  const current = await session(request, env);
  if (!current) return json({ ...info, login: null });
  try {
    await github(current.accessToken, '/user');
    return json({ ...info, login: current.login });
  } catch (error) {
    if (error instanceof GitHubError && error.status === 401)
      return json({ ...info, login: null }, 200, { 'Set-Cookie': sessionCookie(env, '', 0) });
    return json(
      { ...info, error: 'Unable to verify your GitHub session. Please retry.' },
      error instanceof GitHubError && error.status === 429 ? 429 : 503,
      { 'Retry-After': String(error instanceof GitHubError ? (error.retryAfter ?? 60) : 60) },
    );
  }
};
