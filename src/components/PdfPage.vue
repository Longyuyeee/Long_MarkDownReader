<template>
  <div ref="hostRef" class="pdf-page-host" :class="{ thumbnail }" :style="hostStyle" :data-pdf-page="pageNumber">
    <canvas ref="canvasRef" :aria-label="`PDF 第 ${pageNumber} 页`"></canvas>
    <div v-if="!thumbnail" class="pdf-annotation-layer">
      <template v-for="annotation in annotations" :key="annotation.id">
        <button
          v-for="(rect, index) in annotation.rects"
          :key="`${annotation.id}-${index}`"
          :class="['pdf-annotation-rect', `color-${annotation.color}`, `kind-${annotation.kind}`, { active: activeAnnotationId === annotation.id }]"
          :style="annotationRectStyle(rect)"
          :data-annotation-id="annotation.id"
          :title="annotation.comment || annotation.quote || 'PDF 批注'"
          @click="emit('selectAnnotation', annotation.id)"
        ></button>
        <button
          v-if="annotation.comment || annotation.kind === 'comment'"
          class="annotation-comment-marker"
          :class="[`color-${annotation.color}`, { active: activeAnnotationId === annotation.id }]"
          :style="annotationMarkerStyle(annotation, annotations.indexOf(annotation))"
          :data-annotation-id="annotation.id"
          :title="annotation.comment || '页评论'"
          @click="emit('selectAnnotation', annotation.id)"
        >◆</button>
      </template>
    </div>
    <div v-if="!thumbnail" ref="textLayerRef" class="textLayer" :style="{ '--total-scale-factor': scale }"></div>
    <div
      v-if="!thumbnail && areaMode"
      class="area-capture"
      @pointerdown="startArea"
      @pointermove="moveArea"
      @pointerup="finishArea"
      @pointercancel="cancelArea"
    ><div v-if="areaDraft" class="area-draft" :style="annotationRectStyle(areaDraft)"></div></div>
    <span v-if="!rendered" class="page-placeholder">{{ pageNumber }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import { buildPdfPageText, type PdfSearchMatch } from '../utils/pdfText'
import type { PdfAnnotation, PdfAnnotationRect } from '../types/pdfAnnotations'

const props = defineProps<{
  document: PDFDocumentProxy
  pageNumber: number
  scale: number
  placeholderWidth: number
  placeholderHeight: number
  thumbnail?: boolean
  textContent?: TextContent
  matches?: PdfSearchMatch[]
  activeMatchId?: string
  annotations?: PdfAnnotation[]
  activeAnnotationId?: string
  areaMode?: boolean
  rotation?: number
}>()
const emit = defineEmits<{
  needText: [page: number]
  rendered: [page: number]
  areaCreate: [page: number, rect: PdfAnnotationRect]
  selectAnnotation: [id: string]
}>()

const hostRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const textLayerRef = ref<HTMLElement | null>(null)
const rendered = ref(false)
const actualWidth = ref(0)
const actualHeight = ref(0)
const areaDraft = ref<PdfAnnotationRect | null>(null)
let areaPointerId = -1
let areaStart = { x: 0, y: 0 }
let observer: IntersectionObserver | null = null
let renderTask: RenderTask | null = null
let textLayer: TextLayer | null = null
let lastViewport: PageViewport | null = null
let renderGeneration = 0

const annotations = computed(() => props.annotations || [])
const normalizedRotation = computed(() => ((props.rotation || 0) % 360 + 360) % 360)
const placeholderSize = computed(() => normalizedRotation.value % 180 === 0
  ? { width: props.placeholderWidth, height: props.placeholderHeight }
  : { width: props.placeholderHeight, height: props.placeholderWidth })
const hostStyle = computed(() => ({
  width: `${actualWidth.value || placeholderSize.value.width * props.scale}px`,
  height: `${actualHeight.value || placeholderSize.value.height * props.scale}px`,
}))

const annotationRectStyle = (rect: PdfAnnotationRect) => ({
  left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
})
const annotationMarkerStyle = (annotation: PdfAnnotation, index: number) => {
  const rect = annotation.rects[0]
  return rect
    ? { left: `${Math.min(0.97, rect.x + rect.width) * 100}%`, top: `${Math.max(0, rect.y - 0.015) * 100}%` }
    : { right: '10px', top: `${12 + index * 22}px` }
}

const areaPoint = (event: PointerEvent) => {
  const rect = hostRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
}
const startArea = (event: PointerEvent) => {
  if (event.button !== 0) return
  areaPointerId = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  areaStart = areaPoint(event)
  areaDraft.value = { ...areaStart, width: 0.0001, height: 0.0001 }
}
const moveArea = (event: PointerEvent) => {
  if (event.pointerId !== areaPointerId) return
  const point = areaPoint(event)
  areaDraft.value = { x: Math.min(areaStart.x, point.x), y: Math.min(areaStart.y, point.y), width: Math.abs(point.x - areaStart.x), height: Math.abs(point.y - areaStart.y) }
}
const finishArea = (event: PointerEvent) => {
  if (event.pointerId !== areaPointerId || !areaDraft.value) return
  const rect = areaDraft.value
  if (rect.width >= 0.01 && rect.height >= 0.01) emit('areaCreate', props.pageNumber, rect)
  cancelArea()
}
const cancelArea = () => { areaPointerId = -1; areaDraft.value = null }

const renderPage = async () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const generation = ++renderGeneration
  renderTask?.cancel()
  try {
    const page = await props.document.getPage(props.pageNumber)
    if (generation !== renderGeneration) return
    const viewport = page.getViewport({ scale: props.scale, rotation: (page.rotate + normalizedRotation.value) % 360 })
    lastViewport = viewport
    const dpr = Math.min(window.devicePixelRatio || 1, props.thumbnail ? 1.25 : 2)
    actualWidth.value = viewport.width
    actualHeight.value = viewport.height
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    renderTask = page.render({ canvas, canvasContext: context, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] })
    await renderTask.promise
    if (generation === renderGeneration) {
      rendered.value = true
      emit('rendered', props.pageNumber)
      if (!props.thumbnail) {
        emit('needText', props.pageNumber)
        await nextTick()
        renderTextLayer()
      }
    }
  } catch (error) {
    if ((error as { name?: string })?.name !== 'RenderingCancelledException') console.error('PDF page render failed', error)
  }
}

