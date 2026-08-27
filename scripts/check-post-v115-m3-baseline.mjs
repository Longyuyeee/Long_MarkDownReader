import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const policy = JSON.parse(await fs.readFile(path.join(root, 'shared/post-v115-m3-baseline-policy.json'), 'utf8'))
const output = path.join(root, 'docs/evidence/post-v115-m3-baseline')
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }

requireFact(policy.stage === 'M3-0' && policy.releaseCandidate === false, 'M3-0 policy identity drifted')
requireFact(JSON.stringify(policy.graphTiers) === JSON.stringify([100, 1000, 5000]), 'M3-0 graph tiers drifted')
requireFact(policy.selectedNextStage?.id === 'M3A-1', 'M3-0 must select the semantic registry before visual work')

const summaries = []
for (const tier of policy.graphTiers) {
  const evidence = JSON.parse(await fs.readFile(path.join(output, `tier-${tier}.json`), 'utf8'))
  requireFact(evidence.stage === 'M3-0' && evidence.tier === tier, `M3-0 tier identity drifted: ${tier}`)
  requireFact(evidence.actual?.nodeCount === tier && evidence.actual?.edgeCount === tier - 1, `M3-0 graph shape drifted: ${tier}`)
  requireFact(evidence.actual?.firstVisibleMs > 0 && evidence.actual?.firstVisibleMs < 120000, `M3-0 first-visible missing: ${tier}`)
  requireFact(evidence.actual?.layoutStableMs > 0 && evidence.actual?.layoutStableMs < 120000, `M3-0 layout-stable missing: ${tier}`)
  requireFact(evidence.actual?.zoomChanged === true, `M3-0 zoom failed: ${tier}`)
  requireFact(evidence.actual?.centeredNodeSelected === true, `M3-0 centered selection failed: ${tier}`)
  requireFact(evidence.actual?.returnedToLibrary === true, `M3-0 return path failed: ${tier}`)
  requireFact(evidence.actual?.sourceFilesUnchanged === true, `M3-0 changed source files: ${tier}`)
  requireFact(evidence.actual?.runtimeErrors === 0, `M3-0 runtime errors detected: ${tier}`)
  if (tier === policy.lifecycle.tier) {
    requireFact(evidence.actual?.lifecycleCycles === policy.lifecycle.cycles, 'M3-0 lifecycle cycle count drifted')
    requireFact(evidence.actual?.lifecycleCompleted === true, 'M3-0 lifecycle did not remain navigable')
  }
  summaries.push({ tier, firstVisibleMs: evidence.actual.firstVisibleMs, layoutStableMs: evidence.actual.layoutStableMs, longTaskCount: evidence.actual.longTaskCount })
}

console.log(`M3-0 real desktop baseline accepted: ${summaries.map(item => `${item.tier} nodes ${item.firstVisibleMs}/${item.layoutStableMs}ms`).join(', ')}; 20-cycle lifecycle remained navigable.`)
