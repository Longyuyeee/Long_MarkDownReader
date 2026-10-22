<template>
  <div class="table-view" :class="{ 'external-table': isExternal }" :inert="loading && !!table" :aria-busy="loading" tabindex="-1" @keydown="handleKeydown">
    <div v-if="loading && table" class="table-switch-progress" role="status">正在切换表格…</div>
    <WorkspaceTabs v-if="isExternal" />
    <header class="workspace-document-header table-toolbar">
      <div class="table-title">
        <button title="返回知识库" @click="leaveTable">←</button>
        <div class="workspace-document-copy"><strong class="workspace-file-name">{{ fileName }}</strong><span v-if="table">{{ isExternal ? '外部表格 · 仅点击保存写回 · ' : '' }}{{ table.rows.length.toLocaleString() }} 行 × {{ table.headers.length }} 列 · {{ formatLabel }} · {{ table.encoding }}</span></div>
      </div>
      <div v-if="table" class="table-tools" data-command-strip data-horizontal-wheel="always">
        <button class="history-button icon-tool" title="撤销数据修改 (Ctrl+Z)" :disabled="!rowUndoStack.length" @click="undoRowOperation"><UndoIcon /></button>
        <button class="history-button icon-tool" title="重做数据修改 (Ctrl+Y)" :disabled="!rowRedoStack.length" @click="redoRowOperation"><RedoIcon /></button>
        <label class="table-filter"><span>⌕</span><input v-model="filterQuery" placeholder="筛选所有字段" @input="markViewDirty" /><button v-if="filterQuery" type="button" aria-label="清除筛选" @click="clearFilter">×</button></label>
        <label v-if="activeViewKind === 'grid'" class="freeze-control" title="固定最前面的列，横向滚动时保持可见">
          <SnowflakeIcon /><span>冻结</span>
          <input type="number" :value="frozenColumns" min="0" :max="maxFrozenColumns" step="1" aria-label="冻结最前面的列数" @change="setFrozenColumns" />
          <span>列</span>
        </label>
        <button v-if="!isExternal && table.format !== 'longedit-table'" data-testid="m4c1-create-table-copy" :disabled="converting" aria-live="polite" @click="requestConvertToTable">{{ converting ? '正在创建…' : '创建 Table 副本' }}</button>
        <button v-if="!isExternal && table.format === 'longedit-table'" @click="exportAs('csv')">导出 CSV</button>
        <button v-if="!isExternal && table.format === 'longedit-table'" @click="exportAs('xlsx')">导出 XLSX</button>
        <n-dropdown trigger="click" :options="dataMenuOptions" @select="key => openIssues(key === 'all')"><button data-testid="table-data-menu">数据操作 ▾</button></n-dropdown>
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
        <div data-app-popup>
          <button @click="addView('grid', $event)"><LayoutGridIcon /><span>表格</span></button>
          <button @click="addView('board', $event)"><ColumnsIcon /><span>看板</span></button>
          <button @click="addView('chart', $event)"><ChartIcon /><span>图表</span></button>
          <button @click="addView('dashboard', $event)"><DashboardIcon /><span>仪表盘</span></button>
        </div>
      </details>
    </nav>

    <main class="table-workspace">
      <div v-if="loading && !table" class="table-state"><div class="loader"></div><strong>{{ waitingForSave ? '正在等待上次保存完成…' : '正在加载表格…' }}</strong></div>
      <div v-else-if="error" class="table-state error"><strong>无法打开表格</strong><p>{{ error }}</p><button @click="loadTable">重新加载</button></div>
      <template v-else-if="table">
        <section v-if="activeViewKind === 'board'" class="board-config-bar">
          <div class="board-config-main">
            <span class="board-result-count"><strong>{{ filteredIndices.length.toLocaleString() }}</strong> 张卡片</span>
            <label><span>分组字段</span><select v-model="groupBy" @change="updateBoardConfig"><option v-for="(_, index) in table.headers" :key="table.columnIds[index]" :value="table.columnIds[index]">{{ headerLabel(index) }}</option></select></label>
            <label><span>标题字段</span><select v-model="titleColumn" @change="updateBoardConfig"><option v-for="(_, index) in table.headers" :key="table.columnIds[index]" :value="table.columnIds[index]">{{ headerLabel(index) }}</option></select></label>
            <details class="board-field-picker">
              <summary><SettingsIcon /><span>卡片字段</span><strong>{{ cardFieldIds.length }}/8</strong></summary>
              <div class="board-field-menu" data-app-popup>
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
            <span v-if="cellRange" class="cell-range-actions">
              {{ cellRange.rows.length }} 行 × {{ cellRange.columns.length }} 列
              <button type="button" @click="copySelectedCells">复制选区</button>
              <button type="button" @click="clearSelectedCells">清空</button>
              <button type="button" @click="cellRange = null">取消选区</button>
            </span>
            <WorkspaceHelp v-else label="说明：Shift＋点击选多格 · 粘贴可一" text="Shift＋点击选多格 · 粘贴可一次撤销" />
            <span v-if="sortColumn >= 0">按“{{ headerLabel(sortColumn) }}”{{ sortDirection === 'asc' ? '升序' : '降序' }}</span>
            <button v-if="sortColumn >= 0" @click="clearSort">清除排序</button>
            <span v-if="selectedRowIndex >= 0" class="row-selection-actions">
              已选择第 {{ selectedRowIndex + 1 }} 行
              <button type="button" title="删除选中行" @click="requestDeleteSelectedRow"><TrashIcon />删除</button>
              <button type="button" @click="clearRowSelection">取消选择</button>
            </span>
          </template>
          <template v-else-if="activeViewKind === 'chart'">
            <WorkspaceHelp label="说明：图表字段、类型和呈现方式可在编辑器侧" text="图表字段、类型和呈现方式可在编辑器侧栏调整" />
          </template>
          <template v-else>
            <WorkspaceHelp label="说明：仪表盘筛选会同时作用于全部图表，拖动" text="仪表盘筛选会同时作用于全部图表，拖动卡片可调整顺序" />
          </template>
          <i v-if="notice" aria-live="polite">{{ notice }}</i>
        </div>
        <div v-if="activeViewKind === 'grid'" ref="scrollRef" class="table-scroll" data-horizontal-wheel="headers" @scroll="handleScroll" @copy="copyCellEvent" @cut="copyCellEvent($event, true)">
          <div class="table-canvas" :style="{ width: `${tableWidth}px` }">
            <div class="table-header" :style="gridStyle">
              <div class="row-number header-number">#</div>
              <div v-for="(_, column) in table.headers" :key="table.columnIds[column]" class="header-cell" @contextmenu.prevent="openColumnMenu($event,column)" :class="{ frozen: column < frozenColumns, 'frozen-edge': column === frozenColumns - 1 }" :style="frozenColumnStyle(column)">
                <input :value="table.headers[column]" :aria-label="`第 ${column + 1} 列名称`" @focus="editSession++" @input="editHeader(column, $event)" />
                <button :title="`按 ${headerLabel(column)} 排序`" @click="cycleSort(column)">{{ sortColumn === column ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</button>
                <small>{{ typeLabel(table.columnTypes[column]) }}</small><button v-if="table.validationRules?.[table.columnIds[column]]" class="rule-indicator" :aria-label="`编辑${headerLabel(column)}录入规则`" @click="openRule(table.columnIds[column])">规则</button>
                <span class="column-resize" title="拖动调整列宽" @pointerdown="startColumnResize(column, $event)"></span>
              </div>
            </div>
            <div class="virtual-body" :style="{ height: `${filteredIndices.length * rowHeight}px` }">
              <div
                v-for="item in visibleRows"
                :key="table.rowIds[item.rowIndex]"
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
                <div v-for="(_, column) in table.headers" :key="table.columnIds[column]" class="data-cell" @contextmenu.prevent="openCellMenu($event,item.rowIndex,column)" :class="{ frozen: column < frozenColumns, 'frozen-edge': column === frozenColumns - 1, 'range-selected': selectedCellRows.has(table.rowIds[item.rowIndex]) && selectedCellColumns.has(table.columnIds[column]), 'has-multiline': hasCellNewline(item.rowIndex, column), invalid: !!cellIssue(item.rowIndex,column) }" :style="frozenColumnStyle(column)">
                  <input
                    :value="hasCellNewline(item.rowIndex, column) ? table.rows[item.rowIndex][column].replace(/\r\n|\r|\n/g, ' ⏎ ') : table.rows[item.rowIndex][column]"
                    :readonly="hasCellNewline(item.rowIndex, column)"
                    :aria-invalid="!!cellIssue(item.rowIndex,column)"
                    :title="cellIssue(item.rowIndex,column) || (hasCellNewline(item.rowIndex, column) ? '含换行，双击或 Enter 编辑：' + table.rows[item.rowIndex][column] : undefined)"
                    :aria-label="`${headerLabel(column)}，第 ${item.rowIndex + 1} 行`"
                    @pointerdown="selectCell(item.rowIndex, column, $event)"
                    @focus="focusCell(item.rowIndex, column)"
                    @input="editCell(item.rowIndex, column, $event)"
                    @paste="pasteCells(item.rowIndex, column, $event)"
                    @dblclick="hasCellNewline(item.rowIndex, column) && editMultilineCell(item.rowIndex, column)"
                    @keydown.enter="hasCellNewline(item.rowIndex, column) && ( $event.preventDefault(), editMultilineCell(item.rowIndex, column) )"
                  />
                  <button v-if="hasCellNewline(item.rowIndex, column)" class="multiline-cell-editor" type="button" title="编辑多行内容" :aria-label="`编辑${headerLabel(column)}第${item.rowIndex + 1}行多行内容`" @pointerdown.stop @click="editMultilineCell(item.rowIndex, column)">↵</button>
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
                  <textarea rows="1" :value="table.rows[row][columnIndex(id)]" :title="table.rows[row][columnIndex(id)]" @focus="editSession++" @input="editCell(row, columnIndex(id), $event)"></textarea>
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
    <n-dropdown :show="columnMenu.show" trigger="manual" :x="columnMenu.x" :y="columnMenu.y" :options="[{label:'录入规则…',key:'rule'}]" @clickoutside="columnMenu.show=false" @select="selectColumnAction" />
    <n-dropdown :show="cellMenu.show" trigger="manual" :x="cellMenu.x" :y="cellMenu.y" :options="cellMenuOptions" @clickoutside="cellMenu.show=false" @select="key => selectCellAction(String(key))" />
    <TableFillDialog v-if="fillDialog" :rows="fillDialog.range.rows.length" :columns="fillDialog.range.columns.length" :empty="fillDialog.empty" :apply-fill="applyRangeFill" @close="fillDialog=undefined" />
    <TableRuleDialog v-if="ruleDialog" :key="ruleDialog.columnId" :column-name="headerLabel(columnIndex(ruleDialog.columnId))" :rule="table?.validationRules?.[ruleDialog.columnId]" :temporary="table?.format!=='longedit-table'" @close="ruleDialog=undefined" @apply="applyRule" />
    <TableIssuesDialog v-if="issuesDialog" :issues="issuesDialog.issues" :columns="issuesDialog.document.headers" :column-ids="issuesDialog.document.columnIds" :scope-label="issuesDialog.scope" :has-rules="Object.keys(issuesDialog.document.validationRules||{}).length>0" :busy="issuesDialog.busy" :failure="issuesDialog.failure" :truncated="issuesDialog.truncated" :can-locate="views.some(view=>view.kind==='grid')" :plan="planCorrection" :apply-edit="applyCorrection" @close="issuesDialog=undefined" @locate="locateIssue" />
  </div>
</template>

<script setup lang="ts">
import { useWindowDraftSnapshot } from '../services/windowDrafts'
import WorkspaceHelp from '../components/workspace/WorkspaceHelp.vue'
import { useContextCommands } from '../services/contextCommands'
import { beginWindowSave, recordWindowDraftActivity, useWindowDraft } from '../services/windowDrafts'
import { hasPendingTableSave, tableSaveKey, tryAcquireTableSave, waitForTableSave } from '../utils/tableSaveOwnership'
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { openManagedFile } from '../services/fileNavigation'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { NDropdown, useDialog, useMessage } from 'naive-ui'
import TableRuleDialog from '../components/TableRuleDialog.vue'
import TableFillDialog from '../components/TableFillDialog.vue'
import {planTableRangeFill,type TableCellRange,type TableFillMode} from '../utils/tableRangeFill'
import TableIssuesDialog from '../components/TableIssuesDialog.vue'
import {normalizeTableRule,tableValueIssue,planTableCorrection,type TableRule,type TableRules,type TableIssue} from '../utils/tableValidation'
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
import { applyTableEdit, compareTableIntegers, parseTableClipboard, planTablePaste, serializeTableClipboard, tableEditSize, TABLE_CLIPBOARD_BYTES, TABLE_EDIT_CELLS, TABLE_HISTORY_BYTES, type TableEdit } from '../utils/tableEditing'

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
  validationRules?: TableRules
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
  columnIds?: string[]
}
interface CellHistoryEntry { kind: 'edit'; edit: TableEdit; session?: string }
interface RuleHistoryEntry {kind:'rule';columnId:string;before?:TableRule;after?:TableRule}
type DataHistoryEntry = RowHistoryEntry | CellHistoryEntry | RuleHistoryEntry

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const dialog = useDialog()
const scrollRef = ref<HTMLElement | null>(null)
const table = ref<TableDocument | null>(null)
const presentedPath = ref('')
const presentedExternal = ref(false)
const loading = ref(true)
const error = ref('')
const dirty = ref(false)
const saving = ref(false)
const converting = ref(false)
const notice = ref('')
const selectedRowId = ref('')
const rowUndoStack = ref<DataHistoryEntry[]>([])
const rowRedoStack = ref<DataHistoryEntry[]>([])
const cellRange = ref<{ anchorRow: string; anchorColumn: string; rows: string[]; columns: string[] } | null>(null)
const selectedCellRows = computed(() => new Set(cellRange.value?.rows || []))
const selectedCellColumns = computed(() => new Set(cellRange.value?.columns || []))
let editSession = 0
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
let editRevision = 0
const waitingForSave = ref(false)

const tablePath = computed(() => String(route.query.path || store.activeTabId || ''))
const isExternal = computed(() => route.query.external === '1')
const requestedRowId = computed(() => typeof route.query.row === 'string' ? route.query.row : '')
const fileName = computed(() => (table.value ? presentedPath.value : tablePath.value).split(/[\\/]/).pop() || '数据表')
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
  const values: string[] = []
  for (const row of table.value.rows) { const value = row[column]?.trim(); if (value) values.push(value); if (values.length >= 2_000) break }
  if (!values.length) return 'empty'
  if (values.every(value => /^[-+]?\d+$/.test(value))) return 'integer'
  if (values.every(value => Number.isFinite(Number(value)))) return 'number'
  if (values.every(value => /^(true|false)$/i.test(value))) return 'boolean'
  if (values.every(value => /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value))) return 'date'
  return 'text'
}

