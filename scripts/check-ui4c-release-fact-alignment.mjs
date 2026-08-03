import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const failures = []

const pkg = json('package.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const community = json('shared/v1-community-release-policy.json')
const config = read('src/config/releaseCapabilities.ts')
const view = read('src/views/ReleaseCapabilitiesView.vue')
const audit = read('docs/UI_4C_Release_Fact_Alignment_Audit_2026-08-03.md')

if (pkg.version !== tauri.version || pkg.version !== matrix.appVersion || pkg.version !== community.appVersion) failures.push('public version identity drift')
if (matrix.stage !== 'R2' || matrix.releaseCandidate !== false) failures.push('capability or enterprise RC boundary drift')
if (community.channel !== 'community-unsigned' || community.releaseCandidate !== true || community.gates?.githubReleasePublished !== true) failures.push('community release publication drift')
if (community.currentStatus !== `v${pkg.version}-community-release-published` || community.release?.tag !== `v${pkg.version}`) failures.push('community release receipt drift')

for (const token of ['communityReleaseSource', 'RELEASE_PUBLIC_STATUS_LABEL', '社区版已发布']) {
  if (!config.includes(token)) failures.push(`release capability config is missing ${token}`)
}
if (!view.includes('{{ RELEASE_PUBLIC_STATUS_LABEL }}') || view.includes("`${RELEASE_STAGE} 收口中`")) failures.push('release capability page still derives publication state from the capability stage')

for (const token of ['UI-4C1', `v${pkg.version} 社区版已发布`, 'releaseCandidate=false', 'community-unsigned', 'UI-4C2']) {
  if (!audit.includes(token)) failures.push(`UI-4C audit is missing ${token}`)
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log(`UI-4C release facts passed: v${pkg.version} community release is published while enterprise RC remains separate.`)
