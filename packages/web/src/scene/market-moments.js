import * as THREE from 'three';
import { MarketDiscoveries } from './discoveries.js';

// Decorative only: no pick targets, independent timers, or GitHub state.
export class MarketMoments {
  constructor(world) {
    this.world = world;
    this.fishingStartedAt = null;
    this.resources = new Set();
    const own = (resource) => {
      this.resources.add(resource);
      return resource;
    };
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    const ball = own(new THREE.IcosahedronGeometry(1, 1));
    const tube = own(new THREE.CylinderGeometry(1, 1, 1, 6));
    const material = (color, transparent = false) =>
      own(
        new THREE.MeshLambertMaterial({
          color,
          flatShading: true,
          transparent,
          depthWrite: !transparent,
        }),
      );
    const part = (parent, geometry, mat, position, scale) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    };
    const segment = (parent, mat, from, to, width) => {
      const start = new THREE.Vector3(...from);
      const end = new THREE.Vector3(...to);
      const mesh = part(parent, tube, mat, [0, 0, 0], [width, 1, width]);
      this.connect(mesh, start, end);
      return mesh;
    };

    this.balloon = new THREE.Group();
    this.balloon.name = 'market-parcel-balloon';
    const paper = material(0xb8876f, true);
    const parcel = material(0xe1cda4, true);
    const ribbon = material(0x718779, true);
    this.balloonMaterials = [paper, parcel, ribbon];
    part(this.balloon, ball, paper, [0, 1.4, 0], [0.65, 0.83, 0.65]);
    segment(this.balloon, ribbon, [0, 0.6, 0], [0, -0.2, 0], 0.013);
    part(this.balloon, box, parcel, [0, -0.43, 0], [0.52, 0.46, 0.52]);
    part(this.balloon, box, ribbon, [0, -0.43, 0], [0.07, 0.47, 0.53]);
    part(this.balloon, box, ribbon, [0, -0.43, 0], [0.53, 0.47, 0.07]);
    this.balloon.visible = false;
    world.scene.add(this.balloon);

