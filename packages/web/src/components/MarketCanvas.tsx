import { useEffect, useRef, useState } from 'react';
import { MarketWorld } from '../scene/scene.js';
import { MarketLife } from '../scene/life.js';
import { SEASONS, type Season } from '../scene/landscape.js';
import {
  ageText,
  isOpen,
  shopState,
  shopDoor,
  stateLabels,
  toSceneShop,
  type PullRequest,
} from '../lib/market';
const discoveries = [
  {
    id: 'gift',
    label: 'Inspect the floating gift',
    message: 'If only you had a slingshot…',
    height: 0.5,
  },
  {
    id: 'sword',
    label: 'Inspect the sword in the stone',
    message: 'Perhaps after your next review.',
    height: 1.1,
  },
  {
    id: 'worm',
    label: 'Inspect the apple crate',
    message: 'Keeping the peace. For now.',
    height: 0.8,
  },
] as const;
type DiscoveryId = (typeof discoveries)[number]['id'];
interface Props {
  pullRequests: PullRequest[];
  visibleIds: Set<number>;
  selected: number | null;
  onSelect: (id: number) => void;
  moving: boolean;
  onMovingChange: (value: boolean) => void;
  season: Season;
  onSeasonChange: (value: Season) => void;
}
export default function MarketCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const world = useRef<MarketWorld | null>(null);
  const life = useRef<MarketLife | null>(null);
  const signs = useRef(new Map<number, HTMLButtonElement>());
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const [error, setError] = useState(false);
  const hovered = useRef<number | null>(null);
  const [hint, setHint] = useState('');
  const discoveryButtons = useRef(new Map<DiscoveryId, HTMLButtonElement>());
  const discoveryTooltip = useRef<HTMLDivElement>(null);
  const positionDiscoveries = useRef<() => void>(() => {});
  const activeDiscoveryRef = useRef<DiscoveryId | null>(null);
  const [activeDiscovery, setActiveDiscovery] = useState<DiscoveryId | null>(null);
  const showDiscovery = (id: DiscoveryId | null) => {
    activeDiscoveryRef.current = id;
    setActiveDiscovery(id);
  };
  useEffect(() => {
    if (!activeDiscovery) return;
    const dismiss = (event: PointerEvent) => {
      if (!discoveryButtons.current.get(activeDiscovery)?.contains(event.target as Node))
        showDiscovery(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        showDiscovery(null);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape, true);
    };
  }, [activeDiscovery]);
  const [entrancePhase, setEntrancePhase] = useState<'growing' | 'labels' | 'ready'>('growing');
  useEffect(() => {
    if (entrancePhase !== 'labels') return;
    const timer = window.setTimeout(() => setEntrancePhase('ready'), 500);
    return () => window.clearTimeout(timer);
  }, [entrancePhase]);
  useEffect(() => {
    if (!container.current) return;
    let instance: MarketWorld | null = null;
    let searchObserver: ResizeObserver | undefined;
    let searchHeight = 0;
    const stage = container.current.closest<HTMLElement>('.market-stage');
    const search = stage?.querySelector<HTMLElement>('.market-search');
    try {
      instance = new MarketWorld(
        container.current,
        (id) => latest.current.onSelect(id),
        (id) => {
          if (!instance?.entranceReady) return;
          hovered.current = id;
          const pr = latest.current.pullRequests.find((p) => p.number === id);
          setHint(pr && latest.current.visibleIds.has(pr.number) ? pr.title : '');
          instance?.render();
        },
      );
      world.current = instance;
      instance.onEntranceComplete = () => {
        const immediate =
          !latest.current.moving ||
          latest.current.selected !== null ||
          matchMedia('(prefers-reduced-motion: reduce)').matches;
        setEntrancePhase(immediate ? 'ready' : 'labels');
        instance?.render();
      };
      instance.setSeason(latest.current.season);
      instance.onContextLost = () => {
        setError(true);
        life.current?.sync();
      };
      instance.onContextRestored = () => {
        setError(false);
        life.current?.sync();
      };
      let discoveryBlockers: { left: number; right: number; top: number; bottom: number }[] = [];
      const placeDiscoveries = () => {
        const tooltip = discoveryTooltip.current;
        const targets = life.current?.moments.hintTargets;
        if (!instance || !tooltip || !targets) return;
        for (const discovery of discoveries) {
          const button = discoveryButtons.current.get(discovery.id);
          const object = targets[discovery.id];
          if (!button) continue;
          const point = object.position.clone();
          point.y += discovery.height;
          point.project(instance.camera);
          const x = ((point.x + 1) * instance.width) / 2;
          const y = ((1 - point.y) * instance.height) / 2;
          const covered = discoveryBlockers.some(
            (rect) =>
              x + 22 > rect.left &&
              x - 22 < rect.right &&
              y + 22 > rect.top &&
              y - 22 < rect.bottom,
          );
          const hidden =
            !object.visible ||
            !instance.entranceReady ||
            point.z > 1 ||
            point.z < -1 ||
            x < 22 ||
            x > instance.width - 22 ||
            y < searchHeight + 26 ||
            y > instance.height - 115 ||
            covered;
          if (hidden && !button.hidden) {
            if (document.activeElement === button)
              container.current?.parentElement
                ?.querySelector<HTMLButtonElement>('.world-controls button')
                ?.focus({ preventScroll: true });
            if (activeDiscoveryRef.current === discovery.id) showDiscovery(null);
          }
          button.hidden = hidden;
          button.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
          if (activeDiscoveryRef.current === discovery.id) {
            const tooltipY = y + 92 > instance.height - 85 ? y - 74 : y + 28;
            tooltip.style.transform = `translate(${Math.max(8, Math.min(instance.width - 208, x - 100))}px, ${tooltipY}px)`;
          }
        }
      };
      positionDiscoveries.current = placeDiscoveries;
      const place = () => {
        if (!instance) return;
        const mobile = instance.width < 620;
        const width = mobile ? 136 : 160;
        const occupied: { left: number; top: number; right: number; bottom: number }[] = [];
        const containerRect = container.current!.getBoundingClientRect();
        const caption = container
          .current!.parentElement?.querySelector('.market-caption')
          ?.getBoundingClientRect();
        const stats = stage?.querySelector('.repository-stats')?.getBoundingClientRect();
        const panel =
          latest.current.selected !== null
            ? document.querySelector('.detail')?.getBoundingClientRect()
            : null;
        const selectedGround =
          latest.current.selected !== null ? instance.project(latest.current.selected, 0) : null;
        if (selectedGround)
          occupied.push({
            left: selectedGround.x - 48 * instance.zoom,
            right: selectedGround.x + 48 * instance.zoom,
            top: selectedGround.y - 30 * instance.zoom,
            bottom: selectedGround.y + 30 * instance.zoom,
          });
        let shown = 0;
        const items = [...latest.current.pullRequests].sort(
          (a, b) =>
            Number(b.number === latest.current.selected) -
            Number(a.number === latest.current.selected),
        );
        for (const pr of items) {
          const node = signs.current.get(pr.number);
          if (!node) continue;
          const point = instance.project(pr.number);
          const selected = pr.number === latest.current.selected;
          const height = mobile ? (selected ? 96 : 76) : selected ? 126 : 104;
          if (!point) {
            node.hidden = true;
            continue;
          }
          const rect = {
            left: point.x - width / 2,
            right: point.x + width / 2,
            top: point.y - height - 22,
            bottom: point.y - 22,
          };
          const intersects = (r: typeof rect) =>
            rect.left < r.right + 6 &&
            rect.right > r.left - 6 &&
            rect.top < r.bottom + 6 &&
            rect.bottom > r.top - 6;
          const underPanel =
            panel &&
            intersects({
              left: panel.left - containerRect.left,
              right: panel.right - containerRect.left,
              top: panel.top - containerRect.top,
              bottom: panel.bottom - containerRect.top,
            });
          const underCaption =
            caption &&
            intersects({
              left: caption.left - containerRect.left,
              right: caption.right - containerRect.left,
              top: caption.top - containerRect.top,
              bottom: caption.bottom - containerRect.top,
            });
          const underStats =
            stats &&
            intersects({
              left: stats.left - containerRect.left,
              right: stats.right - containerRect.left,
              top: stats.top - containerRect.top,
              bottom: stats.bottom - containerRect.top,
            });
          node.hidden =
            !latest.current.visibleIds.has(pr.number) ||
            point.z > 1 ||
            rect.left < 8 ||
            rect.right > instance.width - 8 ||
            rect.top < searchHeight + 10 ||
            rect.bottom > instance.height - 85 ||
            !!underPanel ||
            !!underCaption ||
            !!underStats ||
            shown >= (mobile ? 3 : 7) ||
            (!selected && occupied.some(intersects)) ||
            (instance.zoom > 1.65 &&
              !selected &&
              hovered.current !== pr.number &&
              document.activeElement !== node);
          if (!node.hidden) {
            node.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
            node.style.setProperty('--sign-delay', `${shown * 40}ms`);
            occupied.push(rect);
            shown++;
          }
        }
      };
      instance.onRender = () => {
        place();
        const bounds = container.current!.getBoundingClientRect();
        discoveryBlockers = [
          ...(stage?.querySelectorAll(
            '.repository-stats, .market-caption, .shop-sign:not([hidden]), .detail',
          ) ?? []),
        ].map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left - bounds.left,
            right: rect.right - bounds.left,
            top: rect.top - bounds.top,
            bottom: rect.bottom - bounds.top,
          };
        });
        placeDiscoveries();
      };
      instance.onAmbientRender = placeDiscoveries;
      if (stage && search) {
        const syncSearchHeight = () => {
          searchHeight = search.offsetHeight;
          stage.style.setProperty('--market-search-height', `${searchHeight}px`);
          instance?.render();
        };
        searchObserver = new ResizeObserver(syncSearchHeight);
        searchObserver.observe(search);
        const stats = stage.querySelector('.repository-stats');
        if (stats) searchObserver.observe(stats);
        syncSearchHeight();
      }
      instance.setShops(latest.current.pullRequests.map(toSceneShop));
      instance.resize();
      life.current = new MarketLife(instance);
      life.current.setEnabled(latest.current.moving);
      instance.startEntrance();
      if (!latest.current.moving) instance.finishEntrance();
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- WebGL capability is determined by constructing the external renderer.
      setError(true);
    }
    return () => {
      positionDiscoveries.current = () => {};
      searchObserver?.disconnect();
      life.current?.dispose();
      life.current = null;
      instance?.dispose();
      world.current = null;
    };
  }, []);
  useEffect(() => {
    world.current?.setShops(props.pullRequests.map(toSceneShop));
    world.current?.setAge(0);
  }, [props.pullRequests]);
  useEffect(() => {
    world.current?.highlight(props.visibleIds, props.selected);
  }, [props.visibleIds, props.selected]);
  useEffect(() => {
    if (props.selected !== null) world.current?.focus(props.selected);
  }, [props.selected]);
  useEffect(() => {
    life.current?.setEnabled(props.moving);
  }, [props.moving]);
  useEffect(() => {
    world.current?.setSeason(props.season);
  }, [props.season]);
  const season = SEASONS.find((value) => value.id === props.season)!;
  const nextSeason = SEASONS[(SEASONS.indexOf(season) + 1) % SEASONS.length];
  return (
    <div className="canvas-wrap" data-season={props.season} data-entrance={entrancePhase}>
      <div className="world" ref={container}>
        {discoveries.map((discovery) => (
          <button
            key={discovery.id}
            ref={(node) => {
              if (node) discoveryButtons.current.set(discovery.id, node);
              else discoveryButtons.current.delete(discovery.id);
            }}
            className="floating-gift-target"
            type="button"
            hidden
            aria-label={discovery.label}
            aria-describedby={activeDiscovery === discovery.id ? 'discovery-tooltip' : undefined}
            onClick={() => {
              showDiscovery(discovery.id);
              positionDiscoveries.current();
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                showDiscovery(discovery.id);
                positionDiscoveries.current();
              }
            }}
            onPointerLeave={(event) => {
              if (
                document.activeElement !== event.currentTarget &&
                activeDiscoveryRef.current === discovery.id
              )
                showDiscovery(null);
            }}
            onFocus={() => {
              showDiscovery(discovery.id);
              positionDiscoveries.current();
            }}
            onBlur={() => {
              if (activeDiscoveryRef.current === discovery.id) showDiscovery(null);
            }}
          />
        ))}
        <div
          ref={discoveryTooltip}
          id="discovery-tooltip"
          className="floating-gift-tooltip"
          role="tooltip"
          hidden={!activeDiscovery}
        >
          {discoveries.find((discovery) => discovery.id === activeDiscovery)?.message}
        </div>
        {props.pullRequests.map((pr) => {
          const state = shopState(pr)!;
          return (
            <button
              key={pr.number}
              data-pr={pr.number}
              className={`shop-sign ${isOpen(state) ? 'open' : 'closed'}`}
              hidden
              ref={(node) => {
                if (node) signs.current.set(pr.number, node);
                else signs.current.delete(pr.number);
              }}
              onClick={() => props.onSelect(pr.number)}
              aria-label={`View ${pr.title}`}
              aria-pressed={props.selected === pr.number}
            >
              <span className="sign-state">
                {shopDoor(state)} · {stateLabels[state]}
              </span>
              <strong>{pr.title}</strong>
              {props.selected === pr.number && <span className="selection-label">◆ Selected</span>}
              <span className="sign-meta">
                #{pr.number} · {ageText(pr.createdAt)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="market-caption">
        <p>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18h6m-5 3h4M8.5 15.5a6 6 0 1 1 7 0c-.9.6-1.5 1.4-1.5 2.5h-4c0-1.1-.6-1.9-1.5-2.5Z" />
          </svg>
          <span>Older shops gather near the fountain.</span>
        </p>
      </div>
      {error && (
        <output className="canvas-error">
          The 3D view isn’t available in this browser. Use the list view to explore every pull
          request.
        </output>
      )}
      <fieldset className="world-controls" aria-label="Marketplace camera">
        {hint && <div className="hover-hint">{hint}</div>}
        <button onClick={() => world.current?.turn(-0.3)} aria-label="Rotate left">
          ↶
        </button>
        <button onClick={() => world.current?.turn(0.3)} aria-label="Rotate right">
          ↷
        </button>
        <span className="control-divider" />
        <button onClick={() => world.current?.zoomBy(-0.2)} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => world.current?.zoomBy(0.2)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => world.current?.home()} aria-label="Reset camera">
          ⌂
        </button>
        <span className="control-divider" />
        <button
          onClick={() => props.onMovingChange(!props.moving)}
          aria-pressed={props.moving}
          className="motion-button"
        >
          {props.moving ? 'Pause life' : 'Resume life'}
        </button>
        <button onClick={() => life.current?.invite(true)} className="bird-button">
          Invite a bird
        </button>
        <button
          className="season-button"
          onClick={() => props.onSeasonChange(nextSeason.id)}
          aria-label={`Season: ${season.label}. Switch to ${nextSeason.label}`}
          title={`Season: ${season.label}. Switch to ${nextSeason.label}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {season.id === 'spring' && (
              <>
                <path d="M12 21v-7m0 5c-5 0-7-2-7-5 4 0 7 2 7 5Zm0-3c5 0 7-2 7-5-4 0-7 2-7 5Z" />
                <path d="M12 3c4-5 7 2 3 4 5 2 1 7-3 4-4 3-8-2-3-4-4-2-1-9 3-4Z" />
              </>
            )}
            {season.id === 'summer' && (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </>
            )}
            {season.id === 'autumn' && (
              <>
                <path d="M5 19C-2 9 12 3 20 3c1 9-4 19-13 15M3 22 16 9M8 17v-5m3 2h5" />
              </>
            )}
            {season.id === 'winter' && (
              <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m13 9-4 1 1 4M4 14l4 1-1 4m13-9-4-1 1-4" />
            )}
          </svg>
          <span className="season-name" aria-hidden="true">
            {season.label}
          </span>
        </button>
      </fieldset>
      <div className="camera-help">
        <span className="pointer-help">Drag to turn · Ctrl/⌘ + scroll to zoom</span>
        <span className="touch-help">Drag sideways to turn · +/− to zoom</span>
        <a href="#shop-list">Browse {props.visibleIds.size} shops below ↓</a>
      </div>
    </div>
  );
}
