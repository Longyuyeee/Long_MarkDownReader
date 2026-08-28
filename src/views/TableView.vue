<template>
  <div class="table-view" :class="{ 'external-table': isExternal }" tabindex="-1" @keydown="handleKeydown">
    <WorkspaceTabs v-if="isExternal" />
    <header class="table-toolbar">
      <div class="table-title">
        <button title="返回知识库" @click="leaveTable">←</button>
        <div><strong>{{ fileName }}</strong><span v-if="table">{{ isExternal ? '外部表格 · 仅点击保存写回 · ' : '' }}{{ table.rows.length.toLocaleString() }} 行 × {{ table.headers.length }} 列 · {{ formatLabel }} · {{ table.encoding }}</span></div>
      </div>
      <div v-if="table" class="table-tools" data-command-strip data-horizontal-wheel="always">
        <button class="history-button icon-tool" title="撤销行操作 (Ctrl+Z)" :disabled="!rowUndoStack.length || saving" @click="undoRowOperation"><UndoIcon /></button>
        <button class="history-button icon-tool" title="重做行操作 (Ctrl+Y)" :disabled="!rowRedoStack.length || saving" @click="redoRowOperation"><RedoIcon /></button>
        <label class="table-filter"><span>⌕</span><input v-model="filterQuery" placeholder="筛选所有字段" @input="markViewDirty" /><button v-if="filterQuery" type="button" aria-label="清除筛选" @click="clearFilter">×</button></label>
        <label v-if="activeViewKind === 'grid'" class="freeze-control" title="固定最前面的列，横向滚动时保持可见">
          <SnowflakeIcon /><span>冻结</span>
          <input type="number" :value="frozenColumns" min="0" :max="maxFrozenColumns" step="1" aria-label="冻结最前面的列数" @change="setFrozenColumns" />
          <span>列</span>
        </label>
        <button v-if="!isExternal && table.format !== 'longedit-table'" data-testid="m4c1-create-table-copy" :disabled="converting" aria-live="polite" @click="requestConvertToTable">{{ converting ? '正在创建…' : '创建 Table 副本' }}</button>
        <button v-if="!isExternal && table.format === 'longedit-table'" @click="exportAs('csv')">导出 CSV</button>
        <button v-if="!isExternal && table.format === 'longedit-table'" @click="exportAs('xlsx')">导出 XLSX</button>
        <button @click="addRow">＋ 行</button>
        <button @click="addColumn">＋ 列</button>
        <button class="save-button" :disabled="!dirty || saving" aria-live="polite" @click="saveTable">{{ saving ? '保存中' : dirty ? '保存' : '已保存' }}</button>
      </div>
    </header>
    <nav v-if="table?.format === 'longedit-table'" class="view-tabs" aria-label="数据视图">
      <div class="view-tab-scroll" role="tablist" data-horizontal-wheel="always">
        <div v-for="view in views" :key="view.id" class="view-tab" :class="{ active: view.id === activeViewId }">
          <button class="view-tab-main" role="tab" :title="`${view.name} · 双击重命名`" :aria-selected="view.id === activeViewId" @click="switchView(view.id)" @dblclick="renameView(view)">
            <LayoutGridIcon v-if="view.kind === 'grid'" />
            <ColumnsIcon v-else-if="view.kind === 'board'" />
            <ChartIcon v-else-if="view.kind === 'chart'" />
            <DashboardIcon v-else />
            <span>{{ view.name }}</span>
          </button>
          <button v-if="views.length > 1" class="view-tab-delete" type="button" :aria-label="`删除视图 ${view.name}`" @click="deleteView(view)">×</button>
        </div>
      </div>
      <details class="view-create-menu">
        <summary title="新建数据视图"><PlusIcon /><span>新建视图</span></summary>
        <div>
          <button @click="addView('grid', $event)"><LayoutGridIcon /><span>表格</span></button>
          <button @click="addView('board', $event)"><ColumnsIcon /><span>看板</span></button>
          <button @click="addView('chart', $event)"><ChartIcon /><span>图表</span></button>
          <button @click="addView('dashboard', $event)"><DashboardIcon /><span>仪表盘</span></button>
        </div>
      </details>
    </nav>

    <main class="table-workspace">
      <div v-if="loading" class="table-state"><div class="loader"></div><strong>正在解析 CSV/TSV</strong></div>
      <div v-else-if="error" class="table-state error"><strong>无法打开表格</strong><p>{{ error }}</p><button @click="loadTable">重新加载</button></div>
      <template v-else-if="table">
        <section v-if="activeViewKind === 'board'" class="board-config-bar">
          <div class="board-config-main">
            <span class="board-result-count"><strong>{{ filteredIndices.length.toLocaleString() }}</strong> 张卡片</span>
            <label><span>分组字段</span><select v-model="groupBy" @change="updateBoardConfig"><option v-for="(_, index) in table.headers" :key="table.columnIds[index]" :value="table.columnIds[index]">{{ headerLabel(index) }}</option></select></label>
            <label><span>标题字段</span><select v-model="titleColumn" @change="updateBoardConfig"><option v-for="(_, index) in table.headers" :key="table.columnIds[index]" :value="table.columnIds[index]">{{ headerLabel(index) }}</option></select></label>
            <details class="board-field-picker">
              <summary><SettingsIcon /><span>卡片字段</span><strong>{{ cardFieldIds.length }}/8</strong></summary>
              <div class="board-field-menu">
                <header><strong>卡片正文</strong><span>最多显示 8 个字段</span></header>
                <button
                  v-for="(_, index) in table.headers"
                  :key="table.columnIds[index]"
                  type="button"
                  :class="{ active: cardColumns.includes(table.columnIds[index]) }"
                  :disabled="table.columnIds[index] === groupBy || table.columnIds[index] === titleColumn"
                  :title="table.columnIds[index] === groupBy ? '当前分组字段已显示在列标题' : table.columnIds[index] === titleColumn ? '当前标题字段已显示在卡片顶部' : headerLabel(index)"
                  @click="toggleCardColumn(table.columnIds[index])"
                ><CheckIcon /><span>{{ headerLabel(index) }}</span></button>
              </div>
            </details>
            <i v-if="notice" aria-live="polite">{{ notice }}</i>
          </div>
        </section>
        <div v-else class="table-meta-bar">
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
          <template v-else-if="activeViewKind === 'chart'">
            <span>图表字段、类型和呈现方式可在编辑器侧栏调整</span>
          </template>
          <template v-else>
            <span>仪表盘筛选会同时作用于全部图表，拖动卡片可调整顺序</span>
          </template>
          <i v-if="notice" aria-live="polite">{{ notice }}</i>
        </div>
        <div v-if="activeViewKind === 'grid'" ref="scrollRef" class="table-scroll" data-horizontal-wheel="headers" @scroll="handleScroll">
          <div class="table-canvas" :style="{ width: `${tableWidth}px` }">
            <div class="table-header" :style="gridStyle">
              <div class="row-number header-number">#</div>
              <div v-for="(_, column) in table.headers" :key="table.columnIds[column]" class="header-cell" :class="{ frozen: column < frozenColumns, 'frozen-edge': column === frozenColumns - 1 }" :style="frozenColumnStyle(column)">
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
                data-testid="table-data-row"
                :data-row-id="table.rowIds[item.rowIndex]"
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
                <div v-for="(_, column) in table.headers" :key="column" class="data-cell" :class="{ frozen: column < frozenColumns, 'frozen-edge': column === frozenColumns - 1 }" :style="frozenColumnStyle(column)">
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
            <header><strong :title="group.name">{{ group.name }}</strong><span>{{ group.rows.length }}</span></header>
            <div class="board-cards">
              <article v-for="row in group.rows" :key="table.rowIds[row]" class="board-card" draggable="true" @dragstart="cardDragStart(row, $event)">
                <header class="board-card-title"><GripIcon /><strong :title="cardTitle(row)">{{ cardTitle(row) }}</strong></header>
                <label v-for="id in cardFieldIds" :key="id" class="board-card-field">
                  <span :title="headerLabel(columnIndex(id))">{{ headerLabel(columnIndex(id)) }}</span>
                  <textarea rows="1" :value="table.rows[row][columnIndex(id)]" :title="table.rows[row][columnIndex(id)]" @input="editCell(row, columnIndex(id), $event)"></textarea>
                </label>
                <footer title="拖动卡片到其他分组"><span>#{{ row + 1 }}</span><GripIcon /></footer>
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
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { openManagedFile } from '../services/fileNavigation'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { useDialog, useMessage } from 'naive-ui'
import {
  BarChart3 as ChartIcon,
  Check as CheckIcon,
  Columns3 as ColumnsIcon,
  GripVertical as GripIcon,
  LayoutDashboard as DashboardIcon,
  LayoutGrid as LayoutGridIcon,
  Plus as PlusIcon,
  Redo2 as RedoIcon,
  Settings2 as SettingsIcon,
  Snowflake as SnowflakeIcon,
  Trash2 as TrashIcon,
  Undo2 as UndoIcon,
} from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import TableChartEditor from '../components/TableChartEditor.vue'
import TableDashboard, { type DashboardItem } from '../components/TableDashboard.vue'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { promptAppAction } from '../services/appDialog'

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
const converting = ref(false)
const notice = ref('')
const selectedRowId = ref('')
const rowUndoStack = ref<RowHistoryEntry[]>([])
const rowRedoStack = ref<RowHistoryEntry[]>([])
const filterQuery = ref('')
const sortColumn = ref(-1)
const sortDirection = ref<'asc' | 'desc'>('asc')
const frozenColumns = ref(1)
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
const isExternal = computed(() => route.query.external === '1')
const requestedRowId = computed(() => typeof route.query.row === 'string' ? route.query.row : '')
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
const maxFrozenColumns = computed(() => Math.min(12, table.value?.headers.length || 0))
const conversionTargetName = computed(() => fileName.value.replace(/\.(csv|tsv)$/i, '') + '.table.json')
const normalizedManagedPath = (value: string) => value.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '')
const conversionSourcePath = computed(() => {
  const source = normalizedManagedPath(tablePath.value)
  const root = normalizedManagedPath(store.libraryPath)
  if (root && source.toLocaleLowerCase().startsWith(`${root.toLocaleLowerCase()}/`)) return source.slice(root.length + 1)
  return fileName.value
})
const conversionTargetPath = computed(() => {
  const parts = conversionSourcePath.value.split('/')
  parts[parts.length - 1] = conversionTargetName.value
  return parts.join('/')
})

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
    .filter(index => (
      table.value!.rowIds[index] === requestedRowId.value
      || !query
      || table.value!.rows[index].some(cell => cell.toLocaleLowerCase().includes(query))
    ))
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

