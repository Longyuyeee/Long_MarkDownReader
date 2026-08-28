import type { ThemeMotionSpeed } from '../config/themePresets'
import type { GraphEdge } from '../types/graph'

export const GRAPH_PATH_MOTION_CYCLE = 24

const pixelsPerSecond: Record<ThemeMotionSpeed, number> = {
  calm: 28,
  swift: 44,
  expressive: 60,
  reduced: 0,
}

export const graphPathMotionPixelsPerSecond = (motionSpeed: ThemeMotionSpeed) => pixelsPerSecond[motionSpeed]

export const advanceGraphPathMotionPhase = (
  current: number,
  elapsedMs: number,
  motionSpeed: ThemeMotionSpeed,
  cycle = GRAPH_PATH_MOTION_CYCLE,
) => {
  const speed = graphPathMotionPixelsPerSecond(motionSpeed)
  if (!speed || cycle <= 0) return 0
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return current % cycle
  const boundedElapsed = Math.min(elapsedMs, 100)
  return (current + speed * boundedElapsed / 1000) % cycle
}

/** Returns whether the selected path traverses this fact source-to-target or in reverse. */
export const graphPathTraversalDirection = (nodeIds: string[], edge: GraphEdge): 1 | -1 | 0 => {
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const source = nodeIds[index]
    const target = nodeIds[index + 1]
    if (source === edge.source && target === edge.target) return 1
    if (source === edge.target && target === edge.source) return -1
  }
  return 0
}

export const graphPathDashOffset = (phase: number, traversalDirection: 1 | -1, zoom: number) =>
  -phase * traversalDirection / Math.max(zoom, 0.1)
