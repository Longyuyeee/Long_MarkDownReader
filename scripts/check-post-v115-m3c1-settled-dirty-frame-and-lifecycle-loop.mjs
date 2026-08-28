import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m3c1-settled-dirty-frame-and-lifecycle-loop-policy.json', 'utf8'))
const source = fs.readFileSync('src/components/GraphView.vue', 'utf8')
const evidenceRoot = 'docs/evidence/post-v115-m3c1-settled-dirty-frame-and-lifecycle-loop'
const fail = message => { throw new Error(`M3C-1 dirty-frame audit failed: ${message}`) }
const requireValue = (condition, message) => { if (!condition) fail(message) }

requireValue(policy.stage === 'M3C-1' && policy.baselineStage === 'M3C-0', 'stage chain drifted')
requireValue(source.includes('graphLoopNeedsContinuousFrames') && source.includes('requestGraphFrame'), 'dirty-frame scheduler is missing')
requireValue(!source.includes('layoutSettled = false\n  frameCount = 40\n  loop()'), 'focus still forces a layout restart')

const summaries = []
for (const tier of policy.fixture.tiers) {
  const evidence = JSON.parse(fs.readFileSync(`${evidenceRoot}/tier-${tier}.json`, 'utf8'))
  const actual = evidence.actual
  requireValue(evidence.stage === policy.stage && evidence.tier === tier, `${tier}: evidence identity drifted`)
  requireValue(actual.nodeCount === tier && actual.edgeCount === tier - 1, `${tier}: real graph shape drifted`)
  requireValue(actual.frameActivity.settledDrawsPerSecond <= policy.expected.settledDrawsPerSecondMaximum, `${tier}: settled drawing exceeds budget`)
  requireValue(actual.frameActivity.inactiveDraws <= policy.expected.inactiveDrawsMaximum, `${tier}: inactive drawing exceeds budget`)
  requireValue(actual.frameActivity.libraryDraws <= policy.expected.libraryDrawsMaximum, `${tier}: library drawing did not stop`)
  requireValue(actual.frameActivity.focusResumeLayoutRestarts === policy.expected.focusResumeLayoutRestartMaximum, `${tier}: focus restarted stable layout`)
  requireValue(actual.frameActivity.resumeLayoutBefore.settled && actual.frameActivity.resumeLayoutAfter.settled, `${tier}: focus resume lost settled state`)
  requireValue(actual.runtimeErrors === policy.expected.runtimeErrors, `${tier}: runtime errors detected`)
  requireValue(actual.sourceFilesUnchanged === policy.expected.sourceFilesUnchanged && actual.beforeSha256 === actual.afterSha256, `${tier}: source library changed`)
  requireValue(actual.returnedToLibrary === policy.expected.returnedToLibrary, `${tier}: did not return to library`)
  requireValue(actual.interactions.zoomChanged && actual.interactions.panChanged && actual.interactions.panFullGraph, `${tier}: real canvas interaction incomplete`)
  if (tier <= 1000) {
    requireValue(evidence.comparison.firstVisibleWithinExpectation, `${tier}: first-visible budget regressed`)
    requireValue(evidence.comparison.layoutStableWithinExpectation, `${tier}: layout budget regressed`)
    requireValue(evidence.comparison.interactionsWithinExpectation, `${tier}: interaction budget regressed`)
  }
  if (tier === 1000) {
    requireValue(actual.lifecycle.cycles === policy.expected.lifecycleCycles && actual.lifecycle.completed, '1000: lifecycle cycles incomplete')
    requireValue(Number.isFinite(actual.lifecycle.heapBeforeBytes) && Number.isFinite(actual.lifecycle.heapAfterBytes), '1000: lifecycle heap evidence missing')
    requireValue(actual.lifecycle.heapAfterBytes <= actual.lifecycle.heapBeforeBytes * 1.25, '1000: heap retained beyond bounded tolerance')
  }
  summaries.push(`${tier}=${actual.firstVisibleMs}/${actual.layoutStableMs}ms, idle ${actual.frameActivity.settledDrawsPerSecond}/s, resume ${actual.frameActivity.focusResumeLayoutRestarts}`)
}

console.log(`M3C-1 dirty-frame loop accepted: ${summaries.join('; ')}; original 5000-node layout/interaction limits remain independently visible.`)
