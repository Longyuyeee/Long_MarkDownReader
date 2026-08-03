<template>
  <section class="dashboard-workspace">
    <header class="dashboard-toolbar">
      <div><strong>仪表盘</strong><span>所有图表共享当前筛选后的 {{ rowIndices.length.toLocaleString() }} 行</span></div>
      <label>
        <select v-model="selectedChartId" :disabled="!availableCharts.length">
          <option value="">选择图表视图</option>
          <option v-for="view in availableCharts" :key="view.id" :value="view.id">{{ view.name }}</option>
        </select>
        <button :disabled="!selectedChartId" @click="addChart">＋ 添加图表</button>
      </label>
    </header>

    <div v-if="resolvedItems.length" class="dashboard-grid">
      <article
        v-for="entry in resolvedItems"
        :key="entry.item.chartViewId"
        class="dashboard-card"
        :style="{ gridColumn: `span ${entry.item.width}` }"
        draggable="true"
        @dragstart="startDrag(entry.item.chartViewId, $event)"
        @dragover.prevent
        @drop="dropOn(entry.item.chartViewId, $event)"
      >
        <header>
          <div><span class="drag-handle" title="拖动调整顺序">⠿</span><strong>{{ entry.view.name }}</strong><small>{{ chartTypeLabel(entry.view.config.chartType) }}</small></div>
          <nav>
            <button title="调整卡片宽度" @click="cycleWidth(entry.item.chartViewId)">{{ entry.item.width }}/12</button>
            <button title="编辑源图表" @click="$emit('edit-chart', entry.view.id)">编辑</button>
            <button class="remove" title="从仪表盘移除" @click="removeChart(entry.item.chartViewId)">×</button>
          </nav>
        </header>
        <TableChartEditor
          readonly
          :headers="headers"
          :column-ids="columnIds"
          :column-types="columnTypes"
          :rows="rows"
          :row-indices="rowIndices"
          :config="entry.view.config"
        />
      </article>
    </div>

    <div v-else class="dashboard-empty">
      <strong>把已有图表组合成仪表盘</strong>
      <p v-if="chartViews.length">从右上角选择图表。添加后可拖动排序，并在 4、6、8、12 栅格宽度之间切换。</p>
      <p v-else>请先新建至少一个图表视图，再回到仪表盘进行组合。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TableChartEditor from './TableChartEditor.vue'

type ChartType = 'bar' | 'line' | 'pie' | 'scatter'
interface ChartConfig {
  chartType: ChartType
  categoryColumn?: string
  valueColumn?: string
  seriesColumn?: string
  aggregation: 'count' | 'sum' | 'average'
  nullStrategy: 'skip' | 'zero'
  showLegend: boolean
}
interface ChartView { id: string; name: string; kind: 'chart'; config: ChartConfig }
export interface DashboardItem { chartViewId: string; width: 4 | 6 | 8 | 12 }

const props = defineProps<{
  headers: string[]
  columnIds: string[]
  columnTypes: string[]
  rows: string[][]
  rowIndices: number[]
  chartViews: ChartView[]
  items: DashboardItem[]
}>()
const emit = defineEmits<{
  (event: 'update:items', value: DashboardItem[]): void
  (event: 'edit-chart', value: string): void
}>()

const selectedChartId = ref('')
const resolvedItems = computed(() => props.items.flatMap(item => {
  const view = props.chartViews.find(candidate => candidate.id === item.chartViewId)
  return view ? [{ item, view }] : []
}))
const availableCharts = computed(() => props.chartViews.filter(view => !props.items.some(item => item.chartViewId === view.id)))
const chartTypeLabel = (type: ChartType) => ({ bar: '柱状图', line: '折线图', pie: '饼图', scatter: '散点图' }[type])
const update = (items: DashboardItem[]) => emit('update:items', items)
const addChart = () => {
  if (!selectedChartId.value || props.items.some(item => item.chartViewId === selectedChartId.value)) return
  update([...props.items, { chartViewId: selectedChartId.value, width: 6 }])
  selectedChartId.value = ''
}
const removeChart = (id: string) => update(props.items.filter(item => item.chartViewId !== id))
const cycleWidth = (id: string) => {
  const widths: DashboardItem['width'][] = [4, 6, 8, 12]
  update(props.items.map(item => item.chartViewId === id
    ? { ...item, width: widths[(widths.indexOf(item.width) + 1) % widths.length] }
    : item))
}
const startDrag = (id: string, event: DragEvent) => {
  event.dataTransfer?.setData('application/x-longedit-dashboard-chart', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
const dropOn = (targetId: string, event: DragEvent) => {
  const sourceId = event.dataTransfer?.getData('application/x-longedit-dashboard-chart')
  if (!sourceId || sourceId === targetId) return
  const next = [...props.items]
  const sourceIndex = next.findIndex(item => item.chartViewId === sourceId)
  const targetIndex = next.findIndex(item => item.chartViewId === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return
  const [source] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, source)
  update(next)
}
</script>

<style scoped>
.dashboard-workspace { min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: auto; background: color-mix(in srgb, var(--theme-bg) 96%, #dce7f0); }
.dashboard-toolbar { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 16px; box-sizing: border-box; border-bottom: 1px solid rgba(0,0,0,.07); background: var(--theme-card); }.dashboard-toolbar > div { display: flex; flex-direction: column; }.dashboard-toolbar strong { font-size: 12px; }.dashboard-toolbar span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.dashboard-toolbar label { display: flex; gap: 6px; }.dashboard-toolbar select,.dashboard-toolbar button,.dashboard-card button { height: 28px; padding: 0 9px; border: 1px solid rgba(0,0,0,.1); border-radius: 6px; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.dashboard-toolbar select { min-width: 170px; }.dashboard-toolbar button { color: #fff; border-color: var(--theme-primary); background: var(--theme-primary); cursor: pointer; }.dashboard-toolbar button:disabled { opacity: .42; cursor: default; }
.dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 330px; gap: 12px; padding: 12px; }.dashboard-card { min-width: 0; display: grid; grid-template-rows: 38px minmax(0,1fr); overflow: hidden; border: 1px solid rgba(0,0,0,.08); border-radius: 11px; background: var(--theme-card); box-shadow: 0 5px 20px rgba(34,58,82,.07); }.dashboard-card > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 0 10px; border-bottom: 1px solid rgba(0,0,0,.07); }.dashboard-card header > div { min-width: 0; display: flex; align-items: center; gap: 6px; }.dashboard-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.dashboard-card small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.drag-handle { color: var(--theme-text-secondary); cursor: grab; font-size: 14px; }.dashboard-card nav { display: flex; gap: 4px; }.dashboard-card button { height: 23px; padding: 0 6px; cursor: pointer; }.dashboard-card button.remove { color: #c44859; }
.dashboard-empty { flex: 1; display: grid; place-content: center; justify-items: center; padding: 30px; color: var(--theme-text-secondary); text-align: center; }.dashboard-empty strong { color: var(--theme-text); font-size: 14px; }.dashboard-empty p { max-width: 520px; font-size: var(--text-compact); line-height: 1.7; }
@media (max-width: 1000px) { .dashboard-card { grid-column: span 6 !important; } }
@media (max-width: 700px) { .dashboard-toolbar { align-items: stretch; flex-direction: column; }.dashboard-toolbar label { display: grid; grid-template-columns: minmax(0,1fr) auto; }.dashboard-grid { grid-template-columns: 1fr; }.dashboard-card { grid-column: 1 !important; } }
</style>
