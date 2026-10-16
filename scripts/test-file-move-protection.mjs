import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { test } from 'node:test'
const compile = (file, dependencies, globals = {}) => {
  const sandbox = { exports: {}, require: name => { assert.ok(name in dependencies, name); return dependencies[name] }, ...globals }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox)
  return sandbox.exports
}
const paths = compile('src/utils/fileDisplayStyles.ts', {})
function fixture() {
  const drafts = compile('src/services/windowDrafts.ts', { vue: Vue }), calls = [], listeners = new Map(), timers = new Map()
  let sequence = 0, response = { active: true, notice: null }, focused = false
  const body = { inert: false, style: { cursor: 'default' } }, focus = { isConnected: true, focus: () => { focused = true } }
  const api = compile('src/services/fileMoveProtection.ts', { '../utils/fileDisplayStyles': paths, './windowDrafts': drafts, './tauriRuntime': { invoke: async (command, args) => { calls.push({ command, args }); return response } } }, { document: { body, activeElement: focus, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }, setInterval: fn => { timers.set(++sequence, fn); return sequence }, clearInterval: id => timers.delete(id), Set, Map })
  return { drafts, api, calls, body, listeners, timers, setResponse: value => { response = value }, focused: () => focused }
}
test('fresh snapshots reject affected drafts but allow unrelated unsaved work and path aliases', async () => {
  const f = fixture(), scope = Vue.effectScope(); let captured = false
  scope.run(() => f.drafts.useWindowDraftSnapshot(() => { captured = true }))
  const bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => captured ? ['C:/Lib/Incoming.MD', 'C:/Other/Draft.md'] : [], completed: async () => {} })
  await bridge.protect({ requestId: 'one', paths: ['\\\\?\\C:\\LIB\\incoming.md'] })
  assert.deepEqual(Array.from(f.calls[0].args.dirtyPaths), ['Incoming.MD']); assert.equal(f.body.inert, true)
  await bridge.release({ requestId: 'one' }); assert.equal(f.body.inert, false); assert.ok(f.focused())
  await bridge.protect({ requestId: 'two', paths: ['C:/Lib/another.md'] }); assert.equal(f.calls.at(-1).args.dirtyPaths.length, 0)
  await bridge.release({ requestId: 'two' }); bridge.dispose(); scope.stop()
})
test('specialized drafts participate by current path and dispose without keeping a stale block', async () => {
  const f = fixture(), scope = Vue.effectScope(); const dirty = Vue.ref(true)
  scope.run(() => f.drafts.useWindowDraft(() => dirty.value, () => 'C:/Lib/sub/book.xlsx'))
  const bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => [], completed: async () => {} })
  await bridge.protect({ requestId: 'one', paths: ['C:/Lib/sub'] }); assert.deepEqual(Array.from(f.calls[0].args.dirtyPaths), ['book.xlsx']); await bridge.release({ requestId: 'one' })
  scope.stop(); await bridge.protect({ requestId: 'two', paths: ['C:/Lib/sub'] }); assert.equal(f.calls.at(-1).args.dirtyPaths.length, 0); await bridge.release({ requestId: 'two' }); bridge.dispose()
})
test('a save in flight refuses execution while the originating move still counts for close protection', async () => {
  const f = fixture(), bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => [], completed: async () => {} })
  const finishMove = f.drafts.beginWindowSave('relocation'); assert.ok(f.drafts.windowDraftCount.value > 0)
  await bridge.protect({ requestId: 'one', paths: ['C:/Lib/a.md'] }); assert.equal(f.calls[0].args.ready, true); await bridge.release({ requestId: 'one' })
  const finishSave = f.drafts.beginWindowSave(); await bridge.protect({ requestId: 'two', paths: ['C:/Lib/a.md'] }); assert.equal(f.calls.at(-1).args.ready, false); await bridge.release({ requestId: 'two' })
  finishSave(); finishMove(); assert.equal(f.drafts.windowDraftCount.value, 0); bridge.dispose()
})
test('composition and keyboard actions cannot add an unobserved edit after the acknowledgement', async () => {
  const f = fixture(), bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => [], activePath: () => 'C:/Lib/a.md', completed: async () => {} })
  f.listeners.get('compositionstart')(); await bridge.protect({ requestId: 'one', paths: ['C:/Lib/a.md'] }); assert.deepEqual(Array.from(f.calls[0].args.dirtyPaths), ['a.md'])
  const stopped = []; f.listeners.get('keydown')({ preventDefault: () => stopped.push('prevented'), stopImmediatePropagation: () => stopped.push('stopped') }); assert.deepEqual(stopped, ['prevented', 'stopped'])
  await bridge.release({ requestId: 'one' }); bridge.dispose(); assert.equal(f.listeners.size, 0)
})
test('refresh finishes before native release acknowledgement and the next batch item', async () => {
  const f = fixture(); let resume; const refresh = new Promise(resolve => resume = resolve)
  const bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => [], completed: async () => refresh })
  await bridge.protect({ requestId: 'one', paths: ['C:/Lib/a.md'] }); const release = bridge.release({ requestId: 'one', notice: { oldPath: 'a', newPath: 'b', documents: [] } })
  assert.equal(f.body.inert, true); assert.equal(f.calls.filter(c => c.command === 'acknowledge_file_move_release').length, 0)
  resume(); await release; assert.equal(f.body.inert, false); assert.equal(f.calls.at(-1).command, 'acknowledge_file_move_release'); bridge.dispose()
})
test('lost release events use the native receipt to refresh once and restore interaction', async () => {
  const f = fixture(); let refreshes = 0
  const bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => [], completed: async () => { refreshes++ } })
  await bridge.protect({ requestId: 'one', paths: ['C:/Lib/a.md'] }); f.setResponse({ active: false, notice: { oldPath: 'a', newPath: 'b', documents: [] } })
  Array.from(f.timers.values())[0](); await new Promise(resolve => setImmediate(resolve)); assert.equal(refreshes, 1); assert.equal(f.body.inert, false); assert.equal(f.timers.size, 0); bridge.dispose()
})
test('path continuation retains filename case and excludes similarly named siblings', () => {
  const f = fixture(), notice = { oldPath: '\\\\?\\C:\\Lib\\Folder', newPath: '\\\\?\\C:\\Lib\\Archive\\Folder' }
  assert.equal(f.api.movedPath('C:/LIB/Folder/Sub/Note.MD', notice), '\\\\?\\C:\\Lib\\Archive\\Folder/Sub/Note.MD')
  assert.equal(f.api.movedPath('C:/Lib/Folder-extra/Note.MD', notice), 'C:/Lib/Folder-extra/Note.MD')
})
test('a cached Markdown draft follows a move when the native operation never rewrites its body', async () => {
  const f = fixture(), bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => ['C:/Lib/a.md'], retainedDraftPaths: () => ['C:/Lib/a.md'], completed: async () => {} })
  await bridge.protect({ requestId: 'one', paths: ['C:/Lib/a.md', 'C:/Lib/new.md'], sourcePaths: ['C:/Lib/a.md'], rewritePaths: [] })
  assert.equal(f.calls[0].args.dirtyPaths.length, 0); await bridge.release({ requestId: 'one' })
  await bridge.protect({ requestId: 'two', paths: ['C:/Lib/a.md'], sourcePaths: ['C:/Lib/a.md'], rewritePaths: ['C:/Lib/a.md'] })
  assert.deepEqual(Array.from(f.calls.at(-1).args.dirtyPaths), ['a.md']); await bridge.release({ requestId: 'two' }); bridge.dispose()
})
test('a dirty cached target from a deleted file is never mistaken for the moving draft', async () => {
  const f = fixture(), bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => ['C:/Lib/new.md'], retainedDraftPaths: () => ['C:/Lib/new.md'], completed: async () => {} })
  await bridge.protect({ requestId: 'one', paths: ['C:/Lib/a.md', 'C:/Lib/new.md'], sourcePaths: ['C:/Lib/a.md'], rewritePaths: [] })
  assert.deepEqual(Array.from(f.calls[0].args.dirtyPaths), ['new.md']); await bridge.release({ requestId: 'one' }); bridge.dispose()
})
test('fresh reference drafts include unsaved-only incoming links and exclude another library', async () => {
  const f = fixture(), scope = Vue.effectScope(); let content = 'saved'
  scope.run(() => f.drafts.useWindowDraftSnapshot(() => { content = '![new](pic.png)' }))
  const bridge = f.api.createFileMoveProtection({ ready: () => true, dirtyPaths: () => ['C:/Lib/note.md'], referenceDrafts: () => [{ path: 'C:/Lib/note.md', content }, { path: 'C:/Other/private.md', content: 'other draft' }], completed: async () => {} })
  await bridge.protect({ requestId: 'one', libraryRoot: 'C:/LIB', paths: ['C:/Lib/pic.png', 'C:/Lib/new.png'] })
  assert.equal(f.calls[0].args.dirtyPaths.length, 0)
  assert.equal(f.calls[0].args.drafts.length, 1); assert.equal(f.calls[0].args.drafts[0].content, '![new](pic.png)')
  await bridge.release({ requestId: 'one' }); bridge.dispose(); scope.stop()
})
