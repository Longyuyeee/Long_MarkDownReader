import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = 'docs/evidence/p1a2-image-editor'
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'runtime-evidence.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const fail = message => { console.error(message); process.exit(1) }

if (evidence.stage !== 'P1-A2' || evidence.passed !== true || evidence.runtimeErrorCount !== 0 || evidence.sourceUserContentIncluded !== false) fail('P1-A2 runtime evidence header is incomplete')
if (evidence.wide?.documentOverflow > 2 || evidence.wide?.panel?.width < 280 || evidence.wide?.stage?.width < 700 || evidence.wide?.inputs?.join('x') !== '480x270' || evidence.wide?.saveEnabled !== true || evidence.wide?.errorVisible) fail('P1-A2 wide editor evidence is incomplete')
if (!evidence.wide?.image?.transform?.includes('scaleX(-1)') || !evidence.wide?.image?.transform?.includes('rotate(90deg)')) fail('P1-A2 transform preview evidence is incomplete')
if (evidence.narrow?.documentOverflow > 2 || evidence.narrow?.panel?.width < 500 || evidence.narrow?.panel?.y <= evidence.narrow?.stage?.y || evidence.narrow?.errorVisible) fail('P1-A2 narrow responsive evidence is incomplete')
if (evidence.saveReport?.status !== 'saved_verified' || !evidence.saveReport?.sourceUnchanged || !evidence.saveReport?.targetReopened || evidence.saveReport?.outputMimeType !== 'image/webp' || evidence.saveReport?.outputWidth !== 480 || evidence.saveReport?.outputHeight !== 270) fail('P1-A2 reliable copy evidence is incomplete')
if (evidence.reopened?.image?.naturalWidth !== 480 || evidence.reopened?.image?.naturalHeight !== 270) fail('P1-A2 saved copy reopen evidence is incomplete')
if (JSON.stringify(evidence).includes('Users\\') || JSON.stringify(evidence).includes('AppData')) fail('P1-A2 evidence contains a local user path')
if (manifest.status !== 'accepted' || manifest.stage !== 'P1-A2' || manifest.sourceUserContentIncluded !== false || manifest.screenshots?.length !== 2) fail('P1-A2 evidence manifest is incomplete')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(path.join(root, screenshot.file))
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== screenshot.bytes || bytes.length < 50_000 || sha256 !== screenshot.sha256) fail(`P1-A2 screenshot integrity failed: ${screenshot.file}`)
}

console.log('P1-A2 desktop audit passed: the image editor remains inside the right workspace, is responsive, saves a verified WebP copy, reopens it, and preserves the source.')
