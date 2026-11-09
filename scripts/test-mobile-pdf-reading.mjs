import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pdfLimit,pdfSupported,validatePdfBytes,pdfCanvasSize,pdfPageNumber,pdfScrollFraction,readPdfPoint,savePdfPoint,searchPdfPages} from '../src/mobile/pdfDocument.ts'
const fingerprint='a'.repeat(64),point={fingerprint,page:3,fraction:.65,zoom:1.5,updated:10}
function store(initial){const data=new Map(Object.entries(initial||{}));globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};return data}
test('滚动回弹和小数边界归一化，不因负值或略超末端拒绝保存，非滚动页面停在零位置',()=>{
 assert.equal(pdfScrollFraction(-.75,1000,500),0);assert.equal(pdfScrollFraction(500.4,1000,500),1);assert.equal(pdfScrollFraction(250,1000,500),.5);assert.equal(pdfScrollFraction(.5,500,500),0);assert.throws(()=>pdfScrollFraction(NaN,1000,500))
})
test('PDF 二进制独立于 UTF-8 文本：真实夹具不改写，拒绝错误文件头、空文件及超过 20 MiB',()=>{
 const bytes=readFileSync('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf');validatePdfBytes(bytes);assert.ok(bytes.includes(0));assert.ok(pdfSupported('资料.PDF'));assert.ok(!pdfSupported('资料.pdf.exe'));for(const b of [Buffer.alloc(0),Buffer.from('hello PDF'),Buffer.alloc(pdfLimit+1)])assert.throws(()=>validatePdfBytes(b));assert.equal(bytes.subarray(0,5).toString(),'%PDF-')
})
test('PDF 页码仅接受实际范围内的正整数，拒绝符号、小数和越界输入',()=>{
 assert.equal(pdfPageNumber(' 2 ',3),2);for(const v of ['0','-1','4','1.2','abc','9999999','1e1',''])assert.throws(()=>pdfPageNumber(v,3))
})
test('PDF 缩放在手机和平板及极端长页下始终限制画布像素与单边尺寸',()=>{
 for(const [w,h,avail,z,dpr] of [[420,660,358,1,3],[420,660,768,3,4],[100,1e8,390,3,4],[1e8,100,390,1,1]]){const c=pdfCanvasSize(w,h,avail,z,dpr);assert.ok(c.width*c.height<=4_000_000);assert.ok(c.width<=8192&&c.height<=8192);assert.ok(c.width>=1&&c.height>=1)}
 for(const v of [0,-1,NaN,Infinity])assert.throws(()=>pdfCanvasSize(v,600,358,1,2))
})
test('阅读位置按文档身份隔离，保留指纹、页码、缩放与页内位置，最多 100 条',()=>{
 store();savePdfPoint('one',point);savePdfPoint('two',{...point,page:1,fingerprint:'b'.repeat(64)});assert.deepEqual(readPdfPoint('one'),point);assert.equal(readPdfPoint('two').page,1);for(let i=0;i<110;i++)savePdfPoint('entry'+i,{...point,updated:i+100});assert.equal(readPdfPoint('one'),null);assert.equal(readPdfPoint('entry109').updated,209)
})
test('损坏和配额失败不覆盖此前位置，异常位置不会被采纳',()=>{
 const data=store({'longedit-mobile-pdf-reading-v1':'not json'});assert.equal(readPdfPoint('one'),null);assert.throws(()=>savePdfPoint('one',point));assert.equal(data.get('longedit-mobile-pdf-reading-v1'),'not json');store();savePdfPoint('one',point);localStorage.setItem=()=>{throw Error('quota')};assert.throws(()=>savePdfPoint('one',{...point,page:2}));assert.deepEqual(readPdfPoint('one'),point);for(const p of [{...point,page:0},{...point,fraction:1.1},{...point,zoom:4},{...point,fingerprint:'x'}])assert.throws(()=>savePdfPoint('one',p))
})
test('逐页查找保持页码和文字片段，大小写、中文及文本标记作为普通文字',async()=>{
 const pages=['Quiet quiet reading','中文安静阅读','<img src=x> QUIET'],seen=[];const r=await searchPdfPages(3,'quiet',async n=>{seen.push(n);return pages[n-1]},()=>false,()=>{});assert.deepEqual(seen,[1,2,3]);assert.equal(r.matches,3);assert.equal(r.partial,false);assert.deepEqual(r.results.map(r=>r.page),[1,3]);const c=await searchPdfPages(3,'安静',async n=>pages[n-1],()=>false,()=>{});assert.equal(c.results[0].page,2);const literal=await searchPdfPages(3,'<img',async n=>pages[n-1],()=>false,()=>{});assert.equal(literal.results[0].page,3)
})
test('取消中的查找不发布延迟页结果，已检查页数不包含中途取消的页',async()=>{
 let cancel=false,release;const gate=new Promise(r=>{release=r}),progress=[];const pending=searchPdfPages(3,'x',async()=>{await gate;return'x'},()=>cancel,n=>progress.push(n));cancel=true;release();const r=await pending;assert.equal(r.cancelled,true);assert.equal(r.checked,0);assert.deepEqual(r.results,[]);assert.deepEqual(progress,[])
})
test('全文查找明确限制 500 页、字符预算和命中数，预算后的页不会被读取',async()=>{
 let reads=0;let r=await searchPdfPages(501,'x',async()=>{reads++;return'none'},()=>false,()=>{});assert.equal(reads,500);assert.equal(r.partial,true);assert.equal(r.checked,500);reads=0;r=await searchPdfPages(20,'x',async()=>{reads++;return'x'.repeat(1001)},()=>false,()=>{});assert.equal(reads,1);assert.equal(r.matches,1000);assert.ok(r.partial);reads=0;r=await searchPdfPages(100,'z',async()=>{reads++;return'a'.repeat(200000)},()=>false,()=>{});assert.equal(reads,11);assert.equal(r.checked,11);assert.ok(r.partial)
})
test('提取失败和无效查询不会被报告为完整无匹配结果',async()=>{
 await assert.rejects(searchPdfPages(3,'needle',async()=>{throw Error('damaged page')},()=>false,()=>{}),/damaged/);for(const q of ['', ' '.repeat(3),'x'.repeat(121)])await assert.rejects(searchPdfPages(1,q,async()=>'',()=>false,()=>{}))
})
