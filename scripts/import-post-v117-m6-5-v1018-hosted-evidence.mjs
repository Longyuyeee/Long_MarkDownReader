import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [artifactRootArg] = process.argv.slice(2)
if (!artifactRootArg) throw new Error('Usage: node scripts/import-post-v117-m6-5-v1018-hosted-evidence.mjs <downloaded-artifact-root>')
const artifactRoot = path.resolve(artifactRootArg)
const sourceRoot = path.join(artifactRoot, 'm6-5-output')
if (!fs.statSync(sourceRoot).isDirectory()) throw new Error('Downloaded artifact does not contain m6-5-output')

const destinationRoot = path.resolve('docs/evidence/post-v117-m6-5-v1018-hosted-installer-lifecycle')
const repositoryRoot = path.resolve('.')
if (!`${destinationRoot}${path.sep}`.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('Evidence destination escaped repository')
if (fs.existsSync(destinationRoot)) throw new Error(`Refusing to overwrite existing evidence directory: ${destinationRoot}`)

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const names = fs.readdirSync(sourceRoot).filter(name => name !== 'r5k-windows-evidence.zip').sort()
if (names.length !== 29) throw new Error(`Expected 29 importable evidence files, found ${names.length}`)
if (names.filter(name => name.endsWith('.jpg')).length !== 14) throw new Error('Expected 14 visually reviewed screenshots')
for (const name of names.filter(name => name.endsWith('.json'))) {
  const text = fs.readFileSync(path.join(sourceRoot, name), 'utf8')
  if (/C:\\Users\\|\/Users\/|Administrator/i.test(text)) throw new Error(`Evidence contains an absolute user path: ${name}`)
}

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
  fs.writeFileSync(destination, name.endsWith('.json') ? `${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n` : bytes)
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
if (receipt.candidateSourceCommit !== '5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a' || receipt.previousSourceCommit !== '2b6235d420ceffd291dab72c4af17caffe464333') throw new Error('Installer receipt source identity drifted')
if (receipt.artifacts?.length !== 2 || receipt.artifacts.some(artifact => artifact.authenticodeStatus !== 'NotSigned')) throw new Error('Installer receipt does not contain two unsigned artifacts')
if (lifecycle.status !== 'passed' || lifecycle.checks?.length !== 22 || lifecycle.checks.some(check => check.status !== 'passed')) throw new Error('Lifecycle evidence did not pass 22/22')
if (installed.status !== 'passed' || installed.checks?.length !== 18 || installed.checks.some(check => check.status !== 'passed')) throw new Error('Installed evidence did not pass 18/18')
if (routes.routes?.length !== 11 || routes.routes.some(route => route.status !== 'passed')) throw new Error('Installed route evidence did not pass 11/11')
if (management.status !== 'passed' || management.checks?.length !== 7 || management.checks.some(check => check.status !== 'passed') || management.sourceUserContentIncluded) throw new Error('Management evidence did not pass 7/7 or contains source user content')

const manifest = {
  schemaVersion: 1,
  stage: 'M6-5',
  status: 'hosted-installer-lifecycle-passed',
  githubRunId: 33378338422,
  githubRunUrl: 'https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33378338422',
  workflowCommit: '6d208bcf7d0ba430b7df478718fe636fe91c6e34',
  productSourceCommit: receipt.candidateSourceCommit,
  previousPublicCommit: receipt.previousSourceCommit,
  appVersion: receipt.appVersion,
  previousVersion: receipt.previousVersion,
  artifact: {
    id: 9754106849,
    name: 'v118-candidate-lifecycle-33378338422',
    zipSizeBytes: 206527433,
    zipSha256: '357fc9987296ffabd438f9e9a2968130009e826757a316c1858292d116010b71',
    expiresAt: '2026-09-14T10:21:18Z',
  },
  installers: receipt.artifacts,
  previousInstaller: {
    target: 'nsis',
    fileName: 'Long编辑_1.0.17_x64-setup.exe',
    sizeBytes: 65796563,
    sha256: '372b41277b1384297ebe791e36e1d185bf920e660c9890f500fd2bbaa1e8ccdc',
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
  visualReview: {
    screenshotCount: 14,
    reviewed: true,
    result: 'accepted-no-clipping-crash-fallback-or-stale-version-copy',
  },
  expectedActualDifference: {
    expected: 'hosted artifacts preserve frozen source/version/signature/lifecycle semantics; byte identity with local M6-4 builds is not required',
    actual: 'hosted MSI and NSIS hashes differ from local M6-4 hashes while source, version, NotSigned status and every hosted lifecycle gate match',
    correction: 'record local and hosted receipts independently and promote only the hosted lifecycle artifacts in M6-6',
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
  selectedNextStage: 'M6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit',
}
fs.writeFileSync(path.join(destinationRoot, 'import-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
