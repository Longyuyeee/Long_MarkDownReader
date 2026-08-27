import { UndirectedGraph } from 'graphology'
import louvain from 'graphology-communities-louvain'
import type { GraphData, GraphNode } from '../types/graph'

export interface GraphCommunitySummary {
  id: string
  label: string
  nodeIds: string[]
  nodeCount: number
  internalEdgeCount: number
  topTags: string[]
  representativeTitles: string[]
  objectTypes: Array<{ id: string; count: number }>
}

export interface GraphCommunityResult {
  algorithm: 'louvain'
  modularity: number
  communities: GraphCommunitySummary[]
  nodeCommunityIds: Map<string, string>
}

const stableHash = (value: string) => {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
}

const stableCommunityId = (nodeIds: string[]) => `community-${stableHash(nodeIds.join('\u001f'))}`

const countValues = (values: string[]) => {
  const counts = new Map<string, number>()
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
}

const summarizeCommunity = (
  graph: GraphData,
  nodes: GraphNode[],
  degree: Map<string, number>,
): GraphCommunitySummary => {
  const nodeIds = nodes.map(node => node.id).sort((a, b) => a.localeCompare(b))
  const nodeIdSet = new Set(nodeIds)
  const topTags = countValues(nodes.flatMap(node => node.tags || [])).slice(0, 3).map(([tag]) => tag)
  const representativeTitles = [...nodes]
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.title.localeCompare(b.title, 'zh-CN') || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(node => node.title)
  const objectTypes = countValues(nodes.map(node => node.objectType || 'markdown')).map(([id, count]) => ({ id, count }))
  const labelParts = topTags.length ? topTags.slice(0, 2).map(tag => `#${tag}`) : representativeTitles.slice(0, 2)
  return {
    id: stableCommunityId(nodeIds),
    label: labelParts.join(' · ') || '未命名社区',
    nodeIds,
    nodeCount: nodeIds.length,
    internalEdgeCount: graph.edges.filter(edge => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)).length,
    topTags,
    representativeTitles,
    objectTypes,
  }
}

export const detectGraphCommunities = (graph: GraphData): GraphCommunityResult => {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const nodeIds = new Set(nodes.map(node => node.id))
  const degree = new Map(nodes.map(node => [node.id, 0]))
  const edgeWeights = new Map<string, { source: string; target: string; weight: number }>()
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue
    const [source, target] = edge.source.localeCompare(edge.target) <= 0 ? [edge.source, edge.target] : [edge.target, edge.source]
    const key = JSON.stringify([source, target])
    const current = edgeWeights.get(key)
    if (current) current.weight += 1
    else edgeWeights.set(key, { source, target, weight: 1 })
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }

  const discovery = new UndirectedGraph<{ sourceId: string }, { weight: number }>({ allowSelfLoops: false, multi: false })
  for (const node of nodes) discovery.addNode(node.id, { sourceId: node.id })
  for (const [key, edge] of [...edgeWeights.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    discovery.addEdgeWithKey(key, edge.source, edge.target, { weight: edge.weight })
  }

  let modularity = 0
  let numericCommunities: Record<string, number>
  if (!nodes.length) numericCommunities = {}
  else if (!edgeWeights.size) numericCommunities = Object.fromEntries(nodes.map((node, index) => [node.id, index]))
  else {
    const detailed = louvain.detailed(discovery, { getEdgeWeight: 'weight', randomWalk: false, fastLocalMoves: true, resolution: 1 })
    numericCommunities = detailed.communities
    modularity = detailed.modularity
  }

  const groups = new Map<number, GraphNode[]>()
  for (const node of nodes) {
    const community = numericCommunities[node.id]
    const members = groups.get(community) || []
    members.push(node)
    groups.set(community, members)
  }
  const communities = [...groups.values()]
    .map(members => summarizeCommunity(graph, members, degree))
    .sort((a, b) => b.nodeCount - a.nodeCount || a.id.localeCompare(b.id))
  const nodeCommunityIds = new Map<string, string>()
  for (const community of communities) for (const nodeId of community.nodeIds) nodeCommunityIds.set(nodeId, community.id)
  return { algorithm: 'louvain', modularity, communities, nodeCommunityIds }
}
