import type { GraphData, GraphEdge, GraphNode, RelationMention } from '../types/graph'

export interface GraphComparisonSide {
  node: GraphNode
  relationCount: number
  incomingCount: number
  outgoingCount: number
  neighborCount: number
}

export interface GraphComparisonDirectRelation {
  edge: GraphEdge
  source: GraphNode
  target: GraphNode
  mentions: RelationMention[]
}

export type GraphNodeComparison =
  | { status: 'invalid' | 'same' }
  | {
      status: 'compared'
      left: GraphComparisonSide
      right: GraphComparisonSide
      sameObjectType: boolean
      sharedTags: string[]
      leftOnlyTags: string[]
      rightOnlyTags: string[]
      commonNeighbors: GraphNode[]
      leftOnlyNeighbors: GraphNode[]
      rightOnlyNeighbors: GraphNode[]
      directRelations: GraphComparisonDirectRelation[]
    }

const compareText = (a: string, b: string) => a.localeCompare(b, 'zh-CN')
const sortNodes = (nodes: GraphNode[]) => [...nodes].sort((a, b) => compareText(a.title, b.title) || compareText(a.id, b.id))
const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort(compareText)

const buildSide = (graph: GraphData, node: GraphNode, neighbors: Set<string>): GraphComparisonSide => {
  const incomingCount = graph.edges.filter(edge => edge.target === node.id).length
  const outgoingCount = graph.edges.filter(edge => edge.source === node.id).length
  return { node, relationCount: incomingCount + outgoingCount, incomingCount, outgoingCount, neighborCount: neighbors.size }
}

export const compareGraphNodes = (graph: GraphData, leftId: string, rightId: string): GraphNodeComparison => {
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))
  const leftNode = nodeMap.get(leftId)
  const rightNode = nodeMap.get(rightId)
  if (!leftNode || !rightNode) return { status: 'invalid' }
  if (leftId === rightId) return { status: 'same' }

  const neighborIds = new Map(graph.nodes.map(node => [node.id, new Set<string>()]))
  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target) || edge.source === edge.target) continue
    neighborIds.get(edge.source)?.add(edge.target)
    neighborIds.get(edge.target)?.add(edge.source)
  }
  const leftNeighbors = neighborIds.get(leftId) || new Set<string>()
  const rightNeighbors = neighborIds.get(rightId) || new Set<string>()
  leftNeighbors.delete(rightId)
  rightNeighbors.delete(leftId)

  const commonIds = new Set([...leftNeighbors].filter(id => rightNeighbors.has(id)))
  const nodesFor = (ids: Iterable<string>) => sortNodes([...ids].flatMap(id => nodeMap.get(id) || []))
  const leftTags = uniqueSorted(leftNode.tags || [])
  const rightTags = uniqueSorted(rightNode.tags || [])
  const rightTagSet = new Set(rightTags)
  const leftTagSet = new Set(leftTags)
  const directRelations = graph.edges
    .filter(edge => (edge.source === leftId && edge.target === rightId) || (edge.source === rightId && edge.target === leftId))
    .map(edge => ({ edge, source: nodeMap.get(edge.source)!, target: nodeMap.get(edge.target)!, mentions: [...edge.mentions] }))
    .sort((a, b) => compareText(a.edge.relationType, b.edge.relationType) || compareText(a.edge.source, b.edge.source) || compareText(a.edge.target, b.edge.target))

  return {
    status: 'compared',
    left: buildSide(graph, leftNode, leftNeighbors),
    right: buildSide(graph, rightNode, rightNeighbors),
    sameObjectType: leftNode.objectType === rightNode.objectType,
    sharedTags: leftTags.filter(tag => rightTagSet.has(tag)),
    leftOnlyTags: leftTags.filter(tag => !rightTagSet.has(tag)),
    rightOnlyTags: rightTags.filter(tag => !leftTagSet.has(tag)),
    commonNeighbors: nodesFor(commonIds),
    leftOnlyNeighbors: nodesFor([...leftNeighbors].filter(id => !commonIds.has(id))),
    rightOnlyNeighbors: nodesFor([...rightNeighbors].filter(id => !commonIds.has(id))),
    directRelations,
  }
}
