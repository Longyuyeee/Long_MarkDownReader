import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const edit=url(fs.readFileSync('src/utils/tableEditing.ts','utf8'))
const {planTableRowInsertion:plan,tableRowHistorySize:size}=await import(url(fs.readFileSync('src/utils/tableRowInsertion.ts','utf8').replace("'./tableEditing'",JSON.stringify(edit))))
const fixture=()=>({headers:['记录','编号','内容'],columnIds:['task','code','text'],rowIds:['a','hidden','c'],rows:[['原记录','00123','多行\r\n内容'],['隐藏','9007199254740993123','=SUM(A1:A2)'],['已有',' 00002 ','']]})
test('insert above and below the stable source row, append and never mutate the original draft while planning',()=>{
 const t=fixture(),old=structuredClone(t)
 for(const[action,id,index]of [['above','c',2],['below','a',1],['append',undefined,3]]){const e=plan(t,action,id,()=>action);assert.equal(e.index,index);assert.deepEqual(e.row,['','','']);assert.deepEqual(e.columnIds,t.columnIds);assert.equal(e.kind,'add')}
 assert.deepEqual(t,old)
})
test('duplicate snapshots the complete current draft including multiline, spaces, zeroes, long identifiers and literal formulas',()=>{
 const t=fixture();t.rows[0][1]='00077'
 for(const id of t.rowIds){const e=plan(t,'duplicate',id,()=>id+'-copy');assert.deepEqual(e.row,t.rows[t.rowIds.indexOf(id)]);assert.notEqual(e.row,t.rows[e.index-1]);e.row[0]='副本修改';assert.notEqual(t.rows[e.index-1][0],'副本修改')}
})
test('missing row, reused new identity, invalid structure and row capacity reject without changing data',()=>{
 const t=fixture(),old=structuredClone(t)
 for(const[action,id,newId]of [['above','missing','new'],['below','a','a'],['duplicate','a','']])assert.throws(()=>plan(t,action,id,()=>newId))
 assert.throws(()=>plan({...t,rowIds:[]},'append',undefined,()=> 'x'))
 assert.throws(()=>plan({...t,rows:Array(200000).fill(t.rows[0])},'append',undefined,()=> 'x'),/20万/)
 assert.deepEqual(t,old)
})
test('copy preflights text and the entire retained row history before mutation',()=>{
 const t=fixture();t.headers=Array(6).fill('列');t.columnIds=Array.from({length:6},(_,i)=>String(i));t.rows[0]=Array(6).fill('x'.repeat(800000));const before=t.rows[0]
 assert.throws(()=>plan(t,'duplicate','a',()=> 'new'),/撤销预算/);assert.equal(t.rows[0],before)
 t.rows[0]=['x'.repeat(1000001)];assert.throws(()=>plan(t,'duplicate','a',()=> 'new'),/100万/)
 assert.ok(size(['x'],['long-column-id'],'new','复制行')>size(['x']))
})
test('actual row menu callback refuses a changed owner, non-grid view and sorted positional insertion',()=>{
 const s=fs.readFileSync('src/views/TableView.vue','utf8'),fn=s.slice(s.indexOf('function selectRowAction'),s.indexOf('\nconst cellMenu='))
 for(const mode of ['owner','view','sort','duplicate','valid']){
  const calls=[],context={menu:mode},scope={rowMenu:{value:{show:true,rowId:'a',context}},selectedRowId:{value:'a'},table:{value:fixture()},activeViewKind:{value:mode==='view'?'board':'grid'},sortColumn:{value:['sort','duplicate'].includes(mode)?0:-1},requireRuleContext:()=>{if(mode==='owner')throw Error('changed')},insertRow:(...args)=>calls.push(args),requestDeleteSelectedRow:()=>calls.push('delete'),message:{warning:e=>calls.push({error:e})},Error}
  vm.runInNewContext(ts.transpile(fn+'\nglobalThis.act=selectRowAction',{target:ts.ScriptTarget.ES2022}),scope);scope.act(mode==='duplicate'?'duplicate':'above');assert.equal(scope.rowMenu.value.show,false)
  if(['valid','duplicate'].includes(mode))assert.equal(calls[0][1],'a');else assert.ok(calls[0].error)
 }
})
test('actual deletion confirmation binds the original row, refuses later edits and retains the draft on cancel',()=>{
 const s=fs.readFileSync('src/views/TableView.vue','utf8'),fn=s.slice(s.indexOf('const requestDeleteSelectedRow'),s.indexOf('\nconst undoRowOperation'))
 for(const changed of [false,true]){let confirmation,deleted;const scope={selectedRowIndex:{value:0},selectedRowId:{value:'a'},table:{value:fixture()},captureRuleContext:()=>({revision:1}),requireRuleContext:()=>{if(changed)throw Error('changed')},dialog:{warning:o=>confirmation=o},deleteSelectedRow:()=>deleted=scope.selectedRowId.value,message:{warning:()=>{}},Error};vm.runInNewContext(ts.transpile(fn+'\nglobalThis.ask=requestDeleteSelectedRow',{target:ts.ScriptTarget.ES2022}),scope);scope.ask();assert.equal(deleted,undefined);scope.selectedRowId.value='c';const result=confirmation.onPositiveClick();if(changed){assert.equal(result,false);assert.equal(deleted,undefined)}else assert.equal(deleted,'a')}
})
test('Escape dismisses manual menus even outside the teleported table, preserving selection until a later key',()=>{
 const s=fs.readFileSync('src/views/TableView.vue','utf8'),fn=s.slice(s.indexOf('const dismissTableMenus'),s.indexOf('\nconst handleKeydown'))
 const scope={rowMenu:{value:{show:true}},cellMenu:{value:{show:false}},columnMenu:{value:{show:false}}};vm.runInNewContext(ts.transpile(fn+'\nglobalThis.dismiss=dismissTableMenus',{target:ts.ScriptTarget.ES2022}),scope)
 let calls=0;const key={key:'Escape',preventDefault(){calls++},stopPropagation(){calls++}};scope.dismiss(key);assert.equal(scope.rowMenu.value.show,false);assert.equal(calls,2);scope.dismiss(key);assert.equal(calls,2)
 assert.ok(s.includes("window.addEventListener('keydown', dismissTableMenus, true)"));assert.ok(s.includes("window.removeEventListener('keydown', dismissTableMenus, true)"))
})
