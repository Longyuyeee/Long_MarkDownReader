<template>
  <div class="chart-editor" :class="{ readonly }">
    <aside v-if="!readonly" class="chart-settings">
      <header>
        <strong>图表编辑器</strong>
        <small>配置与数据分离保存</small>
      </header>

      <section>
        <b>图表类型</b>
        <div class="chart-types">
          <button v-for="item in chartTypes" :key="item.value" :class="{ active: config.chartType === item.value }" @click="change('chartType', item.value)">
            <span>{{ item.icon }}</span>{{ item.label }}
          </button>
        </div>
      </section>

      <section class="field-settings">
        <b>字段映射</b>
        <label>{{ config.chartType === 'scatter' ? 'X 轴' : '分类' }}
          <select :value="config.categoryColumn" @change="selectField('categoryColumn', $event)">
            <option v-for="(header, index) in headers" :key="columnIds[index]" :value="columnIds[index]">{{ header || `列 ${index + 1}` }}</option>
          </select>
        </label>
        <label>{{ config.chartType === 'scatter' ? 'Y 轴' : '数值' }}
          <select :value="config.valueColumn || ''" @change="selectField('valueColumn', $event)">
            <option value="">{{ config.aggregation === 'count' && config.chartType !== 'scatter' ? '无需数值字段' : '请选择字段' }}</option>
            <option v-for="(header, index) in headers" :key="columnIds[index]" :value="columnIds[index]">{{ header || `列 ${index + 1}` }} · {{ typeName(columnTypes[index]) }}</option>
          </select>
        </label>
        <label>系列（可选）
          <select :value="config.seriesColumn || ''" @change="selectField('seriesColumn', $event)">
            <option value="">单一系列</option>
            <option v-for="(header, index) in headers" :key="columnIds[index]" :value="columnIds[index]">{{ header || `列 ${index + 1}` }}</option>
          </select>
        </label>
        <label v-if="config.chartType !== 'scatter'">聚合
          <select :value="config.aggregation" @change="selectField('aggregation', $event)">
            <option value="count">计数</option>
            <option value="sum">求和</option>
            <option value="average">平均值</option>
          </select>
        </label>
        <label>空值
          <select :value="config.nullStrategy" @change="selectField('nullStrategy', $event)">
            <option value="skip">跳过空值</option>
            <option value="zero">按 0 处理</option>
          </select>
        </label>
        <label class="legend-toggle"><input type="checkbox" :checked="config.showLegend" @change="toggleLegend($event)" /> 显示图例</label>
      </section>

      <footer>
        <span>{{ dataSummary }}</span>
        <small v-if="truncated">为保证交互性能，已截取前 {{ renderLimit.toLocaleString() }} 项。</small>
      </footer>
    </aside>

    <main class="chart-preview">
      <div v-if="validationMessage" class="chart-empty">
        <strong>还差一个字段</strong>
        <span>{{ validationMessage }}</span>
      </div>
      <div v-else-if="!hasRenderableData" class="chart-empty">
        <strong>没有可绘制的数据</strong>
        <span>调整筛选、字段映射或空值策略后再试。</span>
      </div>
      <svg v-else viewBox="0 0 900 520" role="img" :aria-label="`${chartTypeLabel}，${dataSummary}`">
        <template v-if="config.chartType === 'pie'">
          <g :transform="`translate(${pieCenter.x} ${pieCenter.y})`">
            <path v-for="slice in pieSlices" :key="slice.key" :d="slice.path" :fill="slice.color" stroke="var(--theme-card)" stroke-width="2">
              <title>{{ slice.label }}：{{ formatNumber(slice.value) }}（{{ formatPercent(slice.ratio) }}）</title>
            </path>
            <text v-for="slice in labeledPieSlices" :key="`label-${slice.key}`" class="data-label" :x="slice.labelX" :y="slice.labelY" text-anchor="middle">{{ dataLabelText(slice, slice.ratio) }}</text>
            <circle v-if="pieSlices.length > 1" r="72" fill="var(--theme-card)" />
            <text text-anchor="middle" y="-3" class="pie-total">{{ formatNumber(pieTotal) }}</text>
            <text text-anchor="middle" y="17" class="pie-caption">合计</text>
          </g>
          <g v-if="config.showLegend" class="legend pie-legend">
            <g v-for="item in pieLegendItems" :key="item.slice.key" :transform="`translate(${item.x} ${item.y})`">
              <rect width="11" height="11" rx="2" :fill="item.slice.color" />
              <text x="18" y="10">{{ shorten(item.slice.label, 22) }} · {{ formatPercent(item.slice.ratio) }}</text>
            </g>
          </g>
        </template>

        <template v-else>
          <g class="grid-lines">
            <g v-for="tick in yTicks" :key="tick.value">
              <line :x1="plot.left" :x2="plot.right" :y1="tick.y" :y2="tick.y" />
              <text :x="plot.left - 10" :y="tick.y + 4" text-anchor="end">{{ formatNumber(tick.value) }}</text>
            </g>
          </g>
          <line class="axis" :x1="plot.left" :x2="plot.right" :y1="zeroY" :y2="zeroY" />
          <line class="axis" :x1="plot.left" :x2="plot.left" :y1="plot.top" :y2="plot.bottom" />

          <g v-if="config.chartType === 'bar'">
            <rect v-for="bar in bars" :key="bar.key" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="2" :fill="bar.color">
              <title>{{ bar.category }} · {{ bar.series }}：{{ formatNumber(bar.value) }}</title>
            </rect>
            <text v-for="bar in labeledBars" :key="`label-${bar.key}`" class="data-label" :x="bar.x + bar.width / 2" :y="bar.value >= 0 ? bar.y - 5 : bar.y + bar.height + 11" text-anchor="middle">{{ dataLabelText(bar) }}</text>
          </g>
          <g v-else-if="config.chartType === 'line'">
            <g v-for="line in lines" :key="line.series">
              <polyline :points="line.points.map(point => `${point.x},${point.y}`).join(' ')" fill="none" :stroke="line.color" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
              <circle v-for="point in line.points" :key="point.key" :cx="point.x" :cy="point.y" r="4" :fill="line.color" stroke="var(--theme-card)" stroke-width="2">
                <title>{{ point.category }} · {{ line.series }}：{{ formatNumber(point.value) }}</title>
              </circle>
              <text v-for="point in labeledLinePoints(line.points)" :key="`label-${point.key}`" class="data-label" :x="point.x" :y="point.y - 9" text-anchor="middle">{{ dataLabelText(point) }}</text>
            </g>
          </g>
          <g v-else>
            <circle v-for="point in scatterPoints" :key="point.key" :cx="point.x" :cy="point.y" r="5" :fill="point.color" fill-opacity=".78">
              <title>{{ point.series }} · X {{ formatNumber(point.rawX) }} · Y {{ formatNumber(point.rawY) }}</title>
            </circle>
            <text v-for="point in labeledScatterPoints" :key="`label-${point.key}`" class="data-label" :x="point.x" :y="point.y - 9" text-anchor="middle">{{ scatterDataLabelText(point) }}</text>
          </g>

          <g class="x-labels">
            <template v-if="config.chartType === 'scatter'">
              <text v-for="tick in xTicks" :key="tick.value" :x="tick.x" :y="plot.bottom + 24" text-anchor="middle">{{ formatNumber(tick.value) }}</text>
            </template>
            <template v-else>
              <text v-for="label in xLabels" :key="label.text" :x="label.x" :y="plot.bottom + 24" text-anchor="middle">{{ shorten(label.text, 12) }}</text>
            </template>
          </g>
          <text v-if="config.categoryAxisTitle" class="axis-title" :x="(plot.left + plot.right) / 2" :y="plot.bottom + 49" text-anchor="middle">{{ shorten(config.categoryAxisTitle, 42) }}</text>
          <text v-if="config.valueAxisTitle" class="axis-title" :transform="`translate(${plot.left - 58} ${(plot.top + plot.bottom) / 2}) rotate(-90)`" text-anchor="middle">{{ shorten(config.valueAxisTitle, 36) }}</text>
          <g v-if="config.showLegend && seriesNames.length" class="legend">
            <g v-for="item in legendItems" :key="item.series" :transform="`translate(${item.x} ${item.y})`">
              <rect width="10" height="10" rx="2" :fill="colorFor(item.series)" />
              <text x="16" y="9">{{ shorten(item.series, 17) }}</text>
            </g>
          </g>
        </template>
      </svg>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../store/app'
