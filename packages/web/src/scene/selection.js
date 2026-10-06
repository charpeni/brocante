import * as THREE from 'three';

// Created once per world. The scene owns and disposes every resource below.
export function createQuestSelection(scene) {
  const halo = new THREE.Group();
  for (const [inner, outer, color, y] of [
    [2.18, 2.48, 0x493c22, 0],
    [2.23, 2.43, 0xffd36f, 0.008],
    [2.03, 2.07, 0xfff5cf, 0.012],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 64),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    halo.add(ring);
  }
  const arrow = new THREE.Shape();
  arrow.moveTo(-0.23, 2.75);
  arrow.lineTo(0.23, 2.75);
  arrow.lineTo(0, 2.48);
  arrow.closePath();
  const geometry = new THREE.ShapeGeometry(arrow);
  const material = new THREE.MeshBasicMaterial({ color: 0xffd36f, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const pointer = new THREE.Mesh(geometry, material);
    pointer.rotation.set(-Math.PI / 2, 0, (i * Math.PI) / 2);
    pointer.position.y = 0.015;
    halo.add(pointer);
  }
  halo.position.y = 0.17;
  halo.visible = false;
  scene.add(halo);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.beginPath();
  context.moveTo(64, 12);
  context.lineTo(108, 72);
  context.lineTo(64, 142);
  context.lineTo(20, 72);
  context.closePath();
  context.fillStyle = '#ffd36f';
  context.fill();
  context.lineWidth = 10;
  context.strokeStyle = '#493c22';
  context.stroke();
  context.beginPath();
  context.moveTo(64, 37);
  context.lineTo(85, 72);
  context.lineTo(64, 108);
  context.lineTo(43, 72);
  context.closePath();
  context.lineWidth = 5;
  context.strokeStyle = '#fff9e5';
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }),
  );
  marker.scale.set(1.05, 1.3, 1);
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);
  return { halo, marker };
}
