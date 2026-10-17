import type { GraphData, GraphNode } from '../types/graph'

export interface GraphLoadTicket { readonly generation: number; readonly libraryRoot: string }

// A root alone is insufficient: two refreshes of the same library may finish backwards.
export const createGraphLoadGate = () => {
  let generation = 0
  return {
    begin(libraryRoot: string): GraphLoadTicket { return { generation: ++generation, libraryRoot } },
    invalidate() { generation += 1 },
    accepts(ticket: GraphLoadTicket, activeRoot: string, active: boolean) {
      return active && ticket.generation === generation && ticket.libraryRoot === activeRoot
    },
  }
}

const sameIdentity = (left: GraphNode, right: GraphNode) =>
  left.id === right.id && left.path === right.path && left.objectType === right.objectType

// Read the current positions at COMMIT time: the user can continue dragging while a refresh is pending.
// Neither the old graph nor the incoming native response is mutated.
export const prepareGraphRefresh = (previous: GraphData, incoming: GraphData) => {
  const old = new Map(previous.nodes.map(node => [node.id, node]))
  let preserved = 0
  const nodes = incoming.nodes.map(node => {
    const existing = old.get(node.id)
    if (!existing || !sameIdentity(existing, node) || !Number.isFinite(existing.x) || !Number.isFinite(existing.y)) return { ...node }
    preserved += 1
    return { ...node, x: existing.x, y: existing.y, vx: 0, vy: 0 }
  })
  const byId = new Map(nodes.map(node => [node.id, node]))
  const rebind = (node: GraphNode | null) => {
    const candidate = node && byId.get(node.id)
    return candidate && node && sameIdentity(node, candidate) ? candidate : null
  }
  return { graph: { nodes, edges: incoming.edges } as GraphData, byId, rebind, preserved,
    sameNodes: nodes.length === previous.nodes.length && preserved === nodes.length }
}
