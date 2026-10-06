import { parseRepository } from './market';

export function marketLocation(url: URL) {
  let path = '';
  try {
    path = decodeURIComponent(url.pathname).replace(/^\/|\/$/g, '');
  } catch {
    // A malformed URL must not become a repository API request.
  }
  if (path.startsWith('r/') && path.split('/').length === 3) path = path.slice(2);
  const parsed = parseRepository(path || url.searchParams.get('repo') || '');
  return {
    repository: parsed ? `${parsed.owner}/${parsed.repo}` : '',
    search: url.searchParams.get('q') ?? '',
  };
}

export function marketPath(repository: string, search = '') {
  const parsed = parseRepository(repository);
  const path = parsed
    ? `${['api', 'auth', 'brand', 'r'].includes(parsed.owner.toLowerCase()) ? '/r' : ''}/${parsed.owner}/${parsed.repo}`
    : '/';
  return search ? `${path}?${new URLSearchParams({ q: search })}` : path;
}
