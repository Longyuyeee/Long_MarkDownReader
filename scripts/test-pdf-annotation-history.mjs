import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {test} from 'node:test'
const exports={};vm.runInNewContext(ts.transpile(fs.readFileSync('src/utils/pdfAnnotationHistory.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports})
const {PdfAnnotationHistory}=exports, a=(id='a',comment='original')=>({id,kind:'comment',page:1,color:'blue',rects:[],quote:'',comment,createdAt:1,updatedAt:1})
const change=(before,after,extra={})=>({before,after,index:0,label:'编辑评论',selectedBefore:'a',selectedAfter:'a',...extra})
test('accidental deletion restores exact annotation, order and selection; redo removes it',()=>{
 const h=new PdfAnnotationHistory(),items=[a(),a('b')];h.record('pdf1',change(items[0],null,{label:'删除批注',selectedAfter:''}));const r=h.apply('pdf1',[items[1]],'undo');assert.equal(JSON.stringify(r.annotations),JSON.stringify(items));assert.equal(r.selected,'a');assert.equal(h.redoLabel,'删除批注');assert.equal(h.apply('pdf1',r.annotations,'redo').annotations[0].id,'b')
})
test('continuous comment input coalesces, save ticks do not divide the edit, blur and other operations do',()=>{
 const h=new PdfAnnotationHistory(),b=a(),c=a('a','one'),d=a('a','one two');h.record('pdf',change(b,c,{group:'comment:a'}));h.record('pdf',change(c,d,{group:'comment:a'}));let r=h.apply('pdf',[d],'undo');assert.equal(r.annotations[0].comment,'original');r=h.apply('pdf',r.annotations,'redo');h.endGroup();const e=a('a','last');h.record('pdf',change(d,e,{group:'comment:a'}));assert.equal(h.apply('pdf',[e],'undo').annotations[0].comment,'one two')
})
test('source changes and externally changed in-memory annotations cannot receive old history',()=>{
 const h=new PdfAnnotationHistory();h.record('pdf1',change(a(),a('a','edit')));assert.equal(h.apply('pdf2',[a('a','edit')],'undo'),null);assert.equal(h.undoLabel,'');h.record('pdf2',change(a(),a('a','edit')));assert.equal(h.apply('pdf2',[a('a','external')],'undo'),null);assert.equal(h.redoLabel,'')
})
test('new operation drops redo; added annotation and color change use their own named entries',()=>{
 const h=new PdfAnnotationHistory(),b=a(),c={...b,color:'pink'};h.record('pdf',change(null,b,{label:'新增批注',selectedBefore:''}));h.record('pdf',change(b,c,{label:'修改颜色'}));const r=h.apply('pdf',[c],'undo');assert.equal(r.annotations[0].color,'blue');h.record('pdf',change(b,a('a','new')));assert.equal(h.redoLabel,'');assert.equal(h.apply('pdf',[a('a','new')],'undo').annotations[0].comment,'original')
})
test('history is bounded, detached from live values and never requires browser storage',()=>{
 const h=new PdfAnnotationHistory();for(let n=0;n<100;n++){const b=a('a',String(n)),c=a('a',String(n+1));h.record('pdf',change(b,c));c.comment='mutated'}let items=[a('a','100')],count=0;while(h.undoLabel){const r=h.apply('pdf',items,'undo');assert.ok(r);items=r.annotations;count++}assert.equal(count,80);assert.equal(items[0].comment,'20')
})

test('batch removal restores non-adjacent annotations in order and the checked set in one step',()=>{
 const h=new PdfAnnotationHistory(),items=['a','b','c','d','e'].map(id=>a(id)),ids=['d','b']
 h.recordBatch('pdf',[3,1].map(index=>({before:items[index],after:null,index})),{label:'删除 2 条批注',selectedBefore:'d',selectedAfter:'',readingBefore:ids,readingAfter:[]})
 const restored=h.apply('pdf',items.filter(item=>!ids.includes(item.id)),'undo');assert.equal(JSON.stringify(restored.annotations),JSON.stringify(items));assert.equal(JSON.stringify(restored.reading),JSON.stringify(ids));assert.equal(restored.selected,'d');assert.equal(h.undoLabel,'')
 const redo=h.apply('pdf',restored.annotations,'redo');assert.equal(redo.annotations.map(item=>item.id).join(','),'a,c,e');assert.equal(JSON.stringify(redo.reading),'[]')
})

test('batch recolor is atomic, leaves unchanged colors out and refuses partial external divergence',()=>{
 const h=new PdfAnnotationHistory(),items=['a','b','c'].map(id=>a(id)),changed=items.map(item=>item.id==='c'?item:{...item,color:'pink'})
 h.recordBatch('pdf',[0,1].map(index=>({before:items[index],after:changed[index],index})),{label:'统一改色 2 条批注',selectedBefore:'a',selectedAfter:'a',readingBefore:['a','b'],readingAfter:['a','b']})
 assert.equal(JSON.stringify(h.apply('pdf',changed,'undo').annotations),JSON.stringify(items));assert.equal(JSON.stringify(h.apply('pdf',items,'redo').annotations),JSON.stringify(changed))
 const external=changed.map(item=>item.id==='b'?{...item,comment:'external'}:item),before=JSON.stringify(external);assert.equal(h.apply('pdf',external,'undo'),null);assert.equal(JSON.stringify(external),before);assert.equal(h.undoLabel,'')
})

test('a full 200-item batch with long comments remains undoable while older steps are evicted',()=>{
 const h=new PdfAnnotationHistory(),items=Array.from({length:200},(_,i)=>a(String(i),'评'.repeat(20000))),changed=items.map(item=>({...item,color:'pink'}))
 h.record('pdf',change(a(),a('a','older')))
 h.recordBatch('pdf',items.map((before,index)=>({before,after:changed[index],index})),{label:'统一改色 200 条批注',selectedBefore:'0',selectedAfter:'0'})
 assert.equal(h.undoLabel,'统一改色 200 条批注');assert.equal(JSON.stringify(h.apply('pdf',changed,'undo').annotations),JSON.stringify(items));assert.equal(h.undoLabel,'')
})

test('batch confirmation cancellation, changed selection, changed source and changed comments never apply stale work',async()=>{
 const source=fs.readFileSync('src/views/PdfView.vue','utf8'),start=source.indexOf('const changeAnnotationBatch = async'),end=source.indexOf('\nconst handleAnnotationAction',start),body=source.slice(start,end)
 for(const mutation of ['cancel','selection','source','comment']){
  let writes=0,warnings=0,owner='original'
  const doc={annotations:[a(),a('b')]},context={JSON,Set,Map,Date,annotationOwner:()=>owner,annotationDocument:{value:doc},readingSelection:{value:['a','b']},hiddenReadingSelection:{value:1},selectedAnnotationId:{value:'a'},annotationColors:['yellow','green','pink','blue'],dialog:{},message:{warning(){warnings++}},annotationHistory:{recordBatch(){writes++}},scheduleAnnotationSave(){writes++}}
  context.confirmAppAction=async()=>{if(mutation==='selection')context.readingSelection.value=['a'];if(mutation==='source')owner='other';if(mutation==='comment')doc.annotations[0].comment='new draft';return mutation!=='cancel'}
  vm.runInNewContext(ts.transpile(body+'\nglobalThis.runBatch=changeAnnotationBatch',{target:ts.ScriptTarget.ES2022}),context);await context.runBatch('batch-delete');assert.equal(writes,0,mutation);assert.equal(doc.annotations.length,2,mutation);assert.equal(warnings,mutation==='cancel'?0:1)
 }
})
test('same-file reference reload keeps unsaved annotations when the current save fails',async()=>{
 const source=fs.readFileSync('src/views/PdfView.vue','utf8'),body=source.slice(source.indexOf('const loadPdf = async () => {'),source.indexOf('\nconst goToPage =',source.indexOf('const loadPdf = async () => {')))
 const ref=value=>({value}),context={console,JSON,String,Number,Date,Math,Map,Set,Promise,performance:{now:()=>1},window:{clearTimeout(){}},rememberPdfViewState(){},recallWorkspaceViewState(){},annotationHistory:{reset(){}},cancelOcr:async()=>{},persistAnnotations:async()=>{},pdfPath:ref('C:/same.pdf'),annotationDirty:ref(true),annotationSaveError:ref('save failed'),sidebarOpen:ref(false),sidebarTab:ref('thumbnails'),message:{error(){}},pdfLoadGeneration:0,ocrGeneration:0,annotationLoadGeneration:0,pdfFormInspectionGeneration:0,viewSaveTimer:0,annotationSaveTimer:0,annotationScrollTop:0,referenceGeneration:0,restoringPdfView:false}
 for(const name of ['loading','referenceWorking','readingPreviewOpen','readingSnapshot','readingSelection','readingListPage','annotationQuery','annotationPages','annotationKindFilter','annotationColorFilter','error','firstPageReadyMs','loadProgress','outline'])context[name]=ref(null)
 let discarded=false;const original={annotations:[a('a','UNSAVED COMMENT')]};context.annotationDocument={get value(){return original},set value(next){discarded=true;throw Error('model reset before pending comment saved')}}
 const js=ts.transpile(body+'\nglobalThis.runReload=loadPdf',{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022});vm.runInNewContext(js,context);await context.runReload();assert.equal(discarded,false);assert.equal(context.annotationDocument.value.annotations[0].comment,'UNSAVED COMMENT')
})
