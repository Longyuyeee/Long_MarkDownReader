import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve(process.argv[2] || 'docs/evidence/p1b3d-pdf-redaction')
const expected = [
  'runtime-evidence.json',
  'independent-verification.json',
  'redaction-draft-wide.png',
  'redaction-verified-wide.png',
  'redaction-verified-narrow.png',
  'redaction-saved-reopened.png',
  'poppler-source-page-1.png',
  'poppler-target-page-1.png',
]
const runtime = JSON.parse(await fs.readFile(path.join(output, 'runtime-evidence.json'), 'utf8'))
const independent = JSON.parse(await fs.readFile(path.join(output, 'independent-verification.json'), 'utf8'))
if (!runtime.passed || !independent.passed) throw new Error('P1-B3D evidence cannot be accepted before both gates pass')
const artifacts = []
for (const file of expected) {
  const bytes = await fs.readFile(path.join(output, file))
  artifacts.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}
const manifest = {
  schemaVersion: 1,
  stage: 'P1-B3D',
  status: 'accepted',
  sourceCommit: runtime.sourceCommit,
  artifacts,
  sourceUserContentIncluded: false,
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log('P1-B3D evidence manifest accepted.')
