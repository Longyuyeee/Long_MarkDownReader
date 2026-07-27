<template>
  <img
    v-if="object.kind === 'picture' && mediaSrc"
    :src="mediaSrc"
    :alt="object.altText || object.name"
    :style="imageStyle"
  >
  <ImageIcon v-else-if="object.kind === 'picture'" :size="compact ? 10 : 26" />
  <span
    v-else-if="object.kind === 'connector'"
    class="connector-stroke"
    :class="connectorClasses"
    :style="connectorStyle"
  />
  <table v-else-if="object.graphicType === 'table' && object.table" class="slide-table">
    <colgroup v-if="object.table.columnWidths.length">
      <col
        v-for="(width, index) in object.table.columnWidths"
        :key="index"
        :style="{ width: `${width / totalColumnWidth * 100}%` }"
      >
    </colgroup>
    <tbody>
      <tr v-for="(row, rowIndex) in object.table.rows" :key="rowIndex">
        <td
          v-for="(cell, cellIndex) in visibleCells(row.cells)"
          :key="cellIndex"
          :colspan="cell.gridSpan || undefined"
          :rowspan="cell.rowSpan || undefined"
        >
          {{ cell.text }}
        </td>
      </tr>
    </tbody>
  </table>
  <span v-else-if="object.kind === 'graphic'" class="graphic-card">
    <component :is="graphicIcon" :size="compact ? 10 : 22" />
    <small v-if="!compact">{{ graphicLabel }}</small>
  </span>
  <ShapesIcon
    v-else-if="object.kind === 'custom' && !object.text"
    :size="compact ? 10 : 22"
  />
  <span v-else-if="object.kind === 'group' && !object.childCount">组合对象</span>
  <p v-else-if="object.text">{{ object.text }}</p>
</template>

