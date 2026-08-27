import fs from 'node:fs/promises'
import { findShortestGraphPath } from '../src/utils/graphPath.ts'

const policy = JSON.parse(await fs.readFile('shared/post-v115-m3a3-shortest-path-policy.json', 'utf8'))
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const node = id => ({ id, title: id, path: `${id}.md`, size: 10, tags: [], directory: '', modifiedAt: 0, objectType: 'markdown', searchText: id })
const edge = (source, target, relationType = 'links-to') => ({ source, target, relationType, directed: true, mentions: [] })
const graph = { nodes: ['a', 'b', 'c', 'd', 'e', 'z'].map(node), edges: [edge('a', 'c'), edge('c', 'd'), edge('a', 'b'), edge('b', 'd'), edge('d', 'e')] }
const oracleDistance = (data, start, end) => {
  if (!data.nodes.some(item => item.id === start) || !data.nodes.some(item => item.id === end)) return null
  const queue = [[start, 0]], seen = new Set([start])
  while (queue.length) {
    const [current, distance] = queue.shift()
    if (current === end) return distance
    for (const item of data.edges) {
      const next = item.source === current ? item.target : item.target === current ? item.source : ''
      if (next && !seen.has(next)) { seen.add(next); queue.push([next, distance + 1]) }
    }
  }
  return Infinity
}
const connected = findShortestGraphPath(graph, 'a', 'e')
requireFact(connected.status === 'found' && connected.edges.length === oracleDistance(graph, 'a', 'e'), 'connected path differs from independent BFS distance')
const tie = findShortestGraphPath(graph, 'a', 'd')
requireFact(tie.status === 'found' && tie.nodeIds.join('>') === 'a>b>d', 'deterministic tie order drifted')
requireFact(findShortestGraphPath(graph, 'a', 'z').status === 'unreachable', 'unreachable case drifted')
requireFact(findShortestGraphPath(graph, 'a', 'a').nodeIds.join('>') === 'a', 'same-node case drifted')
requireFact(findShortestGraphPath(graph, 'missing', 'a').status === 'invalid', 'invalid-node case drifted')
requireFact(policy.stage === 'M3A-3' && policy.requiredCases.length === 5, 'M3A-3 policy drifted')
const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['graph-path-start', 'graph-path-end', 'graph-path-found', 'graph-path-unreachable', 'graph-path-return']) requireFact(graphView.includes(token), `M3A-3 UI contract missing: ${token}`)
let desktop = null
try { desktop = JSON.parse(await fs.readFile('docs/evidence/post-v115-m3a3-shortest-path/desktop.json', 'utf8')) } catch {}
if (desktop) {
  requireFact(desktop.stage === 'M3A-3' && desktop.actual.runtimeErrors === 0, 'M3A-3 desktop identity or runtime errors drifted')
  requireFact(desktop.actual.sourceFilesUnchanged && desktop.actual.returnedToLibrary, 'M3A-3 changed source files or lost library return')
  requireFact(/^\d+ 跳/.test(desktop.actual.shortestPath?.foundText || '') && desktop.actual.shortestPath?.fullGraphRestored, 'M3A-3 connected path or return failed')
  requireFact(desktop.actual.shortestPath?.focused?.documentFits && desktop.actual.shortestPath?.narrowFocused?.documentFits, 'M3A-3 path view overflowed wide or narrow desktop')
  requireFact(desktop.actual.shortestPath?.unreachableText?.includes('没有可达路径'), 'M3A-3 unreachable state failed')
}
console.log(`M3A-3 shortest-path accepted: production BFS matches an independent oracle across five cases${desktop ? ', with connected/unreachable real desktop workflow and return' : ''}.`)
