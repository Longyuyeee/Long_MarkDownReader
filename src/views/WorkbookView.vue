<template>
  <div class="workbook-view" tabindex="-1">
    <header class="workbook-toolbar">
      <div class="workbook-title">
        <button class="icon-button" title="返回知识库" @click="router.push('/library')"><n-icon :component="ArrowLeftIcon" /></button>
        <div><strong>{{ fileName }}</strong><span v-if="workbook">XLSX 工作簿 · {{ workbook.sheets.length }} 个 Sheet · {{ formatBytes(workbook.size) }}</span></div>
      </div>
      <div v-if="workbook" class="workbook-actions">
        <button class="icon-button" title="撤销" :disabled="!undoStack.length || saving" @click="undo"><n-icon :component="UndoIcon" /></button>
        <button class="icon-button" title="重做" :disabled="!redoStack.length || saving" @click="redo"><n-icon :component="RedoIcon" /></button>
        <button class="icon-button" title="复制区域" :disabled="!selectedCell || saving" @click="copySelection"><n-icon :component="CopyIcon" /></button>
        <button class="icon-button" title="粘贴区域" :disabled="!selectedCell || saving" @click="pasteSelection"><n-icon :component="PasteIcon" /></button>
        <button :class="{ active: showFormulas }" :disabled="saving" @click="showFormulas = !showFormulas"><n-icon :component="FunctionIcon" />{{ showFormulas ? '结果' : '公式' }}</button>
        <button class="icon-button" title="重新读取" :disabled="saving" @click="refreshWorkbook"><n-icon :component="RefreshIcon" /></button>
        <button :disabled="importing || saving || !activeSheet" @click="convertSheet"><n-icon :component="TableIcon" />{{ importing ? '转换中…' : '转为 Table' }}</button>
        <button class="primary" :disabled="!dirtyCount || saving" @click="saveWorkbook"><n-icon :component="SaveIcon" />{{ saving ? '保存中…' : `保存${dirtyCount ? ` (${dirtyCount})` : ''}` }}</button>
      </div>
    </header>

    <nav v-if="workbook" class="sheet-tabs" aria-label="工作表">
      <button v-for="sheet in workbook.sheets" :key="sheet" :class="{ active: sheet === activeSheet }" @click="selectSheet(sheet)"><n-icon :component="SheetIcon" />{{ sheet }}</button>
      <small v-if="sheetInfo">{{ sheetInfo.totalRows.toLocaleString() }} 行 × {{ sheetInfo.totalColumns.toLocaleString() }} 列</small>
    </nav>

    <div v-if="workbook && sheetInfo" class="formula-bar">
      <output>{{ selectedAddress || '—' }}</output>
      <span>fx</span>
      <input
        ref="formulaInputRef"
        v-model="formulaInput"
        :disabled="!selectedEditable || saving"
        :placeholder="selectedCell ? '当前单元格不可编辑' : '选择单元格'"
        @change="commitFormulaInput"
        @keydown.enter.prevent="commitFormulaInput"
        @keydown.esc.prevent="resetFormulaInput"
      />
    </div>

    <main class="workbook-main">
      <div v-if="loading" class="workbook-state"><div class="loader"></div><strong>正在解析 XLSX 工作簿</strong></div>
      <div v-else-if="error" class="workbook-state error"><strong>无法打开工作簿</strong><p>{{ error }}</p><button @click="loadWorkbook">重试</button></div>
      <template v-else-if="workbook && sheetInfo">
        <div v-if="dirtyCount || sheetInfo.truncatedColumns || pageLoading" class="workbook-status">
          <span v-if="dirtyCount">{{ dirtyCount }} 个单元格尚未保存</span>
          <span v-if="sheetInfo.truncatedColumns">当前显示前 {{ sheetInfo.returnedColumns }} 列</span>
          <span v-if="pageLoading">正在载入行数据…</span>
        </div>
        <div ref="scrollRef" class="sheet-scroll" @scroll="handleScroll">
          <div class="sheet-canvas" :style="{ width: `${sheetWidth}px` }">
            <div class="sheet-header" :style="gridStyle">
              <div class="row-number corner">#</div>
              <div v-for="column in canvasColumnCount" :key="column" class="column-header">{{ columnLabel(column - 1) }}</div>
            </div>
            <div class="virtual-sheet" :style="{ height: `${canvasRowCount * rowHeight}px` }">
              <div v-for="row in visibleRows" :key="row.index" class="sheet-row" :style="[{ transform: `translateY(${row.index * rowHeight}px)` }, gridStyle]">
                <div class="row-number">{{ row.index + 1 }}</div>
                <div
                  v-for="column in canvasColumnCount"
                  :key="column"
                  class="workbook-cell"
                  :class="[
                    `cell-${cellAt(row.index, column - 1).kind}`,
                    {
                      formula: Boolean(cellAt(row.index, column - 1).formula),
                      selected: isSelected(row.index, column - 1),
                      'in-range': isInSelection(row.index, column - 1),
                      dirty: isDirty(activeSheet, row.index, column - 1),
                      editable: isEditableCell(row.index, column - 1),
                    },
                  ]"
                  :title="cellTitle(row.index, column - 1)"
                  @pointerdown="startCellSelection(row.index, column - 1, $event)"
                  @pointerenter="extendCellSelection(row.index, column - 1)"
                  @dblclick="beginCellEdit(row.index, column - 1)"
                >{{ cellDisplay(row.index, column - 1) }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { ArrowLeft as ArrowLeftIcon, ClipboardPaste as PasteIcon, Copy as CopyIcon, FileSpreadsheet as SheetIcon, FunctionSquare as FunctionIcon, Redo2 as RedoIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Table2 as TableIcon, Undo2 as UndoIcon } from 'lucide-vue-next'
import { useAppStore } from '../store/app'

interface WorkbookDocument { path: string; size: number; signature: string; sheets: string[] }
interface WorkbookCell { value: string; formula?: string; kind: string }
interface WorkbookSheetPage {
  sheet: string
  rowOffset: number
  totalRows: number
  totalColumns: number
  returnedColumns: number
  rows: WorkbookCell[][]
  truncatedColumns: boolean
}
interface WorkbookCellEdit { sheet: string; row: number; column: number; input: string; kind: 'string' | 'number' | 'boolean' | 'empty' | 'formula' }
interface CellSelection { sheet: string; row: number; column: number }
interface CellChange { key: string; before?: WorkbookCellEdit; after?: WorkbookCellEdit }
interface EditAction { changes: CellChange[] }

const PAGE_ROWS = 2_000
const MAX_BATCH_CELLS = 10_000
const EXTRA_ROWS = 100
const EXTRA_COLUMNS = 5
const rowHeight = 32
const columnWidth = 140
const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const dialog = useDialog()
const workbook = ref<WorkbookDocument | null>(null)
const activeSheet = ref('')
const sheetInfo = ref<WorkbookSheetPage | null>(null)
const loadedRows = ref(new Map<number, WorkbookCell[]>())
const loadedPages = new Set<number>()
const drafts = ref(new Map<string, WorkbookCellEdit>())
const undoStack = ref<EditAction[]>([])
const redoStack = ref<EditAction[]>([])
const selectedCell = ref<CellSelection | null>(null)
const selectionAnchor = ref<CellSelection | null>(null)
const formulaInput = ref('')
const formulaInputRef = ref<HTMLInputElement | null>(null)
const loading = ref(true)
const pageLoading = ref(false)
const importing = ref(false)
const saving = ref(false)
const error = ref('')
const showFormulas = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)
let resizeObserver: ResizeObserver | null = null
let generation = 0
let wantedOffset = 0
let dragSelecting = false

const workbookPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => workbookPath.value.split(/[\\/]/).pop() || '工作簿.xlsx')
const draftExtent = computed(() => {
  let row = -1
  let column = -1
  for (const edit of drafts.value.values()) {
    if (edit.sheet === activeSheet.value) { row = Math.max(row, edit.row); column = Math.max(column, edit.column) }
  }
  return { row, column }
})
const canvasRowCount = computed(() => Math.min(1_048_576, Math.max(EXTRA_ROWS, (sheetInfo.value?.totalRows || 0) + EXTRA_ROWS, draftExtent.value.row + 1)))
const canvasColumnCount = computed(() => {
  const info = sheetInfo.value
  if (!info) return 1
  if (info.truncatedColumns) return info.returnedColumns
  return Math.min(256, Math.max(12, info.returnedColumns + EXTRA_COLUMNS, draftExtent.value.column + 1))
})
const sheetWidth = computed(() => 52 + canvasColumnCount.value * columnWidth)
const gridStyle = computed(() => ({ gridTemplateColumns: `52px repeat(${canvasColumnCount.value}, ${columnWidth}px)` }))
const dirtyCount = computed(() => drafts.value.size)
const selectionBounds = computed(() => {
  const anchor = selectionAnchor.value
  const focus = selectedCell.value
  if (!anchor || !focus || anchor.sheet !== focus.sheet) return null
  return { top: Math.min(anchor.row, focus.row), bottom: Math.max(anchor.row, focus.row), left: Math.min(anchor.column, focus.column), right: Math.max(anchor.column, focus.column) }
})
const selectedAddress = computed(() => {
  const bounds = selectionBounds.value
  if (!bounds) return ''
  const first = `${columnLabel(bounds.left)}${bounds.top + 1}`
  const last = `${columnLabel(bounds.right)}${bounds.bottom + 1}`
  return first === last ? first : `${first}:${last}`
})
const selectedEditable = computed(() => selectedCell.value ? isEditableCell(selectedCell.value.row, selectedCell.value.column) : false)
const emptyCell: WorkbookCell = { value: '', kind: 'empty' }
const formatBytes = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`
const columnLabel = (index: number) => {
  let label = ''
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) label = String.fromCharCode(65 + (current - 1) % 26) + label
  return label
}
const editKey = (sheet: string, row: number, column: number) => `${sheet}\u0000${row}\u0000${column}`
const sourceCellAt = (row: number, column: number) => loadedRows.value.get(row)?.[column] || emptyCell
const cellAt = (row: number, column: number): WorkbookCell => {
  const edit = drafts.value.get(editKey(activeSheet.value, row, column))
  if (!edit) return sourceCellAt(row, column)
  if (edit.kind === 'formula') return { value: '', formula: edit.input, kind: 'formula' }
  return { value: edit.input, kind: edit.kind === 'string' ? 'text' : edit.kind }
}
const originalInput = (cell: WorkbookCell) => cell.formula || cell.value || ''
const isEditableCell = (row: number, column: number) => {
  const source = sourceCellAt(row, column)
  return Boolean(source.formula) || !['date', 'error'].includes(source.kind)
}
const isDirty = (sheet: string, row: number, column: number) => drafts.value.has(editKey(sheet, row, column))
const isSelected = (row: number, column: number) => selectedCell.value?.sheet === activeSheet.value && selectedCell.value.row === row && selectedCell.value.column === column
const isInSelection = (row: number, column: number) => {
  const bounds = selectionBounds.value
  return Boolean(bounds && row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right)
}
const cellDisplay = (row: number, column: number) => {
  const cell = cellAt(row, column)
  return showFormulas.value && cell.formula ? cell.formula : cell.value || (cell.formula ? cell.formula : '')
}
const cellTitle = (row: number, column: number) => {
  const cell = cellAt(row, column)
  return cell.formula ? `${columnLabel(column)}${row + 1}\n公式：${cell.formula}\n结果：${cell.value || '等待外部公式引擎重算'}` : cell.value
}
const visibleRows = computed(() => {
  const total = canvasRowCount.value
  const start = Math.max(0, Math.floor(scrollTop.value / rowHeight) - 10)
  const count = Math.ceil(viewportHeight.value / rowHeight) + 20
  return Array.from({ length: Math.min(count, Math.max(0, total - start)) }, (_, offset) => ({ index: start + offset }))
})

const inferEdit = (selection: CellSelection, input: string): WorkbookCellEdit => {
  if (input.startsWith('=') && input.length > 1) return { ...selection, input, kind: 'formula' }
  if (!input) return { ...selection, input, kind: 'empty' }
  if (/^(true|false)$/i.test(input)) return { ...selection, input: input.toLowerCase(), kind: 'boolean' }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(input) && Number.isFinite(Number(input))) return { ...selection, input, kind: 'number' }
  return { ...selection, input, kind: 'string' }
}
const setDraft = (key: string, edit?: WorkbookCellEdit) => {
  const next = new Map(drafts.value)
  if (edit) next.set(key, edit)
  else next.delete(key)
  drafts.value = next
}
const setSelectionFocus = (row: number, column: number) => {
  selectedCell.value = { sheet: activeSheet.value, row, column }
  formulaInput.value = originalInput(cellAt(row, column))
}
const selectCell = (row: number, column: number, extend = false) => {
  if (!extend || selectionAnchor.value?.sheet !== activeSheet.value) selectionAnchor.value = { sheet: activeSheet.value, row, column }
  setSelectionFocus(row, column)
}
const startCellSelection = (row: number, column: number, event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  dragSelecting = true
  selectCell(row, column, event.shiftKey)
}
const extendCellSelection = (row: number, column: number) => {
  if (dragSelecting) setSelectionFocus(row, column)
}
const beginCellEdit = (row: number, column: number) => {
  selectCell(row, column)
  if (isEditableCell(row, column)) nextTick(() => formulaInputRef.value?.focus())
}
const resetFormulaInput = () => {
  if (selectedCell.value) formulaInput.value = originalInput(cellAt(selectedCell.value.row, selectedCell.value.column))
  formulaInputRef.value?.blur()
}
const commitFormulaInput = () => {
  const selection = selectedCell.value
  if (!selection || !selectedEditable.value) return
  const key = editKey(selection.sheet, selection.row, selection.column)
  const before = drafts.value.get(key)
  const source = sourceCellAt(selection.row, selection.column)
  const after = formulaInput.value === originalInput(source) ? undefined : inferEdit(selection, formulaInput.value)
  if (JSON.stringify(before) === JSON.stringify(after)) return
  setDraft(key, after)
  undoStack.value.push({ changes: [{ key, before, after }] })
  redoStack.value = []
}
const applyHistoryAction = (action: EditAction, direction: 'undo' | 'redo') => {
  const next = new Map(drafts.value)
  for (const change of action.changes) {
    const edit = direction === 'undo' ? change.before : change.after
    if (edit) next.set(change.key, edit)
    else next.delete(change.key)
  }
  drafts.value = next
  const last = action.changes[action.changes.length - 1]
  const edit = last && (direction === 'undo' ? last.before : last.after)
  if (edit && edit.sheet === activeSheet.value) {
    selectedCell.value = { sheet: edit.sheet, row: edit.row, column: edit.column }
    formulaInput.value = edit.input
  }
}
const undo = () => { const action = undoStack.value.pop(); if (action) { applyHistoryAction(action, 'undo'); redoStack.value.push(action) } }
const redo = () => { const action = redoStack.value.pop(); if (action) { applyHistoryAction(action, 'redo'); undoStack.value.push(action) } }

const applyBatchInputs = (start: CellSelection, matrix: string[][]) => {
  const cellCount = matrix.reduce((count, row) => count + row.length, 0)
  const width = Math.max(0, ...matrix.map(row => row.length))
  if (!cellCount || cellCount > MAX_BATCH_CELLS || matrix.length * width > MAX_BATCH_CELLS) throw new Error(`单次区域编辑不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
  const changes: CellChange[] = []
  matrix.forEach((values, rowOffset) => values.forEach((input, columnOffset) => {
    const selection = { sheet: start.sheet, row: start.row + rowOffset, column: start.column + columnOffset }
    if (selection.row >= 1_048_576 || selection.column >= 16_384) throw new Error('粘贴区域超出 XLSX 坐标上限')
    if (selection.column >= 256) throw new Error('当前工作面最多编辑前 256 列')
    const key = editKey(selection.sheet, selection.row, selection.column)
    const before = drafts.value.get(key)
    const source = sourceCellAt(selection.row, selection.column)
    if (!before && ['date', 'error'].includes(source.kind)) throw new Error(`${columnLabel(selection.column)}${selection.row + 1} 当前类型暂不支持区域写入`)
    const after = input === originalInput(source) || (!input && source.kind === 'empty') ? undefined : inferEdit(selection, input)
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key, before, after })
  }))
  if (!changes.length) return
  const next = new Map(drafts.value)
  for (const change of changes) {
    if (change.after) next.set(change.key, change.after)
    else next.delete(change.key)
  }
  drafts.value = next
  undoStack.value.push({ changes })
  redoStack.value = []
}
const selectedMatrix = () => {
  const bounds = selectionBounds.value
  if (!bounds) return []
  const count = (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1)
  if (count > MAX_BATCH_CELLS) throw new Error(`选择区域不能超过 ${MAX_BATCH_CELLS.toLocaleString()} 个单元格`)
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    if (row < (sheetInfo.value?.totalRows || 0) && !loadedRows.value.has(row)) throw new Error('选择区域包含尚未载入的数据，请滚动到该区域后重试')
  }
  return Array.from({ length: bounds.bottom - bounds.top + 1 }, (_, rowOffset) =>
    Array.from({ length: bounds.right - bounds.left + 1 }, (_, columnOffset) => originalInput(cellAt(bounds.top + rowOffset, bounds.left + columnOffset))))
}
const copySelection = async () => {
  try {
    const matrix = selectedMatrix()
    if (!matrix.length) return false
    await navigator.clipboard.writeText(matrix.map(row => row.join('\t')).join('\r\n'))
    message.success(`已复制 ${matrix.length} × ${matrix[0].length} 区域`)
    return true
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')); return false }
}
const pasteSelection = async () => {
  if (!selectedCell.value) return
  try {
    const text = await navigator.clipboard.readText()
    if (text.length > 10 * 1024 * 1024) throw new Error('剪贴板文本不能超过 10 MB')
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')
    const matrix = normalized.split('\n').map(row => row.split('\t'))
    const start = { ...selectedCell.value }
    applyBatchInputs(start, matrix)
    selectionAnchor.value = start
    const bottom = start.row + matrix.length - 1
    const right = start.column + Math.max(...matrix.map(row => row.length)) - 1
    setSelectionFocus(bottom, right)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const clearSelection = () => {
  const bounds = selectionBounds.value
  const focus = selectedCell.value
  if (!bounds || !focus) return
  try {
    const matrix = Array.from({ length: bounds.bottom - bounds.top + 1 }, () => Array.from({ length: bounds.right - bounds.left + 1 }, () => ''))
    applyBatchInputs({ sheet: focus.sheet, row: bounds.top, column: bounds.left }, matrix)
    formulaInput.value = originalInput(cellAt(focus.row, focus.column))
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const cutSelection = async () => { if (await copySelection()) clearSelection() }

const loadPage = async (offset: number) => {
  if (!activeSheet.value || !workbook.value) return
  offset = Math.max(0, Math.floor(offset / PAGE_ROWS) * PAGE_ROWS)
  if (sheetInfo.value && offset >= sheetInfo.value.totalRows) return
  wantedOffset = offset
  if (loadedPages.has(offset) || pageLoading.value) return
  const current = generation
  const sheet = activeSheet.value
  pageLoading.value = true
  try {
    const page = await invoke<WorkbookSheetPage>('read_workbook_sheet', { libraryRoot: store.libraryPath, path: workbookPath.value, sheet, rowOffset: offset, rowLimit: PAGE_ROWS })
    if (current !== generation || sheet !== activeSheet.value) return
    const next = new Map(loadedRows.value)
    page.rows.forEach((row, index) => next.set(page.rowOffset + index, row))
    loadedRows.value = next
    loadedPages.add(page.rowOffset)
    sheetInfo.value = page
  } catch (cause) {
    if (current === generation) message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    if (current === generation) { pageLoading.value = false; if (!loadedPages.has(wantedOffset)) void loadPage(wantedOffset) }
  }
}
const selectSheet = async (sheet: string) => {
  if (!sheet || (sheet === activeSheet.value && sheetInfo.value)) return
  generation += 1
  activeSheet.value = sheet
  selectedCell.value = null
  selectionAnchor.value = null
  formulaInput.value = ''
  sheetInfo.value = null
  loadedRows.value = new Map()
  loadedPages.clear()
  scrollTop.value = 0
  scrollRef.value?.scrollTo({ top: 0, left: 0 })
  await loadPage(0)
}
const loadWorkbook = async () => {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    if (!store.libraryPath || !workbookPath.value.toLowerCase().endsWith('.xlsx')) throw new Error('XLSX 路径无效或知识库尚未配置')
    const document = await invoke<WorkbookDocument>('read_workbook_file', { libraryRoot: store.libraryPath, path: workbookPath.value })
    if (current !== generation) return
    workbook.value = document
    activeSheet.value = ''
    selectedCell.value = null
    selectionAnchor.value = null
    loading.value = false
    await selectSheet(document.sheets[0])
  } catch (cause) {
    if (current !== generation) return
    workbook.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (current === generation) loading.value = false }
}
const discardAndReload = () => { drafts.value = new Map(); undoStack.value = []; redoStack.value = []; void loadWorkbook() }
const refreshWorkbook = () => {
  if (!dirtyCount.value) return void loadWorkbook()
  dialog.warning({ title: '放弃未保存更改？', content: `将丢弃 ${dirtyCount.value} 个单元格变更。`, positiveText: '放弃并重新读取', negativeText: '取消', onPositiveClick: discardAndReload })
}
const saveWorkbook = async () => {
  commitFormulaInput()
  if (!workbook.value || !dirtyCount.value || saving.value) return
  saving.value = true
  const previousSheet = activeSheet.value
  try {
    const document = await invoke<WorkbookDocument>('write_workbook_cells', {
      libraryRoot: store.libraryPath,
      path: workbookPath.value,
      payload: { expectedSignature: workbook.value.signature, edits: Array.from(drafts.value.values()) },
    })
    workbook.value = document
    drafts.value = new Map()
    undoStack.value = []
    redoStack.value = []
    generation += 1
    activeSheet.value = ''
    await selectSheet(previousSheet)
    message.success('工作簿已保存')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { saving.value = false }
}
const convertSheet = async () => {
  if (!activeSheet.value || importing.value) return
  importing.value = true
  try {
    const path = await invoke<string>('import_workbook_sheet', { libraryRoot: store.libraryPath, path: workbookPath.value, sheet: activeSheet.value })
    message.success('已从当前 Sheet 创建开放 Table，原 XLSX 保持不变')
    await router.push({ name: 'Table', query: { path } })
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { importing.value = false }
}
const handleScroll = () => {
  if (!scrollRef.value) return
  scrollTop.value = scrollRef.value.scrollTop
  const start = Math.floor(scrollTop.value / rowHeight)
  void loadPage(start)
  const end = start + Math.ceil(viewportHeight.value / rowHeight) + 20
  if (end % PAGE_ROWS > PAGE_ROWS - 100) void loadPage(end)
}
const handleShortcut = (event: KeyboardEvent) => {
  const formulaFocused = event.target === formulaInputRef.value
  if (!(event.ctrlKey || event.metaKey)) {
    if (!formulaFocused && event.key === 'Delete') { event.preventDefault(); clearSelection() }
    if (!formulaFocused && selectedCell.value && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const rowDelta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      const columnDelta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      const row = Math.max(0, Math.min(canvasRowCount.value - 1, selectedCell.value.row + rowDelta))
      const column = Math.max(0, Math.min(canvasColumnCount.value - 1, selectedCell.value.column + columnDelta))
      selectCell(row, column, event.shiftKey)
    }
    return
  }
  const key = event.key.toLowerCase()
  if (key === 's') { event.preventDefault(); void saveWorkbook() }
  else if (!formulaFocused && key === 'c') { event.preventDefault(); void copySelection() }
  else if (!formulaFocused && key === 'v') { event.preventDefault(); void pasteSelection() }
  else if (!formulaFocused && key === 'x') { event.preventDefault(); void cutSelection() }
  else if (!formulaFocused && key === 'z' && event.shiftKey) { event.preventDefault(); redo() }
  else if (!formulaFocused && key === 'z') { event.preventDefault(); undo() }
  else if (!formulaFocused && key === 'y') { event.preventDefault(); redo() }
}
const warnBeforeUnload = (event: BeforeUnloadEvent) => { if (dirtyCount.value) event.preventDefault() }
const stopCellSelection = () => { dragSelecting = false }

watch(workbookPath, () => { drafts.value = new Map(); undoStack.value = []; redoStack.value = []; void loadWorkbook() })
watch(scrollRef, element => {
  resizeObserver?.disconnect()
  if (element) { viewportHeight.value = element.clientHeight; resizeObserver?.observe(element) }
})
onBeforeRouteLeave(() => !dirtyCount.value || window.confirm(`还有 ${dirtyCount.value} 个单元格未保存，确定离开吗？`))
onMounted(() => {
  void loadWorkbook()
  resizeObserver = new ResizeObserver(() => { if (scrollRef.value) viewportHeight.value = scrollRef.value.clientHeight })
  nextTick(() => { if (scrollRef.value) resizeObserver?.observe(scrollRef.value) })
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('pointerup', stopCellSelection)
  window.addEventListener('beforeunload', warnBeforeUnload)
})
onBeforeUnmount(() => {
  generation += 1
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pointerup', stopCellSelection)
  window.removeEventListener('beforeunload', warnBeforeUnload)
})
</script>

<style scoped>
.workbook-view { height: 100vh; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 94%, #dbe6ef); }
.workbook-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); box-shadow: 0 2px 10px rgba(0,0,0,.055); z-index: 5; }
.workbook-title,.workbook-actions,.workbook-actions button { display: flex; align-items: center; gap: 8px; }
.workbook-title > button,.workbook-actions button { height: 32px; padding: 0 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text); background: rgba(0,0,0,.035); cursor: pointer; }
.workbook-title .icon-button,.workbook-actions .icon-button { width: 32px; justify-content: center; padding: 0; }
.workbook-title > div { display: flex; flex-direction: column; }
.workbook-title strong { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.workbook-title span { color: var(--theme-text-secondary); font-size: 9px; }
.workbook-actions button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.08); }
.workbook-actions button.primary { color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }
.workbook-actions button:disabled { opacity: .45; cursor: default; }
.sheet-tabs { min-height: 39px; display: flex; align-items: end; gap: 4px; padding: 5px 12px 0; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 97%, #dce6ef); }
.sheet-tabs button { height: 33px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; white-space: nowrap; font-size: 10px; }
.sheet-tabs button.active { color: var(--theme-primary); border-color: rgba(0,0,0,.1); background: var(--theme-card); }
.sheet-tabs small { margin: 0 5px 10px auto; color: var(--theme-text-secondary); white-space: nowrap; font-size: 8px; }
.formula-bar { height: 34px; flex: none; display: grid; grid-template-columns: 72px 28px minmax(0, 1fr); align-items: center; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); }
.formula-bar output { overflow: hidden; padding: 0 10px; text-align: center; text-overflow: ellipsis; font-size: 10px; font-weight: 700; }
.formula-bar span { color: var(--theme-text-secondary); text-align: center; font-size: 11px; font-style: italic; }
.formula-bar input { min-width: 0; height: 100%; padding: 0 10px; border: 0; border-left: 1px solid rgba(0,0,0,.08); outline: 0; color: var(--theme-text); background: transparent; font: inherit; font-size: 10px; }
.formula-bar input:focus { box-shadow: inset 0 -2px var(--theme-primary); }
.formula-bar input:disabled { opacity: .55; }
.workbook-main { min-height: 0; flex: 1; display: flex; flex-direction: column; }
.workbook-status { min-height: 28px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); color: #9a641f; background: color-mix(in srgb, var(--theme-card) 94%, #fff3d8); font-size: 9px; }
.sheet-scroll { min-height: 0; flex: 1; overflow: auto; }
.sheet-canvas { min-height: 100%; }
.sheet-header,.sheet-row { display: grid; }
.sheet-header { position: sticky; top: 0; z-index: 20; height: 38px; background: color-mix(in srgb, var(--theme-card) 94%, #dce6ef); box-shadow: 0 1px 0 rgba(0,0,0,.12); }
.virtual-sheet { position: relative; }
.sheet-row { position: absolute; top: 0; left: 0; height: 32px; }
.row-number,.column-header,.workbook-cell { min-width: 0; box-sizing: border-box; border-right: 1px solid rgba(0,0,0,.07); border-bottom: 1px solid rgba(0,0,0,.07); }
.row-number { position: sticky; left: 0; z-index: 8; display: grid; place-items: center; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 91%, #d9e3ed); font-size: 8px; }
.corner { z-index: 24; }
.column-header { display: grid; place-items: center; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, #dce6ef); font-size: 9px; font-weight: 700; }
.workbook-cell { position: relative; overflow: hidden; padding: 7px 8px 0; outline: 0; text-overflow: ellipsis; white-space: nowrap; background: var(--theme-card); font-size: 9px; user-select: none; }
.workbook-cell.editable { cursor: cell; }
.workbook-cell.in-range { background: color-mix(in srgb, var(--theme-card) 88%, var(--theme-primary)); }
.workbook-cell.selected { z-index: 3; box-shadow: inset 0 0 0 2px var(--theme-primary); }
.workbook-cell.dirty::after { content: ''; position: absolute; top: 0; right: 0; border-top: 7px solid #df8a27; border-left: 7px solid transparent; }
.workbook-cell.formula { color: #436fb7; }
.workbook-cell.cell-error { color: #d24e4e; }
.workbook-cell.cell-number,.workbook-cell.cell-integer { text-align: right; font-variant-numeric: tabular-nums; }
.workbook-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }
.workbook-state strong { color: var(--theme-text); }
.workbook-state p { max-width: 560px; text-align: center; }
.workbook-state button { padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; }
.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .workbook-actions button:not(.primary):not(.icon-button) { display: none; } .workbook-title span { display: none; } }
</style>