<script setup lang="ts">
import {
  BarChart3 as BarChartIcon,
  Film as FilmIcon,
  Image as ImageIcon,
  Music2 as MusicIcon,
  PackageOpen as PackageIcon,
  Shapes as ShapesIcon,
  Table2 as TableIcon,
  Workflow as WorkflowIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'

interface TableCell {
  text: string
  gridSpan?: number
  rowSpan?: number
  horizontalMerge: boolean
  verticalMerge: boolean
}

interface PptxObjectContentModel {
  kind: string
  name: string
  text: string
  altText?: string
  width?: number
  height?: number
  flipHorizontal: boolean
  flipVertical: boolean
  lineDash?: string
  lineHead?: string
  lineTail?: string
  graphicType?: string
  childCount: number
  imageOpacity?: number
  cropLeft?: number
  cropTop?: number
  cropRight?: number
  cropBottom?: number
  table?: {
    columnWidths: number[]
    rows: Array<{ cells: TableCell[] }>
  }
}

const props = defineProps<{
  object: PptxObjectContentModel
  mediaSrc?: string
  compact?: boolean
}>()

const imageStyle = computed(() => {
  const style: Record<string, string> = {}
  const object = props.object
  if (object.imageOpacity != null) {
    style.opacity = `${Math.max(0, Math.min(1, object.imageOpacity / 100000))}`
  }
  const left = Math.max(0, object.cropLeft || 0)
  const top = Math.max(0, object.cropTop || 0)
  const right = Math.max(0, object.cropRight || 0)
  const bottom = Math.max(0, object.cropBottom || 0)
  const visibleWidth = 100000 - left - right
  const visibleHeight = 100000 - top - bottom
  if (visibleWidth > 0 && visibleHeight > 0 && (left || top || right || bottom)) {
    style.position = 'absolute'
    style.left = `${-left / visibleWidth * 100}%`
    style.top = `${-top / visibleHeight * 100}%`
    style.width = `${100000 / visibleWidth * 100}%`
    style.height = `${100000 / visibleHeight * 100}%`
    style.objectFit = 'fill'
  }
  return style
})

const connectorStyle = computed<Record<string, string>>(() => {
  const width = Math.max(0, Math.abs(props.object.width || 0))
  const height = Math.max(0, Math.abs(props.object.height || 0))
  const style: Record<string, string> = {}
  if (!width && !height) return style
  if (!width) {
    style.left = '50%'
    style.top = props.object.flipVertical ? '100%' : '0'
    style.width = '0'
    style.height = '100%'
    style.borderTopWidth = '0'
    style.borderLeftWidth = 'var(--connector-width, 1px)'
    style.borderLeftColor = 'var(--connector-color, #64748b)'
    style.borderLeftStyle = dashStyle.value
    style.transform = props.object.flipVertical ? 'rotate(180deg)' : 'none'
    return style
  }
  const horizontal = Math.max(width, 1)
  const angle = Math.atan2(
    props.object.flipVertical ? -height : height,
    props.object.flipHorizontal ? -width : width,
  ) * 180 / Math.PI
  style.left = props.object.flipHorizontal ? '100%' : '0'
  style.top = props.object.flipVertical ? '100%' : '0'
  style.width = `${Math.hypot(width, height) / horizontal * 100}%`
  style.transform = `rotate(${angle}deg)`
  style.borderTopStyle = dashStyle.value
  return style
})

const dashStyle = computed(() => props.object.lineDash?.includes('dash')
  ? 'dashed'
  : props.object.lineDash?.includes('dot') ? 'dotted' : 'solid')

const markerClass = (position: 'head' | 'tail', value?: string) => {
  if (!value || value === 'none') return ''
  if (value === 'oval') return `${position}-oval`
  return `${position}-arrow`
}
const connectorClasses = computed(() => [
  markerClass('head', props.object.lineHead),
  markerClass('tail', props.object.lineTail),
])

const graphicIcon = computed(() => {
  switch (props.object.graphicType) {
    case 'chart': return BarChartIcon
    case 'smartArt': return WorkflowIcon
    case 'video':
    case 'media': return FilmIcon
    case 'audio': return MusicIcon
    case 'table': return TableIcon
    default: return PackageIcon
  }
})
const graphicLabel = computed(() => ({
  chart: '图表',
  smartArt: 'SmartArt',
  video: '视频',
  audio: '音频',
  media: '媒体',
  embedded: '嵌入对象',
  unknown: '复杂对象',
}[props.object.graphicType || 'unknown']))

const totalColumnWidth = computed(() => Math.max(
  1,
  props.object.table?.columnWidths.reduce((sum, width) => sum + Math.max(0, width), 0) || 1,
))
const visibleCells = (cells: TableCell[]) => cells.filter(cell => !cell.horizontalMerge && !cell.verticalMerge)
</script>

<style scoped>
img { width: 100%; height: 100%; display: block; object-fit: contain; }
p { width: 100%; margin: 0; padding: 2%; box-sizing: border-box; font: inherit; color: inherit; text-align: inherit; line-height: 1.25; }
.connector-stroke { position: absolute; height: 0; border-top-width: var(--connector-width, 1px); border-top-color: var(--connector-color, #64748b); transform-origin: left center; overflow: visible; }
.connector-stroke::before, .connector-stroke::after { content: ''; position: absolute; top: 0; transform: translateY(-50%); }
.connector-stroke::before { left: 0; }
.connector-stroke::after { right: 0; }
.connector-stroke.head-arrow::before, .connector-stroke.tail-arrow::after { width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
.connector-stroke.head-arrow::before { border-right: 7px solid var(--connector-color, #64748b); }
.connector-stroke.tail-arrow::after { border-left: 7px solid var(--connector-color, #64748b); }
.connector-stroke.head-oval::before, .connector-stroke.tail-oval::after { width: 6px; height: 6px; border-radius: 50%; background: var(--connector-color, #64748b); }
.slide-table { width: 100%; height: 100%; table-layout: fixed; border-collapse: collapse; background: rgba(255, 255, 255, .72); font: inherit; }
.slide-table td { overflow: hidden; padding: 2%; border: max(1px, var(--connector-width, 1px)) solid var(--connector-color, #94a3b8); color: inherit; text-align: inherit; vertical-align: middle; }
.graphic-card { width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 1px dashed currentColor; background: color-mix(in srgb, currentColor 7%, transparent); }
.graphic-card small { overflow: hidden; max-width: 92%; font-size: max(8px, .42em); text-overflow: ellipsis; white-space: nowrap; }
</style>
