import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}

const policy = JSON.parse(read('shared/data-resilience-policy.json'))
if (policy.schemaVersion !== 1 || policy.stage !== 'R3') fail('R3 policy identity mismatch.')
if (policy.releaseCandidate !== false) fail('R3 must not mark the product as a release candidate.')
if (policy.nextStage !== 'R3C') fail('R3B handoff must point to R3C.')

const phases = new Map(policy.phases.map(phase => [phase.id, phase]))
const r3a = phases.get('R3A')
if (!r3a || r3a.status !== 'implemented') fail('R3A must be implemented in the policy.')
for (const capability of [
  'queryable-index-state',
  'corrupt-snapshot-detection',
  'corrupt-snapshot-quarantine',
  'stale-source-count',
  'safe-rebuild-after-quarantine',
]) {
  if (!r3a.capabilities.includes(capability)) fail(`R3A capability missing: ${capability}`)
}
const r3b = phases.get('R3B')
if (!r3b || r3b.status !== 'implemented') fail('R3B must be implemented in the policy.')
for (const capability of [
  'versioned-backup-manifest',
  'settings-export',
  'library-metadata-export',
  'capability-contract-export',
  'content-exclusion-by-default',
  'path-and-remote-fingerprints',
]) {
  if (!r3b.capabilities.includes(capability)) fail(`R3B capability missing: ${capability}`)
}
for (const id of ['R3C', 'R3D']) {
  if (phases.get(id)?.status !== 'planned') fail(`${id} must remain planned after R3A.`)
}
for (const forbidden of ['document-body', 'api-key', 'absolute-user-path', 'recoverable-cache-body']) {
  if (!policy.forbiddenByDefault.includes(forbidden)) fail(`R3 privacy forbidden item missing: ${forbidden}`)
}

const service = read('src-tauri/src/services/knowledge_index.rs')
for (const token of [
  'KnowledgeIndexRecoveryReport',
  'recover_index_cache',
  'QUARANTINED_INDEX_PREFIX',
  'recovery_available',
  'stale_source_count',
  'corrupt_snapshot_can_be_quarantined_without_deleting_evidence',
]) {
  if (!service.includes(token)) fail(`Knowledge index recovery token missing: ${token}`)
}

const commands = read('src-tauri/src/commands/index.rs')
if (!commands.includes('recover_knowledge_index_cache')) fail('Tauri recovery command is not registered in commands/index.rs.')
const lib = read('src-tauri/src/lib.rs')
if (!lib.includes('recover_knowledge_index_cache')) fail('Tauri recovery command is not exposed in lib.rs.')

const libraryMode = read('src/views/LibraryMode.vue')
for (const token of ['recoverKnowledgeIndex', 'recoveryAvailable', 'staleSourceCount', '隔离损坏索引']) {
  if (!libraryMode.includes(token)) fail(`Library index recovery UI token missing: ${token}`)
}

const backup = read('src-tauri/src/commands/backup.rs')
for (const token of [
  'export_management_backup',
  'ManagementBackupReceipt',
  'config.redacted.json',
  'path_fingerprint',
  'git_remote_fingerprint',
  'management_backup_excludes_paths_and_credentials',
]) {
  if (!backup.includes(token)) fail(`R3B backup export token missing: ${token}`)
}

const settings = read('src/views/SettingsView.vue')
for (const token of ['exportManagementBackup', '管理备份', '不包含文档正文或凭据']) {
  if (!settings.includes(token)) fail(`R3B settings UI token missing: ${token}`)
}

const libRs = read('src-tauri/src/lib.rs')
if (!libRs.includes('export_management_backup')) fail('R3B backup command is not exposed in lib.rs.')

const audit = read('docs/R3A_Knowledge_Index_Recovery_Audit_2026-07-30.md')
for (const token of ['R3A', '损坏索引', '隔离', 'R3B', 'releaseCandidate=false']) {
  if (!audit.includes(token)) fail(`R3A audit token missing: ${token}`)
}
const r3bAudit = read('docs/R3B_Management_Backup_Export_Audit_2026-07-30.md')
for (const token of ['R3B', '管理备份', 'config.redacted.json', 'R3C', 'releaseCandidate=false']) {
  if (!r3bAudit.includes(token)) fail(`R3B audit token missing: ${token}`)
}

console.log('R3 data resilience contract passed: R3A index recovery and R3B backup export implemented; R3C/R3D remain planned.')
