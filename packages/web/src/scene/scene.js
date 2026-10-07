import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shopAge, wearStage } from './age.js';
import { createBench } from './bench.js';
import { createQuestSelection } from './selection.js';
import { MarketLandscape } from './landscape.js';
import { MarketEntrance } from './entrance.js';

const PALETTE = {
  Frontend: 0x4f897e,
  API: 0xc97954,
  Security: 0x847ba1,
  Data: 0xd3af58,
  Infra: 0x68899c,
};

// Same strong ease-out curve as the UI motion guidance: cubic-bezier(.23, 1, .32, 1).
function easeOut(progress) {
  let lo = 0,
    hi = 1,
    t = progress;
  for (let i = 0; i < 12; i++) {
    const x = 3 * (1 - t) * (1 - t) * t * 0.23 + 3 * (1 - t) * t * t * 0.32 + t * t * t;
    if (x < progress) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return 1 - Math.pow(1 - t, 3);
}

const STATES = {
  awaiting: 0x396e4a,
  requested: 0x396e4a,
  draft: 0x8b8170,
  author: 0xc0763d,
  ready: 0x8b7b9a,
};
const stateTextures = new Map();

function stateTexture(status) {
  if (stateTextures.has(status)) return stateTextures.get(status);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const [title, subtitle, color] = {
    awaiting: ['OPEN', 'REVIEW WELCOME', '#245b41'],
    requested: ['OPEN', 'REVIEW REQUESTED', '#245b41'],
    draft: ['BACK SOON', 'DRAFT', '#716757'],
    author: ['BACK SOON', 'AUTHOR ACTION', '#8b4b35'],
    ready: ['CLOSED', 'APPROVED', '#64556f'],
  }[status];
  ctx.fillStyle = '#f7eed6';
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = color;
  ctx.fillRect(8, 8, 496, 176);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fffaf0';
  ctx.font = `bold ${title.length > 6 ? 66 : 94}px Arial, sans-serif`;
  ctx.fillText(title, 256, 79);
  ctx.font = 'bold 27px Arial, sans-serif';
  ctx.fillText(subtitle, 256, 153);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  stateTextures.set(status, texture);
  return texture;
}

const materials = new Map();

const material = (color) => {
  if (!materials.has(color))
    materials.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return materials.get(color);
};

const cube = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const ball = new THREE.IcosahedronGeometry(1, 0);
const cone = new THREE.ConeGeometry(1, 1, 6);

function mesh(parent, geometry, color, position, scale, rotation) {
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(...position);
  m.scale.set(...scale);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const box = (p, c, pos, scale, rot) => mesh(p, cube, c, pos, scale, rot);

const cyl = (p, c, pos, scale, rot) => mesh(p, cylinder, c, pos, scale, rot);

const sphere = (p, c, pos, scale) => mesh(p, ball, c, pos, scale);

function bake(source) {
  // Merge the static pieces by material so busy markets don't draw each plank separately.
  source.updateMatrixWorld(true);
  const batches = new Map();
  source.traverse((m) => {
    if (!m.isMesh) return;
    if (!batches.has(m.material)) batches.set(m.material, []);
    batches.get(m.material).push(m.geometry.clone().applyMatrix4(m.matrixWorld));
  });
  const out = new THREE.Group();
  for (const [mat, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
    geometries.forEach((g) => g.dispose());
  }
  return out;
}

function person(shirt, seed = 0) {
  const p = new THREE.Group();
  const skin = [0xd0a27c, 0x9f7052, 0xf0c8a0, 0xb88c65][seed % 4];
  cyl(p, shirt, [0, 0.77, 0], [0.26, 0.67, 0.23]);
  box(p, shirt, [-0.32, 0.81, 0], [0.13, 0.47, 0.17], [0, 0, -0.18]);
  box(p, shirt, [0.32, 0.81, 0], [0.13, 0.47, 0.17], [0, 0, 0.18]);
  const body = bake(p),
    headSource = new THREE.Group();
  sphere(headSource, skin, [0, 0, 0], [0.25, 0.28, 0.25]);
  sphere(
    headSource,
    [0x594738, 0x332f2a, 0x875d3c][seed % 3],
    [0, 0.15, -0.04],
    [0.26, 0.17, 0.23],
  );
  const head = bake(headSource);
  head.position.y = 1.3;
  body.add(head);
  const legs = [-0.13, 0.13].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.47, 0);
    box(leg, 0x43514a, [0, -0.23, 0], [0.18, 0.47, 0.2]);
    body.add(leg);
    return leg;
  });
  body.userData.head = head;
  body.userData.legs = legs;
  body.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.userData.ambientMover = true;
    }
  });
  return body;
}

