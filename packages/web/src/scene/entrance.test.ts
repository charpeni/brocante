import { expect, it } from 'vitest';
import * as THREE from 'three';
import { MarketEntrance } from './entrance.js';

it('grows vegetation and shops together, preserves footprints and restores dense-shop scales exactly', () => {
  const tree = new THREE.Group();
  const land = new THREE.Group();
  const shop = new THREE.Group();
  shop.scale.setScalar(0.73);
  shop.position.set(8, 0.09, 2);
  const entrance = new MarketEntrance(
    {
      meshes: new Map([
        ['bark', tree],
        ['lawn', land],
      ]),
    },
    new Map([[1, { group: shop }]]),
  );
  const linear = (t: number) => t;
  entrance.update(200, linear);
  expect(tree.scale.y).toBeCloseTo(shop.scale.y / 0.73, 10);
  expect(land.scale.toArray()).toEqual([1, 1, 1]);
  expect(shop.scale.x).toBe(0.73);
  expect(shop.scale.z).toBe(0.73);
  expect(shop.position.toArray()).toEqual([8, 0.09, 2]);
  entrance.finish();
  expect(tree.scale.toArray()).toEqual([1, 1, 1]);
  expect(shop.scale.toArray()).toEqual([0.73, 0.73, 0.73]);
});
