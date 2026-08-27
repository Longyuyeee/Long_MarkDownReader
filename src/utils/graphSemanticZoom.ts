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

export const resolveGraphSemanticZoom = (zoom: number, nodeCount: number): GraphSemanticZoomState => {
  const densityPressure = Math.max(1, Math.sqrt(Math.max(1, nodeCount) / 80))
  const effectiveZoom = Math.max(0, zoom) / densityPressure
  const level: GraphSemanticZoomLevel = effectiveZoom >= 0.85 ? 'near' : effectiveZoom >= 0.42 ? 'middle' : 'far'
  return { level, densityPressure, effectiveZoom }
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