const applySearchHighlights = () => {
  if (!textLayer || !props.textContent) return
  const { segments } = buildPdfPageText(props.textContent)
  textLayer.textDivs.forEach((div, index) => {
    const segment = segments[index]
    if (!segment) return
    const relevant = (props.matches || []).filter(match => match.start < segment.end && match.end > segment.start)
    if (!relevant.length) {
      div.textContent = segment.text
      return
    }
    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (const match of relevant) {
      const start = Math.max(0, match.start - segment.start)
      const end = Math.min(segment.text.length, match.end - segment.start)
      if (start > cursor) fragment.append(document.createTextNode(segment.text.slice(cursor, start)))
      if (end > start) {
        const mark = document.createElement('mark')
        mark.className = match.id === props.activeMatchId ? 'pdf-search-hit active' : 'pdf-search-hit'
        mark.dataset.matchId = match.id
        mark.textContent = segment.text.slice(start, end)
        fragment.append(mark)
      }
      cursor = Math.max(cursor, end)
    }
    if (cursor < segment.text.length) fragment.append(document.createTextNode(segment.text.slice(cursor)))
    div.replaceChildren(fragment)
  })
}

const renderTextLayer = async () => {
  if (props.thumbnail || !props.textContent || !textLayerRef.value || !lastViewport || !rendered.value) return
  textLayer?.cancel()
  textLayerRef.value.replaceChildren()
  const generation = renderGeneration
  textLayer = new TextLayer({ textContentSource: props.textContent, container: textLayerRef.value, viewport: lastViewport })
  try {
    await textLayer.render()
    if (generation === renderGeneration) applySearchHighlights()
  } catch (error) {
    if ((error as { name?: string })?.name !== 'AbortException') console.error('PDF text layer render failed', error)
  }
}

const invalidate = () => {
  renderGeneration++
  renderTask?.cancel()
  renderTask = null
  textLayer?.cancel()
  textLayer = null
  textLayerRef.value?.replaceChildren()
  rendered.value = false
  actualWidth.value = 0
  actualHeight.value = 0
  if (hostRef.value && observer) {
    observer.unobserve(hostRef.value)
    observer.observe(hostRef.value)
  }
}

const releasePage = () => {
  if (!rendered.value) return
  renderGeneration++
  renderTask?.cancel()
  textLayer?.cancel()
  textLayer = null
  textLayerRef.value?.replaceChildren()
  renderTask = null
  rendered.value = false
  if (canvasRef.value) {
    canvasRef.value.width = 1
    canvasRef.value.height = 1
  }
}

