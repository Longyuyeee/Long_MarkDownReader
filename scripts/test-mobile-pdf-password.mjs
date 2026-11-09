import test from 'node:test'
import assert from 'node:assert/strict'
import {createPdfPasswordGate} from '../src/mobile/pdfPassword.ts'

test('密码回调一次提交，双击不会把同一挑战提交两次',()=>{
 const phases=[],attempts=[],gate=createPdfPasswordGate(p=>phases.push(p))
 gate.request(p=>attempts.push(p),1);assert.equal(gate.submit('A-2026'),true);assert.equal(gate.submit('another'),false)
 assert.deepEqual(attempts,['A-2026']);assert.deepEqual(phases,['required','checking'])
})
test('错误挑战允许重试，回调替换后只提交给最新挑战',()=>{
 const phases=[],attempts=[],gate=createPdfPasswordGate(p=>phases.push(p))
 gate.request(p=>attempts.push('stale:'+p),1);gate.request(p=>attempts.push(p),2);gate.submit('correct')
 assert.deepEqual(phases,['required','incorrect','checking']);assert.deepEqual(attempts,['correct'])
})
test('取消及文档切换废弃回调，后续提交不再触碰旧任务',()=>{
 const calls=[],gate=createPdfPasswordGate(()=>{})
 gate.request(p=>calls.push(p),1);gate.clear();assert.equal(gate.submit('old'),false)
 gate.request(p=>calls.push(p),1);gate.submit('new');assert.deepEqual(calls,['new'])
})
test('不裁剪空格或改变大小写，只拦截完全空输入',()=>{
 const calls=[],gate=createPdfPasswordGate(()=>{})
 gate.request(p=>calls.push(p),1);assert.equal(gate.submit(''),false);gate.submit(' Pass Word ')
 assert.deepEqual(calls,[' Pass Word ']);gate.request(p=>calls.push(p),1);gate.submit(' ');assert.equal(calls[1],' ')
})
test('成功后清理及旧检查返回的异常不保留可再次提交的回调',()=>{
 const phases=[],gate=createPdfPasswordGate(p=>phases.push(p))
 gate.request(()=>{throw Error('disposed worker')},1);assert.throws(()=>gate.submit('sample'));assert.equal(gate.submit('sample'),false)
 gate.clear();assert.equal(phases.at(-1),'idle')
})
