// A one-shot construction sequence. Transforms reuse the existing merged geometry.
export class MarketEntrance {
  constructor(landscape, stalls) {
    this.items = [];
    for (const [role, object] of landscape.meshes) {
      if (['edge', 'lawn', 'litter'].includes(role)) continue;
      this.add(object, ['shrub', 'grass', 'flower'].includes(role) ? 80 : 0);
    }
    let index = 0;
    for (const stall of stalls.values()) this.add(stall.group, (index++ % 6) * 40);
    this.duration = Math.max(580, ...this.items.map((item) => item.delay + 500));
  }

  add(object, delay) {
    this.items.push({ object, delay, scale: object.scale.clone() });
  }

  update(elapsed, ease) {
    for (const { object, delay, scale } of this.items) {
      const progress = Math.min(1, Math.max(0, (elapsed - delay) / 500));
      // Grounded growth: keep the footprint fixed, with no overshoot or camera motion.
      object.scale.copy(scale);
      object.scale.y *= 0.08 + 0.92 * ease(progress);
    }
  }

  finish() {
    for (const { object, scale } of this.items) object.scale.copy(scale);
  }
}
