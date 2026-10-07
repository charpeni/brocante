import { expect, it } from 'vitest';
import { returnMarketPath, signInPath } from './auth-location';

it('preserves repository/search routes, including reserved owners', () => {
  expect(returnMarketPath('/team/repo?q=label%3Abug&auth_error=login')).toBe(
    '/team/repo?q=label%3Abug',
  );
  expect(returnMarketPath('/r/auth/login?q=author%3Ame')).toBe('/r/auth/login?q=author%3Ame');
  expect(returnMarketPath('/?repo=team%2Frepo&q=label%3Abug')).toBe('/team/repo?q=label%3Abug');
  expect(signInPath('team/repo', 'label:bug')).toBe(
    '/auth/login?returnTo=%2Fteam%2Frepo%3Fq%3Dlabel%253Abug',
  );
});

it.each([
  undefined,
  null,
  42,
  'https://evil.example/a/b',
  '//evil.example',
  '/\\evil.example',
  '/team/repo\r\nLocation:evil',
  '/%broken',
  '/' + 'a'.repeat(2048),
])('falls back to the demo for unsafe or invalid return locations: %s', (value) => {
  expect(returnMarketPath(value)).toBe('/');
});
