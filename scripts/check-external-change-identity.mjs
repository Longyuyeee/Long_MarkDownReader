import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} is missing: ${token}`)
}

const rustText = read('src-tauri/src/formats/text.rs')
requireTokens(rustText, 'Text identity kernel', [
  'pub struct TextDocumentIdentity',
  'pub content_digest: String',
  'pub modified_nanos: String',
  'pub fn read_text_identity',
  'md5::compute(bytes)',
  'identity_changes_when_same_size_content_changes',
])

const rustCommands = read('src-tauri/src/commands/formats.rs')
requireTokens(rustCommands, 'Text identity command', [
  'pub async fn get_text_document_identity',
  'ensure_matching_format(&path, &format_id)',
  'read_text_identity(&path)',
])

const library = read('src/views/LibraryMode.vue')
requireTokens(library, 'External-change UX', [
  "invoke<TextDocumentIdentity>('get_text_document_identity'",
  'contentDigestFromSignature(tab.textSignature)',
  'identity.contentDigest === baselineDigest',
  'externalCheckInFlight || externalChange.show',
  'identity.signature === lastPromptedExternalSignature',
  '检测时间：{{ externalChange.detectedAt }}',
  '@click="compareExternalChange"',
  '@click="keepExternalChange"',
  '@click="reloadExternalChange"',
  'current.textContentDigest = saved.contentDigest',
])
if (library.includes('stats.modified > lastKnownModified')) fail('Legacy mtime-only focus detection is still active.')
if ((library.match(/lastKnownModified/g) || []).length) fail('Guessed wall-clock modification baselines are still present.')

const store = read('src/store/app.ts')
requireTokens(store, 'Tab identity baseline', ['textContentDigest?: string', 'existing.textContentDigest = tab.textContentDigest'])

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!/\| UX-23 \|[^\n]+\| 待复测 \|/.test(audit)) fail('UX-23 must remain pending installed-build retest.')

console.log('External text changes use exact content identity, save receipts, one-signature dedupe, and compare/reload/keep actions.')
