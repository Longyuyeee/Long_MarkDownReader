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
