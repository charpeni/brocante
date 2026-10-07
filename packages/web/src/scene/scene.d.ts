export interface SceneShop {
  id: number;
  title: string;
  skill: string;
  openedAtHours: number;
  status: string;
  size?: 'compact' | 'standard';
}

export class MarketWorld {
  constructor(
    container: HTMLElement,
    onChoose: (id: number) => void,
    onHover: (id: number | null, event?: PointerEvent) => void,
  );
  onRender: (() => void) | null;
  onAmbientRender?: () => void;
  camera: import('three').Camera;
  onEntranceComplete: (() => void) | null;
  entranceReady: boolean;
  zoom: number;
  onContextRestored: (() => void) | null;
  onContextLost: (() => void) | null;
  width: number;
  height: number;
  renderer: { domElement: HTMLCanvasElement };
  setShops(shops: SceneShop[], clockHours?: number): void;
  setAge(clockHours: number): void;
  startEntrance(): void;
  finishEntrance(): void;
  setSeason(season: import('./landscape.js').Season): void;
  highlight(ids: Set<number>, selected: number | null): void;
  project(id: number, height?: number): { x: number; y: number; z: number } | null;
  resize(): void;
  render(ambientOnly?: boolean): void;
  focus(id: number, animate?: boolean): void;
  home(animate?: boolean): void;
  turn(amount: number, animate?: boolean): void;
  zoomBy(amount: number): void;
  dispose(): void;
}