const pendingTypeColumns = new Set<number>()
const scheduleTypeRefresh = (column: number) => {
  pendingTypeColumns.add(column)
  window.clearTimeout(typeTimer)
  const document = table.value
  typeTimer = window.setTimeout(() => {
    if (document && table.value === document) for (const index of pendingTypeColumns) document.columnTypes[index] = inferType(index)
    pendingTypeColumns.clear()
  }, 180)
}

const compareValues = (left: string, right: string, type: string) => {
  if (type === 'integer') return compareTableIntegers(left, right)
  if (type === 'number') return (Number(left) || 0) - (Number(right) || 0)
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

interface RuleContext {document:TableDocument;revision:number;generation:number;path:string;root:string;external:boolean}
const ruleDialog=ref<(RuleContext & {columnId:string})>(),issuesDialog=ref<(RuleContext & {issues:TableIssue[];scope:string;busy:boolean;failure:string;truncated:boolean})>()
const columnMenu=ref({show:false,x:0,y:0,columnId:'',document:null as TableDocument|null})
const dataMenuOptions=computed(()=>filterQuery.value?[{label:'检查筛选结果…',key:'filtered'},{label:'检查全部记录…',key:'all'}]:[{label:'检查数据…',key:'all'}])
const visibleCellIssues=computed(()=>{const map=new Map<string,string>(),doc=table.value;if(!doc)return map;const columns=doc.columnIds.map((id,column)=>({id,column,rule:doc.validationRules?.[id]})).filter(c=>c.rule);for(const item of visibleRows.value)for(const c of columns){const reason=tableValueIssue(doc.rows[item.rowIndex][c.column]||'',c.rule);if(reason)map.set(doc.rowIds[item.rowIndex]+':'+c.id,reason)}return map})
const cellIssue=(row:number,column:number)=>table.value?visibleCellIssues.value.get(table.value.rowIds[row]+':'+table.value.columnIds[column])||'':''
const captureRuleContext=():RuleContext=>({document:table.value!,revision:editRevision,generation:loadGeneration,path:tablePath.value,root:store.libraryPath,external:isExternal.value})
function requireRuleContext(context?:RuleContext){if(!context||context.document!==table.value||context.revision!==editRevision||context.generation!==loadGeneration||context.path!==tablePath.value||context.root!==store.libraryPath||context.external!==isExternal.value||loading.value||saving.value||converting.value)throw Error('表格或草稿已有变化，请重新打开检查')}
const rangeKey = () => JSON.stringify(cellRange.value ? {rows:cellRange.value.rows,columns:cellRange.value.columns} : null)
const cellMenu=ref({show:false,x:0,y:0,context:undefined as RuleContext|undefined,rangeKey:''})
const fillDialog=ref<(RuleContext & {range:TableCellRange;rangeKey:string;empty:number})>()
const cellMenuOptions=computed(()=>[
  {key:'copy',label:'复制选区'},
  {key:'cut',label:'剪切选区',disabled:loading.value||saving.value||converting.value},
  {key:'paste',label:'粘贴到选区',disabled:loading.value||saving.value||converting.value},
  {key:'fill',label:'填充选区…',disabled:loading.value||saving.value||converting.value},
  {key:'clear',label:'清空选区',disabled:loading.value||saving.value||converting.value},
])
function requireRangeContext(context?:RuleContext & {rangeKey:string}){
  requireRuleContext(context)
  if(!cellRange.value||rangeKey()!==context!.rangeKey||activeViewKind.value!=='grid')throw Error('选区已变化，请重新选择后打开；原内容未修改')
  if(!['csv','tsv','longedit-table'].includes(table.value!.format))throw Error('当前表格不可编辑')
}
function openCellMenu(event:MouseEvent,row:number,column:number){
  if(!table.value||loading.value||saving.value||converting.value)return
  if(!selectedCellRows.value.has(table.value.rowIds[row])||!selectedCellColumns.value.has(table.value.columnIds[column]))selectCell(row,column)
  columnMenu.value.show=false
  cellMenu.value={show:true,x:event.clientX,y:event.clientY,context:captureRuleContext(),rangeKey:rangeKey()}
}
async function selectCellAction(action:string){
  const menu=cellMenu.value,context=menu.context?{...menu.context,rangeKey:menu.rangeKey}:undefined
  cellMenu.value.show=false
  try{
    requireRangeContext(context)
    if(action==='fill'){
      const values=selectedValues()
      fillDialog.value={...context!,range:{rows:[...cellRange.value!.rows],columns:[...cellRange.value!.columns]},empty:values.reduce((sum,row)=>sum+row.filter(value=>value==='').length,0)}
    }else if(action==='clear')clearSelectedCells()
    else if(action==='paste'){
      const items=await navigator.clipboard.read(),item=items.find(item=>item.types.includes('text/plain'))
      if(!item)throw Error('剪贴板没有可粘贴的文本')
      const text=await(await item.getType('text/plain')).text(),html=item.types.includes('text/html')?await(await item.getType('text/html')).text():''
      requireRangeContext(context)
      const row=table.value!.rowIds.indexOf(cellRange.value!.rows[0]!),column=table.value!.columnIds.indexOf(cellRange.value!.columns[0]!)
      pasteCellValues(row,column,text,/<table\b/i.test(html))
    }else if(action==='copy'||action==='cut'){
      const {text,html}=rangeClipboard()
      await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})])
      if(action==='cut'){requireRangeContext(context);clearSelectedCells()}else notice.value='已复制选区；原值未修改'
    }
  }catch(cause){message.warning(String(cause).replace(/^Error:\s*/,''))}
}
function applyRangeFill(value:string,mode:TableFillMode){
  const context=fillDialog.value
  requireRangeContext(context)
  const edit=planTableRangeFill(table.value!,table.value!.validationRules||{},context!.range,value,mode)
  if(edit.cells.length){editSession++;commitCellEdit(edit)}
  return edit.cells.length
}
function openColumnMenu(event:MouseEvent,column:number){if(!table.value)return;columnMenu.value={show:true,x:event.clientX,y:event.clientY,columnId:table.value.columnIds[column],document:table.value}}
function selectColumnAction(){const menu=columnMenu.value;columnMenu.value.show=false;if(menu.document===table.value)openRule(menu.columnId)}
function openRule(columnId:string){if(!table.value||loading.value||saving.value||converting.value)return;ruleDialog.value={...captureRuleContext(),columnId}}
function markRuleDirty(){if(table.value?.format==='longedit-table')markDirty();else{editRevision++;recordWindowDraftActivity()}}
function applyRule(rule?:TableRule){const context=ruleDialog.value;try{requireRuleContext(context);const id=context!.columnId;if(!table.value!.columnIds.includes(id))throw Error('字段已变化');const before=table.value!.validationRules?.[id],after=rule?normalizeTableRule(rule):undefined;if(JSON.stringify(before)===JSON.stringify(after)){ruleDialog.value=undefined;return}const entry:RuleHistoryEntry={kind:'rule',columnId:id,before,after};if(historyEntryBytes(entry)>TABLE_HISTORY_BYTES)throw Error('规则超过撤销预算');table.value!.validationRules={...table.value!.validationRules};if(after)table.value!.validationRules[id]=after;else delete table.value!.validationRules[id];pushDataHistory(entry);markRuleDirty();notice.value=table.value!.format==='longedit-table'?'规则已应用到草稿，可撤销；仍需保存':'规则仅用于本次检查；创建 Table 副本可保留';ruleDialog.value=undefined}catch(cause){message.warning(String(cause).replace(/^Error:\s*/,''))}}
function applyRuleHistory(entry:RuleHistoryEntry,forward:boolean){const doc=table.value!;if(!doc.columnIds.includes(entry.columnId)||JSON.stringify(doc.validationRules?.[entry.columnId])!==JSON.stringify(forward?entry.before:entry.after))throw Error('规则已变化，未执行撤销');doc.validationRules={...doc.validationRules};const next=forward?entry.after:entry.before;if(next)doc.validationRules[entry.columnId]=next;else delete doc.validationRules[entry.columnId];markRuleDirty()}
async function openIssues(all=false){if(!table.value||loading.value||saving.value)return;const doc=table.value,rows=all?doc.rowIds.map((_,i)=>i):[...filteredIndices.value];issuesDialog.value={...captureRuleContext(),issues:[],scope:all?'全部记录':'当前筛选结果',busy:true,failure:'',truncated:false};const state=issuesDialog.value,columns=doc.columnIds.map((id,column)=>({id,column,rule:doc.validationRules?.[id]})).filter(c=>c.rule);let cells=0;try{outer:for(let n=0;n<rows.length;n++){if(n%64===0){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(issuesDialog.value!==state)return;requireRuleContext(state)}const row=rows[n];for(const c of columns){if(++cells>1_000_000||state.issues.length>=5000){state.truncated=true;break outer}const value=doc.rows[row][c.column]||'',reason=tableValueIssue(value,c.rule);if(reason)state.issues.push({rowId:doc.rowIds[row],columnId:c.id,row,column:c.column,value,reason})}}}catch(cause){if(issuesDialog.value===state)state.failure=String(cause).replace(/^Error:\s*/,'')}finally{if(issuesDialog.value===state)state.busy=false}}
function planCorrection(issues:TableIssue[],columnId:string,value:string){requireRuleContext(issuesDialog.value);if(issuesDialog.value!.busy)throw Error('请等检查完成');return planTableCorrection(table.value!,table.value!.validationRules||{},issues,columnId,value)}
function applyCorrection(edit:TableEdit){requireRuleContext(issuesDialog.value);commitCellEdit(edit);editSession++}
async function locateIssue(issue:TableIssue){const context=issuesDialog.value;try{requireRuleContext(context);const grid=views.value.find(view=>view.kind==='grid');if(!grid)return;if(activeViewId.value!==grid.id)switchView(grid.id);const row=table.value!.rowIds.indexOf(issue.rowId);if(!filteredIndices.value.includes(row)){filterQuery.value='';markViewDirty()}selectedRowId.value=issue.rowId;issuesDialog.value=undefined;await nextTick();const index=filteredIndices.value.indexOf(row);scrollRef.value?.scrollTo({top:Math.max(0,index*rowHeight-100)});await nextTick();scrollRef.value?.querySelector<HTMLElement>('[data-row-id="'+CSS.escape(issue.rowId)+'"] .data-cell:nth-child('+(issue.column+2)+') input')?.focus()}catch(cause){message.warning(String(cause).replace(/^Error:\s*/,''))}}

