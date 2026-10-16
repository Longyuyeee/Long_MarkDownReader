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
  assert.equal(f.api.movedPath('C:/LIB/Folder/Sub/Note.MD', notice), '\\\\?\\C:\\Lib\\Archive\\Folder\\Sub\\Note.MD')
  assert.equal(f.api.movedPath('\\\\server\\share\\Folder\\Sub\\Note.MD', {oldPath:'\\\\?\\UNC\\server\\share\\Folder',newPath:'\\\\?\\UNC\\server\\share\\Archive\\Folder'}), '\\\\?\\UNC\\server\\share\\Archive\\Folder\\Sub\\Note.MD')
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
test('cached text drafts follow a move in the same editor while editor-type changes still require saving', () => {
  const f=fixture(), formatAt=path=>path.endsWith('.md')?{id:'markdown',routeName:'LibraryMode'}:path.endsWith('.txt')?{id:'plain-text',routeName:'TextEditor'}:path.endsWith('.js')?{id:'javascript',routeName:'TextEditor'}:{id:'pdf',routeName:'Pdf'}
  const request=target=>({requestId:'one',sourcePaths:['C:/Lib/a.txt'],paths:['C:/Lib/a.txt',target]})
  assert.equal(f.api.canRetainMovedDraft('C:/Lib/a.txt',request('C:/Lib/new.txt'),formatAt),true)
  assert.equal(f.api.canRetainMovedDraft('C:/Lib/a.txt',request('C:/Lib/new.js'),formatAt),true)
  assert.equal(f.api.canRetainMovedDraft('C:/Lib/a.txt',request('C:/Lib/new.pdf'),formatAt),false)
  assert.equal(f.api.canRetainMovedDraft('C:/Lib/a.txt',request('C:/Lib/new.md'),formatAt),false)
})
test('fresh protection passes the source and target to the cached text-draft retention decision', async () => {
  const f=fixture(),bridge=f.api.createFileMoveProtection({ready:()=>true,dirtyPaths:()=>['C:/Lib/a.txt'],retainedDraftPaths:request=>request.paths[1].endsWith('.txt')?['C:/Lib/a.txt']:[],completed:async()=>{}})
  await bridge.protect({requestId:'one',sourcePaths:['C:/Lib/a.txt'],paths:['C:/Lib/a.txt','C:/Lib/new.txt'],rewritePaths:[]});assert.equal(f.calls[0].args.dirtyPaths.length,0);await bridge.release({requestId:'one'})
  await bridge.protect({requestId:'two',sourcePaths:['C:/Lib/a.txt'],paths:['C:/Lib/a.txt','C:/Lib/new.pdf'],rewritePaths:[]});assert.equal(f.calls.at(-1).args.dirtyPaths[0],'a.txt');await bridge.release({requestId:'two'});bridge.dispose()
})
test('selecting a Windows spelling of an open dirty document reuses its tab and route', () => {
  const source=fs.readFileSync('src/views/LibraryMode.vue','utf8'),start=source.indexOf('const handleNodeSelect ='),end=source.indexOf('const handleTreeSelection =',start)
  const script=ts.transpileModule(source.slice(start,end)+'\nglobalThis.select=handleNodeSelect',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  const path='C:/Lib/note.md',calls=[],context={selectedKeys:{value:[]},allTabs:{value:[{path,isDirty:true},{path:'\\\\?\\C:\\Lib\\note.md',isDirty:false}]},treeData:{value:[]},findTreeOptionByKey:()=>({isLeaf:true}),sameLibrary:(a,b)=>paths.fileStylePathKey(a)===paths.fileStylePathKey(b),findFileFormat:()=>({label:'Markdown'}),opensInLibraryShell:()=>true,route:{name:'LibraryMode',query:{path}},router:{},openManagedFile:(_router,path)=>calls.push(['navigate',path]),fileDisplayName:()=> 'note',store:{addTab:tab=>calls.push(['tab',tab.path])},refreshRelationSummaries:async()=>{}}
  vm.runInNewContext(script,context);context.select(['\\\\?\\C:\\LIB\\note.md']);assert.deepEqual(calls,[['tab',path]])
  calls.length=0;context.route.query.path='C:/Lib/other.md';context.select(['\\\\?\\C:\\Lib\\note.md']);assert.deepEqual(calls,[['navigate',path]])
})
