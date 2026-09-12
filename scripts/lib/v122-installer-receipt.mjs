import crypto from 'node:crypto'

export function verifyV122InstallerReceipt(receipt, policy, previousReceipt, readArtifact) {
  const fail = message => { throw new Error(`v1.0.22 installer receipt: ${message}`) }
  if (receipt.stage !== 'M8-15' || receipt.status !== 'hosted-installers-built'
    || receipt.candidateSourceCommit !== policy.candidateCommit
    || receipt.previousSourceCommit !== policy.previousTagCommit
    || receipt.appVersion !== '1.0.22' || receipt.previousVersion !== '1.0.21'
    || receipt.releaseCandidate !== false || receipt.sourceUserContentIncluded !== false) fail('candidate identity/privacy drift')
  const previous = previousReceipt.assets?.filter(a => a.name === 'LongEdit_1.0.21_x64-setup.exe') ?? []
  if (previousReceipt.release?.tag !== 'v1.0.21' || previousReceipt.release?.taggedCommit !== policy.previousTagCommit
    || previous.length !== 1 || receipt.previousInstallerSource !== 'official-github-release'
    || receipt.previousInstallerSha256 !== previous[0].sha256) fail('official baseline drift')
  const artifacts = receipt.artifacts
  if (!Array.isArray(artifacts) || artifacts.length !== 2 || new Set(artifacts.map(a => a.target)).size !== 2) fail('expected unique MSI and NSIS')
  for (const artifact of artifacts) {
    const suffix = artifact.target === 'msi' ? '_1.0.22_x64_zh-CN.msi' : artifact.target === 'nsis' ? '_1.0.22_x64-setup.exe' : null
    if (!suffix || typeof artifact.fileName !== 'string' || !artifact.fileName.endsWith(suffix)
      || /[\\/:]/.test(artifact.fileName) || artifact.fileName.includes('..') || artifact.authenticodeStatus !== 'NotSigned') fail('artifact name/target/signature drift')
  }
  for (const artifact of [...artifacts, { ...previous[0], fileName: previous[0].name }]) {
    if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0 || !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? '')) fail('invalid size/digest')
    const bytes = readArtifact(artifact.fileName)
    if (bytes.length !== artifact.sizeBytes || crypto.createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) fail(`byte identity mismatch: ${artifact.fileName}`)
  }
  return { status: 'installer-bytes-verified-only', candidateCommit: policy.candidateCommit, installersVerified: 3, installedLifecycleAccepted: false, searchAccepted: false }
}
