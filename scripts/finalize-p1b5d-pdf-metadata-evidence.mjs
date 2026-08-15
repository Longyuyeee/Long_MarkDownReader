import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve(process.argv[2] || 'docs/evidence/p1b5d-pdf-metadata')
const expected = [
  'runtime-evidence.json',
  'independent-verification.json',
  'metadata-draft-wide.png',
  'metadata-verified-wide.png',
  'metadata-verified-narrow.png',
  'metadata-saved-reopened.png',
  'poppler-source-page-1.png',
  'poppler-source-page-2.png',
  'poppler-target-page-1.png',
  'poppler-target-page-2.png',
]
const runtime = JSON.parse(await fs.readFile(path.join(output, 'runtime-evidence.json'), 'utf8'))
const independent = JSON.parse(await fs.readFile(path.join(output, 'independent-verification.json'), 'utf8'))
if (!runtime.passed || !independent.passed) throw new Error('P1-B5D evidence cannot be accepted before both gates pass')
const artifacts = []
for (const file of expected) {
  const bytes = await fs.readFile(path.join(output, file))
  artifacts.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'P1-B5D',
  status: 'accepted',
  sourceCommit: runtime.sourceCommit,
  artifacts,
  sourceUserContentIncluded: false,
}, null, 2)}\n`)
console.log('P1-B5D evidence manifest accepted.')
