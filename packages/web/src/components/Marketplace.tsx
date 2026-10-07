import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from 'react';
import MarketCanvas from './MarketCanvas';
import RepositoryStats from './RepositoryStats';
import LoadingMarketIcon from './LoadingMarketIcon';
import PullRequestDescription from './PullRequestDescription';
import { demoMarket } from '../lib/demo';
import {
  ageText,
  isOpen,
  parseRepository,
  shopState,
  shopDoor,
  stateLabels,
  pullRequestDiff,
  type MarketData,
  type PullRequest,
  type ShopState,
} from '../lib/market';
import { ApiError, CooldownError, createApiClient } from '../lib/client-api';
import { marketLocation, marketPath } from '../lib/market-location';
import { MAX_SEARCH_LENGTH } from '../lib/market-search';
import { signInPath } from '../lib/auth-location';
import { currentSeason, type Season } from '../scene/landscape.js';

const buildSha = import.meta.env.PUBLIC_BUILD_SHA;

function BrocanteDefinition() {
  return (
    <p className="brocante-definition">
      <span className="definition-origin">noun · French</span>
      <span>A flea market selling second‑hand goods.</span>
    </p>
  );
}

function RetryCountdown({ retryAt }: { retryAt: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return `Retry in ${Math.max(1, Math.ceil((retryAt - now) / 1000))}s`;
}

function DiffStats({ pr }: { pr: PullRequest }) {
  const diff = pullRequestDiff(pr);
  if (!diff) return null;
  return (
    <p
      className="diff-stats"
      title="Shop size reflects changed lines and files, not review difficulty."
    >
      <span className="diff-added">+{diff.additions.toLocaleString('en-US')}</span>{' '}
      <span className="diff-deleted">−{diff.deletions.toLocaleString('en-US')}</span>
      {' · '}
      {diff.changedFiles.toLocaleString('en-US')} {diff.changedFiles === 1 ? 'file' : 'files'}
    </p>
  );
}

interface Session {
  configured: boolean;
  publicAccess?: boolean;
  login: string | null;
  installUrl: string | null;
}

interface MarketplaceProps {
  initialLocation: { repository: string; search: string };
  initialAuthError: string | null;
  logoSrc?: string;
  savedSnapshot?: { data: MarketData; complete: boolean; search: string; demo?: true };
}

// Keep the server render and first hydration render identical; demo dates and WebGL
// become visible only after the browser takes over the already-rendered shell.
const subscribeToHydration = () => () => {};

const rejectedSearch = (error: unknown) => error instanceof ApiError && error.status === 400;

function App({ initialLocation, initialAuthError, savedSnapshot, logoSrc }: MarketplaceProps) {
  const offline = !!savedSnapshot;
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const cache = useQueryClient();
  const [api] = useState(() => createApiClient());
  const retryAt = useSyncExternalStore(api.subscribe, api.getRetryAt, () => 0);
  const waiting = retryAt > 0;
  const [repository, setRepository] = useState(initialLocation.repository);
  const [input, setInput] = useState(repository);
  const [inputError, setInputError] = useState('');
  const [search, setSearch] = useState(initialLocation.search);
  const [searchInput, setSearchInput] = useState(initialLocation.search);
  const [searchOptions, setSearchOptions] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | ShopState>('all');
  const [view, setView] = useState<'market' | 'list'>('market');
  const [selected, setSelected] = useState<number | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [moving, setMoving] = useState(true);
  const [season, setSeason] = useState<Season>(currentSeason);
  const [editingRepository, setEditingRepository] = useState(false);
  const [expandedTitle, setExpandedTitle] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    data: MarketData;
    search: string;
    page: number;
  } | null>(null);
  const [demo] = useState(demoMarket);
  const heading = useRef<HTMLHeadingElement>(null);
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => api.request<Session>('/api/session', signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: api.canRequest,
    refetchOnReconnect: api.canRequest,
    enabled: !offline,
    initialData: offline
      ? { configured: false, publicAccess: true, login: null, installUrl: null }
      : undefined,
  });
  const access = session.data?.login
    ? `user:${session.data.login}`
    : session.data?.publicAccess
      ? 'public'
      : null;
  const canBrowse = access !== null;
  const marketKey = ['market', access, repository, search, cursors[page]];
  const live = useQuery<MarketData | null>({
    queryKey: marketKey,
    queryFn: async ({ signal }) => {
      try {
        return await api.request<MarketData>(
          `/api/market?repo=${encodeURIComponent(repository)}${search ? `&q=${encodeURIComponent(search)}` : ''}${cursors[page] ? `&cursor=${encodeURIComponent(cursors[page]!)}` : ''}`,
          signal,
        );
      } catch (error) {
        // Once access is denied, a later outage must never resurrect that snapshot.
        if (error instanceof ApiError && [401, 403].includes(error.status))
          cache.setQueryData<MarketData | null>(marketKey, null);
        throw error;
      }
    },
    enabled: !offline && !!repository && canBrowse,
    retry: false,
    gcTime: 0,
    staleTime: 30_000,
    refetchInterval: (query) => (waiting || rejectedSearch(query.state.error) ? false : 60_000),
    refetchOnWindowFocus: (query) => api.canRequest() && !rejectedSearch(query.state.error),
    refetchOnReconnect: (query) => api.canRequest() && !rejectedSearch(query.state.error),
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (live.error instanceof ApiError && [401, 403].includes(live.error.status)) {
      cache.removeQueries({ queryKey: ['market'], type: 'inactive' });
      if (live.error.status === 401) void cache.invalidateQueries({ queryKey: ['session'] });
    }
  }, [live.error, cache]);
  const retryable =
    live.error instanceof ApiError && (live.error.status === 429 || live.error.status >= 500);
  const { isFetching: marketFetching, refetch: refetchMarket } = live;
  const wasWaiting = useRef(false);
  useEffect(() => {
    const resumed = wasWaiting.current && !waiting;
    wasWaiting.current = waiting;
    if (resumed && repository && canBrowse && retryable && !marketFetching) void refetchMarket();
  }, [waiting, repository, canBrowse, retryable, marketFetching, refetchMarket]);
  const identity = JSON.stringify([access, repository]);
  const denied =
    live.data === null ||
    (live.error instanceof ApiError && [401, 403].includes(live.error.status));
  const canRetain = !offline && canBrowse && !!repository && !denied;
  if (snapshot && (!canRetain || snapshot.identity !== identity)) setSnapshot(null);
  if (
    canRetain &&
    live.data &&
    (snapshot?.identity !== identity ||
      snapshot.data !== live.data ||
      snapshot.search !== search ||
      snapshot.page !== page)
  )
    setSnapshot({ identity, data: live.data, search, page });
  const savedPage = useMemo(() => {
    if (!savedSnapshot) return undefined;
    const matches = savedSnapshot.data.pullRequests.filter((pr) =>
      `${pr.title} ${pr.author} ${pr.number} ${pr.labels.join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
    return {
      ...savedSnapshot.data,
      total: search ? matches.length : savedSnapshot.data.total,
      pullRequests: matches.slice(page * 60, (page + 1) * 60),
      nextCursor: (page + 1) * 60 < matches.length ? String(page + 1) : null,
    };
  }, [savedSnapshot, search, page]);
  const data =
    savedPage ??
    (repository
      ? canRetain
        ? (live.data ?? (snapshot?.identity === identity ? snapshot.data : undefined))
        : undefined
      : hydrated
        ? demo
        : undefined);
  const hasData = !!data;
  const showingPrevious = !offline && !!repository && !!data && !live.data;
  const signInUrl = signInPath(repository, search);
  // Each new deadline mounts a fresh clock, including the very first label.
  const retryLabel = waiting ? <RetryCountdown key={retryAt} retryAt={retryAt} /> : 'Try again';
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.application');
    const searchBar = document.querySelector('.market-search');
    const header = document.querySelector('.topbar');
    const footer = document.querySelector('.market-footer');
    const sidebar = document.querySelector('.sidebar');
    const measure = () => {
      root?.style.setProperty(
        '--scene-page-top',
        `${Math.max(0, (searchBar?.getBoundingClientRect().top ?? 0) + scrollY)}px`,
      );
      root?.style.setProperty(
        '--footer-height',
        `${footer?.getBoundingClientRect().height ?? 0}px`,
      );
      root?.style.setProperty(
        '--detail-top',
        `${Math.max(12, searchBar?.getBoundingClientRect().bottom ?? 0) + 12}px`,
      );
      root?.style.setProperty(
        '--detail-bottom',
        `${Math.max(12, footer ? innerHeight - footer.getBoundingClientRect().top + 12 : 12)}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const element of [searchBar, header, footer, sidebar])
      if (element) observer.observe(element);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [hasData, view]);
  const prs = useMemo(
    () => data?.pullRequests.filter((pr) => shopState(pr) !== null) ?? [],
    [data],
  );
  const matching = useMemo(
    () =>
      prs.filter((pr) => {
        const state = shopState(pr)!;
        return (
          (filter === 'all' || (filter === 'open' ? isOpen(state) : state === filter)) &&
          (!!repository ||
            `${pr.title} ${pr.author} ${pr.number} ${pr.labels.join(' ')}`
              .toLowerCase()
              .includes(search.toLowerCase()))
        );
      }),
    [prs, filter, search, repository],
  );
  const visibleIds = useMemo(() => new Set(matching.map((pr) => pr.number)), [matching]);
  const chosen = prs.find((pr) => pr.number === selected && visibleIds.has(pr.number));
  // Invalidate the stored selection as well as its rendered details. A later
  // response must not silently reopen a PR that disappeared or lost access.
  if (selected !== null && !chosen) setSelected(null);
  const opener = useRef<HTMLElement | null>(null);
  const previousSelection = useRef<number | undefined>(undefined);

  function openShop(id: number) {
    setExpandedTitle(false);
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement &&
      active.matches('.shop-row, .shop-sign') &&
      active.dataset.pr === String(id)
        ? active
        : null;
    setSelected(id);
  }

  const selectedNumber = chosen?.number;
  useEffect(() => {
    if (selectedNumber !== undefined) heading.current?.focus({ preventScroll: true });
    else if (
      previousSelection.current !== undefined &&
      (document.activeElement === document.body || document.activeElement?.closest('.detail'))
    ) {
      const candidates = [
        opener.current,
        document.querySelector<HTMLElement>(`.shop-row[data-pr="${previousSelection.current}"]`),
        document.querySelector<HTMLElement>('.shop-row'),
        document.getElementById('shop-list'),
        document.getElementById('repository'),
      ];
      candidates
        .find((node) => node?.isConnected && node.getClientRects().length && !node.hidden)
        ?.focus({ preventScroll: true });
    }
    previousSelection.current = selectedNumber;
  }, [selectedNumber]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (searchOptions) {
        setSearchOptions(false);
        document.querySelector<HTMLButtonElement>('.search-options-toggle')?.focus();
      } else setSelected(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOptions]);

  function switchRepository(value: string) {
    setEditingRepository(false);
    setRepository(value);
    setInput(value);
    setSelected(null);
    setPage(0);
    setCursors([null]);
    setSearch('');
    setSearchInput('');
    setFilter('all');
    if (!offline) window.history.pushState(null, '', marketPath(value));
    cache.removeQueries({ queryKey: ['market'], type: 'inactive' });
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseRepository(input);
    if (!parsed) {
      setInputError('Use owner/repository or a github.com repository URL.');
      return;
    }
    setInputError('');
    switchRepository(`${parsed.owner}/${parsed.repo}`);
  }

  function runSearch(value: string) {
    if (!offline && repository && (waiting || !canBrowse)) return;
    const query = value.trim();
    setSearchOptions(false);
    if (document.activeElement?.closest('.quick-searches'))
      document.getElementById('search')?.focus();
    setSearch(query);
    setSearchInput(query);
    setSelected(null);
    setPage(0);
    setCursors([null]);
    setFilter('all');
    const path = marketPath(repository, query);
    if (!offline && path !== window.location.pathname + window.location.search)
      window.history.pushState(null, '', path);
  }

  useEffect(() => {
    if (offline) return;
    const navigate = () => {
      const location = marketLocation(new URL(window.location.href));
      setRepository(location.repository);
      setInput(location.repository);
      setSearch(location.search);
      setSearchInput(location.search);
      setSelected(null);
      setPage(0);
      setCursors([null]);
      setFilter('all');
      setInputError('');
    };
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, [offline]);
  useEffect(() => {
    document.title = repository
      ? `${repository} · Brocante`
      : 'Brocante — a marketplace for pull requests';
  }, [repository]);
  const authError = offline
    ? null
    : hydrated
      ? new URLSearchParams(window.location.search).get('auth_error')
      : initialAuthError;
  const filters: ['all' | 'open' | ShopState, string][] = [
    ['all', 'The whole market'],
    ['open', 'Open for a review'],
    ['author', 'Changes requested'],
    ['draft', 'Still a draft'],
    ['ready', 'Approved'],
  ];
  return (
    <div className="application">
      <a className="skip-link" href="#shop-list">
        Skip to pull requests
      </a>
      <header className="topbar">
        <div className="brand-cluster">
          <a href={offline ? '#' : '/'} className="brand" aria-label="Brocante home">
            <img
              src={logoSrc ?? '/brand/brocante-logo.svg'}
              width="206"
              height="42"
              alt="Brocante"
            />
          </a>
          <BrocanteDefinition />
        </div>
        <div className="header-market">
          <div>
            {repository ? (
              <a
                className="repository-link"
                aria-label={data?.repository ?? repository}
                href={`https://github.com/${data?.repository ?? repository}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${data?.repository ?? repository} — Open repository on GitHub in a new tab`}
              >
                <strong>
                  <span className="repository-owner">
                    {(data?.repository ?? repository).split('/')[0]}
                  </span>
                  <span className="repository-separator">/</span>
                  <span className="repository-name">
                    {(data?.repository ?? repository).split('/')[1]}
                  </span>
                </strong>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M4 12 12 4M5 4h7v7" />
                </svg>
              </a>
            ) : (
              <strong>{data?.repository ?? 'Opening the market'}</strong>
            )}
            <span>
              {data?.isPrivate ? 'Private · ' : ''}
              {offline && repository
                ? 'Saved from GitHub'
                : repository
                  ? 'Live from GitHub'
                  : 'A fictional weekend bazaar'}
            </span>
          </div>
          {!offline && (
            <button
              className="change-repository"
              aria-expanded={editingRepository}
              aria-controls="repository-editor"
              onClick={() => setEditingRepository(!editingRepository)}
            >
              Change repository
            </button>
          )}
          <fieldset className="view-switch" aria-label="View">
            <button aria-pressed={view === 'market'} onClick={() => setView('market')}>
              <span aria-hidden="true">◇</span> Market
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <span aria-hidden="true">☷</span> List
            </button>
          </fieldset>
        </div>
        <div className="top-actions">
          {offline ? (
            <span className="public-access-label">Local snapshot</span>
          ) : session.data?.login || session.error ? (
            <>
              {session.data?.login && <span className="login-name">@{session.data.login}</span>}
              <form method="post" action="/auth/logout">
                <button>Sign out</button>
              </form>
            </>
          ) : session.data?.publicAccess && !session.data.configured ? (
            <span className="public-access-label">Public browsing</span>
          ) : (
            <a
              className="button primary"
              href={signInUrl}
              aria-disabled={!session.data?.configured}
              onClick={(event) => {
                if (!session.data?.configured) event.preventDefault();
              }}
            >
              {session.error
                ? 'GitHub sign-in unavailable'
                : session.isPending
                  ? 'Checking GitHub sign-in…'
                  : session.data?.configured
                    ? 'Sign in with GitHub ↗'
                    : 'GitHub not connected'}
            </a>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Marketplace filters">
          <div className="sidebar-definition">
            <BrocanteDefinition />
          </div>
          <div className="sidebar-title">
            <h1 className="sidebar-purpose">A marketplace for pull requests</h1>
          </div>
          <div
            id="repository-editor"
            className={`repository-editor ${editingRepository ? 'is-editing' : ''}`}
          >
            {offline ? (
              <div className="repo-caption">
                Saved {new Date(savedSnapshot.data.fetchedAt).toLocaleString()}.
                {savedSnapshot.search && <p>Captured with: {savedSnapshot.search}</p>}
                <p>
                  Explore this snapshot offline. Generate a new one to update its pull requests.
                </p>
              </div>
            ) : (
              <>
                <form onSubmit={submit} className="repo-form">
                  <label htmlFor="repository">Your repository</label>
                  <div className="input-group">
                    <input
                      id="repository"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="owner / repository"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="submit" aria-label="Open repository">
                      ↗
                    </button>
                  </div>
                  {inputError && (
                    <p className="error-text" role="alert">
                      {inputError}
                    </p>
                  )}
                </form>
                <div className="repo-caption">
                  {session.data?.publicAccess &&
                    'Public repositories are available without signing in. '}
                  Private repositories need a GitHub App installation and your access.
                  {session.data?.installUrl && (
                    <>
                      {' '}
                      <a href={session.data.installUrl} target="_blank" rel="noreferrer">
                        Connect repositories ↗
                      </a>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="divider" />
          <span className="search-label">Refine this page</span>
          <nav className="filters" aria-label="Review status">
            {filters.map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                disabled={!data}
                onClick={() => {
                  setFilter(key);
                  setSelected(null);
                }}
              >
                <span className={`status-dot ${key}`} />
                <span>{label}</span>
                <small>
                  {!data
                    ? '–'
                    : prs.filter(
                        (pr) =>
                          key === 'all' ||
                          (key === 'open' ? isOpen(shopState(pr)!) : shopState(pr) === key),
                      ).length}
                </small>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            {offline ? (
              <p>
                <strong>Portable market</strong>
                <br />
                {savedSnapshot.data.pullRequests.length} captured pull requests. No GitHub App or
                server required.
              </p>
            ) : repository ? (
              <button className="text-button" onClick={() => switchRepository('')}>
                ← Visit the demo market
              </button>
            ) : (
              <p>
                <strong>Demo market</strong>
                <br />
                24 fictional pull requests. Nothing is written to GitHub.
              </p>
            )}
          </div>
        </aside>
        <main className="market-main">
          <div className={`market-stage ${data && view === 'market' ? 'has-scene' : ''}`}>
            <search
              className="market-search"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSearchOptions(false);
              }}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  runSearch(searchInput);
                }}
              >
                <label className="visually-hidden" htmlFor="search">
                  Search pull requests
                </label>
                <div className="market-search-input">
                  <svg
                    viewBox="0 0 24 24"
                    width="19"
                    height="19"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m16 16 5 5" />
                  </svg>
                  <input
                    id="search"
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={MAX_SEARCH_LENGTH}
                    value={searchInput}
                    placeholder={
                      offline
                        ? 'Search captured titles, authors, labels…'
                        : repository
                          ? 'Search GitHub… try label:bug or author:@me'
                          : 'Search demo titles, authors, labels…'
                    }
                    aria-describedby="search-help"
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      if (!repository || offline) {
                        setSearch(event.target.value);
                        setSelected(null);
                        if (offline) setPage(0);
                      }
                    }}
                  />
                  {searchInput && (
                    <button
                      type="button"
                      className="search-clear"
                      aria-label="Clear search"
                      disabled={!!repository && (waiting || !canBrowse)}
                      onClick={() => runSearch('')}
                    >
                      ×
                    </button>
                  )}
                  {repository && !offline && (
                    <button
                      type="button"
                      className="search-options-toggle"
                      aria-label="Search options"
                      aria-expanded={searchOptions}
                      aria-controls="search-options"
                      onClick={() => setSearchOptions(!searchOptions)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <path d="M4 7h16M4 17h16" />
                        <path d="M8 4v6M16 14v6" strokeWidth="3" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="submit"
                    className="primary"
                    disabled={!!repository && (waiting || !canBrowse)}
                  >
                    {repository && live.isFetching ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </form>
              <div className="search-options-panel" id="search-options" hidden={!searchOptions}>
                <div className="search-assistance">
                  <p id="search-help">
                    {offline
                      ? 'Search captured titles, authors, and labels as you type.'
                      : repository
                        ? 'Open PRs in this repository. Use GitHub search syntax, then press Enter.'
                        : 'Demo search filters titles, authors, and labels as you type.'}
                  </p>
                  {repository && !offline && (
                    <a
                      href="https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Search tips ↗
                    </a>
                  )}
                </div>
                {repository && !offline && (
                  <fieldset
                    className="quick-searches"

                    aria-label="Search all open pull requests"
                  >
                    {[
                      ['Needs my review', 'review-requested:@me'],
                      ['My pull requests', 'author:@me'],
                      ['Ready for review', 'draft:false review:required'],
                      ['Changes requested', 'review:changes_requested'],
                    ].map(([label, query]) => (
                      <button
                        key={query}
                        type="button"
                        aria-pressed={search === query}
                        disabled={
                          waiting || !canBrowse || (query.includes('@me') && !session.data?.login)
                        }
                        title={
                          query.includes('@me') && !session.data?.login
                            ? 'Sign in to use a personal search'
                            : undefined
                        }
                        onClick={() => runSearch(query)}
                      >
                        Search: {label}
                      </button>
                    ))}
                  </fieldset>
                )}
              </div>
              {repository && !offline && search && (
                <output className="visually-hidden">
                  {!canBrowse
                    ? 'Sign in to search GitHub'
                    : live.error
                      ? 'Search could not finish'
                      : live.isFetching || live.isPending
                        ? 'Searching GitHub'
                        : `${data?.total ?? 0} results`}{' '}
                  for <strong>{search}</strong>
                </output>
              )}
              {data?.searchLimited && (
                <p className="search-applied">
                  GitHub returns up to 1,000 search results. Add filters to narrow your search.
                </p>
              )}
            </search>
            <div className="market-status">
              {savedSnapshot && !savedSnapshot.complete && (
                <p className="notice">
                  Partial snapshot: {savedSnapshot.data.pullRequests.length} of{' '}
                  {savedSnapshot.data.total} matching open pull requests captured. Generate a new
                  snapshot with a higher page limit or narrower search for more results.
                </p>
              )}
              {authError && (
                <div className="notice" role="alert">
                  {authError === 'configuration'
                    ? 'GitHub sign-in is not configured for this deployment. You can explore the demo.'
                    : 'GitHub sign-in did not finish. Please try signing in again.'}
                </div>
              )}
              {session.error && (
                <div className="notice" role="alert">
                  Unable to check your session.{' '}
                  <button
                    disabled={waiting || session.isFetching}
                    onClick={() => void session.refetch()}
                  >
                    {waiting ? retryLabel : 'Retry'}
                  </button>
                </div>
              )}
              {repository && !session.isPending && !session.error && !canBrowse && (
                <div className="empty-state">
                  <h2>Bring your repository to the market.</h2>
                  <p>
                    {session.data?.configured
                      ? 'Sign in with GitHub to view its pull requests. Private repositories also need to be selected in the GitHub App installation.'
                      : 'This deployment is in demo mode. GitHub sign-in has not been configured yet.'}
                  </p>
                  <a
                    className="button primary"
                    href={signInUrl}
                    aria-disabled={!session.data?.configured}
                    onClick={(event) => {
                      if (!session.data?.configured) event.preventDefault();
                    }}
                  >
                    Sign in with GitHub
                  </a>
                  <button onClick={() => switchRepository('')}>Explore the demo</button>
                </div>
              )}
              {!data &&
                (!hydrated ||
                  (!!repository && (session.isPending || (canBrowse && live.isPending)))) && (
                  <output className="empty-state market-loading">
                    <LoadingMarketIcon />
                    <h2>Setting up the market…</h2>
                    <p>Getting the marketplace ready.</p>
                  </output>
                )}
              {showingPrevious && !live.error && (
                <output className="notice">
                  Loading results… Showing the previous results until this search or page is ready.
                </output>
              )}
              {repository && live.error && (
                <div
                  className={data ? 'notice' : 'empty-state'}
                  role={live.error instanceof CooldownError ? 'status' : 'alert'}
                >
                  <h2>
                    {rejectedSearch(live.error)
                      ? 'This search couldn’t run.'
                      : live.error instanceof CooldownError
                        ? 'Waiting for GitHub…'
                        : data
                          ? 'The market couldn’t refresh.'
                          : 'The market couldn’t open.'}
                  </h2>
                  {data && (
                    <p>
                      {showingPrevious && snapshot
                        ? `Showing ${snapshot.search ? `results for “${snapshot.search}”` : 'unfiltered results'} (page ${snapshot.page + 1}). These are not results for the new search or page.`
                        : 'Showing the last successful snapshot. Review states may have changed on GitHub.'}
                    </p>
                  )}
                  <p>{live.error.message}</p>
                  {rejectedSearch(live.error) ? (
                    <button
                      onClick={() => {
                        const input = document.getElementById('search') as HTMLInputElement | null;
                        input?.focus();
                        input?.select();
                      }}
                    >
                      Edit search
                    </button>
                  ) : (
                    <button
                      disabled={waiting || live.isFetching}
                      onClick={() => void live.refetch()}
                    >
                      {retryLabel}
                    </button>
                  )}
                  {!session.data?.login && session.data?.configured && (
                    <a className="button" href={signInUrl}>
                      Sign in with GitHub
                    </a>
                  )}
                  {live.error instanceof ApiError &&
                    live.error.status === 403 &&
                    session.data?.installUrl && (
                      <a
                        className="button"
                        href={session.data.installUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Check repository access ↗
                      </a>
                    )}
                </div>
              )}
            </div>
            {data && (
              <div
                className="scene-area"
                style={{ display: view === 'market' ? undefined : 'none' }}
              >
                <MarketCanvas
                  key={repository ? identity : 'demo'}
                  moving={moving}
                  onMovingChange={setMoving}
                  season={season}
                  onSeasonChange={setSeason}
                  pullRequests={prs}
                  visibleIds={visibleIds}
                  selected={chosen?.number ?? null}
                  onSelect={openShop}
                />
                <RepositoryStats
                  key={`report:${repository ? identity : 'demo'}`}
                  data={data}
                  demo={!repository}
                />
                {!matching.length && (
                  <div className="no-matches">
                    <strong>
                      {prs.length
                        ? 'No shops match those filters.'
                        : search
                          ? 'No pull requests match this search.'
                          : 'A quiet market. No open pull requests.'}
                    </strong>
                    {(prs.length > 0 || search) && (
                      <button
                        disabled={!!repository && waiting}
                        onClick={() => {
                          setFilter('all');
                          runSearch('');
                        }}
                      >
                        {search ? 'Clear search' : 'Clear filters'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {data && (
            <>
              <section
                id="shop-list"
                tabIndex={-1}
                className={`shop-list ${view === 'market' ? 'below-market' : ''}`}
                aria-label="Pull requests"
              >
                <div className="list-heading">
                  <h2>{view === 'market' ? 'Every shop, at a glance' : 'Around the market'}</h2>
                  <span>{matching.length} on this page</span>
                </div>
                {matching.map((pr) => {
                  const state = shopState(pr)!;
                  return (
                    <button
                      className="shop-row"
                      data-pr={pr.number}
                      key={pr.number}
                      onClick={() => openShop(pr.number)}
                      aria-pressed={selected === pr.number}
                    >
                      <span className={`row-symbol ${isOpen(state) ? 'open' : 'closed'}`}>
                        <span className={`status-dot ${state}`} aria-hidden="true" />
                      </span>
                      <span className="row-content">
                        <strong>{pr.title}</strong>
                        <small>
                          #{pr.number} · @{pr.author}
                          {pr.labels.length ? ` · ${pr.labels.slice(0, 3).join(', ')}` : ''}
                        </small>
                      </span>
                      <span className="row-status">
                        {stateLabels[state]}
                        <small>{ageText(pr.createdAt)}</small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  );
                })}
                {!matching.length && (
                  <p className="list-empty">No pull requests match the current filters.</p>
                )}
              </section>
              {chosen && (
                <aside className="detail" aria-label="Pull request details">
                  <div className="detail-heading">
                    <button
                      className="close-detail"
                      aria-label="Close pull request"
                      onClick={() => setSelected(null)}
                    >
                      ×
                    </button>
                    <span
                      className={`detail-status ${isOpen(shopState(chosen)!) ? 'open' : 'closed'}`}
                    >
                      {shopDoor(shopState(chosen)!)} · {stateLabels[shopState(chosen)!]}
                    </span>
                  </div>
                  <div className="detail-scroll">
                    <h2
                      className={expandedTitle ? 'expanded-title' : ''}
                      ref={heading}
                      tabIndex={-1}
                    >
                      {chosen.title}
                    </h2>
                    {chosen.title.length > 100 && (
                      <button
                        className="expand-title"
                        aria-expanded={expandedTitle}
                        onClick={() => setExpandedTitle(!expandedTitle)}
                      >
                        {expandedTitle ? 'Shorten title' : 'Show full title'}
                      </button>
                    )}
                    <p className="detail-meta">
                      #{chosen.number} · @{chosen.author}
                      <br />
                      {ageText(chosen.createdAt)} · Opened{' '}
                      {new Date(chosen.createdAt).toLocaleDateString()}
                    </p>
                    <DiffStats pr={chosen} />
                    <div className="tags">
                      {chosen.labels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <h3>From the pull request</h3>
                    <PullRequestDescription
                      offline={offline}
                      key={chosen.number}
                      body={chosen.body}
                      url={chosen.url}
                      truncated={chosen.bodyTruncated}
                    />
                    <h3>Requested reviewers</h3>
                    <p>
                      {chosen.requestedCount
                        ? chosen.requestedReviewers.join(', ')
                        : 'No outstanding review requests.'}
                      {chosen.requestedCount > chosen.requestedReviewers.length &&
                        ` and ${chosen.requestedCount - chosen.requestedReviewers.length} more on GitHub`}
                    </p>
                    <p className="detail-disclaimer">
                      Shop signs describe review availability; this pull request is still open on
                      GitHub. A review request is an invitation, not a sign that someone is actively
                      reviewing. Approval does not guarantee merge readiness.
                    </p>
                  </div>
                  <div className="detail-actions">
                    {chosen.url ? (
                      <a
                        className="button primary github-link"
                        href={chosen.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Review on GitHub ↗
                      </a>
                    ) : (
                      <p className="demo-detail">Fictional PR · explore freely.</p>
                    )}
                  </div>
                </aside>
              )}
              <footer className="market-footer">
                <span>
                  {matching.length} of {prs.length} shops on this page
                  {data.total > prs.length
                    ? ` · ${data.total} ${search ? 'matching open PRs' : 'open PRs in repository'}`
                    : ''}
                </span>
                <div>
                  {repository && !offline && (
                    <>
                      <button
                        onClick={() => void live.refetch()}
                        disabled={waiting || live.isFetching}
                      >
                        {live.isFetching ? 'Refreshing…' : 'Refresh'}
                      </button>
                      <span>
                        Checked{' '}
                        {new Date(data.fetchedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </>
                  )}
                  {page > 0 && (
                    <button
                      disabled={waiting || showingPrevious || live.isFetching}
                      onClick={() => {
                        setPage(page - 1);
                        setSelected(null);
                      }}
                    >
                      ← Previous
                    </button>
                  )}
                  {data.nextCursor && (
                    <button
                      disabled={waiting || showingPrevious || live.isFetching}
                      onClick={() => {
                        setCursors([...cursors.slice(0, page + 1), data.nextCursor]);
                        setPage(page + 1);
                        setSelected(null);
                      }}
                    >
                      Next 60 →
                    </button>
                  )}
                  {!offline && buildSha && (
                    <a
                      className="deployment-link"
                      href={`https://github.com/charpeni/brocante/commit/${buildSha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View deployed commit ${buildSha.slice(0, 7)} on GitHub`}
                      title={`Deployed commit ${buildSha}`}
                    >
                      {buildSha.slice(0, 7)}
                    </a>
                  )}
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function Marketplace(props: MarketplaceProps) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <App {...props} />
    </QueryClientProvider>
  );
}
