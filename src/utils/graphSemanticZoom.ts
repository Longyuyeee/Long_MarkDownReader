import type { GraphData, GraphNode } from '../types/graph'
import type { GraphCommunitySummary } from './graphCommunities'

export type GraphSemanticZoomLevel = 'far' | 'middle' | 'near'

export interface GraphSemanticZoomState {
  level: GraphSemanticZoomLevel
  densityPressure: number
  effectiveZoom: number
}

export interface GraphCommunityOverviewNode {
  id: string
  label: string
  nodeIds: string[]
  nodeCount: number
  internalEdgeCount: number
  semanticObjectType: string
  representativeTitles: string[]
  x: number
  y: number
  radius: number
}

export interface GraphCommunityOverviewEdge {
  source: string
  target: string
  edgeCount: number
}

export interface GraphCommunityOverview {
  nodes: GraphCommunityOverviewNode[]
  edges: GraphCommunityOverviewEdge[]
}

export interface GraphCommunityContour {
  id: string
  label: string
  nodeIds: string[]
  semanticObjectType: string
  points: Array<{ x: number; y: number }>
  labelX: number
  labelY: number
}

export const resolveGraphSemanticZoom = (zoom: number, nodeCount: number): GraphSemanticZoomState => {
  const densityPressure = Math.max(1, Math.sqrt(Math.max(1, nodeCount) / 80))
  const effectiveZoom = Math.max(0, zoom) / densityPressure
  const level: GraphSemanticZoomLevel = effectiveZoom >= 0.85 ? 'near' : effectiveZoom >= 0.42 ? 'middle' : 'far'
  return { level, densityPressure, effectiveZoom }
}

/**
 * Keep ordinary graphs above the point where labels and hit targets stop being
 * useful. Very large graphs may still use the explicit community overview,
 * whose geometry is designed for a much smaller camera scale.
 */
export const graphReadableZoomFloor = (nodeCount: number, communityOverviewAvailable: boolean) => {
  if (communityOverviewAvailable) return 0.16
  const densityPressure = Math.max(1, Math.sqrt(Math.max(1, nodeCount) / 80))
  return Math.min(0.68, Math.max(0.58, densityPressure * 0.43))
}

/**
 * A community overview is useful only when it reduces visual complexity.
 * Louvain legitimately returns one community per disconnected node; rendering
 * those as large labelled summaries makes an orphan-heavy graph less readable.
 */
export const shouldUseGraphCommunityOverview = (communities: GraphCommunitySummary[], nodeCount: number) => {
  if (!communities.length || nodeCount <= 0) return false
  const singletonCount = communities.filter(community => community.nodeCount === 1 && community.internalEdgeCount === 0).length
  const usefulMaximum = Math.max(24, Math.ceil(Math.sqrt(nodeCount) * 4))
  return communities.length <= usefulMaximum && singletonCount / communities.length < 0.85
}

const compareText = (left: string, right: string) => left.localeCompare(right, 'zh-CN')

export const selectSemanticZoomKeyNodes = (graph: GraphData): GraphNode[] => {
  const degree = new Map(graph.nodes.map(node => [node.id, 0]))
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }
  const limit = Math.min(graph.nodes.length, Math.min(28, Math.max(8, Math.ceil(Math.sqrt(graph.nodes.length)))))
  return [...graph.nodes]
    .sort((left, right) => (degree.get(right.id) || 0) - (degree.get(left.id) || 0)
      || right.modifiedAt - left.modifiedAt
      || compareText(left.title, right.title)
      || compareText(left.id, right.id))
    .slice(0, limit)
}

