import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim()
const selection = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const cleanup = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const inventory = readJson('docs/evidence/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection/inventory.json')
const cleanupEvidence = readJson('docs/evidence/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup/cleanup.json')
const tier = readJson('docs/evidence/post-v115-m3c4-large-graph-performance-exit-audit/tier-5000.json')
const runner = fs.readFileSync(path.join(root, 'scripts/run-post-v115-m3c0-large-graph-performance-baseline-audit.ps1'), 'utf8')
const cleanupSource = fs.readFileSync(path.join(root, 'scripts/cleanup-post-v115-m4d1-generated-graph-export-artifacts.mjs'), 'utf8')
const cleanupCommit = 'fb34c527595164387e19ef684fd5c5a728296260'
const implementationBaseline = cleanup.implementationBaselineCommit
const selected = selection.selection.files

if (git('rev-parse', cleanupCommit) !== cleanupCommit) throw new Error('M4D-1 cleanup commit is unavailable')
const actualDeletions = git('diff', '--diff-filter=D', '--name-only', implementationBaseline, cleanupCommit).split(/\r?\n/).filter(Boolean)
const cycleAdded = git('diff', '--diff-filter=A', '--name-only', `${readJson('shared/development-version-policy.json').publicTag}..${selection.auditBaselineCommit}`).split(/\r?\n/).filter(Boolean)
const cleanupTree = new Set(git('ls-tree', '-r', '--name-only', cleanupCommit).split(/\r?\n/).filter(Boolean))
const protectedCyclePaths = cycleAdded.filter(file => !selected.includes(file))
const missingProtectedCyclePaths = protectedCyclePaths.filter(file => !cleanupTree.has(file))

const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name)
  return entry.isDirectory() ? walk(target) : [target]
})
const evidenceRoot = path.join(root, 'docs/evidence')
const remainingPostV115NativePayloads = walk(evidenceRoot)
  .map(file => path.relative(root, file).replaceAll('\\', '/'))
  .filter(file => file.startsWith('docs/evidence/post-v115-') && /\.(?:svg|png)$/i.test(file))

const retainedMetrics = cleanupEvidence.removed.map(item => {
  const match = item.file.match(/\/(full|filtered)-5000\.(svg|png)$/)
  const retained = match ? tier.actual?.exports?.[match[1]]?.[match[2]] : null
  return { file: item.file, bytes: retained?.bytes, sha256: retained?.sha256, matchesCleanupEvidence: retained?.bytes === item.bytes && retained?.sha256 === item.sha256 }
})
const checkerIndex = runner.indexOf('& node (Join-Path $workspace $checker)')
const cleanupIndex = runner.indexOf('cleanup-post-v115-m4d1-generated-graph-export-artifacts.mjs')
const runnerContract = {
  afterChecker: checkerIndex >= 0 && cleanupIndex > checkerIndex,
  generatedTierOnly: runner.includes("if ($Stage -eq 'M3C-4' -and ($Tier -eq 0 -or $Tier -eq 5000))"),
  fullPreflightBeforeDeletion: cleanupSource.indexOf('for (const item of verified)') > cleanupSource.indexOf('retained?.sha256 !== digest'),
  exactSelectionSource: cleanupSource.includes('selection.selection.files'),
}

const evidence = {
  schemaVersion: 1,
  stage: 'M4D-2',
  status: 'passed',
  sourceCommit: cleanupCommit,
  selectionBaselineCommit: selection.auditBaselineCommit,
  implementationBaselineCommit: implementationBaseline,
  actualDeletions,
  authorizedDeletionCount: selected.length,
  authorizedDeletionBytes: cleanupEvidence.removedBytes,
  unexpectedDeletionCount: actualDeletions.filter(file => !selected.includes(file)).length,
  protectedCyclePathCount: protectedCyclePaths.length,
  protectedCyclePathsPresent: protectedCyclePaths.length - missingProtectedCyclePaths.length,
  missingProtectedCyclePaths,
  remainingPostV115NativePayloads,
  retainedMetrics,
  runnerContract,
  inventoryClosure: {
    addedFileCount: inventory.inventory.addedFileCount,
    selectedCandidateCount: inventory.inventory.selectedCandidateCount,
    selectedCandidateBytes: inventory.inventory.selectedCandidateBytes,
    exactDuplicateGroupCount: inventory.inventory.exactDuplicateGroupCount,
    protectedDuplicateCount: inventory.duplicateGroups.filter(group => !group.selectedForRemoval).length,
    scriptsSelectedForRemoval: inventory.decisions.scriptsSelectedForRemoval,
    duplicateEvidenceSelectedForRemoval: inventory.decisions.duplicateEvidenceSelectedForRemoval,
    ignoredLocalRootsExcluded: inventory.ignoredLocalState.filter(item => item.cleanupScope === 'local-only-excluded-from-tracked-M4D-selection').length,
  },
  omittedEquivalentCandidateCount: remainingPostV115NativePayloads.length,
  closureDecision: 'passed-bounded-cleanup-scope',
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}

const failures = []
if (actualDeletions.join(',') !== selected.slice().sort().join(',')) failures.push('actual deletion set differs from frozen selection')
if (cleanupEvidence.removedFileCount !== 4 || cleanupEvidence.removedBytes !== selection.selection.bytes) failures.push('cleanup totals drifted')
if (protectedCyclePaths.length !== 927 || missingProtectedCyclePaths.length) failures.push('protected cycle paths are missing')
if (remainingPostV115NativePayloads.length) failures.push('post-v1.0.15 native SVG/PNG payloads remain')
if (retainedMetrics.some(item => !item.matchesCleanupEvidence)) failures.push('retained replacement metrics drifted')
if (Object.values(runnerContract).some(value => !value)) failures.push('future cleanup runner contract drifted')
if (inventory.inventory.addedFileCount !== 931 || inventory.inventory.selectedCandidateCount !== 4 || inventory.inventory.exactDuplicateGroupCount !== 8) failures.push('M4D-0 inventory closure drifted')
if (inventory.decisions.scriptsSelectedForRemoval !== 0 || inventory.decisions.duplicateEvidenceSelectedForRemoval !== 0 || inventory.duplicateGroups.some(group => group.selectedForRemoval)) failures.push('protected classification drifted')
if (failures.length) throw new Error(`M4D-2 cleanup exit audit failed: ${failures.join(', ')}`)

const output = path.join(root, 'docs/evidence/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'exit-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`M4D-2 cleanup exit passed: ${actualDeletions.length} authorized deletions, ${protectedCyclePaths.length} protected cycle paths retained, ${remainingPostV115NativePayloads.length} equivalent native payloads remain.`)
