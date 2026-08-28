import type { GraphEdge } from '../types/graph'

export interface GraphEdgeRoute {
  edge: GraphEdge
  routeId: string
  canonicalSource: string
  canonicalTarget: string
  parallelIndex: number
  parallelCount: number
  curveOffset: number
}

export interface GraphRoutePoint { x: number; y: number }

export interface GraphQuadraticGeometry {
  source: GraphRoutePoint
  control: GraphRoutePoint
  target: GraphRoutePoint
}

const compareText = (left: string, right: string) => left.localeCompare(right, 'zh-CN')

const stableHash = (value: string) => {
  let hash = 2166136261
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return hash
}

const edgePair = (edge: GraphEdge) => compareText(edge.source, edge.target) <= 0
  ? [edge.source, edge.target] as const
  : [edge.target, edge.source] as const

const mentionSignature = (edge: GraphEdge) => edge.mentions
  .map(mention => [mention.target, mention.relationType, mention.line, mention.syntax, mention.context, mention.alias || ''].join('\u001e'))
  .sort(compareText)
  .join('\u001d')

const edgeSignature = (edge: GraphEdge) => {
  const [canonicalSource, canonicalTarget] = edgePair(edge)
  const direction = edge.directed ? `${edge.source}>${edge.target}` : '<->'
  return [canonicalSource, canonicalTarget, direction, edge.relationType, mentionSignature(edge)].join('\u001f')
}

/** Assigns visual routes without changing relation facts or relying on backend iteration order. */
export const buildGraphEdgeRoutes = (edges: GraphEdge[]): GraphEdgeRoute[] => {
  const groups = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    const [source, target] = edgePair(edge)
    const key = `${source}\u001f${target}`
    const group = groups.get(key)
    if (group) group.push(edge)
    else groups.set(key, [edge])
  }

  const result: GraphEdgeRoute[] = []
  for (const [pairId, group] of [...groups.entries()].sort(([left], [right]) => compareText(left, right))) {
    const sorted = [...group].sort((left, right) => compareText(edgeSignature(left), edgeSignature(right)))
    const [canonicalSource, canonicalTarget] = pairId.split('\u001f')
    const singleBend = stableHash(pairId) % 2 === 0 ? -12 : 12
    for (let index = 0; index < sorted.length; index += 1) {
      const centeredSlot = index - (sorted.length - 1) / 2
      const groupedOffset = centeredSlot === 0 ? singleBend : centeredSlot * 34
      result.push({
        edge: sorted[index],
        routeId: `${pairId}\u001f${index}\u001f${edgeSignature(sorted[index])}`,
        canonicalSource,
        canonicalTarget,
        parallelIndex: index,
        parallelCount: sorted.length,
        curveOffset: sorted.length === 1 ? singleBend : groupedOffset,
      })
    }
  }
  return result
}

export const graphQuadraticGeometry = (
  route: GraphEdgeRoute,
  nodePoints: ReadonlyMap<string, GraphRoutePoint>,
): GraphQuadraticGeometry | null => {
  const source = nodePoints.get(route.edge.source)
  const target = nodePoints.get(route.edge.target)
  const canonicalSource = nodePoints.get(route.canonicalSource)
  const canonicalTarget = nodePoints.get(route.canonicalTarget)
  if (!source || !target || !canonicalSource || !canonicalTarget) return null
  const dx = canonicalTarget.x - canonicalSource.x
  const dy = canonicalTarget.y - canonicalSource.y
  const length = Math.hypot(dx, dy) || 1
  return {
    source,
    control: {
      x: (canonicalSource.x + canonicalTarget.x) / 2 - dy / length * route.curveOffset,
      y: (canonicalSource.y + canonicalTarget.y) / 2 + dx / length * route.curveOffset,
    },
    target,
  }
}

export const graphQuadraticPoint = (geometry: GraphQuadraticGeometry, ratio: number): GraphRoutePoint => {
  const inverse = 1 - ratio
  return {
    x: inverse * inverse * geometry.source.x + 2 * inverse * ratio * geometry.control.x + ratio * ratio * geometry.target.x,
    y: inverse * inverse * geometry.source.y + 2 * inverse * ratio * geometry.control.y + ratio * ratio * geometry.target.y,
  }
}

export const graphQuadraticTangent = (geometry: GraphQuadraticGeometry, ratio: number): GraphRoutePoint => ({
  x: 2 * (1 - ratio) * (geometry.control.x - geometry.source.x) + 2 * ratio * (geometry.target.x - geometry.control.x),
  y: 2 * (1 - ratio) * (geometry.control.y - geometry.source.y) + 2 * ratio * (geometry.target.y - geometry.control.y),
})

export const graphQuadraticPathData = (geometry: GraphQuadraticGeometry) =>
  `M ${geometry.source.x} ${geometry.source.y} Q ${geometry.control.x} ${geometry.control.y}, ${geometry.target.x} ${geometry.target.y}`

export const graphQuadraticLabelPoint = (geometry: GraphQuadraticGeometry, curveOffset: number, distance: number) => {
  const point = graphQuadraticPoint(geometry, 0.5)
  const tangent = graphQuadraticTangent(geometry, 0.5)
  const length = Math.hypot(tangent.x, tangent.y) || 1
  const direction = curveOffset < 0 ? -1 : 1
  return {
    x: point.x - tangent.y / length * distance * direction,
    y: point.y + tangent.x / length * distance * direction,
  }
}
