import * as THREE from 'three';
import { MarketCats } from './cats.js';
import { MarketMoments } from './market-moments.js';

function birdResources() {
  return {
    birdBody: new THREE.IcosahedronGeometry(1, 1),
    birdWing: new THREE.BoxGeometry(0.43, 0.035, 0.24),
    beakGeometry: new THREE.ConeGeometry(0.055, 0.17, 4),
    plumage: new THREE.MeshLambertMaterial({ color: 0x786751, flatShading: true }),
    feather: new THREE.MeshLambertMaterial({ color: 0x4b4b3f, flatShading: true }),
    belly: new THREE.MeshLambertMaterial({ color: 0xddcdae, flatShading: true }),
    beakMaterial: new THREE.MeshLambertMaterial({ color: 0xc7a15b, flatShading: true }),
    eyeMaterial: new THREE.MeshBasicMaterial({ color: 0x222b23 }),
  };
}
function bird({
  birdBody,
  birdWing,
  beakGeometry,
  plumage,
  feather,
  belly,
  beakMaterial,
  eyeMaterial,
}) {
  const group = new THREE.Group();
  const part = (geometry, material, p, scale) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...p);
    m.scale.set(...scale);
    group.add(m);
    return m;
  };
  part(birdBody, plumage, [0, 0, 0], [0.16, 0.16, 0.28]);
  part(birdBody, belly, [0, -0.035, 0.09], [0.14, 0.13, 0.19]);
  const head = part(birdBody, plumage, [0, 0.14, 0.24], [0.14, 0.14, 0.14]);
  for (const side of [-1, 1])
    part(birdBody, eyeMaterial, [side * 0.105, 0.18, 0.31], [0.025, 0.025, 0.025]);
  const beak = part(beakGeometry, beakMaterial, [0, 0.14, 0.42], [1, 1, 1]);
  beak.rotation.x = Math.PI / 2;
  const tail = part(birdWing, feather, [0, -0.03, -0.3], [0.48, 1, 1.6]);
  tail.rotation.x = -0.25;
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.045, 0);
    const wing = new THREE.Mesh(birdWing, feather);
    wing.position.set(side * 0.2, 0, -0.055);
    pivot.add(wing);
    group.add(pivot);
    return pivot;
  });
  group.scale.setScalar(1.35);
  group.userData = { head, wings };
  return group;
}

