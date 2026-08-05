import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { throw new Error(`UX-33J installed DOCX harness rejected: ${message}`) }
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const packageJson = JSON.parse(read('package.json'))

for (const token of ['default: main', 'Resolve frozen product identity', 'CURRENT_APP_VERSION', '-CurrentVersion $env:CURRENT_APP_VERSION', '*_x64-setup.exe', 'Reusable U2 artifact does not match the frozen product commit and version.', 'Reusable U2 installer hashes do not match the build receipt.']) {
  if (!workflow.includes(token)) fail(`dynamic hosted version token missing: ${token}`)
}
for (const stale of ['*_1.0.0_x64-setup.exe', 'appVersion = "1.0.0"']) {
  if (workflow.includes(stale)) fail(`hosted workflow retains stale version token: ${stale}`)
}
if (!lifecycle.includes('LONGEDIT_R5J_SOURCE_COMMIT = $ExpectedSourceCommit.ToLowerInvariant()')) fail('installed smoke source commit is not bound')
for (const token of [
  "stage: 'UX-33J'",
  'installed-docx-hyperlink-evidence.json',
  "navigate('#/workspace', '.workspace-home', 'installed workspace initialization')",
  "navigate('#/settings?focus=knowledge-observation', '.settings-view', 'installed consented knowledge observation settings')",
  'microsoft-word-hyperlinks.docx',
  'wps-writer-hyperlinks.docx',
  'libreoffice-writer-hyperlinks.docx',
  '替换链接文字（地址保持不变）',
  '隔离验证通过',
  '会覆盖当前 DOCX',
  "sourceUserContentIncluded: false",
  '<disposable-library>',
]) {
  if (!capture.includes(token)) fail(`installed DOCX capture token missing: ${token}`)
}
if (!packageJson.scripts?.['check:ux33j-installed-docx-harness']) fail('package script is missing')
if (!packageJson.scripts?.['ci:patch-release']?.includes('check:ux33j-installed-docx-harness')) fail('patch release gate does not reach UX-33J harness')
console.log('UX-33J installed DOCX harness passed: dynamic 1.0.x build binding and three-producer installed WebView smoke are ready.')
