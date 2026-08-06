import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} token missing: ${token}`)
  }
}

const config = read('src-tauri/src/commands/config.rs')
requireTokens(config, 'Markdown configuration migration', [
  'pub editor_mode_explicit: bool',
  'editor_mode: "wysiwyg".into()',
  'editor_mode_explicit: false',
  'fn normalize_editor_mode(config: &mut AppConfig) -> bool',
  'config.editor_mode_explicit && supported',
  'let mut config_changed = normalize_editor_mode(&mut config)',
  'normalize_editor_mode(&mut config);',
  'legacy_editor_mode_migrates_to_wysiwyg_until_user_selects_a_mode',
])

const store = read('src/store/app.ts')
requireTokens(store, 'Markdown preference state', [
  'editorModeExplicit: false',
  'this.editorModeExplicit = config.editorModeExplicit === true',
  "this.editorMode = this.editorModeExplicit && ['wysiwyg', 'ir', 'sv'].includes(config.editorMode)",
  "? config.editorMode\n            : 'wysiwyg'",
  'editorModeExplicit: this.editorModeExplicit',
])

for (const [path, label, modeToken] of [
  [
    'src/views/LibraryMode.vue',
    'Library Markdown editor',
    'mode: desiredVditorMode()',
  ],
  ['src/views/TempMode.vue', 'External Markdown editor', "mode: store.editorMode || 'wysiwyg'"],
]) {
  const source = read(path)
  requireTokens(source, label, [
    modeToken,
    'syncUserSelectedVditorMode',
    "closest('[data-type=\"edit-mode\"]')",
    'editorModeExplicit: true',
  ])
}

const library = read('src/views/LibraryMode.vue')
requireTokens(library, 'Library Markdown runtime mode alignment', [
  'const desiredVditorMode =',
  "return format?.id === 'markdown' ? store.editorMode || 'wysiwyg' : 'sv'",
  'const ensureVditorModeForFile =',
  'vditor.getCurrentMode() === desiredMode',
  '!ensureVditorModeForFile(t.path)',
])

const backup = read('src-tauri/src/commands/backup.rs')
requireTokens(backup, 'Portable preference backup', [
  '#[serde(default)]\n    editor_mode_explicit: bool',
  'editor_mode_explicit: config.editor_mode_explicit',
  'editor_mode_explicit: redacted.editor_mode_explicit',
])

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!/\| UX-19 \|[^\n]+\| 待复测 \|/.test(audit)) {
  fail('UX-19 must remain recorded as pending installed-build retest.')
}

console.log('Markdown WYSIWYG default, legacy migration, explicit preference, and backup contract passed.')
