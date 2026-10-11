import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync('src/views/WorkbookView.vue', 'utf8')
const box = value => ({ value })

test('chart creation rejects a stale prompt without changing chart creation requirements', async () => {
  for (const stale of [false, true]) {
    let current = true
    const commits = []
    const ctx = extract('const createChartFromSelection =', 'const changeSelectedChartType =', {
      selectionAreas: box([{}]), selectionBounds: box({ top: 0, bottom: 1, left: 0, right: 1 }), canCreateChart: box(true),
      captureEditContext: () => () => current, newChartType: box('column'), activeSheet: box('Sheet1'), dialog: {},
      promptAppAction: async () => { if (stale) current = false; return '交付进度' },
      message: { warning() {}, error() {} }, commitDrawingChange: change => commits.push(change),
    }, 'globalThis.action = createChartFromSelection')
    await ctx.action()
    assert.equal(commits.length, stale ? 0 : 1)
    if (!stale) assert.equal(commits[0].sheet, 'Sheet1')
  }
})

test('drawing writes preserve switched sheets and isolate replaced documents', async () => {
  for (const scenario of ['success', 'switch', 'replacement', 'failure']) {
    let resolve, reject, pending = 0, restored
    const errors = []
    const ctx = extract('const commitDrawingChange =', 'const createChartFromSelection =', {
      isExternal: box(false), workbook: box({ signature: 'initial' }), saving: box(false), updatingStructure: box(false), dirtyCount: box(0), sheetProtected: box(false),
      workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1, generation: 1,
      activeSheet: box('Sheet1'), selectedDrawingId: box('old'), sheetInfo: box({ drawings: [] }), selectionBounds: box(null),
      undoStack: box(['history']), redoStack: box([]), cloneDraftData: value => value,
      beginWindowSave: () => { pending++; return () => pending-- },
      restoreTableSelection: async sheet => { restored = sheet },
      invoke: () => new Promise((done, fail) => { resolve = done; reject = fail }),
      message: { error: value => errors.push(value), success() {} },
    }, 'globalThis.action = commitDrawingChange')
    const writing = ctx.action({ action: 'create_chart' }, { top: 0 }, 'saved', 'new')
    assert.equal(ctx.saving.value, true); assert.equal(pending, 1)
    if (scenario === 'switch') { ctx.activeSheet.value = 'Sheet2'; ctx.generation++; ctx.selectedDrawingId.value = 'second' }
    if (scenario === 'replacement') { ctx.workbook.value = { signature: 'other' }; ctx.workbookDocumentEpoch++ }
    if (scenario === 'failure') reject(Error('disk')); else resolve({ signature: 'saved' })
    await writing
    assert.equal(ctx.saving.value, false); assert.equal(pending, 0)
    assert.equal(restored, scenario === 'success' ? 'Sheet1' : scenario === 'switch' ? 'Sheet2' : undefined)
    if (scenario === 'switch') assert.equal(ctx.selectedDrawingId.value, 'second')
    if (scenario === 'replacement' || scenario === 'failure') assert.equal(ctx.undoStack.value[0], 'history')
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 绘图对象保存失败/)
  }
})

test('defined name writes isolate receipts and release save locks', async () => {
  for (const scenario of ['success', 'replacement', 'failure']) {
    let resolve, reject, pending = 0
    const errors = [], successes = []
    const ctx = extract('const commitDefinedNameChange =', 'const createDefinedName =', {
      isExternal: box(false), workbook: box({ signature: 'initial', protection: {} }), saving: box(false), updatingStructure: box(false), dirtyCount: box(0),
      workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1,
      undoStack: box(['history']), redoStack: box([]), selectedDefinedNameIndex: box(-1),
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: () => new Promise((done, fail) => { resolve = done; reject = fail }),
      message: { error: value => errors.push(value), success: value => successes.push(value) },
    }, 'globalThis.action = commitDefinedNameChange')
    const writing = ctx.action({ action: 'create', name: 'Delivery' }, 'saved')
    assert.equal(ctx.saving.value, true); assert.equal(pending, 1)
    if (scenario === 'replacement') { ctx.workbook.value = { signature: 'other' }; ctx.workbookDocumentEpoch++ }
    if (scenario === 'failure') reject(Error('disk')); else resolve({ signature: 'saved', definedNames: [{ name: 'Delivery' }] })
    await writing
    assert.equal(ctx.saving.value, false); assert.equal(pending, 0)
    assert.equal(successes.length, scenario === 'success' ? 1 : 0)
    if (scenario !== 'success') assert.equal(ctx.undoStack.value[0], 'history')
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 命名区域保存失败/)
  }
})

