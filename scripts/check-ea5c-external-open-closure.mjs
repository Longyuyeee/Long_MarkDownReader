import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const json = file => JSON.parse(read(file))
const failures = []
const fail = message => failures.push(message)

const pkg = json('package.json')
const registry = json('shared/file-formats.json')
const closure = json('shared/ea5c-external-open-closure.json')
const experience = json('shared/ux38-final-closure.json')
const evidence = json('docs/evidence/ea-5b2-installed-default-app/audit-manifest.json')
const userAudit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
const alignment = read('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')
const currentAudit = read('scripts/check-current-development-audit.mjs')
const qualityWorkflow = read('.github/workflows/quality-gate.yml')
const lifecycleWorkflow = read('.github/workflows/u2-unsigned-lifecycle.yml')

const policies = registry.formats.reduce((counts, format) => {
  counts[format.externalPolicy] = (counts[format.externalPolicy] ?? 0) + 1
  return counts
}, {})
const registeredExtensions = new Set(registry.formats.flatMap(format => format.extensions))
const candidates = registry.formats.filter(format => ['edit', 'preview'].includes(format.externalPolicy))
const candidateExtensions = new Set(candidates.flatMap(format => format.extensions))
const importIds = registry.formats
  .filter(format => format.externalPolicy === 'import')
  .map(format => format.id)
  .sort()
const expectedImportIds = ['legacy-doc', 'legacy-ppt', 'legacy-xls', 'wps-document', 'wps-presentation', 'wps-spreadsheet'].sort()

for (const [label, actual, expected] of [
  ['registered format count', registry.formats.length, closure.formatCoverage.registeredFormats],
  ['registered extension count', registeredExtensions.size, closure.formatCoverage.registeredExtensions],
  ['external edit count', policies.edit, closure.formatCoverage.externalEdit],
  ['external preview count', policies.preview, closure.formatCoverage.externalPreview],
  ['explicit import count', policies.import, closure.formatCoverage.explicitImportOrSystemOpen],
  ['default-app format count', candidates.length, closure.defaultAppCandidates.formatProfiles],
  ['default-app extension count', candidateExtensions.size, closure.defaultAppCandidates.extensions],
]) if (actual !== expected) fail(`${label} drift: ${actual} != ${expected}`)

if (JSON.stringify(importIds) !== JSON.stringify(expectedImportIds)) fail('legacy Office/WPS import boundary drift')
if (closure.status !== 'accepted-bounded' || closure.appVersion !== pkg.version) fail('EA-5C status or app version drift')
if (closure.defaultAppCandidates.owner !== 'explicit-user-action' || closure.defaultAppCandidates.windowsDefaultSelectionChanged !== false) fail('default-app ownership drift')
if (closure.releaseCandidate !== false || closure.promotionEligible !== false) fail('enterprise release boundary drift')
if (closure.nextPatch.version !== '1.0.6' || closure.nextPatch.communityPackagingEligible !== true) fail('next community patch decision drift')

const auditRows = userAudit
  .split('\n')
  .filter(line => /^\| UX-\d+ /.test(line))
  .map(line => {
    const columns = line.split('|').map(value => value.trim())
    return { id: columns[1], status: columns.at(-2) }
  })
const expectedIds = Array.from({ length: 41 }, (_, index) => `UX-${String(index + 1).padStart(2, '0')}`)
const actualIds = auditRows.map(row => row.id)
if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) fail(`foundational UX ids drift: ${actualIds.join(',')}`)
const unfinished = auditRows.filter(row => !/^已(?:完成|验收)/.test(row.status))
if (unfinished.length) fail(`foundational UX status is unfinished: ${unfinished.map(row => `${row.id}=${row.status}`).join(', ')}`)
if (auditRows.length !== closure.experienceClosure.foundationalRequirementCount || closure.experienceClosure.pendingImplementationCount !== 0) fail('foundational UX closure count drift')
if (!userAudit.includes('EA-5C 回写') || !userAudit.includes('真实跨版本自动更新') || !userAudit.includes('系统解码器')) fail('user experience audit is missing EA-5C residual boundaries')

