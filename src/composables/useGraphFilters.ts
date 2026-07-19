import { reactive, watch } from 'vue'
import type { GraphData, GraphNode } from '../types/graph'

export type GraphDateRange = 'all' | '7d' | '30d' | '365d'

export interface GraphFilters {
  query: string
  tags: string[]
  directories: string[]
  relationTypes: string[]
  objectTypes: string[]
  dateRange: GraphDateRange
  showOrphans: boolean
}

const STORAGE_KEY = 'longedit.graph.filters.v1'
const defaults = (): GraphFilters => ({
  query: '',
  tags: [],
  directories: [],
  relationTypes: [],
  objectTypes: [],
  dateRange: 'all',
  showOrphans: true,
})

const readSavedFilters = (): GraphFilters => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const base = defaults()
    return {
      query: typeof saved.query === 'string' ? saved.query : base.query,
      tags: Array.isArray(saved.tags) ? saved.tags.filter((value: unknown) => typeof value === 'string') : base.tags,
      directories: Array.isArray(saved.directories) ? saved.directories.filter((value: unknown) => typeof value === 'string') : base.directories,
      relationTypes: Array.isArray(saved.relationTypes) ? saved.relationTypes.filter((value: unknown) => typeof value === 'string') : base.relationTypes,
      objectTypes: Array.isArray(saved.objectTypes) ? saved.objectTypes.filter((value: unknown) => typeof value === 'string') : base.objectTypes,
      dateRange: ['all', '7d', '30d', '365d'].includes(saved.dateRange) ? saved.dateRange : base.dateRange,
      showOrphans: typeof saved.showOrphans === 'boolean' ? saved.showOrphans : base.showOrphans,
    }
  } catch {
    return defaults()
  }
}

const filters = reactive<GraphFilters>(readSavedFilters())
watch(filters, value => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* device storage unavailable */ }
}, { deep: true })

const nodeMatches = (node: GraphNode, state: GraphFilters, nowSeconds: number) => {
  const query = state.query.trim().toLocaleLowerCase()
  if (query && ![node.title, node.path, node.searchText || '', ...(node.tags || [])].some(value => value.toLocaleLowerCase().includes(query))) return false
  if (state.tags.length && !state.tags.some(tag => (node.tags || []).some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase()))) return false
  if (state.directories.length && !state.directories.includes(node.directory || '')) return false
  if (state.objectTypes.length && !state.objectTypes.includes(node.objectType || 'markdown')) return false
  if (state.dateRange !== 'all') {
    const days = state.dateRange === '7d' ? 7 : state.dateRange === '30d' ? 30 : 365
    if (!node.modifiedAt || node.modifiedAt < nowSeconds - days * 86400) return false
  }
  return true
}

export const applyGraphFilters = (graph: GraphData, state: GraphFilters, pinnedNodeId?: string): GraphData => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  let nodes = graph.nodes.filter(node => node.id === pinnedNodeId || nodeMatches(node, state, nowSeconds))
  let nodeIds = new Set(nodes.map(node => node.id))
  let edges = graph.edges.filter(edge =>
    nodeIds.has(edge.source)
    && nodeIds.has(edge.target)
    && (!state.relationTypes.length || state.relationTypes.includes(edge.relationType))
  )

  if (!state.showOrphans || state.relationTypes.length) {
    const connected = new Set(edges.flatMap(edge => [edge.source, edge.target]))
    if (pinnedNodeId) connected.add(pinnedNodeId)
    nodes = nodes.filter(node => connected.has(node.id))
    nodeIds = new Set(nodes.map(node => node.id))
    edges = edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  }

  return { nodes, edges }
}

export const graphFilterOptions = (graph: GraphData) => ({
  tags: [...new Set(graph.nodes.flatMap(node => node.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  directories: [...new Set(graph.nodes.map(node => node.directory || ''))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  relationTypes: [...new Set(graph.edges.map(edge => edge.relationType))].sort((a, b) => a.localeCompare(b)),
  objectTypes: [...new Set(graph.nodes.map(node => node.objectType || 'markdown'))].sort((a, b) => a.localeCompare(b)),
})

export const useGraphFilters = () => {
  const resetFilters = () => Object.assign(filters, defaults())
  const activeFilterCount = () =>
    filters.tags.length
    + filters.directories.length
    + filters.relationTypes.length
    + filters.objectTypes.length
    + (filters.dateRange === 'all' ? 0 : 1)
    + (filters.showOrphans ? 0 : 1)

  return { filters, resetFilters, activeFilterCount }
}
