<template>
  <div class="table-view" tabindex="-1" @keydown="handleKeydown">
    <header class="table-toolbar">
      <div class="table-title">
        <button title="返回知识库" @click="leaveTable">←</button>
        <div><strong>{{ fileName }}</strong><span v-if="table">{{ table.rows.length.toLocaleString() }} 行 × {{ table.headers.length }} 列 · {{ formatLabel }} · {{ table.encoding }}</span></div>
      </div>
      <div v-if="table" class="table-tools">
        <button class="history-button icon-tool" title="撤销行操作 (Ctrl+Z)" :disabled="!rowUndoStack.length || saving" @click="undoRowOperation"><UndoIcon /></button>
        <button class="history-button icon-tool" title="重做行操作 (Ctrl+Y)" :disabled="!rowRedoStack.length || saving" @click="redoRowOperation"><RedoIcon /></button>
        <label class="table-filter"><span>⌕</span><input v-model="filterQuery" placeholder="筛选所有字段" @input="markViewDirty" /><button v-if="filterQuery" type="button" aria-label="清除筛选" @click="clearFilter">×</button></label>
        <button v-if="activeViewKind === 'grid'" :class="{ active: freezeFirstColumn }" :aria-pressed="freezeFirstColumn" @click="toggleFreeze">冻结首列</button>
        <button v-if="table.format !== 'longedit-table'" @click="convertToTable">转换为 Table</button>
        <button v-else @click="exportAs('csv')">导出 CSV</button>
        <button v-if="table.format === 'longedit-table'" @click="exportAs('xlsx')">导出 XLSX</button>
        <button @click="addRow">＋ 行</button>
        <button @click="addColumn">＋ 列</button>
        <button class="save-button" :disabled="!dirty || saving" aria-live="polite" @click="saveTable">{{ saving ? '保存中' : dirty ? '保存' : '已保存' }}</button>
      </div>
    </header>
    <nav v-if="table?.format === 'longedit-table'" class="view-tabs" aria-label="数据视图">
      <div v-for="view in views" :key="view.id" class="view-tab" :class="{ active: view.id === activeViewId }">
        <button class="view-tab-main" :aria-current="view.id === activeViewId ? 'page' : undefined" @click="switchView(view.id)" @dblclick="renameView(view)">
          <span>{{ view.kind === 'grid' ? '▦' : view.kind === 'board' ? '▤' : view.kind === 'chart' ? '▥' : '▦' }}</span>{{ view.name }}
        </button>
        <button v-if="views.length > 1" class="view-tab-delete" type="button" :aria-label="`删除视图 ${view.name}`" @click="deleteView(view)">×</button>
      </div>
      <div class="view-add">
        <button @click="addView('grid')">＋表格</button><button @click="addView('board')">＋看板</button><button @click="addView('chart')">＋图表</button><button @click="addView('dashboard')">＋仪表盘</button>
      </div>
      <small>双击视图可重命名 · 所有视图共享同一份数据</small>
    </nav>

    <main class="table-workspace">
      <div v-if="loading" class="table-state"><div class="loader"></div><strong>正在解析 CSV/TSV</strong></div>
      <div v-else-if="error" class="table-state error"><strong>无法打开表格</strong><p>{{ error }}</p><button @click="loadTable">重新加载</button></div>
      <template v-else-if="table">
        <div class="table-meta-bar">
          <span>显示 {{ filteredIndices.length.toLocaleString() }} / {{ table.rows.length.toLocaleString() }} 行</span>
          <template v-if="activeViewKind === 'grid'">
            <span v-if="sortColumn >= 0">按“{{ headerLabel(sortColumn) }}”{{ sortDirection === 'asc' ? '升序' : '降序' }}</span>
            <button v-if="sortColumn >= 0" @click="clearSort">清除排序</button>
            <span v-if="selectedRowIndex >= 0" class="row-selection-actions">
              已选择第 {{ selectedRowIndex + 1 }} 行
              <button type="button" title="删除选中行" @click="requestDeleteSelectedRow"><TrashIcon />删除</button>
              <button type="button" @click="clearRowSelection">取消选择</button>
            </span>
          </template>
          <template v-else-if="activeViewKind === 'board'">
            <label>分组 <select v-model="groupBy" @change="updateViewConfig"><option v-for="(_, index) in table.headers" :key="table.columnIds[index]" :value="table.columnIds[index]">{{ headerLabel(index) }}</option></select></label>
            <label>标题 <select v-model="titleColumn" @change="updateViewConfig"><option v-for="(_, index) in table.headers" :key="table.columnIds[index]" :value="table.columnIds[index]">{{ headerLabel(index) }}</option></select></label>
            <span class="card-fields"><b>卡片字段</b><button v-for="(_, index) in table.headers" :key="table.columnIds[index]" :class="{ active: cardColumns.includes(table.columnIds[index]) }" @click="toggleCardColumn(table.columnIds[index])">{{ headerLabel(index) }}</button></span>
          </template>
          <template v-else-if="activeViewKind === 'chart'">
            <span>图表字段、类型和呈现方式可在编辑器侧栏调整</span>
          </template>
          <template v-else>
            <span>仪表盘筛选会同时作用于全部图表，拖动卡片可调整顺序</span>
          </template>
          <i v-if="notice" aria-live="polite">{{ notice }}</i>
        </div>
        <div v-if="activeViewKind === 'grid'" ref="scrollRef" class="table-scroll" @scroll="handleScroll">
          <div class="table-canvas" :style="{ width: `${tableWidth}px` }">
            <div class="table-header" :style="gridStyle">
              <div class="row-number header-number">#</div>
              <div v-for="(_, column) in table.headers" :key="table.columnIds[column]" class="header-cell" :class="{ frozen: freezeFirstColumn && column === 0 }">
                <input :value="table.headers[column]" :aria-label="`第 ${column + 1} 列名称`" @input="editHeader(column, $event)" />
                <button :title="`按 ${headerLabel(column)} 排序`" @click="cycleSort(column)">{{ sortColumn === column ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</button>
                <small>{{ typeLabel(table.columnTypes[column]) }}</small>
                <span class="column-resize" title="拖动调整列宽" @pointerdown="startColumnResize(column, $event)"></span>
              </div>
            </div>
            <div class="virtual-body" :style="{ height: `${filteredIndices.length * rowHeight}px` }">
              <div
                v-for="item in visibleRows"
                :key="item.rowIndex"
                class="table-row"
                :class="{ selected: table.rowIds[item.rowIndex] === selectedRowId }"
                :style="[{ transform: `translateY(${item.virtualIndex * rowHeight}px)` }, gridStyle]"
              >
                <button
                  class="row-number"
                  :class="{ selected: table.rowIds[item.rowIndex] === selectedRowId }"
                  :title="`选择第 ${item.rowIndex + 1} 行`"
                  :aria-label="`选择第 ${item.rowIndex + 1} 行`"
                  :aria-pressed="table.rowIds[item.rowIndex] === selectedRowId"
                  @click="selectRow(item.rowIndex)"
                >{{ item.rowIndex + 1 }}</button>
                <div v-for="(_, column) in table.headers" :key="column" class="data-cell" :class="{ frozen: freezeFirstColumn && column === 0 }">
                  <input
                    :value="table.rows[item.rowIndex][column]"
                    :aria-label="`${headerLabel(column)}，第 ${item.rowIndex + 1} 行`"
                    @input="editCell(item.rowIndex, column, $event)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="activeViewKind === 'board'" class="board-scroll">
          <section v-for="group in boardGroups" :key="group.name" class="board-column" @dragover.prevent @drop="cardDrop(group.name, $event)">
            <header><strong>{{ group.name }}</strong><span>{{ group.rows.length }}</span></header>
            <div class="board-cards">
              <article v-for="row in group.rows" :key="table.rowIds[row]" class="board-card" draggable="true" @dragstart="cardDragStart(row, $event)">
                <strong>{{ cardTitle(row) }}</strong>
                <p v-for="id in cardFieldIds" :key="id"><span>{{ headerLabel(columnIndex(id)) }}</span><input :value="table.rows[row][columnIndex(id)]" @input="editCell(row, columnIndex(id), $event)" /></p>
                <small>#{{ row + 1 }} · 拖动可改变分组</small>
              </article>
            </div>
          </section>
          <div v-if="!boardGroups.length" class="view-empty">选择一个分组字段后，看板会直接使用当前数据生成卡片。</div>
        </div>
        <TableChartEditor
          v-else-if="activeViewKind === 'chart'"
          :headers="table.headers"
          :column-ids="table.columnIds"
          :column-types="table.columnTypes"
          :rows="table.rows"
          :row-indices="filteredIndices"
          :config="chartConfig"
          @update:config="applyChartConfig"
        />
        <TableDashboard
          v-else
          :headers="table.headers"
          :column-ids="table.columnIds"
          :column-types="table.columnTypes"
          :rows="table.rows"
          :row-indices="filteredIndices"
          :chart-views="chartViews"
          :items="dashboardItems"
          @update:items="applyDashboardItems"
          @edit-chart="switchView"
        />
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { openManagedFile } from '../services/fileNavigation'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { useDialog, useMessage } from 'naive-ui'
import { Redo2 as RedoIcon, Trash2 as TrashIcon, Undo2 as UndoIcon } from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import TableChartEditor from '../components/TableChartEditor.vue'
import TableDashboard, { type DashboardItem } from '../components/TableDashboard.vue'

type ViewKind = 'grid' | 'board' | 'chart' | 'dashboard'
type ChartType = 'bar' | 'line' | 'pie' | 'scatter'
type NullStrategy = 'skip' | 'zero'
interface TableViewConfig {
  filter: string
  sortColumn?: string
  sortDirection: 'asc' | 'desc'
  frozenColumns: number
  columnWidths: number[]
  groupBy?: string
  titleColumn?: string
  cardColumns: string[]
  categoryColumn?: string
  valueColumn?: string
  aggregation: 'count' | 'sum' | 'average'
  chartType: ChartType
  seriesColumn?: string
  nullStrategy: NullStrategy
  showLegend: boolean
  dashboardItems: DashboardItem[]
}
interface TableViewDefinition { id: string; name: string; kind: ViewKind; config: TableViewConfig }
interface TableDocument {
  path: string
  format: 'csv' | 'tsv' | 'longedit-table'
  delimiter: string
  encoding: string
  hasBom: boolean
  lineEnding: 'lf' | 'crlf'
  signature: string
  headers: string[]
  rows: string[][]
  columnTypes: string[]
  columnIds: string[]
  rowIds: string[]
  view: TableViewConfig
  views: TableViewDefinition[]
  activeView: string
}

interface TableWriteResult { signature: string; size: number }
interface RowHistoryEntry {
  kind: 'add' | 'delete'
  index: number
  row: string[]
  rowId: string
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const dialog = useDialog()
const scrollRef = ref<HTMLElement | null>(null)
const table = ref<TableDocument | null>(null)
const loading = ref(true)
const error = ref('')
const dirty = ref(false)
const saving = ref(false)
const notice = ref('')
const selectedRowId = ref('')
const rowUndoStack = ref<RowHistoryEntry[]>([])
const rowRedoStack = ref<RowHistoryEntry[]>([])
const filterQuery = ref('')
const sortColumn = ref(-1)
const sortDirection = ref<'asc' | 'desc'>('asc')
const freezeFirstColumn = ref(true)
const columnWidths = ref<number[]>([])
const views = ref<TableViewDefinition[]>([])
const activeViewId = ref('grid')
const groupBy = ref<string>()
const titleColumn = ref<string>()
const cardColumns = ref<string[]>([])
const categoryColumn = ref<string>()
const valueColumn = ref<string>()
const aggregation = ref<'count' | 'sum' | 'average'>('count')
const chartType = ref<ChartType>('bar')
const seriesColumn = ref<string>()
const nullStrategy = ref<NullStrategy>('skip')
const showLegend = ref(true)
const dashboardItems = ref<DashboardItem[]>([])
const scrollTop = ref(0)
const viewportHeight = ref(600)
const rowHeight = 34
let resizeObserver: ResizeObserver | null = null
let typeTimer = 0
let loadGeneration = 0

const tablePath = computed(() => String(route.query.path || store.activeTabId || ''))
const fileName = computed(() => tablePath.value.split(/[\\/]/).pop() || '数据表')
const formatLabel = computed(() => table.value?.format === 'longedit-table' ? '开放 Table' : table.value?.format?.toUpperCase() || 'CSV')
const tableWidth = computed(() => 52 + (columnWidths.value.length ? columnWidths.value.reduce((sum, width) => sum + width, 0) : 160))
const gridStyle = computed(() => ({ gridTemplateColumns: `52px ${columnWidths.value.map(width => `${width}px`).join(' ') || '160px'}` }))
const activeView = computed(() => views.value.find(view => view.id === activeViewId.value) || views.value[0])
const activeViewKind = computed<ViewKind>(() => activeView.value?.kind || 'grid')
const columnIndex = (id?: string) => id ? table.value?.columnIds.indexOf(id) ?? -1 : -1
const chartConfig = computed(() => ({
  chartType: chartType.value,
  categoryColumn: categoryColumn.value,
  valueColumn: valueColumn.value,
  seriesColumn: seriesColumn.value,
  aggregation: aggregation.value,
  nullStrategy: nullStrategy.value,
  showLegend: showLegend.value,
}))
const chartViews = computed(() => views.value.filter((view): view is TableViewDefinition & { kind: 'chart' } => view.kind === 'chart'))
const selectedRowIndex = computed(() => selectedRowId.value && table.value ? table.value.rowIds.indexOf(selectedRowId.value) : -1)

const typeLabel = (type: string) => ({ integer: '整数', number: '数值', boolean: '布尔', date: '日期', empty: '空', text: '文本' }[type] || '文本')
const headerLabel = (column: number) => table.value?.headers[column]?.trim() || `列 ${column + 1}`

const inferType = (column: number) => {
  if (!table.value) return 'text'
  const values = table.value.rows.map(row => row[column]?.trim()).filter(Boolean).slice(0, 2_000) as string[]
  if (!values.length) return 'empty'
  if (values.every(value => /^[-+]?\d+$/.test(value))) return 'integer'
  if (values.every(value => Number.isFinite(Number(value)))) return 'number'
  if (values.every(value => /^(true|false)$/i.test(value))) return 'boolean'
  if (values.every(value => /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value))) return 'date'
  return 'text'
}

const scheduleTypeRefresh = (column: number) => {
  window.clearTimeout(typeTimer)
  typeTimer = window.setTimeout(() => {
    if (table.value) table.value.columnTypes[column] = inferType(column)
  }, 180)
}

const compareValues = (left: string, right: string, type: string) => {
  if (type === 'integer' || type === 'number') return (Number(left) || 0) - (Number(right) || 0)
  if (type === 'boolean') return Number(/^true$/i.test(left)) - Number(/^true$/i.test(right))
  if (type === 'date') return Date.parse(left) - Date.parse(right)
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

const filteredIndices = computed(() => {
  if (!table.value) return []
  const query = filterQuery.value.trim().toLocaleLowerCase()
  const indices = table.value.rows
    .map((_, index) => index)
    .filter(index => !query || table.value!.rows[index].some(cell => cell.toLocaleLowerCase().includes(query)))
  if (sortColumn.value >= 0) {
    const column = sortColumn.value
    const direction = sortDirection.value === 'asc' ? 1 : -1
    const type = table.value.columnTypes[column]
    indices.sort((left, right) => direction * compareValues(table.value!.rows[left][column] || '', table.value!.rows[right][column] || '', type) || left - right)
  }
  return indices
})

const boardGroups = computed(() => {
  if (!table.value) return []
  const groupColumn = columnIndex(groupBy.value)
  if (groupColumn < 0) return []
  const groups = new Map<string, number[]>()
  for (const rowIndex of filteredIndices.value) {
    const value = table.value.rows[rowIndex][groupColumn]?.trim() || '未分组'
    if (!groups.has(value)) groups.set(value, [])
    groups.get(value)!.push(rowIndex)
  }
  return [...groups].map(([name, rows]) => ({ name, rows }))
})

const visibleRows = computed(() => {
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop.value - 46) / rowHeight) - 8)
  const count = Math.ceil(viewportHeight.value / rowHeight) + 16
  return filteredIndices.value.slice(start, start + count).map((rowIndex, offset) => ({ rowIndex, virtualIndex: start + offset }))
})

