import {
  runGraphForceLayoutTick,
  type GraphForceLayoutEdge,
  type GraphForceLayoutNode,
} from '../utils/graphForceLayoutKernel'

type LayoutStartMessage = {
  type: 'start'
  jobId: number
  nodeCount: number
  positions: Float64Array
  velocities: Float64Array
  edgeIndices: Int32Array
  centerX: number
  centerY: number
}

type LayoutTickMessage = {
  type: 'tick'
  jobId: number
  centerX: number
  centerY: number
}

type LayoutCancelMessage = { type: 'cancel'; jobId: number }
type LayoutWorkerMessage = LayoutStartMessage | LayoutTickMessage | LayoutCancelMessage

type WorkerScope = {
  onmessage: ((event: MessageEvent<LayoutWorkerMessage>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

const workerScope = self as unknown as WorkerScope
let activeJobId = 0
let frame = 0
let nodes: GraphForceLayoutNode[] = []
let edges: GraphForceLayoutEdge[] = []

const emitTick = (jobId: number, centerX: number, centerY: number) => {
  const startedAt = performance.now()
  const result = runGraphForceLayoutTick(nodes, edges, centerX, centerY)
  const positions = new Float64Array(nodes.length * 2)
  const velocities = new Float64Array(nodes.length * 2)
  for (let index = 0; index < nodes.length; index += 1) {
    positions[index * 2] = nodes[index].x
    positions[index * 2 + 1] = nodes[index].y
    velocities[index * 2] = nodes[index].vx
    velocities[index * 2 + 1] = nodes[index].vy
  }
  frame += 1
  workerScope.postMessage({
    type: 'result',
    jobId,
    frame,
    positions,
    velocities,
    energy: result.energy,
    candidateChecks: result.candidateChecks,
    cappedNodeCount: result.cappedNodeCount,
    computeMs: performance.now() - startedAt,
  }, [positions.buffer, velocities.buffer])
}

workerScope.onmessage = event => {
  const message = event.data
  if (message.type === 'cancel') {
    if (message.jobId === activeJobId) activeJobId = 0
    return
  }
  if (message.type === 'start') {
    activeJobId = message.jobId
    frame = 0
    nodes = Array.from({ length: message.nodeCount }, (_, index) => ({
      id: String(index),
      x: message.positions[index * 2],
      y: message.positions[index * 2 + 1],
      vx: message.velocities[index * 2],
      vy: message.velocities[index * 2 + 1],
    } satisfies GraphForceLayoutNode))
    edges = Array.from({ length: message.edgeIndices.length / 2 }, (_, index) => ({
      source: message.edgeIndices[index * 2],
      target: message.edgeIndices[index * 2 + 1],
    } satisfies GraphForceLayoutEdge))
  }
  if (message.jobId !== activeJobId) return
  try {
    emitTick(message.jobId, message.centerX, message.centerY)
  } catch (error) {
    workerScope.postMessage({ type: 'error', jobId: message.jobId, message: String(error) })
  }
}
