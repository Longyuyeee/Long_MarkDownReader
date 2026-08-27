import fs from 'node:fs/promises'
const policy = JSON.parse(await fs.readFile('shared/post-v115-m3a2-neighbor-focus-policy.json', 'utf8'))
const source = await fs.readFile('src/components/GraphView.vue', 'utf8')
const evidence = JSON.parse(await fs.readFile('docs/evidence/post-v115-m3a2-neighbor-focus/desktop.json', 'utf8'))
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
requireFact(policy.stage === 'M3A-2' && policy.releaseCandidate === false, 'M3A-2 policy drifted')
for (const token of ['graph-neighbor-focus-action', 'graph-neighbor-focus-depth', 'graph-neighbor-focus-return', 'neighborFocusNodeIds', 'neighborFocusDepth', '返回全图']) requireFact(source.includes(token), `M3A-2 source contract missing: ${token}`)
requireFact(evidence.stage === 'M3A-2' && evidence.actual.runtimeErrors === 0, 'M3A-2 desktop identity or runtime errors drifted')
requireFact(evidence.actual.sourceFilesUnchanged && evidence.actual.returnedToLibrary, 'M3A-2 changed source files or lost library return')
requireFact(evidence.actual.neighborFocus?.focusRootVisible && evidence.actual.neighborFocus?.nodeCountReduced && evidence.actual.neighborFocus?.fullGraphRestored, 'M3A-2 focus/return workflow failed')
const counts = evidence.actual.neighborFocus?.depthSnapshots?.map(item => Number(item.graphStats.match(/^(\d+)/)?.[1])) || []
requireFact(counts.length === 3 && counts.every((count, index) => index === 0 || count >= counts[index - 1]), 'M3A-2 one-to-three-hop depth progression failed')
console.log(`M3A-2 neighbor focus accepted: 1/2/3-hop scopes ${counts.join('/')}, full graph restored, source files unchanged.`)
