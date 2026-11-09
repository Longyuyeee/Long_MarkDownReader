import test from 'node:test'
import assert from 'node:assert/strict'
import {pdfZoom,pdfTouchPair,pdfAnchorAt,pdfAnchorScroll,pdfPinchPreview} from '../src/mobile/pdfGestures.ts'
import {readPdfPoint,savePdfPoint} from '../src/mobile/pdfDocument.ts'
test('双指几何使用 CSS 像素，不依赖触摸顺序或画布 DPR',()=>{
 assert.deepEqual(pdfTouchPair({x:10,y:40},{x:70,y:120}),{center:{x:40,y:80},distance:100});assert.deepEqual(pdfTouchPair({x:70,y:120},{x:10,y:40}),{center:{x:40,y:80},distance:100})
})
test('缩放限定 1 到 3 倍且消除累积浮点噪声',()=>{
 assert.equal(pdfZoom(.2),1);assert.equal(pdfZoom(6),3);assert.equal(pdfZoom(1.499999),1.5);assert.equal(pdfZoom(NaN),1)
})
test('以页内归一位置记录双指焦点，纸外触点夹紧且异常尺寸拒绝',()=>{
 assert.deepEqual(pdfAnchorAt({x:100,y:250},{x:20,y:50,width:200,height:400},{x:0,y:100}),{page:{x:.4,y:.5},viewport:{x:100,y:150}});assert.equal(pdfAnchorAt({x:-10,y:999},{x:0,y:0,width:200,height:400},{x:0,y:0}).page.y,1);assert.throws(()=>pdfAnchorAt({x:0,y:0},{x:0,y:0,width:0,height:10},{x:0,y:0}))
})
test('重绘后横纵滚动保持同一原文焦点；页边不滚入空白',()=>{
 const a={page:{x:.5,y:.5},viewport:{x:150,y:200}},v={x:0,y:100,width:300,height:400}
 assert.deepEqual(pdfAnchorScroll(a,{x:16,y:112,width:600,height:1000},{x:0,y:0},v,{x:632,y:1024}),{x:166,y:312});assert.deepEqual(pdfAnchorScroll(a,{x:16,y:112,width:200,height:300},{x:0,y:0},v,{x:300,y:400}),{x:0,y:0})
})
test('手势预览包含两指平移，焦点恰好落在手指中点',()=>{
 const box={x:16,y:-40,width:358,height:562},anchor={page:{x:.5,y:.6},viewport:{x:190,y:240}},host={x:0,y:100},s=1.5
 const p=pdfPinchPreview(anchor,box,anchor.viewport,host,s)
 assert.equal(box.x+p.x+anchor.page.x*box.width*s,190);assert.equal(box.y+p.y+anchor.page.y*box.height*s,340)
})
test('横向阅读位置可选且向后兼容旧记录，拒绝越界而不覆盖旧值',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}
 const p={fingerprint:'a'.repeat(64),page:2,fraction:.4,zoom:2,updated:1};savePdfPoint('old',p);assert.deepEqual(readPdfPoint('old'),p);savePdfPoint('new',{...p,horizontal:.75});assert.equal(readPdfPoint('new').horizontal,.75);for(const horizontal of [-1,1.01,NaN,null])assert.throws(()=>savePdfPoint('new',{...p,horizontal}));assert.equal(readPdfPoint('new').horizontal,.75)
})