import { getActiveThemeTone } from '../config/themePresets'

type ChartType = 'bar' | 'line' | 'pie' | 'scatter'
type Aggregation = 'count' | 'sum' | 'average'
type NullStrategy = 'skip' | 'zero'
type LegendPosition = 'none' | 'left' | 'right' | 'top' | 'bottom' | 'top_right'
interface ChartConfig {
  chartType: ChartType
  categoryColumn?: string
  valueColumn?: string
  seriesColumn?: string
  aggregation: Aggregation
  nullStrategy: NullStrategy
  showLegend: boolean
  legendPosition?: LegendPosition
  categoryAxisTitle?: string
  valueAxisTitle?: string
  seriesColors?: Record<string, string>
  dataLabels?: {
    showValue: boolean
    showCategoryName: boolean
    showSeriesName: boolean
    showPercent: boolean
  }
}

const props = defineProps<{
  headers: string[]
  columnIds: string[]
  columnTypes: string[]
  rows: string[][]
  rowIndices: number[]
  config: ChartConfig
  readonly?: boolean
}>()
const emit = defineEmits<{ (event: 'update:config', value: ChartConfig): void }>()

const store = useAppStore()
const palette = computed(() => getActiveThemeTone(store.theme).chartPalette)
const chartTypes: { value: ChartType; label: string; icon: string }[] = [
  { value: 'bar', label: '柱状', icon: '▥' }, { value: 'line', label: '折线', icon: '⌁' },
  { value: 'pie', label: '饼图', icon: '◕' }, { value: 'scatter', label: '散点', icon: '∴' },
]
const legendPosition = computed<LegendPosition>(() => props.config.showLegend ? props.config.legendPosition || 'top' : 'none')
const plot = computed(() => {
  switch (legendPosition.value) {
    case 'left': return { left: 220, right: 860, top: 40, bottom: 454 }
    case 'right':
    case 'top_right': return { left: 82, right: 700, top: 40, bottom: 454 }
    case 'top': return { left: 82, right: 860, top: 62, bottom: 454 }
    case 'bottom': return { left: 82, right: 860, top: 40, bottom: 360 }
    default: return { left: 82, right: 860, top: 40, bottom: 454 }
  }
})
const plotWidth = computed(() => plot.value.right - plot.value.left)
const plotHeight = computed(() => plot.value.bottom - plot.value.top)
const renderLimit = computed(() => props.config.chartType === 'scatter' ? 2_000 : props.config.chartType === 'pie' ? 40 : 60)
const columnIndex = (id?: string) => id ? props.columnIds.indexOf(id) : -1
const typeName = (type: string) => ({ integer: '整数', number: '数值', boolean: '布尔', date: '日期' }[type] || '文本')
const change = <K extends keyof ChartConfig>(key: K, value: ChartConfig[K]) => emit('update:config', { ...props.config, [key]: value })
const selectField = (key: keyof ChartConfig, event: Event) => change(key, (event.target as HTMLSelectElement).value || undefined as never)
const toggleLegend = (event: Event) => change('showLegend', (event.target as HTMLInputElement).checked)
const shorten = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value
const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2, notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard' }).format(value)
const formatPercent = (value: number) => `${(value * 100).toFixed(value >= .1 ? 1 : 2)}%`
const showDataLabels = computed(() => Boolean(
  props.config.dataLabels
  && Object.values(props.config.dataLabels).some(Boolean),
))
const dataLabelText = (item: { category: string; series: string; value: number }, ratio?: number) => {
  const labels = props.config.dataLabels
  if (!labels) return ''
  const parts: string[] = []
  if (labels.showSeriesName) parts.push(item.series)
  if (labels.showCategoryName) parts.push(item.category)
  if (labels.showValue) parts.push(formatNumber(item.value))
  if (labels.showPercent && ratio !== undefined) parts.push(formatPercent(ratio))
  return parts.join(' · ')
}
const scatterDataLabelText = (point: { rawX: number; rawY: number; series: string }) => dataLabelText({
  category: String(point.rawX),
  series: point.series,
  value: point.rawY,
})

