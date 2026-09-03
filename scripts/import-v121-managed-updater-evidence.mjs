import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [artifactRootArg, runIdArg, artifactIdArg, artifactDigestArg, headCommitArg, importedAtArg] = process.argv.slice(2)
if (!artifactRootArg || !runIdArg || !artifactIdArg || !artifactDigestArg || !headCommitArg || !importedAtArg) throw new Error('Usage: node scripts/import-v121-managed-updater-evidence.mjs <artifact-root> <run-id> <artifact-id> <artifact-digest> <head-commit> <imported-at>')
const sourceRoot = path.resolve(artifactRootArg)
const destinationRoot = path.resolve('docs/evidence/v1.0.21-managed-updater')
const repositoryRoot = path.resolve('.')
if (!`${destinationRoot}${path.sep}`.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('Evidence destination escaped repository')
if (fs.existsSync(destinationRoot)) throw new Error(`Refusing to overwrite existing evidence directory: ${destinationRoot}`)

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const names = fs.readdirSync(sourceRoot).filter(name => fs.statSync(path.join(sourceRoot, name)).isFile()).sort()
if (names.length !== 9) throw new Error(`Expected 9 updater evidence files, found ${names.length}`)
fs.mkdirSync(destinationRoot, { recursive: false })
for (const name of names) {
  const bytes = fs.readFileSync(path.join(sourceRoot, name))
  fs.writeFileSync(path.join(destinationRoot, name), name.endsWith('.json') ? `${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n` : bytes)
}

const lifecycle = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'managed-updater-lifecycle-result.json'), 'utf8'))
const discovery = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'managed-updater-discovery-evidence.json'), 'utf8'))
if (lifecycle.status !== 'passed' || lifecycle.checksPassed !== 12 || lifecycle.checksFailed !== 0 || lifecycle.sourceUserContentIncluded) throw new Error('Managed updater lifecycle did not pass 12/12 or contains user content')
if (!discovery.release?.releaseNotes?.includes('v1.0.21 是知识图谱交互精修补丁') || !discovery.release?.releaseNotes?.includes('普通图谱根据节点密度设置可读缩放下限') || discovery.confirmation?.installerStartedBeforeConfirmation !== false) throw new Error('Official published release messaging or confirmation boundary is missing')

const files = names.map(name => {
  const bytes = fs.readFileSync(path.join(destinationRoot, name))
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
  files,
}
fs.writeFileSync(path.join(destinationRoot, 'import-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
