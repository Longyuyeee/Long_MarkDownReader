import type { GraphData, GraphEdge } from '../types/graph'

export type GraphPathResult =
  | { status: 'found'; nodeIds: string[]; edges: GraphEdge[] }
  | { status: 'unreachable'; nodeIds: []; edges: [] }
  | { status: 'invalid'; nodeIds: []; edges: [] }

export const findShortestGraphPath = (graph: GraphData, startId: string, endId: string): GraphPathResult => {
  const nodeIds = new Set(graph.nodes.map(node => node.id))
  if (!nodeIds.has(startId) || !nodeIds.has(endId)) return { status: 'invalid', nodeIds: [], edges: [] }
  if (startId === endId) return { status: 'found', nodeIds: [startId], edges: [] }

  const adjacency = new Map<string, Array<{ nodeId: string; edge: GraphEdge }>>()
  for (const id of nodeIds) adjacency.set(id, [])
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    adjacency.get(edge.source)?.push({ nodeId: edge.target, edge })
    adjacency.get(edge.target)?.push({ nodeId: edge.source, edge })
  }
  for (const entries of adjacency.values()) entries.sort((a, b) => a.nodeId.localeCompare(b.nodeId) || a.edge.relationType.localeCompare(b.edge.relationType))

  const queue = [startId]
  const visited = new Set(queue)
  const previous = new Map<string, { nodeId: string; edge: GraphEdge }>()
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    for (const next of adjacency.get(current) || []) {
      if (visited.has(next.nodeId)) continue
      visited.add(next.nodeId)
      previous.set(next.nodeId, { nodeId: current, edge: next.edge })
      queue.push(next.nodeId)
      if (next.nodeId === endId) {
        cursor = queue.length
        break
      }
    }
  }
  if (!previous.has(endId)) return { status: 'unreachable', nodeIds: [], edges: [] }

  const pathNodes = [endId]
  const pathEdges: GraphEdge[] = []
  let current = endId
  while (current !== startId) {
    const step = previous.get(current)
    if (!step) return { status: 'unreachable', nodeIds: [], edges: [] }
    pathEdges.unshift(step.edge)
    current = step.nodeId
    pathNodes.unshift(current)
  }
  return { status: 'found', nodeIds: pathNodes, edges: pathEdges }
}
