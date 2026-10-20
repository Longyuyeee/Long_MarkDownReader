import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
const code=ts.transpileModule(fs.readFileSync('src/composables/createVditorFindAdapter.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(){
 let source='原稿\n\n',mode='sv';const changed=[],identity={key:'root:file.md',path:'file.md',generation:1,ready:true,revision:source,signature:'receipt-a'},element={scrollTop:0,scrollLeft:0},editor={getValue:()=>source,getCurrentMode:()=>mode,vditor:{sv:{element},ir:{element}}}
 const exports={},context=vm.createContext({exports,require:()=>({vditorSourceSelection:()=>undefined,revealVditorSourceMatch:()=>{},clearFindHighlight:()=>{}}),window:{getSelection:()=>({isCollapsed:true})}});vm.runInContext(code,context)
 const adapter=exports.createVditorFindAdapter(()=>editor,()=>({...identity}),value=>changed.push(value))
 return {adapter,identity,changed,setSource:value=>{source=value},setMode:value=>{mode=value}}
}
test('refresh/reopen cannot adopt an unsynchronized newer draft as an editable baseline',()=>{
 const h=harness(),before=h.adapter.capture();h.identity.revision='新草稿\n';assert.equal(h.adapter.isCurrent(before),false);assert.throws(()=>h.adapter.capture(),/正文尚未同步/);assert.throws(()=>h.adapter.capture(),/正文尚未同步/);assert.deepEqual(h.changed,[])
 h.identity.generation++;h.setSource('新草稿\n\n');assert.doesNotThrow(()=>h.adapter.capture());assert.equal(h.identity.revision,'新草稿\n')
})
test('a real new save receipt permits its declared newline normalization without reopening',()=>{
 const h=harness(),before=h.adapter.capture();h.identity.revision='原稿\n';h.identity.signature='receipt-b';assert.equal(h.adapter.isCurrent(before),false);const after=h.adapter.capture();assert.equal(after.content,'原稿\n\n');assert.equal(h.adapter.isCurrent(after),true)
 h.identity.revision='保存后的其他新稿\n';assert.throws(()=>h.adapter.capture(),/正文尚未同步/);assert.deepEqual(h.changed,[])
})
test('pending editor input remains valid when its normal store notification catches up',()=>{
 const h=harness();h.adapter.capture();h.setSource('新输入\n\n');const pending=h.adapter.capture();assert.equal(h.adapter.isCurrent(pending),true);h.identity.revision=pending.content;assert.equal(h.adapter.isCurrent(pending),true);h.identity.signature='receipt-b';assert.equal(h.adapter.isCurrent(pending),false)
})
test('document/mode/ready ownership and read-only boundaries stay local',()=>{
 const h=harness(),before=h.adapter.capture();h.identity.ready=false;assert.equal(h.adapter.isCurrent(before),false);assert.throws(()=>h.adapter.capture(),/读取、保存/);h.identity.ready=true;h.setMode('ir');assert.equal(h.adapter.isCurrent(before),false);h.identity.path='other.md';h.identity.key='root:other.md';h.identity.readOnlyReason='当前只读';const current=h.adapter.capture();assert.throws(()=>h.adapter.applyChange(current,{content:'替换稿'}),/当前只读/);assert.deepEqual(h.changed,[])
})
