import type { GraphData, GraphEdge, GraphNode, RelationMention } from '../types/graph'
import type { GraphPathResult } from './graphPath'

export interface GraphPathEdgeEvidence {
  edge: GraphEdge
  source: GraphNode
  target: GraphNode
  traversalFrom: GraphNode
  traversalTo: GraphNode
  traversalReversed: boolean
  mentions: RelationMention[]
}

export const buildGraphPathEvidence = (
  graph: GraphData,
  path: GraphPathResult | null,
): GraphPathEdgeEvidence[] => {
  if (path?.status !== 'found') return []
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))
  return path.edges.flatMap((edge, index) => {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    const traversalFrom = nodeMap.get(path.nodeIds[index])
    const traversalTo = nodeMap.get(path.nodeIds[index + 1])
    if (!source || !target || !traversalFrom || !traversalTo) return []
    return [{
      edge,
      source,
      target,
      traversalFrom,
      traversalTo,
      traversalReversed: traversalFrom.id !== edge.source,
      mentions: [...edge.mentions],
    }]
  })
}