function crate(p, x, z, s = 0.62) {
  box(p, 0xb58b5d, [x, s / 2, z], [s, s, s]);
  for (let i = 0; i < 3; i++)
    box(p, 0x8d6947, [x, 0.15 + (i * s) / 3, z + s / 2 + 0.008], [s, 0.045, 0.025]);
}

function stallGeometry(skill, type, wear = 0) {
  const fade = (color, target, amount) =>
    new THREE.Color(color).lerp(new THREE.Color(target), amount).getHex();
  const g = new THREE.Group(),
    color = fade(PALETTE[skill], 0xa99f80, wear * 0.22);
  const wood = fade(0x8e6848, 0x908c78, wear * 0.22),
    pale = fade(0xf5e7c6, 0xa99b77, wear * 0.18);
  if (type === 2) {
    // A handcart under a small parasol.
    box(g, wood, [0, 1.0, 0.1], [2.4, 0.55, 1.2]);
    box(g, pale, [0, 1.31, 0.1], [2.53, 0.09, 1.3]);
    for (const x of [-0.87, 0.87])
      cyl(g, 0x51493b, [x, 0.45, 0.1], [0.4, 0.15, 0.4], [0, 0, Math.PI / 2]);
    box(g, wood, [1.65, 0.8, 0.1], [1.1, 0.1, 0.1]);
    cyl(g, wood, [-0.75, 1.8, -0.45], [0.055, 3.6, 0.055]);
    const umbrella = mesh(
      g,
      new THREE.ConeGeometry(1.7, 0.6, 8, 1, true),
      color,
      [-0.75, 3.4, -0.45],
      [1, 1, 1],
    );
    umbrella.material = material(color);
    umbrella.rotation.z = wear * 0.07;
    cyl(g, pale, [-0.75, 3.71, -0.45], [0.09, 0.12, 0.09]);
  } else if (type === 3) {
    // Low tables and a tent; the roof is visibly temporary canvas.
    for (const x of [-1.25, 1.25]) box(g, wood, [x, 0.85, 0], [0.08, 1.7, 0.08]);
    box(g, wood, [0, 0.6, 0.55], [2.3, 0.13, 0.95]);
    box(g, wood, [-0.9, 0.3, 0.55], [0.12, 0.6, 0.7]);
    box(g, wood, [0.9, 0.3, 0.55], [0.12, 0.6, 0.7]);
    box(
      g,
      color,
      [-0.67, 1.95 - wear * 0.07, -0.36],
      [1.6, 0.07, 2.65],
      [0, 0, 0.48 - wear * 0.045],
    );
    box(
      g,
      pale,
      [0.67, 1.95 - wear * 0.07, -0.36],
      [1.6, 0.07, 2.65],
      [0, 0, -0.48 + wear * 0.035],
    );
    box(g, wood, [0, 1.2, -1.3], [0.08, 2.4, 0.08]);
  } else {
    // Folding tables, timber poles, alternating canvas stripes.
    for (const x of [-1.22, 1.22])
      for (const z of [-0.85, 0.9]) box(g, wood, [x, 1.45, z], [0.09, 2.9, 0.09]);
    box(g, wood, [0, 1.13, 0.52], [2.65, 0.18, 1.12]);
    box(g, color, [0, 0.69, 1.045], [2.55, 0.72, 0.07]);
    for (const x of [-1.05, 1.05]) box(g, wood, [x, 0.6, 0.5], [0.11, 1.2, 0.95]);
    for (let stripe = 0; stripe < 7; stripe++) {
      const x = (stripe - 3) * 0.43;
      const shade = stripe % 2 ? pale : color;
      const sag = wear * 0.1 * (1 - Math.abs(x) / 1.6);
      box(g, shade, [x, 3.05 - sag, -0.05], [0.432, 0.095, 2.3], [-0.12, 0, wear * x * 0.045]);
      box(
        g,
        shade,
        [x, 2.79 - sag, 1.08],
        [0.432, wear >= 2 && stripe % 2 ? 0.12 : 0.28, 0.075],
        [0, 0, wear * x * 0.045],
      );
      if (wear >= 2 && stripe % 2) {
        for (let i = 0; i < 3; i++)
          box(
            g,
            shade,
            [x + (i - 1) * 0.13, 2.62 - sag - (i % 2) * 0.09, 1.08],
            [0.07, 0.19 + (i % 2) * 0.16, 0.04],
            [0, 0, 0.1 * (i - 1)],
          );
      }
    }
    box(g, wood, [0, 2.67, 1.12], [3.05, 0.075, 0.085]);
  }
  // Maps, books, little wrapped parcels: a booth selling ideas rather than produce.
  box(g, 0xe5d6b3, [-0.55, type === 3 ? 0.71 : 1.35, 0.5], [0.65, 0.08, 0.49], [0, -0.16, 0]);
  box(g, 0x627d75, [0.3, type === 3 ? 0.73 : 1.4, 0.6], [0.48, 0.16, 0.4], [0, 0.13, 0]);
  crate(g, 1.5, -0.55);
  if (type % 2 === 0) crate(g, -1.5, -0.55, 0.5);
  // Wooden signboard on the front edge of the booth.
  const sign = new THREE.Group();
  box(sign, 0x72553e, [0, 0, 0], [1.48, 0.48, 0.07]);
  box(sign, pale, [0, 0.01, 0.045], [1.3, 0.3, 0.022]);
  sign.position.set(0, type === 3 ? 0.85 : 1.62, 1.17);
  sign.rotation.z = -wear * 0.085;
  g.add(sign);
  if (wear > 0) {
    // Mud, scuffs, and fallen leaves accumulate without obscuring the PR's sign.
    for (let i = 0; i < wear * 3; i++) {
      const a = i * 2.399 + type;
      box(
        g,
        i % 2 ? 0xa08852 : 0x958c68,
        [Math.cos(a) * 1.56, 0.073, Math.sin(a) * 1.29],
        [0.18, 0.025, 0.1],
        [0, a, 0],
      );
    }
  }
  if (wear >= 2) {
    // Weeds along the edges and ivy climbing a pole make age visible from a distance.
    for (let i = 0; i < (wear === 3 ? 12 : 5); i++) {
      const a = i * 2.399 + 0.6,
        x = Math.cos(a) * 1.63,
        z = Math.sin(a) * 1.35;
      for (let j = 0; j < 3; j++)
        mesh(
          g,
          cone,
          j % 2 ? 0x697e47 : 0x87915a,
          [x + (j - 1) * 0.13, 0.19 + (j % 2) * 0.13, z],
          [0.13, 0.4 + (j % 2) * 0.25, 0.09],
          [0, a, (j - 1) * 0.3],
        );
    }
    const ivyHeight = wear === 3 ? 2.3 : 0.8;
    box(g, 0x60794b, [-1.25, ivyHeight / 2, 0.94], [0.06, ivyHeight, 0.07]);
    for (let i = 0; i < (wear === 3 ? 9 : 3); i++)
      sphere(
        g,
        i % 2 ? 0x829057 : 0x697c4b,
        [-1.25 + (i % 2 ? 0.14 : -0.12), 0.22 + i * 0.24, 0.98],
        [0.21, 0.16, 0.1],
      );
  }
  if (wear === 3) {
    // Small cobwebs under the canvas, made from static thread geometry.
    const web = new THREE.Group();
    const thread = (ax, ay, bx, by) => {
      const d = new THREE.Vector3(bx - ax, by - ay, 0);
      const m = box(web, 0xded7bf, [(ax + bx) / 2, (ay + by) / 2, 0], [0.018, d.length(), 0.018]);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    };
    for (let i = 1; i <= 3; i++) thread(0, -i * 0.2, i * 0.22, 0);
    for (let i = 0; i <= 3; i++) thread(0, 0, i * 0.22, -0.6 + i * 0.2);
    web.position.set(-1.19, type === 3 ? 1.65 : type === 2 ? 2.48 : 2.58, 1.14);
    g.add(web);
    box(g, 0x8e8063, [1.55, 0.12, 0.85], [0.85, 0.07, 0.17], [0, -0.5, 0.1]);
  }
  return bake(g);
}

