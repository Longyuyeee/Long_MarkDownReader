import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const policy = readJson('shared/post-v115-m0-baseline-policy.json')
const registry = readJson('shared/file-formats.json')
const matrix = readJson('shared/release-capability-matrix.json')
const workspace = readJson('docs/evidence/post-v115-m0-baseline/workspace-baseline.json')
const graph = readJson('docs/evidence/post-v115-m0-baseline/graph-baseline.json')
const failures = []

const readinessCounts = Object.fromEntries(
  [...new Set(matrix.formats.map(item => item.readiness))]
    .sort()
    .map(readiness => [readiness, matrix.formats.filter(item => item.readiness === readiness).length]),
)
const weakFormats = matrix.formats.filter(item => item.readiness !== 'verified')
const weakById = new Map(weakFormats.map(item => [item.id, item]))

if (registry.formats.length !== policy.expected.formatCount) failures.push(`format count: expected ${policy.expected.formatCount}, actual ${registry.formats.length}`)
const extensionCount = new Set(registry.formats.flatMap(format => format.extensions)).size
if (extensionCount !== policy.expected.extensionCount) failures.push(`extension count: expected ${policy.expected.extensionCount}, actual ${extensionCount}`)
for (const [readiness, expected] of Object.entries(policy.expected.readinessCounts)) {
  if (readinessCounts[readiness] !== expected) failures.push(`readiness ${readiness}: expected ${expected}, actual ${readinessCounts[readiness]}`)
}
if (weakFormats.length !== policy.expected.weakFormatCount) failures.push(`weak format count: expected ${policy.expected.weakFormatCount}, actual ${weakFormats.length}`)

const sampleRows = policy.formatTargets.map(target => {
  const current = weakById.get(target.id)
  if (!current) failures.push(`weak format target is absent from current release matrix: ${target.id}`)
  if (target.evidence.length < 3) failures.push(`format target lacks three evidence roles: ${target.id}`)
  const evidence = target.evidence.map(file => {
    const exists = fs.existsSync(file)
    if (!exists) failures.push(`evidence is missing: ${target.id} -> ${file}`)
    return exists ? { file, bytes: fs.statSync(file).size, sha256: sha256(file) } : { file, missing: true }
  })
  return {
    id: target.id,
    milestone: target.milestone,
    expectedDirection: target.expectedDirection,
    currentReadiness: current?.readiness || null,
    currentProfile: current?.profile || null,
    evidence,
  }
})

const workspaceExpected = policy.expected.workspace
for (const [key, expected] of Object.entries(workspaceExpected)) {
  if (key === 'brokenLinkCount' || key === 'ambiguousLinkCount') continue
  const actual = workspace.actual[key]
  if (actual !== expected) failures.push(`workspace ${key}: expected ${expected}, actual ${actual}`)
}
if (graph.fixedWorkspace.actualBrokenLinks !== workspaceExpected.brokenLinkCount) failures.push(`broken links: expected ${workspaceExpected.brokenLinkCount}, actual ${graph.fixedWorkspace.actualBrokenLinks}`)
if (graph.fixedWorkspace.actualAmbiguousLinks !== workspaceExpected.ambiguousLinkCount) failures.push(`ambiguous links: expected ${workspaceExpected.ambiguousLinkCount}, actual ${graph.fixedWorkspace.actualAmbiguousLinks}`)

for (const tier of policy.expected.graphTiers) {
  const actual = graph.actual.find(item => item.tier === tier)
  if (!actual) failures.push(`graph tier missing: ${tier}`)
  else if (!actual.passed || actual.actualNodes !== tier || actual.actualEdges !== tier - 1) failures.push(`graph tier differs: ${tier}`)
}

const differences = [
  { id: 'format-coverage', beforeActual: { formats: registry.formats.length, extensions: extensionCount, readinessCounts }, expected: { formats: 43, extensions: 91, readinessCounts: policy.expected.readinessCounts }, afterActual: 'baseline-only-no-product-change', differenceResolved: true },
  { id: 'workspace-fixture', beforeActual: workspace.actual, expected: workspaceExpected, afterActual: 'baseline-only-no-product-change', differenceResolved: failures.every(item => !item.startsWith('workspace')) },
  { id: 'graph-scale', beforeActual: graph.actual, expected: policy.expected.graphTiers.map(tier => ({ tier, nodes: tier, edges: tier - 1 })), afterActual: 'baseline-only-no-product-change', differenceResolved: failures.every(item => !item.startsWith('graph tier')) },
]
const report = {
  schemaVersion: 1,
  stage: 'M0',
  status: failures.length ? 'rejected' : 'accepted',
  baselineCommit: 'runtime-head',
  expected: policy.expected,
  actual: {
    formatCount: registry.formats.length,
    extensionCount,
    readinessCounts,
    weakFormatCount: weakFormats.length,
    weakFormats: sampleRows,
    workspace: workspace.actual,
    graph: graph.actual,
  },
  differences,
  failures,
  sourceUserContentIncluded: false,
  passed: failures.length === 0,
}
const output = path.resolve('docs/evidence/post-v115-m0-baseline/baseline-audit.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`M0 baseline accepted: ${report.actual.weakFormatCount} weak formats, workspace ${workspace.actual.totalRegisteredFiles} files, graph tiers ${policy.expected.graphTiers.join('/')}.`)
