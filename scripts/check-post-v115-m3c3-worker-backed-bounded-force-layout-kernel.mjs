import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const policy = JSON.parse(fs.readFileSync(path.join(root, 'shared/post-v115-m3c3-worker-backed-bounded-force-layout-kernel-policy.json'), 'utf8'))
const evidenceRoot = path.join(root, 'docs/evidence/post-v115-m3c3-worker-backed-bounded-force-layout-kernel')
const tiers = [100, 1000, 5000]
const failures = []
const summaries = []

for (const tier of tiers) {
  const file = path.join(evidenceRoot, `tier-${tier}.json`)
  if (!fs.existsSync(file)) { failures.push(`tier ${tier}: evidence missing`); continue }
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'))
  const actual = evidence.actual || {}
  const diagnostics = actual.stableWorkerDiagnostics || actual.workerDiagnostics || {}
  const phases = actual.phaseProfile || {}
  const apply = phases['layout-worker-apply'] || {}
  const maximumStableMs = policy.expectations.layoutStableMaximumMs[String(tier)]
  const maximumInteractionMs = policy.expectations.interactionMaximumMs[String(tier)]
  const maximumInteraction = Math.max(0, ...Object.entries(actual.interactions || {}).filter(([key, value]) => key.endsWith('LatencyMs') && typeof value === 'number').map(([, value]) => value))
  const checks = {
    stage: evidence.stage === 'M3C-3',
    completed: actual.completed !== false,
    graphShape: actual.nodeCount === tier && actual.edgeCount === tier - 1,
    stableBudget: actual.layoutStableMs <= maximumStableMs,
    interactionBudget: maximumInteraction <= maximumInteractionMs,
    workerSettled: diagnostics.state === 'settled' && diagnostics.pending === false,
    deterministicCandidateLimit: diagnostics.candidateLimit === policy.implementation.maximumRepulsionCandidatesPerNodePerTick,
    candidateWorkBounded: diagnostics.candidateChecks <= tier * diagnostics.candidateLimit,
    workerComputeObserved: diagnostics.workerPhaseProfile?.['layout-worker-compute']?.count > 0,
    applyObserved: apply.count > 0,
    mainLayoutBounded: Math.max(apply.maximumMs || 0, phases['layout-simulation']?.maximumMs || 0, diagnostics.applyMaximumMs || 0) <= policy.expectations.mainThreadLayoutMaximumMs,
    settledIdle: actual.frameActivity?.settledDrawsPerSecond <= policy.expectations.settledDrawsPerSecondMaximum,
    inactiveIdle: actual.frameActivity?.inactiveDraws <= policy.expectations.inactiveDrawsMaximum && actual.frameActivity?.libraryDraws === 0,
    focusResumeStable: actual.frameActivity?.focusResumeLayoutRestarts === 0,
    runtimeSafe: actual.runtimeErrors === policy.expectations.runtimeErrors,
    sourceSafe: actual.sourceFilesUnchanged === true,
    returned: actual.returnedToLibrary === true,
  }
  if (tier === 1000) {
    checks.activeCancellation = actual.activeCancellationProbe?.before?.state === 'running'
      && actual.activeCancellationProbe?.inactive?.pending === false
      && ['running', 'settled'].includes(actual.activeCancellationProbe?.resumed?.state)
  }
  for (const [name, passed] of Object.entries(checks)) if (!passed) failures.push(`tier ${tier}: ${name}`)
  summaries.push(`${tier}=${actual.firstVisibleMs}/${actual.layoutStableMs}ms, main-layout-max=${Math.max(apply.maximumMs || 0, phases['layout-simulation']?.maximumMs || 0, diagnostics.applyMaximumMs || 0).toFixed(1)}ms, worker-max=${Number(diagnostics.computeMaximumMs || 0).toFixed(1)}ms`)
}

const kernelSource = fs.readFileSync(path.join(root, policy.implementation.kernelModule), 'utf8')
const viewSource = fs.readFileSync(path.join(root, 'src/components/GraphView.vue'), 'utf8')
if (!kernelSource.includes('GRAPH_FORCE_LAYOUT_MAX_CANDIDATES_PER_NODE = 48')) failures.push('kernel candidate limit is not frozen at 48')
if (!viewSource.includes("new Worker(new URL('../workers/graphForceLayout.worker.ts', import.meta.url)")) failures.push('module Worker wiring missing')
if (!viewSource.includes('result.jobId !== layoutWorkerJobId')) failures.push('stale Worker result guard missing')
if (!viewSource.includes('layoutWorker?.terminate()')) failures.push('Worker unmount termination missing')

if (failures.length) {
  console.error(`M3C-3 worker layout audit failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M3C-3 worker layout accepted: ${summaries.join('; ')}.`)
