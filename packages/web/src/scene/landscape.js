import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
];

// Northern Hemisphere meteorological seasons, using the viewer's local date.
export function currentSeason(date = new Date()) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

const palettes = {
  spring: {
    edge: 0x909e79,
    lawn: 0xb8ca99,
    bark: 0x8c7251,
    evergreen: 0x668b66,
    leaves: 0x91ad75,
    leavesLight: 0xa9bd87,
    shrub: 0x86a572,
    grass: 0x75935d,
    flower: 0xe6b5c5,
    blossom: 0xf0ced5,
    litter: 0xc6955b,
    stone: 0xa9ac97,
    snow: 0xdce5df,
  },
  summer: {
    edge: 0x8b9a71,
    lawn: 0xb3bf91,
    bark: 0x8c7251,
    evergreen: 0x5b8163,
    leaves: 0x78976b,
    leavesLight: 0x9cad76,
    shrub: 0x829763,
    grass: 0x718754,
    flower: 0xe9c575,
    blossom: 0xf0ced5,
    litter: 0xc6955b,
    stone: 0xa9ac97,
    snow: 0xdce5df,
  },
  autumn: {
    edge: 0x91886c,
    lawn: 0xbdb28b,
    bark: 0x82664d,
    evergreen: 0x647b60,
    leaves: 0xb67444,
    leavesLight: 0xd5a05e,
    shrub: 0x9b8654,
    grass: 0xa49463,
    flower: 0xd4aa69,
    blossom: 0xf0ced5,
    litter: 0xc68d4f,
    stone: 0xaaa38e,
    snow: 0xdce5df,
  },
  winter: {
    edge: 0x9ca6a1,
    lawn: 0xd2ddd8,
    bark: 0x776b5c,
    evergreen: 0x617b70,
    leaves: 0x91a59a,
    leavesLight: 0xb5c4ba,
    shrub: 0x83948a,
    grass: 0x9c9a84,
    flower: 0xd4aa69,
    blossom: 0xf0ced5,
    litter: 0xc68d4f,
    stone: 0x9ba6a1,
    snow: 0xe5eeea,
  },
};