const defaultBoardGroupColumn = () => {
  if (!table.value) return ''
  const scored = table.value.columnIds.map((id, index) => {
    const values = table.value!.rows.map(row => row[index]?.trim()).filter(Boolean)
    const distinct = new Set(values).size + (values.length < table.value!.rows.length ? 1 : 0)
    const populated = values.length > 0
    const typePenalty = table.value!.columnTypes[index] === 'text' ? 0 : 40
    const groupPenalty = distinct < 2 ? 80 : Math.abs(Math.min(12, distinct) - 4) * 5
    return { id, index, populated, score: typePenalty + groupPenalty + index / 100 }
  }).filter(candidate => candidate.populated)
  return scored.sort((left, right) => left.score - right.score)[0]?.id || table.value.columnIds[0]
}

const defaultBoardTitleColumn = (groupId: string) => {
  if (!table.value) return ''
  return table.value.columnIds.find((id, index) => id !== groupId
    && table.value!.columnTypes[index] === 'text'
    && table.value!.rows.some(row => row[index]?.trim()))
    || table.value.columnIds.find(id => id !== groupId)
    || groupId
}

const visibleRows = computed(() => {
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop.value - 46) / rowHeight) - 8)
  const count = Math.ceil(viewportHeight.value / rowHeight) + 16
  return filteredIndices.value.slice(start, start + count).map((rowIndex, offset) => ({ rowIndex, virtualIndex: start + offset }))
})

