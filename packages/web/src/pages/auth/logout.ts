import type { APIRoute } from 'astro';
import { appEnv } from '../../lib/env';
import { appOrigin, sessionCookie, loginCookie, redirect, json } from '../../lib/auth';
export const POST: APIRoute = ({ request }) => {
  const env = appEnv();
  if (request.headers.get('origin') !== appOrigin(env))
    return json({ error: 'Invalid request origin.' }, 403);
  return redirect('/', [sessionCookie(env, '', 0), loginCookie(env, '', 0)]);
};
