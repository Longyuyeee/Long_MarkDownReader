import test from 'node:test'
import assert from 'node:assert/strict'
import {pdfAccess,readPdfAccess} from '../src/mobile/pdfPermissions.ts'
test('未设置权限的普通PDF照常复制与批注',()=>assert.deepEqual(pdfAccess(null),{known:true,copy:true,annotate:true,restricted:false}))
test('复制和批注独立判断，不因内容修改或辅助提取权限扩大',()=>{
 assert.deepEqual(pdfAccess([4,8,256,512]),{known:true,copy:false,annotate:false,restricted:true})
 assert.deepEqual(pdfAccess([16]),{known:true,copy:true,annotate:false,restricted:true})
 assert.deepEqual(pdfAccess([32]),{known:true,copy:false,annotate:true,restricted:true})
 assert.equal(pdfAccess([16,32]).restricted,false)
})
test('空权限列表可阅读，但不推定复制或批注允许',()=>assert.deepEqual(pdfAccess([]),{known:true,copy:false,annotate:false,restricted:true}))
test('权限缺失或格式损坏不能误作无限制，未知正标志不影响已知位',()=>{
 for(const value of [undefined,{},'16',[16,'32'],[-1],[NaN],[1.5]])assert.deepEqual(pdfAccess(value),{known:false,copy:false,annotate:false,restricted:true})
 assert.deepEqual(pdfAccess([16,32,16384]),{known:true,copy:true,annotate:true,restricted:false})
})
test('读取失败仍保留阅读路径，明确权限未确认而非允许复制',async()=>{
 assert.deepEqual(await readPdfAccess({getPermissions:async()=>{throw Error('worker stopped')}}),pdfAccess(undefined))
 assert.deepEqual(await readPdfAccess({getPermissions:async()=>[16]}),pdfAccess([16]))
})
test('一个文件的权限失败和限制不会污染后一个普通文件',async()=>{
 const limited=await readPdfAccess({getPermissions:async()=>[]}),plain=await readPdfAccess({getPermissions:async()=>null})
 assert.equal(limited.copy,false);assert.equal(plain.copy,true)
})
