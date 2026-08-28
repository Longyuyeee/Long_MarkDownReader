import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const policy = JSON.parse(fs.readFileSync(path.join(root, 'shared/post-v115-m3c4-large-graph-performance-exit-audit-policy.json'), 'utf8'))
const evidenceRoot = path.join(root, 'docs/evidence/post-v115-m3c4-large-graph-performance-exit-audit')
const graphViewSource = fs.readFileSync(path.join(root, 'src/components/GraphView.vue'), 'utf8')
const graphWorkspaceSource = fs.readFileSync(path.join(root, 'src/utils/graphWorkspace.ts'), 'utf8')
const failures = []
const summaries = []

if (!graphViewSource.includes('createGraphPng(visibleNodes.value, visibleEdges.value, exportOptions)')) failures.push('product PNG export does not use direct graph-data rendering')
if (!graphWorkspaceSource.includes('export const createGraphPng')) failures.push('bounded direct PNG renderer missing')
if (!graphWorkspaceSource.includes('MAX_GRAPH_PNG_PIXELS = 32_000_000')) failures.push('PNG pixel bound missing')
if (graphWorkspaceSource.includes('graphSvgToPng')) failures.push('obsolete SVG image-decode PNG path remains')

const resourcesReleased = snapshot => snapshot
  && snapshot.workersCreated === snapshot.workersTerminated
  && snapshot.observersCreated === snapshot.observersDisconnected
const listenerShape = snapshot => (snapshot?.activeListeners || []).map(value => value.replace(/:\d+$/, '')).sort()

for (const tier of policy.fixture.tiers) {
  const file = path.join(evidenceRoot, `tier-${tier}.json`)
  if (!fs.existsSync(file)) { failures.push(`tier ${tier}: evidence missing`); continue }
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'))
  const actual = evidence.actual || {}
  const phases = actual.phaseProfile || {}
  const diagnostics = actual.stableWorkerDiagnostics || {}
  const maximumInteraction = Math.max(0, ...Object.entries(actual.interactions || {}).filter(([key, value]) => key.endsWith('LatencyMs') && typeof value === 'number').map(([, value]) => value))
  const remainingVisualPhases = ['canvas-draw', 'edge-routing', 'community-detection', 'community-overview', 'community-contours', 'semantic-key-selection', 'node-status-derivation']
  const nonContinuousMaximum = Math.max(0, ...remainingVisualPhases.map(name => Number(phases[name]?.maximumMs || 0)))
  const checks = {
    stage: evidence.stage === policy.stage,
    completed: actual.completed !== false,
    graphShape: actual.nodeCount === tier && actual.edgeCount === tier - 1,
    stableBudget: actual.layoutStableMs <= policy.expectations.layoutStableMaximumMs[String(tier)],
    interactionBudget: maximumInteraction <= policy.expectations.interactionMaximumMs[String(tier)],
    workerSettled: diagnostics.state === 'settled' && diagnostics.pending === false,
    mainThreadLayoutBounded: Math.max(phases['layout-worker-dispatch']?.maximumMs || 0, phases['layout-worker-apply']?.maximumMs || 0, diagnostics.applyMaximumMs || 0) <= policy.expectations.mainThreadLayoutMaximumMs,
    remainingPhasesBounded: nonContinuousMaximum <= policy.expectations.nonContinuousPhaseMaximumMs,
    settledIdle: actual.frameActivity?.settledDrawsPerSecond <= policy.expectations.settledDrawsPerSecondMaximum,
    settledNoLongTasks: (actual.settledIdleLongTasks || []).length <= policy.expectations.settledIdleLongTasksMaximum,
    inactiveIdle: actual.frameActivity?.libraryDraws === 0,
    runtimeSafe: actual.runtimeErrors === policy.expectations.runtimeErrors,
    sourceSafe: actual.sourceFilesUnchanged === policy.expectations.sourceFilesUnchanged,
    returned: actual.returnedToLibrary === policy.expectations.returnedToLibrary,
  }
  if (tier === 1000) {
    const resource = actual.resourceLifecycle || {}
    const initial = resource.afterInitialReturn || null
    const final = resource.afterLifecycle || null
    checks.lifecycleCompleted = actual.lifecycle?.completed === true && actual.lifecycle?.cycles === policy.expectations.lifecycleCycles
    checks.lifecycleHeapBounded = actual.lifecycle?.heapDeltaBytes <= policy.expectations.lifecycleHeapDeltaMaximumBytes
    checks.lifecycleWorkerJobsDispatched = final?.workerJobsDispatched >= policy.expectations.lifecycleCycles
    checks.activeWorkerCancellationObserved = actual.activeCancellationProbe?.before?.state === 'running'
      && actual.activeCancellationProbe?.before?.pending === true
      && actual.activeCancellationProbe?.inactive?.pending === false
    checks.initialResourcesReleased = resourcesReleased(initial)
    checks.cycledResourcesReleased = resourcesReleased(final)
    checks.returnRouteListenersStable = JSON.stringify(listenerShape(initial)) === JSON.stringify(listenerShape(final))
  }
  if (tier === policy.exportContract.tier) {
    const exported = actual.exports
    const svgValid = item => item?.format === 'svg' && item.nodeCount === item.expectedNodes && item.edgeCount === item.expectedEdges
      && item.metadataNodeCount === item.expectedNodes && item.metadataEdgeCount === item.expectedEdges && item.hasFiniteGeometry === true
      && item.bytes > 0 && item.durationMs <= policy.expectations.exportMaximumMs
    const pngValid = item => item?.format === 'png' && item.signature === '89504e470d0a1a0a' && item.bytes > 0
      && item.width > 0 && item.height > 0 && item.width <= policy.expectations.pngMaximumDimension
      && item.height <= policy.expectations.pngMaximumDimension && item.width * item.height <= policy.expectations.pngMaximumPixels
      && item.durationMs <= policy.expectations.exportMaximumMs
    checks.fullSvg = svgValid(exported?.full?.svg)
    checks.fullPng = pngValid(exported?.full?.png)
    checks.filteredScope = exported?.filtered?.nodes > 0 && exported.filtered.nodes < tier && exported.filtered.edges >= 0 && exported.filtered.edges < tier - 1
    checks.filteredSvg = svgValid(exported?.filtered?.svg)
    checks.filteredPng = pngValid(exported?.filtered?.png)
  }
  for (const [name, passed] of Object.entries(checks)) if (!passed) failures.push(`tier ${tier}: ${name}`)
  summaries.push(`${tier}=${actual.layoutStableMs}ms stable, idle-longtasks=${actual.settledIdleLongTasks?.length ?? -1}, remaining-max=${nonContinuousMaximum.toFixed(1)}ms`)
}

if (failures.length) {
  console.error(`M3C-4 performance exit audit failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M3C-4 performance exit accepted: ${summaries.join('; ')}.`)