watch(() => props.scale, invalidate)
watch(() => props.rotation, invalidate)
watch(() => props.document, invalidate)
watch(() => props.textContent, () => { if (rendered.value) renderTextLayer() })
watch([() => props.matches, () => props.activeMatchId], applySearchHighlights, { deep: true })

onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      if (!rendered.value) renderPage()
    } else {
      releasePage()
    }
  }, { rootMargin: props.thumbnail ? '200px 0px' : '900px 0px' })
  if (hostRef.value) observer.observe(hostRef.value)
})

onBeforeUnmount(() => {
  renderGeneration++
  renderTask?.cancel()
  textLayer?.cancel()
  observer?.disconnect()
})
</script>

<style scoped>
.pdf-page-host { position: relative; flex: none; overflow: hidden; background: #fff; box-shadow: 0 3px 18px rgba(15, 23, 42, 0.16); }
.pdf-page-host canvas { display: block; }
.page-placeholder { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; color: #9aa3af; background: linear-gradient(145deg, #fff, #f2f4f7); font-size: 12px; }
.thumbnail { box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18); }
.textLayer { --min-font-size: 1; --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size)); --min-font-size-inv: calc(1 / var(--min-font-size)); position: absolute; inset: 0; z-index: 2; overflow: clip; line-height: 1; text-align: initial; transform-origin: 0 0; -webkit-text-size-adjust: none; text-size-adjust: none; forced-color-adjust: none; }
.textLayer :deep(span), .textLayer :deep(br) { position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0 0; }
.textLayer :deep(> :not(.markedContent)), .textLayer :deep(.markedContent span:not(.markedContent)) { z-index: 1; --font-height: 0; --scale-x: 1; --rotate: 0deg; font-size: calc(var(--text-scale-factor) * var(--font-height)); transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv)); }
.textLayer :deep(.markedContent) { display: contents; }
.textLayer :deep(.endOfContent) { position: absolute; inset: 100% 0 0; display: block; user-select: none; }
.textLayer :deep(::selection) { background: rgba(0, 122, 255, .3); }
.textLayer :deep(.pdf-search-hit) { margin: -1px; padding: 1px; border-radius: 3px; color: transparent; background: rgba(255, 196, 0, .42); }
.textLayer :deep(.pdf-search-hit.active) { background: rgba(255, 116, 35, .66); outline: 1px solid rgba(190, 68, 0, .55); }
.pdf-annotation-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.pdf-annotation-rect { position: absolute; padding: 0; border: 1px solid transparent; border-radius: 2px; pointer-events: none; mix-blend-mode: multiply; }
.pdf-annotation-rect.color-yellow { background: rgba(255, 220, 55, .38); }.pdf-annotation-rect.color-green { background: rgba(61, 201, 126, .3); }.pdf-annotation-rect.color-pink { background: rgba(248, 105, 170, .3); }.pdf-annotation-rect.color-blue { background: rgba(64, 151, 255, .28); }
.pdf-annotation-rect.kind-area { border-width: 2px; border-color: currentColor; background: transparent; mix-blend-mode: normal; }.pdf-annotation-rect.kind-area.color-yellow { color: #c89200; }.pdf-annotation-rect.kind-area.color-green { color: #149653; }.pdf-annotation-rect.kind-area.color-pink { color: #d83a83; }.pdf-annotation-rect.kind-area.color-blue { color: #1674d1; }
.pdf-annotation-rect.active { outline: 2px solid #ff6b21; outline-offset: 2px; }
.annotation-comment-marker { position: absolute; z-index: 4; width: 18px; height: 18px; display: grid; place-items: center; padding: 0; border: 2px solid #fff; border-radius: 50%; pointer-events: auto; cursor: pointer; color: #fff; background: #d59a00; box-shadow: 0 2px 6px rgba(0,0,0,.24); font-size: var(--text-compact); transform: translate(-50%,-50%); }.annotation-comment-marker.color-green { background: #159653; }.annotation-comment-marker.color-pink { background: #d83a83; }.annotation-comment-marker.color-blue { background: #1674d1; }.annotation-comment-marker.active { outline: 2px solid #ff6b21; }
.area-capture { position: absolute; inset: 0; z-index: 5; cursor: crosshair; touch-action: none; background: rgba(0,122,255,.025); }
.area-draft { position: absolute; box-sizing: border-box; border: 2px dashed #007aff; background: rgba(0,122,255,.1); }
</style>
