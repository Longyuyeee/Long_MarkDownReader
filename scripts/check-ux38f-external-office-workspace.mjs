import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38F external Office workspace rejected: ${message}`); process.exit(1) }
const panel = read('src/components/workspace/ExternalApplicationPanel.vue')
const external = read('src/views/ExternalOfficeView.vue')
const legacy = read('src/views/LegacyOfficeView.vue')
const state = read('src/services/workspaceViewState.ts')
for (const token of ['discover_external_applications', 'open_workspace_file_externally', "selectedId = ref('system-default')", 'sourcePreservedAtHandoff', '未在此电脑上检测到', '@container (max-width: 520px)']) if (!panel.includes(token)) fail(`external application panel token missing: ${token}`)
for (const [name, source] of [['WPS native', external], ['legacy Office', legacy]]) {
  if (!source.includes('<ExternalApplicationPanel :path="documentPath" />')) fail(`${name} workspace does not expose direct external open`)
  if (!source.includes('container-type: inline-size') || !source.includes('@container (max-width: 640px)')) fail(`${name} workspace is not container responsive`)
}
if (!legacy.includes('overflow-x: hidden') || !legacy.includes('box-sizing: border-box; width: 100%')) fail('legacy narrow layout can expose a native horizontal track')
for (const token of ['recallWorkspaceViewState(documentPath.value)?.draft', 'rememberWorkspaceViewState(documentPath.value']) if (!legacy.includes(token)) fail(`legacy target restoration token missing: ${token}`)
for (const token of ['externalApplication?: string', 'draft?: string']) if (!state.includes(token)) fail(`workspace state token missing: ${token}`)
const registry = JSON.parse(read('shared/file-formats.json'))
for (const id of ['legacy-doc', 'legacy-xls', 'legacy-ppt', 'wps-document', 'wps-spreadsheet', 'wps-presentation']) {
  const format = registry.formats.find(item => item.id === id)
  if (format?.userCapability?.level !== 'external-open' || format.userCapability.saveMode !== 'none') fail(`${id} capability boundary drift`)
}
console.log('UX-38F external Office workspace passed: six formats expose direct, guarded desktop-app handoff with explicit unavailable states and restored user choices.')