function decoration() {
  const g = new THREE.Group();
  const ground = mesh(
    g,
    new THREE.CylinderGeometry(19.2, 19.5, 0.14, 96),
    0xd5c7a4,
    [0, -0.02, 0],
    [1, 1, 1],
  );
  ground.receiveShadow = true;
  // Thin concentric cobblestone bands establish a plaza rather than a street.
  for (const radius of [5.0, 11.7, 18.4]) {
    const ring = mesh(
      g,
      new THREE.RingGeometry(radius, radius + 0.22, 96),
      0xb1aa8d,
      [0, 0.055, 0],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
    );
    ring.castShadow = false;
  }
  for (let i = 0; i < 100; i++) {
    const a = i * 2.39996,
      r = 5.4 + ((i * 13) % 125) / 10;
    box(
      g,
      i % 3 ? 0xccbf9f : 0xdfd2b3,
      [Math.cos(a) * r, 0.065, Math.sin(a) * r],
      [0.35 + (i % 3) * 0.12, 0.025, 0.28],
      [0, a, 0],
    );
  }
  // A little central fountain with a seating ring.
  cyl(g, 0xb2afa0, [0, 0.15, 0], [3.55, 0.28, 3.55]);
  cyl(g, 0xe0d7ba, [0, 0.36, 0], [2.8, 0.45, 2.8]);
  cyl(g, 0xa8ac98, [0, 0.64, 0], [2.43, 0.16, 2.43]);
  cyl(g, 0x78aaa8, [0, 0.74, 0], [2.13, 0.06, 2.13]);
  cyl(g, 0xd8d0b5, [0, 1.15, 0], [0.3, 0.88, 0.3]);
  cyl(g, 0xe8ddbf, [0, 1.57, 0], [0.94, 0.19, 0.94]);
  cyl(g, 0x8eb8b0, [0, 1.68, 0], [0.77, 0.04, 0.77]);
  sphere(g, 0xe2d7b8, [0, 2, 0], [0.25, 0.28, 0.25]);
  for (let i = 0; i < 4; i++) g.add(createBench(i));
  // Entrance posts and bunting across a small arc, well outside the reading area.
  for (const x of [-4, 4]) cyl(g, 0x8e7655, [x, 2.0, 18.6], [0.095, 4.0, 0.095]);
  for (let i = 0; i < 12; i++) {
    const x = -4 + (i * 8) / 11,
      y = 3.9 - Math.sin((i / 11) * Math.PI) * 0.48;
    box(g, 0x8e7655, [x, y, 18.6], [0.75, 0.025, 0.025]);
    mesh(
      g,
      cone,
      [0xc8835c, 0xebd7a0, 0x729c8c][i % 3],
      [x, y - 0.18, 18.6],
      [0.19, 0.37, 0.04],
      [Math.PI, 0, 0],
    );
  }
  const result = bake(g);
  result.userData.visitors = [];
  // Market visitors make the clearing feel inhabited without moving information.
  for (let i = 0; i < 9; i++) {
    // One visitor now sits fishing on the fountain bench (owned by MarketLife).
    if (i === 1) continue;
    const a = i * 2.4,
      r = 4.4 + (i % 3) * 0.63;
    const p = person([0xc58c56, 0x708f9d, 0xb26e59, 0x829b6e][i % 4], i);
    p.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    p.rotation.y = a;
    result.add(p);
    const walking = i % 4 === 0;
    if (walking)
      p.traverse((m) => {
        if (m.isMesh) m.castShadow = false;
      });
    result.userData.visitors.push({
      object: p,
      angle: a,
      radius: walking ? 5.8 + (i % 2) * 0.3 : r,
      walking,
    });
  }
  return result;
}

