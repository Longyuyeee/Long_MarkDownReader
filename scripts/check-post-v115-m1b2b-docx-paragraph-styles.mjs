import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'docs/evidence/post-v115-m1b2b-docx-paragraph-styles')
const evidence = JSON.parse(await fs.readFile(path.join(output, 'desktop-evidence.json'), 'utf8'))

const requireFact = (condition, message) => {
  if (!condition) throw new Error(message)
}

requireFact(evidence.schemaVersion === 1 && evidence.stage === 'M1B2B' && evidence.status === 'passed', 'M1B2B evidence identity is invalid')
requireFact(/^[0-9a-f]{40}$/i.test(evidence.sourceCommit), 'M1B2B source commit is invalid')
requireFact(evidence.expected?.realProducerFiles === 3, 'M1B2B must cover three real producer files')
requireFact(evidence.actual?.results?.length === 3, 'M1B2B producer result count drifted')
requireFact(evidence.actual?.runtimeErrors === 0, 'M1B2B desktop runtime errors were recorded')

const expectedProducers = new Set(['microsoft-word-16', 'wps-writer', 'libreoffice-writer'])
for (const result of evidence.actual.results) {
  requireFact(expectedProducers.delete(result.producerId), `Unexpected or duplicate M1B2B producer: ${result.producerId}`)
  requireFact(/^[0-9a-f]{64}$/i.test(result.beforeSha256) && /^[0-9a-f]{64}$/i.test(result.afterSha256), `Invalid source digest: ${result.producerId}`)
  requireFact(result.beforeSha256 !== result.afterSha256, `Explicit save did not alter the source package: ${result.producerId}`)
  requireFact(result.selectedStyle?.before !== result.selectedStyle?.after && result.selectedStyle?.optionCount >= 2, `Existing style selection was not exercised: ${result.producerId}`)
  for (const fact of ['draftSourceUnchanged', 'undoRedo', 'isolatedPreview', 'explicitSave', 'savedReopen', 'responsive960x720']) {
    requireFact(result[fact] === true, `M1B2B ${fact} failed: ${result.producerId}`)
  }
  const screenshot = path.join(output, `${result.producerId}-paragraph-style-draft.jpg`)
  requireFact((await fs.stat(screenshot)).size > 20_000, `M1B2B screenshot is missing or trivial: ${result.producerId}`)
}

requireFact(expectedProducers.size === 0, `M1B2B producers are missing: ${[...expectedProducers].join(', ')}`)
requireFact(evidence.sourceUserContentIncluded === false, 'M1B2B evidence must not include user document content')
requireFact(evidence.releaseCandidate === false, 'M1B2B cannot be a release candidate')

console.log('M1B2B DOCX paragraph style evidence verified: three producers, draft history, isolated preview, explicit save, reopen and responsive UI.')
