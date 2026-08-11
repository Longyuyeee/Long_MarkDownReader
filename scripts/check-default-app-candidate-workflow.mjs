import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const lifecycle = json('shared/windows-lifecycle-policy.json')
const tauri = json('src-tauri/tauri.conf.json')
const system = read('src-tauri/src/commands/system.rs')
const lib = read('src-tauri/src/lib.rs')
const app = read('src/App.vue')
const externalWindows = read('src-tauri/src/services/external_windows.rs')
const view = read('src/views/ReleaseCapabilitiesView.vue')

const candidates = registry.formats.filter(format => ['edit', 'preview'].includes(format.externalPolicy))
if (candidates.length !== 37) failures.push(`default-app candidate profile count drift: ${candidates.length}`)
for (const id of ['legacy-doc', 'legacy-xls', 'legacy-ppt', 'wps-document', 'wps-spreadsheet', 'wps-presentation']) {
  if (candidates.some(format => format.id === id)) failures.push(`${id} must not enter LongEdit default-app candidates`)
}

if (lifecycle.fileAssociations.defaultSelectionOwner !== 'windows'
  || lifecycle.fileAssociations.directRegistryDefaultWrite !== false
  || lifecycle.fileAssociations.candidateRegistrationOwner !== 'explicit-user-action'
  || lifecycle.fileAssociations.runtimeCandidateRegistration !== 'current-user-open-with-only'
  || JSON.stringify(lifecycle.fileAssociations.runtimeCandidatePolicies) !== JSON.stringify(['edit', 'preview'])) {
  failures.push('Windows candidate registration policy drift')
}

for (const token of [
  'default_app_candidate_extensions',
  'matches!(format.external_policy.as_str(), "edit" | "preview")',
  'get_default_app_candidate_status',
  'prepare_default_app_candidate',
  'Software\\Classes\\{}\\OpenWithProgids',
  'Software\\RegisteredApplications',
  'registeredAppUser=LongEdit',
  'user_choice_required: true',
  'default_app_candidates_follow_external_workspace_policy',
]) requireText(system, token, `default-app backend is missing ${token}`)
if (system.includes('UserChoice') || system.includes('reg.exe')) {
  failures.push('default-app backend must not write Windows UserChoice or spawn reg.exe')
}
for (const token of ['get_default_app_candidate_status', 'prepare_default_app_candidate']) {
  requireText(lib, token, `Tauri command registry is missing ${token}`)
}

for (const token of [
  '@toggle="loadCandidateStatus($event, row.format.id, row.format.externalPolicy)"',
  "invoke<DefaultAppCandidateStatus>('get_default_app_candidate_status'",
  "invoke<DefaultAppCandidateStatus>('prepare_default_app_candidate'",
  '只为当前格式加入系统候选，不会自动改成默认应用。',
  '默认应用仍需在 Windows 页面逐项确认。',
  '其他格式不会受此操作影响。',
  '选择 LongEdit 打开',
]) requireText(view, token, `format capability workflow is missing ${token}`)

for (const token of [
  "if (route.query.external === '1') return ''",
  "appWindow.label === 'main'",
  "invoke<string>('open_external_file_window'",
  'data-window-role',
  '<AppUpdater v-if="isMainWindow" />',
]) requireText(app, token, `installed external launch shell is missing ${token}`)
for (const token of [
  'matches!(format.external_policy.as_str(), "edit" | "preview")',
  'WebviewWindowBuilder::new',
  'external=1',
  'authorize_openable',
]) requireText(externalWindows, token, `external window policy is missing ${token}`)
for (const token of [
  'open_external_arguments',
  'authorize_and_create_external_window',
  'focus_main_window',
]) requireText(lib, token, `single-instance authorization is missing ${token}`)

const associations = tauri.bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('installer associations must remain limited to Markdown')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-5A default-app candidate workflow passed: 37 format profiles are user-triggered, Windows-confirmed, independently windowed, and installer-safe.')
