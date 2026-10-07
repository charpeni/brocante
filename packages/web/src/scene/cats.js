import * as THREE from 'three';

// One small resource pool per market, shared by both cats and released on teardown.
export class MarketCats {
  constructor(scene) {
    this.scene = scene;
    const material = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.resources = {
      shadow: new THREE.CircleGeometry(1, 24),
      shade: new THREE.MeshBasicMaterial({
        color: 0x3d392a,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
      body: new THREE.IcosahedronGeometry(1, 1),
      box: new THREE.BoxGeometry(1, 1, 1),
      ear: new THREE.ConeGeometry(1, 1, 3),
      tail: new THREE.CylinderGeometry(0.065, 0.085, 1, 5),
      ginger: material(0xc78348),
      charcoal: material(0x454b46),
      cream: material(0xf1dfb7),
      nose: material(0xbc826d),
      eyes: new THREE.MeshBasicMaterial({ color: 0x253226 }),
    };
    this.animals = [this.create('ginger', 0), this.create('charcoal', 1)];
    this.update(0);
  }

  create(coat, index) {
    const r = this.resources;
    const object = new THREE.Group();
    object.name = `market-cat-${coat}`;
    object.scale.setScalar(0.55);
    const mesh = (parent, geometry, mat, position, scale) => {
      const part = new THREE.Mesh(geometry, mat);
      part.position.set(...position);
      part.scale.set(...scale);
      part.castShadow = false;
      parent.add(part);
      return part;
    };
    const shadow = mesh(object, r.shadow, r.shade, [0, 0.07, 0], [0.43, 0.7, 1]);
    shadow.rotation.x = -Math.PI / 2;
    const body = mesh(object, r.body, r[coat], [0, 0.46, 0], [0.28, 0.29, 0.56]);
    const chest = mesh(object, r.body, r.cream, [0, 0.48, 0.35], [0.2, 0.23, 0.15]);
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0.45);
    object.add(head);
    mesh(head, r.body, r[coat], [0, 0, 0], [0.26, 0.23, 0.25]);
    const eyes = [];
    for (const x of [-0.17, 0.17]) {
      mesh(head, r.ear, r[coat], [x, 0.25, -0.025], [0.13, 0.28, 0.1]);
      eyes.push(mesh(head, r.body, r.eyes, [x * 0.68, 0.035, 0.213], [0.035, 0.043, 0.03]));
    }
    mesh(head, r.body, r.cream, [0, -0.08, 0.21], [0.14, 0.09, 0.07]);
    mesh(head, r.body, r.nose, [0, -0.035, 0.265], [0.04, 0.027, 0.025]);
    const legs = [];
    for (const z of [-0.33, 0.33]) {
      for (const x of [-0.17, 0.17]) {
        const leg = new THREE.Group();
        leg.position.set(x, 0.36, z);
        mesh(leg, r.box, r[coat], [0, -0.13, 0], [0.12, 0.28, 0.12]);
        mesh(leg, r.box, r.cream, [0, -0.26, 0.025], [0.13, 0.08, 0.18]);
        object.add(leg);
        legs.push(leg);
      }
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.45, -0.48);
    tail.rotation.x = -0.45;
    mesh(tail, r.tail, r[coat], [0, 0.3, 0], [1, 0.6, 1]);
    const tip = mesh(tail, r.tail, r.cream, [0, 0.61, 0.07], [0.8, 0.2, 0.8]);
    tip.rotation.x = 0.8;
    object.add(tail);
    this.scene.add(object);
    return { object, body, chest, head, eyes, legs, tail, index, phase: 'resting' };
  }

  update(time) {
    for (const cat of this.animals) {
      const t = time + cat.index * 17;
      const cycle = Math.floor(t / 36);
      const phase = t % 36;
      const progress = THREE.MathUtils.clamp((phase - 12) / 24, 0, 1);
      // Slow starts/stops; a rest between walks. No independent animation clock.
      const travel = progress * progress * (3 - 2 * progress);
      const walking = progress > 0 && progress < 1;
      const stride = Math.min(1, progress * 12, (1 - progress) * 12);
      const direction = cat.index === 0 ? 1 : -1;
      const angle = 0.95 + cat.index * Math.PI + direction * (cycle + travel) * 0.85;
      // Between the fountain benches and inner shops, away from their footprints.
      const radius = 5.3;
      cat.object.position.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius);
      cat.object.rotation.y = Math.atan2(-Math.sin(angle) * direction, Math.cos(angle) * direction);
      // Settle into a nap, wake, then stretch forward before the next walk.
      // Smoothstep matches the existing gait's gentle starts and stops.
      const ease = (value) => {
        const p = THREE.MathUtils.clamp(value, 0, 1);
        return p * p * (3 - 2 * p);
      };
      const nap = ease(phase / 2) * (1 - ease((phase - 7) / 2));
      const stretch = ease((phase - 9) / 1.2) * (1 - ease((phase - 10.5) / 1.5));
      cat.phase = walking ? 'walking' : phase < 9 ? 'napping' : 'stretching';
      cat.body.scale.set(0.28 + nap * 0.025, 0.29 - nap * 0.09, 0.56 + stretch * 0.12);
      cat.body.position.y = 0.46 - nap * 0.19 - stretch * 0.04;
      cat.body.rotation.x = stretch * 0.18;
      cat.chest.position.y = 0.48 - nap * 0.19 - stretch * 0.13;
      cat.head.position.set(0, 0.72 - nap * 0.36 - stretch * 0.29, 0.45 + stretch * 0.2);
      cat.head.rotation.x = nap * 0.18 + stretch * 0.16;
      cat.eyes.forEach((eye) => (eye.scale.y = 0.043 - nap * 0.035));
      cat.legs.forEach((leg, i) => {
        leg.position.y = 0.36 - nap * 0.12;
        leg.rotation.x =
          Math.sin(time * 5.5 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.36 * stride -
          nap * 0.9 -
          (i >= 2 ? stretch * 0.85 : 0);
      });
      cat.head.rotation.y = Math.sin(time * 0.6 + cat.index) * 0.06 * (1 - nap);
      cat.tail.rotation.x = -0.45 - nap * 0.95 + stretch * 0.3;
      cat.tail.rotation.z = Math.sin(time * 1.3 + cat.index) * 0.14 * (1 - nap);
    }
  }

  dispose() {
    for (const cat of this.animals) this.scene.remove(cat.object);
    this.animals = [];
    Object.values(this.resources).forEach((resource) => resource.dispose());
  }
}
