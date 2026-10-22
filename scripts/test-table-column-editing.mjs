import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const editUrl=url(fs.readFileSync('src/utils/tableEditing.ts','utf8'))
const {planTableColumnMove:move,planTableColumnAdd:add,applyTableColumnEdit:apply}=await import(url(fs.readFileSync('src/utils/tableColumnEditing.ts','utf8').replace("'./tableEditing'",JSON.stringify(editUrl))))
const {applyTableEdit,planTablePaste}=await import(editUrl)
const fixture=()=>({headers:['记录','编号','内容'],columnIds:['task','code','text'],columnTypes:['text','integer','text'],rowIds:['a','hidden','c'],rows:[['原记录','00123','多行\r\n内容'],['隐藏','9007199254740993123','=SUM(A1:A2)'],['已有',' 00002 ','']],validationRules:{code:{kind:'integer'}}})
test('moving one stable field carries all values, header and type with exact text, rule identity unchanged and one reversible edit',()=>{
 const t=fixture(),old=structuredClone(t),e=move(t,'code',-1);assert.deepEqual(t,old);apply(t,e,true)
 assert.deepEqual(t.columnIds,['code','task','text']);assert.deepEqual(t.headers,['编号','记录','内容']);assert.deepEqual(t.columnTypes,['integer','text','text']);assert.equal(t.rows[1][0],'9007199254740993123');assert.equal(t.rows[0][2],'多行\r\n内容');assert.deepEqual(t.validationRules,old.validationRules)
 apply(t,e,false);assert.deepEqual(t,old);apply(t,e,true);assert.equal(t.rows[2][0],' 00002 ')
})
test('reorder history composes with stable-ID cell fill and new-column edits without crossing fields',()=>{
 const t=fixture(),change=planTablePaste(t,t.rowIds,'a','code',[['00077']],false,()=>''),m=move(t,'code',1)
 applyTableEdit(t,change,true);apply(t,m,true);assert.equal(t.rows[0][2],'00077');apply(t,m,false);applyTableEdit(t,change,false);assert.equal(t.rows[0][1],'00123')
 const a=add(t,'new');apply(t,a,true);const cell=planTablePaste(t,t.rowIds,'a','new',[['00999']],false,()=> '');applyTableEdit(t,cell,true)
 assert.throws(()=>apply(t,a,false),/仍有修改/);assert.equal(t.rows[0][3],'00999');applyTableEdit(t,cell,false);apply(t,a,false);assert.equal(t.columnIds.includes('new'),false);apply(t,a,true);applyTableEdit(t,cell,true);assert.equal(t.rows[0][3],'00999')
})
test('actual pending type refresh follows field IDs across a move rather than refreshing the old offset',()=>{
 const source=fs.readFileSync('src/views/TableView.vue','utf8'),fn=source.slice(source.indexOf('const pendingTypeColumns'),source.indexOf('\nconst compareValues')),t=fixture();let callback
 const scope={table:{value:t},window:{clearTimeout(){},setTimeout:fn=>{callback=fn;return 1}},typeTimer:0,Set,inferType:index=>t.columnIds[index]==='code'?'integer':'text'}
 vm.runInNewContext(ts.transpile(fn+'\nglobalThis.schedule=scheduleTypeRefresh',{target:ts.ScriptTarget.ES2022}),scope);scope.schedule(1);const e=move(t,'code',-1);apply(t,e,true);t.columnTypes[0]='empty';callback();assert.equal(t.columnTypes[0],'integer');assert.equal(t.columnTypes[1],'text')
})
test('actual structural history remaps per-view widths and restores removed new-field references without overwriting later choices',()=>{
 const source=fs.readFileSync('src/views/TableView.vue','utf8'),fn=source.slice(source.indexOf('const applyColumnHistory'),source.indexOf('\nconst focusColumn')),t=fixture(),view={id:'grid',config:{columnWidths:[110,220,330],frozenColumns:2,groupBy:'task',titleColumn:'task',cardColumns:['code'],valueColumn:'code'}},scope={table:{value:t},views:{value:[view]},rowUndoStack:{value:[]},rowRedoStack:{value:[]},cellRange:{value:null},editSession:0,captureActiveView(){},applyView(){},activeView:{value:view},applyTableColumnEdit:apply,historyEntryBytes:e=>e.edit.bytes+JSON.stringify(e.removedViews||[]).length*2,TABLE_HISTORY_BYTES:8*1024*1024,JSON,Math,Error}
 vm.runInNewContext(ts.transpile(fn+'\nglobalThis.act=applyColumnHistory',{target:ts.ScriptTarget.ES2022}),scope)
 const m={kind:'column',edit:move(t,'code',-1)};scope.act(m,true);assert.deepEqual(Array.from(view.config.columnWidths),[220,110,330]);assert.equal(view.config.groupBy,'task');scope.act(m,false)
 const a={kind:'column',edit:add(t,'new')};scope.act(a,true);view.config.groupBy='new';view.config.titleColumn='new';view.config.columnWidths[3]=270;scope.act(a,false);assert.equal(view.config.groupBy,'task');view.config.titleColumn='text';scope.act(a,true);assert.equal(view.config.groupBy,'new');assert.equal(view.config.titleColumn,'text');assert.equal(view.config.columnWidths[3],270)
})
test('invalid direction, missing owner, duplicate identity, inconsistent rows and capacity reject atomically',()=>{
 const t=fixture(),old=structuredClone(t)
 for(const [id,d]of [['task',-1],['text',1],['absent',1],['code',2]])assert.throws(()=>move(t,id,d))
 assert.throws(()=>add(t,'code'));assert.throws(()=>add({...t,rows:[['bad']]},'new'))
 const wide={headers:Array(512).fill('h'),columnTypes:Array(512).fill('text'),columnIds:Array.from({length:512},(_,i)=>String(i)),rows:[],rowIds:[]};assert.throws(()=>add(wide,'new'),/512/)
 const e=move(t,'code',1);const stale=structuredClone(t);stale.columnIds.reverse();assert.throws(()=>apply(stale,e,true));assert.deepEqual(t,old)
 const malformed=structuredClone(t);malformed.rows[2].pop();const before=structuredClone(malformed);assert.throws(()=>apply(malformed,e,true));assert.deepEqual(malformed,before)
})
test('large-table move history remains independent of row count and does not copy cell contents',()=>{
 const t=fixture();t.rows=Array.from({length:50000},()=>['记录','00123','多行\n内容']);t.rowIds=t.rows.map((_,i)=>String(i));const e=move(t,'code',-1)
 assert.ok(e.bytes<1024);assert.equal(Object.hasOwn(e,'rows'),false);apply(t,e,true);assert.equal(t.rows[49999][0],'00123');apply(t,e,false);assert.equal(t.rows[49999][1],'00123')
})
test('actual column callback rejects stale context and non-grid view, preserving rule and boundary behavior',()=>{
 const source=fs.readFileSync('src/views/TableView.vue','utf8'),fn=source.slice(source.indexOf('function selectColumnAction'),source.indexOf('\nfunction openRule'))
 for(const mode of ['stale','board','valid','rule','edge']){
  const calls=[],t=fixture(),scope={columnMenu:{value:{show:true,columnId:mode==='edge'?'task':'code',context:{}}},table:{value:t},activeViewKind:{value:mode==='board'?'board':'grid'},requireRuleContext:()=>{if(mode==='stale')throw Error('changed')},openRule:id=>calls.push({rule:id}),planTableColumnMove:move,commitColumnEdit:e=>calls.push(e),message:{warning:error=>calls.push({error})},Error}
  vm.runInNewContext(ts.transpile(fn+'\nglobalThis.act=selectColumnAction',{target:ts.ScriptTarget.ES2022}),scope);scope.act(mode==='rule'?'rule':'left');assert.equal(scope.columnMenu.value.show,false)
  if(mode==='valid')assert.equal(calls[0].columnId,'code');else if(mode==='rule')assert.equal(calls[0].rule,'code');else assert.ok(calls[0].error)
  assert.deepEqual(t,fixture())
 }
})
