import { EncryptJWT, jwtDecrypt, base64url } from 'jose';

export interface AppEnv {
  APP_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_PUBLIC_TOKEN?: string;
  SESSION_KEY?: string;
}

export interface Session {
  accessToken: string;
  login: string;
}

const SESSION = 'market_session';
const LOGIN = 'market_login';

export function configured(env: AppEnv) {
  return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_KEY && env.APP_URL);
}

export function appOrigin(env: AppEnv) {
  const url = new URL(env.APP_URL ?? 'http://localhost:4321');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('APP_URL must use HTTPS outside localhost.');
  return url.origin;
}

function key(env: AppEnv) {
  if (!env.SESSION_KEY) throw new Error('Authentication is not configured.');
  const decoded = Uint8Array.from(atob(env.SESSION_KEY), (c) => c.charCodeAt(0));
  if (decoded.length !== 32) throw new Error('SESSION_KEY must contain 32 bytes.');
  return decoded;
}

export async function seal(
  env: AppEnv,
  purpose: string,
  data: Record<string, unknown>,
  seconds: number,
) {
  return new EncryptJWT(data)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(appOrigin(env))
    .setAudience(purpose)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .encrypt(key(env));
}

export async function unseal(env: AppEnv, purpose: string, value: string) {
  const result = await jwtDecrypt(value, key(env), {
    issuer: appOrigin(env),
    audience: purpose,
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  return result.payload;
}

export function readCookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='))
    ?.slice(name.length + 1);
}

export function cookie(env: AppEnv, name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${appOrigin(env).startsWith('https:') ? '; Secure' : ''}`;
}

export async function session(request: Request, env: AppEnv): Promise<Session | null> {
  const value = readCookie(request, SESSION);
  if (!value) return null;
  try {
    const payload = await unseal(env, 'session', value);
    if (typeof payload.accessToken !== 'string' || typeof payload.login !== 'string') return null;
    return { accessToken: payload.accessToken, login: payload.login };
  } catch {
    return null;
  }
}

export const sessionCookie = (env: AppEnv, value: string, seconds: number) =>
  cookie(env, SESSION, value, seconds);

export const loginCookie = (env: AppEnv, value: string, seconds: number) =>
  cookie(env, LOGIN, value, seconds);

export const loginValue = (request: Request) => readCookie(request, LOGIN);

export function randomValue() {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challenge(verifier: string) {
  return base64url.encode(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
}

export function json(data: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}

export function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}
