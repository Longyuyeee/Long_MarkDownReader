import type { GraphData } from '../types/graph'

// Topology depends on identities/edges, not mutable force-layout coordinates.
export const buildGraphTopology = (graph: GraphData) => {
  const byId = new Map(graph.nodes.map(node => [node.id, node]))
  const neighbors = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
    if (!neighbors.has(edge.source)) neighbors.set(edge.source, new Set())
    if (!neighbors.has(edge.target)) neighbors.set(edge.target, new Set())
    neighbors.get(edge.source)!.add(edge.target)
    neighbors.get(edge.target)!.add(edge.source)
    if (edge.directed) {
      outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1)
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    }
  }
  return { byId, neighbors, degree, incoming, outgoing }
}
