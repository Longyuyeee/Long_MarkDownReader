import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync('src/store/app.ts', 'utf8')
const start = source.indexOf('    async updateConfig(patch: any) {')
const end = source.indexOf('    async applyThemePreset', start)
const method = source.slice(start, end)
const displayExports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/config/displayPreferences.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: displayExports })
const { normalizeDisplayPreferences } = displayExports
const tick = () => new Promise(resolve => setImmediate(resolve))
function setup() {
  const pending = [], autostart = []
  const ctx = vm.createContext({
    normalizeDisplayPreferences,
    isTauriRuntime: () => true,
    enable: async () => autostart.push(true), disable: async () => autostart.push(false),
    invoke: (command, args) => new Promise((resolve, reject) => pending.push({ command, args, resolve, reject })),
  })
  vm.runInContext(ts.transpile('let configWritePromise = Promise.resolve(); globalThis.action = ({' + method + '}).updateConfig;', { target: ts.ScriptTarget.ES2022 }), ctx)
  const store = { activeLibraryPath: 'A', tabs: [{ path: 'A/note.md', isDirty: true, content: '未保存正文' }], activeTabId: 'A/note.md', relationObjectFocus: { path: 'A/note.md' }, libraries: [{ path: 'A' }, { path: 'B' }], savedSearches: [], theme: 'white', displayPreferences: normalizeDisplayPreferences(undefined), isAutostart: false, cleared: 0,
    get $state() { return this }, $patch(patch) { Object.assign(this, patch) }, clearTabsState() { this.cleared++ }, saveTabsState() {}, restoreTabsState() {},
  }
  return { store, pending, autostart, update: patch => ctx.action.call(store, patch) }
}
test('failed library persistence preserves tabs, drafts, active path and persisted tab state', async () => {
  const x = setup(), originalTabs = x.store.tabs
  const writing = x.update({ activeLibraryPath: 'B' })
  await tick(); assert.equal(x.store.activeLibraryPath, 'A'); assert.equal(x.store.tabs, originalTabs)
  x.pending[0].reject(Error('disk full'))
  await assert.rejects(writing, /disk full/)
  assert.equal(x.store.activeLibraryPath, 'A'); assert.equal(x.store.tabs[0].content, '未保存正文'); assert.equal(x.store.cleared, 0)
  const retry = x.update({ activeLibraryPath: 'B' }); await tick(); x.pending[1].resolve(); await retry
  assert.equal(x.store.activeLibraryPath, 'B'); assert.equal(x.store.tabs.length, 0); assert.equal(x.store.cleared, 0)
})
test('config snapshots are immutable and writes are ordered, failures do not poison queue', async () => {
  const x = setup(), patch = { theme: 'dark' }
  const first = x.update(patch); patch.theme = 'mutated'
  const second = x.update({ theme: 'white', codeTheme: 'new-theme' })
  await tick(); assert.equal(x.pending.length, 1); assert.equal(x.pending[0].args.config.theme, 'dark')
  x.pending[0].reject(Error('failed')); await assert.rejects(first)
  await tick(); assert.equal(x.pending.length, 2); assert.equal(x.store.theme, 'white')
  x.pending[1].resolve(); await second; assert.equal(x.store.codeTheme, 'new-theme')
})
test('autostart side effect is restored when persistence fails', async () => {
  const x = setup(), writing = x.update({ isAutostart: true })
  await tick(); assert.deepEqual(x.autostart, [true])
  x.pending[0].reject(Error('disk')); await assert.rejects(writing)
  assert.deepEqual(x.autostart, [true, false]); assert.equal(x.store.isAutostart, false)
})

test('a later partial write serializes the latest committed configuration', async () => {
  const x = setup()
  const first = x.update({ theme: 'dark' })
  const second = x.update({ codeTheme: 'new-theme' })
  await tick(); x.pending[0].resolve(); await first; await tick()
  assert.equal(x.pending[1].args.config.theme, 'dark')
  assert.equal(x.pending[1].args.config.codeTheme, 'new-theme')
  x.pending[1].resolve(); await second
  assert.equal(x.store.theme, 'dark')
})

test('display changes retain an immutable snapshot, preserve preferences on failure and survive a later partial write', async () => {
  const x = setup(), original = x.store.displayPreferences
  const choice = { documentStyle: 'paper', documentFont: 'serif', documentFontSize: 22, fileDensity: 'compact' }
  const patch = { displayPreferences: { ...choice } }
  const first = x.update(patch)
  patch.displayPreferences.documentFontSize = 28
  await tick()
  assert.equal(x.pending[0].args.config.displayPreferences.documentFontSize, 22)
  assert.equal(x.store.displayPreferences, original)
  x.pending[0].reject(Error('disk full'))
  await assert.rejects(first, /disk full/)
  assert.equal(x.store.displayPreferences, original)
  const retry = x.update({ displayPreferences: choice })
  const later = x.update({ theme: 'dark' })
  await tick(); x.pending[1].resolve(); await retry; await tick()
  assert.equal(x.pending[2].args.config.displayPreferences.documentFontSize, 22)
  assert.equal(x.pending[2].args.config.displayPreferences.documentFont, 'serif')
  assert.equal(x.pending[2].args.config.displayPreferences.fileDensity, 'compact')
  x.pending[2].resolve(); await later
  assert.equal(x.store.displayPreferences.documentFontSize, 22)
  assert.equal(x.store.theme, 'dark')
})
