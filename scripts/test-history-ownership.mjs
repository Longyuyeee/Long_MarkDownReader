import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const code = source.slice(source.indexOf('const fetchHistory = async'), source.indexOf('const clearAllHistory ='))
function setup() {
  const requests = [], values = [], messages = []
  const ctx = vm.createContext({
    historyGeneration: 0, historyList: { value: [] }, historyLoading:{value:false}, historyError:{value:''}, activeTabId: { value: 'A' }, store: { libraryPath: 'root', updateTabContent: () => {} }, wordCount: { value: 0 },
    vditor: { setValue: value => values.push(value), getValue: () => '当前草稿' }, isVditorReady: true, lastLoadedPath: 'A', tabs: { value: [{ path: 'A', isDirty: false }] },
    historyComparison: { value: null }, historyActionBusy: { value: false }, historyActionError: { value: '' }, comparisonGeneration: 0,
    closeHistoryComparison: () => { ctx.comparisonGeneration++; ctx.historyComparison.value = null }, confirmAppAction: async () => true,
    activeFormatCanEdit: { value: true }, hasPendingMainTextSave: () => false,
    message: Object.fromEntries(['error', 'success', 'warning'].map(type => [type, value => messages.push({ type, value })])),
    invoke: (command, args) => new Promise((resolve, reject) => requests.push({ command, args, resolve, reject })),
    dialog: {},
  })
  vm.runInContext(ts.transpile(code + '\nglobalThis.actions = { fetchHistory, restoreHistory, recoverHistory }', { target: ts.ScriptTarget.ES2022 }), ctx)
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
  const preview = x.restoreHistory(entry)
  assert.equal(x.requests[1].command, 'compare_history_version')
  x.requests[1].resolve({ content: '历史正文', disk: '磁盘正文', diskSignature: 'disk', historySignature: 'history' }); await preview
  assert.equal(x.values.length, 0)
  const recovery = x.recoverHistory('replace'); await new Promise(resolve => setImmediate(resolve))
  assert.equal(x.requests[2].command, 'prepare_history_restore')
  assert.equal(x.requests[2].args.currentDraft, '当前草稿')
  x.requests[2].resolve('历史正文'); await recovery
  assert.deepEqual(x.values, ['历史正文'])
  assert.equal(x.ctx.tabs.value[0].isDirty, true)
  assert.match(x.messages.at(-1).value, /尚未保存/)
  assert.equal(x.requests[3].command, 'list_history')
})
test('delete is bound to its source and cannot refresh a different document', async () => {
  const component = fs.readFileSync('src/components/HistoryVersionList.vue','utf8')
  const code = component.slice(component.indexOf('const selectAction ='),component.indexOf('const saveNote ='))
  const requests=[], emitted=[]
  const ctx=vm.createContext({menu:{timestamp:1,show:true},metadata:{value:{}},props:{path:'A',libraryRoot:'root'},generation:1,disposed:false,dialog:{},confirmAppAction:async()=>true,emit:(...a)=>emitted.push(a),message:{error:()=>{}},invoke:(command,args)=>new Promise(resolve=>requests.push({command,args,resolve}))})
  vm.runInContext(ts.transpile(code+'\nglobalThis.run=selectAction',{target:ts.ScriptTarget.ES2022}),ctx)
  const deletion=ctx.run('delete'); await new Promise(resolve=>setImmediate(resolve))
  ctx.props.path='B'; ctx.generation++
  requests[0].resolve(); await deletion
  assert.equal(requests[0].args.path,'A'); assert.equal(requests[0].args.libraryRoot,'root'); assert.deepEqual(emitted,[])
})

test('draft changes during protection and protection errors never replace the editor', async () => {
  const x = setup(), load = x.fetchHistory(); x.requests[0].resolve([[1, '历史正文']]); await load
  const entry = x.ctx.historyList.value[0], preview = x.restoreHistory(entry)
  x.requests[1].resolve({ content: '历史正文', disk: '磁盘', diskSignature: 'd', historySignature: 'h' }); await preview
  let recovery = x.recoverHistory('replace'); await new Promise(resolve => setImmediate(resolve))
  x.requests[2].reject(Error('保护失败')); await recovery
  assert.equal(x.values.length, 0); assert.match(x.ctx.historyActionError.value, /保护失败/)
  recovery = x.recoverHistory('replace'); await new Promise(resolve => setImmediate(resolve))
  x.ctx.vditor.getValue = () => '刚新增的草稿'
  x.requests[3].resolve('历史正文'); await recovery
  assert.equal(x.values.length, 0); assert.match(x.ctx.historyActionError.value, /未替换/)
})