    // Same scale and palette as market visitors. Local +Z faces the fountain.
    this.fisher = new THREE.Group();
    this.fisher.name = 'market-fountain-fisher';
    const shirt = material(0x829b6e);
    const skin = material(0xd0a27c);
    const trousers = material(0x43514a);
    const straw = material(0xc4aa76);
    const wood = material(0x735d43);
    const line = material(0xb5b4a0);
    const red = material(0xb87760);
    part(this.fisher, tube, shirt, [0, 0.96, 0], [0.26, 0.67, 0.23]);
    this.head = new THREE.Group();
    this.head.position.set(0, 1.48, 0);
    this.fisher.add(this.head);
    part(this.head, ball, skin, [0, 0, 0], [0.25, 0.28, 0.25]);
    part(this.head, tube, straw, [0, 0.21, 0], [0.37, 0.055, 0.35]);
    part(this.head, tube, straw, [0, 0.29, -0.015], [0.23, 0.16, 0.22]);
    this.arms = [];
    for (const side of [-1, 1]) {
      const x = side * 0.13;
      part(this.fisher, box, trousers, [x, 0.64, 0.19], [0.18, 0.18, 0.48]);
      part(this.fisher, box, trousers, [x, 0.36, 0.4], [0.16, 0.49, 0.17]);
      part(this.fisher, box, wood, [x, 0.12, 0.47], [0.18, 0.12, 0.28]);
      const shoulder = new THREE.Vector3(side * 0.28, 1.17, 0);
      const elbow = new THREE.Vector3(side * 0.23, 0.87, 0.3);
      const upper = segment(this.fisher, shirt, shoulder.toArray(), elbow.toArray(), 0.075);
      const forearm = segment(this.fisher, shirt, elbow.toArray(), [0.12, 0.98, 0.56], 0.065);
      const hand = part(this.fisher, ball, skin, [0.12, 0.98, 0.56], [0.09, 0.08, 0.09]);
      this.arms.push({ shoulder, elbow, upper, forearm, hand });
    }
    this.rod = new THREE.Group();
    this.rod.position.set(0.12, 0.98, 0.56);
    this.fisher.add(this.rod);
    this.rodTip = new THREE.Vector3(0, 1.15, 2.35);
    segment(this.rod, wood, [0, 0, 0], this.rodTip.toArray(), 0.023);
    this.thread = segment(this.fisher, line, [0, 0, 0], [0, 1, 0], 0.007);
    this.bobber = part(this.fisher, ball, red, [0.12, 0.67, 2.91], [0.06, 0.1, 0.06]);
    this.ripple = part(
      this.fisher,
      own(new THREE.RingGeometry(0.8, 1, 24)),
      own(
        new THREE.MeshBasicMaterial({
          color: 0xdce9df,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      ),
      [0.12, 0.695, 2.91],
      [0.1, 0.1, 0.1],
    );
    this.ripple.rotation.x = -Math.PI / 2;
    const angle = 0.45;
    this.fisher.position.set(Math.cos(angle) * 4.2, 0.08, Math.sin(angle) * 4.2);
    this.fisher.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle));
    world.scene.add(this.fisher);
    this.discoveries = new MarketDiscoveries({
      scene: world.scene,
      box,
      ball,
      tube,
      part,
      material,
      own,
    });
    this.hintTargets = {
      gift: this.balloon,
      sword: this.discoveries.sword,
      worm: this.discoveries.crate,
    };
    this.update(0);
  }

  connect(mesh, start, end) {
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.y = start.distanceTo(end);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.clone().sub(start).normalize(),
    );
  }

  update(time) {
    this.discoveries.update(time);
    // 40-second passes separated by more than four quiet minutes, on the life clock.
    const elapsed = (time - 15) % 300;
    this.balloon.visible = time >= 15 && elapsed < 40;
    if (this.balloon.visible) {
      const progress = elapsed / 40;
      this.balloon.position.set(
        -29 + progress * 58,
        3.6 + Math.sin(progress * Math.PI * 2) * 0.35,
        -25.5,
      );
      this.balloon.rotation.z = Math.sin(elapsed * 0.55) * 0.045;
      const opacity = Math.min(1, elapsed / 4, (40 - elapsed) / 4);
      this.balloonMaterials.forEach((mat) => (mat.opacity = opacity));
    }
    const winter = this.world.landscape.season === 'winter';
    // A brief cast every 48 active seconds, with a long, quiet wait in between.
    // Winter's frozen fountain stays still. All poses derive from the paused clock.
    if (this.world.entranceReady && this.fishingStartedAt === null) this.fishingStartedAt = time;
    const fishingTime = this.fishingStartedAt === null ? -1 : time - this.fishingStartedAt - 0.8;
    const phase = fishingTime >= 0 && !winter ? fishingTime % 48 : 48;
    const ease = (p) => {
      const value = THREE.MathUtils.clamp(p, 0, 1);
      return value * value * (3 - 2 * value);
    };
    const winding = phase < 1.4;
    const release = phase >= 1.4 && phase < 3.6;
    const lift = winding ? ease(phase / 1.4) : 1 - ease((phase - 1.4) / 0.45);
    const swing = winding
      ? -1.5 * lift
      : phase < 1.85
        ? THREE.MathUtils.lerp(-1.5, 0.12, ease((phase - 1.4) / 0.45))
        : 0.12 * (1 - ease((phase - 1.85) / 1.15));
    this.fishingPhase = winding ? 'winding' : release ? 'casting' : 'waiting';
    this.head.rotation.x = 0.09 + Math.sin(time * 0.3) * 0.025 - lift * 0.12;
    this.head.rotation.y = Math.sin(time * 0.17) * 0.07;
    this.rod.position.set(0.12, 0.98 + lift * 0.22, 0.56 - lift * 0.15);
    this.rod.rotation.x = swing;
    this.rod.updateMatrix();
    const tip = this.rodTip.clone().applyMatrix4(this.rod.matrix);
    const water = new THREE.Vector3(0.12, 0.67, 2.91);
    this.bobber.position.copy(water);
    if (winding) {
      this.bobber.position.lerp(tip.clone().add(new THREE.Vector3(0, -0.45, 0)), lift);
      this.bobber.position.y += Math.sin(time * 1.4) * 0.018 * (1 - ease(phase / 0.3));
    } else if (release) {
      const progress = (phase - 1.4) / 2.2;
      const start = this.rodTip
        .clone()
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -1.5)
        .add(new THREE.Vector3(0.12, 1.2 - 0.45, 0.41));
      // A high, short arc lands inside the basin, never in the surrounding stalls.
      this.bobber.position
        .copy(start)
        .multiplyScalar((1 - progress) ** 2)
        .addScaledVector(new THREE.Vector3(0.12, 4, 1.6), 2 * (1 - progress) * progress)
        .addScaledVector(water, progress ** 2);
    } else if (!winter) {
      this.bobber.position.y += Math.sin(time * 1.4) * 0.018 * ease((phase - 3.6) / 0.5);
    }
    for (const arm of this.arms) {
      const elbow = arm.elbow.clone().add(new THREE.Vector3(0, lift * 0.16, -lift * 0.1));
      this.connect(arm.upper, arm.shoulder, elbow);
      this.connect(arm.forearm, elbow, this.rod.position);
      arm.hand.position.copy(this.rod.position);
    }
    const splash = (phase - 3.6) / 1;
    this.ripple.visible = splash >= 0 && splash < 1;
    if (this.ripple.visible) {
      this.ripple.scale.setScalar(0.08 + splash * 0.3);
      this.ripple.material.opacity = (1 - splash) * 0.45;
    }
    this.connect(this.thread, tip, this.bobber.position);
  }

  dispose() {
    this.discoveries.dispose();
    this.world.scene.remove(this.balloon, this.fisher);
    this.resources.forEach((resource) => resource.dispose());
    this.resources.clear();
  }
}
