import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}

const policy = JSON.parse(read('shared/data-resilience-policy.json'))
if (policy.schemaVersion !== 1 || policy.stage !== 'R3') fail('R3 policy identity mismatch.')
if (policy.releaseCandidate !== false) fail('R3 must not mark the product as a release candidate.')
if (policy.nextStage !== 'R3B') fail('R3A handoff must point to R3B.')

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
for (const id of ['R3B', 'R3C', 'R3D']) {
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

const audit = read('docs/R3A_Knowledge_Index_Recovery_Audit_2026-07-30.md')
for (const token of ['R3A', '损坏索引', '隔离', 'R3B', 'releaseCandidate=false']) {
  if (!audit.includes(token)) fail(`R3A audit token missing: ${token}`)
}

console.log('R3 data resilience contract passed: R3A index recovery implemented, R3B/R3C/R3D remain planned, privacy exclusions fixed.')
