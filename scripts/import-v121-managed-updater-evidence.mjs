import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [artifactRootArg, runIdArg, artifactIdArg, artifactDigestArg, headCommitArg, importedAtArg, reviewPathArg] = process.argv.slice(2)
if (!artifactRootArg || !runIdArg || !artifactIdArg || !artifactDigestArg || !headCommitArg || !importedAtArg || !reviewPathArg) throw new Error('Usage: node scripts/import-v121-managed-updater-evidence.mjs <artifact-root> <run-id> <artifact-id> <artifact-digest> <head-commit> <imported-at> <visual-review-json>')
if (![runIdArg, artifactIdArg].every(value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))
  || !/^sha256:[a-f0-9]{64}$/.test(artifactDigestArg) || !/^[a-f0-9]{40}$/.test(headCommitArg)
  || !Number.isFinite(Date.parse(importedAtArg))) throw new Error('Invalid evidence provenance')
const sourceRoot = path.resolve(artifactRootArg)
const destinationRoot = path.resolve('docs/evidence/v1.0.21-managed-updater')
const repositoryRoot = path.resolve('.')
if (!`${destinationRoot}${path.sep}`.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('Evidence destination escaped repository')
if (fs.existsSync(destinationRoot)) throw new Error(`Refusing to overwrite existing evidence directory: ${destinationRoot}`)

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const names = fs.readdirSync(sourceRoot).sort()
const expectedNames = ['managed-updater-available.jpg', 'managed-updater-current.jpg', 'managed-updater-installing.jpg',
  'managed-updater-discovery-evidence.json', 'managed-updater-installed-binary.json',
  'managed-updater-lifecycle-result.json', 'managed-updater-post-upgrade-evidence.json',
  'managed-updater-post-upgrade-navigation.json', 'official-release-assets.json'].sort()
if (JSON.stringify(names) !== JSON.stringify(expectedNames)
  || names.some(name => !fs.lstatSync(path.join(sourceRoot, name)).isFile())) throw new Error('Expected exactly nine regular updater evidence files')
// Read and validate all input before creating any destination. Keep the reviewed
// screenshot bytes in memory so the copied image is exactly the reviewed image.
const contents = new Map(names.map(name => {
  const bytes = fs.readFileSync(path.join(sourceRoot, name))
  return [name, name.endsWith('.json') ? Buffer.from(`${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n`) : bytes]
}))
const review = JSON.parse(fs.readFileSync(reviewPathArg, 'utf8'))
const screenshots = names.filter(name => name.endsWith('.jpg'))
if (typeof review.reviewer !== 'string' || !review.reviewer.trim() || !Number.isFinite(Date.parse(review.reviewedAt))
  || Date.parse(review.reviewedAt) > Date.parse(importedAtArg)
  || !Array.isArray(review.screenshots) || review.screenshots.length !== screenshots.length
  || screenshots.some(name => review.screenshots.filter(item => item.path === name && item.sha256 === sha256(contents.get(name)) && item.accepted === true).length !== 1)) {
  throw new Error('Explicit visual review of all three exact screenshot hashes is required')
}

const lifecycle = JSON.parse(contents.get('managed-updater-lifecycle-result.json'))
const discovery = JSON.parse(contents.get('managed-updater-discovery-evidence.json'))
const policy = JSON.parse(fs.readFileSync('shared/v121-managed-updater-lifecycle-policy.json', 'utf8'))
if (lifecycle.status !== 'passed' || lifecycle.checksPassed !== 12 || lifecycle.checksFailed !== 0 || lifecycle.sourceUserContentIncluded !== false
  || lifecycle.previousVersion !== '1.0.20' || lifecycle.currentVersion !== '1.0.21'
  || lifecycle.currentInstallerSha256 !== policy.releases.current.installer.sha256
  || lifecycle.installedExecutableSha256 !== policy.releases.current.installedPackageExecutable.sha256) throw new Error('Managed updater lifecycle did not pass 12/12, has wrong identity or lacks explicit privacy declaration')
if (!discovery.release?.releaseNotes?.includes('v1.0.21 是知识图谱交互精修补丁') || !discovery.release?.releaseNotes?.includes('普通图谱根据节点密度设置可读缩放下限') || discovery.confirmation?.installerStartedBeforeConfirmation !== false) throw new Error('Official published release messaging or confirmation boundary is missing')

const files = names.map(name => {
  const bytes = contents.get(name)
  const item = { path: name, bytes: bytes.length, sha256: sha256(bytes) }
  if (name.endsWith('.jpg')) item.visuallyReviewed = true
  return item
})
const manifest = {
  schemaVersion: 1,
  stage: 'V1.0.21-U1I',
  status: 'accepted',
  importedAt: importedAtArg,
  githubRunId: Number(runIdArg),
  artifactId: Number(artifactIdArg),
  artifactDigest: artifactDigestArg,
  headCommit: headCommitArg,
  previousVersion: lifecycle.previousVersion,
  currentVersion: lifecycle.currentVersion,
  officialInstallerSha256: lifecycle.currentInstallerSha256,
  installedExecutableSha256: lifecycle.installedExecutableSha256,
  lifecycleChecks: { passed: lifecycle.checksPassed, failed: lifecycle.checksFailed },
  releaseMessaging: 'official-published-copy-observed',
  sourceUserContentIncluded: false,
  visualReview: review,
  files,
}
fs.mkdirSync(destinationRoot, { recursive: false })
for (const [name, bytes] of contents) fs.writeFileSync(path.join(destinationRoot, name), bytes, { flag: 'wx' })
fs.writeFileSync(path.join(destinationRoot, 'import-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