const validationMessage = computed(() => {
  if (columnIndex(props.config.categoryColumn) < 0) return props.config.chartType === 'scatter' ? '请选择 X 轴字段。' : '请选择分类字段。'
  if ((props.config.chartType === 'scatter' || props.config.aggregation !== 'count') && columnIndex(props.config.valueColumn) < 0) return props.config.chartType === 'scatter' ? '请选择 Y 轴字段。' : '求和和平均值需要数值字段。'
  return ''
})

interface Aggregate { key: string; category: string; series: string; value: number; count: number }
const aggregated = computed<Aggregate[]>(() => {
  if (validationMessage.value || props.config.chartType === 'scatter') return []
  const categoryIndex = columnIndex(props.config.categoryColumn)
  const valueIndex = columnIndex(props.config.valueColumn)
  const seriesIndex = columnIndex(props.config.seriesColumn)
  const groups = new Map<string, { category: string; series: string; sum: number; count: number; rows: number }>()
  for (const rowIndex of props.rowIndices) {
    const row = props.rows[rowIndex] || []
    const category = row[categoryIndex]?.trim() || '未分类'
    const series = seriesIndex >= 0 ? row[seriesIndex]?.trim() || '未分组' : '数据'
    const raw = valueIndex >= 0 ? row[valueIndex]?.trim() : ''
    const parsed = raw === '' ? NaN : Number(raw)
    if (props.config.aggregation !== 'count' && !Number.isFinite(parsed) && props.config.nullStrategy === 'skip') continue
    const key = `${category}\u0000${series}`
    const item = groups.get(key) || { category, series, sum: 0, count: 0, rows: 0 }
    item.rows += 1
    if (props.config.aggregation !== 'count') {
      item.sum += Number.isFinite(parsed) ? parsed : 0
      item.count += 1
    }
    groups.set(key, item)
  }
  return [...groups].map(([key, item]) => ({
    key, category: item.category, series: item.series, count: item.rows,
    value: props.config.aggregation === 'count' ? item.rows : props.config.aggregation === 'average' ? item.sum / Math.max(1, item.count) : item.sum,
  })).slice(0, renderLimit.value)
})

