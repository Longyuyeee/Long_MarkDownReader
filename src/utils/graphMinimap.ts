import type { GraphCameraBounds, GraphCameraPose } from './graphCamera'

export interface GraphMinimapNode {
  id: string
  x?: number
  y?: number
  objectType?: string
}

export interface GraphMinimapPoint {
  id: string
  x: number
  y: number
  objectType: string
}

export interface GraphMinimapProjection {
  bounds: GraphCameraBounds
  scale: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  points: GraphMinimapPoint[]
  sourceNodeCount: number
}

export interface GraphMinimapViewportRect {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

export const graphMinimapProjection = (
  nodes: GraphMinimapNode[],
  width: number,
  height: number,
  maximumPoints = 600,
  padding = 8,
): GraphMinimapProjection | null => {
  const positioned = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y))
  if (!positioned.length || width <= 0 || height <= 0) return null
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const node of positioned) {
    left = Math.min(left, node.x!); right = Math.max(right, node.x!)
    top = Math.min(top, node.y!); bottom = Math.max(bottom, node.y!)
  }
  const worldWidth = Math.max(1, right - left)
  const worldHeight = Math.max(1, bottom - top)
  const usableWidth = Math.max(1, width - padding * 2)
  const usableHeight = Math.max(1, height - padding * 2)
  const scale = Math.min(usableWidth / worldWidth, usableHeight / worldHeight)
  const offsetX = padding + (usableWidth - worldWidth * scale) / 2 - left * scale
  const offsetY = padding + (usableHeight - worldHeight * scale) / 2 - top * scale
  const limit = Math.max(1, Math.floor(maximumPoints))
  const step = Math.max(1, Math.ceil(positioned.length / limit))
  const points: GraphMinimapPoint[] = []
  for (let index = 0; index < positioned.length; index += step) {
    const node = positioned[index]
    points.push({ id: node.id, x: node.x! * scale + offsetX, y: node.y! * scale + offsetY, objectType: node.objectType || 'unknown' })
  }
  return { bounds: { left, right, top, bottom }, scale, offsetX, offsetY, width, height, points, sourceNodeCount: positioned.length }
}

export const graphMinimapWorldPoint = (projection: GraphMinimapProjection, point: { x: number; y: number }) => ({
  x: (clamp(point.x, 0, projection.width) - projection.offsetX) / projection.scale,
  y: (clamp(point.y, 0, projection.height) - projection.offsetY) / projection.scale,
})

export const graphMinimapViewportRect = (
  projection: GraphMinimapProjection,
  pose: GraphCameraPose,
  viewport: { width: number; height: number },
): GraphMinimapViewportRect => {
  const left = (-pose.x / pose.zoom) * projection.scale + projection.offsetX
  const top = (-pose.y / pose.zoom) * projection.scale + projection.offsetY
  const right = ((viewport.width - pose.x) / pose.zoom) * projection.scale + projection.offsetX
  const bottom = ((viewport.height - pose.y) / pose.zoom) * projection.scale + projection.offsetY
  const x = clamp(Math.min(left, right), 0, projection.width)
  const y = clamp(Math.min(top, bottom), 0, projection.height)
  const boundedRight = clamp(Math.max(left, right), 0, projection.width)
  const boundedBottom = clamp(Math.max(top, bottom), 0, projection.height)
  return { x, y, width: Math.max(2, boundedRight - x), height: Math.max(2, boundedBottom - y) }
}
