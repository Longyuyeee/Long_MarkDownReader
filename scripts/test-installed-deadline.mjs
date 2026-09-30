import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withDeadline } from './lib/with-deadline.mjs'

test('a WebView promise that never returns fails with its phase instead of hanging CI', async () => {
  await assert.rejects(withDeadline(() => new Promise(() => {}), 10, 'Markdown frame sampling'), /Markdown frame sampling/)
})
test('completed work preserves its result', async () => {
  assert.equal(await withDeadline(() => Promise.resolve('done'), 1000, 'test'), 'done')
})
test('underlying failures are retained', async () => {
  await assert.rejects(withDeadline(() => { throw Error('native error') }, 1000, 'test'), /native error/)
})
