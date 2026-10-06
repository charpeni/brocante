import * as THREE from 'three';

const geometry = new THREE.BoxGeometry(1, 1, 1);
const wood = new THREE.MeshLambertMaterial({ color: 0x997450, flatShading: true });
const frame = new THREE.MeshLambertMaterial({ color: 0x78694f, flatShading: true });

// The backrest sits on local -Z; local +Z faces the central fountain.
export function createBench(index) {
  const angle = (index * Math.PI) / 2 + 0.45;
  const x = Math.cos(angle) * 4.2,
    z = Math.sin(angle) * 4.2;
  const bench = new THREE.Group();
  const plank = (material, position, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bench.add(mesh);
  };
  plank(wood, [0, 0.52, 0], [1.65, 0.16, 0.48]);
  plank(wood, [0, 0.89, -0.23], [1.65, 0.5, 0.09]);
  for (const legX of [-0.56, 0.56]) plank(frame, [legX, 0.25, 0], [0.12, 0.5, 0.4]);
  bench.position.set(x, 0.08, z);
  bench.rotation.y = Math.atan2(-x, -z);
  return bench;
}
