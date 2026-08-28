import type { GraphData } from '../types/graph'

export type GraphRecencyLevel = 'fresh' | 'recent' | 'none'

export interface GraphNodeStatus {
  nodeId: string
  recency: GraphRecencyLevel
  ageDays: number | null
  degree: number
  relationStrength: number
  showRelationStrength: boolean
}

export interface GraphNodeStatusSummary {
  nodes: GraphNodeStatus[]
  freshCount: number
  recentCount: number
  relationStrengthCount: number
  ringNodeCount: number
  maximumDegree: number
  relationStrengthThreshold: number
}

export const graphNodeRecency = (modifiedAt: number, nowSeconds: number): Pick<GraphNodeStatus, 'recency' | 'ageDays'> => {
  if (!Number.isFinite(modifiedAt) || modifiedAt <= 0 || !Number.isFinite(nowSeconds) || nowSeconds <= 0) return { recency: 'none', ageDays: null }
  const ageDays = Math.max(0, (nowSeconds - modifiedAt) / 86400)
  if (ageDays <= 7) return { recency: 'fresh', ageDays }
  if (ageDays <= 30) return { recency: 'recent', ageDays }
  return { recency: 'none', ageDays }
}

const relationStrengthThreshold = (degrees: number[]) => {
  const positive = degrees.filter(value => value > 0).sort((left, right) => left - right)
  if (!positive.length || positive[0] === positive[positive.length - 1]) return Number.POSITIVE_INFINITY
  return Math.max(2, positive[Math.ceil(positive.length * 0.75) - 1])
}

export const deriveGraphNodeStatus = (graph: GraphData, nowSeconds: number): GraphNodeStatusSummary => {
  const degrees = new Map(graph.nodes.map(node => [node.id, 0]))
  for (const edge of graph.edges) {
    if (degrees.has(edge.source)) degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1)
    if (degrees.has(edge.target)) degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1)
  }
  const degreeValues = [...degrees.values()]
  const maximumDegree = Math.max(0, ...degreeValues)
  const threshold = relationStrengthThreshold(degreeValues)
  const nodes = graph.nodes.map(node => {
    const degree = degrees.get(node.id) || 0
    const recency = graphNodeRecency(node.modifiedAt, nowSeconds)
    return {
      nodeId: node.id,
      ...recency,
      degree,
      relationStrength: maximumDegree ? degree / maximumDegree : 0,
      showRelationStrength: degree >= threshold,
    }
  })
  return {
    nodes,
    freshCount: nodes.filter(node => node.recency === 'fresh').length,
    recentCount: nodes.filter(node => node.recency === 'recent').length,
    relationStrengthCount: nodes.filter(node => node.showRelationStrength).length,
    ringNodeCount: nodes.filter(node => node.recency !== 'none' || node.showRelationStrength).length,
    maximumDegree,
    relationStrengthThreshold: Number.isFinite(threshold) ? threshold : 0,
  }
}