const markDirty = () => {
  dirty.value = true
  notice.value = '有未保存修改'
  const tab = store.tabs.find(item => item.path === tablePath.value)
  if (tab) tab.isDirty = true
}
const captureActiveView = () => {
  const current = activeView.value
  if (!current) return
  current.config = {
    filter: filterQuery.value,
    sortColumn: sortColumn.value >= 0 ? table.value?.columnIds[sortColumn.value] : undefined,
    sortDirection: sortDirection.value,
    frozenColumns: frozenColumns.value,
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
  frozenColumns.value = Math.min(maxFrozenColumns.value, Math.max(0, Math.trunc(config.frozenColumns || 0)))
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
const addView = (kind: ViewKind, event?: MouseEvent) => {
  if (!table.value || table.value.format !== 'longedit-table') return
  captureActiveView()
  const id = `view-${Date.now()}-${views.value.length + 1}`
  const first = table.value.columnIds[0]
  const boardGroup = defaultBoardGroupColumn()
  const boardTitle = defaultBoardTitleColumn(boardGroup)
  const boardFields = table.value.columnIds.filter((columnId, index) => columnId !== boardGroup
    && columnId !== boardTitle
    && table.value!.rows.some(row => row[index]?.trim())).slice(0, 4)
  const numeric = table.value.columnIds.find((_, index) => ['integer', 'number'].includes(table.value!.columnTypes[index]))
  const view: TableViewDefinition = {
    id,
    name: kind === 'board' ? '新看板' : kind === 'chart' ? '新图表' : kind === 'dashboard' ? '新仪表盘' : '新表格',
    kind,
    config: {
      filter: '', sortDirection: 'asc', frozenColumns: 1,
      columnWidths: table.value.headers.map(() => 160), cardColumns: kind === 'board' ? boardFields : table.value.columnIds.slice(1, 4),
      groupBy: kind === 'board' ? boardGroup : first, titleColumn: kind === 'board' ? boardTitle : first, categoryColumn: first, valueColumn: numeric || first, aggregation: 'count',
      chartType: 'bar', nullStrategy: 'skip', showLegend: true,
      dashboardItems: kind === 'dashboard' ? chartViews.value.slice(0, 4).map(chart => ({ chartViewId: chart.id, width: 6 })) : [],
    },
  }
  views.value.push(view)
  activeViewId.value = id
  applyView(view)
  markDirty()
  ;(event?.currentTarget as HTMLElement | undefined)?.closest('details')?.removeAttribute('open')
}
const renameView = async (view: TableViewDefinition) => {
  const name = (await promptAppAction(dialog, {
    title: '重命名视图',
    initialValue: view.name,
    positiveText: '保存名称',
  }))?.trim()
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
const updateBoardConfig = () => {
  cardColumns.value = cardColumns.value.filter(id => id !== groupBy.value && id !== titleColumn.value)
  updateViewConfig()
}
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
const setFrozenColumns = (event: Event) => {
  const requested = Number((event.target as HTMLInputElement).value)
  frozenColumns.value = Math.min(maxFrozenColumns.value, Math.max(0, Number.isFinite(requested) ? Math.trunc(requested) : 0))
  rememberWorkspaceViewState(tablePath.value, {
    scrollTop: scrollRef.value?.scrollTop || 0,
    scrollLeft: scrollRef.value?.scrollLeft || 0,
    frozenColumns: frozenColumns.value,
  })
  markViewDirty()
}
const frozenColumnStyle = (column: number) => column < frozenColumns.value
  ? { left: `${52 + columnWidths.value.slice(0, column).reduce((sum, width) => sum + width, 0)}px` }
  : undefined
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
    if (!/(?:\.(csv|tsv)|\.table\.json)$/i.test(tablePath.value)) throw new Error('表格路径无效')
    if (!isExternal.value && !store.libraryPath) throw new Error('知识库尚未配置')
    const document = await invoke<TableDocument>(isExternal.value ? 'read_external_table_file' : 'read_table_file', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: tablePath.value,
    })
    if (generation !== loadGeneration) return
    table.value = document
    selectedRowId.value = ''
    rowUndoStack.value = []
    rowRedoStack.value = []
    views.value = document.views?.length ? document.views : [{ id: 'grid', name: '表格', kind: 'grid', config: document.view }]
    const requestedView = typeof route.query.view === 'string' ? route.query.view : ''
    const requestedRow = requestedRowId.value && document.rowIds.includes(requestedRowId.value)
      ? requestedRowId.value
      : ''
    const requestedGrid = requestedRow ? views.value.find(view => view.kind === 'grid')?.id : ''
    activeViewId.value = views.value.some(view => view.id === requestedView)
      ? requestedView
      : requestedGrid || (views.value.some(view => view.id === document.activeView) ? document.activeView : views.value[0].id)
    applyView(activeView.value)
    selectedRowId.value = requestedRow
    store.addTab({ id: tablePath.value, title: fileName.value, path: tablePath.value, isDirty: false, external: isExternal.value })
    const viewState = recallWorkspaceViewState(tablePath.value)
    loading.value = false
    if (requestedRow) {
      await nextTick()
      const rowIndex = document.rowIds.indexOf(requestedRow)
      const virtualIndex = filteredIndices.value.indexOf(rowIndex)
      const top = Math.max(0, virtualIndex * rowHeight - Math.max(0, viewportHeight.value / 2 - rowHeight))
      scrollRef.value?.scrollTo({ top })
      scrollTop.value = top
      notice.value = `已定位第 ${(rowIndex + 1).toLocaleString()} 行`
    } else if (viewState) {
      if (typeof viewState.frozenColumns === 'number') frozenColumns.value = Math.min(maxFrozenColumns.value, Math.max(0, Math.trunc(viewState.frozenColumns)))
      await nextTick()
      scrollRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
      scrollTop.value = viewState.scrollTop
    }
    if (!requestedRow) notice.value = `已解析 ${table.value.rows.length.toLocaleString()} 行`
  } catch (cause) {
    if (generation !== loadGeneration) return
    table.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (generation === loadGeneration) loading.value = false }
}

