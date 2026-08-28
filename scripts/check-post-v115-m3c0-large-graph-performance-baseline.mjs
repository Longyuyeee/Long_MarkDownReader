import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3c0-large-graph-performance-baseline-selection-policy.json')
const predecessor = await readJson('shared/post-v115-m3b12-professional-visual-system-exit-policy.json')
requireFact(policy.stage === 'M3C-0' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3C-0 stage chain drifted')
requireFact(policy.graphTiers.join(',') === '100,1000,5000', 'M3C-0 graph tiers drifted')
requireFact(policy.selectionDecision.selected === 'settled-dirty-frame-and-lifecycle-loop' && policy.selectedNextStage.id === 'M3C-1', 'M3C-0 selection drifted')

let evidenceCount = 0
const summaries = []
for (const tier of policy.graphTiers) {
  let evidence
  try { evidence = await readJson(`docs/evidence/post-v115-m3c0-large-graph-performance-baseline/tier-${tier}.json`) } catch { continue }
  evidenceCount += 1
  const actual = evidence.actual
  requireFact(evidence.stage === 'M3C-0' && evidence.tier === tier && actual.nodeCount === tier && actual.edgeCount === tier - 1, `M3C-0 graph shape drifted: ${tier}`)
  if (actual.completed === false) {
    requireFact(tier === 5000 && ['layout-stable', 'bounded-node-focus'].includes(actual.failureStage) && actual.firstVisibleMs > 0, 'M3C-0 unexpected bounded failure')
    if (actual.failureStage === 'layout-stable') requireFact(actual.layoutStableMs > evidence.expected.layoutStableMaximumMs, 'M3C-0 premature layout failure')
    if (actual.failureStage === 'bounded-node-focus') requireFact(actual.interactions.zoomChanged && actual.interactions.panChanged && actual.interactions.selectedCount > 0 && actual.interactions.focusLatencyMs > evidence.expected.interactionMaximumMs && actual.frameActivity.settledDrawsPerSecond >= 1 && actual.frameActivity.inactiveDraws <= policy.expectations.inactiveDrawsMaximum, 'M3C-0 bounded focus failure facts drifted')
    requireFact(actual.runtimeErrors === 0 && actual.sourceFilesUnchanged && !actual.returnedToLibrary, 'M3C-0 bounded failure safety drifted')
    summaries.push({ tier, firstVisibleMs: actual.firstVisibleMs, layoutStableMs: actual.layoutStableMs, settledDrawsPerSecond: 'not-reached', longestTaskMs: 'not-reached' })
    continue
  }
  requireFact(actual.firstVisibleMs > 0 && actual.firstVisibleMs < 240000 && actual.layoutStableMs >= actual.firstVisibleMs && actual.layoutStableMs < 240000, `M3C-0 timing missing: ${tier}`)
  requireFact(actual.interactions.zoomChanged && actual.interactions.panChanged && actual.interactions.panFullGraph && actual.interactions.selectedCount > 0 && actual.interactions.selectionLatencyMs > 0, `M3C-0 pointer or selection interaction failed: ${tier}`)
  requireFact(actual.interactions.focus.reason === 'node-focus' && actual.interactions.focus.selectedCount === 1 && ['completed', 'reduced'].includes(actual.interactions.focus.state), `M3C-0 focus interaction failed: ${tier}`)
  requireFact(actual.frameActivity.settledDrawsPerSecond >= 1, `M3C-0 no longer reproduces unconditional settled drawing: ${tier}`)
  requireFact(actual.frameActivity.inactiveDraws <= policy.expectations.inactiveDrawsMaximum && actual.frameActivity.libraryDraws <= policy.expectations.inactiveDrawsMaximum, `M3C-0 inactive loop did not stop: ${tier}`)
  requireFact(actual.runtimeErrors === 0 && actual.returnedToLibrary && actual.sourceFilesUnchanged, `M3C-0 runtime or source safety failed: ${tier}`)
  if (tier === policy.lifecycle.tier) {
    requireFact(actual.lifecycle.cycles === policy.lifecycle.cycles && actual.lifecycle.completed && Number.isFinite(actual.lifecycle.heapBeforeBytes) && Number.isFinite(actual.lifecycle.heapAfterBytes), 'M3C-0 lifecycle evidence failed')
  }
  summaries.push({ tier, firstVisibleMs: actual.firstVisibleMs, layoutStableMs: actual.layoutStableMs, settledDrawsPerSecond: actual.frameActivity.settledDrawsPerSecond, longestTaskMs: actual.longestTaskMs })
}
requireFact(evidenceCount === 0 || evidenceCount === policy.graphTiers.length, 'M3C-0 desktop evidence is partial')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
requireFact(graphView.includes('draw()\n  animationId = requestAnimationFrame(loop)') && graphView.includes('if (layoutSettled || viewMode.value === \'mindmap\') return'), 'M3C-0 selected idle-loop gap is no longer present')
console.log(`M3C-0 large-graph baseline accepted${evidenceCount ? `: ${summaries.map(item => `${item.tier}=${item.firstVisibleMs}/${item.layoutStableMs}ms, ${item.settledDrawsPerSecond} settled draws/s, longest ${item.longestTaskMs}ms`).join('; ')}` : ''}; 5000-node interaction and long-task budget failures remain explicit, and M3C-1 selects settled dirty-frame and lifecycle-loop control.`)