const markDirty = () => { dirty.value = true; notice.value = '有未保存修改' }
const captureActiveView = () => {
  const current = activeView.value
  if (!current) return
  current.config = {
    filter: filterQuery.value,
    sortColumn: sortColumn.value >= 0 ? table.value?.columnIds[sortColumn.value] : undefined,
    sortDirection: sortDirection.value,
    frozenColumns: freezeFirstColumn.value ? 1 : 0,
    columnWidths: [...columnWidths.value],
    groupBy: groupBy.value,
    titleColumn: titleColumn.value,
    cardColumns: [...cardColumns.value],
    categoryColumn: categoryColumn.value,
    valueColumn: valueColumn.value,
    aggregation: aggregation.value,
    chartType: chartType.value,
    seriesColumn: seriesColumn.value,
    nullStrategy: nullStrategy.value,
    showLegend: showLegend.value,
    dashboardItems: dashboardItems.value.map(item => ({ ...item })),
  }
}
const applyView = (view?: TableViewDefinition) => {
  if (!view || !table.value) return
  const config = view.config
  filterQuery.value = config.filter || ''
  sortColumn.value = config.sortColumn ? table.value.columnIds.indexOf(config.sortColumn) : -1
  sortDirection.value = config.sortDirection === 'desc' ? 'desc' : 'asc'
  freezeFirstColumn.value = config.frozenColumns > 0
  columnWidths.value = table.value.headers.map((_, index) => Math.min(600, Math.max(60, config.columnWidths[index] || 160)))
  groupBy.value = config.groupBy || table.value.columnIds[0]
  titleColumn.value = config.titleColumn || table.value.columnIds[0]
  cardColumns.value = (config.cardColumns || []).filter(id => table.value!.columnIds.includes(id)).slice(0, 8)
  categoryColumn.value = config.categoryColumn || table.value.columnIds[0]
  valueColumn.value = config.valueColumn
  aggregation.value = ['sum', 'average'].includes(config.aggregation) ? config.aggregation as 'sum' | 'average' : 'count'
  chartType.value = ['line', 'pie', 'scatter'].includes(config.chartType) ? config.chartType : 'bar'
  seriesColumn.value = config.seriesColumn && table.value.columnIds.includes(config.seriesColumn) ? config.seriesColumn : undefined
  nullStrategy.value = config.nullStrategy === 'zero' ? 'zero' : 'skip'
  showLegend.value = config.showLegend !== false
  dashboardItems.value = (config.dashboardItems || [])
    .filter(item => views.value.some(view => view.kind === 'chart' && view.id === item.chartViewId))
    .slice(0, 24)
    .map(item => ({ chartViewId: item.chartViewId, width: [4, 6, 8, 12].includes(item.width) ? item.width : 6 } as DashboardItem))
}
const switchView = (id: string) => {
  if (id === activeViewId.value) return
  captureActiveView()
  activeViewId.value = id
  applyView(views.value.find(view => view.id === id))
  markDirty()
}
const addView = (kind: ViewKind) => {
  if (!table.value || table.value.format !== 'longedit-table') return
  captureActiveView()
  const id = `view-${Date.now()}-${views.value.length + 1}`
  const first = table.value.columnIds[0]
  const numeric = table.value.columnIds.find((_, index) => ['integer', 'number'].includes(table.value!.columnTypes[index]))
  const view: TableViewDefinition = {
    id,
    name: kind === 'board' ? '新看板' : kind === 'chart' ? '新图表' : kind === 'dashboard' ? '新仪表盘' : '新表格',
    kind,
    config: {
      filter: '', sortDirection: 'asc', frozenColumns: 1,
      columnWidths: table.value.headers.map(() => 160), cardColumns: table.value.columnIds.slice(1, 4),
      groupBy: first, titleColumn: first, categoryColumn: first, valueColumn: numeric || first, aggregation: 'count',
      chartType: 'bar', nullStrategy: 'skip', showLegend: true,
      dashboardItems: kind === 'dashboard' ? chartViews.value.slice(0, 4).map(chart => ({ chartViewId: chart.id, width: 6 })) : [],
    },
  }
  views.value.push(view)
  activeViewId.value = id
  applyView(view)
  markDirty()
}
const renameView = (view: TableViewDefinition) => {
  const name = window.prompt('视图名称', view.name)?.trim()
  if (name && name.length <= 120) { view.name = name; markDirty() }
}
const deleteView = (view: TableViewDefinition) => {
  if (views.value.length <= 1) return
  dialog.warning({
    title: `删除视图“${view.name}”？`,
    content: '只会删除当前视图配置，共享数据不会被删除。点击保存后才会写入文件。',
    positiveText: '删除视图',
    negativeText: '取消',
    onPositiveClick: () => {
      const index = views.value.findIndex(item => item.id === view.id)
      views.value.splice(index, 1)
      if (view.kind === 'chart') {
        for (const candidate of views.value) {
          candidate.config.dashboardItems = (candidate.config.dashboardItems || []).filter(item => item.chartViewId !== view.id)
        }
      }
      if (activeViewId.value === view.id) {
        activeViewId.value = views.value[Math.max(0, index - 1)].id
        applyView(activeView.value)
      }
      markDirty()
    }
  })
}
const updateViewConfig = () => { captureActiveView(); markViewDirty() }
const applyChartConfig = (config: Pick<TableViewConfig, 'chartType' | 'categoryColumn' | 'valueColumn' | 'seriesColumn' | 'aggregation' | 'nullStrategy' | 'showLegend'>) => {
  chartType.value = config.chartType
  categoryColumn.value = config.categoryColumn
  valueColumn.value = config.valueColumn
  seriesColumn.value = config.seriesColumn
  aggregation.value = config.aggregation
  nullStrategy.value = config.nullStrategy
  showLegend.value = config.showLegend
  updateViewConfig()
}
const applyDashboardItems = (items: DashboardItem[]) => {
  dashboardItems.value = items.slice(0, 24).map(item => ({ ...item }))
  updateViewConfig()
}
const markViewDirty = () => { if (table.value?.format === 'longedit-table') markDirty() }
const clearFilter = () => { filterQuery.value = ''; markViewDirty() }
const toggleFreeze = () => { freezeFirstColumn.value = !freezeFirstColumn.value; markViewDirty() }
const editHeader = (column: number, event: Event) => { if (table.value) { table.value.headers[column] = (event.target as HTMLInputElement).value; markDirty() } }
const editCell = (row: number, column: number, event: Event) => {
  if (!table.value) return
  table.value.rows[row][column] = (event.target as HTMLInputElement).value
  markDirty()
  scheduleTypeRefresh(column)
}

