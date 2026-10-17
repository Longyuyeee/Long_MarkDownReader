import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { test } from 'node:test'
const entries = new Map()
const localStorage = { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }
function moduleAt(path, deps = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpile(fs.readFileSync(path, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), { exports, localStorage, require: name => deps[name] || (name==='../utils/workSessions'?moduleAt('src/utils/workSessions.ts'):Vue) })
  return exports
}
test('reading position survives restart without draft or selection contents', () => {
  entries.clear()
  const first = moduleAt('src/services/workspaceViewState.ts')
  first.rememberWorkspaceViewState('C:/notes/a.pdf', { scrollTop: 120, scrollLeft: 0, section: '8', zoom: 1.2, draft: 'PRIVATE', selection: 'PRIVATE' })
  assert.equal([...entries.values()].join('').includes('PRIVATE'), false)
  const second = moduleAt('src/services/workspaceViewState.ts')
  assert.equal(second.recallWorkspaceViewState('C:/notes/a.pdf').section, '8')
  assert.equal(second.recallWorkspaceViewState('C:/notes/a.pdf').draft, undefined)
})
test('search filters survive restart and remain scoped to their library', () => {
  entries.clear()
  const first = moduleAt('src/composables/useSearchReturn.ts')
  first.restoreSearchSession('C:/notes', { query: '客户交付', types: ['pdf'], selected: 'old-result', scroll: 1 })
  const second = moduleAt('src/composables/useSearchReturn.ts')
  assert.equal(second.snapshotSearchSession('c:\\notes').query, '客户交付')
  assert.equal(second.snapshotSearchSession('C:/other'), undefined)
  assert.equal(second.snapshotSearchSession('C:/notes').selected, '')
})
test('reference persists only identity and never stale excerpt text', () => {
  entries.clear()
  const helpers = moduleAt('src/utils/workSessions.ts')
  const refs = moduleAt('src/services/workspaceReference.ts', { '../utils/workSessions': helpers })
  refs.writeWorkspaceReference('C:/notes', { path: 'C:/notes/a.md', title: 'a', query: '客户', context: 'PRIVATE', content: 'PRIVATE' })
  assert.equal([...entries.values()].join('').includes('PRIVATE'), false)
  assert.equal(refs.readWorkspaceReference('C:/notes').path, 'C:/notes/a.md')
  assert.equal(refs.readWorkspaceReference('C:/other'), undefined)
  assert.throws(() => refs.writeWorkspaceReference('C:/notes', { path: 'C:/other/a.md' }), /不属于/)
})

test('real search remember persists a locator without serializing the result excerpt', () => {
  entries.clear()
  const first = moduleAt('src/composables/useSearchReturn.ts'), scope = Vue.effectScope()
  const hook = scope.run(() => first.useSearchReturn({root:()=> 'C:/notes',query:Vue.ref('预算'),types:Vue.ref(['markdown']),running:Vue.ref(false),failed:Vue.ref(false),resultKeys:()=>[],viewport:Vue.ref(null),showResults:()=>{}}))
  const selected = JSON.stringify(['C:/notes/a.md','markdown','body',null,null,null,null,'PRIVATE SEARCH EXCERPT'])
  hook.remember(selected)
  assert.equal([...entries.values()].join('').includes('PRIVATE SEARCH EXCERPT'),false)
  const restarted=moduleAt('src/composables/useSearchReturn.ts').snapshotSearchSession('C:/notes')
  assert.equal(restarted.selected,'')
  assert.equal(restarted.selection[0],'C:/notes/a.md')
  scope.stop()
})

test('staged reading metadata survives more than 24 files and restart without expanding the live draft cache',()=>{
 entries.clear();const views=moduleAt('src/services/workspaceViewState.ts'),paths=Array.from({length:40},(_,n)=>`C:/notes/${n}.pdf`)
 views.stageWorkspaceViewStates(Object.fromEntries(paths.map((path,n)=>[path,{scrollTop:n*10,scrollLeft:0,section:String(n+1),draft:'PRIVATE',selection:'PRIVATE'}])),paths)
 for(let n=0;n<39;n++)views.rememberWorkspaceViewState(paths[n],{scrollTop:1000+n,scrollLeft:0,section:String(n+1),draft:'PRIVATE'})
 assert.equal(views.recallWorkspaceViewState(paths[0]).scrollTop,1000)
 const restarted=moduleAt('src/services/workspaceViewState.ts');assert.equal(restarted.recallWorkspaceViewState(paths[0]).scrollTop,1000);assert.equal(restarted.recallWorkspaceViewState(paths[39]).section,'40')
 assert.equal([...entries.values()].join('').includes('PRIVATE'),false)
 assert.ok(Object.keys(JSON.parse(entries.get('longedit.view-state.v1'))).length<=24)
})

test('staging respects protected models, aliases and rollback; quota failure cannot replace the current view',()=>{
 entries.clear();const views=moduleAt('src/services/workspaceViewState.ts')
 views.rememberWorkspaceViewState('C:/notes/dirty.md',{scrollTop:9,scrollLeft:0,draft:'PRIVATE'})
 views.rememberWorkspaceViewState('C:/notes/a.pdf',{scrollTop:12,scrollLeft:0})
 const undo=views.stageWorkspaceViewStates({'C:/notes/a.pdf':{scrollTop:100,scrollLeft:0}},['\\\\?\\C:\\notes\\a.pdf'])
 assert.equal(views.recallWorkspaceViewState('C:/notes/a.pdf').scrollTop,100);assert.equal(views.recallWorkspaceViewState('C:/notes/dirty.md').draft,'PRIVATE');undo()
 assert.equal(views.recallWorkspaceViewState('C:/notes/a.pdf').scrollTop,12)
 const original=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota')}
 try{assert.throws(()=>views.stageWorkspaceViewStates({'C:/notes/a.pdf':{scrollTop:200,scrollLeft:0}},['C:/notes/a.pdf']),/quota/)}finally{localStorage.setItem=original}
 assert.equal(views.recallWorkspaceViewState('C:/notes/a.pdf').scrollTop,12)
})