const foundationalEvidence = closure.experienceClosure.foundationalEvidence ?? []
const evidenceIds = foundationalEvidence.map(item => item.id)
if (JSON.stringify(evidenceIds) !== JSON.stringify(expectedIds)) fail(`foundational evidence ids drift: ${evidenceIds.join(',')}`)
for (const item of foundationalEvidence) {
  if (!Array.isArray(item.references) || item.references.length === 0) {
    fail(`${item.id} has no evidence reference`)
    continue
  }
  for (const reference of item.references) if (!fs.existsSync(reference)) fail(`${item.id} evidence is missing: ${reference}`)
}

if (experience.status !== 'accepted-bounded' || experience.dimensionStatusCounts.pending !== closure.experienceClosure.formatExperiencePendingDimensions) fail('UX-38 bounded closure drift')
if (evidence.stage !== 'EA-5B2B' || evidence.sourceRun.id !== closure.installedEvidence.runId || evidence.sourceRun.sourceCommit !== closure.installedEvidence.sourceCommit) fail('installed evidence identity drift')
if (evidence.artifacts.currentInstallerSha256 !== closure.installedEvidence.currentInstallerSha256) fail('installed artifact hash drift')
if (evidence.checks.lifecycle.passed !== closure.installedEvidence.lifecycleChecksPassed || evidence.checks.lifecycle.failed !== 0) fail('installed lifecycle evidence drift')
if (evidence.checks.installedArtifactSmoke.passed !== closure.installedEvidence.installedWorkspaceChecksPassed || evidence.checks.installedArtifactSmoke.failed !== 0) fail('installed workspace evidence drift')
if (evidence.checks.sourceUserContentIncluded !== false || closure.installedEvidence.sourceUserContentIncluded !== false) fail('installed evidence privacy boundary drift')

const evidenceRoot = 'docs/evidence/ea-5b2-installed-default-app'
for (const file of evidence.files) {
  const target = path.join(evidenceRoot, file.path)
  if (!fs.existsSync(target)) {
    fail(`installed evidence file is missing: ${target}`)
    continue
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  if (hash !== file.sha256) fail(`installed evidence hash drift: ${file.path}`)
}

const supplementalEvidence = [
  'docs/UX40_Document_Switching_Performance_Audit_2026-08-06.md',
  'docs/UX41_Horizontal_Wheel_Navigation_Audit_2026-08-06.md',
  'docs/UX42_Table_Board_Experience_Audit_2026-08-06.md',
  'docs/UX43_Media_Workspace_Audit_2026-08-06.md',
  'docs/Select_Control_Visual_Audit_2026-08-06.md',
  'docs/UX47_Managed_Automatic_Update_Audit_2026-08-06.md',
  'docs/UX48_Command_Strip_Overflow_Audit_2026-08-06.md',
  'docs/UX49_Streaming_Media_Workspace_Audit_2026-08-06.md',
  'docs/evidence/ux37b-knowledge-graph-canvas/manifest.json',
  'docs/evidence/ux35-file-tree-preview/manifest.json',
]
if (supplementalEvidence.length !== closure.experienceClosure.supplementalRequirementGroups) fail('supplemental requirement count drift')
for (const file of supplementalEvidence) if (!fs.existsSync(file)) fail(`supplemental evidence is missing: ${file}`)

for (const token of [
  "import('./check-ea5c-external-open-closure.mjs')",
  "import('./check-default-app-installed-lifecycle-harness.mjs')",
]) if (!currentAudit.includes(token)) fail(`current development audit is missing ${token}`)
if (!pkg.scripts?.['check:ea5c-external-open-closure']) fail('EA-5C package script is missing')
if (!alignment.includes('当前阶段：**EA-5C 外部打开与体验有界收口完成**')) fail('development alignment is stale')

for (const [name, workflow] of [['quality gate', qualityWorkflow], ['U2 lifecycle', lifecycleWorkflow]]) {
  if (!workflow.includes('actions/setup-node@v6') || workflow.includes('actions/setup-node@v4')) fail(`${name} still uses the deprecated Node 20 action runtime`)
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('EA-5C closure passed: 43 formats, 29 edit, 8 preview, 6 import, 37 user-selected default-app profiles, 41 completed UX requirements, and verified installed evidence.')
