import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const failures = []
const fail = message => failures.push(message)

const pkg = json('package.json')
const tauri = json('src-tauri/tauri.conf.json')
const policy = json('shared/v1-community-release-policy.json')
const updater = json('shared/community-updater-policy.json')
const previousLifecycle = json('docs/evidence/ux39-installed-lifecycle/summary.json')
const cargo = read('src-tauri/Cargo.toml')
const readme = read('README.md')
const backendUpdater = read('src-tauri/src/commands/updater.rs')
const tag = `v${pkg.version}`
const releaseUrl = `https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/${tag}`
const auditPath = `docs/V${pkg.version.replaceAll('.', '_')}_Unsigned_Community_Release_Audit_${policy.generatedAt}.md`
const notesPath = `docs/RELEASE_NOTES_v${pkg.version}.md`

if (!/^1\.\d+\.\d+$/.test(pkg.version) || tauri.version !== pkg.version || !cargo.includes(`version = "${pkg.version}"`)) fail('V1 version identity drift')
if (policy.schemaVersion !== 1 || policy.stage !== 'V1' || policy.appVersion !== pkg.version || policy.channel !== 'community-unsigned') fail('V1 policy identity drift')
if (policy.userDecision?.authenticodeRequired !== false || policy.userDecision?.unsignedCommunityReleaseApproved !== true || policy.userDecision?.unknownPublisherWarningRequired !== true) fail('unsigned community decision drift')
if (policy.targetRelease?.tag !== tag || policy.targetRelease?.url !== releaseUrl || policy.targetRelease?.assetMode !== 'managed-nsis-msi-with-sha256') fail('target release drift')
if (updater.status !== 'active-from-v1.0.5' || updater.migration?.firstManagedUpdaterVersion !== '1.0.5' || policy.updater?.mode !== 'github-release-sha256-managed' || policy.updater?.enabled !== true || policy.updater?.automaticCheckIntervalHours !== 24 || policy.updater?.integrityDigestRequired !== true || policy.updater?.latestManifestAsset !== null) fail('managed updater release boundary drift')
for (const token of ['api.github.com/repos/Longyuyeee/Long_MarkDownReader/releases/latest', 'Sha256::digest', 'LongEdit_{expected_version}_x64-setup.exe']) if (!backendUpdater.includes(token)) fail(`managed updater implementation missing: ${token}`)
if (previousLifecycle.appVersion !== '1.0.4' || previousLifecycle.status !== 'passed' || policy.patchValidation?.previousInstalledLifecycleEvidenceVersion !== '1.0.4' || policy.patchValidation?.previousEvidenceInheritedAsCurrent !== false) fail('previous installed lifecycle must remain historical')
if (!fs.existsSync(auditPath) || !fs.existsSync(notesPath)) fail('current release documents are missing')
for (const token of [tag, '未知发布者', 'SHA-256', '自动更新']) if (!readme.includes(token)) fail(`README release disclosure missing: ${token}`)

const published = policy.gates?.githubReleasePublished === true
const ready = !published && policy.gates?.qualityGatePassed === true
if (published) {
  if (!policy.releaseCandidate || policy.currentStatus !== `${tag}-community-release-published` || policy.release?.tag !== tag || policy.release?.url !== releaseUrl || !/^[0-9a-f]{40}$/.test(policy.release?.taggedCommit ?? '')) fail('published release receipt drift')
} else if (ready) {
  if (!policy.releaseCandidate || policy.currentStatus !== `${tag}-community-release-ready-to-publish` || policy.gates?.msiBuilt !== true || policy.gates?.nsisBuilt !== true || policy.gates?.artifactHashesVerified !== true) fail('ready-to-publish state drift')
} else if (policy.releaseCandidate !== false || policy.currentStatus !== `${tag}-community-release-quality-gate-pending` || policy.gates?.msiBuilt !== false || policy.gates?.nsisBuilt !== false) {
  fail('pre-quality release state drift')
}

if (ready || published) {
  const manifestPath = `docs/evidence/v${pkg.version}-release/artifact-manifest.json`
  if (!fs.existsSync(manifestPath)) fail('current artifact manifest is missing')
  else {
    const manifest = json(manifestPath)
    if (manifest.appVersion !== pkg.version || manifest.sourceVersion !== pkg.version || manifest.sourceCommit !== policy.candidate?.artifactSourceCommit || manifest.artifacts?.length !== 3 || manifest.artifacts.some(item => item.authenticodeStatus !== 'NotSigned')) fail('current artifact manifest drift')
    if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '')) fail('artifact source commit is invalid')
  }
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`V1 community release contract passed: ${tag} is ${published ? 'published' : ready ? 'ready to publish' : 'awaiting quality gate and package evidence'} with managed SHA-256 updates.`)