// SwiftShader and llvmpipe still create contexts despite failIfMajorPerformanceCaveat, so check the renderer name.
function softwareRenderer() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return false;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /swiftshader|llvmpipe|software/i.test(name);
}

export class MarketWorld {
  constructor(container, onChoose, onHover) {
    this.container = container;
    this.onChoose = onChoose;
    this.onHover = onHover;
    this.width = 1;
    this.height = 1;
    this.angle = 0.64;
    this.zoom = 1;
    this.selected = null;
    this.shadowsDirty = true;
    this.contextLost = false;
    this.entranceReady = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe6e8d8);
    this.camera = new THREE.OrthographicCamera(-30, 30, 25, -25, 0.1, 180);
    // Without GPU acceleration every frame is rasterized on the CPU; skip MSAA and shadow maps there.
    const software = softwareRenderer();
    this.renderer = new THREE.WebGLRenderer({ antialias: !software, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = !software;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Circular 3D review market. Use shop signs, the List button, or the Skip to pull requests link to select a PR.',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    container.prepend(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xfff5df, 0x7e9272, 2.5));
    const sun = new THREE.DirectionalLight(0xffefcf, 3.0);
    sun.position.set(-16, 32, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -30,
      right: 30,
      top: 30,
      bottom: -30,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.sun = sun;
    this.landscape = new MarketLandscape();
    this.scene.add(this.landscape.group);
    this.decoration = decoration();
    this.scene.add(this.decoration);
    this.fountainWater = this.decoration.children
      .filter((node) => [0x78aaa8, 0x8eb8b0].includes(node.material?.color.getHex()))
      .map((node) => {
        const originalColor = node.material.color.getHex();
        node.material = node.material.clone();
        return { material: node.material, originalColor };
      });
    this.visitors = this.decoration.userData.visitors;
    this.stalls = new Map();
    this.templates = new Map();
    this.hitboxes = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.orbitAxis = new THREE.Vector3(0, 1, 0);
    const selection = createQuestSelection(this.scene);
    this.halo = selection.halo;
    this.selectionMarker = selection.marker;
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      if (this.disposed) return;
      e.preventDefault();
      this.contextLost = true;
      this.finishEntrance();
      this.onContextLost?.();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      if (this.disposed) return;
      this.contextLost = false;
      this.shadowsDirty = true;
      this.onContextRestored?.();
      this.render();
    });
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  dispose() {
    this.disposed = true;
    this.onEntranceComplete = null;
    this.finishEntrance();
    this.animations?.clear();
    this.resizeObserver.disconnect();
    this.onRender = null;
    this.onContextLost = null;
    this.onContextRestored = null;
    const geometries = new Set(),
      mats = new Set(),
      textures = new Set();
    const collect = (object) =>
      object.traverse((node) => {
        if (node.geometry) geometries.add(node.geometry);
        for (const mat of Array.isArray(node.material)
          ? node.material
          : node.material
            ? [node.material]
            : []) {
          mats.add(mat);
          for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
        }
      });
    collect(this.scene);
    for (const template of this.templates.values()) collect(template);
    for (const mat of materials.values()) mats.add(mat);
    for (const texture of stateTextures.values()) textures.add(texture);
    for (const geometry of [cube, cylinder, ball, cone]) geometries.add(geometry);
    textures.forEach((texture) => texture.dispose());
    mats.forEach((mat) => mat.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  positions(count) {
    const rings =
      count > 36
        ? [
            { n: 14, r: 7.9 },
            { n: 21, r: 12.6 },
            { n: 25, r: 17.2 },
          ]
        : [
            { n: 10, r: 8.1 },
            { n: 14, r: 14.2 },
          ];
    const points = [];
    for (let ring = 0; ring < rings.length; ring++) {
      const { n, r } = rings[ring];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (ring % 2 ? 0.18 : 0),
          rr = r + Math.sin(i * 8.12) * 0.26;
        points.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, a, scale: count > 36 ? 0.73 : 1 });
      }
    }
    return points;
  }