const stablePairAngle = (left: string, right: string) => {
  let hash = 2166136261
  for (const character of `${left}\u001f${right}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return (hash % 360) * Math.PI / 180
}

const cross = (origin: { x: number; y: number }, left: { x: number; y: number }, right: { x: number; y: number }) =>
  (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x)

const convexHull = (points: Array<{ x: number; y: number }>) => {
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y)
  if (sorted.length <= 2) return sorted
  const lower: Array<{ x: number; y: number }> = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: Array<{ x: number; y: number }> = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

const circlePoints = (x: number, y: number, radius: number, count = 16) => Array.from({ length: count }, (_, index) => {
  const angle = Math.PI * 2 * index / count
  return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius }
})

/**
 * Builds a visual-only envelope from the current member coordinates. The
 * geometry never feeds back into layout, so enabling contours cannot move a
 * real node or alter persisted graph state.
 */
export const buildGraphCommunityContours = (
  graph: GraphData,
  communities: GraphCommunitySummary[],
  zoom: number,
): GraphCommunityContour[] => {
  const graphNodes = new Map(graph.nodes.map(node => [node.id, node]))
  const safeZoom = Math.max(0.35, zoom)
  return communities.flatMap(community => {
    const members = community.nodeIds.map(id => graphNodes.get(id)).filter((node): node is GraphNode => Boolean(node))
    if (!members.length) return []
    const padding = 22 / safeZoom
    const memberPoints = members.map(node => ({ x: node.x || 0, y: node.y || 0 }))
    let points: Array<{ x: number; y: number }>
    if (members.length === 1) {
      points = circlePoints(memberPoints[0].x, memberPoints[0].y, members[0].size * 0.6 + padding)
    } else {
      const samples = members.flatMap((node, index) => circlePoints(
        memberPoints[index].x,
        memberPoints[index].y,
        node.size * 0.6 + padding,
        10,
      ))
      points = convexHull(samples)
    }
    const labelPoint = [...points].sort((left, right) => left.y - right.y || left.x - right.x)[0]
    return [{
      id: community.id,
      label: community.label,
      nodeIds: members.map(node => node.id),
      semanticObjectType: community.objectTypes.find(item => members.some(node => node.objectType === item.id))?.id || members[0].objectType,
      points,
      labelX: labelPoint.x,
      labelY: labelPoint.y - 8 / safeZoom,
    }]
  }).sort((left, right) => compareText(left.id, right.id))
}

const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y) / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

export const graphCommunityContoursCoverMembers = (graph: GraphData, contours: GraphCommunityContour[]) => {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  return contours.every(contour => contour.nodeIds.every(id => {
    const node = nodes.get(id)
    return Boolean(node && pointInPolygon({ x: node.x || 0, y: node.y || 0 }, contour.points))
  }))
}

export const buildGraphCommunityOverview = (
  graph: GraphData,
  communities: GraphCommunitySummary[],
  zoom: number,
): GraphCommunityOverview => {
  const graphNodeIds = new Set(graph.nodes.map(node => node.id))
  const graphNodes = new Map(graph.nodes.map(node => [node.id, node]))
  const safeZoom = Math.max(0.1, zoom)
  const nodes = communities.flatMap(community => {
    const members = community.nodeIds.map(id => graphNodes.get(id)).filter((node): node is GraphNode => Boolean(node))
    if (!members.length) return []
    const memberIds = new Set(members.map(node => node.id))
    const x = members.reduce((total, node) => total + (node.x || 0), 0) / members.length
    const y = members.reduce((total, node) => total + (node.y || 0), 0) / members.length
    return [{
      id: community.id,
      label: community.label,
      nodeIds: members.map(node => node.id),
      nodeCount: members.length,
      internalEdgeCount: graph.edges.filter(edge => memberIds.has(edge.source) && memberIds.has(edge.target)).length,
      semanticObjectType: community.objectTypes.find(item => members.some(node => node.objectType === item.id))?.id || members[0].objectType,
      representativeTitles: community.representativeTitles,
      x,
      y,
      radius: (42 + Math.min(24, Math.sqrt(members.length) * 5)) / safeZoom,
    }]
  }).sort((left, right) => compareText(left.id, right.id))

  for (let iteration = 0; iteration < 18; iteration += 1) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex]
        const right = nodes[rightIndex]
        let dx = right.x - left.x
        let dy = right.y - left.y
        let distance = Math.hypot(dx, dy)
        const minimum = left.radius + right.radius + 24 / safeZoom
        if (distance >= minimum) continue
        if (distance < 0.001) {
          const angle = stablePairAngle(left.id, right.id)
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          distance = 1
        }
        const shift = (minimum - distance) / 2
        const unitX = dx / distance
        const unitY = dy / distance
        left.x -= unitX * shift
        left.y -= unitY * shift
        right.x += unitX * shift
        right.y += unitY * shift
      }
    }
  }

  const communityByNode = new Map<string, string>()
  for (const node of nodes) for (const nodeId of node.nodeIds) communityByNode.set(nodeId, node.id)
  const edgeCounts = new Map<string, GraphCommunityOverviewEdge>()
  for (const edge of graph.edges) {
    if (!graphNodeIds.has(edge.source) || !graphNodeIds.has(edge.target)) continue
    const sourceCommunity = communityByNode.get(edge.source)
    const targetCommunity = communityByNode.get(edge.target)
    if (!sourceCommunity || !targetCommunity || sourceCommunity === targetCommunity) continue
    const [source, target] = compareText(sourceCommunity, targetCommunity) <= 0
      ? [sourceCommunity, targetCommunity]
      : [targetCommunity, sourceCommunity]
    const key = `${source}\u001f${target}`
    const current = edgeCounts.get(key)
    if (current) current.edgeCount += 1
    else edgeCounts.set(key, { source, target, edgeCount: 1 })
  }
  return { nodes, edges: [...edgeCounts.values()].sort((left, right) => compareText(`${left.source}\u001f${left.target}`, `${right.source}\u001f${right.target}`)) }
}