const categories = computed(() => [...new Set(aggregated.value.map(item => item.category))])
const rawScatter = computed(() => {
  if (validationMessage.value || props.config.chartType !== 'scatter') return []
  const xIndex = columnIndex(props.config.categoryColumn)
  const yIndex = columnIndex(props.config.valueColumn)
  const seriesIndex = columnIndex(props.config.seriesColumn)
  return props.rowIndices.flatMap((rowIndex) => {
    const row = props.rows[rowIndex] || []
    const rawX = row[xIndex]?.trim() === '' ? NaN : Number(row[xIndex])
    const rawY = row[yIndex]?.trim() === '' ? NaN : Number(row[yIndex])
    if ((!Number.isFinite(rawX) || !Number.isFinite(rawY)) && props.config.nullStrategy === 'skip') return []
    return [{ key: String(rowIndex), rawX: Number.isFinite(rawX) ? rawX : 0, rawY: Number.isFinite(rawY) ? rawY : 0, series: seriesIndex >= 0 ? row[seriesIndex]?.trim() || '未分组' : '数据' }]
  }).slice(0, renderLimit.value)
})
const seriesNames = computed(() => [...new Set((props.config.chartType === 'scatter' ? rawScatter.value : aggregated.value).map(item => item.series))])
const colorFor = (series: string) => props.config.seriesColors?.[series]
  || palette.value[Math.max(0, seriesNames.value.indexOf(series)) % palette.value.length]
