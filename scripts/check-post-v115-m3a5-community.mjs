import fs from 'node:fs/promises'
import { detectGraphCommunities } from '../src/utils/graphCommunities.ts'

const policy = JSON.parse(await fs.readFile('shared/post-v115-m3a5-community-policy.json', 'utf8'))
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const node = id => ({ id, title: id, path: `${id}.md`, size: 10, tags: [id[0]], directory: '', modifiedAt: 0, objectType: 'markdown', searchText: id })
const edge = (source, target, relationType = 'links-to') => ({ source, target, relationType, directed: true, mentions: [] })
const nodeIds = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'z']
const edges = [edge('a1', 'a2'), edge('a1', 'a3'), edge('a2', 'a3'), edge('b1', 'b2'), edge('b1', 'b3'), edge('b2', 'b3'), edge('a3', 'b1')]
const graph = { nodes: nodeIds.map(node), edges }
const signature = result => result.communities.map(community => `${community.id}:${community.nodeIds.join(',')}`).sort().join('|')
const expected = signature(detectGraphCommunities(graph))
requireFact(detectGraphCommunities(graph).communities.length === 3, 'Louvain fixture should contain two dense groups and one isolate')
requireFact(detectGraphCommunities(graph).communities.some(community => community.nodeIds.join(',') === 'a1,a2,a3'), 'first dense community drifted')
requireFact(detectGraphCommunities(graph).communities.some(community => community.nodeIds.join(',') === 'b1,b2,b3'), 'second dense community drifted')
for (let run = 0; run < 20; run += 1) requireFact(signature(detectGraphCommunities(graph)) === expected, `community result drifted on repeat ${run + 1}`)
const shuffled = { nodes: [...graph.nodes].reverse(), edges: [edges[5], edges[2], edges[6], edges[0], edges[4], edges[1], edges[3]] }
requireFact(signature(detectGraphCommunities(shuffled)) === expected, 'community result depends on source ordering')
const renamed = { nodes: graph.nodes.map(item => ({ ...item, title: `renamed-${item.title}` })), edges }
requireFact(detectGraphCommunities(renamed).communities.map(item => item.id).sort().join('|') === detectGraphCommunities(graph).communities.map(item => item.id).sort().join('|'), 'stable IDs should derive from members, not labels')
requireFact(policy.algorithm.name === 'graphology-louvain' && policy.selectedNextStage.id === 'M3A-6', 'M3A-5 policy or corrected continuation drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['graph-community-entry', 'graph-community-panel', 'graph-community-card', 'graph-community-focus', 'graph-community-return', 'graph-community-focus-return']) requireFact(graphView.includes(token), `M3A-5 UI contract missing: ${token}`)
let desktop = null
try { desktop = JSON.parse(await fs.readFile('docs/evidence/post-v115-m3a5-community/desktop.json', 'utf8')) } catch {}
if (desktop) {
  const actual = desktop.actual
  requireFact(desktop.stage === 'M3A-5' && actual.runtimeErrors === 0, 'M3A-5 desktop identity or runtime errors drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3A-5 changed source files or lost library return')
  requireFact(actual.community?.count === 5 && actual.community?.nodeCounts?.join(',') === '4,4,3,3,3' && actual.community?.stableAcrossRebuild, 'M3A-5 real community partition is missing, unstable, or drifted')
  requireFact(actual.community?.panelText?.includes('模块度 0.670'), 'M3A-5 real modularity evidence drifted')
  requireFact(actual.community?.expectedSelectedNodeCount === 4 && actual.community?.selectedNodeCount === 4 && actual.community?.restoredNodeCount === 17, 'M3A-5 real filter or return failed')
  requireFact(actual.community?.wideFits && actual.community?.narrowFits, 'M3A-5 panel overflowed wide or narrow desktop')
}
console.log(`M3A-5 community discovery accepted: deterministic Louvain yields stable member-derived IDs across 20 repeats and shuffled input${desktop ? ', with real desktop filter/rebuild/return' : ''}.`)
