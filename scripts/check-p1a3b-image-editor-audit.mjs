import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = 'docs/evidence/p1a3b-image-editor'
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'runtime-evidence.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const fail = message => { console.error(message); process.exit(1) }

if (evidence.stage !== 'P1-A3B' || evidence.passed !== true || evidence.runtimeErrorCount !== 0 || evidence.sourceUserContentIncluded !== false) fail('P1-A3B evidence header is incomplete')
if (evidence.wide?.overflow > 2 || evidence.wide?.panel?.width < 280 || evidence.wide?.crop?.join('x') !== '120x60x600x360' || evidence.wide?.size?.join('x') !== '300x180' || evidence.wide?.quality !== 72 || !evidence.wide?.privacy?.includes('EXIF') || evidence.wide?.saveEnabled !== true || evidence.wide?.errorVisible) fail('P1-A3B wide workspace evidence is incomplete')
if (evidence.narrow?.overflow > 2 || evidence.narrow?.panel?.width < 500 || evidence.narrow?.panel?.y <= evidence.narrow?.stage?.y || evidence.narrow?.errorVisible) fail('P1-A3B narrow workspace evidence is incomplete')
const report = evidence.saveReport
if (report?.status !== 'saved_verified' || report?.outputWidth !== 300 || report?.outputHeight !== 180 || report?.outputMimeType !== 'image/jpeg' || report?.jpegQuality !== 72 || !report?.orientationNormalized || !report?.metadataRemoved || !report?.sourceUnchanged || !report?.targetReopened) fail('P1-A3B verified private copy evidence is incomplete')
const serialized = JSON.stringify(evidence)
if (serialized.includes('Users\\') || serialized.includes('AppData') || serialized.includes('targetPath') || serialized.includes('sourcePath')) fail('P1-A3B evidence contains a local path')
if (manifest.status !== 'accepted' || manifest.stage !== 'P1-A3B' || manifest.sourceUserContentIncluded !== false || manifest.screenshots?.length !== 2) fail('P1-A3B manifest is incomplete')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(path.join(root, screenshot.file))
  if (bytes.length !== screenshot.bytes || bytes.length < 50_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`P1-A3B screenshot integrity failed: ${screenshot.file}`)
}

console.log('P1-A3B desktop audit passed: crop-aware sizing, JPEG quality, privacy cleanup, reliable reopen and responsive right-workspace layout are accepted.')