const legendItems = computed(() => seriesNames.value.slice(0, 10).map((series, index) => {
  switch (legendPosition.value) {
    case 'left': return { series, x: 20, y: 58 + index * 24 }
    case 'right': return { series, x: 720, y: 58 + index * 24 }
    case 'top_right': return { series, x: 720, y: 18 + index * 20 }
    case 'bottom': return { series, x: 90 + (index % 5) * 154, y: 446 + Math.floor(index / 5) * 21 }
    default: return { series, x: 90 + (index % 5) * 154, y: 18 + Math.floor(index / 5) * 20 }
  }
}))
const values = computed(() => props.config.chartType === 'scatter' ? rawScatter.value.map(item => item.rawY) : aggregated.value.map(item => item.value))
const yMin = computed(() => Math.min(0, ...values.value))
const yMax = computed(() => Math.max(1, ...values.value))
const yScale = (value: number) => plot.value.bottom - (value - yMin.value) / Math.max(1e-9, yMax.value - yMin.value) * plotHeight.value
const zeroY = computed(() => yScale(0))
const yTicks = computed(() => Array.from({ length: 6 }, (_, index) => {
  const value = yMin.value + (yMax.value - yMin.value) * index / 5
  return { value, y: yScale(value) }
}).reverse())

const bars = computed(() => {
  const groups = Math.max(1, seriesNames.value.length)
  const categoryWidth = plotWidth.value / Math.max(1, categories.value.length)
  const width = Math.max(2, Math.min(42, categoryWidth * .72 / groups))
  return aggregated.value.map(item => {
    const category = categories.value.indexOf(item.category)
    const series = seriesNames.value.indexOf(item.series)
    const x = plot.value.left + category * categoryWidth + (categoryWidth - width * groups) / 2 + series * width
    const targetY = yScale(item.value)
    return { ...item, x, width: Math.max(1, width - 2), y: Math.min(zeroY.value, targetY), height: Math.max(1, Math.abs(targetY - zeroY.value)), color: colorFor(item.series) }
  })
})
const labeledBars = computed(() => showDataLabels.value && bars.value.length <= 24 ? bars.value : [])
const lines = computed(() => seriesNames.value.map(series => ({
  series, color: colorFor(series),
  points: categories.value.flatMap((category, index) => {
    const item = aggregated.value.find(point => point.category === category && point.series === series)
    return item ? [{ ...item, x: plot.value.left + (index + .5) * plotWidth.value / Math.max(1, categories.value.length), y: yScale(item.value) }] : []
  }),
})))
const labeledLinePoints = <T extends { key: string }>(points: T[]) => showDataLabels.value && points.length <= 24 ? points : []
const xLabels = computed(() => {
  const step = Math.max(1, Math.ceil(categories.value.length / 12))
  return categories.value.flatMap((text, index) => index % step ? [] : [{ text, x: plot.value.left + (index + .5) * plotWidth.value / Math.max(1, categories.value.length) }])
})

