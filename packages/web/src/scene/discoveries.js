import * as THREE from 'three';

// Original miniature props. Geometry/material ownership stays with MarketMoments.
export class MarketDiscoveries {
  constructor({ scene, box, ball, tube, part, material, own }) {
    this.scene = scene;
    const stone = material(0x929588);
    const moss = material(0x71835c);
    const steel = material(0xc4ccc5);
    const hilt = material(0x516b67);
    const brass = material(0xb6a170);
    this.sword = new THREE.Group();
    this.sword.name = 'market-mossy-sword-stone';
    this.sword.position.set(-17.8, 0.08, 12.8);
    this.sword.rotation.y = 0.5;
    part(this.sword, ball, stone, [0, 0.4, 0], [0.93, 0.61, 0.7]);
    part(this.sword, ball, moss, [-0.38, 0.64, 0.22], [0.49, 0.23, 0.43]);
    part(this.sword, ball, moss, [0.55, 0.22, 0.25], [0.35, 0.15, 0.34]);
    const blade = new THREE.Group();
    blade.position.set(0.13, 0.68, 0);
    blade.rotation.z = -0.12;
    this.sword.add(blade);
    part(blade, box, steel, [0, 0.48, 0], [0.15, 0.96, 0.06]);
    part(blade, box, brass, [0, 0.98, 0], [0.54, 0.09, 0.12]);
    part(blade, tube, hilt, [0, 1.18, 0], [0.07, 0.32, 0.07]);
    part(blade, ball, brass, [0, 1.39, 0], [0.1, 0.1, 0.09]);
    scene.add(this.sword);

    this.crate = new THREE.Group();
    this.crate.name = 'market-apple-crate';
    this.crate.position.set(2.3, 0.08, 19.1);
    this.crate.rotation.y = 0.45;
    const wood = material(0xa88456);
    const edge = material(0x7c6448);
    const apple = material(0xae6550);
    const pink = material(0xcb9387);
    const eyes = material(0x343d31);
    const cream = material(0xf6e6cb);
    part(this.crate, box, edge, [0, 0.09, 0], [1.12, 0.13, 0.78]);
    for (const y of [0.22, 0.44]) {
      for (const z of [-0.38, 0.38]) part(this.crate, box, wood, [0, y, z], [1.16, 0.17, 0.08]);
      for (const x of [-0.55, 0.55]) part(this.crate, box, wood, [x, y, 0], [0.08, 0.17, 0.78]);
    }
    for (const x of [-0.5, 0.5])
      for (const z of [-0.33, 0.33]) part(this.crate, box, edge, [x, 0.32, z], [0.1, 0.6, 0.1]);
    for (const [x, y, z] of [
      [-0.3, 0.51, 0.13],
      [0.29, 0.52, -0.13],
      [-0.2, 0.57, -0.16],
      [0.17, 0.65, 0.14],
    ]) {
      part(this.crate, ball, apple, [x, y, z], [0.23, 0.21, 0.22]);
      part(this.crate, box, edge, [x, y + 0.23, z], [0.025, 0.09, 0.025]);
    }
    part(this.crate, ball, eyes, [0.23, 0.81, 0.22], [0.09, 0.035, 0.08]);
    const banana = new THREE.Group();
    banana.name = 'market-holy-banana';
    banana.position.set(-0.29, 0.83, 0.27);
    banana.rotation.y = -0.25;
    this.crate.add(banana);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 0.14, 0),
      new THREE.Vector3(-0.16, 0.015, 0),
      new THREE.Vector3(0.06, 0, 0),
      new THREE.Vector3(0.28, 0.12, 0),
    ]);
    part(
      banana,
      own(new THREE.TubeGeometry(curve, 10, 0.065, 5, false)),
      material(0xe3c45e),
      [0, 0, 0],
      [1, 1, 1],
    );
    part(banana, ball, edge, [-0.3, 0.14, 0], [0.035, 0.04, 0.035]);
    part(banana, box, edge, [0.3, 0.17, 0], [0.035, 0.09, 0.035]);
    const halo = part(
      banana,
      own(new THREE.TorusGeometry(0.14, 0.012, 4, 16)),
      brass,
      [0, 0.35, 0],
      [1, 1, 1],
    );
    halo.rotation.x = -Math.PI / 2;
    this.worm = new THREE.Group();
    this.worm.name = 'market-apple-worm';
    this.crate.add(this.worm);
    for (let i = 0; i < 3; i++)
      part(this.worm, ball, pink, [i * 0.018, i * 0.095, 0], [0.075, 0.085, 0.07]);
    part(this.worm, ball, pink, [0.045, 0.29, 0.012], [0.115, 0.11, 0.09]);
    for (const x of [0.005, 0.085]) {
      part(this.worm, ball, cream, [x, 0.315, 0.089], [0.035, 0.04, 0.026]);
      part(this.worm, ball, eyes, [x, 0.315, 0.112], [0.016, 0.02, 0.012]);
    }
    scene.add(this.crate);
    this.update(0);
  }

  update(time) {
    const phase = time % 44;
    const ease = (value) => {
      const t = THREE.MathUtils.clamp(value, 0, 1);
      return t * t * (3 - 2 * t);
    };
    const exposure = phase < 38 ? 1 - ease((phase - 6) / 1.2) : ease((phase - 38) / 2);
    this.worm.visible = exposure > 0.001;
    this.worm.position.set(0.23, 0.43 + exposure * 0.38, 0.22);
    this.worm.rotation.y = Math.sin(time * 0.85) * 0.45 * exposure;
    this.worm.rotation.z = Math.sin(time * 0.6) * 0.08 * exposure;
  }

  dispose() {
    this.scene.remove(this.sword, this.crate);
  }
}
