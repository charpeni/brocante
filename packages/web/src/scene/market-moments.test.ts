import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MarketMoments } from './market-moments.js';

function fixture() {
  const world = { scene: new THREE.Scene(), landscape: { season: 'summer' } };
  return { world, moments: new MarketMoments(world) };
}

describe('decorative market moments', () => {
  it('keeps the sword still and gives the worm a continuous, mostly hidden cycle', () => {
    const { moments } = fixture();
    try {
      const { sword, worm, crate } = moments.discoveries;
      const position = sword.position.clone();
      expect(worm.visible).toBe(true);
      expect(crate.position.length()).toBeGreaterThan(19);
      for (const boundary of [6, 7.2, 38, 40, 44, 88]) {
        moments.update(boundary - 0.00001);
        const before = worm.position.clone();
        moments.update(boundary);
        expect(worm.position.distanceTo(before)).toBeLessThan(0.001);
      }
      moments.update(20);
      expect(worm.visible).toBe(false);
      moments.update(42);
      expect(worm.visible).toBe(true);
      expect(sword.position.equals(position)).toBe(true);
    } finally {
      moments.dispose();
    }
  });
  it('waits for map creation before casting and keeps the bobber path continuous', () => {
    const world = {
      scene: new THREE.Scene(),
      landscape: { season: 'summer' },
      entranceReady: false,
    };
    const moments = new MarketMoments(world);
    try {
      moments.update(20);
      expect(moments.fishingPhase).toBe('waiting');
      world.entranceReady = true;
      moments.update(20);
      expect(moments.fishingPhase).toBe('waiting');
      moments.update(21.5);
      expect(moments.fishingPhase).toBe('winding');
      expect(moments.rod.rotation.x).toBeLessThan(0);
      moments.update(23);
      expect(moments.fishingPhase).toBe('casting');
      expect(moments.bobber.position.y).toBeGreaterThan(1);
      for (const boundary of [20.8, 22.2, 22.65, 24.4, 25.4, 68.8]) {
        moments.update(boundary - 0.00001);
        const before = moments.bobber.position.clone();
        moments.update(boundary);
        expect(moments.bobber.position.distanceTo(before)).toBeLessThan(0.001);
      }
      moments.update(24.8);
      expect(moments.ripple.visible).toBe(true);
      moments.update(30);
      expect(moments.fishingPhase).toBe('waiting');
      expect(moments.ripple.visible).toBe(false);
    } finally {
      moments.dispose();
    }
  });
  it('makes rare balloon passes on simulation time, with quiet intervals and fades', () => {
    const { moments } = fixture();
    try {
      for (const time of [0, 14, 55, 300, 314]) {
        moments.update(time);
        expect(moments.balloon.visible).toBe(false);
      }
      moments.update(15);
      expect(moments.balloon.visible).toBe(true);
      expect(moments.balloonMaterials[0].opacity).toBe(0);
      moments.update(35);
      expect(moments.balloon.position.x).toBeCloseTo(0);
      expect(moments.balloon.position.z).toBeLessThan(-24.8);
      expect(moments.balloonMaterials[0].opacity).toBe(1);
      const middle = moments.balloon.position.clone();
      moments.update(335);
      expect(moments.balloon.position.equals(middle)).toBe(true);
    } finally {
      moments.dispose();
    }
  });

  it('keeps the line connected to the rod and bobber, including frozen winter water', () => {
    const { moments, world } = fixture();
    try {
      for (const time of [0, 5, 12, 120]) {
        moments.update(time);
        moments.fisher.updateMatrixWorld(true);
        const tip = moments.rodTip.clone().applyMatrix4(moments.rod.matrix);
        const top = new THREE.Vector3(0, -0.5, 0).applyMatrix4(moments.thread.matrix);
        const bottom = new THREE.Vector3(0, 0.5, 0).applyMatrix4(moments.thread.matrix);
        expect(top.distanceTo(tip)).toBeLessThan(0.00001);
        expect(bottom.distanceTo(moments.bobber.position)).toBeLessThan(0.00001);
      }
      world.landscape.season = 'winter';
      moments.update(13);
      const frozen = moments.bobber.position.clone();
      moments.update(14);
      expect(moments.bobber.position.equals(frozen)).toBe(true);
    } finally {
      moments.dispose();
    }
  });

  it('reuses resources across visits and releases every owned resource on teardown', () => {
    const { moments, world } = fixture();
    const owned = [...moments.resources];
    let disposed = 0;
    owned.forEach((resource) => resource.addEventListener('dispose', () => disposed++));
    for (let time = 0; time < 1800; time++) moments.update(time);
    world.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        expect(node.castShadow).toBe(false);
        expect(moments.resources.has(node.geometry)).toBe(true);
        expect(moments.resources.has(node.material)).toBe(true);
      }
    });
    expect(disposed).toBe(0);
    moments.dispose();
    expect(world.scene.children).toHaveLength(0);
    expect(disposed).toBe(owned.length);
  });
});