const scatterXMin = computed(() => Math.min(...rawScatter.value.map(item => item.rawX), 0))
const scatterXMax = computed(() => Math.max(...rawScatter.value.map(item => item.rawX), 1))
const xScale = (value: number) => plot.value.left + (value - scatterXMin.value) / Math.max(1e-9, scatterXMax.value - scatterXMin.value) * plotWidth.value
const scatterPoints = computed(() => rawScatter.value.map(item => ({ ...item, x: xScale(item.rawX), y: yScale(item.rawY), color: colorFor(item.series) })))
const labeledScatterPoints = computed(() => showDataLabels.value && scatterPoints.value.length <= 24 ? scatterPoints.value : [])
const xTicks = computed(() => Array.from({ length: 6 }, (_, index) => {
  const value = scatterXMin.value + (scatterXMax.value - scatterXMin.value) * index / 5
  return { value, x: xScale(value) }
}))

const pieTotal = computed(() => aggregated.value.reduce((sum, item) => sum + Math.max(0, item.value), 0))
const pieSlices = computed(() => {
  let angle = -Math.PI / 2
  return aggregated.value.flatMap((item, index) => {
    const value = Math.max(0, item.value)
    if (!value || !pieTotal.value) return []
    const ratio = value / pieTotal.value
    const next = angle + ratio * Math.PI * 2
    const middle = angle + ratio * Math.PI
    const large = ratio > .5 ? 1 : 0
    const x1 = Math.cos(angle) * 170; const y1 = Math.sin(angle) * 170
    const x2 = Math.cos(next) * 170; const y2 = Math.sin(next) * 170
    const path = ratio >= .999999 ? 'M 0 -170 A 170 170 0 1 1 -0.01 -170 Z' : `M 0 0 L ${x1} ${y1} A 170 170 0 ${large} 1 ${x2} ${y2} Z`
    angle = next
    return [{ ...item, label: item.series === '数据' ? item.category : `${item.category} · ${item.series}`, ratio, path, color: props.config.seriesColors?.[item.series] || palette.value[index % palette.value.length], labelX: Math.cos(middle) * 116, labelY: Math.sin(middle) * 116 }]
  })
})
const labeledPieSlices = computed(() => showDataLabels.value && pieSlices.value.length <= 14 ? pieSlices.value : [])
const pieCenter = computed(() => {
  switch (legendPosition.value) {
    case 'left': return { x: 600, y: 260 }
    case 'right': return { x: 300, y: 260 }
    case 'top_right': return { x: 330, y: 285 }
    case 'top': return { x: 450, y: 310 }
    case 'bottom': return { x: 450, y: 205 }
    default: return { x: 450, y: 260 }
  }
})
const pieLegendItems = computed(() => pieSlices.value.slice(0, 14).map((slice, index) => {
  switch (legendPosition.value) {
    case 'left': return { slice, x: 18, y: 64 + index * 27 }
    case 'right': return { slice, x: 620, y: 64 + index * 27 }
    case 'top_right': return { slice, x: 670, y: 18 + index * 27 }
    case 'bottom': return { slice, x: 24 + (index % 4) * 218, y: 420 + Math.floor(index / 4) * 24 }
    default: return { slice, x: 24 + (index % 4) * 218, y: 20 + Math.floor(index / 4) * 24 }
  }
}))

const hasRenderableData = computed(() => props.config.chartType === 'scatter' ? rawScatter.value.length > 0 : props.config.chartType === 'pie' ? pieSlices.value.length > 0 : aggregated.value.length > 0)
const truncated = computed(() => props.config.chartType === 'scatter' ? rawScatter.value.length < props.rowIndices.length && props.rowIndices.length > renderLimit.value : aggregated.value.length >= renderLimit.value)
const dataSummary = computed(() => `${props.rowIndices.length.toLocaleString()} 行 · ${props.config.chartType === 'scatter' ? rawScatter.value.length.toLocaleString() : aggregated.value.length.toLocaleString()} 个图形项`)
const chartTypeLabel = computed(() => chartTypes.find(item => item.value === props.config.chartType)?.label || '图表')
</script>