const saveTable = async () => {
  if (!table.value || !dirty.value || saving.value) return
  if (isExternal.value) {
    const confirmed = await new Promise<boolean>(resolve => {
      dialog.warning({
        title: `覆盖外部 ${formatLabel.value}？`,
        content: '保存将覆盖当前外部源文件。Long编辑会先检查文件是否被其他程序修改。',
        positiveText: '确认保存',
        negativeText: '取消',
        closable: false,
        maskClosable: false,
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
      })
    })
    if (!confirmed) return
  }
  captureActiveView()
  saving.value = true
  notice.value = '正在可靠写入…'
  try {
    const payload = {
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
        frozenColumns: frozenColumns.value,
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
    }
    const result = isExternal.value
      ? await invoke<TableWriteResult>('write_external_table_file', { path: tablePath.value, payload })
      : await invoke<TableWriteResult>('write_table_file', { libraryRoot: store.libraryPath, path: tablePath.value, payload })
    table.value.signature = result.signature
    window.dispatchEvent(new CustomEvent('longedit:table-saved', { detail: tablePath.value }))
    dirty.value = false
    const tab = store.tabs.find(item => item.path === tablePath.value)
    if (tab) tab.isDirty = false
    notice.value = `已保存 · ${(result.size / 1024).toFixed(1)} KB`
    message.success('表格已保存')
  } catch (cause) {
    notice.value = '保存失败'
    const detail = String(cause).replace(/^Error:\s*/, '')
    if (isExternal.value && detail.includes('其他程序修改')) {
      dialog.warning({
        title: '外部表格已发生变化',
        content: '源文件在编辑期间被其他程序修改。Long编辑没有覆盖这些变化，请重新打开后再编辑。',
        positiveText: '知道了',
      })
    } else message.error(detail)
  } finally { saving.value = false }
}

