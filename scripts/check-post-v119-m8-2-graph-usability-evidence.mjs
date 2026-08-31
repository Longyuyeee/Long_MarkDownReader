import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const fail = message => { throw new Error(`M8-2 evidence rejected: ${message}`) }
const requireFact = (condition, message) => { if (!condition) fail(message) }
const root = 'docs/evidence/post-v119-m8-2-graph-usability'
const policy = JSON.parse(fs.readFileSync('shared/post-v119-m8-2-knowledge-graph-real-tauri-visual-interaction-audit-policy.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const evidence = JSON.parse(fs.readFileSync(path.join(root, manifest.evidenceFile), 'utf8'))
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

requireFact(policy.stage === 'M8-2' && policy.status === 'accepted' && policy.predecessor === 'M8-1', 'policy chain drifted')
requireFact(manifest.status === 'accepted' && manifest.visualReview === 'accepted' && manifest.productSourceCommit === policy.productSourceCommit, 'manifest identity drifted')
requireFact(fs.statSync(path.join(root, manifest.evidenceFile)).size === manifest.evidenceBytes && digest(path.join(root, manifest.evidenceFile)) === manifest.evidenceSha256, 'evidence integrity drifted')
for (const screenshot of manifest.screenshots) requireFact(fs.statSync(path.join(root, screenshot.file)).size === screenshot.bytes && digest(path.join(root, screenshot.file)) === screenshot.sha256, `screenshot integrity drifted: ${screenshot.file}`)
for (const [key, value] of Object.entries({
  nodeCount: 540,
  semanticLevel: 'far',
  communitySummaryCount: 0,
  communityOverviewVisible: false,
  backingStoreMatchesViewport: true,
  backingMutationCount: 0,
  panChangedCamera: true,
  singleClickStayedInGraph: true,
  singleClickSelectedNode: true,
  singleClickDetailsVisible: true,
  legendCollapsed: true,
  operationHelpVisible: true,
  filterPanelVisible: true,
  legendHiddenWhileFilterOpen: true,
  sourceFilesUnchanged: true,
})) requireFact(evidence[key] === value, `desktop fact drifted: ${key}`)
requireFact(Array.isArray(evidence.runtimeErrors) && evidence.runtimeErrors.length === 0, 'runtime errors were observed')
requireFact(evidence.sourceCommit === policy.productSourceCommit && evidence.sourceUserContentIncluded === false && evidence.releaseCandidate === false, 'source or privacy boundary drifted')
console.log('M8-2 real Tauri evidence accepted: 540-node far view, stable backing store, pan, click selection, compact help, filter overlay isolation, zero runtime errors and artifact integrity passed.')
