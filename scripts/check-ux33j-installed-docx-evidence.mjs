import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = 'docs/evidence/ux33j-installed-docx-hyperlink'
const read = file => fs.readFileSync(file)
const json = file => JSON.parse(read(file).toString('utf8'))
const sha256 = file => crypto.createHash('sha256').update(read(file)).digest('hex')
const fail = message => { throw new Error(`UX-33J installed DOCX evidence rejected: ${message}`) }
const packageJson = json('package.json')
const manifest = json(path.join(root, 'import-manifest.json'))
const evidence = json(path.join(root, 'installed-docx-hyperlink-evidence.json'))
const lifecycle = json(path.join(root, 'lifecycle-result.json'))
const receipt = json(path.join(root, 'runner-build-receipt.json'))

if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-33J' || manifest.status !== 'accepted') fail('manifest identity drift')
if (manifest.githubRunId !== 30967710442 || manifest.workflowConclusion !== 'success') fail('hosted run is not the accepted successful run')
if (manifest.orchestrationCommit !== 'ade1cd06b1cd291f9d995ea94f70b97c39beb067') fail('orchestration commit drift')
if (manifest.productSourceCommit !== evidence.sourceCommit || manifest.productSourceCommit !== receipt.sourceCommit) fail('product source commit drift')
if (manifest.appVersion !== packageJson.version || evidence.appVersion !== packageJson.version || receipt.appVersion !== packageJson.version || lifecycle.currentVersion !== packageJson.version) fail('application version drift')
if (manifest.installerSha256 !== evidence.installerSha256 || manifest.installerSha256 !== receipt.currentInstallerSha256 || manifest.installerSha256 !== lifecycle.currentInstallerSha256) fail('installer hash drift')
if (manifest.authenticodeStatus !== 'NotSigned' || receipt.authenticodeStatus !== 'NotSigned' || lifecycle.signature?.status !== 'NotSigned') fail('unsigned boundary drift')
for (const value of [manifest.releaseCandidate, manifest.promotionEligible, manifest.sourceUserContentIncluded, evidence.sourceUserContentIncluded, receipt.releaseCandidate, receipt.promotionEligible, receipt.sourceUserContentIncluded, lifecycle.releaseCandidate, lifecycle.promotionEligible, lifecycle.sourceUserContentIncluded]) {
  if (value !== false) fail('release or privacy boundary drift')
}
if (manifest.ux33jSpecialtyResult !== 'passed' || manifest.lifecycleResult !== 'passed' || lifecycle.status !== 'passed') fail('accepted result drift')
if (lifecycle.checks?.length !== 18 || lifecycle.checks.some(check => check.status !== 'passed')) fail('18-step lifecycle is incomplete')

for (const artifact of manifest.artifacts) {
  const file = path.join(root, artifact.file)
  if (!fs.existsSync(file)) fail(`artifact missing: ${artifact.file}`)
  if (fs.statSync(file).size !== artifact.bytes || sha256(file) !== artifact.sha256) fail(`artifact integrity drift: ${artifact.file}`)
}

const expected = {
  'microsoft-word': { links: 2, editable: true, fixture: 'fixtures/docx/hyperlinks/microsoft-word-hyperlinks.docx' },
  'wps-writer': { links: 0, editable: false, fixture: 'fixtures/docx/hyperlinks/wps-writer-hyperlinks.docx' },
  'libreoffice-writer': { links: 2, editable: true, fixture: 'fixtures/docx/hyperlinks/libreoffice-writer-hyperlinks.docx' },
}
if (evidence.schemaVersion !== 1 || evidence.stage !== 'UX-33J' || evidence.results?.length !== 3) fail('three-producer evidence drift')
for (const result of evidence.results) {
  const contract = expected[result.producerId]
  if (!contract || result.expectedEditableLinks !== contract.links || result.editableHyperlinkCount !== contract.links || result.sourceUnchanged !== true) fail(`producer result drift: ${result.producerId}`)
  if (sha256(contract.fixture) !== result.sourceSha256) fail(`fixture hash drift: ${result.producerId}`)
  for (const key of ['linkPromptVerified', 'draftCreated', 'undoVerified', 'redoVerified', 'isolatedPreviewVerified', 'saveBoundaryVerified']) {
    if (result[key] !== contract.editable) fail(`${result.producerId} ${key} drift`)
  }
  if (!result.route.includes('<disposable-library>') || result.route.includes('Users/') || result.route.includes('AppData')) fail(`route privacy drift: ${result.producerId}`)
  if (fs.statSync(path.join(root, result.screenshot)).size < 100000) fail(`screenshot is unexpectedly small: ${result.screenshot}`)
}

for (const file of ['import-manifest.json', 'installed-docx-hyperlink-evidence.json', 'lifecycle-result.json', 'runner-build-receipt.json']) {
  const text = read(path.join(root, file)).toString('utf8')
  if (/([A-Za-z]:\\|Users[\\/]|AppData[\\/])/i.test(text)) fail(`local path leaked: ${file}`)
}

console.log('UX-33J installed DOCX evidence passed: three producer behaviors and the 18-step unsigned lifecycle are bound to run 30967710442.')
