import assert from 'node:assert/strict'
import {test} from 'node:test'
import {observedNativeCommand} from './lib/observed-native-command.mjs'
// Protocol-only unit simulation; not installed/native acceptance.
const evaluateWith=invoke=>expression=>Function('window','return '+expression)({__TAURI_INTERNALS__:{invoke}})
test('observed native command preserves successful native values and quoted arguments',async()=>{
 await assert.doesNotReject(async()=>assert.deepEqual(await observedNativeCommand(evaluateWith(async(command,args)=>({command,args})),'read"quoted',{path:'C:\\资料\\a.md'}),{command:'read"quoted',args:{path:'C:\\资料\\a.md'}}))
 assert.equal(await observedNativeCommand(evaluateWith(async()=>undefined),'empty'),undefined)
})
test('observed native command retains raw string rejection, not generic CDP promise text',async()=>{
 const original='以下文档有未保存内容，本次未修改：C:\\资料\\笔记003.md'
 await assert.rejects(()=>observedNativeCommand(evaluateWith(async()=>{throw original}),'apply_tag_edit'),error=>error.message===original&&error.nativeError===original)
})
test('observed native command retains structured rejection code and original message',async()=>{
 const original={code:'forbidden',message:'只能在主工作台操作'}
 await assert.rejects(()=>observedNativeCommand(evaluateWith(async()=>{throw original}),'search_collection_page'),error=>error.message===original.message&&error.nativeError.code==='forbidden')
})
