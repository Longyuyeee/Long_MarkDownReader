import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const output = path.resolve(process.env.LONGEDIT_M1B2A_AUDIT_OUTPUT || path.join(root, 'docs/evidence/post-v115-m1b2a-docx-object-selection'))
const evidencePath = path.join(output, 'object-selection-evidence.json')
const sourceCommit = process.env.LONGEDIT_M1B2A_SOURCE_COMMIT || ''

if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M1B2A source commit is missing')
const evidenceBytes = await fs.readFile(evidencePath)
const evidence = JSON.parse(evidenceBytes)
if (evidence.stage !== 'M1B2A' || evidence.status !== 'passed-selection-audit') throw new Error('M1B2A evidence status is invalid')
if (evidence.actual?.producerInventory?.length !== 3 || evidence.actual?.hyperlinkInventory?.length !== 3) throw new Error('M1B2A must contain six real producer inventories')
if (evidence.selection?.object !== 'existing-paragraph-style-assignment') throw new Error('M1B2A selected object drifted')
if (evidence.expected?.writebackOpenedInThisStage !== false || evidence.releaseCandidate !== false) throw new Error('M1B2A must not open writeback or release')

const manifest = {
  schemaVersion: 1,
  stage: 'M1B2A',
  status: 'passed',
  sourceCommit,
  evidenceFile: 'object-selection-evidence.json',
  evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'),
  realFixtureCount: 6,
  selectedNextObject: evidence.selection.object,
  sourceUserContentIncluded: false,
  releaseCandidate: false
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log('M1B2A evidence captured: six real DOCX fixtures; paragraph style assignment selected for M1B2B.')
