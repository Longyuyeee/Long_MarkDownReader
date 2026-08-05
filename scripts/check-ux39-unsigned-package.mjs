import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const fail = message => {
  console.error(`UX-39A unsigned package rejected: ${message}`)
  process.exit(1)
}

const pkg = readJson('package.json')
const manifest = readJson('docs/evidence/ux39-unsigned-package/artifact-manifest.json')
const audit = fs.readFileSync('docs/UX39A_Unsigned_Package_Artifact_Audit_2026-08-05.md', 'utf8')

if (pkg.version !== '1.0.4' || manifest.appVersion !== pkg.version) fail('version identity drift')
if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-39A' || manifest.status !== 'artifact-audit-passed') fail('manifest identity drift')
if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) fail('invalid source commit')
const sourcePackage = JSON.parse(execFileSync('git', ['show', `${manifest.sourceCommit}:package.json`], { encoding: 'utf8' }))
if (sourcePackage.version !== pkg.version) fail('artifact source commit does not contain the audited version')
if (manifest.build.command !== 'npm run build:ux39-unsigned' || manifest.build.completed !== true) fail('build receipt drift')
if (manifest.boundaries.releaseCandidate !== false || manifest.boundaries.updaterArtifactsPresent !== false || manifest.boundaries.authenticodeRequired !== false) fail('unsigned release boundary drift')
if (manifest.artifacts.length !== 3) fail('expected release executable, MSI and NSIS records')

const expected = new Map([
  ['release-executable', 'tauri-app.exe'],
  ['msi', `Long编辑_${pkg.version}_x64_zh-CN.msi`],
  ['nsis', `Long编辑_${pkg.version}_x64-setup.exe`],
])
for (const artifact of manifest.artifacts) {
  if (expected.get(artifact.target) !== artifact.fileName) fail(`unexpected ${artifact.target} file name`)
  if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0 || !/^[0-9a-f]{64}$/.test(artifact.sha256)) fail(`invalid ${artifact.target} digest record`)
  if (artifact.authenticodeStatus !== 'NotSigned') fail(`${artifact.target} is not recorded as unsigned`)
}
if (manifest.localPortableRuntime.status !== 'deferred-existing-single-instance' || manifest.localPortableRuntime.existingProcessTerminated !== false) fail('local runtime boundary drift')
if (manifest.disposableInstalledRuntime.status !== 'dispatched' || manifest.disposableInstalledRuntime.githubRunId !== 30992573469 || manifest.disposableInstalledRuntime.supersedesFailedRunId !== 30989527026) fail('hosted lifecycle dispatch drift')

for (const token of [`v${pkg.version}`, manifest.sourceCommit, '30992573469', 'NotSigned', '21214f91ac3c9499f0b44e13e45a76a82f8353ff7b47af8b45c2c0664369eaa9']) {
  if (!audit.includes(token)) fail(`audit is missing ${token}`)
}

console.log(`UX-39A unsigned package passed: v${pkg.version} MSI/NSIS hashes and unsigned boundaries are bound to ${manifest.sourceCommit.slice(0, 7)}.`)