const cycleSort = (column: number) => {
  if (sortColumn.value !== column) { sortColumn.value = column; sortDirection.value = 'asc' }
  else if (sortDirection.value === 'asc') sortDirection.value = 'desc'
  else clearSort()
  markViewDirty()
  scrollRef.value?.scrollTo({ top: 0 })
}
const clearSort = () => { sortColumn.value = -1; sortDirection.value = 'asc'; markViewDirty() }

const addRow = () => {
  if (!table.value) return
  const entry: RowHistoryEntry = {
    kind: 'add',
    index: table.value.rows.length,
    row: Array(table.value.headers.length).fill(''),
    rowId: `row-${Date.now()}-${table.value.rowIds.length + 1}`,
  }
  table.value.rows.push(entry.row)
  table.value.rowIds.push(entry.rowId)
  pushRowHistory(entry)
  selectedRowId.value = entry.rowId
  markDirty()
  nextTick(() => scrollRef.value?.scrollTo({ top: filteredIndices.value.length * rowHeight }))
}
const addColumn = () => {
  if (!table.value || table.value.headers.length >= 512) return
  table.value.headers.push(`列 ${table.value.headers.length + 1}`)
  table.value.columnTypes.push('empty')
  table.value.columnIds.push(`column-${Date.now()}-${table.value.columnIds.length + 1}`)
  columnWidths.value.push(160)
  table.value.rows.forEach(row => row.push(''))
  markDirty()
}
const pushRowHistory = (entry: RowHistoryEntry) => {
  rowUndoStack.value = [...rowUndoStack.value.slice(-99), { ...entry, row: [...entry.row] }]
  rowRedoStack.value = []
}
const selectRow = (row: number) => {
  if (!table.value) return
  const rowId = table.value.rowIds[row] || ''
  selectedRowId.value = selectedRowId.value === rowId ? '' : rowId
}
const clearRowSelection = () => { selectedRowId.value = '' }
const deleteSelectedRow = () => {
  if (!table.value || selectedRowIndex.value < 0) return
  const index = selectedRowIndex.value
  const entry: RowHistoryEntry = {
    kind: 'delete',
    index,
    row: [...table.value.rows[index]],
    rowId: table.value.rowIds[index],
  }
  table.value.rows.splice(index, 1)
  table.value.rowIds.splice(index, 1)
  pushRowHistory(entry)
  selectedRowId.value = ''
  markDirty()
  notice.value = `第 ${index + 1} 行已从草稿移除，可撤销；点击保存后才会写入文件`
}
const requestDeleteSelectedRow = () => {
  if (selectedRowIndex.value < 0) return
  const rowNumber = selectedRowIndex.value + 1
  dialog.warning({
    title: `删除第 ${rowNumber} 行？`,
    content: '此操作只会从当前编辑草稿移除该行，点击保存后才会写入源文件。删除后仍可撤销。',
    positiveText: '删除行',
    negativeText: '取消',
    onPositiveClick: deleteSelectedRow,
  })
}
const undoRowOperation = () => {
  if (!table.value) return
  const entry = rowUndoStack.value[rowUndoStack.value.length - 1]
  if (!entry) return
  rowUndoStack.value = rowUndoStack.value.slice(0, -1)
  let completedEntry = entry
  if (entry.kind === 'add') {
    const index = table.value.rowIds.indexOf(entry.rowId)
    if (index >= 0) {
      completedEntry = { ...entry, index, row: [...table.value.rows[index]] }
      table.value.rows.splice(index, 1)
      table.value.rowIds.splice(index, 1)
    }
    selectedRowId.value = ''
  } else {
    const index = Math.min(entry.index, table.value.rows.length)
    table.value.rows.splice(index, 0, [...entry.row])
    table.value.rowIds.splice(index, 0, entry.rowId)
    selectedRowId.value = entry.rowId
  }
  rowRedoStack.value = [...rowRedoStack.value, completedEntry]
  markDirty()
  notice.value = entry.kind === 'delete' ? '已撤销删除行' : '已撤销新增行'
}
const redoRowOperation = () => {
  if (!table.value) return
  const entry = rowRedoStack.value[rowRedoStack.value.length - 1]
  if (!entry) return
  rowRedoStack.value = rowRedoStack.value.slice(0, -1)
  let completedEntry = entry
  if (entry.kind === 'add') {
    const index = Math.min(entry.index, table.value.rows.length)
    table.value.rows.splice(index, 0, [...entry.row])
    table.value.rowIds.splice(index, 0, entry.rowId)
    selectedRowId.value = entry.rowId
  } else {
    const index = table.value.rowIds.indexOf(entry.rowId)
    if (index >= 0) {
      completedEntry = { ...entry, index, row: [...table.value.rows[index]] }
      table.value.rows.splice(index, 1)
      table.value.rowIds.splice(index, 1)
    }
    selectedRowId.value = ''
  }
  rowUndoStack.value = [...rowUndoStack.value, completedEntry]
  markDirty()
  notice.value = entry.kind === 'delete' ? '已重做删除行' : '已重做新增行'
}
const cardTitle = (row: number) => {
  const column = columnIndex(titleColumn.value)
  return column >= 0 ? table.value?.rows[row][column] || `第 ${row + 1} 行` : `第 ${row + 1} 行`
}
const cardFieldIds = computed(() => cardColumns.value.filter(id => id !== titleColumn.value && id !== groupBy.value))
const moveCard = (row: number, group: string) => {
  if (!table.value) return
  const column = columnIndex(groupBy.value)
  if (column < 0) return
  table.value.rows[row][column] = group === '未分组' ? '' : group
  markDirty()
}
const cardDragStart = (row: number, event: DragEvent) => event.dataTransfer?.setData('text/plain', String(row))
const cardDrop = (group: string, event: DragEvent) => {
  const row = Number(event.dataTransfer?.getData('text/plain'))
  if (Number.isInteger(row) && row >= 0) moveCard(row, group)
}
const toggleCardColumn = (id: string) => {
  cardColumns.value = cardColumns.value.includes(id)
    ? cardColumns.value.filter(item => item !== id)
    : [...cardColumns.value, id].slice(0, 8)
  updateViewConfig()
}

