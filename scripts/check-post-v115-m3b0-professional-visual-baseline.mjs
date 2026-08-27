import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))

const policy = await readJson('shared/post-v115-m3b0-professional-visual-baseline-policy.json')
const m3aExit = await readJson('shared/post-v115-m3a8-semantic-exploration-exit-policy.json')
const m3b1 = await readJson('shared/post-v115-m3b1-semantic-zoom-community-overview-policy.json')
const tier1000 = await readJson('docs/evidence/post-v115-m3-baseline/tier-1000.json')
const tier5000 = await readJson('docs/evidence/post-v115-m3-baseline/tier-5000.json')
const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')

requireFact(policy.stage === 'M3B-0' && !policy.releaseCandidate, 'M3B-0 policy identity drifted')
requireFact(m3aExit.selectedNextStage.id === policy.stage, 'M3A exit no longer leads to M3B-0')
requireFact(policy.requirements.length === 6, 'M3B original requirement groups are incomplete')
requireFact(policy.selectedNextStage.id === 'M3B-1' && policy.selectedNextStage.name === 'semantic-zoom-community-overview', 'M3B-0 selection drifted')
requireFact(policy.preChange.edgeVisibilityZoomThreshold === 0.3 && policy.preChange.labelVisibilityZoomThreshold === 0.4 && policy.preChange.glyphVisibilityZoomThreshold === 0.55, 'historical fixed-threshold baseline drifted')
requireFact(policy.selectedNextStage.id === m3b1.stage && graphView.includes('resolveGraphSemanticZoom'), 'M3B-0 no longer leads to the selected semantic-zoom implementation')
requireFact(graphView.includes("if (viewMode.value === 'mindmap')") && graphView.includes('ctx.bezierCurveTo') && graphView.includes('ctx.lineTo(t.x || 0, t.y || 0)'), 'straight network / curved mind-map baseline drifted')
requireFact(graphView.includes('animationId = requestAnimationFrame(loop)') && !graphView.includes('store.motionSpeed'), 'continuous loop or reduced-motion baseline drifted')
for (const absentFeature of ['relationLabels', 'selectedPathDirectionFlow', 'minimap', 'fitSelection', 'clusterCollapseExpand', 'graphFullscreen', 'farCommunitySummary']) {
  requireFact(policy.preChange[absentFeature] === false, `M3B-0 missing-feature fact drifted: ${absentFeature}`)
}
for (const tier of [tier1000, tier5000]) {
  requireFact(tier.stage === 'M3-0' && tier.actual.runtimeErrors === 0 && tier.actual.sourceFilesUnchanged && tier.actual.returnedToLibrary, `M3-0 ${tier.tier}-node baseline is unsafe or unavailable`)
}
requireFact(tier1000.actual.layoutStableMs >= 10000 && tier5000.actual.layoutStableMs >= 100000, 'large-graph density/performance baseline no longer matches recorded evidence')

let desktop = null
try { desktop = await readJson('docs/evidence/post-v115-m3b0-professional-visual-baseline/desktop.json') } catch {}
if (desktop) {
  const actual = desktop.actual
  const baseline = actual.visualBaseline
  requireFact(desktop.stage === 'M3B-0' && actual.runtimeErrors === 0, 'M3B-0 desktop identity or runtime safety drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3B-0 changed source files or lost library return')
  requireFact(actual.wide?.objectTypeIds?.length === 11 && actual.wide?.relationTypeIds?.length === 6, 'M3B-0 semantic legend coverage drifted')
  requireFact(baseline?.defaultZoomPercent > 0 && baseline.farZoomPercent <= 30 && baseline.nearZoomPercent > baseline.farZoomPercent, 'M3B-0 zoom baseline is incomplete')
  requireFact(!baseline.farEdgesExpectedByCurrentThreshold && !baseline.farLabelsExpectedByCurrentThreshold, 'far zoom no longer demonstrates the fixed-threshold information loss')
  requireFact(baseline.selectedCommunity?.count > 1 && baseline.pathEdgeCount === 3, 'M3B-0 community or path visual baseline is incomplete')
  requireFact(!baseline.relationLabelsVisible && !baseline.minimapVisible, 'M3B-0 missing-feature desktop facts drifted')
  requireFact(baseline.motionPreference === 'reduced' && baseline.narrowFits, 'M3B-0 reduced-motion or narrow viewport evidence drifted')
}

console.log(`M3B-0 professional visual baseline accepted: historical fixed thresholds and camera/path gaps remain frozen against safe 17/1000/5000-node evidence, and the selected semantic-zoom successor is present${desktop ? ', with the original Tauri screenshots retained' : ''}.`)
