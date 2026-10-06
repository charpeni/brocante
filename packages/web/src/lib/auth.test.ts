import { describe, expect, it } from 'vitest';
import {
  seal,
  unseal,
  session,
  readCookie,
  cookie,
  appOrigin,
  challenge,
  type AppEnv,
} from './auth';
const env: AppEnv = {
  APP_URL: 'https://market.example',
  SESSION_KEY: btoa('0123456789abcdef0123456789abcdef'),
};
describe('stateless encrypted authentication', () => {
  it('conceals a token and restores it only for the expected purpose', async () => {
    const value = await seal(
      env,
      'session',
      { accessToken: 'private-github-token', login: 'mina' },
      60,
    );
    expect(value).not.toContain('private-github-token');
    expect((await unseal(env, 'session', value)).login).toBe('mina');
    await expect(unseal(env, 'login', value)).rejects.toThrow();
  });
  it('rejects expired, tampered, or wrong-key cookies', async () => {
    const expired = await seal(env, 'session', { accessToken: 'x', login: 'a' }, -5);
    expect(
      await session(
        new Request(env.APP_URL!, { headers: { cookie: `market_session=${expired}` } }),
        env,
      ),
    ).toBeNull();
    const value = await seal(env, 'session', { accessToken: 'x', login: 'a' }, 60);
    const parts = value.split('.');
    parts[3] = (parts[3][0] === 'a' ? 'b' : 'a') + parts[3].slice(1);
    await expect(unseal(env, 'session', parts.join('.'))).rejects.toThrow();
    await expect(
      unseal({ ...env, SESSION_KEY: btoa('abcdef0123456789abcdef0123456789') }, 'session', value),
    ).rejects.toThrow();
  });
  it('rejects login payloads masquerading as sessions', async () => {
    const value = await seal(env, 'login', { accessToken: 'x', login: 'a' }, 60);
    expect(
      await session(
        new Request(env.APP_URL!, { headers: { cookie: `market_session=${value}` } }),
        env,
      ),
    ).toBeNull();
  });
  it('sets cookie protections and clears cookies with zero lifetime', () => {
    expect(cookie(env, 'market_session', 'value', 60)).toContain(
      'HttpOnly; SameSite=Lax; Max-Age=60; Secure',
    );
    expect(cookie(env, 'market_session', '', 0)).toContain('Max-Age=0');
    expect(
      readCookie(
        new Request(env.APP_URL!, { headers: { cookie: 'other=x; market_session=abc.def' } }),
        'market_session',
      ),
    ).toBe('abc.def');
  });
  it('rejects non-HTTPS deployment origins except loopback development', () => {
    expect(() => appOrigin({ APP_URL: 'http://untrusted.example' })).toThrow();
    expect(appOrigin({ APP_URL: 'http://localhost:4321' })).toBe('http://localhost:4321');
  });
  it('matches the RFC 7636 S256 test vector', async () => {
    expect(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