const loadTable = async () => {
  const generation = ++loadGeneration
  loading.value = true
  error.value = ''
  dirty.value = false
  notice.value = ''
  try {
    await store.loadConfig()
    if (generation !== loadGeneration) return
    if (!store.libraryPath || !/(?:\.(csv|tsv)|\.table\.json)$/i.test(tablePath.value)) throw new Error('表格路径无效或知识库尚未配置')
    const document = await invoke<TableDocument>('read_table_file', { libraryRoot: store.libraryPath, path: tablePath.value })
    if (generation !== loadGeneration) return
    table.value = document
    selectedRowId.value = ''
    rowUndoStack.value = []
    rowRedoStack.value = []
    views.value = document.views?.length ? document.views : [{ id: 'grid', name: '表格', kind: 'grid', config: document.view }]
    const requestedView = typeof route.query.view === 'string' ? route.query.view : ''
    activeViewId.value = views.value.some(view => view.id === requestedView)
      ? requestedView
      : views.value.some(view => view.id === document.activeView) ? document.activeView : views.value[0].id
    applyView(activeView.value)
    const viewState = recallWorkspaceViewState(tablePath.value)
    if (viewState) {
      await nextTick()
      scrollRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
      scrollTop.value = viewState.scrollTop
    }
    notice.value = `已解析 ${table.value.rows.length.toLocaleString()} 行`
  } catch (cause) {
    if (generation !== loadGeneration) return
    table.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (generation === loadGeneration) loading.value = false }
}

