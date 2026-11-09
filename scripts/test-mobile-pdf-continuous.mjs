import test from 'node:test'
import assert from 'node:assert/strict'
import {continuousCanvasSize,continuousCurrent,continuousEdge,continuousOffset,continuousPageLimit,continuousPagePixels,continuousMetricsLimit,continuousRenderQueue} from '../src/mobile/pdfContinuous.ts'
import {readPdfPoint,savePdfPoint} from '../src/mobile/pdfDocument.ts'
test('连续页面独立像素预算与总页面数上限，普通/极长/极宽页不超边长和总像素',()=>{
 assert.equal(continuousPageLimit,8);assert.equal(continuousMetricsLimit,128)
 for(const[w,h,a,z,d]of[[420,660,358,1,3],[420,660,358,3,4],[100,1e8,390,3,4],[1e8,100,390,1,1]]){const s=continuousCanvasSize(w,h,a,z,d);assert.ok(s.width*s.height<=continuousPagePixels);assert.ok(s.width<=8192&&s.height<=8192);assert.ok(s.width*s.height*continuousPageLimit<=12_000_000)}
})
test('当前页按可见纸面面积判断，平局稳定取前页、没有纸面不越界',()=>{
 const boxes=[{page:7,top:-300,bottom:200,height:500},{page:8,top:240,bottom:740,height:500}]
 assert.equal(continuousCurrent(boxes,0,600),8);assert.equal(continuousCurrent(boxes,0,440),7);assert.equal(continuousCurrent([],0,600),1)
})
test('页隙和跨页上沿选择最近实际纸面，不将整段窗口比例当作文档位置',()=>{
 const boxes=[{page:2,top:0,bottom:500,height:500},{page:3,top:540,bottom:1040,height:500}]
 assert.equal(continuousEdge(boxes,510).page,2);assert.equal(continuousEdge(boxes,535).page,3);assert.equal(continuousEdge(boxes,800).page,3);assert.equal(continuousEdge([],10),undefined)
})
test('保存相对页内位置与固定大小页隙，重建原文上沿不累计偏移',()=>{
 for(const[top,height,line]of[[100,500,250],[100,500,80],[100,500,620]]){const p=continuousOffset(top,height,line);assert.ok(p.offset>=0&&p.offset<=1);assert.equal(top+p.offset*height+p.inset,line)}
})
test('连续记录兼容旧逐页位置，阅读方式和页内锚点隔离、拒绝损坏值不覆盖',()=>{
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}
 const old={fingerprint:'a'.repeat(64),page:4,fraction:.5,zoom:1.25,updated:1};savePdfPoint('one',old);assert.deepEqual(readPdfPoint('one'),old)
 const current={...old,mode:'continuous',pageOffset:.6,pageInset:-20,horizontal:.2};savePdfPoint('one',current);assert.deepEqual(readPdfPoint('one'),current)
 for(const value of [{mode:'other'},{pageOffset:1.01},{pageOffset:-.1},{pageOffset:NaN},{pageInset:Infinity},{pageInset:4097},{pageInset:null}])assert.throws(()=>savePdfPoint('one',{...current,...value}))
 assert.deepEqual(readPdfPoint('one'),current)
})
test('页面顺序渲染先服务当前页，任一页面失败不阻塞后续页面',async()=>{
 const schedule=continuousRenderQueue(),seen=[];let active=0,maximum=0
 const work=(name,fail=false)=>async()=>{active++;maximum=Math.max(maximum,active);seen.push(name);await Promise.resolve();active--;if(fail)throw Error(name)}
 const first=schedule(work('neighbor'),1),current=schedule(work('current'),0),failed=schedule(work('failed',true),1).catch(e=>e.message),last=schedule(work('last'),1)
 await Promise.all([first,current,failed,last]);assert.deepEqual(seen,['current','neighbor','failed','last']);assert.equal(maximum,1)
})
