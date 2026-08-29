import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const predecessor = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const policy = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const successor = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const development = readJson('shared/development-version-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup/cleanup.json')
const tier = readJson('docs/evidence/post-v115-m3c4-large-graph-performance-exit-audit/tier-5000.json')
const runner = read('scripts/run-post-v115-m3c0-large-graph-performance-baseline-audit.ps1')
const cleanup = read('scripts/cleanup-post-v115-m4d1-generated-graph-export-artifacts.mjs')
const failures = []

if (policy.stage !== 'M4D-1' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4D-1 predecessor chain drifted')
if (evidence.stage !== policy.stage || evidence.status !== 'passed' || evidence.removedFileCount !== policy.deletionContract?.exactFileCount || evidence.removedBytes !== policy.deletionContract?.exactBytes) failures.push('cleanup evidence summary drifted')
if (evidence.removed?.map(item => item.file).join(',') !== predecessor.selection?.files?.join(',')) failures.push('removed path set differs from the frozen selection')
for (const item of evidence.removed || []) {
  const match = item.file.match(/\/(full|filtered)-5000\.(svg|png)$/)
  const retained = match ? tier.actual?.exports?.[match[1]]?.[match[2]] : null
  if (fs.existsSync(item.file)) failures.push(`removed payload still exists: ${item.file}`)
  if (retained?.bytes !== item.bytes || retained?.sha256 !== item.sha256) failures.push(`retained replacement metrics drifted: ${item.file}`)
}
const checkerIndex = runner.indexOf('& node (Join-Path $workspace $checker)')
const cleanupIndex = runner.indexOf('cleanup-post-v115-m4d1-generated-graph-export-artifacts.mjs')
if (checkerIndex < 0 || cleanupIndex < 0 || cleanupIndex <= checkerIndex || !runner.includes("if ($Stage -eq 'M3C-4' -and ($Tier -eq 0 -or $Tier -eq 5000))")) failures.push('M3C-4 runner cleanup is not gated after its checker and 5000-tier generation')
for (const token of ['retained?.bytes !== bytes.length', 'retained?.sha256 !== digest', 'for (const item of verified)', 'fs.unlinkSync(item.absolute)']) if (!cleanup.includes(token)) failures.push(`cleanup safety contract missing: ${token}`)
if (policy.selectedNextStage?.id !== successor.stage || successor.predecessor !== policy.stage || development.currentStage !== `${successor.selectedNextStage.id}-${successor.selectedNextStage.name}`) failures.push('M4D successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) { console.error(`M4D-1 bounded cleanup check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4D-1 accepted: four verified generated graph export payloads are absent, retained metrics remain authoritative, and future M3C-4 runs clean them only after a passing checker.')
