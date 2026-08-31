import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [artifactRootArg] = process.argv.slice(2)
if (!artifactRootArg) throw new Error('Usage: node scripts/import-post-v116-m5-6-v1017-hosted-evidence.mjs <downloaded-artifact-root>')
const artifactRoot = path.resolve(artifactRootArg)
const sourceRoot = path.join(artifactRoot, 'm5-6-output')
if (!fs.statSync(sourceRoot).isDirectory()) throw new Error('Downloaded artifact does not contain m5-6-output')

const destinationRoot = path.resolve('docs/evidence/post-v116-m5-6-v1017-hosted-installer-lifecycle')
const repositoryRoot = path.resolve('.')
if (!`${destinationRoot}${path.sep}`.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('Evidence destination escaped repository')
if (fs.existsSync(destinationRoot)) throw new Error(`Refusing to overwrite existing evidence directory: ${destinationRoot}`)

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const names = fs.readdirSync(sourceRoot).filter(name => name !== 'r5k-windows-evidence.zip').sort()
if (names.length !== 29) throw new Error(`Expected 29 importable evidence files, found ${names.length}`)
const rawRows = names.map(name => {
  const bytes = fs.readFileSync(path.join(sourceRoot, name))
  return `${name}:${bytes.length}:${sha256(bytes)}`
})
const rawTotalBytes = names.reduce((sum, name) => sum + fs.statSync(path.join(sourceRoot, name)).size, 0)

fs.mkdirSync(destinationRoot, { recursive: false })
for (const name of names) {
  const source = path.join(sourceRoot, name)
  const destination = path.join(destinationRoot, name)
  const bytes = fs.readFileSync(source)
  if (name.endsWith('.json')) {
    fs.writeFileSync(destination, `${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n`)
  } else {
    fs.writeFileSync(destination, bytes)
  }
}

const canonicalRows = names.map(name => {
  const bytes = fs.readFileSync(path.join(destinationRoot, name))
  return `${name}:${bytes.length}:${sha256(bytes)}`
})
const canonicalTotalBytes = names.reduce((sum, name) => sum + fs.statSync(path.join(destinationRoot, name)).size, 0)
const receipt = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'installer-build-receipt.json'), 'utf8'))
const lifecycle = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'lifecycle-result.json'), 'utf8'))
const installed = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'installed-artifact-smoke.json'), 'utf8'))
const routes = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'installed-route-mount-evidence.json'), 'utf8'))
const management = JSON.parse(fs.readFileSync(path.join(destinationRoot, 'management-backup-index-evidence.json'), 'utf8'))
if (receipt.candidateSourceCommit !== '2b6235d420ceffd291dab72c4af17caffe464333' || receipt.previousSourceCommit !== '757d54309ddb35f445344d909fa4c7ba2567bc58') throw new Error('Installer receipt source identity drifted')
if (lifecycle.status !== 'passed' || lifecycle.checks?.length !== 22 || lifecycle.checks.some(check => check.status !== 'passed')) throw new Error('Lifecycle evidence did not pass 22/22')
if (installed.status !== 'passed' || installed.checks?.length !== 18 || installed.checks.some(check => check.status !== 'passed')) throw new Error('Installed evidence did not pass 18/18')
if (routes.routes?.length !== 11 || routes.routes.some(route => route.status !== 'passed')) throw new Error('Installed route evidence did not pass 11/11')
if (management.status !== 'passed' || management.checks?.length !== 7 || management.checks.some(check => check.status !== 'passed') || management.sourceUserContentIncluded) throw new Error('Management evidence did not pass 7/7 or contains source user content')

const manifest = {
  schemaVersion: 1,
  stage: 'M5-6',
  status: 'hosted-installer-lifecycle-passed',
  githubRunId: 33361759629,
  githubRunUrl: 'https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33361759629',
  workflowCommit: '98631fd9545f3aeaa653e47bc8b4776c4836f44c',
  productSourceCommit: receipt.candidateSourceCommit,
  previousPublicCommit: receipt.previousSourceCommit,
  appVersion: receipt.appVersion,
  previousVersion: receipt.previousVersion,
  artifact: {
    id: 9747835764,
    name: 'v117-candidate-lifecycle-33361759629',
    zipSizeBytes: 206517643,
    zipSha256: 'f321741bee7a3527750659cf83197e851efa6db717757eacd5dbb0430ca6f51a',
    expiresAt: '2026-09-14T06:32:47Z',
  },
  installers: receipt.artifacts,
  previousInstaller: {
    target: 'nsis',
    fileName: 'Long编辑_1.0.16_x64-setup.exe',
    sizeBytes: 65795604,
    sha256: '993f54681a83e484b066fec776f64fccce48d271c912e2591ae2d5fa52d94926',
    authenticodeStatus: 'NotSigned',
  },
  checks: {
    lifecyclePassed: 22,
    lifecycleFailed: 0,
    installedArtifactPassed: 18,
    installedArtifactFailed: 0,
    installedRoutesPassed: 11,
    managementRollbackPassed: 7,
    managementRollbackFailed: 0,
  },
  expectedActualDifference: {
    expected: 'hosted artifacts preserve frozen source/version/signature/lifecycle semantics; byte identity with local M5-5 build is not required',
    actual: 'hosted MSI/NSIS hashes differ from local M5-5 hashes while source, version, NotSigned status and all lifecycle checks match',
    correction: 'record local and hosted receipts independently and promote only the hosted lifecycle artifacts in M5-7',
  },
  importedEvidence: {
    fileCount: names.length,
    totalBytes: rawTotalBytes,
    canonicalTreeSha256: sha256(Buffer.from(rawRows.join('\n'))),
    scope: 'raw-downloaded-artifact-bytes',
  },
  repositoryCanonicalEvidence: {
    algorithm: 'json-stable-indent-2-lf-and-binary-byte-preserve-v1',
    fileCount: names.length,
    totalBytes: canonicalTotalBytes,
    canonicalTreeSha256: sha256(Buffer.from(canonicalRows.join('\n'))),
  },
  sourceUserContentIncluded: false,
  releaseCandidate: false,
  selectedNextStage: 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit',
}
fs.writeFileSync(path.join(destinationRoot, 'import-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
