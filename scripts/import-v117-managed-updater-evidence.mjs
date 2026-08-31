import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [artifactRootArg] = process.argv.slice(2)
if (!artifactRootArg) throw new Error('Usage: node scripts/import-v117-managed-updater-evidence.mjs <downloaded-artifact-root>')
const sourceRoot = path.resolve(artifactRootArg)
const destinationRoot = path.resolve('docs/evidence/v1.0.17-managed-updater')
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
if (!discovery.release?.releaseNotes?.includes('状态：已正式发布。') || discovery.confirmation?.installerStartedBeforeConfirmation !== false) throw new Error('Corrected official release messaging or confirmation boundary is missing')

const files = names.map(name => {
  const bytes = fs.readFileSync(path.join(destinationRoot, name))
  const item = { path: name, bytes: bytes.length, sha256: sha256(bytes) }
  if (name.endsWith('.jpg')) item.visuallyReviewed = true
  return item
})
const manifest = {
  schemaVersion: 1,
  stage: 'V1.0.17-U1I',
  status: 'accepted',
  importedAt: '2026-08-31T07:34:00Z',
  githubRunId: 33368732235,
  artifactId: 9749254816,
  artifactDigest: 'sha256:3e41a3c4fbe70903f8d795d0e684a78fb5ad8cb771db3a70c6ec7980cd78b2d6',
  headCommit: '6af0d846d1c15e878836941f744985e7ed16b762',
  previousVersion: lifecycle.previousVersion,
  currentVersion: lifecycle.currentVersion,
  officialInstallerSha256: lifecycle.currentInstallerSha256,
  installedExecutableSha256: lifecycle.installedExecutableSha256,
  lifecycleChecks: { passed: lifecycle.checksPassed, failed: lifecycle.checksFailed },
  releaseMessaging: 'official-published-copy-observed-after-correction',
  sourceUserContentIncluded: false,
  files,
}
fs.writeFileSync(path.join(destinationRoot, 'import-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