// Ambient simulation has its own paused clock. No review state or shop position moves.
export class MarketLife {
  constructor(world, onChange = () => {}) {
    this.world = world;
    this.onChange = onChange;
    this.enabled = true;
    this.visible = true;
    this.time = 0;
    this.lastFrame = 0;
    this.lastDraw = 0;
    this.frame = null;
    this.birds = [];
    this.resources = birdResources();
    this.cats = new MarketCats(world.scene);
    this.moments = new MarketMoments(world);
    world.render(true);
    this.visits = 0;
    this.nextVisit = 3;
    this.media = matchMedia('(prefers-reduced-motion: reduce)');
    this.sync = this.sync.bind(this);
    this.tick = this.tick.bind(this);
    document.addEventListener('visibilitychange', this.sync);
    this.media.addEventListener('change', this.sync);
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      this.sync();
    });
    this.observer.observe(world.renderer.domElement);
    this.sync();
  }
  dispose() {
    this.enabled = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.sync);
    this.media.removeEventListener('change', this.sync);
    for (const b of this.birds) this.world.scene.remove(b.object);
    this.birds = [];
    this.cats.dispose();
    this.moments.dispose();
    Object.values(this.resources).forEach((resource) => resource.dispose());
  }
  canMove() {
    return (
      this.enabled &&
      !this.world.contextLost &&
      !this.media.matches &&
      this.visible &&
      !document.hidden
    );
  }
  setEnabled(value) {
    this.enabled = value;
    this.sync();
  }
  sync() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastFrame = 0;
    if (this.canMove()) this.frame = requestAnimationFrame(this.tick);
    else this.world.finishEntrance();
    this.onChange(this.snapshot());
  }
  snapshot() {
    return {
      enabled: this.enabled,
      reducedMotion: this.media.matches,
      running: this.canMove(),
      time: this.time,
      visits: this.visits,
      birds: this.birds.map((b) => ({
        phase: b.phase,
        perch: b.target?.kind,
        position: b.object.position.toArray(),
      })),
      cats: this.cats.animals.map((cat) => ({
        phase: cat.phase,
        position: cat.object.position.toArray(),
      })),
    };
  }
  tick(now) {
    this.frame = null;
    if (!this.canMove()) return;
    if (this.lastFrame) this.time += Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    // Ambient motion is capped at 24 fps; lighting and label layout reuse their caches.
    if (now - this.lastDraw >= 1000 / 24) {
      this.update();
      this.world.render(true);
      this.lastDraw = now;
    }
    this.frame = requestAnimationFrame(this.tick);
  }
  targets(kind) {
    if (kind === 'shop')
      return [...this.world.stalls.values()].map((s) => ({
        kind: 'shop',
        id: s.shop.id,
        resolve: () => {
          const live = this.world.stalls.get(s.shop.id);
          if (!live) return null;
          const p =
            live.type === 2
              ? new THREE.Vector3(-0.75, 3.93, -0.45)
              : live.type === 3
                ? new THREE.Vector3(0, 2.49 - live.wear * 0.08, -0.45)
                : new THREE.Vector3(-0.7, 3.29 - live.wear * 0.08, -0.45);
          live.building.updateWorldMatrix(true, false);
          return live.building.localToWorld(p);
        },
      }));
    return Array.from({ length: 22 }, (_, i) => i)
      .filter((i) => i % 5 !== 0)
      .map((i) => ({
        kind: 'tree',
        id: i,
        resolve: () => {
          const a = (i * Math.PI * 2) / 22 + 0.12,
            r = 20.35 + Math.sin(i * 3) * 0.35,
            size = 1.2 + (i % 3) * 0.35;
          return new THREE.Vector3(
            Math.cos(a) * r + (i % 3 === 0 ? 0 : 0.4 * size),
            (i % 3 === 0 ? 2.5 : 2.4) * size + 0.23,
            Math.sin(a) * r,
          );
        },
      }));
  }
  invite(manual = false) {
    if (this.birds.length >= 2) return false;
    const kind = this.visits % 2 === 0 ? 'shop' : 'tree',
      targets = this.targets(kind);
    if (!targets.length) return false;
    const target = targets[(this.visits * 7 + 4) % targets.length],
      end = target.resolve();
    if (!end) return false;
    const object = bird(this.resources);
    this.world.scene.add(object);
    const start = new THREE.Vector3(this.visits % 2 === 0 ? -29 : 29, 11, -24);
    const b = {
      object,
      target,
      phase: this.canMove() ? 'arriving' : 'perched',
      since: this.time,
      start,
      end,
      duration: 5.2,
    };
    object.position.copy(b.phase === 'perched' ? end : start);
    this.birds.push(b);
    this.visits++;
    this.nextVisit = this.time + 18 + (this.visits % 3) * 5;
    if (b.phase === 'perched') this.fold(b, true);
    this.onChange(this.snapshot());
    if (manual) this.world.render(true);
    return true;
  }
  fold(b, folded) {
    b.object.userData.wings.forEach((w, i) => {
      w.rotation.z = folded ? (i === 0 ? -1.15 : 1.15) : 0;
      w.scale.x = folded ? 0.58 : 1;
    });
  }
  depart(b) {
    b.phase = 'departing';
    b.since = this.time;
    b.start = b.object.position.clone();
    b.end = new THREE.Vector3(b.start.x > 0 ? 32 : -32, 12, 25);
    b.duration = 5.5;
    this.fold(b, false);
  }
  update() {
    const t = this.time;
    this.cats.update(t);
    this.moments.update(t);
    for (const [i, v] of this.world.visitors.entries()) {
      const p = v.object;
      if (v.walking) {
        const a = v.angle + t * 0.095,
          step = t * 5.3 + i;
        p.position.set(
          Math.cos(a) * v.radius,
          0.1 + Math.abs(Math.sin(step)) * 0.035,
          Math.sin(a) * v.radius,
        );
        p.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
        p.userData.legs.forEach((leg, j) => (leg.rotation.x = Math.sin(step + j * Math.PI) * 0.44));
      }
      p.userData.head.rotation.y = Math.sin(t * 0.55 + i) * 0.17;
      p.userData.head.rotation.x = Math.sin(t * 0.8 + i) * 0.035;
    }
    for (const s of this.world.stalls.values()) {
      if (s.owner.visible) {
        s.owner.userData.head.rotation.y = Math.sin(t * 0.5 + s.shop.id) * 0.22;
        s.owner.userData.head.rotation.x = Math.sin(t * 0.75 + s.slot) * 0.04;
        s.owner.scale.y = 1 + Math.sin(t * 1.6 + s.slot) * 0.007;
      }
    }
    if (t >= this.nextVisit && this.birds.length < 2) this.invite();
    for (const b of [...this.birds]) {
      if (b.phase === 'perched') {
        const perch = b.target.resolve();
        if (!perch || t - b.since > 10 + (b.target.id % 5)) {
          this.depart(b);
          continue;
        }
        b.object.position.copy(perch);
        b.object.userData.head.rotation.y = Math.sin(t * 1.2) * 0.28;
        continue;
      }
      const progress = Math.min(1, (t - b.since) / b.duration);
      if (b.phase === 'arriving') {
        const current = b.target.resolve();
        if (current) b.end.copy(current);
        else {
          this.depart(b);
          continue;
        }
      }
      const previous = b.object.position.clone();
      b.object.position.lerpVectors(b.start, b.end, progress);
      b.object.position.y += Math.sin(progress * Math.PI) * (b.phase === 'arriving' ? 3.5 : 2.5);
      const direction = b.object.position.clone().sub(previous);
      if (direction.lengthSq() > 0.00001)
        b.object.rotation.y = Math.atan2(direction.x, direction.z);
      b.object.userData.wings.forEach(
        (wing, i) => (wing.rotation.z = Math.sin(t * 18) * (i === 0 ? 1 : -1) * 0.8),
      );
      if (progress === 1) {
        if (b.phase === 'arriving') {
          b.phase = 'perched';
          b.since = t;
          this.fold(b, true);
          this.onChange(this.snapshot());
        } else {
          this.world.scene.remove(b.object);
          this.birds = this.birds.filter((x) => x !== b);
          this.onChange(this.snapshot());
        }
      }
    }
  }
}
