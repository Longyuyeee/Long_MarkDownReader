import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const selection = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const tierPath = 'docs/evidence/post-v115-m3c4-large-graph-performance-exit-audit/tier-5000.json'
const tier = readJson(tierPath)
const evidenceFlag = process.argv.indexOf('--write-evidence')
const evidencePath = evidenceFlag >= 0 ? process.argv[evidenceFlag + 1] : null

if (evidenceFlag >= 0 && !evidencePath) throw new Error('--write-evidence requires a repository-relative JSON path')
if (selection.stage !== 'M4D-0' || selection.selection?.files?.length !== 4) throw new Error('M4D-0 exact cleanup selection is unavailable')

const verified = []
for (const file of selection.selection.files) {
  const match = file.match(/\/(full|filtered)-5000\.(svg|png)$/)
  if (!match) throw new Error(`M4D-0 selected an unexpected path: ${file}`)
  const [, scope, format] = match
  const retained = tier.actual?.exports?.[scope]?.[format]
  const absolute = path.join(root, file)
  if (!fs.existsSync(absolute)) throw new Error(`selected payload is missing before cleanup: ${file}`)
  const bytes = fs.readFileSync(absolute)
  const digest = sha256(bytes)
  if (retained?.bytes !== bytes.length || retained?.sha256 !== digest) throw new Error(`payload does not match retained metrics: ${file}`)
  verified.push({ absolute, file, bytes: bytes.length, sha256: digest, retainedMetric: `${tierPath}#actual.exports.${scope}.${format}` })
}

const removed = []
for (const item of verified) {
  fs.unlinkSync(item.absolute)
  if (fs.existsSync(item.absolute)) throw new Error(`payload remains after cleanup: ${item.file}`)
  const { absolute, ...record } = item
  removed.push(record)
}

const evidence = {
  schemaVersion: 1,
  stage: 'M4D-1',
  status: 'passed',
  selectionStage: selection.stage,
  removed,
  removedFileCount: removed.length,
  removedBytes: removed.reduce((total, item) => total + item.bytes, 0),
  retainedMetricsFile: tierPath,
  cleanupBoundary: 'exact-M4D-0-selection-only',
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}

if (evidencePath) {
  const absoluteEvidence = path.join(root, evidencePath)
  fs.mkdirSync(path.dirname(absoluteEvidence), { recursive: true })
  fs.writeFileSync(absoluteEvidence, `${JSON.stringify(evidence, null, 2)}\n`)
}
console.log(`M4D-1 cleanup passed: removed ${evidence.removedFileCount} verified generated payloads (${evidence.removedBytes} bytes); structured metrics remain in ${tierPath}.`)
