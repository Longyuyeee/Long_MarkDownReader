import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const code = source.slice(source.indexOf('const fetchHistory = async'), source.indexOf('const formatTime ='))
function setup() {
  const requests = [], values = [], messages = []
  const ctx = vm.createContext({
    historyGeneration: 0, historyList: { value: [] }, activeTabId: { value: 'A' }, store: { libraryPath: 'root', updateTabContent: () => {} }, wordCount: { value: 0 },
    vditor: { setValue: value => values.push(value) }, isVditorReady: true, lastLoadedPath: 'A', tabs: { value: [{ path: 'A', isDirty: false }] },
    activeFormatCanEdit: { value: true }, hasPendingMainTextSave: () => false,
    message: Object.fromEntries(['error', 'success', 'warning'].map(type => [type, value => messages.push({ type, value })])),
    invoke: (command, args) => new Promise((resolve, reject) => requests.push({ command, args, resolve, reject })),
    dialog: {},
  })
  vm.runInContext(ts.transpile(code + '\nglobalThis.actions = { fetchHistory, restoreHistory, deleteHistory }', { target: ts.ScriptTarget.ES2022 }), ctx)
  return { ctx, requests, values, messages, ...ctx.actions }
}
test('late history of A cannot populate B, even when timestamps collide', async () => {
  const x = setup(), a = x.fetchHistory()
  x.ctx.activeTabId.value = 'B'; const b = x.fetchHistory()
  x.requests[1].resolve([[1, 'B正文']]); await b
  x.requests[0].resolve([[1, 'A正文']]); await a
  assert.equal(x.ctx.historyList.value[0].content, 'B正文')
  assert.equal(x.ctx.historyList.value[0].path, 'B')
})
test('closed file and late failures cannot change the new context', async () => {
  const x = setup(), a = x.fetchHistory()
  x.ctx.activeTabId.value = null; await x.fetchHistory()
  x.requests[0].reject(Error('old failure')); await a
  assert.equal(x.messages.length, 0); assert.equal(x.ctx.historyList.value.length, 0)
})
test('restore rejects stale entries, loading editors, read-only and pending writes', async () => {
  const x = setup(), load = x.fetchHistory(); x.requests[0].resolve([[1, '历史正文']]); await load
  const entry = x.ctx.historyList.value[0]
  x.ctx.lastLoadedPath = 'B'; x.restoreHistory(entry)
  x.ctx.lastLoadedPath = 'A'; x.ctx.activeFormatCanEdit.value = false; x.restoreHistory(entry)
  x.ctx.activeFormatCanEdit.value = true; x.ctx.hasPendingMainTextSave = () => true; x.restoreHistory(entry)
  x.ctx.hasPendingMainTextSave = () => false; x.restoreHistory({ ...entry })
  assert.equal(x.values.length, 0)
  x.restoreHistory(entry); assert.deepEqual(x.values, ['历史正文'])
  assert.equal(x.ctx.tabs.value[0].isDirty, true)
  assert.match(x.messages.at(-1).value, /尚未保存/)
  assert.equal(x.requests.length, 1)
})
test('delete is bound to its source and cannot refresh a different document', async () => {
  const x = setup(), load = x.fetchHistory(); x.requests[0].resolve([[1, 'A正文']]); await load
  const entry = x.ctx.historyList.value[0], deletion = x.deleteHistory(entry)
  x.ctx.activeTabId.value = 'B'; x.ctx.historyList.value = []
  x.requests[1].resolve(); await deletion
  assert.equal(x.requests[1].args.path, 'A'); assert.equal(x.requests.length, 2)
  await x.deleteHistory(entry); assert.equal(x.requests.length, 2)
})
