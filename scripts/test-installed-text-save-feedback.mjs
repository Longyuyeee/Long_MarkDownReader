import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

// Exercise the actual installed runner's decision, not a second implementation.
const source = fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs', 'utf8')
const start = source.indexOf('if (textSaveFeedback.failed')
const end = source.indexOf("checks.push({ id: 'installed-txt-read-edit-save-reopen'", start)
assert.ok(start > 0 && end > start, 'installed feedback guard must exist')
const guard = source.slice(start, end)
const evaluate = feedback => vm.runInNewContext(guard, { textSaveFeedback: feedback })

test('installed runner rejects the original visible save error even when disk content exists', () => {
  assert.throws(() => evaluate({ failed: true, identity: '客户会议纪要.txt 纯文本 · 未保存' }), /failure feedback/)
  assert.throws(() => evaluate({ failed: true, identity: '客户会议纪要.txt 纯文本 · 已同步' }), /failure feedback/)
})

test('installed runner rejects dirty, missing and contradictory save identities', () => {
  for (const identity of ['客户会议纪要.txt 纯文本 · 未保存', '', '客户会议纪要.txt', '已同步 未保存']) {
    assert.throws(() => evaluate({ failed: false, identity }), /unsaved state/)
  }
})

test('installed runner accepts synchronized identity only without visible save failure', () => {
  assert.doesNotThrow(() => evaluate({ failed: false, identity: '客户会议纪要.txt 纯文本 · 已同步' }))
})

test('installed runner preserves the screenshot before feedback rejection and records pass afterward', () => {
  const capture = source.indexOf("await capture('installed-txt-save-reopen.jpg')")
  const feedback = source.indexOf('const textSaveFeedback = await evaluate(')
  assert.ok(capture >= 0 && capture < feedback && feedback < start && start < end)
  const collection = source.slice(feedback, start)
  assert.ok(collection.includes("document.body.innerText.includes('保存失败')"))
  assert.ok(collection.includes("document.querySelector('.text-workspace .document-title')?.textContent || ''"))
})
