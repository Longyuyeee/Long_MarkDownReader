import assert from 'node:assert/strict'
import { reconcileTextSaveReceipt } from '../src/utils/textSaveReceipt.ts'
import { beginWindowSave, windowDraftCount, windowDraftActivity } from '../src/services/windowDrafts.ts'

assert.deepEqual(reconcileTextSaveReceipt('开会', '开会补充事项', '开会'), {
  content: '开会补充事项', isDirty: true,
})
assert.deepEqual(reconcileTextSaveReceipt('正文', '', '正文'), { content: '', isDirty: true })
assert.deepEqual(reconcileTextSaveReceipt('正文', '正文', '正文\n'), { content: '正文\n', isDirty: false })
// The next save acknowledges the retained draft, rather than resubmitting old text.
const first = reconcileTextSaveReceipt('第一稿', '第二稿', '第一稿')
assert.deepEqual(reconcileTextSaveReceipt(first.content, first.content, '第二稿'), {
  content: '第二稿', isDirty: false,
})
console.log('PASS: newer typing/deletion retained, normalization and subsequent save reconciled')

const revision = windowDraftActivity.value
const finishA = beginWindowSave()
const finishB = beginWindowSave()
assert.equal(windowDraftCount.value, 2)
finishA()
finishA()
assert.equal(windowDraftCount.value, 1)
finishB()
assert.equal(windowDraftCount.value, 0)
assert.equal(windowDraftActivity.value, revision + 4)
console.log('PASS: overlapping native saves retain window guard; release is idempotent')
