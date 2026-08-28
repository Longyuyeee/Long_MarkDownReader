export interface GraphCameraPose {
  x: number
  y: number
  zoom: number
}

export interface GraphCameraBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface GraphCameraViewport {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

export const graphCameraPoseForBounds = (
  bounds: GraphCameraBounds,
  viewport: GraphCameraViewport,
  padding = 42,
  minimumZoom = 0.1,
  maximumZoom = 1.35,
): GraphCameraPose => {
  const width = Math.max(1, bounds.right - bounds.left)
  const height = Math.max(1, bounds.bottom - bounds.top)
  const usableWidth = Math.max(1, viewport.width - padding * 2)
  const usableHeight = Math.max(1, viewport.height - padding * 2)
  const zoom = clamp(Math.min(usableWidth / width, usableHeight / height), minimumZoom, maximumZoom)
  return {
    x: viewport.x + padding + (usableWidth - width * zoom) / 2 - bounds.left * zoom,
    y: viewport.y + padding + (usableHeight - height * zoom) / 2 - bounds.top * zoom,
    zoom,
  }
}

export const graphCameraPoseForPoint = (
  point: { x: number; y: number },
  viewport: GraphCameraViewport,
  zoom: number,
): GraphCameraPose => ({
  x: viewport.x + viewport.width / 2 - point.x * zoom,
  y: viewport.y + viewport.height / 2 - point.y * zoom,
  zoom,
})

export const graphCameraEase = (progress: number) => {
  const bounded = clamp(progress, 0, 1)
  return bounded < 0.5
    ? 4 * bounded * bounded * bounded
    : 1 - Math.pow(-2 * bounded + 2, 3) / 2
}

export const interpolateGraphCameraPose = (from: GraphCameraPose, to: GraphCameraPose, progress: number): GraphCameraPose => {
  const eased = graphCameraEase(progress)
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
  }
}
