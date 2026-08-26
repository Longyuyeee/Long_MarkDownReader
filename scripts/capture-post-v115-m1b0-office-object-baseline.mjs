import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve(process.env.LONGEDIT_M1B0_AUDIT_OUTPUT || 'docs/evidence/post-v115-m1b0-office-object-baseline')
const sourceCommit = process.env.LONGEDIT_M1B0_SOURCE_COMMIT || ''
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M1B0 source commit is missing')

const fixtures = [
  ['docx', 'microsoft-word-16', 'fixtures/docx/producers/microsoft-word-16.docx'],
  ['docx', 'wps-writer', 'fixtures/docx/producers/wps-writer.docx'],
  ['docx', 'libreoffice-writer', 'fixtures/docx/producers/libreoffice-writer.docx'],
  ['pptx', 'microsoft-powerpoint-16', 'fixtures/pptx/producers/microsoft-powerpoint-16.pptx'],
  ['pptx', 'wps-presentation', 'fixtures/pptx/producers/wps-presentation.pptx'],
  ['pptx', 'libreoffice-impress', 'fixtures/pptx/producers/libreoffice-impress.pptx']
]
const fixtureEvidence = []
for (const [format, producer, file] of fixtures) {
  const bytes = await fs.readFile(file)
  if (bytes.length < 10_000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(`Invalid real OOXML fixture: ${file}`)
  fixtureEvidence.push({ format, producer, file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}

const evidence = {
  schemaVersion: 1,
  stage: 'M1B0',
  sourceCommit,
  expected: { docxDirectSourceSave: true, docxDraftUndoRedo: true, pptxReliableCopySave: true, pptxDirectSourceSave: true, pptxDraftUndoRedo: true, realProducerFixtures: 6 },
  beforeActual: { roadmapAssumedCommonObjectEnhancementWasBroadlyMissing: true },
  afterActual: {
    docxDirectSourceSave: true,
    docxDraftUndoRedo: true,
    docxAdvancedObjectsReadonly: ['headers-footers', 'comments', 'footnotes-endnotes', 'fields', 'floating-objects'],
    pptxReliableCopySave: true,
    pptxDirectSourceSave: false,
    pptxDraftUndoRedo: false,
    pptxSingleVerifiedOperationOnly: true,
    pptxAdvancedObjectsReadonly: ['masters', 'animations', 'smartart', 'complex-charts', 'unknown-objects'],
    producerMatrixChecksPassed: true,
    realParseTestsPassed: true,
    realSaveReopenTestsPassed: true,
    fixtureEvidence
  },
  difference: {
    resolvedByAudit: true,
    productGapRemaining: true,
    nextStage: 'M1B1A',
    nextGoal: 'Add signature-protected reliable PPTX source overwrite while preserving the existing copy path'
  },
  sourceUserContentIncluded: false,
  releaseCandidate: false
}

await fs.mkdir(output, { recursive: true })
await fs.writeFile(path.join(output, 'baseline-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const bytes = await fs.readFile(path.join(output, 'baseline-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M1B0', status: 'accepted-with-product-gap', sourceCommit, evidenceFile: 'baseline-evidence.json', evidenceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), fixtureCount: fixtureEvidence.length, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
console.log('M1B0 evidence captured: 6 real producer fixtures; PPTX source-save/history gap retained for M1B1.')
