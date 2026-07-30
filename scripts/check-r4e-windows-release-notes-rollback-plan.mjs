import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const requireIncludes = (label, values, expected) => {
  for (const value of expected) {
    if (!values.includes(value)) fail(`${label} missing: ${value}`)
  }
}

const packageJson = json('package.json')
const readiness = json('shared/windows-release-readiness-policy.json')
const lifecycle = json('shared/windows-lifecycle-policy.json')
const artifactManifest = json('shared/windows-release-artifact-manifest.json')
const signingEvidence = json('shared/windows-release-signing-evidence.json')
const vmEvidence = json('shared/windows-release-vm-matrix-evidence.json')
const plan = json('shared/windows-release-notes-rollback-plan.json')
const releaseMatrix = json('shared/release-capability-matrix.json')

if (plan.schemaVersion !== 1 || plan.stage !== 'R4E') fail('R4E release notes/rollback plan identity mismatch.')
if (plan.releaseCandidate !== false) fail('R4E must remain non-RC.')
if (plan.appVersion !== packageJson.version) fail('R4E appVersion must match package.json.')
if (plan.scope !== 'release-notes-and-rollback-plan-evidence') fail('R4E scope mismatch.')
if (plan.currentStatus !== 'release-notes-and-rollback-defined-but-evidence-incomplete') fail('R4E status mismatch.')
if (plan.promotionEligible !== false) fail('R4E plan must not be promotion eligible.')
if (plan.nextStage !== 'R4F') fail('R4E handoff must point to R4F.')

if (readiness.stage !== 'R4' || readiness.releaseCandidate !== false) fail('R4 readiness baseline must remain non-RC.')
if (readiness.nextStage !== 'R4F') fail('R4 readiness policy must hand off to R4F after R4E.')
if (readiness.releaseNotes.currentStatus !== 'release-notes-and-rollback-defined-but-evidence-incomplete') {
  fail('R4 readiness release notes status mismatch.')
}
if (readiness.releaseNotes.evidenceManifest !== 'shared/windows-release-notes-rollback-plan.json') {
  fail('R4 readiness release notes evidence manifest link missing.')
}
if (readiness.rollbackPlan.currentStatus !== 'rollback-plan-defined-but-not-vm-validated') {
  fail('R4 readiness rollback plan status mismatch.')
}
if (readiness.rollbackPlan.evidenceManifest !== 'shared/windows-release-notes-rollback-plan.json') {
  fail('R4 readiness rollback plan evidence manifest link missing.')
}
if (releaseMatrix.releaseCandidate !== false) fail('Public release capability matrix must remain non-RC.')

requireIncludes('R4E capability summary', plan.releaseNotes.capabilitySummary, [
  'daily-management-workspace',
  'markdown-and-text-editing',
  'txt-json-dev-format-editing',
  'pdf-reading-sidecar-ocr-annotations-page-ops',
  'diagram-mindmap-canvas-opml-management',
  'xlsx-workbook-bounded-editing',
  'docx-pptx-limited-office-copy-editing',
  'wps-and-legacy-office-guarded-external-or-conversion-workflows',
  'knowledge-graph-index-recovery-backup-restore-diagnostics',
])

requireIncludes('R4E known limitation', plan.releaseNotes.knownLimitations, [
  'pdf-body-equivalent-editing-not-supported',
  'wps-native-body-editing-not-supported',
  'legacy-binary-office-editing-requires-compatible-office-conversion',
  'unsigned-historical-installers-not-promotable',
  'windows-vm-results-missing',
])

requireIncludes('R4E install/upgrade warning', plan.releaseNotes.installAndUpgradeWarnings, [
  'only-md-and-markdown-file-associations-are-claimed',
  'external-dependency-formats-are-not-claimed-as-windows-defaults',
  'knowledge-libraries-are-external-user-data-and-must-not-be-deleted-by-uninstall',
  'debug-or-unsigned-installers-must-not-be-advertised-as-official-release',
])

if (plan.rollbackPlan.strategy !== 'preserve-user-data-uninstall-or-reinstall-previous-known-good') fail('R4E rollback strategy mismatch.')
requireIncludes('R4E rollback step', plan.rollbackPlan.steps, [
  'export-management-backup-before-upgrade',
  'verify-backup-manifest-and-content-exclusion',
  'uninstall-current-app-without-deleting-external-knowledge-libraries',
  'install-previous-known-good-build',
  'restore-management-backup-with-library-path-remapping',
  'rebuild-knowledge-index-if-cache-is-stale-or-corrupt',
  'reopen-markdown-json-pdf-diagram-workbook-office-sample-files',
])
requireIncludes('R4E rollback evidence requirement', plan.rollbackPlan.requiredEvidenceBeforeRc, [
  'rollback-procedure-run-on-windows-10-x64',
  'rollback-procedure-run-on-windows-11-x64',
  'backup-restore-after-rollback',
  'knowledge-index-recovery-after-rollback',
])

if (plan.dataRetentionNotes.sourceOfTruth !== 'shared/windows-lifecycle-policy.json') fail('R4E data retention source mismatch.')
for (const key of ['knowledgeLibraries', 'appConfig', 'appCache']) {
  if (plan.dataRetentionNotes[key] !== lifecycle.dataLifecycle[key]) fail(`R4E data retention mismatch: ${key}`)
}
if (plan.dataRetentionNotes.diagnosticBundlesMustRemainRedacted !== true) fail('R4E diagnostics must remain redacted.')
if (plan.dataRetentionNotes.managementBackupsMustExcludeDocumentBodiesByDefault !== true) fail('R4E backups must exclude document bodies by default.')

requireIncludes('R4E final RC promotion checklist', plan.finalRcPromotionChecklist, [
  'fresh-build-from-release-tag',
  'installer-hash-manifest',
  'valid-authenticode-signature',
  'timestamp-certificate-present',
  'accepted-certificate-subject-defined',
  'windows-vm-matrix-complete',
  'release-notes-reviewed',
  'rollback-plan-validated',
  'data-retention-policy-reviewed',
  'known-limitations-reviewed',
  'release-capability-matrix-updated-only-after-evidence',
])
requireIncludes('R4E blocker', plan.blockers, [
  'signing-evidence-currently-not-signed',
  'windows-vm-matrix-results-missing',
  'rollback-procedure-not-run-on-real-vm',
  'release-candidate-switch-not-approved',
])

if (artifactManifest.promotionEligible !== false) fail('R4E depends on non-promotable artifact manifest.')
if (signingEvidence.promotionEligible !== false || !signingEvidence.artifacts.every(item => item.releaseSigningState === 'not-signed')) {
  fail('R4E depends on not-signed, non-promotable signing evidence.')
}
if (vmEvidence.promotionEligible !== false || !vmEvidence.matrix.every(item => item.status === 'missing' && item.releaseBlocking === true)) {
  fail('R4E depends on missing, release-blocking VM evidence.')
}

const audit = read('docs/R4E_Windows_Release_Notes_Rollback_Audit_2026-07-30.md')
requireIncludes('R4E audit doc token', audit, [
  'R4E',
  'windows-release-notes-rollback-plan.json',
  'release-notes-and-rollback-defined-but-evidence-incomplete',
  'releaseCandidate=false',
  'R4F',
])

console.log('R4E Windows release notes and rollback plan passed: final RC documentation gates defined and still blocking release.')