const saveTable = async () => {
  if (!table.value || !dirty.value || saving.value) return
  captureActiveView()
  saving.value = true
  notice.value = '正在可靠写入…'
  try {
    const result = await invoke<TableWriteResult>('write_table_file', {
      libraryRoot: store.libraryPath,
      path: tablePath.value,
      payload: {
        delimiter: table.value.delimiter,
        encoding: table.value.encoding,
        hasBom: table.value.hasBom,
        lineEnding: table.value.lineEnding,
        expectedSignature: table.value.signature,
        headers: table.value.headers,
        rows: table.value.rows,
        columnTypes: table.value.columnTypes,
        columnIds: table.value.columnIds,
        rowIds: table.value.rowIds,
        view: {
          filter: filterQuery.value,
          sortColumn: sortColumn.value >= 0 ? table.value.columnIds[sortColumn.value] : undefined,
          sortDirection: sortDirection.value,
          frozenColumns: freezeFirstColumn.value ? 1 : 0,
          columnWidths: columnWidths.value,
          groupBy: groupBy.value,
          titleColumn: titleColumn.value,
          cardColumns: cardColumns.value,
          categoryColumn: categoryColumn.value,
          valueColumn: valueColumn.value,
          aggregation: aggregation.value,
          chartType: chartType.value,
          seriesColumn: seriesColumn.value,
          nullStrategy: nullStrategy.value,
          showLegend: showLegend.value,
          dashboardItems: dashboardItems.value,
        },
        views: views.value,
        activeView: activeViewId.value,
      },
    })
    table.value.signature = result.signature
    window.dispatchEvent(new CustomEvent('longedit:table-saved', { detail: tablePath.value }))
    dirty.value = false
    notice.value = `已保存 · ${(result.size / 1024).toFixed(1)} KB`
    message.success('表格已保存')
  } catch (cause) {
    notice.value = '保存失败'
    message.error(String(cause).replace(/^Error:\s*/, ''))
  } finally { saving.value = false }
}

