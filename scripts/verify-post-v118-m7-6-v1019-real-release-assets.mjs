import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [artifactRootArg] = process.argv.slice(2)
if (!artifactRootArg) throw new Error('Usage: node scripts/verify-post-v118-m7-6-v1019-real-release-assets.mjs <downloaded-artifact-root>')
const root = path.resolve(artifactRootArg)
const policy = JSON.parse(fs.readFileSync('shared/post-v118-m7-6-v1019-final-artifact-manifest-release-readiness-policy.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync('docs/evidence/v1.0.19-release/artifact-manifest.json', 'utf8'))
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

const output = path.resolve('.release-secrets/release-v1.0.19')
if (!`${output}${path.sep}`.startsWith(`${path.resolve('.release-secrets')}${path.sep}`)) throw new Error('Release output escaped .release-secrets')
fs.mkdirSync(output, { recursive: true })
for (const entry of fs.readdirSync(output)) fs.rmSync(path.join(output, entry), { recursive: true, force: true })

for (const expected of policy.artifacts) {
  const matches = files.filter(file => path.basename(file) === expected.sourceFileName)
  if (matches.length !== 1) throw new Error(`Expected exactly one ${expected.sourceFileName}, found ${matches.length}`)
  const bytes = fs.readFileSync(matches[0])
  if (bytes.length !== expected.sizeBytes || sha256(bytes) !== expected.sha256) throw new Error(`Real artifact mismatch: ${expected.sourceFileName}`)
  const recorded = manifest.artifacts.find(item => item.target === expected.target)
  if (!recorded || recorded.fileName !== expected.fileName || recorded.sha256 !== expected.sha256) throw new Error(`Manifest mapping mismatch: ${expected.target}`)
  fs.writeFileSync(path.join(output, expected.fileName), bytes)
}
const checksum = `${policy.artifacts.map(item => `${item.sha256}  ${item.fileName}`).join('\n')}\n`
const checksumBytes = Buffer.from(checksum)
if (checksumBytes.length !== policy.checksumFile.sizeBytes || sha256(checksumBytes) !== policy.checksumFile.sha256 || !fs.readFileSync('docs/evidence/v1.0.19-release/SHA256SUMS.txt').equals(checksumBytes)) throw new Error('SHA256SUMS mismatch')
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), checksumBytes)
console.log(`M7-6 real release assets verified and prepared at ${output}`)