const convertToTable = async () => {
  if (!table.value || converting.value) return
  converting.value = true
  try {
    const path = await invoke<string>('import_table_file', { libraryRoot: store.libraryPath, path: tablePath.value })
    window.dispatchEvent(new CustomEvent('longedit:library-file-created', { detail: path }))
    message.success(`Table 副本已创建：${path.split(/[\\/]/).pop()}，正在打开`)
    await openManagedFile(router, path)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { converting.value = false }
}

const requestConvertToTable = () => {
  if (!table.value || dirty.value || converting.value) { message.warning('请先保存当前修改'); return }
  const workspaceWidth = document.querySelector<HTMLElement>('.table-view')?.clientWidth || window.innerWidth
  dialog.info({
    title: '创建可视化 Table 副本？',
    style: { width: `${Math.max(240, Math.min(560, workspaceWidth - 24))}px`, maxWidth: 'calc(100vw - 24px)' },
    content: () => h('div', { class: 'table-conversion-disclosure', 'data-testid': 'm4c1-table-conversion-disclosure', style: { maxHeight: 'min(440px, calc(100vh - 190px))', overflowY: 'auto', paddingRight: '4px' } }, [
      h('p', [h('strong', '来源：'), conversionSourcePath.value]),
      h('p', [h('strong', '候选目标：'), conversionTargetPath.value]),
      h('p', [h('strong', '覆盖策略：'), '绝不覆盖来源或已有目标；如有同名文件，将创建带新序号的目标，并自动打开实际创建的文件。']),
      h('strong', '转换规则与损失：'),
      h('ul', [
        h('li', '第一行作为列名；较短的数据行以空值补齐。'),
        h('li', '每列最多读取前 2,000 个非空值推断类型；单元格原文仍作为文本值保存。'),
        h('li', '目标会生成新的稳定行列 ID，并仅初始化一个“表格”视图。'),
        h('li', `源 ${formatLabel.value} 的编码、BOM 和换行格式不会作为 Table JSON 的物理序列化格式保留。`),
      ]),
      h('p', { class: 'table-conversion-source-safety' }, `原 ${formatLabel.value} 文件保持不变。`),
    ]),
    positiveText: '创建并打开',
    negativeText: '取消',
    onPositiveClick: convertToTable,
  })
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

const handleScroll = () => {
  if (!scrollRef.value) return
  scrollTop.value = scrollRef.value.scrollTop
  rememberWorkspaceViewState(tablePath.value, {
    scrollTop: scrollRef.value.scrollTop,
    scrollLeft: scrollRef.value.scrollLeft,
    frozenColumns: frozenColumns.value,
  })
}
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

watch([tablePath, isExternal, () => route.query.view, () => route.query.row, () => route.query.locatorToken], loadTable)
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
    rememberWorkspaceViewState(tablePath.value, { scrollTop: scrollRef.value.scrollTop, scrollLeft: scrollRef.value.scrollLeft, frozenColumns: frozenColumns.value })
  }
  window.clearTimeout(typeTimer)
  window.removeEventListener('beforeunload', beforeUnload)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.table-view { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 94%, var(--theme-primary)); outline: none; container-type: inline-size; }
