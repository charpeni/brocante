import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MarketCats } from './cats.js';

describe('market cats', () => {
  it('settles into a closed-eye nap, stretches, then walks without changing scale', () => {
    const cats = new MarketCats(new THREE.Scene());
    try {
      const cat = cats.animals[0];
      cats.update(4);
      expect(cat.phase).toBe('napping');
      expect(cat.eyes[0].scale.y).toBeLessThan(0.01);
      const resting = cat.object.position.clone();
      cats.update(10.5);
      expect(cat.phase).toBe('stretching');
      expect(cat.body.scale.z).toBeGreaterThan(0.6);
      expect(cat.object.position.equals(resting)).toBe(true);
      cats.update(20);
      expect(cat.phase).toBe('walking');
      expect(cat.eyes[0].scale.y).toBe(0.043);
      expect(cat.object.scale.toArray()).toEqual([0.55, 0.55, 0.55]);
    } finally {
      cats.dispose();
    }
  });
  it('keeps paths continuous when resting ends and a walking cycle restarts', () => {
    const cats = new MarketCats(new THREE.Scene());
    try {
      for (const boundary of [12, 19, 36, 48, 55, 72]) {
        cats.update(boundary - 0.0001);
        const before = cats.animals.map((cat) => cat.object.position.clone());
        cats.update(boundary);
        cats.animals.forEach((cat, index) => {
          expect(cat.object.position.distanceTo(before[index])).toBeLessThan(0.001);
        });
      }
    } finally {
      cats.dispose();
    }
  });

  it('shares resources through repeated motion and releases them on removal', () => {
    const scene = new THREE.Scene();
    const cats = new MarketCats(scene);
    const resources = new Set(Object.values(cats.resources));
    let disposed = 0;
    for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
    for (let time = 0; time < 360; time++) cats.update(time);
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        expect(node.castShadow).toBe(false);
        expect(resources.has(node.geometry)).toBe(true);
        expect(resources.has(node.material)).toBe(true);
      }
    });
    expect(disposed).toBe(0);
    cats.dispose();
    expect(scene.children).toHaveLength(0);
    expect(disposed).toBe(resources.size);
  });
});
