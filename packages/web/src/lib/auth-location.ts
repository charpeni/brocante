import { marketLocation, marketPath } from './market-location';
import { MAX_SEARCH_LENGTH } from './market-search';

/** Rebuild only marketplace paths; never redirect to caller-provided origins or endpoints. */
export function returnMarketPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return '/';
  const { repository, search } = marketLocation(new URL(value, 'https://brocante.invalid'));
  return marketPath(repository, search.length <= MAX_SEARCH_LENGTH ? search : '');
}

export function signInPath(repository: string, search = ''): string {
  const returnTo = marketPath(repository, search);
  return returnTo === '/' ? '/auth/login' : `/auth/login?${new URLSearchParams({ returnTo })}`;
}
