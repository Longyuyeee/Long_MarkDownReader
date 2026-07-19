<template>
  <section class="table-chart-embed" :class="{ compact }">
    <header>
      <div><strong>{{ title }}</strong><span>{{ sourceLabel }} · 实时引用</span></div>
      <nav>
        <button title="重新读取源数据" :disabled="loading" @mousedown.stop @click.stop="load">↻</button>
        <button title="打开源图表进行编辑" @mousedown.stop @click.stop="$emit('open', resolvedSource)">编辑源图表</button>
      </nav>
    </header>
    <div v-if="loading" class="embed-state">正在读取图表…</div>
    <div v-else-if="error" class="embed-state error"><strong>图表引用不可用</strong><span>{{ error }}</span></div>
    <TableChartEditor
      v-else-if="table && chartView"
      readonly
      :headers="table.headers"
      :column-ids="table.columnIds"
      :column-types="table.columnTypes"
      :rows="table.rows"
      :row-indices="filteredIndices"
      :config="chartConfig"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import TableChartEditor from './TableChartEditor.vue'

type ChartType = 'bar' | 'line' | 'pie' | 'scatter'
interface TableViewConfig {
  filter: string
  sortColumn?: string
  sortDirection: 'asc' | 'desc'
  categoryColumn?: string
  valueColumn?: string
  seriesColumn?: string
  aggregation: 'count' | 'sum' | 'average'
  chartType: ChartType
  nullStrategy: 'skip' | 'zero'
  showLegend: boolean
}
interface TableViewDefinition { id: string; name: string; kind: 'grid' | 'board' | 'chart'; config: TableViewConfig }
interface TableDocument {
  path: string
  signature: string
  headers: string[]
  rows: string[][]
  columnTypes: string[]
  columnIds: string[]
  views: TableViewDefinition[]
}

const props = defineProps<{ libraryRoot: string; source: string; viewId: string; hostPath?: string; compact?: boolean }>()
defineEmits<{ (event: 'open', path: string): void }>()
const table = ref<TableDocument | null>(null)
const loading = ref(true)
const error = ref('')
let generation = 0

const resolvedSource = computed(() => {
  const source = props.source.trim()
  if (/^[A-Za-z]:[\\/]/.test(source) || source.startsWith('/')) return source
  const host = props.hostPath || props.libraryRoot
  const separator = host.includes('\\') ? '\\' : '/'
  const parent = host.substring(0, Math.max(host.lastIndexOf('/'), host.lastIndexOf('\\')))
  return `${parent}${separator}${source.replace(/[\\/]/g, separator)}`
})
const sourceLabel = computed(() => props.source.split(/[\\/]/).pop() || props.source)
const chartView = computed(() => table.value?.views.find(view => view.id === props.viewId && view.kind === 'chart') || null)
const title = computed(() => chartView.value?.name || props.viewId || 'Table 图表')
const chartConfig = computed(() => ({
  chartType: chartView.value?.config.chartType || 'bar' as ChartType,
  categoryColumn: chartView.value?.config.categoryColumn,
  valueColumn: chartView.value?.config.valueColumn,
  seriesColumn: chartView.value?.config.seriesColumn,
  aggregation: chartView.value?.config.aggregation || 'count' as const,
  nullStrategy: chartView.value?.config.nullStrategy || 'skip' as const,
  showLegend: chartView.value?.config.showLegend !== false,
}))
const compareValues = (left: string, right: string, type: string) => {
  if (type === 'integer' || type === 'number') return (Number(left) || 0) - (Number(right) || 0)
  if (type === 'boolean') return Number(/^true$/i.test(left)) - Number(/^true$/i.test(right))
  if (type === 'date') return Date.parse(left) - Date.parse(right)
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}
const filteredIndices = computed(() => {
  if (!table.value || !chartView.value) return []
  const config = chartView.value.config
  const query = config.filter?.trim().toLocaleLowerCase() || ''
  const indices = table.value.rows.map((_, index) => index).filter(index => !query || table.value!.rows[index].some(cell => cell.toLocaleLowerCase().includes(query)))
  const column = config.sortColumn ? table.value.columnIds.indexOf(config.sortColumn) : -1
  if (column >= 0) {
    const direction = config.sortDirection === 'desc' ? -1 : 1
    indices.sort((left, right) => direction * compareValues(table.value!.rows[left][column] || '', table.value!.rows[right][column] || '', table.value!.columnTypes[column]) || left - right)
  }
  return indices
})

const load = async () => {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const document = await invoke<TableDocument>('read_table_file', { libraryRoot: props.libraryRoot, path: resolvedSource.value })
    if (current !== generation) return
    table.value = document
    if (!document.views.some(view => view.id === props.viewId && view.kind === 'chart')) throw new Error(`找不到 chart 视图“${props.viewId}”`)
  } catch (cause) {
    if (current !== generation) return
    table.value = null
    error.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (current === generation) loading.value = false }
}
const handleFocus = () => { void load() }
const handleSaved = (event: Event) => {
  const path = (event as CustomEvent<string>).detail
  if (path && path.toLocaleLowerCase() === resolvedSource.value.toLocaleLowerCase()) void load()
}
watch(() => [props.source, props.viewId, props.hostPath, props.libraryRoot], load)
onMounted(() => { void load(); window.addEventListener('focus', handleFocus); window.addEventListener('longedit:table-saved', handleSaved) })
onBeforeUnmount(() => { generation += 1; window.removeEventListener('focus', handleFocus); window.removeEventListener('longedit:table-saved', handleSaved) })
</script>

<style scoped>
.table-chart-embed { min-width: 0; min-height: 300px; display: grid; grid-template-rows: 42px minmax(0,1fr); overflow: hidden; border: 1px solid rgba(0,0,0,.09); border-radius: 10px; background: var(--theme-card); box-shadow: 0 5px 18px rgba(32,54,76,.08); }
.table-chart-embed > header { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 11px 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); }.table-chart-embed header > div { min-width: 0; display: flex; flex-direction: column; }.table-chart-embed header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.table-chart-embed header span { color: var(--theme-text-secondary); font-size: 7px; }.table-chart-embed nav { display: flex; gap: 5px; }.table-chart-embed button { height: 25px; padding: 0 7px; border: 1px solid rgba(0,0,0,.09); border-radius: 5px; color: var(--theme-text-secondary); background: rgba(0,0,0,.025); cursor: pointer; font-size: 8px; }.table-chart-embed button:hover { color: var(--theme-primary); border-color: var(--theme-primary); }.table-chart-embed button:disabled { opacity: .45; }
.embed-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 18px; color: var(--theme-text-secondary); text-align: center; font-size: 9px; }.embed-state.error strong { color: #d45555; }.embed-state span { max-width: 460px; word-break: break-word; }
.table-chart-embed.compact { min-height: 0; height: 100%; border: 0; border-radius: 0; box-shadow: none; }.table-chart-embed.compact > header { height: 37px; }
</style>