// One material and merged geometry per botanical role. Seasons only recolor or
// hide these batches; switching never rebuilds the world or allocates GPU resources.
// The containing MarketWorld owns and disposes all resources in group.
export class MarketLandscape {
  constructor() {
    this.group = new THREE.Group();
    this.materials = new Map();
    this.meshes = new Map();
    const source = new THREE.Group();
    const shapes = {
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
      ball: new THREE.IcosahedronGeometry(1, 0),
      cone: new THREE.ConeGeometry(1, 1, 6),
      box: new THREE.BoxGeometry(1, 1, 1),
      edge: new THREE.CylinderGeometry(24.7, 24.4, 0.78, 96),
      lawn: new THREE.CylinderGeometry(24.8, 24.7, 0.2, 96),
    };
    const part = (shape, role, position, scale, rotation = [0, 0, 0]) => {
      if (!this.materials.has(role))
        this.materials.set(role, new THREE.MeshLambertMaterial({ flatShading: true }));
      const mesh = new THREE.Mesh(shapes[shape], this.materials.get(role));
      mesh.userData.role = role;
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rotation);
      source.add(mesh);
      return mesh;
    };
    const branch = (from, to, radius) => {
      const a = new THREE.Vector3(...from),
        b = new THREE.Vector3(...to);
      const direction = b.clone().sub(a);
      const mesh = part('cylinder', 'bark', a.add(b).multiplyScalar(0.5).toArray(), [
        radius,
        direction.length(),
        radius,
      ]);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    };
    part('edge', 'edge', [0, -0.63, 0], [1, 1, 1]);
    part('lawn', 'lawn', [0, -0.18, 0], [1, 1, 1]);
    // Keep the original tree positions and crown heights used by bird perches.
    for (let i = 0; i < 44; i++) {
      const outer = i >= 22;
      const a = ((i % 22) * Math.PI * 2) / 22 + 0.12 + (outer ? Math.PI / 22 : 0);
      if (outer && Math.abs(a - Math.PI / 2) < 0.28) continue;
      const radius = outer ? 22.8 + Math.sin(i * 3) * 0.2 : 20.35 + Math.sin(i * 3) * 0.35;
      const x = Math.cos(a) * radius,
        z = Math.sin(a) * radius;
      if (!outer && i % 5 === 0) {
        part('ball', 'stone', [x, 0.35, z], [0.9, 0.6, 0.65]);
        part('ball', 'snow', [x, 0.83, z], [0.75, 0.13, 0.55]);
        continue;
      }
      const s = outer ? 0.9 + (i % 3) * 0.12 : 1.2 + (i % 3) * 0.35;
      part('cylinder', 'bark', [x, s * 0.55, z], [0.18 * s, s * 1.1, 0.16 * s]);
      if (i % 3 === 0) {
        for (let j = 0; j < 3; j++) {
          const width = s * (1.04 - j * 0.2),
            y = s * (1.15 + j * 0.4);
          part('cone', 'evergreen', [x, y, z], [width, s * 1.1, width]);
          part('cone', 'snow', [x, y + s * 0.22, z], [width * 0.62, s * 0.67, width * 0.62]);
        }
      } else {
        branch([x, s * 0.9, z], [x + s * 0.4, s * 2.4, z], s * 0.09);
        branch([x + s * 0.15, s * 1.5, z], [x - s * 0.55, s * 2, z + s * 0.3], s * 0.065);
        branch([x + s * 0.2, s * 1.7, z], [x + s * 0.6, s * 2.1, z - s * 0.4], s * 0.055);
        part('ball', 'leaves', [x, s * 1.5, z], [s, s * 1.03, s * 0.87]);
        part('ball', 'leavesLight', [x + s * 0.4, s * 1.85, z], [s * 0.65, s * 0.65, s * 0.65]);
        part('ball', 'snow', [x + s * 0.4, s * 2.4, z], [s * 0.22, s * 0.07, s * 0.15]);
        for (let j = 0; j < 5; j++) {
          const angle = j * 2.4 + i;
          part(
            'ball',
            'blossom',
            [
              x + Math.cos(angle) * s * 0.75,
              s * (1.8 + (j % 2) * 0.35),
              z + Math.sin(angle) * s * 0.65,
            ],
            [s * 0.25, s * 0.2, s * 0.23],
          );
          part(
            'box',
            'litter',
            [x + Math.cos(angle) * s, 0.035, z + Math.sin(angle) * s],
            [0.19, 0.02, 0.11],
            [0, angle, 0],
          );
        }
      }
    }
    // Low clusters leave the shops readable and keep the entrance at +Z open.
    for (let i = 0; i < 70; i++) {
      const outer = i >= 42;
      const a = ((outer ? i - 42 : i) * Math.PI * 2) / (outer ? 28 : 42) + 0.18;
      if (Math.abs(a - Math.PI / 2) < 0.24) continue;
      const r = (outer ? 23.2 : 21.7) + (i % 4) * 0.24;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (i % 3 === 0) {
        part('ball', 'shrub', [x, 0.28, z], [0.65, 0.38, 0.48]);
        part('ball', 'shrub', [x + 0.32, 0.2, z + 0.2], [0.44, 0.28, 0.38]);
        part('ball', 'snow', [x, 0.56, z], [0.55, 0.13, 0.4]);
      } else {
        for (let j = 0; j < 4; j++) {
          const angle = j * 2.4 + i;
          const px = x + Math.cos(angle) * 0.35,
            pz = z + Math.sin(angle) * 0.35;
          part(
            'cone',
            'grass',
            [px, 0.13, pz],
            [0.1, 0.4 + (j % 2) * 0.15, 0.09],
            [0.15, angle, 0.18],
          );
          if (j % 2 === 0) part('ball', 'flower', [px, 0.38, pz], [0.13, 0.085, 0.13]);
        }
      }
    }
    source.updateMatrixWorld(true);
    const batches = new Map();
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const role = mesh.userData.role;
      if (!batches.has(role)) batches.set(role, []);
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      batches.get(role).push(geometry.applyMatrix4(mesh.matrixWorld));
    });
    for (const [role, pieces] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(pieces), this.materials.get(role));
      mesh.castShadow = !['edge', 'lawn', 'grass', 'flower', 'litter'].includes(role);
      mesh.receiveShadow = true;
      mesh.name = `landscape-${role}`;
      this.meshes.set(role, mesh);
      this.group.add(mesh);
      pieces.forEach((geometry) => geometry.dispose());
    }
    Object.values(shapes).forEach((geometry) => geometry.dispose());
    this.setSeason(currentSeason());
  }
  setSeason(season) {
    const palette = palettes[season];
    if (!palette) return;
    this.season = season;
    for (const [role, material] of this.materials) material.color.setHex(palette[role]);
    for (const role of ['leaves', 'leavesLight'])
      this.meshes.get(role).visible = season !== 'winter';
    this.meshes.get('snow').visible = season === 'winter';
    this.meshes.get('blossom').visible = season === 'spring';
    this.meshes.get('litter').visible = season === 'autumn';
    this.meshes.get('flower').visible = season === 'spring' || season === 'summer';
  }
}