const markDirty = () => {
  editRevision += 1
  dirty.value = true
  notice.value = '有未保存修改'
  const tab = store.tabs.find(item => item.path === tablePath.value)
  if (tab) tab.isDirty = true
  recordWindowDraftActivity()
}
const historyEntryBytes = (entry: DataHistoryEntry) => entry.kind === 'rule' ? JSON.stringify(entry).length*2+128 : entry.kind === 'edit' ? entry.edit.bytes : 128 + entry.row.reduce((sum, value) => sum + value.length * 2 + 16, 0)
const pushDataHistory = (entry: DataHistoryEntry) => {
  rowRedoStack.value = []
  const history = [...rowUndoStack.value, entry]
  let bytes = history.reduce((sum, item) => sum + historyEntryBytes(item), 0), evicted = false
  while (history.length > 100 || bytes > TABLE_HISTORY_BYTES) { bytes -= historyEntryBytes(history.shift()!); evicted = true }
  rowUndoStack.value = history
  return evicted
}
const refreshEditedTypes = (edit: TableEdit) => {
  if (!table.value) return
  const ids = new Set(edit.cells.map(cell => cell.columnId))
  for (const row of edit.appended) row.values.forEach((value, column) => { if (value) ids.add(edit.columnIds[column]) })
  for (const id of ids) { const column = table.value.columnIds.indexOf(id); if (column >= 0) scheduleTypeRefresh(column) }
}
const commitCellEdit = (edit: TableEdit, session?: string) => {
  if (!table.value || (!edit.cells.length && !edit.headers.length && !edit.appended.length)) return
  const previous = rowUndoStack.value[rowUndoStack.value.length - 1]
  let merged: TableEdit | undefined
  if (session && previous?.kind === 'edit' && previous.session === session) {
    merged = { ...previous.edit, cells: previous.edit.cells.map(cell => ({ ...cell, after: edit.cells.find(next => next.rowId === cell.rowId && next.columnId === cell.columnId)?.after ?? cell.after })), headers: previous.edit.headers.map(header => ({ ...header, after: edit.headers.find(next => next.columnId === header.columnId)?.after ?? header.after })) }
    merged.bytes = tableEditSize(merged)
  }
  const retained = merged || edit
  if (retained.bytes > TABLE_HISTORY_BYTES) throw Error('修改超过8MiB撤销预算，本次未执行')
  applyTableEdit(table.value, edit, true)
  if (merged) rowUndoStack.value = rowUndoStack.value.slice(0, -1)
  const evicted = pushDataHistory({ kind: 'edit', edit: retained, session })
  refreshEditedTypes(edit)
  markDirty()
  notice.value = `${edit.label}已写入草稿，可一次撤销；点击保存后才写入文件${evicted ? '（最早撤销记录已超过容量，已移出）' : ''}`
}
const singleCellEdit = (row: number, column: number, value: string, label: string, session?: string) => {
  const document = table.value
  if (!document || !document.rowIds[row] || !document.columnIds[column]) return
  if (value.length > 1_000_000) throw Error('单元格超过100万字符，本次未修改')
  const before = document.rows[row][column]
  if (before === value) return
  const edit: TableEdit = { label, cells: [{ rowId: document.rowIds[row], columnId: document.columnIds[column], before, after: value }], headers: [], appended: [], columnIds: [...document.columnIds], bytes: 0 }
  edit.bytes = tableEditSize(edit); commitCellEdit(edit, session)
}
const hasCellNewline = (row: number, column: number) => /[\r\n]/.test(table.value?.rows[row]?.[column] || '')
const editMultilineCell = async (row: number, column: number) => {
  const document = table.value, generation = loadGeneration
  if (!document) return
  const rowId = document.rowIds[row], columnId = document.columnIds[column], before = document.rows[row][column]
  const next = await promptAppAction(dialog, { title: '编辑多行单元格', content: '确认只写入当前草稿，可一次撤销；仍须点击保存才写入文件。', initialValue: before, multiline: true, positiveText: '写入草稿' })
  if (next === null) return
  const r = document.rowIds.indexOf(rowId), c = document.columnIds.indexOf(columnId)
  if (table.value !== document || generation !== loadGeneration || r < 0 || c < 0 || document.rows[r][c] !== before) { message.warning('目标单元格已变化，未写入，请重新打开编辑'); return }
  // A textarea exposes LF; retain the cell's existing uniform CRLF style on an explicit edit.
  const value = /\r\n/.test(before) && !/[^\r]\n/.test(before) ? next.replace(/\r\n|\r|\n/g, '\r\n') : next
  try { editSession++; singleCellEdit(r, c, value, '编辑多行单元格') }
  catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const selectCell = (row: number, column: number, event?: PointerEvent) => {
  if (event && event.button !== 0) return
  if (!table.value) return
  const rowId = table.value.rowIds[row], columnId = table.value.columnIds[column]
  if (event?.shiftKey && cellRange.value) {
    event.preventDefault()
    const ids = filteredIndices.value.map(index => table.value!.rowIds[index]), first = ids.indexOf(cellRange.value.anchorRow), last = ids.indexOf(rowId), startColumn = table.value.columnIds.indexOf(cellRange.value.anchorColumn)
    if (first < 0 || last < 0 || startColumn < 0) { cellRange.value = null; return }
    const rows = ids.slice(Math.min(first, last), Math.max(first, last) + 1), columns = table.value.columnIds.slice(Math.min(startColumn, column), Math.max(startColumn, column) + 1)
    if (rows.length * columns.length > TABLE_EDIT_CELLS) { message.warning('选区最多20,000格，请缩小范围'); return }
    cellRange.value = { ...cellRange.value, rows, columns }
  } else cellRange.value = { anchorRow: rowId, anchorColumn: columnId, rows: [rowId], columns: [columnId] }
  selectedRowId.value = ''
}
const focusCell = (row: number, column: number) => { editSession++; if (!cellRange.value || !selectedCellRows.value.has(table.value!.rowIds[row]) || !selectedCellColumns.value.has(table.value!.columnIds[column])) selectCell(row, column) }
const selectedValues = () => {
  if (!table.value || !cellRange.value) throw Error('请先选择单元格')
  const rows = new Map(table.value.rowIds.map((id, index) => [id, index])), visible = new Set(filteredIndices.value.map(index => table.value!.rowIds[index]))
  return cellRange.value.rows.map(id => {
    const index = rows.get(id); if (index === undefined || !visible.has(id)) throw Error('选区已不可见，请重新选择')
    return cellRange.value!.columns.map(columnId => { const column = table.value!.columnIds.indexOf(columnId); if (column < 0) throw Error('选区列已变化'); return table.value!.rows[index][column] })
  })
}
const rangeClipboard = () => {
  const values = selectedValues(), text = serializeTableClipboard(values)
  if (new TextEncoder().encode(text).length > TABLE_CLIPBOARD_BYTES) throw Error('复制内容超过2MiB，请缩小选区')
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return { text, html: '<table>' + values.map(row => '<tr>' + row.map(value => '<td>' + escape(value).split('\n').join('<br>') + '</td>').join('') + '</tr>').join('') + '</table>' }
}
const copySelectedCells = async () => {
  try { const { text, html } = rangeClipboard(); await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]); notice.value = '已复制选区；原值未修改' }
  catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const copyCellEvent = (event: ClipboardEvent, cut = false) => {
  const input = event.target as HTMLInputElement
  if (!input.closest('.data-cell') || !cellRange.value || !event.clipboardData) return
  if (!input.readOnly && cellRange.value.rows.length * cellRange.value.columns.length === 1 && input.selectionStart !== input.selectionEnd) return
  event.preventDefault()
  try { const { text, html } = rangeClipboard(); event.clipboardData.setData('text/plain', text); event.clipboardData.setData('text/html', html); if (cut) clearSelectedCells() }
  catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const pasteCellValues = (row:number,column:number,text:string,structured:boolean) => {
  if(!table.value)return
  let values = parseTableClipboard(text, structured)
  const range = cellRange.value
  if (range && values.length === 1 && values[0].length === 1 && range.rows.length * range.columns.length > 1) values = range.rows.map(() => range.columns.map(() => values[0][0]))
  const visible = filteredIndices.value.map(index => table.value!.rowIds[index]), rowId = range?.rows[0] || table.value.rowIds[row], columnId = range?.columns[0] || table.value.columnIds[column]
  const edit = planTablePaste(table.value, visible, rowId, columnId, values, !filterQuery.value.trim() && sortColumn.value < 0, () => 'row-' + crypto.randomUUID())
  editSession++; commitCellEdit(edit)
  const first = visible.indexOf(rowId), startColumn = table.value.columnIds.indexOf(columnId)
  cellRange.value = { anchorRow: rowId, anchorColumn: columnId, rows: [...visible.slice(first, first + values.length), ...edit.appended.map(item => item.id)], columns: table.value.columnIds.slice(startColumn, startColumn + values[0].length) }
}
const pasteCells = (row: number, column: number, event: ClipboardEvent) => {
  if (!table.value || !event.clipboardData) return
  const text = event.clipboardData.getData('text/plain'), structured = /<table\b/i.test(event.clipboardData.getData('text/html'))
  if (!event.clipboardData.types.includes('text/plain')) return
  if (text.length > TABLE_CLIPBOARD_BYTES || new TextEncoder().encode(text).length > TABLE_CLIPBOARD_BYTES) { event.preventDefault(); message.error('剪贴板超过2MiB，请分批粘贴；本次未修改'); return }
  if (!structured && !/[\t\r\n]/.test(text) && !hasCellNewline(row, column) && (!cellRange.value || cellRange.value.rows.length * cellRange.value.columns.length === 1)) return
  event.preventDefault()
  try {
    pasteCellValues(row,column,text,structured)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const clearSelectedCells = () => {
  if (!table.value || !cellRange.value) return
  try {
    const values = selectedValues(), range = cellRange.value
    const edit: TableEdit = { label: '清空选区', cells: [], headers: [], appended: [], columnIds: [...table.value.columnIds], bytes: 0 }
    values.forEach((row, r) => row.forEach((value, c) => { if (value) edit.cells.push({ rowId: range.rows[r], columnId: range.columns[c], before: value, after: '' }) }))
    edit.bytes = tableEditSize(edit); editSession++; commitCellEdit(edit)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
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
const editHeader = (column: number, event: Event) => {
  if (!table.value) return
  const input = event.target as HTMLInputElement, before = table.value.headers[column]
  if (before === input.value) return
  try {
    if (input.value.length > 1_000_000) throw Error('表头超过100万字符，本次未修改')
    const edit: TableEdit = { label: '编辑表头', cells: [], headers: [{ columnId: table.value.columnIds[column], before, after: input.value }], appended: [], columnIds: [...table.value.columnIds], bytes: 0 }
    edit.bytes = tableEditSize(edit); commitCellEdit(edit, `header-${column}-${editSession}`)
  } catch (cause) { input.value = before; message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const editCell = (row: number, column: number, event: Event) => {
  if (!table.value) return
  const input = event.target as HTMLInputElement
  try { singleCellEdit(row, column, input.value, '编辑单元格', `${table.value.rowIds[row]}-${table.value.columnIds[column]}-${editSession}`) }
  catch (cause) { input.value = table.value.rows[row][column]; message.error(String(cause).replace(/^Error:\s*/, '')) }
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
  if (table.value.rows.length >= 200_000) { message.warning('已达到20万行上限，本次未新增'); return }
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
  pushDataHistory({ ...entry, row: [...entry.row], columnIds: [...table.value!.columnIds] })
}
const selectRow = (row: number) => {
  if (!table.value) return
  cellRange.value = null
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
  if (historyEntryBytes(entry) > TABLE_HISTORY_BYTES) { message.warning('该行超过8MiB撤销预算，本次未删除'); return }
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
  if(entry.kind==='rule'){try{applyRuleHistory(entry,false);rowUndoStack.value.pop();rowRedoStack.value.push(entry)}catch(cause){message.error(String(cause))}return}
  if (entry.kind === 'edit') {
    try {
      applyTableEdit(table.value, entry.edit, false)
      rowUndoStack.value = rowUndoStack.value.slice(0, -1); rowRedoStack.value.push(entry)
      refreshEditedTypes(entry.edit)
      editSession++; markDirty(); notice.value = `已撤销${entry.edit.label}，当前为未保存草稿`
      cellRange.value = null
    } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
    return
  }
  rowUndoStack.value = rowUndoStack.value.slice(0, -1)
  let completedEntry = entry
  if (entry.kind === 'add') {
    const index = table.value.rowIds.indexOf(entry.rowId)
    if (index >= 0) {
      completedEntry = { ...entry, index, row: [...table.value.rows[index]], columnIds: [...table.value.columnIds] }
      table.value.rows.splice(index, 1)
      table.value.rowIds.splice(index, 1)
    }
    selectedRowId.value = ''
  } else {
    const index = Math.min(entry.index, table.value.rows.length)
    table.value.rows.splice(index, 0, table.value.columnIds.map((id, column) => entry.row[entry.columnIds ? entry.columnIds.indexOf(id) : column] ?? ''))
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
  if(entry.kind==='rule'){try{applyRuleHistory(entry,true);rowRedoStack.value.pop();rowUndoStack.value.push(entry)}catch(cause){message.error(String(cause))}return}
  if (entry.kind === 'edit') {
    try {
      applyTableEdit(table.value, entry.edit, true)
      rowRedoStack.value = rowRedoStack.value.slice(0, -1); rowUndoStack.value.push(entry)
      refreshEditedTypes(entry.edit)
      editSession++; markDirty(); notice.value = `已重做${entry.edit.label}，当前为未保存草稿`
      cellRange.value = null
    } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
    return
  }
  rowRedoStack.value = rowRedoStack.value.slice(0, -1)
  let completedEntry = entry
  if (entry.kind === 'add') {
    const index = Math.min(entry.index, table.value.rows.length)
    table.value.rows.splice(index, 0, table.value.columnIds.map((id, column) => entry.row[entry.columnIds ? entry.columnIds.indexOf(id) : column] ?? ''))
    table.value.rowIds.splice(index, 0, entry.rowId)
    selectedRowId.value = entry.rowId
  } else {
    const index = table.value.rowIds.indexOf(entry.rowId)
    if (index >= 0) {
      completedEntry = { ...entry, index, row: [...table.value.rows[index]], columnIds: [...table.value.columnIds] }
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
  try { editSession++; singleCellEdit(row, column, group === '未分组' ? '' : group, '移动看板卡片') }
  catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
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
  ruleDialog.value=undefined;issuesDialog.value=undefined;columnMenu.value.show=false;cellMenu.value.show=false;
  if (scrollRef.value && presentedPath.value) {
    rememberWorkspaceViewState(presentedPath.value, { scrollTop: scrollRef.value.scrollTop, scrollLeft: scrollRef.value.scrollLeft, frozenColumns: frozenColumns.value })
  }
  const requestedPath = tablePath.value
  const requestedExternal = isExternal.value
  // References and view links can target an already-open table. Navigate in
  // its current draft instead of rereading disk or invalidating a pending save.
  if (table.value && dirty.value && !loading.value && presentedPath.value === requestedPath && presentedExternal.value === requestedExternal) {
    cellRange.value = null; editSession++
    const requestedView = typeof route.query.view === 'string' ? route.query.view : ''
    if (views.value.some(view => view.id === requestedView) && activeViewId.value !== requestedView) switchView(requestedView)
    const row = table.value.rowIds.indexOf(requestedRowId.value)
    if (row >= 0) {
      const grid = views.value.find(view => view.kind === 'grid')
      if (grid && activeViewId.value !== grid.id) switchView(grid.id)
      if (!filteredIndices.value.includes(row)) { filterQuery.value = ''; markViewDirty() }
      selectedRowId.value = table.value.rowIds[row]!
      await nextTick()
      const index = filteredIndices.value.indexOf(row)
      scrollRef.value?.scrollTo({top:Math.max(0,index*rowHeight-100)})
    }
    notice.value = '已保留当前未保存的草稿'
    return
  }
  const generation = ++loadGeneration
  if (dirty.value && presentedPath.value && presentedPath.value !== requestedPath) {
    // The route guard has already accepted discarding this draft.
    const previousTab = store.tabs.find(tab => tab.path === presentedPath.value)
    if (previousTab) previousTab.isDirty = false
  }
  loading.value = true
  waitingForSave.value = false
  error.value = ''
  dirty.value = false
  notice.value = ''
  try {
    await store.loadConfig()
    if (generation !== loadGeneration) return
    const requestedRoot = store.libraryPath
    if (!/(?:\.(csv|tsv)|\.table\.json)$/i.test(requestedPath)) throw new Error('表格路径无效')
    if (!requestedExternal && !requestedRoot) throw new Error('知识库尚未配置')
    const key = tableSaveKey(requestedRoot, requestedPath, requestedExternal)
    waitingForSave.value = hasPendingTableSave(key)
    await waitForTableSave(key)
    if (generation !== loadGeneration || tablePath.value !== requestedPath
      || isExternal.value !== requestedExternal || store.libraryPath !== requestedRoot) return
    waitingForSave.value = false
    const document = await invoke<TableDocument>(requestedExternal ? 'read_external_table_file' : 'read_table_file', {
      ...(requestedExternal ? {} : { libraryRoot: requestedRoot }),
      path: requestedPath,
    })
    if (generation !== loadGeneration) return
    table.value = document
    presentedPath.value = requestedPath
    presentedExternal.value = requestedExternal
    selectedRowId.value = ''
    cellRange.value = null
    pendingTypeColumns.clear()
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
      if (generation !== loadGeneration) return
      const rowIndex = document.rowIds.indexOf(requestedRow)
      const virtualIndex = filteredIndices.value.indexOf(rowIndex)
      const top = Math.max(0, virtualIndex * rowHeight - Math.max(0, viewportHeight.value / 2 - rowHeight))
      scrollRef.value?.scrollTo({ top })
      scrollTop.value = top
      notice.value = `已定位第 ${(rowIndex + 1).toLocaleString()} 行`
    } else if (viewState) {
      if (typeof viewState.frozenColumns === 'number') frozenColumns.value = Math.min(maxFrozenColumns.value, Math.max(0, Math.trunc(viewState.frozenColumns)))
      await nextTick()
      if (generation !== loadGeneration) return
      scrollRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
      scrollTop.value = viewState.scrollTop
    } else {
      await nextTick()
      if (generation !== loadGeneration) return
      scrollRef.value?.scrollTo({ top: 0, left: 0 })
      scrollTop.value = 0
    }
    if (!requestedRow) notice.value = `已解析 ${table.value.rows.length.toLocaleString()} 行`
  } catch (cause) {
    if (generation !== loadGeneration) return
    table.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (generation === loadGeneration) { loading.value = false; waitingForSave.value = false } }
}

const saveTable = async () => {
  if (!table.value || loading.value || !dirty.value || saving.value) return
  const savedDocument = table.value
  const savedPath = tablePath.value
  const savedRoot = store.libraryPath
  const savedExternal = isExternal.value
  const savedGeneration = loadGeneration
  const savedTab = store.tabs.find(item => item.path === savedPath)
  const isCurrent = () => table.value === savedDocument && tablePath.value === savedPath
    && store.libraryPath === savedRoot && isExternal.value === savedExternal && loadGeneration === savedGeneration
  // Reserve the action before awaiting the external-file confirmation.
  saving.value = true
  let finishWindowSave: (() => void) | undefined
  let releaseSave: (() => void) | undefined
  try {
    if (savedExternal) {
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
      if (!confirmed || !isCurrent()) return
    }
    releaseSave = tryAcquireTableSave(tableSaveKey(savedRoot, savedPath, savedExternal))
    if (!releaseSave) { message.warning('该表格仍在保存，请等待完成后重试'); return }
    captureActiveView()
    const submittedRevision = editRevision
    finishWindowSave = beginWindowSave()
    notice.value = '正在可靠写入…'
    const payload = JSON.parse(JSON.stringify({
      delimiter: table.value.delimiter,
      encoding: table.value.encoding,
      hasBom: table.value.hasBom,
      lineEnding: table.value.lineEnding,
      expectedSignature: table.value.signature,
      headers: table.value.headers,
      rows: table.value.rows,
      columnTypes: table.value.columnTypes,
      validationRules: table.value.validationRules||{},
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
    }))
    const result = savedExternal
      ? await invoke<TableWriteResult>('write_external_table_file', { path: savedPath, payload })
      : await invoke<TableWriteResult>('write_table_file', { libraryRoot: savedRoot, path: savedPath, payload })
    window.dispatchEvent(new CustomEvent('longedit:table-saved', { detail: savedPath }))
    if (!isCurrent()) return
    savedDocument.signature = result.signature
    dirty.value = editRevision !== submittedRevision
    if (savedTab && store.tabs.includes(savedTab)) savedTab.isDirty = dirty.value
    notice.value = dirty.value ? '已保存提交的内容，新增修改尚未保存' : `已保存 · ${(result.size / 1024).toFixed(1)} KB`
    message.success(dirty.value ? '新增修改仍待保存' : '表格已保存')
  } catch (cause) {
    const detail = String(cause).replace(/^Error:\s*/, '')
    if (!isCurrent()) { message.error(`${savedPath.split(/[\\/]/).pop()} 保存失败：${detail}`); return }
    notice.value = '保存失败'
    if (savedExternal && detail.includes('其他程序修改')) {
      dialog.warning({
        title: '外部表格已发生变化',
        content: '源文件在编辑期间被其他程序修改。Long编辑没有覆盖这些变化，请重新打开后再编辑。',
        positiveText: '知道了',
      })
    } else message.error(detail)
  } finally {
    saving.value = false
    try { finishWindowSave?.() } finally { releaseSave?.() }
  }
}

const convertToTable = async () => {
  if (!table.value || converting.value) return
  converting.value = true
  try {
    const path = await invoke<string>('import_table_file', { libraryRoot: store.libraryPath, path: tablePath.value, expectedSignature: table.value.signature, validationRules: table.value.validationRules||{} })
    window.dispatchEvent(new CustomEvent('longedit:library-file-created', { detail: path }))
    message.success(`Table 副本已创建：${path.split(/[\\/]/).pop()}，正在打开`)
    await openManagedFile(router, path)
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
  finally { converting.value = false }
}

const requestConvertToTable = () => {
  if (!table.value || dirty.value || converting.value) { message.warning('请先保存当前修改'); return }
  // Naive UI dialogs are teleported to the window overlay, so size them against
  // the viewport rather than the editor pane (which can be narrow beside the tree).
  const viewportWidth = window.innerWidth
  dialog.info({
    title: '创建可视化 Table 副本？',
    style: { width: `${Math.max(240, Math.min(560, viewportWidth - 24))}px`, maxWidth: 'calc(100vw - 24px)' },
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
  rememberWorkspaceViewState(presentedPath.value, {
    scrollTop: scrollRef.value.scrollTop,
    scrollLeft: scrollRef.value.scrollLeft,
    frozenColumns: frozenColumns.value,
  })
}
const handleKeydown = (event: KeyboardEvent) => {
  if (loading.value || event.isComposing) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveTable() }
  const target = event.target as HTMLElement | null
  const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable
  const tableEditing = !!target?.closest('.data-cell, .header-cell, .board-card-field')
  if ((!isEditing || tableEditing) && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRowOperation() }
  if ((!isEditing || tableEditing) && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); redoRowOperation() }
  if (tableEditing && cellRange.value && cellRange.value.rows.length * cellRange.value.columns.length > 1 && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); clearSelectedCells() }
  if (!isEditing && event.key === 'Delete' && selectedRowIndex.value >= 0) { event.preventDefault(); requestDeleteSelectedRow() }
  if (event.key === 'Escape') { cellRange.value = null; clearRowSelection() }
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
useWindowDraft(() => dirty.value, () => String(route.query.path || store.activeTabId || ''))
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

watch([tablePath, isExternal, () => route.query.view, () => route.query.row, () => route.query.locatorToken], loadTable)
watch([filterQuery, sortColumn, sortDirection, activeViewId], () => { cellRange.value = null; editSession++ })
watch(filteredIndices, indices => {
  const range = cellRange.value
  if (!range || !table.value) return
  const ids = indices.map(index => table.value!.rowIds[index]), start = ids.indexOf(range.rows[0])
  if (start < 0 || range.rows.some((id, offset) => ids[start + offset] !== id)) cellRange.value = null
})
watch(scrollRef, element => {
  resizeObserver?.disconnect()
  if (element) {
    viewportHeight.value = element.clientHeight
    resizeObserver?.observe(element)
  }
})
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => (to.query.path === from.query.path && to.query.external === from.query.external) || mayLeave())
onMounted(() => {
  loadTable()
  window.addEventListener('beforeunload', beforeUnload)
  resizeObserver = new ResizeObserver(() => { if (scrollRef.value) viewportHeight.value = scrollRef.value.clientHeight })
  if (scrollRef.value) resizeObserver.observe(scrollRef.value)
})
onBeforeUnmount(() => {
  ++loadGeneration
  if (scrollRef.value) {
    rememberWorkspaceViewState(presentedPath.value, { scrollTop: scrollRef.value.scrollTop, scrollLeft: scrollRef.value.scrollLeft, frozenColumns: frozenColumns.value })
  }
  window.clearTimeout(typeTimer)
  window.removeEventListener('beforeunload', beforeUnload)
  resizeObserver?.disconnect()
})

useContextCommands(() => JSON.stringify([store.libraryPath,tablePath.value,isExternal.value,loadGeneration]), () => {
  if (!table.value || loading.value || saving.value || converting.value) return []
  return [
    {id:'table-check-all',title:'检查表格录入…',description:'按列规则检查全部记录，在原窗口查看问题',keywords:'表格 数据 录入 检查 规则',run:()=>openIssues(true)},
    ...(filterQuery.value ? [{id:'table-check-filtered',title:'检查表格筛选结果…',description:'只检查当前筛选出的记录',keywords:'筛选 录入 检查',run:()=>openIssues(false)}] : []),
    ...(!isExternal.value ? [{id:'table-save',title:'保存表格',description:'保存当前表格草稿',keywords:'保存 save',run:()=>saveTable()}] : []),
  ]
})

useWindowDraftSnapshot(handleScroll)
</script>

<style scoped>
.data-cell.invalid{box-shadow:inset 0 -2px var(--status-warning,#b87912)}.header-cell .rule-indicator{font-size:var(--text-compact);color:var(--theme-primary);padding:0 4px;min-width:0}.data-cell.invalid:focus-within{outline:1px solid var(--status-warning,#b87912);outline-offset:-1px}

.cell-range-actions { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--theme-primary); }
.cell-range-hint { min-width: 0; }
.data-cell.range-selected { background: color-mix(in srgb, var(--theme-primary) 13%, var(--theme-card)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-primary) 45%, transparent); }
.data-cell.range-selected input { background: transparent; }
.data-cell.has-multiline { display: flex; align-items: center; }
.multiline-cell-editor { width: 22px; height: 26px; flex: none; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--theme-primary); cursor: pointer; }
.multiline-cell-editor:hover { background: color-mix(in srgb, var(--theme-primary) 12%, transparent); }
.table-view { position: relative; }
.table-switch-progress { position: absolute; top: 0; right: 0; z-index: 8; padding: 4px 10px; border-radius: 0 0 var(--theme-radius-sm) var(--theme-radius-sm); color: var(--theme-primary); background: var(--theme-surface); font-size: var(--text-compact); pointer-events: none; animation: table-switch-notice var(--motion-fast) ease 180ms both; }
@keyframes table-switch-notice { from { opacity: 0; } to { opacity: 1; } }
.table-view { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 94%, var(--theme-primary)); outline: none; container-type: inline-size; }
.table-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); background: var(--theme-card); box-shadow: 0 2px 10px rgba(0,0,0,.06); z-index: 5; }
.table-title,.table-tools { display: flex; align-items: center; gap: 8px; }.table-tools { min-width: 0; max-width: 100%; scroll-padding-inline: 8px; }.table-title > button,.table-tools > button { min-width: max-content; height: 32px; padding: 0 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text); background: rgba(0,0,0,.035); cursor: pointer; }.table-tools > button:disabled { opacity: .42; cursor: default; }.table-tools > .icon-tool { min-width: 32px; width: 32px; display: grid; place-items: center; padding: 0; }.table-tools > .icon-tool svg { width: 16px; height: 16px; }.table-title > button { width: 32px; padding: 0; font-size: 18px; }.table-title div { display: flex; flex-direction: column; }.table-title strong { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.table-title span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.table-tools > button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.4); background: rgba(var(--theme-primary-rgb),.08); }.table-tools .save-button { min-width: 72px; color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); }.table-tools .save-button:disabled { color: var(--theme-text-secondary); border-color: rgba(0,0,0,.08); background: rgba(0,0,0,.04); cursor: default; }
.freeze-control { height: 32px; display: flex; align-items: center; gap: 5px; padding: 0 7px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; color: var(--theme-text-secondary); background: var(--theme-card); font-size: var(--text-compact); }.freeze-control svg { width: 14px; height: 14px; color: var(--theme-primary); }.freeze-control input { width: 42px; height: 23px; box-sizing: border-box; border: 1px solid rgba(0,0,0,.12); border-radius: 4px; color: var(--theme-text); background: var(--theme-bg); text-align: center; font: inherit; }
.table-filter { width: 220px; height: 32px; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid rgba(0,0,0,.1); border-radius: 7px; background: rgba(0,0,0,.025); }.table-filter input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--theme-text); background: transparent; font-size: var(--text-compact); }.table-filter button { border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }
.view-tabs { position: relative; min-height: 34px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 8px; padding: 2px 10px 0; border-bottom: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-card) 97%, #dce6ef); }.view-tab-scroll { min-width: 0; display: flex; align-items: end; gap: 4px; overflow-x: auto; scrollbar-width: none; }.view-tab-scroll::-webkit-scrollbar { width: 0; height: 0; }.view-tab { min-width: 112px; max-width: 220px; height: 30px; flex: none; display: flex; align-items: center; border: 1px solid transparent; border-bottom: 0; border-radius: 6px 6px 0 0; color: var(--theme-text-secondary); background: transparent; }.view-tab.active { color: var(--theme-primary); border-color: rgba(0,0,0,.1); background: var(--theme-card); }.view-tab-main,.view-tab-delete { height: 29px; border: 0; color: inherit; background: transparent; cursor: pointer; font-size: var(--text-compact); }.view-tab-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 7px; padding: 0 7px 0 10px; }.view-tab-main svg { width: 15px; height: 15px; flex: none; }.view-tab-main span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.view-tab-delete { width: 27px; flex: none; padding: 0; opacity: .45; }.view-tab-delete:hover,.view-tab-delete:focus-visible { opacity: 1; }.view-create-menu { position: relative; align-self: center; margin-bottom: 4px; }.view-create-menu summary { height: 29px; display: flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; list-style: none; white-space: nowrap; font-size: var(--text-compact); }.view-create-menu summary::-webkit-details-marker { display: none; }.view-create-menu summary svg,.view-create-menu button svg { width: 15px; height: 15px; }.view-create-menu > div { position: absolute; top: calc(100% + 5px); right: 0; z-index: 45; width: 142px; display: grid; gap: 3px; padding: 5px; border: 1px solid var(--workspace-border-color); border-radius: 7px; background: var(--theme-card); box-shadow: var(--workspace-shadow); }.view-create-menu button { height: 33px; display: flex; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 5px; color: var(--theme-text); background: transparent; cursor: pointer; font-size: var(--text-compact); }.view-create-menu button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }
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
.table-toolbar { flex-shrink: 0; }
.table-meta-bar { min-height: 30px; height: auto; flex-wrap: wrap; padding-block: 4px; }
@container (max-width: 900px) {
  .table-toolbar { flex-wrap: wrap; gap: 6px; padding: 7px 10px; }
  .table-title { width: 100%; min-width: 0; }
  .table-title div { min-width: 0; }
  .table-title strong { max-width: 100%; }
  .table-tools { width: 100%; flex-wrap: wrap; }
  .table-tools > * { flex: none; }
  .table-filter { min-width: 150px; flex: 1; }
  .board-config-main { flex-wrap: wrap; overflow: visible; }
  .board-config-main > * { flex: none; }
  .board-config-main > i { width: 100%; white-space: normal; }
  .board-config-main select { width: 126px; }
  .board-field-picker { position: static; }
  .board-field-menu { width: min(360px, calc(100cqw - 32px)); left: 8px; right: auto; }
  .view-tab { min-width: 104px; max-width: 160px; }
}
</style>