const convertToTable = async () => {
  if (!table.value || dirty.value) { message.warning('请先保存当前修改'); return }
  try {
    const path = await invoke<string>('import_table_file', { libraryRoot: store.libraryPath, path: tablePath.value })
    message.success('已创建开放 Table，原 CSV/TSV 保持不变')
    await openManagedFile(router, path, {}, 'replace')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}

const exportAs = async (format: 'csv' | 'xlsx') => {
  if (!table.value || dirty.value) { message.warning('请先保存当前修改'); return }
  try {
    const path = await invoke<string>('export_table_file', { libraryRoot: store.libraryPath, path: tablePath.value, format })
    message.success(`已导出：${path.split(/[\\/]/).pop()}`)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}

const startColumnResize = (column: number, event: PointerEvent) => {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = columnWidths.value[column] || 160
  const move = (next: PointerEvent) => {
    columnWidths.value[column] = Math.min(600, Math.max(60, startWidth + next.clientX - startX))
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    markViewDirty()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}

const handleScroll = () => { if (scrollRef.value) scrollTop.value = scrollRef.value.scrollTop }
const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveTable() }
  const target = event.target as HTMLElement | null
  const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable
  if (!isEditing && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRowOperation() }
  if (!isEditing && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); redoRowOperation() }
  if (!isEditing && event.key === 'Delete' && selectedRowIndex.value >= 0) { event.preventDefault(); requestDeleteSelectedRow() }
  if (!isEditing && event.key === 'Escape') clearRowSelection()
}
const mayLeave = () => {
  if (!dirty.value) return Promise.resolve(true)
  return new Promise<boolean>(resolve => {
    dialog.warning({
      title: '表格还有未保存修改',
      content: '离开后会丢失当前编辑草稿，源文件不会被修改。',
      positiveText: '放弃修改并离开',
      negativeText: '继续编辑',
      closable: false,
      maskClosable: false,
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
    })
  })
}
const leaveTable = () => { void router.push('/library') }
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

