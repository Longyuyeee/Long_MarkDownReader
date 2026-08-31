import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.env.LONGEDIT_M4F4_ARTIFACT_ROOT || '')
if (!process.env.LONGEDIT_M4F4_ARTIFACT_ROOT || !fs.statSync(root).isDirectory()) throw new Error('LONGEDIT_M4F4_ARTIFACT_ROOT must identify the downloaded Actions artifact directory')
const repository = process.cwd()
const policy = JSON.parse(fs.readFileSync('shared/post-v115-m4f4-v1016-final-artifact-manifest-release-readiness-policy.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync('docs/evidence/v1.0.16-release/artifact-manifest.json', 'utf8'))
const imported = JSON.parse(fs.readFileSync('docs/evidence/post-v115-m4f3-v1016-hosted-installer-lifecycle/import-manifest.json', 'utf8'))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const files = []
const visit = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) visit(target)
    else files.push(target)
  }
}
visit(root)

const output = path.resolve(repository, '.release-secrets', `release-v${policy.candidateVersion}`)
const outputBoundary = `${path.resolve(repository, '.release-secrets')}${path.sep}`
if (!`${output}${path.sep}`.startsWith(outputBoundary)) throw new Error('release output escaped .release-secrets')
fs.mkdirSync(output, { recursive: true })
for (const entry of fs.readdirSync(output)) fs.rmSync(path.join(output, entry), { recursive: true, force: true })

const actual = []
for (const expected of policy.artifacts) {
  const matches = files.filter(file => path.basename(file) === expected.sourceFileName)
  if (matches.length !== 1) throw new Error(`Expected exactly one real ${expected.sourceFileName}, found ${matches.length}`)
  const source = matches[0]
  const bytes = fs.readFileSync(source)
  const observed = { ...expected, sourcePath: path.relative(root, source).replaceAll('\\', '/'), sizeBytes: bytes.length, sha256: sha256(bytes) }
  if (observed.sizeBytes !== expected.sizeBytes || observed.sha256 !== expected.sha256) throw new Error(`Real artifact mismatch: ${expected.sourceFileName}`)
  const manifestArtifact = manifest.artifacts.find(item => item.target === expected.target)
  if (!manifestArtifact || manifestArtifact.sourceFileName !== expected.sourceFileName || manifestArtifact.fileName !== expected.fileName || manifestArtifact.sizeBytes !== expected.sizeBytes || manifestArtifact.sha256 !== expected.sha256) throw new Error(`Final manifest mismatch: ${expected.target}`)
  fs.writeFileSync(path.join(output, expected.fileName), bytes)
  actual.push(observed)
}

const checksum = `${policy.artifacts.map(item => `${item.sha256}  ${item.fileName}`).join('\n')}\n`
fs.writeFileSync(path.join(output, policy.checksumFile.fileName), checksum, 'utf8')
const committedChecksum = fs.readFileSync('docs/evidence/v1.0.16-release/SHA256SUMS.txt')
if (!committedChecksum.equals(Buffer.from(checksum)) || committedChecksum.length !== policy.checksumFile.sizeBytes || sha256(committedChecksum) !== policy.checksumFile.sha256) throw new Error('Committed SHA256SUMS.txt does not match real artifacts')

const sourceEvidence = path.join(root, 'm4f3-output')
const evidenceNames = fs.readdirSync(sourceEvidence).filter(name => name !== 'r5k-windows-evidence.zip').sort()
const canonical = (directory, name) => {
  const bytes = fs.readFileSync(path.join(directory, name))
  if (!name.endsWith('.json')) return bytes
  return Buffer.from(`${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n`)
}
const canonicalTree = directory => {
  const rows = evidenceNames.map(name => {
    const bytes = canonical(directory, name)
    return `${name}:${bytes.length}:${sha256(bytes)}`
  })
  return {
    fileCount: evidenceNames.length,
    totalBytes: evidenceNames.reduce((sum, name) => sum + canonical(directory, name).length, 0),
    canonicalTreeSha256: sha256(Buffer.from(rows.join('\n'))),
  }
}
const downloadedCanonical = canonicalTree(sourceEvidence)
const repositoryCanonical = canonicalTree(path.resolve('docs/evidence/post-v115-m4f3-v1016-hosted-installer-lifecycle'))
if (JSON.stringify(downloadedCanonical) !== JSON.stringify(repositoryCanonical) || JSON.stringify(repositoryCanonical) !== JSON.stringify({
  fileCount: imported.repositoryCanonicalEvidence.fileCount,
  totalBytes: imported.repositoryCanonicalEvidence.totalBytes,
  canonicalTreeSha256: imported.repositoryCanonicalEvidence.canonicalTreeSha256,
})) throw new Error('Downloaded and repository canonical evidence differ')

const receipt = {
  schemaVersion: 1,
  stage: 'M4F-4-real-artifact-verification',
  hostedRunId: policy.hostedRunId,
  hostedArtifactId: policy.hostedArtifactId,
  candidateSourceCommit: policy.candidateSourceCommit,
  actual,
  checksumFile: { ...policy.checksumFile },
  downloadedCanonicalEvidence: downloadedCanonical,
  repositoryCanonicalEvidence: repositoryCanonical,
  sourceUserContentIncluded: false,
  releasePublished: false,
}
fs.writeFileSync(path.join(output, 'real-verification.json'), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify({ expected: { artifacts: policy.artifacts, canonicalEvidence: imported.repositoryCanonicalEvidence }, actual: receipt }, null, 2))
