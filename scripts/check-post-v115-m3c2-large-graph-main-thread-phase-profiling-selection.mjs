import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m3c2-large-graph-main-thread-phase-profiling-selection-policy.json', 'utf8'))
const evidenceRoot = 'docs/evidence/post-v115-m3c2-large-graph-main-thread-phase-profiling-selection'
const fail = message => { throw new Error(`M3C-2 profiling audit failed: ${message}`) }
const requireValue = (condition, message) => { if (!condition) fail(message) }

requireValue(policy.stage === 'M3C-2' && policy.predecessor === 'M3C-1' && !policy.releaseCandidate, 'stage chain drifted')
const observed = new Set()
const summaries = []
let tier5000Profile = null
for (const tier of policy.fixture.tiers) {
  const evidence = JSON.parse(fs.readFileSync(`${evidenceRoot}/tier-${tier}.json`, 'utf8'))
  const actual = evidence.actual
  requireValue(evidence.stage === policy.stage && evidence.tier === tier, `${tier}: evidence identity drifted`)
  requireValue(actual.nodeCount === tier && actual.edgeCount === tier - 1, `${tier}: graph shape drifted`)
  requireValue(actual.runtimeErrors === policy.expectations.runtimeErrors && actual.sourceFilesUnchanged && actual.returnedToLibrary, `${tier}: runtime/source/return safety failed`)
  if (actual.completed === false) requireValue(tier === 5000 && actual.failureStage === 'layout-stable' && actual.layoutStableMs >= 120000, 'unexpected bounded profiling failure')
  else requireValue(actual.frameActivity.settledDrawsPerSecond <= 2 && actual.frameActivity.focusResumeLayoutRestarts === 0, `${tier}: M3C-1 loop behavior regressed`)
  requireValue(actual.profilingCalibration?.deterministicSeed === tier, `${tier}: deterministic random control missing`)
  requireValue(actual.profilingCalibration.bookkeepingMicrosecondsPerCall <= policy.expectations.profilingBookkeepingMaximumMicrosecondsPerCall, `${tier}: profiling bookkeeping overhead exceeds budget`)
  requireValue(actual.phaseProfile && Object.keys(actual.phaseProfile).length, `${tier}: phase profile missing`)
  for (const [name, phase] of Object.entries(actual.phaseProfile)) {
    observed.add(name)
    requireValue(phase.count > 0 && phase.totalMs >= phase.maximumMs && phase.maximumMs >= 0, `${tier}: invalid phase ${name}`)
  }
  if (tier === 5000) tier5000Profile = actual.phaseProfile
  summaries.push(`${tier}=${actual.firstVisibleMs}/${actual.layoutStableMs}ms${actual.completed === false ? ' bounded' : ''}`)
}
for (const phase of policy.phases) requireValue(observed.has(phase), `phase never observed: ${phase}`)
requireValue(tier5000Profile, '5000-node profile missing')

const nestedDrawPhases = ['community-detection', 'edge-routing', 'node-status-derivation', 'semantic-key-selection', 'community-contours', 'community-overview']
const nestedTotal = nestedDrawPhases.reduce((total, name) => total + (tier5000Profile[name]?.totalMs || 0), 0)
const candidates = {
  'layout-simulation': tier5000Profile['layout-simulation']?.totalMs || 0,
  'canvas-draw-exclusive-estimate': Math.max(0, (tier5000Profile['canvas-draw']?.totalMs || 0) - nestedTotal),
  'semantic-derived-total': nestedTotal,
}
const dominant = Object.entries(candidates).sort((left, right) => right[1] - left[1])[0]
requireValue(dominant[1] > 0, 'dominant main-thread phase cannot be selected')
if (policy.selectionDecision) requireValue(policy.selectionDecision.dominantPhase === dominant[0], `selection decision does not match profile: ${dominant[0]}`)

console.log(`M3C-2 phase profile accepted: ${summaries.join('; ')}; 5000-node dominant=${dominant[0]} ${Math.round(dominant[1])}ms; layout=${Math.round(candidates['layout-simulation'])}ms, draw-exclusive=${Math.round(candidates['canvas-draw-exclusive-estimate'])}ms, semantic=${Math.round(candidates['semantic-derived-total'])}ms.`)
