// Historical defect evidence, NOT acceptance tests for the current editors.
// Pin the audited implementation so a later fix never needs to preserve the bug.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const baseline = 'ce633e17'
const box = value => ({ value })
function harness(file, name, next, bindings) {
  const source = execFileSync('git', ['show', `${baseline}:src/views/${file}.vue`], { encoding: 'utf8' })
  const start = source.indexOf(`const ${name} = async () => {`)
  const end = source.indexOf(`const ${next}`, start)
  assert.ok(start >= 0 && end > start)
  let resolve, reject, submitted
  const reply = new Promise((yes, no) => { resolve = yes; reject = no })
  const errors = [], successes = []
  const ctx = vm.createContext({
    ...bindings,
    invoke: (_command, args) => { submitted = JSON.parse(JSON.stringify(args)); return reply },
    message: { success: value => successes.push(value), error: value => errors.push(value) },
  })
  vm.runInContext(ts.transpileModule(source.slice(start, end) + `\nglobalThis.saveAction = ${name}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx)
  return { ctx, resolve, reject, errors, successes, submitted: () => submitted }
}
function tableHarness() {
  const tab = { path: 'tasks.csv', isDirty: true }
  const bindings = {
    table: box({ signature: 'old', delimiter: ',', encoding: 'utf-8', hasBom: false, lineEnding: 'lf', headers: ['任务'], rows: [['先确认交付日期']], columnTypes: ['text'], columnIds: ['c1'], rowIds: ['r1'] }),
    dirty: box(true), saving: box(false), isExternal: box(false), tablePath: box(tab.path),
    store: { libraryPath: 'isolated', tabs: [tab] }, captureActiveView() {},
    window: { dispatchEvent() {} }, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail } },
  }
  for (const key of ['notice', 'filterQuery', 'sortDirection', 'groupBy', 'titleColumn', 'categoryColumn', 'valueColumn', 'aggregation', 'chartType', 'seriesColumn', 'nullStrategy', 'activeViewId']) bindings[key] = box('')
  for (const key of ['columnWidths', 'cardColumns', 'dashboardItems', 'views']) bindings[key] = box([])
  bindings.sortColumn = box(-1); bindings.frozenColumns = box(0); bindings.showLegend = box(true)
  return { ...harness('TableView', 'saveTable', 'convertToTable', bindings), tab }
}
function workbookHarness() {
  const bindings = {
    isExternal: box(false), commitFormulaInput() {}, workbook: box({ signature: 'old' }), dirtyCount: box(1), saving: box(false),
    activeSheet: box('Sheet1'), workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' },
    drafts: box(new Map([['cell', { sheet: 'Sheet1', row: 0, column: 0, value: '先确认交付日期' }]])),
    objectDrafts: box([]), undoStack: box(['edit']), redoStack: box([]), generation: 0, selectSheet: async () => {},
  }
  for (const key of ['styleDrafts', 'rowHeightDrafts', 'columnWidthDrafts', 'mergeDrafts']) bindings[key] = box(new Map())
  return harness('WorkbookView', 'saveWorkbook', 'convertSheet', bindings)
}

test('historical Table: delayed receipt incorrectly marks newer cell edit saved', async () => {
  const h = tableHarness(); const pending = h.ctx.saveAction()
  assert.equal(h.submitted().payload.rows[0][0], '先确认交付日期')
  h.ctx.table.value.rows[0][0] = '保存时补充客户要求'
  h.resolve({ signature: 'written-first', size: 30 }); await pending
  assert.deepEqual(h.errors, [])
  assert.equal(h.ctx.table.value.rows[0][0], '保存时补充客户要求')
  assert.equal(h.ctx.dirty.value, false, 'reproduces incorrect clean state, not desired behavior')
  assert.equal(h.tab.isDirty, false)
})

test('historical Table: old receipt updates a replacement document signature and dirty state', async () => {
  const h = tableHarness(); const pending = h.ctx.saveAction()
  const other = { path: 'other.csv', isDirty: true }
  h.ctx.store.tabs.push(other); h.ctx.tablePath.value = other.path
  h.ctx.table.value = { signature: 'other-original', rows: [['另一份草稿']] }
  h.resolve({ signature: 'written-first', size: 30 }); await pending
  assert.deepEqual(h.errors, [])
  assert.equal(h.ctx.table.value.signature, 'written-first', 'reproduces wrong-document receipt')
  assert.equal(other.isDirty, false)
})

test('historical Workbook: delayed receipt discards draft edits added after submission', async () => {
  const h = workbookHarness(); const pending = h.ctx.saveAction()
  assert.equal(h.submitted().payload.edits.length, 1)
  h.ctx.drafts.value.set('later', { sheet: 'Sheet1', row: 1, column: 0, value: '保存时补充客户要求' })
  h.ctx.styleDrafts.value.set('Sheet1\u00001\u00000', { bold: true })
  h.resolve({ signature: 'written-first' }); await pending
  assert.deepEqual(h.errors, [])
  assert.equal(h.ctx.drafts.value.size, 0, 'reproduces dropped newer draft, not desired behavior')
  assert.equal(h.ctx.styleDrafts.value.size, 0)
})

test('historical Workbook control: rejected write retains drafts and reports failure', async () => {
  const h = workbookHarness(); const pending = h.ctx.saveAction()
  h.reject(new Error('模拟磁盘写入失败')); await pending
  assert.equal(h.ctx.drafts.value.size, 1)
  assert.equal(h.ctx.saving.value, false)
  assert.deepEqual(h.successes, [])
  assert.equal(h.errors.length, 1)
})
