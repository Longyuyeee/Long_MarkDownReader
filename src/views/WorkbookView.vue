<template>
  <div class="workbook-view" tabindex="-1">
    <header class="workbook-toolbar">
      <div class="workbook-title">
        <button title="返回知识库" @click="router.push('/library')">←</button>
        <div><strong>{{ fileName }}</strong><span v-if="workbook">XLSX 工作簿 · {{ workbook.sheets.length }} 个 Sheet · {{ formatBytes(workbook.size) }}</span></div>
      </div>
      <div v-if="workbook" class="workbook-actions">
        <button :class="{ active: showFormulas }" @click="showFormulas = !showFormulas">{{ showFormulas ? '显示结果' : '显示公式' }}</button>
        <button @click="refreshWorkbook">重新读取</button>
        <button class="primary" :disabled="importing || !activeSheet" @click="convertSheet">{{ importing ? '转换中…' : '转换当前 Sheet 为 Table' }}</button>
      </div>
    </header>

    <nav v-if="workbook" class="sheet-tabs" aria-label="工作表">
      <button v-for="sheet in workbook.sheets" :key="sheet" :class="{ active: sheet === activeSheet }" @click="selectSheet(sheet)">▦ {{ sheet }}</button>
      <small v-if="sheetInfo">{{ sheetInfo.totalRows.toLocaleString() }} 行 × {{ sheetInfo.totalColumns.toLocaleString() }} 列</small>
    </nav>

    <main class="workbook-main">
      <div v-if="loading" class="workbook-state"><div class="loader"></div><strong>正在解析 XLSX 工作簿</strong></div>
      <div v-else-if="error" class="workbook-state error"><strong>无法打开工作簿</strong><p>{{ error }}</p><button @click="loadWorkbook">重试</button></div>
      <template v-else-if="workbook && sheetInfo">
        <div class="workbook-notice">
          <span>XLSX 以只读模式打开；转换当前 Sheet 后可使用 Table 编辑、看板和图表。</span>
          <i v-if="sheetInfo.truncatedColumns">预览仅显示前 {{ sheetInfo.returnedColumns }} 列，转换仍读取全部列。</i>
          <i v-else-if="pageLoading">正在载入行数据…</i>
        </div>
        <div ref="scrollRef" class="sheet-scroll" @scroll="handleScroll">
          <div class="sheet-canvas" :style="{ width: `${sheetWidth}px` }">
            <div class="sheet-header" :style="gridStyle">
              <div class="row-number corner">#</div>
              <div v-for="column in sheetInfo.returnedColumns" :key="column" class="column-header">{{ columnLabel(column - 1) }}</div>
            </div>
            <div class="virtual-sheet" :style="{ height: `${sheetInfo.totalRows * rowHeight}px` }">
              <div v-for="row in visibleRows" :key="row.index" class="sheet-row" :style="[{ transform: `translateY(${row.index * rowHeight}px)` }, gridStyle]">
                <div class="row-number">{{ row.index + 1 }}</div>
                <div
                  v-for="column in sheetInfo.returnedColumns"
                  :key="column"
                  class="workbook-cell"
                  :class="[`cell-${cellAt(row.index, column - 1).kind}`, { formula: Boolean(cellAt(row.index, column - 1).formula) }]"
                  :title="cellTitle(row.index, column - 1)"
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
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
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

const PAGE_ROWS = 2_000
const rowHeight = 32
const columnWidth = 140
const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const workbook = ref<WorkbookDocument | null>(null)
const activeSheet = ref('')
const sheetInfo = ref<WorkbookSheetPage | null>(null)
const loadedRows = ref(new Map<number, WorkbookCell[]>())
const loadedPages = new Set<number>()
const loading = ref(true)
const pageLoading = ref(false)
const importing = ref(false)
const error = ref('')
const showFormulas = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)
let resizeObserver: ResizeObserver | null = null
let generation = 0
let wantedOffset = 0

const workbookPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => workbookPath.value.split(/[\\/]/).pop() || '工作簿.xlsx')
const sheetWidth = computed(() => 52 + (sheetInfo.value?.returnedColumns || 1) * columnWidth)
const gridStyle = computed(() => ({ gridTemplateColumns: `52px repeat(${sheetInfo.value?.returnedColumns || 1}, ${columnWidth}px)` }))
const emptyCell: WorkbookCell = { value: '', kind: 'empty' }
const formatBytes = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`
const columnLabel = (index: number) => {
  let label = ''
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) label = String.fromCharCode(65 + (current - 1) % 26) + label
  return label
}
const cellAt = (row: number, column: number) => loadedRows.value.get(row)?.[column] || emptyCell
const cellDisplay = (row: number, column: number) => {
  const cell = cellAt(row, column)
  return showFormulas.value && cell.formula ? cell.formula : cell.value || (cell.formula ? cell.formula : '')
}
const cellTitle = (row: number, column: number) => {
  const cell = cellAt(row, column)
  return cell.formula ? `${columnLabel(column)}${row + 1}\n公式：${cell.formula}\n结果：${cell.value || '无缓存结果'}` : cell.value
}

const visibleRows = computed(() => {
  const total = sheetInfo.value?.totalRows || 0
  const start = Math.max(0, Math.floor(scrollTop.value / rowHeight) - 10)
  const count = Math.ceil(viewportHeight.value / rowHeight) + 20
  return Array.from({ length: Math.min(count, Math.max(0, total - start)) }, (_, offset) => ({ index: start + offset }))
})

const loadPage = async (offset: number) => {
  if (!activeSheet.value || !workbook.value) return
  offset = Math.max(0, Math.floor(offset / PAGE_ROWS) * PAGE_ROWS)
  wantedOffset = offset
  if (loadedPages.has(offset) || pageLoading.value) return
  const current = generation
  const sheet = activeSheet.value
  pageLoading.value = true
  try {
    const page = await invoke<WorkbookSheetPage>('read_workbook_sheet', {
      libraryRoot: store.libraryPath, path: workbookPath.value, sheet, rowOffset: offset, rowLimit: PAGE_ROWS,
    })
    if (current !== generation || sheet !== activeSheet.value) return
    const next = new Map(loadedRows.value)
    page.rows.forEach((row, index) => next.set(page.rowOffset + index, row))
    loadedRows.value = next
    loadedPages.add(page.rowOffset)
    sheetInfo.value = page
  } catch (cause) {
    if (current === generation) message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally {
    if (current === generation) {
      pageLoading.value = false
      if (!loadedPages.has(wantedOffset)) void loadPage(wantedOffset)
    }
  }
}

const selectSheet = async (sheet: string) => {
  if (!sheet || (sheet === activeSheet.value && sheetInfo.value)) return
  generation += 1
  activeSheet.value = sheet
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
    if (!store.libraryPath || !workbookPath.value.toLocaleLowerCase().endsWith('.xlsx')) throw new Error('XLSX 路径无效或知识库尚未配置')
    const document = await invoke<WorkbookDocument>('read_workbook_file', { libraryRoot: store.libraryPath, path: workbookPath.value })
    if (current !== generation) return
    workbook.value = document
    activeSheet.value = ''
    loading.value = false
    await selectSheet(document.sheets[0])
  } catch (cause) {
    if (current !== generation) return
    workbook.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (current === generation) loading.value = false }
}
const refreshWorkbook = () => { void loadWorkbook() }
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

watch(workbookPath, loadWorkbook)
watch(scrollRef, element => {
  resizeObserver?.disconnect()
  if (element) { viewportHeight.value = element.clientHeight; resizeObserver?.observe(element) }
})
onMounted(() => {
  void loadWorkbook()
  resizeObserver = new ResizeObserver(() => { if (scrollRef.value) viewportHeight.value = scrollRef.value.clientHeight })
  nextTick(() => { if (scrollRef.value) resizeObserver?.observe(scrollRef.value) })
})
onBeforeUnmount(() => { generation += 1; resizeObserver?.disconnect() })
</script>

<style scoped>
.workbook-view { height: 100vh; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 94%, #dbe6ef); }.workbook-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); box-shadow: 0 2px 10px rgba(0,0,0,.055); z-index: 5; }.workbook-title,.workbook-actions { display: flex; align-items: center; gap: 8px; }.workbook-title > button,.workbook-actions button { height: 32px; padding: 0 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text); background: rgba(0,0,0,.035); cursor: pointer; }.workbook-title > button { width: 32px; padding: 0; font-size: 18px; }.workbook-title > div { display: flex; flex-direction: column; }.workbook-title strong { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.workbook-title span { color: var(--theme-text-secondary); font-size: 9px; }.workbook-actions button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.08); }.workbook-actions button.primary { color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }.workbook-actions button:disabled { opacity: .5; cursor: default; }
.sheet-tabs { min-height: 39px; display: flex; align-items: end; gap: 4px; padding: 5px 12px 0; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 97%, #dce6ef); }.sheet-tabs button { height: 33px; padding: 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; white-space: nowrap; font-size: 10px; }.sheet-tabs button.active { color: var(--theme-primary); border-color: rgba(0,0,0,.1); background: var(--theme-card); }.sheet-tabs small { margin: 0 5px 10px auto; color: var(--theme-text-secondary); white-space: nowrap; font-size: 8px; }
.workbook-main { min-height: 0; flex: 1; display: flex; flex-direction: column; }.workbook-notice { min-height: 30px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); color: var(--theme-text-secondary); background: var(--theme-card); font-size: 9px; }.workbook-notice i { margin-left: auto; color: #bb7126; font-style: normal; }.sheet-scroll { min-height: 0; flex: 1; overflow: auto; }.sheet-canvas { min-height: 100%; }.sheet-header,.sheet-row { display: grid; }.sheet-header { position: sticky; top: 0; z-index: 20; height: 38px; background: color-mix(in srgb, var(--theme-card) 94%, #dce6ef); box-shadow: 0 1px 0 rgba(0,0,0,.12); }.virtual-sheet { position: relative; }.sheet-row { position: absolute; top: 0; left: 0; height: 32px; }.row-number,.column-header,.workbook-cell { min-width: 0; box-sizing: border-box; border-right: 1px solid rgba(0,0,0,.07); border-bottom: 1px solid rgba(0,0,0,.07); }.row-number { position: sticky; left: 0; z-index: 8; display: grid; place-items: center; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 91%, #d9e3ed); font-size: 8px; }.corner { z-index: 24; }.column-header { display: grid; place-items: center; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, #dce6ef); font-size: 9px; font-weight: 700; }.workbook-cell { overflow: hidden; padding: 7px 8px 0; text-overflow: ellipsis; white-space: nowrap; background: var(--theme-card); font-size: 9px; }.workbook-cell.formula { color: #436fb7; }.workbook-cell.cell-error { color: #d24e4e; }.workbook-cell.cell-number,.workbook-cell.cell-integer { text-align: right; font-variant-numeric: tabular-nums; }
.workbook-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }.workbook-state strong { color: var(--theme-text); }.workbook-state p { max-width: 560px; text-align: center; }.workbook-state button { padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; }.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 850px) { .workbook-actions button:not(.primary) { display: none; }.workbook-title span { display: none; } }
</style>
