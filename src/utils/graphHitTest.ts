export interface GraphHitNode { id: string; x?: number; y?: number; size: number }

// Dense nodes can share a hit area. Choose the center nearest the pointer,
// rather than whichever file the native directory scan happened to return first.
export function nearestGraphNode<T extends GraphHitNode>(nodes: readonly T[], x: number, y: number, zoom: number, mode: 'network' | 'mindmap', rootId?: string): T | null {
  let closest: T | null = null
  let distance = Number.POSITIVE_INFINITY
  const tolerance = 100 / Math.max(0.5, zoom)
  for (const node of nodes) {
    const dx = x - (node.x || 0), dy = y - (node.y || 0)
    const squared = dx * dx + dy * dy
    const radius = node.size * 0.6 / Math.sqrt(Math.max(1, zoom))
    const inside = mode === 'mindmap'
      ? Math.abs(dx) <= (node.id === rootId ? 90 : 80) && Math.abs(dy) <= 24
      : squared < radius * radius + tolerance
    if (inside && squared < distance) { closest = node; distance = squared }
  }
  return closest
}
