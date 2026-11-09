import test from 'node:test'
import assert from 'node:assert/strict'
import {sourceDiagnosticLines} from '../src/mobile/sourceDiagnostic.ts'

test('补齐窗口在首行和末行仍给出三行真实上下文，默认窗口保持相邻行行为',()=>{
 const source='first\nsecond\nthird\nfourth'
 assert.deepEqual(sourceDiagnosticLines(source,0,100,true),[{number:1,text:'first',current:true},{number:2,text:'second',current:false},{number:3,text:'third',current:false}])
 assert.deepEqual(sourceDiagnosticLines(source,source.length,100,true),[{number:2,text:'second',current:false},{number:3,text:'third',current:false},{number:4,text:'fourth',current:true}])
 assert.deepEqual(sourceDiagnosticLines(source,0,100).map(x=>x.number),[1,2])
 assert.deepEqual(sourceDiagnosticLines(source,source.length,100).map(x=>x.number),[3,4])
})
test('BOM 和混合换行的补齐窗口仍标记原始偏移对应的行',()=>{
 const source='\uFEFFfirst\r\n第二😎\rthird\nfourth',offset=source.indexOf('😎')
 assert.deepEqual(sourceDiagnosticLines(source,offset,100,true),[{number:1,text:'first',current:false},{number:2,text:'第二😎',current:true},{number:3,text:'third',current:false}])
 assert.deepEqual(sourceDiagnosticLines(source,source.length,100,true).map(x=>[x.number,x.current]),[[2,false],[3,false],[4,true]])
})
test('补齐首行邻居时仍围绕真实列裁剪长 Unicode 行，不移动定位或拆代理对',()=>{
 const source='😎'.repeat(300)+'MARKER\nsecond\nthird\nfourth',offset=600
 const result=sourceDiagnosticLines(source,offset,2000,true)
 assert.equal(result.length,3);assert.equal(result[0].number,1);assert.equal(result[0].current,true);assert.ok(result[0].text.startsWith('…')&&result[0].text.endsWith('MARKER'))
 assert.ok(result.every(x=>x.text.isWellFormed()&&Array.from(x.text).length<=162))
})
test('短流、空末行、非法偏移与预算边界保持有界，不制造额外源行',()=>{
 assert.deepEqual(sourceDiagnosticLines('only',0,4,true),[{number:1,text:'only',current:true}])
 assert.deepEqual(sourceDiagnosticLines('one\ntwo\n',0,8,true).map(x=>[x.number,x.text]),[[1,'one'],[2,'two'],[3,'']])
 for(const at of [-1,2.5,99])assert.deepEqual(sourceDiagnosticLines('one',at,100,true),[])
 assert.deepEqual(sourceDiagnosticLines('one',0,2,true),[])
})
