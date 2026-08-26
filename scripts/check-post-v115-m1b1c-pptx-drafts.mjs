import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1b1c-pptx-draft-policy.json', 'utf8'))
const source = fs.readFileSync('src/views/PptxReaderView.vue', 'utf8')
const command = fs.readFileSync('src-tauri/src/commands/pptx.rs', 'utf8')
const registry = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const release = JSON.parse(fs.readFileSync('shared/release-capability-matrix.json', 'utf8'))
const degradation = JSON.parse(fs.readFileSync('shared/safe-degradation-contract.json', 'utf8'))
const failures = []

for (const marker of [
  'draftOperations',
  'undoStack',
  'redoStack',
  'preview_pptx_patch_transaction',
  'save_pptx_patch_source_transaction',
  'onBeforeRouteLeave',
  'onBeforeRouteUpdate',
  'beforeunload',
  'confirmAppAction',
  'toRaw'
]) {
  if (!source.includes(marker)) failures.push(`PPTX draft frontend marker is missing: ${marker}`)
}
for (const marker of ['pub async fn preview_pptx_patch_transaction', 'pub async fn save_pptx_patch_source_transaction', 'rollback_protected']) {
  if (!command.includes(marker)) failures.push(`PPTX transaction backend marker is missing: ${marker}`)
}

const pptx = registry.formats.find(format => format.id === 'pptx')
if (pptx?.userCapability?.saveMode !== 'bounded-overwrite') failures.push('PPTX format registry must declare bounded-overwrite')
if (pptx?.userCapability?.description?.includes('原演示文稿始终只读')) failures.push('PPTX registry still contains the stale source-read-only claim')
const officeProfile = release.profiles.find(profile => profile.id === 'office-copy')
if (!officeProfile?.sourcePolicy?.includes('DOCX/PPTX')) failures.push('Release matrix does not describe confirmed DOCX/PPTX source overwrite')
const safePath = degradation.lanes.find(path => path.id === 'verified-pptx-bounded-overwrite')
if (!safePath || safePath.saveModes?.[0] !== 'bounded-overwrite') failures.push('PPTX bounded-overwrite degradation path is missing')
if (!fs.existsSync(policy.fixture) || fs.statSync(policy.fixture).size < 1_000) failures.push(`Real PPTX fixture is missing or empty: ${policy.fixture}`)
if (!Object.values(policy.expected).every(value => value === true || value === 0)) failures.push('M1B1C acceptance policy is incomplete')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M1B1C contract accepted: PPTX drafts share history, leave protection, and one confirmed source-save boundary.')
