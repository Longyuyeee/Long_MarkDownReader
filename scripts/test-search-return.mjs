import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { test } from 'node:test'
let cleanupTarget
const sessionHelpers={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/workSessions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:sessionHelpers})
const listeners = new Set()
const box = { exports: {}, window:{addEventListener:(_name,fn)=>listeners.add(fn),removeEventListener:(_name,fn)=>listeners.delete(fn)}, require: name => name==='../utils/workSessions'?sessionHelpers:({ ...Vue, onBeforeUnmount: fn => cleanupTarget.push(fn) }) }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/composables/useSearchReturn.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box)
function harness(root, paging=false) {
  const cleanups = []; cleanupTarget = cleanups
  const scope = Vue.effectScope(), query = Vue.ref(''), types = Vue.ref([]), running = Vue.ref(false), failed = Vue.ref(false), keys = Vue.ref([]), library = Vue.ref(root), loaded=Vue.ref(0),sort=Vue.ref('relevance'),more=Vue.ref(false)
  let restored=0
  let focus = 0, shown = 0
  const node = { scrollTop: 0, querySelectorAll: () => keys.value.map(key => ({ dataset: { searchKey: key }, scrollIntoView: () => {}, querySelector: () => ({ focus: () => { focus++ } }) })) }
  const viewport = Vue.shallowRef(node)
  const state = scope.run(() => box.exports.useSearchReturn({ root: () => library.value, query, types, running, failed, resultKeys: () => keys.value, viewport, showResults: () => { shown++ },...(paging?{sort,loadedFiles:()=>loaded.value,restoreLoadedFiles:n=>restored=n,hasMore:()=>more.value}:{}) }))
  return { state, query, types, running, failed, keys, library, viewport, node, loaded,sort,more,restored:()=>restored, focus: () => focus, shown: () => shown, stop: () => { cleanups.forEach(fn => fn()); scope.stop() } }
}
const settle = async () => { await Vue.nextTick(); await Vue.nextTick(); await Promise.resolve() }
test('a native canonical-root move keeps the live search selection on the renamed file and disposes its listener',async()=>{
 const h=harness('C:/Search-Move'),locator=['C:/Search-Move/old.pdf','pdf','annotation',2,null,'a',null],key=JSON.stringify([...locator,'excerpt'])
 h.query.value='研究';h.keys.value=[key];h.state.remember(key)
 const target='C:/Search-Move/new.pdf'
 for(const listener of listeners)listener({detail:{root:'c:/search-move',mapPath:path=>path===locator[0]?target:path}})
 h.keys.value=[JSON.stringify([target,...locator.slice(1),'new excerpt'])];await settle();assert.equal(JSON.parse(h.state.selectedKey.value)[0],target)
 h.stop();assert.equal(listeners.size,0)
})
test('leaving and reopening restores query, filters, selected result and scroll after fresh results', async () => {
  const first = harness('/return-a'); first.query.value = '预算'; first.types.value = ['pdf']; first.node.scrollTop = 420; first.state.remember('page-5'); first.stop()
  const back = harness('/return-a'); back.running.value = true; back.state.restore(); await settle()
  assert.equal(back.query.value, '预算'); assert.deepEqual([...back.types.value], ['pdf'])
  assert.equal(back.node.scrollTop, 0)
  back.keys.value = ['page-2', 'page-5']; back.running.value = false; await settle()
  assert.equal(back.node.scrollTop, 420); assert.equal(back.state.selectedKey.value, 'page-5'); assert.equal(back.focus(), 0)
  back.state.returnToResults(); await settle(); assert.equal(back.focus(), 1)
  back.stop()
})

test('paged return restores sort and depth, retaining a not-yet-loaded selection',async()=>{
  const first=harness('/paged-return',true);first.query.value='预算';first.sort.value='modified';first.loaded.value=80;first.state.remember('file-75');first.stop()
  const back=harness('/paged-return',true);back.running.value=true;back.state.restore();assert.equal(back.restored(),80);assert.equal(back.sort.value,'modified')
  back.keys.value=['file-1'];back.more.value=true;back.running.value=false;await settle();assert.equal(back.state.selectedKey.value,'file-75');assert.match(back.state.notice.value,/尚未加载/)
  back.keys.value=['file-1','file-75'];await settle();back.state.returnToResults();await settle();assert.equal(back.focus(),1);back.stop()
})
test('named work-session restore retains bounded sort and page depth without old selection',async()=>{
  box.exports.restoreSearchSession('/named-paged-return',{query:'预算',types:['pdf'],selected:'old',scroll:500,loadedFiles:80,sort:'modified'})
  const back=harness('/named-paged-return',true);back.running.value=true;back.state.restore()
  assert.equal(back.restored(),80);assert.equal(back.sort.value,'modified');assert.equal(back.state.selectedKey.value,'');assert.deepEqual([...back.types.value],['pdf']);back.stop()
})
test('missing result is explained; a failed refresh does not discard the saved selection', async () => {
  const first = harness('/return-b'); first.query.value = '项目'; first.state.remember('gone'); first.stop()
  const back = harness('/return-b'); back.running.value = true; back.state.restore(); back.failed.value = true; back.running.value = false; await settle()
  assert.equal(back.state.selectedKey.value, 'gone')
  back.failed.value = false; back.keys.value = ['new']; await settle()
  assert.equal(back.state.selectedKey.value, ''); assert.match(back.state.notice.value, /已变化/); assert.equal(back.query.value, '项目'); back.stop()
})
test('changing query or library clears selection and libraries never inherit one another', async () => {
  const a = harness('/return-c'); a.query.value = '旧条件'; a.state.remember('old')
  a.query.value = '新条件'; assert.equal(a.state.selectedKey.value, '')
  a.state.remember('new'); a.library.value = '/return-d'; assert.equal(a.state.selectedKey.value, '')
  a.query.value = ''; a.stop()
  const d = harness('/return-d'); d.state.restore(); assert.equal(d.query.value, ''); d.stop()
  const c = harness('/return-c'); c.running.value = true; c.state.restore(); assert.equal(c.query.value, '新条件'); assert.equal(c.state.selectedKey.value, 'new'); c.stop()
})

test('named restore resolves fresh result identity after an excerpt changes, while retaining scroll and depth',async()=>{
 const old=JSON.stringify(['C:/notes/a.md','markdown','body',null,null,null,null,'PRIVATE OLD EXCERPT'])
 const fresh=JSON.stringify(['C:/notes/a.md','markdown','body',null,null,null,null,'fresh content'])
 box.exports.restoreSearchSession('/locator-return',{query:'预算',types:['markdown'],selected:old,scroll:500,loadedFiles:80,sort:'modified'})
 const back=harness('/locator-return',true);back.running.value=true;back.state.restore();assert.equal(back.state.selectedKey.value,'')
 back.keys.value=[fresh];back.running.value=false;await settle();assert.equal(back.state.selectedKey.value,fresh);assert.equal(back.node.scrollTop,500);assert.equal(back.restored(),80)
 back.state.returnToResults();await settle();assert.equal(back.focus(),1);back.stop()
})
