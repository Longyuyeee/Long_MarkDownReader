import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {test} from 'node:test'
const entries=new Map(),storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)}
const load=(localStorage=storage)=>{const exports={};vm.runInNewContext(ts.transpile(fs.readFileSync('src/services/workspaceViewState.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports,localStorage});return exports}
const data=()=>({scrollTop:123,scrollLeft:2,draft:'PRIVATE DRAFT',pdfAnnotations:{signature:'source-v1',id:'a',query:'研究',pages:'1-5',kind:'comment',color:'blue',listPage:3,selection:['a','b'],scrollTop:725,comment:'PRIVATE COMMENT',annotations:[{quote:'PRIVATE QUOTE'}]}})
test('a fresh process restores PDF locators without any draft or annotation contents',()=>{
 entries.clear();load().rememberWorkspaceViewState('C:/a.pdf',data());const raw=[...entries.values()].join('');assert.ok(!raw.includes('PRIVATE'));const resumed=JSON.parse(JSON.stringify(load().recallWorkspaceViewState('C:/a.pdf')));assert.deepEqual(resumed.pdfAnnotations,JSON.parse(JSON.stringify(data().pdfAnnotations,(k,v)=>['comment','annotations'].includes(k)?undefined:v)));assert.equal(resumed.draft,undefined)
})
test('metadata remains bounded and optional for legacy scenes',()=>{
 entries.clear();const a=load(),d=data();d.pdfAnnotations={...d.pdfAnnotations,query:'q'.repeat(5000),pages:'1'.repeat(5000),selection:Array.from({length:999},(_,n)=>'id-'+n),kind:'other',color:'other',scrollTop:Infinity,listPage:-5};a.rememberWorkspaceViewState('a',d);const v=load().recallWorkspaceViewState('a').pdfAnnotations;assert.equal(v.query.length,200);assert.equal(v.pages.length,512);assert.equal(v.selection.length,200);assert.equal(v.kind,'');assert.equal(v.color,'');assert.equal(v.scrollTop,0);assert.equal(v.listPage,0);a.rememberWorkspaceViewState('old',{scrollTop:1,scrollLeft:0});assert.equal(load().recallWorkspaceViewState('old').pdfAnnotations,undefined)
})
test('scene staging preserves locators without expanding the 24-entry live cache',()=>{
 entries.clear();const a=load(),paths=Array.from({length:40},(_,n)=>'C:/'+n+'.pdf');a.stageWorkspaceViewStates(Object.fromEntries(paths.map(p=>[p,data()])),paths);const b=load();for(const p of paths)assert.equal(b.recallWorkspaceViewState(p).pdfAnnotations.id,'a');assert.equal(b.recallWorkspaceViewState(paths[0]).pdfAnnotations.scrollTop,725);assert.ok(![...entries.values()].join('').includes('PRIVATE'))
})
test('corrupt or unavailable metadata does not block live reading',()=>{
 entries.clear();entries.set('longedit.view-state.v1','broken');assert.equal(load().recallWorkspaceViewState('a'),undefined);const a=load({getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('quota')}});assert.doesNotThrow(()=>a.rememberWorkspaceViewState('a',data()));assert.equal(a.recallWorkspaceViewState('a').pdfAnnotations.id,'a')
})
test('callers cannot mutate the remembered annotation selection through aliases',()=>{
 entries.clear();const a=load(),d=data();a.rememberWorkspaceViewState('a',d);d.pdfAnnotations.selection.push('bad');a.recallWorkspaceViewState('a').pdfAnnotations.selection.push('bad2');assert.equal(a.recallWorkspaceViewState('a').pdfAnnotations.selection.length,2)
})
