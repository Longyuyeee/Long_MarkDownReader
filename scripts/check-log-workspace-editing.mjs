import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const registry = JSON.parse(read('shared/file-formats.json'))
const release = JSON.parse(read('shared/release-capability-matrix.json'))
const degradation = JSON.parse(read('shared/safe-degradation-contract.json'))
const frontend = read('src/views/LogViewerView.vue')
const backend = read('src-tauri/src/commands/formats.rs')
const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
const log = registry.formats.find(format => format.id === 'log')

if (!log || log.capabilities.edit !== 'supported' || log.adapters.writer !== 'text'
  || log.userCapability.level !== 'basic-edit' || log.userCapability.saveMode !== 'overwrite') {
  fail('LOG registry must declare guarded source editing.')
}
if (release.formats.find(format => format.id === 'log')?.profile !== 'professional-log') {
  fail('LOG release mapping must use professional-log.')
}
const overwriteLane = degradation.lanes.find(lane => lane.id === 'signature-protected-overwrite')
if (!overwriteLane?.formats.includes('log') || !overwriteLane.profiles.includes('professional-log')) {
  fail('LOG must remain in the signature-protected overwrite lane.')
}

requireTokens(frontend, 'LOG workspace', [
  "'read_text_document_range'", 'readTailRange', 'pollForUpdates', 'LEVEL_PATTERNS',
  'MAX_BUFFER_CHARS', 'MAX_LOG_EDIT_BYTES', "workspaceMode === 'viewer'",
  "workspaceMode === 'editor'", '...codeMirrorThemeExtensions', 'runUndo', 'runRedo',
  "'write_log_document'", 'expectedSignature: signature.value', 'acknowledgedOverwrite: true',
  "listen('command-save'", '只有点击保存才会覆盖源日志',
])
requireTokens(backend, 'LOG guarded writer', [
  'MAX_LOG_EDIT_BYTES', 'pub async fn write_log_document', 'acknowledged_overwrite: bool',
  'log-overwrite-not-acknowledged', 'log-edit-too-large', 'expected_signature',
  'if format_id == "log"', 'specialized-writer-required',
])
if (!/\| UX-29 \|[^\n]+\| 待复测 \|/.test(audit)) fail('UX-29 must be recorded as pending installed-build retest.')

console.log('LOG professional viewer and guarded editor contract passed.')
