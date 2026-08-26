import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'docs/evidence/post-v115-m1b2a-docx-object-selection')
const evidenceBytes = await fs.readFile(path.join(output, 'object-selection-evidence.json'))
const evidence = JSON.parse(evidenceBytes)
const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'))
const producerMatrix = JSON.parse(await fs.readFile(path.join(root, 'fixtures/docx/producers/matrix.json'), 'utf8'))
const hyperlinkMatrix = JSON.parse(await fs.readFile(path.join(root, 'fixtures/docx/hyperlinks/matrix.json'), 'utf8'))

const requireFact = (condition, message) => {
  if (!condition) throw new Error(message)
}
requireFact(evidence.schemaVersion === 1 && evidence.stage === 'M1B2A' && evidence.status === 'passed-selection-audit', 'M1B2A evidence identity is invalid')
requireFact(evidence.expected?.writebackOpenedInThisStage === false, 'M1B2A must remain an audit-only stage')
requireFact(evidence.actual?.producerInventory?.length === 3, 'M1B2A base producer inventory must contain three real files')
requireFact(evidence.actual?.hyperlinkInventory?.length === 3, 'M1B2A hyperlink inventory must contain three real files')

for (const item of evidence.actual.producerInventory) {
  const matrixItem = producerMatrix.producers.find(candidate => candidate.id === item.producerId)
  requireFact(matrixItem?.status === 'verified', `Unverified DOCX producer: ${item.producerId}`)
  const producerManifest = JSON.parse(await fs.readFile(path.join(root, 'fixtures/docx/producers', matrixItem.manifest), 'utf8'))
  const bytes = await fs.readFile(path.join(root, 'fixtures/docx/producers', matrixItem.fixture))
  requireFact(item.sourceBytes === bytes.length, `DOCX source size drifted: ${item.producerId}`)
  requireFact(item.sourceSha256 === producerManifest.sha256, `DOCX manifest digest drifted: ${item.producerId}`)
  requireFact(item.sourceSha256 === crypto.createHash('sha256').update(bytes).digest('hex'), `DOCX file digest drifted: ${item.producerId}`)
  requireFact(item.currentRead?.tables === 1 && item.currentRead?.images === 1, `DOCX common object baseline drifted: ${item.producerId}`)
  requireFact(item.currentRead?.definedParagraphStyles > 0 && item.currentRead?.referencedParagraphStyles?.length > 0, `DOCX paragraph style evidence missing: ${item.producerId}`)
}

for (const item of evidence.actual.hyperlinkInventory) {
  const matrixItem = hyperlinkMatrix.producers.find(candidate => candidate.id === item.producerId)
  const bytes = await fs.readFile(path.join(root, 'fixtures/docx/hyperlinks', matrixItem.file))
  requireFact(item.sourceBytes === bytes.length, `Hyperlink source size drifted: ${item.producerId}`)
  requireFact(item.sourceSha256 === matrixItem.sha256, `Hyperlink manifest digest drifted: ${item.producerId}`)
  requireFact(item.currentEdit?.hyperlinkLabelTargets === matrixItem.expectedEditableLabels, `Hyperlink editable target count drifted: ${item.producerId}`)
}

requireFact(evidence.difference?.broadCommonObjectGapConfirmed === false, 'M1B2A must retain the corrected common-object baseline')
requireFact(evidence.difference?.crossProducerStyleEditGapConfirmed === true, 'M1B2A cross-producer style gap is missing')
requireFact(evidence.selection?.nextStage === 'M1B2B' && evidence.selection?.object === 'existing-paragraph-style-assignment', 'M1B2A next object selection drifted')
requireFact(evidence.selection?.mustReject?.includes('complex-paragraph-properties'), 'M1B2A complex paragraph rejection boundary is missing')
requireFact(evidence.releaseCandidate === false && manifest.releaseCandidate === false, 'M1B2A cannot be a release candidate')
requireFact(manifest.evidenceSha256 === crypto.createHash('sha256').update(evidenceBytes).digest('hex'), 'M1B2A evidence digest mismatch')
requireFact(/^[0-9a-f]{40}$/i.test(manifest.sourceCommit), 'M1B2A source commit is invalid')

console.log('M1B2A DOCX object selection evidence verified: 6 real fixtures, paragraph style assignment selected, writeback remains closed.')