watch([tablePath, () => route.query.view], loadTable)
watch(scrollRef, element => {
  resizeObserver?.disconnect()
  if (element) {
    viewportHeight.value = element.clientHeight
    resizeObserver?.observe(element)
  }
})
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())
onMounted(() => {
  loadTable()
  window.addEventListener('beforeunload', beforeUnload)
  resizeObserver = new ResizeObserver(() => { if (scrollRef.value) viewportHeight.value = scrollRef.value.clientHeight })
  if (scrollRef.value) resizeObserver.observe(scrollRef.value)
})
onBeforeUnmount(() => {
  if (scrollRef.value) {
    rememberWorkspaceViewState(tablePath.value, { scrollTop: scrollRef.value.scrollTop, scrollLeft: scrollRef.value.scrollLeft })
  }
  window.clearTimeout(typeTimer)
  window.removeEventListener('beforeunload', beforeUnload)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.table-view { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 94%, var(--theme-primary)); outline: none; }
.table-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); box-shadow: 0 2px 10px rgba(0,0,0,.06); z-index: 5; }
.table-title,.table-tools { display: flex; align-items: center; gap: 8px; }.table-title > button,.table-tools > button { height: 32px; padding: 0 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text); background: rgba(0,0,0,.035); cursor: pointer; }.table-tools > button:disabled { opacity: .42; cursor: default; }.table-tools > .icon-tool { width: 32px; display: grid; place-items: center; padding: 0; }.table-tools > .icon-tool svg { width: 16px; height: 16px; }.table-title > button { width: 32px; padding: 0; font-size: 18px; }.table-title div { display: flex; flex-direction: column; }.table-title strong { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.table-title span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.table-tools > button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.08); }.table-tools .save-button { min-width: 72px; color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }.table-tools .save-button:disabled { color: var(--theme-text-secondary); border-color: rgba(0,0,0,.08); background: rgba(0,0,0,.04); cursor: default; }
.table-filter { width: 220px; height: 32px; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; background: rgba(0,0,0,.025); }.table-filter input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--theme-text); background: transparent; font-size: var(--text-compact); }.table-filter button { border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }
.view-tabs { min-height: 38px; display: flex; align-items: end; gap: 4px; padding: 5px 12px 0; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 97%, #dce6ef); }.view-tab { height: 32px; display: flex; align-items: center; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0; color: var(--theme-text-secondary); background: transparent; }.view-tab.active { color: var(--theme-primary); border-color: rgba(0,0,0,.1); background: var(--theme-card); }.view-tab-main,.view-tab-delete,.view-add button { height: 31px; border: 0; color: inherit; background: transparent; cursor: pointer; font-size: var(--text-compact); }.view-tab-main { display: flex; align-items: center; gap: 5px; padding: 0 6px 0 10px; }.view-tab-delete { width: 25px; padding: 0; opacity: .4; }.view-tab-delete:hover,.view-tab-delete:focus-visible { opacity: 1; }.view-add { display: flex; margin-left: 5px; }.view-add button { height: 27px; padding: 0 7px; border-radius: 5px; }.view-add button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }.view-tabs > small { margin: 0 4px 9px auto; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.table-workspace { min-height: 0; flex: 1; display: flex; flex-direction: column; }.table-meta-bar { height: 30px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, transparent); font-size: var(--text-compact); }.table-meta-bar button { padding: 2px 6px; border: 0; color: var(--theme-primary); background: transparent; cursor: pointer; }.table-meta-bar i { margin-left: auto; font-style: normal; }
.table-meta-bar label { display: flex; align-items: center; gap: 4px; }.table-meta-bar select { height: 22px; max-width: 130px; border: 1px solid rgba(0,0,0,.1); border-radius: 4px; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.row-selection-actions { display: flex; align-items: center; gap: 5px; color: var(--theme-text); font-weight: 650; }.row-selection-actions button { display: inline-flex; align-items: center; gap: 3px; border-radius: 4px; }.row-selection-actions button:first-of-type { color: var(--theme-danger, #c83b46); background: color-mix(in srgb, var(--theme-danger, #c83b46) 9%, transparent); }.row-selection-actions svg { width: 13px; height: 13px; }.card-fields { display: flex; align-items: center; gap: 3px; }.card-fields b { font-weight: 500; }.card-fields button { border-radius: 4px; color: var(--theme-text-secondary); background: rgba(0,0,0,.035); }.card-fields button.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.1); }
.table-scroll { min-height: 0; flex: 1; overflow: auto; position: relative; }.table-canvas { min-height: 100%; }.table-header,.table-row { display: grid; }.table-header { position: sticky; top: 0; z-index: 20; height: 46px; background: color-mix(in srgb, var(--theme-card) 96%, #e8edf3); box-shadow: 0 1px 0 rgba(0,0,0,.12); }.virtual-body { position: relative; }.table-row { position: absolute; top: 0; left: 0; height: 34px; }
.header-cell,.data-cell,.row-number { min-width: 0; box-sizing: border-box; border-right: 1px solid rgba(0,0,0,.07); border-bottom: 1px solid rgba(0,0,0,.07); background: var(--theme-card); }.row-number { position: sticky; left: 0; z-index: 6; display: grid; place-items: center; padding: 0; border-top: 0; border-left: 0; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 92%, #dce4ec); cursor: pointer; font-size: var(--text-compact); }.table-row.selected .data-cell,.row-number.selected { background: color-mix(in srgb, var(--theme-card) 84%, var(--theme-primary)); }.row-number.selected { color: var(--theme-primary); box-shadow: inset 3px 0 0 var(--theme-primary); font-weight: 750; }.header-number { z-index: 25; cursor: default; }.header-cell { position: relative; display: grid; grid-template-columns: minmax(0,1fr) 24px; grid-template-rows: 27px 14px; padding: 3px 5px 2px; }.header-cell input,.data-cell input { width: 100%; min-width: 0; box-sizing: border-box; border: 0; outline: 0; color: var(--theme-text); background: transparent; font: inherit; }.header-cell input { font-size: var(--text-compact); font-weight: 700; }.header-cell > button { grid-column: 2; grid-row: 1; border: 0; border-radius: 4px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }.header-cell > button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }.header-cell small { grid-column: 1 / -1; grid-row: 2; color: var(--theme-text-secondary); font-size: var(--text-compact); }.data-cell { padding: 0 7px; }.data-cell input { height: 33px; font-size: var(--text-compact); }.data-cell:focus-within { position: relative; z-index: 4; outline: 2px solid var(--theme-primary); outline-offset: -2px; }.header-cell.frozen,.data-cell.frozen { position: sticky; left: 52px; z-index: 5; box-shadow: 2px 0 5px rgba(0,0,0,.08); }.header-cell.frozen { z-index: 24; }
.column-resize { position: absolute; top: 0; right: -3px; z-index: 3; width: 7px; height: 100%; cursor: col-resize; }.column-resize:hover { background: rgba(var(--theme-primary-rgb),.24); }
.board-scroll { min-height: 0; flex: 1; display: flex; align-items: flex-start; gap: 12px; padding: 14px; overflow: auto; }.board-column { width: 280px; max-height: 100%; flex: none; display: flex; flex-direction: column; border: 1px solid rgba(0,0,0,.08); border-radius: 10px; background: rgba(0,0,0,.025); }.board-column > header { height: 38px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 11px; border-bottom: 1px solid rgba(0,0,0,.07); }.board-column > header strong { font-size: 11px; }.board-column > header span { min-width: 20px; padding: 2px 5px; border-radius: 10px; text-align: center; color: var(--theme-text-secondary); background: rgba(0,0,0,.06); font-size: var(--text-compact); }.board-cards { min-height: 60px; padding: 8px; overflow: auto; }.board-card { margin-bottom: 8px; padding: 10px; border: 1px solid rgba(0,0,0,.08); border-radius: 8px; background: var(--theme-card); box-shadow: 0 2px 7px rgba(0,0,0,.045); cursor: grab; }.board-card:active { cursor: grabbing; }.board-card > strong { display: block; margin-bottom: 8px; font-size: 11px; }.board-card p { display: grid; grid-template-columns: 72px minmax(0,1fr); align-items: center; gap: 5px; margin: 4px 0; }.board-card p span { overflow: hidden; text-overflow: ellipsis; color: var(--theme-text-secondary); font-size: var(--text-compact); }.board-card input { min-width: 0; border: 0; border-bottom: 1px solid transparent; outline: 0; color: var(--theme-text); background: transparent; font-size: var(--text-compact); }.board-card input:focus { border-color: var(--theme-primary); }.board-card small { display: block; margin-top: 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.view-empty { margin: auto; max-width: 480px; color: var(--theme-text-secondary); text-align: center; font-size: 11px; }
.table-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }.table-state strong { color: var(--theme-text); }.table-state p { max-width: 560px; text-align: center; }.table-state button { padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; }.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .table-filter { width: 150px; }.table-title span { display: none; }.table-tools > button:not(.save-button):not(.history-button) { display: none; }.view-tabs { overflow-x: auto; align-items: end; }.view-tab,.view-add,.view-tabs > small { flex: none; } }
@media (max-width: 620px) { .table-toolbar { flex-wrap: wrap; gap: 6px; padding: 7px 10px; }.table-title { width: 100%; min-width: 0; }.table-title div { min-width: 0; }.table-title strong { max-width: 100%; }.table-tools { width: 100%; }.table-filter { min-width: 0; flex: 1; }.table-tools .save-button { flex: none; } }
</style>