.table-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); box-shadow: 0 2px 10px rgba(0,0,0,.06); z-index: 5; }
.table-title,.table-tools { display: flex; align-items: center; gap: 8px; }.table-tools { min-width: 0; max-width: 100%; scroll-padding-inline: 8px; }.table-title > button,.table-tools > button { min-width: max-content; height: 32px; padding: 0 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text); background: rgba(0,0,0,.035); cursor: pointer; }.table-tools > button:disabled { opacity: .42; cursor: default; }.table-tools > .icon-tool { min-width: 32px; width: 32px; display: grid; place-items: center; padding: 0; }.table-tools > .icon-tool svg { width: 16px; height: 16px; }.table-title > button { width: 32px; padding: 0; font-size: 18px; }.table-title div { display: flex; flex-direction: column; }.table-title strong { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.table-title span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.table-tools > button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.08); }.table-tools .save-button { min-width: 72px; color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }.table-tools .save-button:disabled { color: var(--theme-text-secondary); border-color: rgba(0,0,0,.08); background: rgba(0,0,0,.04); cursor: default; }
.freeze-control { height: 32px; display: flex; align-items: center; gap: 5px; padding: 0 7px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text-secondary); background: var(--theme-card); font-size: var(--text-compact); }.freeze-control svg { width: 14px; height: 14px; color: var(--theme-primary); }.freeze-control input { width: 42px; height: 23px; box-sizing: border-box; border: 1px solid rgba(0,0,0,.12); border-radius: 4px; color: var(--theme-text); background: var(--theme-bg); text-align: center; font: inherit; }
.table-filter { width: 220px; height: 32px; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; background: rgba(0,0,0,.025); }.table-filter input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--theme-text); background: transparent; font-size: var(--text-compact); }.table-filter button { border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }
.view-tabs { position: relative; min-height: 42px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 8px; padding: 5px 10px 0; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 97%, #dce6ef); }.view-tab-scroll { min-width: 0; display: flex; align-items: end; gap: 4px; overflow-x: auto; scrollbar-width: none; }.view-tab-scroll::-webkit-scrollbar { width: 0; height: 0; }.view-tab { min-width: 112px; max-width: 220px; height: 36px; flex: none; display: flex; align-items: center; border: 1px solid transparent; border-bottom: 0; border-radius: 6px 6px 0 0; color: var(--theme-text-secondary); background: transparent; }.view-tab.active { color: var(--theme-primary); border-color: rgba(0,0,0,.1); background: var(--theme-card); }.view-tab-main,.view-tab-delete { height: 35px; border: 0; color: inherit; background: transparent; cursor: pointer; font-size: var(--text-compact); }.view-tab-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 7px; padding: 0 7px 0 10px; }.view-tab-main svg { width: 15px; height: 15px; flex: none; }.view-tab-main span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.view-tab-delete { width: 27px; flex: none; padding: 0; opacity: .45; }.view-tab-delete:hover,.view-tab-delete:focus-visible { opacity: 1; }.view-create-menu { position: relative; align-self: center; margin-bottom: 4px; }.view-create-menu summary { height: 29px; display: flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; list-style: none; white-space: nowrap; font-size: var(--text-compact); }.view-create-menu summary::-webkit-details-marker { display: none; }.view-create-menu summary svg,.view-create-menu button svg { width: 15px; height: 15px; }.view-create-menu > div { position: absolute; top: calc(100% + 5px); right: 0; z-index: 45; width: 142px; display: grid; gap: 3px; padding: 5px; border: 1px solid var(--workspace-border-color); border-radius: 7px; background: var(--theme-card); box-shadow: var(--workspace-shadow); }.view-create-menu button { height: 33px; display: flex; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 5px; color: var(--theme-text); background: transparent; cursor: pointer; font-size: var(--text-compact); }.view-create-menu button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }
.table-workspace { min-height: 0; flex: 1; display: flex; flex-direction: column; }.table-meta-bar { height: 30px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-card) 94%, transparent); font-size: var(--text-compact); }.table-meta-bar button { padding: 2px 6px; border: 0; color: var(--theme-primary); background: transparent; cursor: pointer; }.table-meta-bar i { margin-left: auto; font-style: normal; }
.table-meta-bar label { display: flex; align-items: center; gap: 4px; }.table-meta-bar select { height: 22px; max-width: 130px; border: 1px solid rgba(0,0,0,.1); border-radius: 4px; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.row-selection-actions { display: flex; align-items: center; gap: 5px; color: var(--theme-text); font-weight: 650; }.row-selection-actions button { display: inline-flex; align-items: center; gap: 3px; border-radius: 4px; }.row-selection-actions button:first-of-type { color: var(--theme-danger, #c83b46); background: color-mix(in srgb, var(--theme-danger, #c83b46) 9%, transparent); }.row-selection-actions svg { width: 13px; height: 13px; }
.board-config-bar { position: relative; z-index: 30; min-height: 48px; flex: none; display: flex; align-items: center; padding: 6px 12px; box-sizing: border-box; border-bottom: 1px solid rgba(0,0,0,.08); background: color-mix(in srgb, var(--theme-card) 96%, var(--theme-primary)); }.board-config-main { min-width: 0; width: 100%; display: flex; align-items: center; gap: 9px; }.board-result-count { flex: none; padding-right: 10px; border-right: 1px solid var(--workspace-border-color); color: var(--theme-text-secondary); font-size: var(--text-compact); white-space: nowrap; }.board-result-count strong { color: var(--theme-text); font-size: 12px; }.board-config-main > label { min-width: 0; display: flex; align-items: center; gap: 6px; color: var(--theme-text-secondary); font-size: var(--text-compact); white-space: nowrap; }.board-config-main > label span { flex: none; }.board-config-main select { width: clamp(112px, 14vw, 180px); min-width: 0; height: 31px; padding: 0 26px 0 8px; overflow: hidden; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-card); text-overflow: ellipsis; font-size: var(--text-compact); }.board-config-main > i { min-width: 0; margin-left: auto; overflow: hidden; color: var(--theme-primary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); font-style: normal; }.board-field-picker { position: relative; flex: none; }.board-field-picker summary { height: 31px; display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.22); border-radius: 6px; color: var(--theme-text); background: rgba(var(--theme-primary-rgb),.055); cursor: pointer; list-style: none; font-size: var(--text-compact); white-space: nowrap; }.board-field-picker summary::-webkit-details-marker { display: none; }.board-field-picker summary svg { width: 14px; height: 14px; color: var(--theme-primary); }.board-field-picker summary strong { min-width: 30px; padding: 2px 5px; border-radius: 10px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.1); text-align: center; font-size: var(--text-compact); }.board-field-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: min(360px, calc(100vw - 32px)); max-height: min(420px, calc(100vh - 190px)); display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 4px; padding: 8px; overflow: auto; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 7px; background: var(--theme-card); box-shadow: var(--workspace-shadow); }.board-field-menu header { grid-column: 1 / -1; min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 3px 4px 7px; border-bottom: 1px solid var(--workspace-border-color); }.board-field-menu header strong { font-size: 12px; }.board-field-menu header span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.board-field-menu button { min-width: 0; height: 34px; display: flex; align-items: center; gap: 6px; padding: 0 8px; overflow: hidden; border: 1px solid transparent; border-radius: 5px; color: var(--theme-text-secondary); background: var(--workspace-control-bg); cursor: pointer; text-align: left; font-size: var(--text-compact); }.board-field-menu button svg { width: 13px; height: 13px; flex: none; opacity: 0; }.board-field-menu button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.board-field-menu button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.2); background: rgba(var(--theme-primary-rgb),.08); }.board-field-menu button.active svg { opacity: 1; }.board-field-menu button:disabled { opacity: .45; cursor: default; }
.table-scroll { min-height: 0; flex: 1; overflow: auto; position: relative; }.table-canvas { min-height: 100%; }.table-header,.table-row { display: grid; }.table-header { position: sticky; top: 0; z-index: 20; height: 46px; background: color-mix(in srgb, var(--theme-card) 96%, #e8edf3); box-shadow: 0 1px 0 rgba(0,0,0,.12); }.virtual-body { position: relative; }.table-row { position: absolute; top: 0; left: 0; height: 34px; }
.header-cell,.data-cell,.row-number { min-width: 0; box-sizing: border-box; border-right: 1px solid rgba(0,0,0,.07); border-bottom: 1px solid rgba(0,0,0,.07); background: var(--theme-card); }.row-number { position: sticky; left: 0; z-index: 16; display: grid; place-items: center; padding: 0; border-top: 0; border-left: 0; color: var(--theme-text-secondary); background: color-mix(in srgb, var(--theme-surface) 92%, var(--theme-bg)); cursor: pointer; font-size: var(--text-compact); }.table-row.selected .data-cell,.row-number.selected { background: color-mix(in srgb, var(--theme-card) 84%, var(--theme-primary)); }.table-row.selected .data-cell.frozen,.row-number.selected { background: color-mix(in srgb, var(--theme-surface) 84%, var(--theme-primary)); }.row-number.selected { color: var(--theme-primary); box-shadow: inset 3px 0 0 var(--theme-primary); font-weight: 750; }.header-number { z-index: 26; cursor: default; }.header-cell { position: relative; display: grid; grid-template-columns: minmax(0,1fr) 24px; grid-template-rows: 27px 14px; padding: 3px 5px 2px; }.header-cell input,.data-cell input { width: 100%; min-width: 0; box-sizing: border-box; border: 0; outline: 0; color: var(--theme-text); background: transparent; font: inherit; }.header-cell input { font-size: var(--text-compact); font-weight: 700; }.header-cell > button { grid-column: 2; grid-row: 1; border: 0; border-radius: 4px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }.header-cell > button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }.header-cell small { grid-column: 1 / -1; grid-row: 2; color: var(--theme-text-secondary); font-size: var(--text-compact); }.data-cell { padding: 0 7px; }.data-cell input { height: 33px; font-size: var(--text-compact); }.data-cell:focus-within { position: relative; z-index: 17; outline: 2px solid var(--theme-primary); outline-offset: -2px; }.header-cell.frozen,.data-cell.frozen { position: sticky; z-index: 14; background: var(--theme-surface); box-shadow: 1px 0 0 rgba(0,0,0,.12); }.header-cell.frozen { z-index: 24; }.header-cell.frozen:last-of-type,.data-cell.frozen:last-of-type { box-shadow: 3px 0 8px rgba(0,0,0,.13); }
.column-resize { position: absolute; top: 0; right: -3px; z-index: 3; width: 7px; height: 100%; cursor: col-resize; }.column-resize:hover { background: rgba(var(--theme-primary-rgb),.24); }
.header-cell.frozen-edge,.data-cell.frozen-edge { box-shadow: 3px 0 8px rgba(0,0,0,.13); }
.board-scroll { min-width: 0; min-height: 0; flex: 1; display: flex; align-items: stretch; gap: 12px; padding: 12px; overflow: auto; scroll-padding-inline: 12px; }.board-column { width: clamp(260px, 28vw, 320px); min-width: 260px; max-height: 100%; flex: none; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--workspace-border-color); border-radius: 7px; background: color-mix(in srgb, var(--theme-surface) 95%, var(--theme-primary)); }.board-column > header { min-height: 42px; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px 0 12px; border-bottom: 1px solid var(--workspace-border-color); background: color-mix(in srgb, var(--theme-card) 94%, var(--theme-primary)); }.board-column > header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.board-column > header span { min-width: 22px; flex: none; padding: 2px 6px; border-radius: 10px; text-align: center; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.1); font-size: var(--text-compact); }.board-cards { min-height: 60px; flex: 1; padding: 8px; overflow-x: hidden; overflow-y: auto; }.board-card { margin-bottom: 8px; padding: 9px; overflow: hidden; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: var(--theme-card); box-shadow: var(--workspace-shadow-sm); cursor: grab; }.board-card:active { cursor: grabbing; }.board-card-title { min-width: 0; display: grid; grid-template-columns: 14px minmax(0,1fr); align-items: start; gap: 6px; margin-bottom: 8px; }.board-card-title svg { width: 14px; height: 14px; margin-top: 2px; color: var(--theme-text-secondary); }.board-card-title strong { min-width: 0; overflow: hidden; overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.board-card-field { min-width: 0; display: grid; gap: 4px; margin-top: 7px; }.board-card-field > span { min-width: 0; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.board-card-field textarea { width: 100%; min-width: 0; min-height: 34px; max-height: 84px; padding: 7px 8px; overflow: auto; resize: vertical; box-sizing: border-box; border: 1px solid transparent; border-radius: 5px; outline: 0; color: var(--theme-text); background: var(--workspace-control-bg); caret-color: var(--theme-primary); overflow-wrap: anywhere; font: var(--text-compact)/1.45 var(--font-sans); }.board-card-field textarea:hover { border-color: var(--workspace-border-color); }.board-card-field textarea:focus { border-color: var(--theme-primary); background: var(--theme-bg); box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb),.1); }.board-card footer { min-height: 22px; display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--workspace-border-color); color: var(--theme-text-secondary); font-size: var(--text-compact); }.board-card footer svg { width: 13px; height: 13px; }
.view-empty { margin: auto; max-width: 480px; color: var(--theme-text-secondary); text-align: center; font-size: 11px; }
.table-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }.table-state strong { color: var(--theme-text); }.table-state p { max-width: 560px; text-align: center; }.table-state button { padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; }.loader { width: 26px; height: 26px; border: 3px solid rgba(var(--theme-primary-rgb),.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
:global(.table-conversion-disclosure) { max-width: 560px; display: grid; gap: 8px; line-height: 1.55; }.table-conversion-disclosure :global(p) { margin: 0; overflow-wrap: anywhere; }.table-conversion-disclosure :global(ul) { display: grid; gap: 4px; margin: 0; padding-left: 20px; }.table-conversion-disclosure :global(.table-conversion-source-safety) { padding: 7px 9px; border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); font-weight: 650; }
@media (max-width: 900px) { .table-filter { width: 150px; }.table-title span { display: none; }.view-create-menu summary span { display: none; }.board-config-main { overflow-x: auto; scrollbar-width: none; }.board-config-main::-webkit-scrollbar { width: 0; height: 0; }.board-config-main > * { flex: none; }.board-config-main > i { display: none; } }
@media (max-width: 620px) { .table-toolbar { flex-wrap: wrap; gap: 6px; padding: 7px 10px; }.table-title { width: 100%; min-width: 0; }.table-title div { min-width: 0; }.table-title strong { max-width: 100%; }.table-tools { width: 100%; }.table-filter { min-width: 0; flex: 1; }.table-tools .save-button { flex: none; }.view-tab { min-width: 104px; max-width: 160px; }.board-config-bar { padding-inline: 8px; }.board-result-count { padding-right: 7px; }.board-config-main select { width: 126px; }.board-field-menu { position: fixed; top: 148px; right: 8px; width: calc(100vw - 16px); } }
@container (max-width: 900px) { .table-toolbar { flex-wrap: wrap; gap: 6px; padding: 7px 10px; }.table-title { width: 100%; min-width: 0; }.table-title div { min-width: 0; }.table-title strong { max-width: 100%; }.table-tools { width: 100%; overflow-x: auto; }.table-tools > * { flex: none; }.table-filter { min-width: 150px; flex: 1; }.board-config-main { overflow-x: auto; scrollbar-width: none; }.board-config-main::-webkit-scrollbar { width: 0; height: 0; }.board-config-main > * { flex: none; }.board-config-main > i { display: none; } }
</style>
