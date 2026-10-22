import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const editingUrl=url(fs.readFileSync('src/utils/tableEditing.ts','utf8')),validationUrl=url(fs.readFileSync('src/utils/tableValidation.ts','utf8').replace("'./tableEditing'",JSON.stringify(editingUrl)))
const {applyTableEdit}=await import(editingUrl),{planTableRangeFill:plan}=await import(url(fs.readFileSync('src/utils/tableRangeFill.ts','utf8').replace("'./tableEditing'",JSON.stringify(editingUrl)).replace("'./tableValidation'",JSON.stringify(validationUrl))))
const fixture=()=>({format:'csv',headers:['任务','状态','编号'],rowIds:['a','hidden','c'],columnIds:['task','state','code'],rows:[['','待处理','00123'],['隐藏','隐藏','9007199254740993123'],['已有备注','','=SUM(A1:A2)']]})
const range={rows:['c','a'],columns:['task','state']},rules={state:{kind:'options',required:true,options:['待处理','已完成']}}
test('empty-only default preserves authored whitespace, old values, hidden rows and text identities',()=>{
 const t=fixture(),old=structuredClone(t),e=plan(t,rules,range,'已完成','empty');assert.equal(e.cells.length,2);assert.deepEqual(t,old);applyTableEdit(t,e,true);assert.deepEqual(t.rows,[['已完成','待处理','00123'],old.rows[1],['已有备注','已完成','=SUM(A1:A2)']]);applyTableEdit(t,e,false);assert.deepEqual(t,old);t.rows[0][0]=' ';assert.equal(plan(t,rules,range,'已完成','empty').cells.length,1)
})
test('replace is one reversible edit using stable row and column IDs despite reordered backing data',()=>{
 const t=fixture(),old=structuredClone(t),e=plan(t,rules,range,'已完成','replace');t.rows.reverse();t.rowIds.reverse();applyTableEdit(t,e,true);assert.deepEqual(t.rows.map(row=>row.slice(0,2)),[['已完成','已完成'],old.rows[1].slice(0,2),['已完成','已完成']]);applyTableEdit(t,e,false);assert.deepEqual(t.rows,[...old.rows].reverse());applyTableEdit(t,e,true);assert.equal(t.rows[1][2],old.rows[1][2])
})
test('a later-column validation error refuses the entire fill before any cell changes',()=>{
 const t=fixture(),old=structuredClone(t);assert.throws(()=>plan(t,rules,range,'非法','replace'),/状态.*选项/);assert.deepEqual(t,old);assert.throws(()=>plan(t,{state:{kind:'integer',required:true}},range,'1.2','replace'),/整数/);assert.deepEqual(t,old)
})
test('lost or duplicate identities and cell/history budgets reject atomically',()=>{
 const t=fixture(),old=structuredClone(t);for(const r of [{rows:['a','missing'],columns:['task']},{rows:['a'],columns:['missing']},{rows:['a','a'],columns:['task']},{rows:Array.from({length:20001},(_,i)=>String(i)),columns:['task']}])assert.throws(()=>plan(t,{},r,'x','replace'));assert.throws(()=>plan(t,{},range,'x'.repeat(1000001),'replace'));const big={...t,rows:Array.from({length:6},()=>['','','']),rowIds:Array.from({length:6},(_,i)=>String(i))};assert.throws(()=>plan(big,{}, {rows:big.rowIds,columns:['task']},'x'.repeat(1000000),'replace'),/撤销预算/);assert.deepEqual(t,old)
})
test('unchanged values create no history patch and formula-looking values stay literal text',()=>{
 const t=fixture();assert.equal(plan(t,{}, {rows:['a'],columns:['state']},'待处理','replace').cells.length,0);const e=plan(t,{}, {rows:['a'],columns:['task']},'=SUM(A1:A2)','empty');applyTableEdit(t,e,true);assert.equal(t.rows[0][0],'=SUM(A1:A2)')
})
test('production dialog callback refuses changed ownership/selection and never commits partial drafts',()=>{
 const source=fs.readFileSync('src/views/TableView.vue','utf8'),required=source.slice(source.indexOf('function requireRangeContext'),source.indexOf('\nfunction openCellMenu')),callback=source.slice(source.indexOf('function applyRangeFill'),source.indexOf('\nfunction openColumnMenu'))
 for(const changed of ['owner','selection','view','valid']){
  const t=fixture();let writes=0,revision=1;const context={JSON,Error,editSession:0,table:{value:t},cellRange:{value:range},activeViewKind:{value:changed==='view'?'board':'grid'},fillDialog:{value:{document:t,revision:1,range,rangeKey:JSON.stringify(range)}},rangeKey:()=>JSON.stringify(changed==='selection'?null:range),requireRuleContext:c=>{if(changed==='owner'||c.revision!==revision)throw Error('changed')},planTableRangeFill:plan,commitCellEdit:e=>{applyTableEdit(t,e,true);writes++;revision++}}
  vm.runInNewContext(ts.transpile(required+'\n'+callback+'\nglobalThis.applyFill=applyRangeFill',{target:ts.ScriptTarget.ES2022}),context)
  if(changed==='valid'){assert.equal(context.applyFill('已完成','empty'),2);assert.equal(writes,1)}else{assert.throws(()=>context.applyFill('已完成','empty'));assert.equal(writes,0);assert.deepEqual(t,fixture())}
 }
})

test('same-file row references navigate the live unsaved table without rereading or invalidating a save',async()=>{
 const source=fs.readFileSync('src/views/TableView.vue','utf8'),start=source.indexOf('const loadTable = async () => {'),end=source.indexOf('\nconst saveTable =',start),ref=value=>({value})
 for(const pending of [false,true]){
  const draft=fixture(),history=[{label:'填充选区'}],context={JSON,String,Error,Math,loadGeneration:12,editSession:0,ruleDialog:ref(null),issuesDialog:ref(null),columnMenu:ref({show:false}),cellMenu:ref({show:false}),rowMenu:ref({show:false}),scrollRef:ref(null),presentedPath:ref('same.table.json'),presentedExternal:ref(false),table:ref(draft),tablePath:ref('same.table.json'),isExternal:ref(false),dirty:ref(true),loading:ref(false),saving:ref(pending),notice:ref(''),cellRange:ref(range),requestedRowId:ref('c'),route:{query:{path:'same.table.json',row:'c'}},views:ref([{id:'grid',kind:'grid'}]),activeViewId:ref('grid'),filteredIndices:ref([0,1,2]),selectedRowId:ref(''),nextTick:async()=>{},rememberWorkspaceViewState(){},markViewDirty(){},switchView(){assert.fail('unneeded view switch')},rowUndoStack:ref(history),invoke(){assert.fail('must not reread unsaved source')}}
  Object.defineProperty(context.dirty,'value',{get:()=>true,set(){assert.fail('draft was falsely marked saved')}})
  vm.runInNewContext(ts.transpile(source.slice(start,end)+'\nglobalThis.load=loadTable',{target:ts.ScriptTarget.ES2022}),context);await context.load();assert.equal(context.table.value,draft);assert.equal(context.rowUndoStack.value,history);assert.equal(context.selectedRowId.value,'c');assert.equal(context.loadGeneration,12)
 }
})
