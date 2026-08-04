import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const failures = []
const fail = message => failures.push(message)

const pkg = json('package.json')
const tauri = json('src-tauri/tauri.conf.json')
const policy = json('shared/v1-community-release-policy.json')
const u2 = json('shared/u2-disposable-install-lifecycle-policy.json')
const r5h = json('docs/evidence/r5h-current-installers/installer-artifact-manifest.json')
const cargo = read('src-tauri/Cargo.toml')
const gitignore = read('.gitignore')
const readme = read('README.md')
const appUpdater = read('src/services/appUpdater.ts')
const updateSettings = read('src/components/UpdateSettingsRow.vue')
const app = read('src/App.vue')
const tag = `v${pkg.version}`
const releaseUrl = `https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/${tag}`

if (!/^1\.\d+\.\d+$/.test(pkg.version) || tauri.version !== pkg.version || !cargo.includes(`version = "${pkg.version}"`)) fail('V1 version identity drift')
if (policy.schemaVersion !== 1 || policy.stage !== 'V1' || policy.appVersion !== pkg.version || policy.channel !== 'community-unsigned') fail('V1 policy identity drift')
if (policy.userDecision?.authenticodeRequired !== false || policy.userDecision?.unsignedCommunityReleaseApproved !== true || policy.userDecision?.unknownPublisherWarningRequired !== true) fail('unsigned community decision drift')
if (policy.updater?.enabled !== false || policy.updater?.automaticCheckIntervalHours !== 0 || policy.updater?.manualCheckAvailable !== true || policy.updater?.integritySignatureRequired !== true || policy.updater?.privateKeyCommitted !== false || policy.updater?.latestManifestAsset !== null) fail('V1 manual update policy drift')
if (tauri.bundle.createUpdaterArtifacts !== true || !tauri.plugins?.updater?.pubkey || !tauri.plugins.updater.endpoints?.includes('https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest/download/latest.json')) fail('Tauri updater configuration drift')
if (!pkg.dependencies?.['@tauri-apps/plugin-updater'] || !pkg.dependencies?.['@tauri-apps/plugin-process'] || !cargo.includes('tauri-plugin-updater = "2"') || !cargo.includes('tauri-plugin-process = "2"')) fail('updater dependencies drift')
for (const token of ['LATEST_RELEASE_URL', 'openLatestRelease', 'releases/latest']) if (!appUpdater.includes(token) && !updateSettings.includes(token)) fail(`manual release implementation token missing: ${token}`)
for (const forbidden of ['checkForUpdates', 'downloadAndInstall', '<AppUpdater']) if (appUpdater.includes(forbidden) || updateSettings.includes(forbidden) || app.includes(forbidden)) fail(`inactive automatic updater leaked into runtime: ${forbidden}`)
if (!updateSettings.includes('查看最新版本') || !updateSettings.includes('SHA-256') || !gitignore.includes('.release-secrets/')) fail('manual release UI or secret ignore boundary drift')
for (const token of [tag, '未知发布者', 'SHA-256', '手动下载安装', '自动更新']) if (!readme.includes(token)) fail(`README release disclosure missing: ${token}`)

if (u2.evidence?.lifecycleResultComplete !== true || u2.runner?.artifactSourceCommitBound !== true || u2.blockers?.length !== 0) fail('inherited installed lifecycle evidence is incomplete')
if (r5h.sourceCommit !== u2.artifactSourceCommit || r5h.artifacts?.length !== 2 || r5h.artifacts.some(item => item.authenticodeStatus !== 'NotSigned' || item.signed !== false)) fail('inherited installer evidence drift')
if (policy.gates?.installedLifecyclePassed !== true || policy.gates?.frontendBuildPassed !== true || policy.gates?.rustLockedCheckPassed !== true) fail('V1 prerequisite gate drift')
if (policy.patchValidation?.baseInstalledLifecycleVersion !== '1.0.1' || policy.patchValidation?.baseInstalledLifecycleEvidenceVersion !== '1.0.0' || policy.patchValidation?.baseInstalledLifecycleEvidenceInherited !== true) fail('patch lifecycle inheritance drift')
if (policy.patchValidation?.automaticUpdaterAssetsPlanned !== false || !policy.patchValidation?.automaticUpdaterBlocker || policy.gates?.updaterSignaturesBuilt !== false) fail('manual-only updater boundary drift')
if (policy.targetRelease?.tag !== tag || policy.targetRelease?.url !== releaseUrl || policy.targetRelease?.assetMode !== 'manual-msi-nsis-with-sha256') fail('target release drift')

if (policy.gates.githubReleasePublished === true) {
  if (policy.gates.qualityGatePassed !== true || policy.releaseCandidate !== true || policy.currentStatus !== `${tag}-community-release-published`) fail('published V1 state is inconsistent')
  if (policy.release?.tag !== tag || !/^[0-9a-f]{40}$/.test(policy.release?.taggedCommit ?? '') || !Number.isInteger(policy.release?.qualityGateRunId) || policy.release?.url !== releaseUrl) fail('published V1 receipt drift')
} else if (policy.gates.qualityGatePassed === true) {
  if (policy.releaseCandidate !== true || policy.currentStatus !== `${tag}-community-release-ready-to-publish` || policy.gates.msiBuilt !== true || policy.gates.nsisBuilt !== true) fail('ready-to-publish V1 state is inconsistent')
} else if (policy.releaseCandidate !== false || policy.currentStatus !== `${tag}-community-release-quality-gate-pending` || policy.gates.msiBuilt !== false || policy.gates.nsisBuilt !== false) {
  fail('pre-quality V1 state is inconsistent')
}

const slug = pkg.version.replaceAll('.', '_')
for (const path of [`docs/RELEASE_NOTES_v${pkg.version}.md`, `docs/V${slug}_Unsigned_Community_Release_Audit_2026-08-03.md`]) if (!fs.existsSync(path)) fail(`release document missing: ${path}`)

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`V1 community release contract passed: ${pkg.version}, manual unsigned distribution and inherited lifecycle evidence are aligned.`)
