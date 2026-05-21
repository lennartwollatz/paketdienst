const scrollPositions = new Map<string, { x: number; y: number }>();

export function saveScrollPosition(key: string): void {
  scrollPositions.set(key, { x: window.scrollX, y: window.scrollY });
}

export function getScrollPosition(key: string): { x: number; y: number } | undefined {
  return scrollPositions.get(key);
}

export function restoreScrollPosition(y: number, x = 0): () => void {
  const apply = () => window.scrollTo(x, y);
  apply();
  requestAnimationFrame(apply);
  requestAnimationFrame(() => requestAnimationFrame(apply));
  const timeouts = [50, 100, 200, 400, 700, 1200].map((ms) => window.setTimeout(apply, ms));
  return () => timeouts.forEach((id) => window.clearTimeout(id));
}
