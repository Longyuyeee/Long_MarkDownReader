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
  const ctx = extract('const captureClipboardContext =', 'const pasteSelection =', {
    workbook: box({}), workbookDocumentEpoch: 1, generation: 1, workbookPath: box('a.xlsx'), store: { libraryPath: 'library' },
    saving: box(false), isExternal: box(false), selectedCell: box({ sheet: 'A', row: 0, column: 0 }), selectionAreas: box([]),
  }, 'globalThis.capture = captureClipboardContext')
  const mutations = [() => { ctx.saving.value = true }, () => { ctx.saving.value = false; ctx.generation++ }, () => { ctx.workbookDocumentEpoch++ }, () => { ctx.workbook.value = {} }, () => { ctx.selectedCell.value.row++ }, () => { ctx.selectionAreas.value.push({ top: 0 }) }, () => { ctx.workbookPath.value = 'b.xlsx' }]
  for (const mutate of mutations) {
    ctx.saving.value = false
    const valid = ctx.capture(); assert.equal(valid(), true)
    mutate(); assert.equal(valid(), false)
  }
})
