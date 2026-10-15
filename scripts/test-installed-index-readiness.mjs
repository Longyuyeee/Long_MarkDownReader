import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForInstalledIndex } from './lib/installed-index-readiness.mjs'

test('only an explicit busy precondition is awaited before a real ready rebuild', async () => {
  let calls = 0, time = 0, busy = 0
  const ready = { state: 'ready', sourceCount: 27 }
  const result = await waitForInstalledIndex(async () => {
    if (++calls < 3) throw Error('知识索引正在构建，请稍后再试')
    return ready
  }, { now: () => time, delay: async ms => { time += ms }, onBusy: () => { busy++ } })
  assert.equal(result, ready); assert.equal(calls, 3); assert.equal(busy, 2); assert.equal(time, 200)
})
test('a genuine native rebuild error is never retried', async () => {
  let calls = 0
  await assert.rejects(waitForInstalledIndex(async () => { calls++; throw Error('无法读取资料库') }), /无法读取资料库/)
  assert.equal(calls, 1)
})
test('a non-ready native result is a failure, not an invitation to retry', async () => {
  let calls = 0
  await assert.rejects(waitForInstalledIndex(async () => { calls++; return { state: 'error' } }), /未返回 ready/)
  assert.equal(calls, 1)
})
test('the existing wait budget is bounded and transport errors are not retried', async () => {
  let calls = 0, time = 0
  await assert.rejects(waitForInstalledIndex(async () => { calls++; throw Error('知识索引正在构建，请稍后再试') }, { timeoutMs: 250, now: () => time, delay: async ms => { time += ms } }), /超时/)
  assert.equal(time, 250); assert.equal(calls, 3)
  calls = 0
  await assert.rejects(waitForInstalledIndex(async () => { calls++; throw Error('Timed out after 60000 ms: installed CDP Runtime.evaluate') }), /Runtime.evaluate/)
  assert.equal(calls, 1)
})
