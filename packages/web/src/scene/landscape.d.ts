export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function currentSeason(date?: Date): Season;

export const SEASONS: readonly { id: Season; label: string }[];

export class MarketLandscape {
  group: import('three').Group;
  season: Season;
  materials: Map<string, import('three').MeshLambertMaterial>;
  meshes: Map<string, import('three').Mesh>;
  setSeason(season: Season): void;
}
