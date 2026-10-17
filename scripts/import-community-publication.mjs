import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
import { expectedDevelopmentTarget } from './lib/development-target.mjs'
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

export function validateCommunityPublication(manifest, run, api, verification, receipt, expected, tagCommit) {
  const runId = run.databaseId ?? run.id, version = manifest.appVersion
  assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success')
  assert.ok(Number.isSafeInteger(runId) && runId > 0)
  assert.equal(tagCommit, manifest.sourceCommit); assert.match(tagCommit, /^[a-f0-9]{40}$/)
  assert.equal(api.tag_name, 'v' + version); assert.equal(api.draft, false); assert.equal(api.prerelease, false)
  assert.equal(api.html_url, 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v' + version)
  assert.ok(Number.isSafeInteger(api.id) && api.id > 0); assert.ok(Number.isFinite(Date.parse(api.published_at)))
  assert.equal(verification.status, 'published-and-remote-assets-verified')
  assert.equal(verification.sourceCommit, manifest.sourceCommit); assert.equal(Number(verification.runId), runId)
  assert.equal(receipt.candidateSourceCommit, manifest.sourceCommit); assert.equal(receipt.appVersion, version)
  assert.equal(receipt.sourceUserContentIncluded, false); assert.equal(receipt.artifacts.length, 2)
  const wanted = [...manifest.artifacts.map(item => ({ name: item.fileName, sizeBytes: item.sizeBytes, sha256: item.sha256 })),
    { name: manifest.checksumFile.fileName, sizeBytes: manifest.checksumFile.sizeBytes, sha256: manifest.checksumFile.sha256 }]
  assert.equal(api.assets.length, 3); assert.equal(verification.assets.length, 3); assert.equal(expected.length, 3)
  for (const item of wanted) {
    assert.equal(expected.filter(asset => asset.name === item.name && asset.sizeBytes === item.sizeBytes && asset.sha256 === item.sha256).length, 1)
    const observed = verification.assets.filter(asset => asset.name === item.name)
    assert.equal(observed.length, 1); assert.equal(observed[0].remoteDownloadVerified, true)
    assert.equal(observed[0].sizeBytes, item.sizeBytes); assert.equal(observed[0].sha256, item.sha256)
    const remote = api.assets.filter(asset => asset.name === item.name)
    assert.equal(remote.length, 1); assert.equal(remote[0].size, item.sizeBytes); assert.equal(remote[0].id, observed[0].assetId)
    assert.ok(Number.isSafeInteger(remote[0].id) && remote[0].id > 0)
    if (remote[0].digest) assert.equal(remote[0].digest, 'sha256:' + item.sha256)
  }
  for (const item of manifest.artifacts) {
    const built = receipt.artifacts.filter(asset => asset.target === item.target)
    assert.equal(built.length, 1); assert.equal(built[0].sha256, item.sha256); assert.equal(built[0].sizeBytes, item.sizeBytes)
    assert.equal(built[0].authenticodeStatus, 'NotSigned')
  }
  return { schemaVersion: 1, status: verification.status,
    release: { tag: api.tag_name, url: api.html_url, databaseId: api.id, isDraft: false, isPrerelease: false,
      taggedCommit: tagCommit, publishedAt: api.published_at }, assets: verification.assets,
    publicDownloadVerificationRunId: runId, authenticodeStatus: 'NotSigned', sourceUserContentIncluded: false,
    managedUpdaterObservation: receipt.previousVersion + '-to-' + version + '-pending' }
}

function importPublication(directory) {
  assert.ok(directory, 'Provide the downloaded publication artifact directory containing workflow-run.json')
  const version = json('package.json').version
  assert.match(version, /^1\.\d+\.\d+$/)
  const root = 'docs/evidence/v' + version + '-release'
  const community = json('shared/v1-community-release-policy.json'), development = json('shared/development-version-policy.json')
  assert.equal(community.currentStatus, 'v' + version + '-community-release-ready-to-publish')
  assert.equal(community.gates.githubReleasePublished, false); assert.equal(development.runtimeBaseVersion, version)
  const manifest = json(root + '/artifact-manifest.json'); assertInstalledReleaseRuntime(manifest)
  const files = ['SHA256SUMS.txt', 'expected-assets.json', 'installer-build-receipt.json', 'public-download-verification.json', 'published-api.json', 'workflow-run.json']
  const read = name => json(path.join(directory, name))
  const run = read('workflow-run.json')
  const tagCommit = execFileSync('git', ['rev-parse', 'v' + version + '^{}'], { encoding: 'utf8' }).trim()
  const receipt = validateCommunityPublication(manifest, run, read('published-api.json'), read('public-download-verification.json'), read('installer-build-receipt.json'), read('expected-assets.json'), tagCommit)
  assert.equal(receipt.managedUpdaterObservation, community.patchValidation.managedUpdaterUpgradePath)
  const bytes = new Map(files.map(file => [file, fs.readFileSync(path.join(directory, file))]))
  assert.equal(sha(bytes.get('SHA256SUMS.txt')), manifest.checksumFile.sha256)
  // Reject unknown or already imported outcomes instead of rewriting old receipts.
  assert.equal(fs.existsSync(root + '/release-receipt.json'), false)
  fs.mkdirSync(root + '/publication')
  for (const [file, content] of bytes) fs.writeFileSync(root + '/publication/' + file, content, { flag: 'wx' })
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
  write(root + '/release-receipt.json', receipt)
  write(root + '/publication-import-manifest.json', { schemaVersion: 1, status: receipt.status,
    githubRunId: receipt.publicDownloadVerificationRunId, productSourceCommit: tagCommit, sourceUserContentIncluded: false,
    files: [...bytes].map(([file, content]) => ({ path: 'publication/' + file, sizeBytes: content.length, sha256: sha(content) })) })
  Object.assign(manifest, { status: 'published-remote-assets-verified-hosted-lifecycle-and-runtime-smoke-passed', releaseReceipt: 'release-receipt.json', releasePublished: true })
  Object.assign(manifest.boundaries, { releaseAssetsPublished: true, managedUpdaterReleaseAssetsPresent: true, legacyTauriUpdaterArtifactsPresent: false })
  write(root + '/artifact-manifest.json', manifest)
  Object.assign(community, { currentStatus: 'v' + version + '-community-release-published', release: receipt.release,
    nextAction: version === '1.1.8' ? 'develop-v1.1.9-work-session-continuity' : 'audit-v' + expectedDevelopmentTarget(version) + '-approved-foundation-roadmap' })
  community.gates.githubReleasePublished = true; write('shared/v1-community-release-policy.json', community)
  const patch = Number(version.split('.')[2]), next = expectedDevelopmentTarget(version)
  Object.assign(development, { publicVersion: version, publicTag: 'v' + version, publicTagCommit: tagCommit,
    developmentTargetVersion: next, currentStage: 'M8-' + (29 + patch * 2) + '-v' + version + '-published',
    binaryVersionTransition: 'v' + version + '-public-release-published', displayLabel: 'v' + version + ' 已发布 · 下一版本 v' + next })
  development.activeSlice.status = 'published-remote-assets-verified'
  development.activeSlice.document = 'docs/V' + version.replaceAll('.', '_') + '_Unsigned_Community_Release_Audit_' + community.generatedAt + '.md'
  write('shared/development-version-policy.json', development)
  console.log('Published bytes verified and imported: v' + version + '; README and handoff must now reflect the actual release.')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) importPublication(process.argv[2])
