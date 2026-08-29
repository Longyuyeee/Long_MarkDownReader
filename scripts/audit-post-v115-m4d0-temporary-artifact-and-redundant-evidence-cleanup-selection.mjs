import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const policy = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const development = readJson('shared/development-version-policy.json')
const git = (args, options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options })
const baseline = policy.auditBaselineCommit
const publicTag = development.publicTag
if (git(['rev-parse', baseline]).trim() !== baseline) throw new Error('M4D-0 baseline commit is unavailable')

const added = git(['diff', '--diff-filter=A', '--name-only', '-z', `${publicTag}..${baseline}`]).split('\0').filter(Boolean)
const addedSet = new Set(added)
const tree = new Map()
for (const line of git(['ls-tree', '-r', '-l', '-z', baseline]).split('\0')) {
  const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\s+(\d+)\t(.+)$/)
  if (match) tree.set(match[3], { objectId: match[1], bytes: Number(match[2]) })
}
const addedFiles = added.map(file => ({ file, ...(tree.get(file) || { objectId: '', bytes: 0 }) }))
const sum = files => files.reduce((total, item) => total + item.bytes, 0)
const byPrefix = prefix => addedFiles.filter(item => item.file.startsWith(prefix))
const scriptFamilies = Object.fromEntries([...new Set(byPrefix('scripts/').map(item => path.posix.basename(item.file).split('-')[0]))].sort().map(family => [family, byPrefix('scripts/').filter(item => path.posix.basename(item.file).startsWith(`${family}-`)).length]))
const gitContains = (needle, paths) => {
  try { return Boolean(git(['grep', '-l', '-F', needle, baseline, '--', ...paths]).trim()) } catch { return false }
}

const candidateMetric = new Map([
  ['full-5000.svg', ['full', 'svg']],
  ['full-5000.png', ['full', 'png']],
  ['filtered-5000.svg', ['filtered', 'svg']],
  ['filtered-5000.png', ['filtered', 'png']],
])
const tier = JSON.parse(git(['show', `${baseline}:docs/evidence/post-v115-m3c4-large-graph-performance-exit-audit/tier-5000.json`]))
const checker = git(['show', `${baseline}:scripts/check-post-v115-m3c4-large-graph-performance-exit-audit.mjs`])
const capture = git(['show', `${baseline}:scripts/capture-post-v115-m3c0-large-graph-performance.mjs`])
const candidates = policy.selection.files.map(file => {
  const bytes = git(['show', `${baseline}:${file}`], { encoding: null })
  const name = path.posix.basename(file)
  const [scope, format] = candidateMetric.get(name) || []
  const retained = tier.actual?.exports?.[scope]?.[format]
  return {
    file,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    retainedMetricPath: `tier-5000.json#actual.exports.${scope}.${format}`,
    retainedMetricsMatch: retained?.bytes === bytes.length && retained?.sha256 === crypto.createHash('sha256').update(bytes).digest('hex'),
    generatedByExistingHarness: capture.includes('`${scope}-${tier}.${format}`'),
    directlyConsumedByChecker: checker.includes(name),
    releaseDependencyObserved: gitContains(name, ['package.json', '.github', 'shared', 'scripts/check-r*', 'scripts/check-u*', 'scripts/check-v*']),
    selectedForM4D1: true,
  }
})

const groups = new Map()
for (const item of addedFiles.filter(item => item.objectId && item.bytes > 0)) {
  if (!groups.has(item.objectId)) groups.set(item.objectId, [])
  groups.get(item.objectId).push(item)
}
const classifyDuplicate = files => {
  const joined = files.join('\n')
  if (joined.includes('/duplicates/copy-a.txt') && joined.includes('/duplicates/copy-b.txt')) return 'intentional-duplicate-detection-fixture'
  if (files.every(file => /path-motion-.*-(before|after)\.jpg$/.test(file))) return 'reduced-motion-before-after-equivalence'
  if (joined.includes('restart-ready-query-1280.jpg') && joined.includes('current-restart-ready-query-1280.jpg')) return 'baseline-current-equivalence'
  return 'independent-stage-evidence'
}
const duplicateGroups = [...groups.entries()].filter(([, files]) => files.length > 1).map(([objectId, files]) => ({
  objectId,
  bytesPerFile: files[0].bytes,
  files: files.map(item => item.file),
  classification: classifyDuplicate(files.map(item => item.file)),
  selectedForRemoval: false,
  reason: 'The paths carry distinct behavioral, baseline, fixture or stage meaning; Git already stores their identical content as one blob.',
}))

const ignoredRoots = ['node_modules', 'dist', 'src-tauri/target', 'src-tauri/gen', '.release-secrets']
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
const ignoredLocalState = ignoredRoots.map(rootName => ({
  root: rootName,
  trackedAtBaseline: [...tree.keys()].some(file => file === rootName || file.startsWith(`${rootName}/`)),
  ignoredByPolicy: gitignore.includes(rootName.replace('src-tauri/', '/src-tauri/')) || gitignore.includes(rootName),
  cleanupScope: 'local-only-excluded-from-tracked-M4D-selection',
}))

const evidence = {
  schemaVersion: 1,
  stage: 'M4D-0',
  status: 'passed',
  sourceCommit: baseline,
  publicTag,
  inventory: {
    addedFileCount: addedFiles.length,
    addedBytes: sum(addedFiles),
    addedScriptCount: byPrefix('scripts/').length,
    addedScriptFamilies: scriptFamilies,
    addedEvidenceCount: byPrefix('docs/evidence/').length,
    addedDocumentCount: byPrefix('docs/').filter(item => !item.file.startsWith('docs/evidence/')).length,
    addedPolicyCount: byPrefix('shared/').length,
    exactDuplicateGroupCount: duplicateGroups.length,
    exactDuplicatePathCount: duplicateGroups.reduce((total, group) => total + group.files.length, 0),
    selectedCandidateCount: candidates.length,
    selectedCandidateBytes: sum(candidates),
  },
  candidates,
  duplicateGroups,
  ignoredLocalState,
  decisions: {
    scriptsSelectedForRemoval: 0,
    duplicateEvidenceSelectedForRemoval: 0,
    generatedExportPayloadsSelectedForRemoval: candidates.length,
    selectedNextStage: policy.selectedNextStage,
  },
  releaseCandidate: false,
}

const failures = []
if (addedFiles.length !== 931 || sum(addedFiles) !== 58155445 || byPrefix('scripts/').length !== 179 || byPrefix('docs/evidence/').length !== 573) failures.push('baseline inventory drifted')
if (candidates.length !== 4 || sum(candidates) !== policy.selection.bytes || candidates.some(item => !item.retainedMetricsMatch || !item.generatedByExistingHarness || item.directlyConsumedByChecker || item.releaseDependencyObserved)) failures.push('selected generated export payload boundary failed')
if (duplicateGroups.length !== 8 || duplicateGroups.some(group => group.selectedForRemoval || !policy.protectedDuplicateClasses.includes(group.classification))) failures.push('semantic duplicate protection failed')
if (ignoredLocalState.some(item => item.trackedAtBaseline || !item.ignoredByPolicy)) failures.push('ignored local build state boundary failed')
if (failures.length) throw new Error(`M4D-0 cleanup selection audit failed: ${failures.join(', ')}`)

const output = path.join(root, 'docs/evidence/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'inventory.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`M4D-0 cleanup selection passed: ${addedFiles.length} added files classified; ${candidates.length} generated payloads (${sum(candidates)} bytes) selected for M4D-1.`)
