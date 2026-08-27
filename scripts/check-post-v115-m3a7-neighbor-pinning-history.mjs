import fs from 'node:fs/promises'
import { commitGraphSelection, emptyGraphSelectionHistory, moveGraphSelectionHistory } from '../src/utils/graphSelectionHistory.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const policy = JSON.parse(await fs.readFile('shared/post-v115-m3a7-neighbor-pinning-history-policy.json', 'utf8'))
const valid = ['a', 'b', 'c']
let state = emptyGraphSelectionHistory()
state = commitGraphSelection(state, { nodeIds: ['a'], activeNodeId: 'a' }, valid)
const deduplicated = commitGraphSelection(state, { nodeIds: ['a', 'a'], activeNodeId: 'a' }, valid)
requireFact(deduplicated.entries.length === 1, 'consecutive normalized selections should deduplicate')
state = commitGraphSelection(state, { nodeIds: ['a', 'b'], activeNodeId: 'b' }, valid)
let moved = moveGraphSelectionHistory(state, 0, valid)
requireFact(moved.snapshot?.nodeIds.join(',') === 'a' && moved.snapshot.activeNodeId === 'a', 'selection history back navigation drifted')
state = commitGraphSelection(moved.state, { nodeIds: ['c'], activeNodeId: 'c' }, valid)
requireFact(state.entries.length === 2 && state.entries[1].nodeIds.join(',') === 'c', 'new selection should truncate forward history')
const normalized = moveGraphSelectionHistory({ entries: [{ nodeIds: ['missing', 'b'], activeNodeId: 'missing' }], cursor: 0 }, 0, valid)
requireFact(normalized.snapshot?.nodeIds.join(',') === 'b' && normalized.snapshot.activeNodeId === 'b', 'missing nodes should normalize safely')
let bounded = emptyGraphSelectionHistory()
for (let index = 0; index < 25; index += 1) bounded = commitGraphSelection(bounded, { nodeIds: [String(index)], activeNodeId: String(index) }, Array.from({ length: 25 }, (_, value) => String(value)))
requireFact(bounded.entries.length === 20 && bounded.cursor === 19 && bounded.entries[0].nodeIds[0] === '5', 'selection history capacity drifted')
requireFact(policy.stage === 'M3A-7' && policy.neighborPinning.meaning === 'pin-local-graph-to-editor-right-rail' && policy.selectedNextStage.id === 'M3A-8', 'M3A-7 policy or corrected pinning meaning drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
const libraryMode = await fs.readFile('src/views/LibraryMode.vue', 'utf8')
const localGraph = await fs.readFile('src/components/LocalGraph.vue', 'utf8')
for (const token of ['graph-neighbor-pin-action', 'graph-selection-history-entry', 'graph-selection-history-panel', 'graph-selection-history-back', 'graph-selection-history-forward', 'graph-selection-history-item']) requireFact(graphView.includes(token), `M3A-7 graph UI contract missing: ${token}`)
for (const token of ['local-graph-pin', 'local-graph-rail', 'local-graph-unpin', 'LocalGraph']) requireFact(libraryMode.includes(token), `M3A-7 editor rail contract missing: ${token}`)
requireFact(localGraph.includes('local-graph-card') && localGraph.includes('local-graph-summary'), 'M3A-7 local graph evidence hooks missing')
let desktop = null
try { desktop = JSON.parse(await fs.readFile('docs/evidence/post-v115-m3a7-neighbor-pinning-history/desktop.json', 'utf8')) } catch {}
if (desktop) {
  const actual = desktop.actual
  const history = actual.selectionHistory
  const pinning = actual.neighborPinning
  requireFact(desktop.stage === 'M3A-7' && actual.runtimeErrors === 0, 'M3A-7 desktop identity or runtime errors drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3A-7 changed source files or lost library return')
  requireFact(history?.initialSelectedCount === 1 && history?.allSelectedCount === 17 && history?.clearedSelectedCount === 0, 'M3A-7 real selection sequence drifted')
  requireFact(history?.backToAllCount === 17 && history?.backToInitialCount === 1 && history?.forwardToAllCount === 17, 'M3A-7 real selection history navigation failed')
  requireFact(history?.entryCount >= 3 && history?.entryCount <= 20 && history?.wideFits && history?.narrowFits, 'M3A-7 real history capacity or responsive panel failed')
  requireFact(pinning?.railVisible && pinning?.initialNodeCount > 1 && pinning?.followedActiveTab && pinning?.unpinned, 'M3A-7 real editor rail pin/follow/unpin failed')
}
console.log(`M3A-7 neighbor pinning and selection history accepted: editor right-rail semantics are explicit and the bounded session history passes dedupe, branch, capacity, and missing-node checks${desktop ? ', with real desktop pin/follow/unpin and history navigation' : ''}.`)
