// The simulated clock advances shop age independently of review state.
export function shopAge(shop, clockHours) {
  return Math.max(0, clockHours - shop.openedAtHours);
}

export function wearStage(hours) {
  return hours < 24 ? 0 : hours < 72 ? 1 : hours < 168 ? 2 : 3;
}