test('defined name prompts and deletion reject stale targets', async () => {
  for (const action of ['create', 'rename', 'remove']) for (const stale of [false, true]) {
    let current = true, confirm
    const commits = []
    const ctx = extract('const createDefinedName =', 'const navigateDefinedName =', {
      definedNameSelection: box({ top: 0, bottom: 0, left: 0, right: 0 }), canEditDefinedNames: box(true),
      workbook: box({ definedNames: [] }), selectedDefinedName: box({ name: 'Delivery' }), activeSheet: box('Sheet1'),
      captureEditContext: () => () => current, promptDefinedNameScope: async () => undefined,
      promptAppAction: async () => { if (stale) current = false; return 'NewDelivery' },
      dialog: { warning: options => { confirm = options.onPositiveClick } }, message: { warning() {} },
      commitDefinedNameChange: change => commits.push(change),
    }, 'globalThis.create = createDefinedName; globalThis.rename = renameDefinedName; globalThis.remove = deleteDefinedName')
    await ctx[action]()
    if (action === 'remove') { if (stale) current = false; await confirm() }
    assert.equal(commits.length, stale ? 0 : 1)
    if (action === 'create' && !stale) assert.equal(commits[0].targetSheet, 'Sheet1')
  }
})
test('filter clear confirmation rejects changed context or region', async () => {
  for (const scenario of ['valid', 'context', 'region']) {
    let current = true, confirm, commits = 0
    const warnings = []
    const region = box({ target: 'worksheet', range: { top: 0 } })
    const ctx = extract('const persistDataView =', 'const navigateDataResult =', {
      commitFormulaInput() {}, captureEditContext: () => () => current, activeDataRegion: region,
      dialog: { warning: options => { confirm = options.onPositiveClick } },
      commitPersistedDataView: () => commits++, message: { warning: value => warnings.push(value) },
    }, 'globalThis.action = persistDataView')
    ctx.action('clear')
    if (scenario === 'context') current = false
    if (scenario === 'region') region.value.range.top = 5
    await confirm()
    assert.equal(commits, scenario === 'valid' ? 1 : 0)
    assert.equal(warnings.length, scenario === 'valid' ? 0 : 1)
  }
})
test('filter save isolates stale receipts and retains failure input', async () => {
  for (const scenario of ['success', 'replacement', 'failure']) {
    let resolve, reject, pending = 0, restored
    const errors = []
    const ctx = extract('const commitPersistedDataView =', 'const persistDataView =', {
      activeDataRegion: box({ target: 'worksheet', range: { top: 0, bottom: 1, left: 0, right: 0 }, filterState: { editable: true } }),
      isExternal: box(false), workbook: box({ signature: 'initial' }), saving: box(false), updatingStructure: box(false), sheetProtected: box(false), dirtyCount: box(0),
      filterQuery: box('客户'), filterColumn: box(0), sortColumn: box(-1), sortDirection: box('asc'), activeSheet: box('Sheet1'), selectionBounds: box(null),
      workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1, undoStack: box(['history']), redoStack: box([]),
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: (_cmd, args) => { assert.equal(args.payload.change.query, '客户'); return new Promise((done, fail) => { resolve = done; reject = fail }) },
      restoreTableSelection: async sheet => { restored = sheet }, message: { error: value => errors.push(value), success() {} },
    }, 'globalThis.action = commitPersistedDataView')
    const writing = ctx.action('apply'); assert.equal(ctx.saving.value, true); assert.equal(pending, 1)
    ctx.activeSheet.value = 'Sheet2'
    if (scenario === 'replacement') { ctx.workbook.value = { signature: 'other' }; ctx.workbookDocumentEpoch++ }
    if (scenario === 'failure') reject(new Error('磁盘失败')); else resolve({ signature: 'saved' })
    await writing
    assert.equal(pending, 0); assert.equal(ctx.saving.value, false)
    assert.equal(restored, scenario === 'success' ? 'Sheet2' : undefined)
    if (scenario !== 'success') assert.equal(ctx.undoStack.value[0], 'history')
    if (scenario === 'failure') { assert.match(errors[0], /tasks.xlsx 筛选条件保存失败/); assert.equal(ctx.filterQuery.value, '客户') }
  }
})
test('outline writes guard ownership, locking and row/column payloads', async () => {
  for (const kind of ['row', 'column']) for (const scenario of ['success', 'replacement', 'failure']) {
    let resolve, reject, pending = 0, restored, payload
    const errors = []
    const ctx = extract('const applyAxisAction =', 'const restoreAxisSelection =', {
      selectedAxis: box({ kind, start: 0, end: 0 }), isExternal: box(false), workbook: box({ signature: 'initial' }),
      saving: box(false), updatingStructure: box(false), dirtyCount: box(0), sheetProtected: box(false), MAX_BATCH_CELLS: 1000,
      rowState: () => ({ hidden: false, outlineLevel: 0, collapsed: false }), columnState: () => ({ hidden: false, outlineLevel: 0, collapsed: false }),
      workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1, activeSheet: box('Sheet1'), selectionBounds: box(null),
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: (_cmd, args) => { payload = args.payload; return new Promise((done, fail) => { resolve = done; reject = fail }) },
      restoreTableSelection: async sheet => { restored = sheet }, message: { error: value => errors.push(value), success() {} },
    }, 'globalThis.action = applyAxisAction')
    const writing = ctx.action({ target: { value: 'group' } })
    assert.equal(pending, 1); assert.equal(ctx.saving.value, true)
    assert.equal(payload[kind === 'row' ? 'rowEdits' : 'columnEdits'][0].outlineLevel, 1)
    ctx.activeSheet.value = 'Sheet2'
    if (scenario === 'replacement') { ctx.workbook.value = { signature: 'other' }; ctx.workbookDocumentEpoch++ }
    if (scenario === 'failure') reject(new Error('磁盘失败'))
    else resolve({ signature: 'saved' })
    await writing
    assert.equal(pending, 0); assert.equal(ctx.saving.value, false)
    assert.equal(restored, scenario === 'success' ? 'Sheet2' : undefined)
    if (scenario === 'replacement') assert.equal(ctx.workbook.value.signature, 'other')
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 行列隐藏\/分组保存失败/)
    else assert.deepEqual(errors, [])
  }
})
test('structure receipts isolate stale documents and preserve a switched sheet', async () => {
  for (const scenario of ['success', 'switch', 'replacement', 'epoch', 'failure']) {
    let resolve, reject, pending = 0, restored
    const errors = []
    const ctx = extract('const commitStructure =', 'const applyStructureAction =', {
      isExternal: box(false), workbook: box({ signature: 'initial' }), workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' },
      workbookDocumentEpoch: 1, generation: 1, saving: box(false), updatingStructure: box(false), dirtyCount: box(0), sheetProtected: box(false),
      activeSheet: box('Sheet1'), selectionBounds: box(null), undoStack: box(['history']), redoStack: box([]),
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: (_cmd, args) => { assert.equal(args.payload.change.sheet, 'Sheet1'); return new Promise((done, fail) => { resolve = done; reject = fail }) },
      restoreAxisSelection: async sheet => { restored = `axis:${sheet}` }, restoreTableSelection: async sheet => { restored = `table:${sheet}` },
      message: { error: value => errors.push(value), success() {} },
    }, 'globalThis.action = commitStructure')
    const writing = ctx.action('row', 'insert', 0, 1)
    assert.equal(pending, 1); assert.equal(ctx.saving.value, true)
    if (scenario === 'switch') { ctx.activeSheet.value = 'Sheet2'; ctx.generation++ }
    if (scenario === 'replacement') ctx.workbook.value = { signature: 'other' }
    if (scenario === 'epoch') ctx.workbookDocumentEpoch++
    if (scenario === 'failure') { ctx.workbookPath.value = 'other.xlsx'; reject(new Error('磁盘失败')) }
    else resolve({ signature: 'saved' })
    await writing
    assert.equal(pending, 0); assert.equal(ctx.saving.value, false); assert.equal(ctx.updatingStructure.value, false)
    assert.equal(restored, scenario === 'success' ? 'axis:Sheet1' : scenario === 'switch' ? 'table:Sheet2' : undefined)
    if (!['success', 'switch'].includes(scenario)) assert.equal(ctx.undoStack.value[0], 'history')
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 行列结构保存失败/)
    else assert.deepEqual(errors, [])
  }
})
test('row/column deletion confirmation cannot follow a changed target', async () => {
  for (const kind of ['row', 'column']) for (const stale of [false, true]) {
    let current = true, confirm
    const calls = [], warnings = []
    const ctx = extract('const applyStructureAction =', 'const restoreTableSelection =', {
      commitFormulaInput() {}, selectedAxis: box({ kind, start: 1, end: 2 }), workbook: box({}),
      saving: box(false), updatingStructure: box(false), sheetProtected: box(false), dirtyCount: box(0), MAX_BATCH_CELLS: 1000,
      captureEditContext: () => () => current, dialog: { warning: options => { confirm = options.onPositiveClick } },
      message: { warning: value => warnings.push(value), error: value => { throw Error(value) } },
      commitStructure: (...args) => calls.push(args),
    }, 'globalThis.action = applyStructureAction')
    ctx.action({ target: { value: 'delete' } })
    current = !stale; await confirm()
    assert.equal(calls.length, stale ? 0 : 1); assert.equal(warnings.length, stale ? 1 : 0)
    if (!stale) assert.deepEqual(calls[0], [kind, 'delete', 1, 2])
  }
})
test('structure commit rechecks dirty and protected state after confirmation', async () => {
  for (const state of ['saving', 'updatingStructure', 'dirtyCount', 'sheetProtected']) {
    const bindings = { isExternal: box(false), workbook: box({}), saving: box(false), updatingStructure: box(false),
      dirtyCount: box(0), sheetProtected: box(false), message: { error() {} } }
    bindings[state].value = state === 'dirtyCount' ? 1 : true
    const ctx = extract('const commitStructure =', 'const applyStructureAction =', bindings, 'globalThis.action = commitStructure')
    await ctx.action('row', 'delete', 0, 1) // Any write would access an unbound invoke and fail.
  }
})
test('clear confirmations reject changed targets, drafts and busy state', async () => {
  for (const kind of ['print', 'header']) for (const scenario of ['valid', 'target', 'draft', 'busy']) {
    let current = true, confirm, writes = 0
    const warnings = []
    const draft = box({ oddHeader: '客户清单', oddFooter: '', evenHeader: '', evenFooter: '', firstHeader: '', firstFooter: '' })
    const allowed = box(true)
    const ctx = extract(kind === 'print' ? 'const clearPrintArea =' : 'const clearHeaderFooter =',
      kind === 'print' ? 'const savePrintOptions =' : 'const promptDefinedNameScope =', {
        sheetInfo: box({ pageLayout: { printArea: {} } }), canEditPrintArea: allowed, canEditPageLayout: allowed,
        hasHeaderFooterContent: box(true), pageLayoutDraft: draft, headerFooterDraft: draft,
        captureEditContext: () => () => current, dialog: { warning: options => { confirm = options.onPositiveClick } },
        message: { warning: value => warnings.push(value) }, savePageLayout: () => writes++, saveHeaderFooter: () => writes++,
      }, `globalThis.action = ${kind === 'print' ? 'clearPrintArea' : 'clearHeaderFooter'}`)
    ctx.action()
    if (scenario === 'target') current = false
    if (scenario === 'draft') draft.value.oddHeader = '新的草稿'
    if (scenario === 'busy') allowed.value = false
    const before = JSON.stringify(draft.value)
    await confirm()
    assert.equal(writes, scenario === 'valid' ? 1 : 0)
    assert.equal(warnings.length, scenario === 'valid' ? 0 : 1)
    if (scenario !== 'valid') assert.equal(JSON.stringify(draft.value), before)
    else if (kind === 'header') assert.equal(draft.value.oddHeader, '')
  }
})
test('page setting writes snapshot parameters and isolate stale receipts', async () => {
  for (const scenario of ['success', 'replacement', 'failure']) {
    let resolve, reject, pending = 0, received, closed = false, restored
    const errors = []
    const ctx = extract('const writePageSetting =', 'const savePageLayout =', {
      workbook: box({ signature: 'initial' }), canEditPageLayout: box(true), workbookPath: box('tasks.xlsx'),
      store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1, activeSheet: box('Sheet1'), selectionBounds: box(null),
      isExternal: box(false), saving: box(false), updatingStructure: box(false), cloneDraftData: value => JSON.parse(JSON.stringify(value)),
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: (_command, args) => { received = args; return new Promise((done, fail) => { resolve = done; reject = fail }) },
      restoreTableSelection: async sheet => { restored = sheet }, message: { error: value => errors.push(value), success() {} },
    }, 'globalThis.action = writePageSetting')
    const change = { margins: { left: 1 } }
    const writing = ctx.action('update_workbook_page_layout', change, '页面设置已保存', () => { closed = true })
    change.margins.left = 5; ctx.activeSheet.value = 'Sheet2'
    assert.equal(received.payload.change.margins.left, 1); assert.equal(received.payload.change.sheet, 'Sheet1')
    assert.equal(pending, 1); assert.equal(ctx.saving.value, true)
    if (scenario === 'replacement') { ctx.workbook.value = { signature: 'other' }; ctx.workbookDocumentEpoch++ }
    if (scenario === 'failure') reject(new Error('磁盘失败'))
    else resolve({ signature: 'saved' })
    await writing
    assert.equal(closed, scenario === 'success'); assert.equal(restored, scenario === 'success' ? 'Sheet2' : undefined)
    assert.equal(ctx.saving.value, false); assert.equal(pending, 0)
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 页面设置保存失败：磁盘失败/)
    if (scenario === 'replacement') assert.equal(ctx.workbook.value.signature, 'other')
  }
})
test('freeze writes lock editing, retain current sheet and reject old receipts', async () => {
  for (const scenario of ['success', 'replacement', 'epoch', 'failure']) {
    let resolve, reject, pending = 0, restored
    const errors = []
    const ctx = extract('const applyFreezePane =', 'const setFreezePane =', {
      isExternal: box(false), workbook: box({ signature: 'initial' }), sheetInfo: box({}), saving: box(false),
      updatingStructure: box(false), dirtyCount: box(0), activeSheet: box('Sheet1'), selectionBounds: box(null),
      workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1,
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: (_command, args) => { assert.equal(args.sheet, 'Sheet1'); return new Promise((done, fail) => { resolve = done; reject = fail }) },
      restoreTableSelection: async sheet => { restored = sheet },
      message: { error: value => errors.push(value), success() {} },
    }, 'globalThis.action = applyFreezePane')
    const writing = ctx.action(1, 1)
    assert.equal(ctx.saving.value, true); assert.equal(pending, 1)
    ctx.activeSheet.value = 'Sheet2'
    if (scenario === 'replacement') ctx.workbook.value = { signature: 'other' }
    if (scenario === 'epoch') ctx.workbookDocumentEpoch++
    if (scenario === 'failure') { ctx.workbookPath.value = 'other.xlsx'; reject(new Error('磁盘失败')) }
    else resolve({ signature: 'saved' })
    await writing
    assert.equal(ctx.saving.value, false); assert.equal(ctx.updatingStructure.value, false); assert.equal(pending, 0)
    assert.equal(restored, scenario === 'success' ? 'Sheet2' : undefined)
    assert.equal(ctx.workbook.value.signature, scenario === 'success' ? 'saved' : scenario === 'replacement' ? 'other' : 'initial')
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 冻结窗格保存失败/)
    else assert.deepEqual(errors, [])
  }
})
test('saving blocks direct draft mutation entry points', () => {
  for (const [name, end] of [
    ['commitFormulaInput', 'const applyHistoryAction ='],
    ['stageWorkbookObjectDraft', 'const stylePatchMatchesSource ='],
    ['applyStylePatch', 'const applyFontSize ='],
    ['mergeSelection', 'const unmergeSelection ='],
    ['unmergeSelection', 'const copySelection ='],
  ]) {
    // No other bindings: reaching any mutation logic fails the test.
    const ctx = extract(`const ${name} =`, end, { saving: box(true) }, `globalThis.action = ${name}`)
    ctx.action({})
  }
})
test('selection restoration stops when another view wins either read', async () => {
  for (const interruptAt of ['sheet', 'page', 'none']) {
    let completeSheet, completePage, focused = 0, pageReads = 0
    const ctx = extract('const restoreTableSelection =', 'const selectedDrawing =', {
      workbook: box({}), workbookDocumentEpoch: 1, workbookPath: box('tasks.xlsx'), store: { libraryPath: 'isolated' },
      generation: 0, activeSheet: box('Sheet1'), selectionAnchor: box(null), selectionAreas: box([]),
      selectSheet: sheet => { ctx.generation++; ctx.activeSheet.value = sheet; return new Promise(resolve => { completeSheet = resolve }) },
      loadPage: () => { pageReads++; return new Promise(resolve => { completePage = resolve }) },
      setSelectionFocus: () => focused++, recalculateLoadedFormulas: async () => {},
    }, 'globalThis.restore = restoreTableSelection')
    const pending = ctx.restore('Sheet1', { top: 0, bottom: 0, left: 0, right: 0 })
    if (interruptAt === 'sheet') ctx.generation++
    completeSheet(); await new Promise(resolve => setImmediate(resolve))
    if (interruptAt !== 'sheet') {
      if (interruptAt === 'page') ctx.workbookDocumentEpoch++
      completePage()
    }
    await pending
    assert.equal(pageReads, interruptAt === 'sheet' ? 0 : 1)
    assert.equal(focused, interruptAt === 'none' ? 1 : 0)
  }
})
test('validation write receipts respect document ownership and release window save guards', async () => {
  for (const scenario of ['success', 'replacement', 'epoch', 'failure']) {
    let resolve, reject, pending = 0, restored = 0
    const errors = [], successes = []
    const ctx = extract('const commitDataValidationChange =', 'const editDataValidationRule =', {
      isExternal: box(false), workbook: box({ signature: 'initial' }), saving: box(false), updatingStructure: box(false),
      sheetProtected: box(false), dirtyCount: box(0), activeSheet: box('Sheet1'), selectionBounds: box(null), workbookPath: box('tasks.xlsx'),
      store: { libraryPath: 'isolated' }, workbookDocumentEpoch: 1, undoStack: box(['history']), redoStack: box(['redo']),
      beginWindowSave: () => { pending++; return () => pending-- },
      invoke: () => new Promise((done, fail) => { resolve = done; reject = fail }),
      restoreTableSelection: async () => { restored++ },
      message: { error: value => errors.push(value), success: value => successes.push(value) },
    }, 'globalThis.action = commitDataValidationChange')
    const writing = ctx.action({ sheet: 'Sheet1', action: 'create' }, {}, '创建成功')
    assert.equal(pending, 1); assert.equal(ctx.saving.value, true)
    if (scenario === 'replacement') { ctx.workbook.value = { signature: 'other' }; ctx.workbookPath.value = 'other.xlsx' }
    if (scenario === 'epoch') ctx.workbookDocumentEpoch++
    if (scenario === 'failure') { ctx.workbookPath.value = 'other.xlsx'; reject(new Error('磁盘失败')) }
    else resolve({ signature: 'saved' })
    await writing
    assert.equal(pending, 0); assert.equal(ctx.updatingStructure.value, false); assert.equal(ctx.saving.value, false)
    assert.equal(restored, scenario === 'success' ? 1 : 0)
    assert.equal(successes.length, scenario === 'success' ? 1 : 0)
    if (scenario !== 'success') assert.equal(ctx.undoStack.value[0], 'history')
    if (scenario === 'replacement') assert.equal(ctx.workbook.value.signature, 'other')
    if (scenario === 'epoch') assert.equal(ctx.workbook.value.signature, 'initial')
    if (scenario === 'failure') assert.match(errors[0], /tasks.xlsx 数据验证保存失败：磁盘失败/)
    else assert.deepEqual(errors, [])
  }
})
test('formula flush preserves existing values but validates actual edits', () => {
  const errors = [], changes = []
  const ctx = extract('const commitFormulaInput =', 'const applyHistoryAction =', {
    selectedCell: box({ sheet: 'Sheet1', row: 0, column: 0 }), selectedEditable: box(true), saving: box(false),
    formulaInput: box('旧内容'), cellAt: () => ({ value: '旧内容' }), sourceCellAt: () => ({ value: '旧内容' }),
    originalInput: cell => cell.value, validationAt: () => ({ kind: 'list', showErrorMessage: true, error: '请选择任务状态' }),
    literalValidationOptions: () => ['待处理', '已完成'], message: { error: value => errors.push(value) },
    editKey: () => 'A1', drafts: box(new Map()), inferEdit: (_selection, input) => ({ input }),
    setDraft: (_key, value) => changes.push(value), invalidateCalculation() {}, undoStack: box([]), redoStack: box([]),
  }, 'globalThis.action = commitFormulaInput')
  ctx.action(); assert.deepEqual(errors, []); assert.deepEqual(changes, [])
  ctx.formulaInput.value = '其他状态'; ctx.action()
  assert.deepEqual(errors, ['请选择任务状态']); assert.deepEqual(changes, [])
  ctx.formulaInput.value = '待处理'; ctx.action()
  assert.equal(changes[0].input, '待处理'); assert.equal(ctx.undoStack.value.length, 1)
})
function extract(start, end, bindings, expose) {
  const from = source.indexOf(start), to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from)
  const ctx = vm.createContext(bindings)
  vm.runInContext(ts.transpileModule(source.slice(from, to) + '\n' + expose, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
  return ctx
}

test('data validation stops quietly on cancellation and rejects stale answers at every step', async () => {
  const answers = ['whole', 'between', '0', '100', '请输入 0 到 100', '填写完成度']
  for (const mode of ['cancel', 'stale', 'valid']) {
    for (let stop = 0; stop < answers.length; stop++) {
      let current = true, calls = 0
      const warnings = [], errors = []
      const ctx = extract('const promptDataValidationRule =', 'const commitDataValidationChange =', {
        dialog: {}, captureEditContext: () => () => current,
        promptAppAction: async () => {
          const index = calls++
          if (index === stop && mode === 'stale') current = false
          return index === stop && mode === 'cancel' ? null : answers[index]
        },
        message: { warning: value => warnings.push(value), error: value => errors.push(value) },
      }, 'globalThis.action = promptDataValidationRule')
      const rule = await ctx.action(undefined, [{ top: 0, bottom: 0, left: 0, right: 0 }])
      assert.deepEqual(errors, [])
      if (mode === 'valid') {
        assert.equal(rule.kind, 'whole'); assert.equal(rule.formula2, '100'); assert.equal(calls, 6)
      } else {
        assert.equal(rule, null); assert.equal(calls, stop + 1)
      }
      assert.equal(warnings.length, mode === 'stale' ? 1 : 0)
    }
  }
})

test('data validation edit and delete cannot commit to a changed sheet', async () => {
  for (const stale of [false, true]) {
    let current = true, confirmation
    const commits = [], warnings = []
    const bindings = {
      commitFormulaInput() {}, validationSelection: box({ top: 0, bottom: 0, left: 0, right: 0 }),
      canEditDataValidation: box(true), selectedValidation: box({ kind: 'list' }), selectedValidationIndex: box(0), activeSheet: box('Sheet1'),
      captureEditContext: () => () => current, message: { warning: value => warnings.push(value) },
      commitDataValidationChange: value => commits.push(value), dialog: { warning: value => { confirmation = value } },
      promptDataValidationRule: async () => { if (stale) { current = false; bindings.activeSheet.value = 'Sheet2' }; return { kind: 'list' } },
    }
    const ctx = extract('const editDataValidationRule =', 'const CONDITIONAL_STYLE_PRESETS:', bindings, 'globalThis.edit = editDataValidationRule; globalThis.remove = deleteDataValidationRule')
    await ctx.edit('create')
    assert.equal(commits.length, stale ? 0 : 1)
    commits.length = 0; current = true; bindings.activeSheet.value = 'Sheet1'
    ctx.remove()
    if (stale) { current = false; bindings.activeSheet.value = 'Sheet2' }
    await confirmation.onPositiveClick()
    assert.equal(commits.length, stale ? 0 : 1)
    if (!stale) assert.equal(commits[0].sheet, 'Sheet1')
    assert.equal(warnings.length, stale ? 2 : 0)
  }
})
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
