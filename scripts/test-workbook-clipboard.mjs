import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const bundle = await build({ entryPoints: ['src/utils/workbookClipboard.ts'], bundle: true, write: false, format: 'esm', target: 'es2022' })
const w = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
test('XLSX identifiers remain exact text while ordinary numbers stay numeric', () => {
 for (const value of ['00123','-00007','9007199254740993123','1234567890123456','0x12','',' ']) assert.equal(w.isWorkbookNumber(value), false, value)
 for (const value of ['0','-0','12.50','-0.125','1e3','.5','+12']) assert.equal(w.isWorkbookNumber(value), true, value)
})
test('XLSX integer sorting distinguishes long adjacent IDs, empty and zero', () => {
 assert.ok(w.compareWorkbookValues('9007199254740993123','9007199254740993124') < 0)
 assert.ok(w.compareWorkbookValues('-9007199254740993124','-9007199254740993123') < 0)
 assert.ok(w.compareWorkbookValues('','0') < 0); assert.equal(w.compareWorkbookValues('00123','123'),0)
})
test('decimal fill is exact and refuses unreliable results before mutation', () => {
 assert.equal(w.workbookSeries(['0.1','0.2'],2),'0.3'); assert.equal(w.workbookSeries(['-0.2','-0.1'],2),'0.0')
 assert.equal(w.workbookSeries(['1','3'],3),'7')
 for(const values of [['001','002'],['','1'],['1e2','2e2'],['999999999999998','999999999999999']]) assert.throws(() => w.workbookSeries(values,4))
})
test('quoted multiline/tab/quotes/empty tails and scalar literal quotes roundtrip', () => {
 const rows = [['会议\r\n备注','含\t分隔','00123',''],['"引号"','=保留文本','9007199254740993123','']]
 const cells=rows.map((row,r)=>row.map((input,c)=>({input,kind:'string',row:r,column:c}))), encoded=w.encodeWorkbookClipboard(cells)
 assert.deepEqual(w.decodeWorkbookClipboard(encoded.text).matrix,rows)
 assert.deepEqual(w.decodeWorkbookClipboard(w.encodeWorkbookClipboard([[{input:'"引号"',kind:'string',row:0,column:0}]]).text).matrix,[['"引号"']])
 assert.match(encoded.html,/data-kind="string"/); assert.ok(!encoded.html.includes('<script'))
})
test('native length, coordinate shape and batch budgets refuse whole clipboard', () => {
 assert.throws(()=>w.validateWorkbookInput('a'.repeat(32768),'string'))
 assert.doesNotThrow(()=>w.validateWorkbookInput('😀'.repeat(32767),'string'))
 assert.throws(()=>w.validateWorkbookInput('='+ 'a'.repeat(8192),'formula'))
 assert.throws(()=>w.decodeWorkbookClipboard('"未闭合\t字段'))
 assert.throws(()=>w.decodeWorkbookClipboard(Array(10002).fill('x').join('\n')))
 assert.throws(()=>w.decodeWorkbookClipboard(Array(257).fill('x').join('\t')))
 assert.throws(()=>w.decodeWorkbookClipboard('x'.repeat(10*1024*1024+1)))
})
const source=fs.readFileSync('src/views/WorkbookView.vue','utf8'),box=value=>({value})
function extract(start,end,bindings,expose){const a=source.indexOf('const '+start+' ='),b=source.indexOf('const '+end+' =',a);assert.ok(a>=0&&b>a);const ctx=vm.createContext(bindings);vm.runInContext(ts.transpileModule(source.slice(a,b)+'\n'+expose,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx}
test('actual batch validates all targets and types before changing drafts or history',()=>{
 for(const bad of ['unloaded','array','length','formula','columns']){
  const drafts=box(new Map([['old',{input:'保留'}]])),history=box([]),bindings={MAX_BATCH_CELLS:10000,drafts,undoStack:history,redoStack:box(['old']),sheetInfo:box({totalRows:2}),loadedRows:box(new Map(bad==='unloaded'?[[0,[]]]:[[0,[]],[1,[]]])),arrayFormulaAt:(_r,c)=>bad==='array'&&c===1,editKey:(_s,r,c)=>r+':'+c,sourceCellAt:()=>({kind:'empty',value:''}),rulesAt:()=>[],assertEntry:()=>{},originalInput:cell=>cell.value,columnLabel:()=> 'B',EDITABLE_ERROR_VALUES:new Set(),validateWorkbookInput:w.validateWorkbookInput,isWorkbookNumber:w.isWorkbookNumber,invalidateCalculation(){assert.fail('No mutation on rejected batch')}}
  const ctx=extract('inferEdit','setDraft',bindings,'globalThis.inferEdit=inferEdit');bindings.inferEdit=ctx.inferEdit
  const batch=extract('applyBatchInputs','selectedMatrix',bindings,'globalThis.apply=applyBatchInputs')
  const matrix=bad==='unloaded'?[['valid'],['next']]:bad==='length'?[['valid','x'.repeat(32768)]]:bad==='formula'?[['valid','='+ 'a'.repeat(8192)]]:bad==='columns'?[['valid','next']]:[['valid','next']]
  assert.throws(()=>batch.apply({sheet:'任务',row:0,column:bad==='columns'?255:0},matrix));assert.equal(drafts.value.size,1);assert.equal(drafts.value.get('old').input,'保留');assert.equal(history.value.length,0);assert.deepEqual(bindings.redoStack.value,['old'])
 }
})
test('actual filtered copy refuses unloaded pages and changed conditions without a clipboard write',async()=>{
 for(const mode of ['unloaded','stale','budget']){
  let writes=0;const errors=[],bindings={saving:box(false),updatingStructure:box(false),dataViewLoading:box(false),captureEditContext:()=>()=>true,activeDataRegion:box({range:{top:0,bottom:mode==='budget'?10000:2,left:0,right:0}}),filterColumn:box(-1),filterQuery:box(''),sortColumn:box(-1),sortDirection:box('asc'),drafts:box(new Map()),loadedRows:box(new Map(mode==='budget'?Array.from({length:10001},(_,i)=>[i,[]]):[[0,[]],[1,[]]])),dataViewRows:box(mode==='budget'?Array.from({length:10000},(_,i)=>i+1):[1]),MAX_DATA_VIEW_ROWS:50000,MAX_BATCH_CELLS:10000,prepareDataView:async()=>{if(mode==='stale')bindings.filterQuery.value='new'},clipboardCell:()=>assert.fail('Must validate before reading cells'),writeWorkbookClipboard:()=>writes++,message:{error:value=>errors.push(value),success:()=>assert.fail()}}
  const ctx=extract('copyDataResults','applyFreezePane',bindings,'globalThis.copy=copyDataResults');await ctx.copy();assert.equal(writes,0);assert.equal(errors.length,1)
 }
})
test('cut cannot clear a later edit while awaiting the clipboard receipt',async()=>{
 let finish,cleared=false;const warnings=[],drafts=box(new Map()),ctx=extract('cutSelection','styleAsPatch',{isExternal:box(false),saving:box(false),drafts,captureEditContext:()=>()=>true,copySelection:()=>new Promise(resolve=>finish=resolve),clearSelection:()=>{cleared=true},message:{warning:text=>warnings.push(text)}},'globalThis.cut=cutSelection')
 const pending=ctx.cut();drafts.value.set('current',{input:'复制等待期间的新草稿'});finish(true);await pending
 assert.equal(cleared,false);assert.equal(warnings.length,1);assert.equal(drafts.value.get('current').input,'复制等待期间的新草稿')
})
test('editing controls retain ordinary keys while an explicit save stays available',()=>{
 const calls=[],target={closest:()=>({})},bindings={formulaInputRef:box(null),saving:box(false),isExternal:box(false)}
 for(const name of ['copySelection','pasteSelection','cutSelection','clearSelection','undo','redo','selectCell','saveWorkbook'])bindings[name]=()=>calls.push(name)
 const ctx=extract('handleShortcut','warnBeforeUnload',{...bindings,useWindowDraft(){}},'globalThis.key=handleShortcut')
 for(const key of ['Delete','ArrowDown','ArrowRight','c','v','x','z','y'])ctx.key({key,target,ctrlKey:key.length===1,preventDefault(){assert.fail('Do not consume a control-owned key')}})
 assert.deepEqual(calls,[])
 ctx.key({key:'s',target,ctrlKey:true,preventDefault(){}});assert.deepEqual(calls,['saveWorkbook'])
})
test('trusted paste event data is forwarded without reading async clipboard permissions',()=>{
 const payloads=[],selectedCell=box({}),bindings={isExternal:box(false),saving:box(false),selectedCell,pasteSelection:payload=>payloads.push(payload)}
 const ctx=extract('handleWorkbookPaste','pasteSelection',bindings,'globalThis.paste=handleWorkbookPaste')
 const event=(types=['text/plain','text/html'],control=false)=>({target:{closest:()=>control?{}:null},clipboardData:{types,getData:type=>type==='text/plain'?'"会议\r\n备注"\t00123':'<table></table>'},preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}})
 const valid=event();ctx.paste(valid);assert.equal(valid.prevented,true);assert.equal(valid.stopped,true);assert.equal(payloads[0].text,'"会议\r\n备注"\t00123')
 for(const mode of ['control','empty','saving','external']){bindings.saving.value=mode==='saving';bindings.isExternal.value=mode==='external';const value=event(mode==='empty'?[]:['text/plain'],mode==='control');ctx.paste(value);assert.equal(payloads.length,1);if(mode==='control'||mode==='empty')assert.equal(value.prevented,undefined)}
 assert.ok(!fs.readFileSync('src/utils/workbookClipboard.ts','utf8').includes('await navigator.clipboard.read()'))
})