  setShops(shops, clockHours = this.clockHours ?? 0) {
    if (this.entrance) this.finishEntrance();
    this.shadowsDirty = true;
    this.clockHours = clockHours;
    this.layoutCapacity = shops.length > 24 ? 60 : 24;
    const positions = this.positions(this.layoutCapacity);
    for (const [id, s] of this.stalls)
      if (!shops.some((p) => p.id === id)) {
        this.scene.remove(s.group);
        s.ownedGeometries.forEach((geometry) => geometry.dispose());
        s.ownedMaterials.forEach((mat) => mat.dispose());
        this.stalls.delete(id);
      }
    if (!this.stalls.has(this.selected)) {
      this.halo.visible = false;
      this.selectionMarker.visible = false;
    }
    this.hitboxes = [];
    // Oldest arrivals occupy the inner rings. Reconcile only when stalls enter/leave;
    // browsing, flag handoffs, filters, and the age preview never shuffle positions.
    const byArrival = [...shops].sort((a, b) => a.openedAtHours - b.openedAtHours || a.id - b.id);
    byArrival.forEach((shop, i) => {
      let s = this.stalls.get(shop.id);
      if (!s) {
        const slot = i,
          type = ((shop.id % 4) + 4) % 4;
        const wear = wearStage(shopAge(shop, clockHours));
        const key = shop.skill + ':' + type + ':' + wear;
        if (!this.templates.has(key))
          this.templates.set(key, stallGeometry(shop.skill, type, wear));
        const group = new THREE.Group(),
          building = new THREE.Group(),
          structure = this.templates.get(key).clone(true);
        // Plot, people, signs and hitbox stay fixed. Only the building responds to diff size.
        box(group, PALETTE[shop.skill], [0, 0.025, 0], [3.2, 0.055, 2.8]);
        box(group, 0xf5e7c6, [0, 0.065, 1.32], [2.9, 0.03, 0.1]);
        building.add(structure);
        group.add(building);
        const owner = person(PALETTE[shop.skill], i);
        owner.position.set(0.3, 0.1, -0.55);
        group.add(owner);
        // A legible sign belongs to every physical stall, even when PR labels are hidden.
        const stateSign = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: stateTexture(shop.status) }),
        );
        stateSign.userData.shopId = shop.id;
        stateSign.position.set(0, 3.9, 1.3);
        stateSign.scale.set(3.3, 1.24, 1);
        group.add(stateSign);
        const closedFront = new THREE.Group();
        const frontHeight = type === 3 ? 1.28 : type === 2 ? 1.05 : 2.0;
        box(closedFront, 0xaaa38c, [0, frontHeight / 2 + 0.2, 1.28], [2.52, frontHeight, 0.085]);
        for (let row = 0; row < 6; row++)
          box(
            closedFront,
            0x87836e,
            [0, 0.25 + (row * frontHeight) / 6, 1.335],
            [2.52, 0.028, 0.025],
          );
        box(closedFront, 0x776e58, [0, 0.28, 1.34], [2.64, 0.11, 0.09]);
        building.add(closedFront);
        cyl(group, 0x826d4f, [1.6, 2.1, -0.15], [0.045, 4.2, 0.045]);
        const flagPivot = new THREE.Group();
        flagPivot.position.set(1.6, 4.1, -0.15);
        group.add(flagPivot);
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.52, 0.045),
          new THREE.MeshLambertMaterial({ color: STATES.awaiting, flatShading: true }),
        );
        flag.position.set(0.43, -0.13, 0);
        flag.castShadow = true;
        flagPivot.add(flag);
        sphere(group, 0xd9ba66, [1.6, 4.26, -0.15], [0.08, 0.08, 0.08]);
        const hitbox = new THREE.Mesh(
          new THREE.BoxGeometry(3.5, 4, 3),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        hitbox.position.y = 2;
        hitbox.userData.shopId = shop.id;
        group.add(hitbox);
        // Template meshes and primitive geometry are shared. Only these allocations
        // belong to this shop and must be released when the PR leaves the market.
        const ownedGeometries = new Set([flag.geometry, hitbox.geometry]);
        for (const character of [owner])
          character.traverse((node) => {
            if (node.geometry && ![cube, cylinder, ball, cone].includes(node.geometry))
              ownedGeometries.add(node.geometry);
          });
        const ownedMaterials = new Set([flag.material, hitbox.material, stateSign.material]);
        s = {
          ownedGeometries,
          ownedMaterials,
          group,
          building,
          structure,
          owner,
          stateSign,
          closedFront,
          flagPivot,
          flag,
          hitbox,
          shop,
          slot,
          type,
          wear,
        };
        this.stalls.set(shop.id, s);
        this.scene.add(group);
      }
      s.slot = i;
      // New arrivals take the outermost available position, including spare perimeter spaces.
      let point = positions[s.slot];
      if (!point) {
        const a = ((s.slot - positions.length) * Math.PI) / 6 + 0.26;
        point = { x: Math.sin(a) * 18, z: Math.cos(a) * 18, a, scale: 0.66 };
      }
      s.group.position.set(point.x, 0.09, point.z);
      s.group.scale.setScalar(point.scale);
      // Face the open clearing, with slightly irregular placement like a weekend fair.
      s.group.rotation.y = Math.atan2(-point.x, -point.z) + Math.sin(s.slot * 3.7) * 0.12;
      s.shop = shop;
      s.building.scale.set(
        shop.size === 'compact' ? 0.82 : 1,
        shop.size === 'compact' ? 0.9 : 1,
        shop.size === 'compact' ? 0.82 : 1,
      );
      s.flag.material.color.setHex(STATES[shop.status]);
      s.flagPivot.position.y = ['author', 'draft', 'ready'].includes(shop.status) ? 2.02 : 4.1;
      s.flagPivot.rotation.z = ['author', 'draft', 'ready'].includes(shop.status) ? -0.85 : 0;
      this.updateShopFront(s);
      this.hitboxes.push(s.hitbox, s.stateSign);
    });
    this.render();
  }

  updateShopFront(s) {
    const closed = ['author', 'draft', 'ready'].includes(s.shop.status);
    s.closedFront.visible = closed;
    s.owner.visible = !closed;
    s.stateSign.material.map = stateTexture(s.shop.status);
  }

  setAge(clockHours) {
    this.shadowsDirty = true;
    this.clockHours = clockHours;
    for (const s of this.stalls.values()) {
      const wear = wearStage(shopAge(s.shop, clockHours));
      if (wear === s.wear) continue;
      const key = s.shop.skill + ':' + s.type + ':' + wear;
      if (!this.templates.has(key))
        this.templates.set(key, stallGeometry(s.shop.skill, s.type, wear));
      s.building.remove(s.structure);
      // Filtered materials are local clones; cached geometry stays shared.
      s.structure.traverse((m) => {
        if (m.isMesh && s.ownedMaterials.delete(m.material)) m.material.dispose();
      });
      s.structure = this.templates.get(key).clone(true);
      s.building.add(s.structure);
      s.wear = wear;
    }
    // The caller refreshes filters and renders once after all shops have aged.
  }

  highlight(ids, selected) {
    this.shadowsDirty = true;
    this.selected = selected;
    for (const [id, s] of this.stalls) {
      const dim = !ids.has(id);
      s.group.traverse((m) => {
        if ((!m.isMesh && !m.isSprite) || m === s.hitbox) return;
        // Clone only on first filter use, keeping geometry shared.
        if (!s.ownedMaterials.has(m.material)) {
          m.material = m.material.clone();
          s.ownedMaterials.add(m.material);
        }
        m.material.transparent = dim;
        m.material.opacity = dim ? 0.17 : 1;
        if (m.material.emissive) m.material.emissive.setHex(id === selected ? 0x30210b : 0x000000);
        m.castShadow = !dim && !m.userData.ambientMover;
      });
    }
    const active = ids.has(selected) ? this.stalls.get(selected) : undefined;
    this.halo.visible = !!active;
    this.selectionMarker.visible = !!active;
    if (active) {
      this.halo.position.x = active.group.position.x;
      this.halo.position.z = active.group.position.z;
      this.halo.scale.setScalar(active.group.scale.x);
      this.selectionMarker.position.copy(active.group.position);
      this.selectionMarker.position.y += 4.8 * active.group.scale.y;
    }
    this.render();
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.updateCamera();
    this.render();
  }

  updateCamera() {
    const aspect = this.width / this.height,
      span = Math.max(46, 50 / aspect);
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.zoom = this.zoom;
    this.camera.position.set(Math.sin(this.angle) * 48, 47, Math.cos(this.angle) * 48);
    this.camera.position.add(this.lookTarget);
    this.camera.lookAt(this.lookTarget);
    const offsetX = this.width > 700 && this.selected ? this.width * 0.13 : 0;
    const offsetY = 0;
    this.camera.setViewOffset(this.width, this.height, offsetX, offsetY, this.width, this.height);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  render(ambientOnly = false) {
    if (this.disposed || this.contextLost) return;
    if (!ambientOnly) this.updateCamera();
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
    if (!ambientOnly) this.onRender?.();
    else this.onAmbientRender?.();
  }

  project(id, height = 5.65) {
    const s = this.stalls.get(id);
    if (!s) return null;
    const position = s.group.localToWorld(new THREE.Vector3(0, height, 0));
    position.project(this.camera);
    return {
      x: ((position.x + 1) / 2) * this.width,
      y: ((1 - position.y) / 2) * this.height,
      z: position.z,
    };
  }

  startEntrance() {
    if (this.entranceStarted || this.disposed) return;
    this.entranceStarted = true;
    if (this.reducedMotion.matches || document.hidden || this.contextLost) {
      this.finishEntrance();
      return;
    }
    // Let the initial React reconciliation finish before capturing the final shop scales.
    this.entranceFrame = requestAnimationFrame(() => {
      this.entrance = new MarketEntrance(this.landscape, this.stalls);
      const start = performance.now();
      const frame = (now) => {
        if (!this.entrance) return;
        if (
          this.reducedMotion.matches ||
          document.hidden ||
          now - start >= this.entrance.duration
        ) {
          this.finishEntrance();
          return;
        }
        this.entrance.update(now - start, easeOut);
        this.shadowsDirty = true;
        this.render();
        this.entranceFrame = requestAnimationFrame(frame);
      };
      frame(start);
    });
  }

  finishEntrance() {
    if (this.entranceFrame != null) cancelAnimationFrame(this.entranceFrame);
    this.entranceFrame = null;
    if (this.entrance) {
      this.entrance.finish();
      this.entrance = null;
      this.shadowsDirty = true;
      this.render();
    }
    if (this.entranceStarted && !this.entranceReady) {
      this.entranceReady = true;
      this.onEntranceComplete?.();
    }
  }

  setSeason(season) {
    if (!['spring', 'summer', 'autumn', 'winter'].includes(season)) return;
    this.landscape.setSeason(season);
    this.sun.color.setHex(
      { spring: 0xfff1df, summer: 0xffefcf, autumn: 0xffdfbd, winter: 0xe4eeff }[season],
    );
    for (const water of this.fountainWater)
      water.material.color.setHex(season === 'winter' ? 0xb9d8da : water.originalColor);
    this.shadowsDirty = true;
    this.render();
  }

  animate(key, duration, apply) {
    this.animations ??= new Map();
    const token = {};
    this.animations.set(key, token);
    if (this.reducedMotion.matches) {
      apply(1);
      this.render();
      return;
    }
    const start = performance.now();
    const frame = (now) => {
      if (this.animations.get(key) !== token) return;
      const progress = Math.min(1, (now - start) / duration);
      apply(easeOut(progress));
      this.render();
      if (progress < 1) requestAnimationFrame(frame);
      else this.animations.delete(key);
    };
    requestAnimationFrame(frame);
  }

  focus(id, animate = true) {
    this.finishEntrance();
    const s = this.stalls.get(id);
    if (!s) return;
    this.selected = id;
    const start = this.lookTarget.clone(),
      target = s.group.position.clone().multiplyScalar(0.28);
    target.y = 0;
    const apply = (t) => {
      this.lookTarget.lerpVectors(start, target, t);
    };
    if (animate) this.animate('camera', 250, apply);
    else {
      apply(1);
      this.render();
    }
  }

  home(animate = true) {
    this.finishEntrance();
    const start = this.lookTarget.clone(),
      startZoom = this.zoom,
      startAngle = this.angle;
    const apply = (t) => {
      this.lookTarget.copy(start).multiplyScalar(1 - t);
      this.zoom = THREE.MathUtils.lerp(startZoom, 1, t);
      this.angle = THREE.MathUtils.lerp(startAngle, 0.64, t);
    };
    if (animate) this.animate('camera', 250, apply);
    else {
      apply(1);
      this.render();
    }
  }

  turn(delta, animate = true) {
    this.finishEntrance();
    const start = this.angle;
    const target = this.lookTarget.clone();
    const apply = (t) => {
      this.angle = start + delta * t;
      // Rotate the focus offset too, keeping the fountain as the orbit's pivot.
      this.lookTarget.copy(target).applyAxisAngle(this.orbitAxis, delta * t);
    };
    if (animate) this.animate('camera', 200, apply);
    else {
      apply(1);
      this.render();
    }
  }

  zoomBy(delta) {
    this.finishEntrance();
    this.animations?.delete('camera');
    this.zoom = THREE.MathUtils.clamp(this.zoom + delta, 0.75, 2.6);
    this.render();
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.hitboxes, false)[0]?.object.userData.shopId;
  }

  bindPointer() {
    const canvas = this.renderer.domElement;
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.finishEntrance();
      this.animations?.delete('camera');
      drag = {
        x: e.clientX,
        y: e.clientY,
        angle: this.angle,
        target: this.lookTarget.clone(),
        moved: false,
        id: e.pointerId,
      };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 5) drag.moved = true;
        if (drag.moved) {
          this.angle = drag.angle - dx * 0.005;
          this.lookTarget.copy(drag.target).applyAxisAngle(this.orbitAxis, -dx * 0.005);
          this.onHover(null);
          this.render();
        }
        return;
      }
      const id = this.pick(e);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      this.onHover(id, e);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const id = this.pick(e);
        if (id) this.onChoose(id);
      }
      drag = null;
      canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('pointercancel', () => (drag = null));
    canvas.addEventListener('pointerleave', () => this.onHover(null));
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.zoomBy(-e.deltaY * 0.0012);
      },
      { passive: false },
    );
  }
}
