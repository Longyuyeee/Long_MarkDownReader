import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { tableHarness } from './test-structured-save-baseline.mjs'
const source = fs.readFileSync('src/views/TableView.vue', 'utf8')
const harness = () => tableHarness(source)

test('current Table keeps newer edits dirty and advances the disk signature', async () => {
  const h = harness(); const saving = h.ctx.saveAction()
  assert.equal(h.ctx.windowSaves, 1)
  h.ctx.table.value.rows[0][0] = '保存时补充客户要求'; h.ctx.editRevision++
  assert.equal(h.submitted().payload.rows[0][0], '先确认交付日期')
  h.resolve({ signature: 'new', size: 20 }); await saving
  assert.equal(h.ctx.dirty.value, true); assert.equal(h.tab.isDirty, true)
  assert.equal(h.ctx.table.value.signature, 'new')
  assert.match(h.ctx.notice.value, /新增修改尚未保存/)
  assert.equal(h.ctx.windowSaves, 0); assert.deepEqual(h.errors, [])
})
test('current Table only marks unchanged submitted draft saved', async () => {
  const h = harness(); const saving = h.ctx.saveAction()
  h.resolve({ signature: 'new', size: 20 }); await saving
  assert.equal(h.ctx.dirty.value, false); assert.equal(h.tab.isDirty, false)
  assert.equal(h.ctx.windowSaves, 0); assert.deepEqual(h.errors, [])
})
test('current Table receipt cannot change another document or a destroyed view', async () => {
  for (const destroy of [false, true]) {
    const h = harness(); const saving = h.ctx.saveAction()
    if (destroy) h.ctx.loadGeneration++
    else { h.ctx.tablePath.value = 'other.csv'; h.ctx.table.value = { signature: 'other', rows: [] } }
    h.ctx.notice.value = '当前页面状态'
    h.resolve({ signature: 'new', size: 20 }); await saving
    assert.equal(h.ctx.table.value.signature, destroy ? 'old' : 'other')
    assert.equal(h.ctx.notice.value, '当前页面状态'); assert.equal(h.tab.isDirty, true)
    assert.equal(h.ctx.windowSaves, 0); assert.deepEqual(h.errors, [])
  }
})
test('current Table failure retains edits and releases window guard', async () => {
  const h = harness(); const saving = h.ctx.saveAction()
  h.reject(new Error('磁盘写入失败')); await saving
  assert.equal(h.ctx.dirty.value, true); assert.equal(h.ctx.windowSaves, 0)
  assert.equal(h.ctx.saving.value, false); assert.equal(h.errors.length, 1)
})
test('external confirmation prevents duplicate requests and rejects stale context', async () => {
  const h = harness(); h.ctx.isExternal.value = true; h.ctx.formatLabel = { value: 'CSV' }
  let confirm, dialogs = 0
  h.ctx.dialog = { warning: options => { dialogs++; confirm = options.onPositiveClick } }
  const saving = h.ctx.saveAction(); await h.ctx.saveAction()
  assert.equal(dialogs, 1); assert.equal(h.ctx.windowSaves, 0)
  h.ctx.tablePath.value = 'other.csv'; confirm(); await saving
  assert.equal(h.submitted(), undefined); assert.equal(h.ctx.saving.value, false)
})
test('markDirty reports every edit and unmount invalidates receipts', () => {
  assert.match(source, /const markDirty = \(\) => \{\s*editRevision \+= 1/)
  assert.match(source.slice(source.indexOf('const markDirty'), source.indexOf('const captureActiveView')), /recordWindowDraftActivity\(\)/)
  assert.match(source, /onBeforeUnmount\(\(\) => \{\s*\+\+loadGeneration/)
})
