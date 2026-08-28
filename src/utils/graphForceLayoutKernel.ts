export const GRAPH_FORCE_LAYOUT_CELL_SIZE = 100
export const GRAPH_FORCE_LAYOUT_MAX_REPULSION_DISTANCE = 300
export const GRAPH_FORCE_LAYOUT_MAX_CANDIDATES_PER_NODE = 48

export type GraphForceLayoutNode = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

export type GraphForceLayoutEdge = {
  source: number
  target: number
}

export type GraphForceLayoutTickResult = {
  energy: number
  candidateChecks: number
  cappedNodeCount: number
}

export const runGraphForceLayoutTick = (
  nodes: GraphForceLayoutNode[],
  edges: GraphForceLayoutEdge[],
  centerX: number,
  centerY: number,
): GraphForceLayoutTickResult => {
  const grid = new Map<string, number[]>()
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const cellX = Math.floor(node.x / GRAPH_FORCE_LAYOUT_CELL_SIZE)
    const cellY = Math.floor(node.y / GRAPH_FORCE_LAYOUT_CELL_SIZE)
    const key = `${cellX},${cellY}`
    const members = grid.get(key)
    if (members) members.push(index)
    else grid.set(key, [index])
  }

  const maximumDistanceSquared = GRAPH_FORCE_LAYOUT_MAX_REPULSION_DISTANCE ** 2
  let candidateChecks = 0
  let cappedNodeCount = 0

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex]
    const cellX = Math.floor(node.x / GRAPH_FORCE_LAYOUT_CELL_SIZE)
    const cellY = Math.floor(node.y / GRAPH_FORCE_LAYOUT_CELL_SIZE)
    let nodeCandidateChecks = 0
    let capped = false

    for (let offsetX = -1; offsetX <= 1 && !capped; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1 && !capped; offsetY += 1) {
        const members = grid.get(`${cellX + offsetX},${cellY + offsetY}`) || []
        for (const candidateIndex of members) {
          if (candidateIndex === nodeIndex) continue
          if (nodeCandidateChecks >= GRAPH_FORCE_LAYOUT_MAX_CANDIDATES_PER_NODE) {
            capped = true
            break
          }
          nodeCandidateChecks += 1
          candidateChecks += 1
          const candidate = nodes[candidateIndex]
          const deltaX = candidate.x - node.x
          const deltaY = candidate.y - node.y
          const distanceSquared = deltaX * deltaX + deltaY * deltaY
          if (distanceSquared < 1 || distanceSquared > maximumDistanceSquared) continue
          const distance = Math.sqrt(distanceSquared)
          const force = Math.min(800 / distanceSquared, 50)
          node.vx -= (deltaX / distance) * force
          node.vy -= (deltaY / distance) * force
        }
      }
    }
    if (capped) cappedNodeCount += 1
  }

  const desiredLinkDistance = 120
  for (const edge of edges) {
    const source = nodes[edge.source]
    const target = nodes[edge.target]
    if (!source || !target) continue
    const deltaX = target.x - source.x
    const deltaY = target.y - source.y
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1
    const force = (distance - desiredLinkDistance) * 0.015
    source.vx += (deltaX / distance) * force
    source.vy += (deltaY / distance) * force
    target.vx -= (deltaX / distance) * force
    target.vy -= (deltaY / distance) * force
  }

  let energy = 0
  for (const node of nodes) {
    node.vx = (node.vx + (centerX - node.x) * 0.002) * 0.85
    node.vy = (node.vy + (centerY - node.y) * 0.002) * 0.85
    node.x += node.vx
    node.y += node.vy
    energy += Math.abs(node.vx) + Math.abs(node.vy)
  }

  return { energy, candidateChecks, cappedNodeCount }
}
