import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const fail = message => { throw new Error(`M8-5 real desktop evidence rejected: ${message}`) }
const requireFact = (condition, message) => { if (!condition) fail(message) }
const root = 'docs/evidence/post-v119-m8-5-graph-visual-performance'
const policy = JSON.parse(fs.readFileSync('shared/post-v119-m8-5-knowledge-graph-visual-performance-polish-policy.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const evidence = JSON.parse(fs.readFileSync(path.join(root, manifest.evidenceFile), 'utf8'))
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

requireFact(policy.stage === 'M8-5' && policy.status === 'accepted-real-desktop-audit-passed', 'policy is not accepted')
requireFact(manifest.status === 'accepted' && manifest.visualReview === 'accepted', 'manifest or manual visual review is not accepted')
requireFact(manifest.productSourceCommit === policy.productSourceCommit && evidence.sourceCommit === policy.productSourceCommit, 'product source identity drifted')
requireFact(fs.statSync(path.join(root, manifest.evidenceFile)).size === manifest.evidenceBytes && digest(path.join(root, manifest.evidenceFile)) === manifest.evidenceSha256, 'desktop evidence integrity drifted')
for (const screenshot of manifest.screenshots) {
  const file = path.join(root, screenshot.file)
  requireFact(fs.statSync(file).size === screenshot.bytes && digest(file) === screenshot.sha256, `screenshot integrity drifted: ${screenshot.file}`)
}
requireFact(evidence.nodeCount === 180 && evidence.edgeCount === 540 && evidence.semanticLevel === 'middle', 'connected graph scenario drifted')
requireFact(evidence.autoFitCompletionCount >= 1 && evidence.fitPointCount === 180 && evidence.fitPointsInBounds === true, 'settled graph did not auto-fit all nodes')
requireFact(evidence.denseEdgeArrowPolicy === 'priority-only' && evidence.statusRingCount === 12, 'dense middle visual hierarchy drifted')
requireFact(evidence.selectedCount === 0 && evidence.loopContinuous === 'false', 'default graph must be unselected and idle')
requireFact(evidence.activeSelection?.selectedCount === 1 && evidence.activeSelection?.selectionEffect === 'active' && evidence.activeSelection?.detailsVisible === true && evidence.activeSelection?.tooltipVisible === false, 'active selection feedback drifted')
requireFact(evidence.settledSelection?.selectionEffect === 'settled' && evidence.settledSelection?.loopContinuous === 'false' && evidence.settledSelection?.tooltipVisible === false, 'selection effect did not settle cleanly')
requireFact(Number.isFinite(evidence.canvasDrawMaximumMs) && evidence.canvasDrawMaximumMs <= 8, 'steady selection Canvas draw exceeded 8 ms')
requireFact(Array.isArray(evidence.runtimeErrors) && evidence.runtimeErrors.length === 0, 'runtime errors were observed')
requireFact(evidence.sourceFilesUnchanged === true && evidence.sourceUserContentIncluded === false && evidence.releaseCandidate === false, 'source safety or release boundary drifted')

console.log(`M8-5 real desktop evidence accepted: all 180 nodes auto-fit, dense middle arrows are priority-only, 12 status rings remain, bounded selection settles idle, Canvas draw peaks at ${evidence.canvasDrawMaximumMs.toFixed(1)} ms and runtime errors are zero.`)
