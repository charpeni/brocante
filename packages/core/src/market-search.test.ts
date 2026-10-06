import { expect, it } from 'vitest';
import { githubSearchQuery } from './market-search';
import { marketLocation, marketPath } from './market-location';

it('rejects backslash ambiguities before sending GitHub search', () => {
  expect(() => githubSearchQuery('o/r', String.raw`\" ( \" ) OR repo:x/y`)).toThrow(/backslashes/);
});
it.each(['api/market', 'auth/login', 'brand/logo', 'r/repo'])(
  'uses an unambiguous route for %s',
  (repo) => {
    const path = marketPath(repo, 'bug');
    expect(path).toBe(`/r/${repo}?q=bug`);
    expect(marketLocation(new URL(path, 'https://brocante.example')).repository).toBe(repo);
  },
);

it('groups GitHub search expressions within the active open-PR repository', () => {
  expect(githubSearchQuery('withastro/astro', 'label:bug OR author:@me')).toBe(
    '(repo:withastro/astro is:pr is:open) AND (label:bug OR author:@me)',
  );
  expect(githubSearchQuery('a/b', 'label:"help wanted" (review:required OR draft:true)')).toContain(
    '(label:"help wanted" (review:required OR draft:true))',
  );
});
it.each([
  ') OR repo:other/repo (',
  'label:"unclosed',
  '(label:bug',
  '(((((bug)))))',
  'x'.repeat(257),
])('rejects searches that could break grouping or exceed limits: %s', (query) =>
  expect(() => githubSearchQuery('a/b', query)).toThrow(),
);
it('builds and parses pretty URLs with shareable search terms', () => {
  const path = marketPath('withastro/astro', 'label:"help wanted"');
  expect(path).toBe('/withastro/astro?q=label%3A%22help+wanted%22');
  expect(marketLocation(new URL(path, 'https://brocante.example'))).toEqual({
    repository: 'withastro/astro',
    search: 'label:"help wanted"',
  });
  expect(
    marketLocation(new URL('https://brocante.example/?repo=withastro%2Fastro&q=bug')).repository,
  ).toBe('withastro/astro');
  expect(marketLocation(new URL('https://brocante.example/a/b?repo=other/repo')).repository).toBe(
    'a/b',
  );
  expect(marketLocation(new URL('https://brocante.example/%zz/repo')).repository).toBe('');
  expect(marketPath('//evil.example')).toBe('/');
});
