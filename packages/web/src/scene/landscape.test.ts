import { describe, expect, it } from 'vitest';
import { currentSeason, MarketLandscape, SEASONS } from './landscape.js';

describe('seasonal landscape', () => {
  it('detects the season from the local calendar, including the winter year boundary', () => {
    const expected = [
      'winter',
      'winter',
      'spring',
      'spring',
      'spring',
      'summer',
      'summer',
      'summer',
      'autumn',
      'autumn',
      'autumn',
      'winter',
    ];
    for (let month = 0; month < 12; month++) {
      expect(currentSeason(new Date(2026, month, 1))).toBe(expected[month]);
      expect(currentSeason(new Date(2026, month + 1, 0, 23, 59))).toBe(expected[month]);
    }
  });
  it('builds valid batches within a modest outer border and reuses them across seasons', () => {
    const landscape = new MarketLandscape();
    const geometries = [...landscape.meshes.values()].map((mesh) => mesh.geometry);
    const materials = [...landscape.materials.values()];
    try {
      for (const geometry of geometries) {
        const vertices = geometry.getAttribute('position');
        expect(vertices.count).toBeGreaterThan(0);
        for (let i = 0; i < vertices.count; i++)
          expect(Math.hypot(vertices.getX(i), vertices.getZ(i))).toBeLessThanOrEqual(24.81);
      }
      for (let i = 0; i < 5; i++) {
        for (const season of SEASONS) {
          landscape.setSeason(season.id);
          expect(landscape.meshes.get('snow')!.visible).toBe(season.id === 'winter');
          expect(landscape.meshes.get('leaves')!.visible).toBe(season.id !== 'winter');
          expect(landscape.meshes.get('blossom')!.visible).toBe(season.id === 'spring');
          expect(landscape.meshes.get('litter')!.visible).toBe(season.id === 'autumn');
          expect([...landscape.meshes.values()].map((mesh) => mesh.geometry)).toEqual(geometries);
          expect([...landscape.materials.values()]).toEqual(materials);
        }
      }
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
  });
});
