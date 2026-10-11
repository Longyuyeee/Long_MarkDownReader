import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { workbookHarness } from './test-structured-save-baseline.mjs'
const source = fs.readFileSync('src/views/WorkbookView.vue', 'utf8')
const harness = () => workbookHarness(source)

test('workbook receipt cannot overwrite replacement document or its drafts/history', async () => {
  const h = harness(); const pending = h.ctx.saveAction()
  assert.equal(h.ctx.windowSaves, 1)
  const other = { signature: 'other-book' }
  const drafts = new Map([['other', { value: '另一本工作簿的新修改' }]])
  h.ctx.workbook.value = other; h.ctx.workbookPath.value = 'other.xlsx'
  h.ctx.drafts.value = drafts; h.ctx.undoStack.value = ['other-history']
  h.resolve({ signature: 'saved-first' }); await pending
  assert.equal(h.ctx.workbook.value, other); assert.equal(h.ctx.drafts.value, drafts)
  assert.equal(h.ctx.undoStack.value[0], 'other-history')
  assert.equal(h.ctx.windowSaves, 0); assert.deepEqual(h.errors, [])
})
test('document reload or unmount invalidates receipt even when path stays the same', async () => {
  const h = harness(); const pending = h.ctx.saveAction()
  h.ctx.workbookDocumentEpoch++
  h.resolve({ signature: 'saved' }); await pending
  assert.equal(h.ctx.workbook.value.signature, 'old')
  assert.equal(h.ctx.drafts.value.size, 1); assert.equal(h.ctx.windowSaves, 0)
})
test('sheet generation alone does not invalidate document receipt', async () => {
  const h = harness(); const pending = h.ctx.saveAction()
  h.ctx.generation++
  h.resolve({ signature: 'saved' }); await pending
  assert.equal(h.ctx.workbook.value.signature, 'saved')
  assert.equal(h.ctx.windowSaves, 0); assert.deepEqual(h.errors, [])
})
test('failure after navigation reports original filename and releases pending guard', async () => {
  const h = harness(); const pending = h.ctx.saveAction()
  h.ctx.workbookPath.value = 'other.xlsx'; h.ctx.workbookDocumentEpoch++
  h.reject(new Error('模拟磁盘失败')); await pending
  assert.equal(h.ctx.drafts.value.size, 1); assert.equal(h.ctx.windowSaves, 0)
  assert.match(h.errors[0], /tasks\.xlsx 保存失败/)
})
test('load and unmount invalidate the dedicated document epoch', () => {
  assert.match(source, /const loadWorkbook = async \(\) => \{\s*workbookDocumentEpoch \+= 1/)
  assert.match(source, /onBeforeUnmount\(\(\) => \{\s*workbookDocumentEpoch \+= 1/)
})