<style scoped>
.chart-editor { min-height: 0; flex: 1; display: grid; grid-template-columns: 238px minmax(0, 1fr); background: color-mix(in srgb, var(--theme-bg) 96%, #d9e5f0); }
.chart-editor.readonly { width: 100%; height: 100%; display: block; background: transparent; }
.chart-editor.readonly .chart-preview { width: 100%; height: 100%; box-sizing: border-box; padding: 8px; }
.chart-editor.readonly .chart-preview svg { min-width: 0; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
.chart-settings { min-height: 0; display: flex; flex-direction: column; padding: 16px; overflow: auto; border-right: 1px solid rgba(0,0,0,.09); background: var(--theme-card); }
.chart-settings header { display: flex; flex-direction: column; margin-bottom: 17px; }.chart-settings header strong { font-size: 13px; }.chart-settings header small,.chart-settings footer { color: var(--theme-text-secondary); font-size: 8px; }
.chart-settings section { margin-bottom: 20px; }.chart-settings section > b { display: block; margin-bottom: 8px; color: var(--theme-text-secondary); font-size: 8px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.chart-types { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.chart-types button { height: 36px; display: flex; align-items: center; gap: 7px; padding: 0 9px; border: 1px solid rgba(0,0,0,.09); border-radius: 7px; color: var(--theme-text-secondary); background: rgba(0,0,0,.025); cursor: pointer; font-size: 9px; }.chart-types button span { font-size: 15px; }.chart-types button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.45); background: rgba(var(--theme-primary-rgb),.08); }
.field-settings { display: flex; flex-direction: column; gap: 10px; }.field-settings > b { margin-bottom: -2px !important; }.field-settings label { display: flex; flex-direction: column; gap: 4px; color: var(--theme-text-secondary); font-size: 8px; }.field-settings select { width: 100%; height: 30px; padding: 0 7px; border: 1px solid rgba(0,0,0,.1); border-radius: 6px; outline: 0; color: var(--theme-text); background: var(--theme-card); font-size: 9px; }.field-settings select:focus { border-color: var(--theme-primary); }
.field-settings .legend-toggle { flex-direction: row; align-items: center; gap: 6px; }.legend-toggle input { accent-color: var(--theme-primary); }
.chart-settings footer { display: flex; flex-direction: column; gap: 4px; margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(0,0,0,.07); }.chart-settings footer small { color: #c17627; }
.chart-preview { min-width: 0; min-height: 0; display: grid; place-items: center; padding: 20px; overflow: auto; }.chart-preview svg { width: min(100%, 1100px); min-width: 620px; max-height: 100%; padding: 8px; box-sizing: border-box; border: 1px solid rgba(0,0,0,.07); border-radius: 12px; background: var(--theme-card); box-shadow: 0 7px 28px rgba(34,58,82,.08); }
.chart-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: 10px; }.chart-empty strong { color: var(--theme-text); font-size: 13px; }
.grid-lines line { stroke: rgba(0,0,0,.07); }.grid-lines text,.x-labels text,.legend text,.pie-caption { fill: var(--theme-text-secondary); font-size: 10px; }.axis { stroke: rgba(0,0,0,.24); stroke-width: 1; }.axis-title { fill: var(--theme-text); font-size: 11px; font-weight: 600; }.legend text { fill: var(--theme-text); }.pie-total { fill: var(--theme-text); font-size: 20px; font-weight: 700; }.pie-caption { font-size: 9px; }
.data-label { fill: var(--theme-text); font-size: 9px; font-weight: 600; paint-order: stroke; stroke: var(--theme-card); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
@media (max-width: 860px) { .chart-editor { grid-template-columns: 190px minmax(0,1fr); }.chart-settings { padding: 11px; }.chart-preview { padding: 10px; } }
</style>
