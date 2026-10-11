import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync('src/views/WorkbookView.vue', 'utf8')
const box = value => ({ value })
function extract(start, end, bindings, expose) {
  const from = source.indexOf(start), to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from)
  const ctx = vm.createContext(bindings)
  vm.runInContext(ts.transpileModule(source.slice(from, to) + '\n' + expose, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
  return ctx
}
test('saving blocks editing shortcuts but preserves copying and navigation', () => {
  const calls = []
  const bindings = { saving: box(true), isExternal: box(false), formulaInputRef: box(null), selectedCell: box({ row: 0, column: 0 }), canvasRowCount: box(10), canvasColumnCount: box(10), validationMenuCell: box(null) }
  for (const name of ['saveWorkbook','copySelection','pasteSelection','cutSelection','undo','redo','clearSelection','selectCell','closeValidationMenu']) bindings[name] = () => calls.push(name)
  const ctx = extract('const handleShortcut =', 'useWindowDraft(', bindings, 'globalThis.action = handleShortcut')
  for (const key of ['s', 'v', 'x', 'z', 'y']) {
    let prevented = false
    ctx.action({ key, ctrlKey: true, target: {}, preventDefault() { prevented = true } })
    assert.equal(prevented, true)
  }
  ctx.action({ key: 'Delete', target: {}, preventDefault() {} })
  assert.deepEqual(calls, [])
  ctx.action({ key: 'c', ctrlKey: true, target: {}, preventDefault() {} })
  ctx.action({ key: 'ArrowDown', target: {}, preventDefault() {} })
  assert.deepEqual(calls, ['copySelection', 'selectCell'])
  ctx.saving.value = false
  ctx.action({ key: 'z', ctrlKey: true, target: {}, preventDefault() {} })
  assert.equal(calls.at(-1), 'undo')
})
test('clipboard context is invalidated by save, document, sheet and selection changes', () => {
  const ctx = extract('const captureEditContext =', 'const pasteSelection =', {
    workbook: box({}), workbookDocumentEpoch: 1, generation: 1, workbookPath: box('a.xlsx'), store: { libraryPath: 'library' },
    saving: box(false), isExternal: box(false), selectedCell: box({ sheet: 'A', row: 0, column: 0 }), selectionAreas: box([]),
  }, 'globalThis.capture = captureEditContext')
  const mutations = [() => { ctx.saving.value = true }, () => { ctx.saving.value = false; ctx.generation++ }, () => { ctx.workbookDocumentEpoch++ }, () => { ctx.workbook.value = {} }, () => { ctx.selectedCell.value.row++ }, () => { ctx.selectionAreas.value.push({ top: 0 }) }, () => { ctx.workbookPath.value = 'b.xlsx' }]
  for (const mutate of mutations) {
    ctx.saving.value = false
    const valid = ctx.capture(); assert.equal(valid(), true)
    mutate(); assert.equal(valid(), false)
  }
})

test('format dialogs ignore confirmations from a stale editing context', async () => {
  for (const [name, end, result] of [['setCustomNumberFormat', 'const selectedRowsForResize', '0.000'], ['setSelectedRowHeight', 'const setSelectedColumnWidth', '30'], ['setSelectedColumnWidth', 'const applyAxisAction', '25']]) {
    let answer, current = true
    const warnings = [], patches = []
    const ctx = extract(`const ${name} =`, end, {
      isExternal: box(false), saving: box(false), selectedCell: box({ row: 0, column: 0 }), dialog: {},
      captureEditContext: () => () => current, focusedStyle: box({ numberFormat: 'general' }),
      selectedRowsForResize: () => [0], selectedColumnsForResize: () => [0], rowHeightPoints: () => 15, columnWidthUnits: () => 20,
      promptAppAction: () => new Promise(resolve => { answer = resolve }),
      message: { warning: value => warnings.push(value), error: value => { throw Error(value) } },
      applyStylePatch: value => patches.push(value),
    }, `globalThis.action = ${name}`)
    const pending = ctx.action(); current = false; answer(result); await pending
    assert.equal(warnings.length, 1); assert.deepEqual(patches, [])
  }
})

test('custom format still applies when context is unchanged', async () => {
  const patches = []
  const ctx = extract('const setCustomNumberFormat =', 'const selectedRowsForResize', {
    isExternal: box(false), saving: box(false), selectedCell: box({}), dialog: {}, focusedStyle: box({ numberFormat: 'general' }),
    captureEditContext: () => () => true, promptAppAction: async () => '0.000', applyStylePatch: value => patches.push(value),
  }, 'globalThis.action = setCustomNumberFormat')
  await ctx.action(); assert.equal(patches[0].numberFormat, 'custom:0.000')
})

test('formula fill stops before applying edits when translation returns to a stale context', async () => {
  let resolve, current = true
  const warnings = [], errors = []
  const ctx = extract('const commitFill =', 'const recalculateLoadedFormulas', {
    isExternal: box(false), saving: box(false), captureEditContext: () => () => current,
    patternIndex: (_value, start) => start, cellAt: () => ({ kind: 'formula', formula: 'A1' }),
    originalInput: () => '=A1', MAX_BATCH_CELLS: 10000,
    invoke: () => new Promise(done => { resolve = done }),
    message: { warning: value => warnings.push(value), error: value => errors.push(value) },
  }, 'globalThis.action = commitFill')
  const pending = ctx.action({ top: 0, bottom: 0, left: 0, right: 0 }, { top: 0, bottom: 1, left: 0, right: 0 })
  current = false; resolve(['=A2']); await pending
  assert.deepEqual(errors, []); assert.equal(warnings.length, 1)
  assert.match(warnings[0], /重新填充选区/)
})
