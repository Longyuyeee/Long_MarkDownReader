import test from 'node:test'
import assert from 'node:assert/strict'
import {pdfRotation,rotatePdfPoint,rotatePdfRect,rotatePdfAnchor,sizePdfTextLayer} from '../src/mobile/pdfOrientation.ts'
import {readPdfPoint,savePdfPoint} from '../src/mobile/pdfDocument.ts'
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`)
test('仅接受整90度方向，左右旋转和完整一周规范化',()=>{
 for(const[n,want]of[[-90,270],[450,90],[-360,0],[720,0]])assert.equal(pdfRotation(n),want)
 for(const n of [NaN,Infinity,45,91,.5])assert.throws(()=>pdfRotation(n))
})
test('源坐标四角和内部焦点按顺时针转动，再逆向恢复',()=>{
 assert.deepEqual(rotatePdfPoint({x:.2,y:.3},90),{x:.7,y:.2})
 for(const p of [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:.19,y:.82}])for(const r of [0,90,180,270]){const q=rotatePdfPoint(rotatePdfPoint(p,r),-r);close(p.x,q.x);close(p.y,q.y)}
})
test('批注覆盖矩形旋转后仍覆盖正确原文，四方向反算保持sidecar坐标',()=>{
 const a={x:.1,y:.2,width:.3,height:.04};const b=rotatePdfRect(a,90)
 close(b.x,.76);close(b.y,.1);close(b.width,.04);close(b.height,.3)
 for(const r of [0,90,180,270]){const b=rotatePdfRect(rotatePdfRect(a,r),-r);for(const k of Object.keys(a))close(a[k],b[k])}
})
test('焦点旋转只改变纸内坐标，保持实际视口的像素位置且不改旧值',()=>{
 const a={page:{x:.2,y:.7},viewport:{x:170,y:240}},before=structuredClone(a),b=rotatePdfAnchor(a,90)
 close(b.page.x,.3);close(b.page.y,.2);assert.deepEqual(b.viewport,a.viewport);assert.deepEqual(a,before)
})
test('文字层使用旋转前尺寸，整层旋转后与画布相同，包括非零裁切的viewport',()=>{
 for(const rotation of [0,90,180,270]){const host={style:{setProperty(k,v){this[k]=v}}};sizePdfTextLayer(host,{width:rotation%180?580:460,height:rotation%180?460:580,rotation,scale:1});assert.equal(host.style.width,'460px');assert.equal(host.style.height,'580px');assert.equal(host.style['--total-scale-factor'],'1')}
})
test('文档方向兼容旧记录，方向错误不覆盖最后完成的阅读位置',()=>{
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}
 const old={fingerprint:'a'.repeat(64),page:3,fraction:.5,zoom:1.5,updated:1};savePdfPoint('old',old);assert.deepEqual(readPdfPoint('old'),old)
 const next={...old,rotation:270,mode:'continuous',pageOffset:.2};savePdfPoint('old',next);savePdfPoint('other',{...old,rotation:90});assert.deepEqual(readPdfPoint('old'),next)
 for(const r of [null,-90,360,45,'90',NaN])assert.throws(()=>savePdfPoint('old',{...next,rotation:r}));assert.deepEqual(readPdfPoint('old'),next)
})
