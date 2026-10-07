import type { MarketWorld } from './scene';

export class MarketLife {
  moments: { hintTargets: Record<'gift' | 'sword' | 'worm', import('three').Group> };
  constructor(world: MarketWorld, onChange?: (snapshot: unknown) => void);
  sync(): void;
  setEnabled(enabled: boolean): void;
  invite(manual?: boolean): boolean;
  dispose(): void;
}
