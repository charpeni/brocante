import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  definePluginApp,
  experimental_usePluginId,
  useBbNavigate,
  useBbContext,
  useSdk,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginNavPanelProps,
} from '@get-bb/plugin-sdk/app';
import type { rpcContract, SavedMarket } from './contract';
import { Button, Select } from './components/controls';
import { projectRepositories, type ProjectRepository } from './project-repositories';

function MarketPreview({ subPath }: PluginNavPanelProps) {
  const pluginId = experimental_usePluginId();
  const sdk = useSdk();
  const context = useBbContext();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const connection = useRealtimeConnectionState();
  const [markets, setMarkets] = useState<SavedMarket[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<{ path: string; id: string } | null>(null);
  const repositoryInputId = useId();
  const savedMarketInputId = useId();
  const [projects, setProjects] = useState<ProjectRepository[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectError, setProjectError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const lifecycle = useRef({ mounted: true, request: 0 });

  useEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      state.request++;
    };
  }, []);

  const refresh = useCallback(() => {
    const state = lifecycle.current;
    const current = ++state.request;
    return Promise.allSettled([rpc.call('listSnapshots'), sdk.projects.list()])
      .then(([snapshots, repositories]) => {
        if (!state.mounted || current !== state.request) return;
        if (snapshots.status === 'fulfilled') {
          setMarkets(snapshots.value.snapshots);
          setConfigured(snapshots.value.configured);
        } else setError('Unable to load saved markets. Please try again.');
        if (repositories.status === 'fulfilled') {
          setProjects(projectRepositories(repositories.value));
          setProjectError('');
        } else setProjectError('Unable to load bb’s project repositories. Please try again.');
      })
      .catch((failure: unknown) => {
        if (state.mounted && current === state.request)
          setError(failure instanceof Error ? failure.message : 'Unable to load saved markets.');
      })
      .finally(() => {
        if (state.mounted && current === state.request) setLoading(false);
      });
  }, [rpc, sdk]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, connection, subPath]);
  useRealtime('snapshots', () => void refresh());

  const selected = selection?.path === subPath ? selection.id : subPath || markets[0]?.id || '';
  const market = markets.find((item) => item.id === selected);
  const project =
    projects.find((item) => item.projectId === projectId) ??
    projects.find((item) => item.projectId === context.projectId) ??
    projects.find((item) => item.repository.toLowerCase() === market?.repository.toLowerCase());
  const repository = project?.repository ?? '';

  function openMarket(id: string) {
    setSelection({ path: subPath, id });
    setError('');
    navigate.toPluginPanel('market', { subPath: id });
  }

  async function capture(demo: boolean) {
    setCapturing(true);
    setError('');
    try {
      const market = await rpc.call('capture', demo ? { demo: true } : { repository });
      if (!lifecycle.current.mounted) return;
      await refresh();
      if (lifecycle.current.mounted) openMarket(market.id);
    } catch (failure) {
      if (lifecycle.current.mounted)
        setError(failure instanceof Error ? failure.message : 'Unable to capture this market.');
    } finally {
      if (lifecycle.current.mounted) setCapturing(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capturing && configured && repository.trim()) void capture(false);
  }

  const endpoint = `/api/v1/plugins/${encodeURIComponent(pluginId)}/http`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-border p-3">
        <form className="flex min-w-0 flex-1 flex-wrap items-end gap-2" onSubmit={submit}>
          <label
            htmlFor={repositoryInputId}
            className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium"
          >
            Project repository
            <Select
              id={repositoryInputId}
              value={project?.projectId ?? ''}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={capturing || loading || !projects.length}
            >
              <option value="" disabled>
                Choose a bb project…
              </option>
              {projects.map((item) => (
                <option key={item.projectId} value={item.projectId}>
                  {item.projectName} · {item.repository}
                </option>
              ))}
            </Select>
          </label>
          <Button
            primary
            type="submit"
            disabled={capturing || loading || !configured || !repository.trim()}
          >
            {capturing ? 'Capturing…' : 'Capture market'}
          </Button>
          <Button disabled={capturing || loading} onClick={() => void capture(true)}>
            Load demo
          </Button>
        </form>
        {markets.length > 0 && (
          <label
            htmlFor={savedMarketInputId}
            className="flex min-w-0 flex-col gap-1 text-xs font-medium"
          >
            Saved markets
            <Select
              id={savedMarketInputId}
              className="max-w-64"
              value={market?.id ?? ''}
              disabled={capturing}
              onChange={(event) => openMarket(event.target.value)}
            >
              {!market && <option value="">Choose a saved market</option>}
              {markets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.repository} · {new Date(item.createdAt).toLocaleString()}
                </option>
              ))}
            </Select>
          </label>
        )}
        {market && (
          <a
            className="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`${endpoint}/snapshot?id=${encodeURIComponent(market.id)}`}
          >
            Download HTML
          </a>
        )}
      </div>
      {!loading && !configured && (
        <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          Sign in with gh auth login on the bb server, or set Brocante’s optional GitHub token
          override. The demo needs no credentials.
        </p>
      )}
      {!loading && !projects.length && !projectError && (
        <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          No GitHub repositories are configured in bb’s projects. Add a project to select its
          repository here.
        </p>
      )}
      {projectError && (
        <p role="alert" className="shrink-0 px-3 py-2 text-sm text-destructive">
          {projectError}
        </p>
      )}
      {error && (
        <p role="alert" className="shrink-0 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {market ? (
        <iframe
          key={market.id}
          title={`Brocante market for ${market.repository}`}
          className="min-h-0 w-full flex-1 border-0"
          src={`${endpoint}/preview?id=${encodeURIComponent(market.id)}`}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <h1 className="text-lg font-medium">
            {loading ? 'Opening Brocante…' : 'Your market in bb'}
          </h1>
          {!loading && (
            <p className="max-w-sm text-sm text-muted-foreground">
              {selected
                ? 'This snapshot is no longer available. Choose a saved market or capture a new one.'
                : 'Capture a repository or load the demo to explore its 3D marketplace here.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: 'market',
    title: 'Brocante',
    icon: 'Store',
    path: 'market',
    component: MarketPreview,
  });
});
