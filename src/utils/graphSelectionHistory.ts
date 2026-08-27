export interface GraphSelectionSnapshot {
  nodeIds: string[]
  activeNodeId: string
}

export interface GraphSelectionHistoryState {
  entries: GraphSelectionSnapshot[]
  cursor: number
}

export const GRAPH_SELECTION_HISTORY_LIMIT = 20

export const emptyGraphSelectionHistory = (): GraphSelectionHistoryState => ({ entries: [], cursor: -1 })

export const normalizeGraphSelection = (
  snapshot: GraphSelectionSnapshot,
  validNodeIds: Iterable<string>,
): GraphSelectionSnapshot => {
  const valid = new Set(validNodeIds)
  const nodeIds = [...new Set(snapshot.nodeIds)].filter(id => valid.has(id))
  const activeNodeId = nodeIds.includes(snapshot.activeNodeId) ? snapshot.activeNodeId : nodeIds[nodeIds.length - 1] || ''
  return { nodeIds, activeNodeId }
}

const selectionSignature = (snapshot: GraphSelectionSnapshot) => `${snapshot.activeNodeId}\u001e${snapshot.nodeIds.join('\u001f')}`

export const commitGraphSelection = (
  state: GraphSelectionHistoryState,
  snapshot: GraphSelectionSnapshot,
  validNodeIds: Iterable<string>,
  limit = GRAPH_SELECTION_HISTORY_LIMIT,
): GraphSelectionHistoryState => {
  const normalized = normalizeGraphSelection(snapshot, validNodeIds)
  const current = state.entries[state.cursor]
  if (current && selectionSignature(current) === selectionSignature(normalized)) return state
  const entries = [...state.entries.slice(0, state.cursor + 1), normalized]
  const bounded = entries.slice(-Math.max(1, limit))
  return { entries: bounded, cursor: bounded.length - 1 }
}

export const moveGraphSelectionHistory = (
  state: GraphSelectionHistoryState,
  cursor: number,
  validNodeIds: Iterable<string>,
): { state: GraphSelectionHistoryState; snapshot: GraphSelectionSnapshot | null } => {
  if (!state.entries.length) return { state, snapshot: null }
  const nextCursor = Math.max(0, Math.min(state.entries.length - 1, cursor))
  return {
    state: { entries: state.entries, cursor: nextCursor },
    snapshot: normalizeGraphSelection(state.entries[nextCursor], validNodeIds),
  }
}
