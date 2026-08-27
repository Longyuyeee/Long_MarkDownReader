import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'docs/evidence/post-v115-m1b2c-docx-closure')
const native = JSON.parse(await fs.readFile(path.join(output, 'native-roundtrip.json'), 'utf8'))
const reverse = JSON.parse(await fs.readFile(path.join(output, 'longedit-reverse-read.json'), 'utf8'))
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const forbiddenPath = /[A-Z]:\\|\\Users\\|AppData|Project\\AIProject/i

requireFact(native.schemaVersion === 1 && native.stage === 'M1B2C-native-roundtrip' && native.status === 'passed', 'M1B2C native identity is invalid')
requireFact(native.actual?.verifiedProducers === 3 && native.actual?.producerSourcePairs === 9 && native.actual?.stablePairs === 9, 'M1B2C native matrix must pass 3 producers and 9 pairs')
requireFact(native.rawOfficeOutputsCommitted === false && native.sourceUserContentIncluded === false, 'M1B2C native privacy boundary drifted')
const expectedProducers = new Set(['microsoft-word-16', 'wps-writer', 'libreoffice-writer'])
for (const producer of native.producers || []) {
  requireFact(expectedProducers.delete(producer.id), `Unexpected or duplicate native producer: ${producer.id}`)
  requireFact(producer.status === 'verified' && producer.version && producer.method, `Native producer is incomplete: ${producer.id}`)
  requireFact(producer.files?.length === 3, `Native producer must cover three LongEdit sources: ${producer.id}`)
  for (const file of producer.files) {
    requireFact(file.sourceUnchanged === true && file.independentReopen === true && file.actualStable === true, `Native pair failed: ${producer.id}/${file.sourceId}`)
    requireFact(/^[0-9a-f]{64}$/i.test(file.sha256) && file.bytes > 1000 && file.expectedHeading, `Native pair facts invalid: ${producer.id}/${file.sourceId}`)
    if (producer.id !== 'libreoffice-writer') {
      requireFact(file.saveMetrics?.firstParagraphStyle === file.reopenMetrics?.firstParagraphStyle, `COM style drifted: ${producer.id}/${file.sourceId}`)
      requireFact(file.saveMetrics?.firstParagraphText === file.reopenMetrics?.firstParagraphText, `COM text drifted: ${producer.id}/${file.sourceId}`)
    } else requireFact(file.renderedPdfBytes > 1000, `LibreOffice independent render failed: ${file.sourceId}`)
  }
}
requireFact(expectedProducers.size === 0, `Native producers missing: ${[...expectedProducers].join(', ')}`)
requireFact(!forbiddenPath.test(JSON.stringify(native)), 'Native evidence exposes a local full path')

requireFact(reverse.schemaVersion === 1 && reverse.stage === 'M1B2C-longedit-reverse-read' && reverse.status === 'passed', 'M1B2C reverse-read identity is invalid')
requireFact(/^[0-9a-f]{40}$/i.test(reverse.sourceCommit), 'M1B2C source commit is invalid')
requireFact(reverse.actual?.results?.length === 9 && reverse.actual?.runtimeErrors === 0, 'M1B2C reverse-read must pass 9 files without runtime errors')
for (const result of reverse.actual.results) {
  requireFact(result.sourceUnchangedAfterRead === true && result.responsive960x720 === true, `LongEdit reverse-read failed: ${result.producerId}/${result.sourceId}`)
  requireFact(result.actualStyle?.value === result.expectedStyleId && result.actualStyle?.label && result.actualStyle?.optionCount >= 2, `LongEdit style recovery failed: ${result.producerId}/${result.sourceId}`)
}
for (const producerId of ['microsoft-word-16', 'wps-writer', 'libreoffice-writer']) {
  requireFact((await fs.stat(path.join(output, `${producerId}-reverse-read.jpg`))).size > 20_000, `M1B2C screenshot missing or trivial: ${producerId}`)
}
requireFact(reverse.sourceUserContentIncluded === false && reverse.releaseCandidate === false, 'M1B2C reverse-read boundary drifted')
requireFact(!forbiddenPath.test(JSON.stringify(reverse)), 'Reverse-read evidence exposes a local full path')
console.log('M1B2C DOCX closure evidence verified: 3 native producers, 9 independent roundtrips, 9 LongEdit reverse reads, source hashes unchanged.')
