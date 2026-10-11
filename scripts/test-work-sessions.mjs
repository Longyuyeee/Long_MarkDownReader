import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'
import { test } from 'node:test'
const exports = {}
vm.runInNewContext(ts.transpile(fs.readFileSync('src/utils/workSessions.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), { exports, crypto: webcrypto })
const { captureWorkSession, sessionTabs, belongsToLibrary, mergeSessionTabs, saveWorkSession, readWorkSessions, workSessionKey } = exports
const tab = (path, isDirty = false) => ({ id: path, path, title: path, isDirty, content: 'private draft' })
test('session capture excludes text, external files, traversal, duplicate and adjacent libraries', () => {
  const session = captureWorkSession('C:/notes', [tab('C:/notes/a.md'), tab('c:\\notes\\a.md'), tab('C:/notes2/b.md'), tab('C:/notes/../secret.md'), { ...tab('C:/notes/external.md'), external: true }], 'C:/notes/a.md', '项目')
  assert.equal(session.tabs.length, 1); assert.equal(JSON.stringify(session).includes('private draft'), false)
  assert.equal(belongsToLibrary('C:/notes', 'C:/notes2/a.md'), false)
})
test('dirty tabs survive switching including a matching file with different casing', () => {
  const dirty = tab('C:/NOTES/a.md', true)
  const next = mergeSessionTabs([dirty, tab('C:/notes/clean.md')], sessionTabs('C:/notes', [tab('c:/notes/a.md'), tab('C:/notes/b.md')]))
  assert.equal(next.length, 2); assert.equal(next[1], dirty)
})
test('roundtrip isolates roots, preserves invalid records, and reports failed saves', () => {
  const entries = new Map(), storage = { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) }
  const session = captureWorkSession('C:/notes', [tab('C:/notes/a.md')], null, '项目')
  saveWorkSession(storage, session)
  assert.equal(readWorkSessions(storage, 'C:/other').length, 0)
  assert.equal(readWorkSessions(storage, 'c:\\notes')[0].name, '项目')
  assert.throws(() => saveWorkSession(storage, session), /同名/)
  const before = entries.get(workSessionKey('C:/notes'))
  assert.throws(() => saveWorkSession({ ...storage, setItem: () => { throw Error('quota') } }, { ...session, name: '另一个' }), /quota/)
  assert.equal(entries.get(workSessionKey('C:/notes')), before)
  entries.set(workSessionKey('C:/notes'), '{broken')
  assert.throws(() => readWorkSessions(storage, 'C:/notes'))
  assert.equal(entries.get(workSessionKey('C:/notes')), '{broken')
})

test('actual store restores scoped tabs and safely filters legacy mixed-library state', () => {
  const entries = new Map(), localStorage = { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }
  const source = fs.readFileSync('src/store/app.ts', 'utf8').replace(/\r\n/g, '\n')
  const methods = source.slice(source.indexOf('    saveTabsState() {'), source.lastIndexOf('\n  }\n})'))
  const ctx = vm.createContext({ ...exports, localStorage, TABS_STORAGE_KEY: 'longedit_tabs_state' })
  vm.runInContext(ts.transpile('globalThis.actions = ({' + methods + '})', { target: ts.ScriptTarget.ES2022 }), ctx)
  const store = { ...ctx.actions, activeLibraryPath: 'C:/notes', tabs: [], activeTabId: null, recentFiles: [], starredFiles: [] }
  entries.set('longedit_tabs_state', JSON.stringify({ tabs: [tab('C:/notes/a.md'), tab('C:/other/b.md')], activeTabId: 'C:/other/b.md', recentFiles: [tab('C:/other/b.md')], starredFiles: ['C:/other/b.md'] }))
  store.restoreTabsState()
  assert.equal(store.tabs.length, 1); assert.equal(store.activeTabId, 'C:/notes/a.md'); assert.equal(store.recentFiles.length, 0)
  assert.equal(store.tabs[0].content, undefined)
  store.saveTabsState()
  assert.ok(entries.has(exports.libraryTabsKey('C:/notes')))
  assert.ok(entries.has('longedit_tabs_state'))
  store.activeLibraryPath = 'C:/other'; store.restoreTabsState()
  assert.equal(store.tabs[0].path, 'C:/other/b.md')
  entries.set(exports.libraryTabsKey('C:/other'), '{broken'); store.restoreTabsState()
  assert.equal(entries.get(exports.libraryTabsKey('C:/other')), '{broken')
})
