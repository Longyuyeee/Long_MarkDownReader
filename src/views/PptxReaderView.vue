<template>
  <div class="pptx-workspace">
    <header class="pptx-toolbar">
      <div class="document-identity">
        <PresentationIcon :size="18" />
        <div>
          <strong :title="pptxPath">{{ fileName }}</strong>
          <span>结构化只读 · 原文件不写回</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <label class="pptx-search">
          <SearchIcon :size="14" />
          <input
            v-model="searchQuery"
            aria-label="搜索 PPTX 文本与备注"
            placeholder="搜索演示文稿"
            @keydown.enter.prevent="moveSearch(1)"
          >
          <span v-if="matches.length">{{ activeMatch + 1 }}/{{ matches.length }}</span>
        </label>
        <button type="button" :disabled="!matches.length" title="上一个结果" @click="moveSearch(-1)">
          <ChevronUpIcon :size="16" />
        </button>
        <button type="button" :disabled="!matches.length" title="下一个结果" @click="moveSearch(1)">
          <ChevronDownIcon :size="16" />
        </button>
        <button type="button" :disabled="!report" title="放映" @click="presenting = true">
          <PlayIcon :size="16" />
          <span>放映</span>
        </button>
        <button
          type="button"
          :disabled="!report || baselineLoading"
          :class="{ active: Boolean(editBaseline) }"
          title="验证隔离编辑基线"
          @click="prepareEditBaseline"
        >
          <LockKeyholeIcon :size="16" :class="{ spin: baselineLoading }" />
          <span>{{ baselineLoading ? '验证中' : '编辑准备' }}</span>
        </button>
        <button type="button" :class="{ active: showDetails }" title="备注与兼容画像" @click="showDetails = !showDetails">
          <PanelRightIcon :size="16" />
        </button>
        <button type="button" :disabled="loading" title="重新读取" @click="loadPresentation">
          <RefreshCwIcon :size="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="pptx-state">
      <LoaderCircleIcon :size="24" class="spin" />
      <span>正在安全解析演示文稿…</span>
    </div>
    <div v-else-if="loadError" class="pptx-state error" role="alert">
      <AlertTriangleIcon :size="24" />
      <div>
        <strong>无法读取 PPTX</strong>
        <p>{{ loadError }}</p>
      </div>
    </div>
    <div v-else-if="report" class="pptx-layout" :class="{ 'details-open': showDetails }">
      <aside ref="slideStripRef" class="slide-strip" aria-label="幻灯片缩略图">
        <button
          v-for="(slide, index) in report.model.slides"
          :key="slide.id"
          type="button"
          :data-slide-id="slide.id"
          :data-slide-index="index"
          :class="{ active: index === activeSlideIndex, hit: matchedSlideIndexes.has(index), 'route-target': index === routeTargetSlideIndex }"
          @click="selectSlide(index)"
        >
          <span class="slide-number">{{ index + 1 }}</span>
          <div class="thumbnail" :style="{ aspectRatio: slideRatio, backgroundColor: slide.backgroundColor }">
            <div
              v-for="object in slide.objects"
              :key="`thumb-${object.id || object.name}`"
              class="slide-object"
              :class="[object.kind, { 'expanded-group': object.kind === 'group' && object.childCount > 0 }]"
              :style="objectStyle(object)"
            >
              <PptxObjectContent
                :object="object"
                :media-src="mediaByPart[object.mediaPart || '']"
                compact
              />
            </div>
            <small v-if="!slide.objects.length">{{ slide.title }}</small>
          </div>
          <EyeOffIcon v-if="slide.hidden" :size="12" class="hidden-mark" />
        </button>
      </aside>

      <main class="pptx-stage">
        <div
          v-if="activeSlide"
          class="slide-canvas"
          :class="{ 'route-target-slide': activeSlideIndex === routeTargetSlideIndex }"
          :style="slideStyle(activeSlide)"
          :aria-label="`幻灯片 ${activeSlideIndex + 1}：${activeSlide.title}`"
        >
          <template v-for="object in activeSlide.objects" :key="object.id || object.name">
            <div
              class="slide-object"
              :data-object-id="object.id"
              :class="[object.kind, { 'search-hit': matchedObjectIds.has(object.id), 'route-target-object': routeTargetObjectId === object.id, 'expanded-group': object.kind === 'group' && object.childCount > 0 }]"
              :style="objectStyle(object)"
              :title="object.altText || object.name"
            >
              <PptxObjectContent
                :object="object"
                :media-src="mediaByPart[object.mediaPart || '']"
              />
            </div>
          </template>
          <div v-if="!activeSlide.objects.length" class="empty-slide">空白幻灯片</div>
        </div>
      </main>

      <aside v-if="showDetails" class="pptx-details">
        <section class="edit-baseline">
          <header>
            <LockKeyholeIcon :size="15" />
            <strong>编辑安全基线</strong>
            <span v-if="editBaseline" class="verified-badge">已验证</span>
          </header>
          <template v-if="editBaseline">
            <dl>
              <div><dt>隔离方式</dt><dd>内存 + 临时副本</dd></div>
              <div><dt>OOXML 部件</dt><dd>{{ editBaseline.partCount }}</dd></div>
              <div><dt>候选编辑部件</dt><dd>{{ editBaseline.editableCandidateParts.length }}</dd></div>
              <div><dt>原样保全部件</dt><dd>{{ editBaseline.unchangedPartCount }}</dd></div>
              <div><dt>临时副本复读</dt><dd>{{ editBaseline.temporaryCopyReopenVerified ? '通过' : '未通过' }}</dd></div>
              <div><dt>源文件写入</dt><dd>{{ editBaseline.writesUserFile ? '是' : '否' }}</dd></div>
            </dl>
            <p class="baseline-digest" :title="editBaseline.sourcePackageDigest">
              SHA-256 · {{ editBaseline.sourcePackageDigest.slice(0, 16) }}…
            </p>
            <p class="muted">C4A 仅建立保护基线；文本和备注修改将在 C4B 隔离补丁中开放。</p>
          </template>
          <p v-else-if="baselineError" class="baseline-error">{{ baselineError }}</p>
          <p v-else class="muted">尚未启动编辑。验证后仍保持只读，不会写入当前 PPTX。</p>
        </section>
        <section>
          <header>
            <MessageSquareTextIcon :size="15" />
            <strong>演讲者备注</strong>
          </header>
          <p v-if="activeSlide?.notes" class="notes">{{ activeSlide.notes }}</p>
          <p v-else class="muted">无备注</p>
        </section>
        <section>
          <header>
            <ShieldCheckIcon :size="15" />
            <strong>兼容画像</strong>
          </header>
          <dl>
            <div><dt>生产者</dt><dd>{{ profile.producer || '未知' }}</dd></div>
            <div><dt>幻灯片</dt><dd>{{ profile.slideCount }}</dd></div>
            <div><dt>文本对象</dt><dd>{{ profile.textObjectCount }}</dd></div>
            <div><dt>图片 / 形状</dt><dd>{{ profile.imageCount }} / {{ profile.shapeCount }}</dd></div>
            <div><dt>备注</dt><dd>{{ profile.notesCount }}</dd></div>
            <div><dt>母版 / 主题</dt><dd>{{ profile.masterCount }} / {{ profile.themeCount }}</dd></div>
            <div><dt>图表 / SmartArt</dt><dd>{{ profile.chartCount }} / {{ profile.smartArtCount }}</dd></div>
            <div><dt>动画页</dt><dd>{{ profile.animationCount }}</dd></div>
          </dl>
        </section>
        <section v-if="allWarnings.length">
          <header>
            <AlertTriangleIcon :size="15" />
            <strong>只读边界</strong>
          </header>
          <ul>
            <li v-for="warning in allWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>
      </aside>
    </div>

    <footer v-if="report" class="pptx-status">
      <span>{{ report.model.slides.length }} 张幻灯片 · {{ formatBytes(report.size) }}</span>
      <span v-if="routeTargetLabel" class="route-target-status" aria-live="polite">已定位：{{ routeTargetLabel }}</span>
      <span v-else-if="editBaseline" class="baseline-status">C4A 编辑隔离基线已验证 · 原文件未修改</span>
      <span>{{ activeSlide?.objects.length || 0 }} 个当前页对象</span>
    </footer>

    <Teleport to="body">
      <div v-if="presenting && activeSlide" class="presenter" role="dialog" aria-modal="true" @keydown.left="previousSlide" @keydown.right="nextSlide">
        <button type="button" title="退出放映" @click="presenting = false">
          <XIcon :size="20" />
        </button>
        <div class="presenter-slide" :style="slideStyle(activeSlide)">
          <div
            v-for="object in activeSlide.objects"
            :key="`present-${object.id || object.name}`"
            class="slide-object"
            :class="[object.kind, { 'expanded-group': object.kind === 'group' && object.childCount > 0 }]"
            :style="objectStyle(object)"
          >
            <PptxObjectContent
              :object="object"
              :media-src="mediaByPart[object.mediaPart || '']"
            />
          </div>
        </div>
        <div class="presenter-controls">
          <button type="button" :disabled="activeSlideIndex === 0" title="上一张" @click="previousSlide">
            <ChevronLeftIcon :size="22" />
          </button>
          <span>{{ activeSlideIndex + 1 }} / {{ slideCount }}</span>
          <button type="button" :disabled="activeSlideIndex === slideCount - 1" title="下一张" @click="nextSlide">
            <ChevronRightIcon :size="22" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  AlertTriangle as AlertTriangleIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ChevronUpIcon,
  EyeOff as EyeOffIcon,
  LoaderCircle as LoaderCircleIcon,
  LockKeyhole as LockKeyholeIcon,
  MessageSquareText as MessageSquareTextIcon,
  PanelRight as PanelRightIcon,
  Play as PlayIcon,
  Presentation as PresentationIcon,
  RefreshCw as RefreshCwIcon,
  Search as SearchIcon,
  ShieldCheck as ShieldCheckIcon,
  X as XIcon,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PptxObjectContent from '../components/pptx/PptxObjectContent.vue'
import { useAppStore } from '../store/app'
import { resolvePptxRouteLocator } from '../utils/pptxLocator'

interface PptxObject {
  id: string
  kind: string
  name: string
  text: string
  altText?: string
  shapeType?: string
  mediaPart?: string
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  fillColor?: string
  lineColor?: string
  lineWidth?: number
  noFill: boolean
  textStyle: {
    fontSizeHundredthPoints?: number
    fontFamily?: string
    color?: string
    bold?: boolean
    italic?: boolean
    underline?: boolean
    alignment?: string
    verticalAnchor?: string
    opacity?: number
  }
  fillOpacity?: number
  lineOpacity?: number
  imageOpacity?: number
  cropLeft?: number
  cropTop?: number
  cropRight?: number
  cropBottom?: number
  parentGroupId?: string
  groupLevel: number
  childCount: number
  textRunCount: number
  mixedTextStyle: boolean
  flipHorizontal: boolean
  flipVertical: boolean
  lineDash?: string
  lineHead?: string
  lineTail?: string
  graphicType?: string
  relatedPart?: string
  table?: {
    columnWidths: number[]
    rows: Array<{
      height?: number
      cells: Array<{
        text: string
        gridSpan?: number
        rowSpan?: number
        horizontalMerge: boolean
        verticalMerge: boolean
      }>
    }>
  }
}
interface PptxSlide {
  id: string
  partName: string
  title: string
  text: string
  notes: string
  hidden: boolean
  hasBackground: boolean
  backgroundColor: string
  backgroundSource: string
  themeName?: string
  objects: PptxObject[]
  warnings: string[]
}
interface PptxProfile {
  producer?: string
  application?: string
  slideCount: number
  textObjectCount: number
  imageCount: number
  shapeCount: number
  groupCount: number
  chartCount: number
  smartArtCount: number
  animationCount: number
  notesCount: number
  embeddedObjectCount: number
  themeCount: number
  masterCount: number
  unknownPresentationParts: string[]
}
interface PptxReadReport {
  path: string
  size: number
  modified: number
  signature: string
  readOnly: boolean
  model: {
    width: number
    height: number
    slides: PptxSlide[]
    plainText: string
    compatibility: PptxProfile
    warnings: string[]
  }
  media: Array<{ partName: string; dataUrl: string }>
  mediaWarnings: string[]
}
interface PptxEditBaselineReport {
  status: string
  sourcePackageDigest: string
  isolatedPackageDigest: string
  partCount: number
  unchangedPartCount: number
  editableCandidateParts: string[]
  changedParts: string[]
  exactPackageCopyVerified: boolean
  unchangedPartsVerified: boolean
  structuralReparseVerified: boolean
  temporaryCopyReopenVerified: boolean
  sourceUnchanged: boolean
  writesUserFile: boolean
  editingEnabled: boolean
}
interface SearchMatch {
  slideIndex: number
  objectId?: string
}

const route = useRoute()
const store = useAppStore()
const report = ref<PptxReadReport>()
const loading = ref(false)
const loadError = ref('')
const activeSlideIndex = ref(0)
const searchQuery = ref('')
const activeMatch = ref(0)
const showDetails = ref(true)
const presenting = ref(false)
const baselineLoading = ref(false)
const baselineError = ref('')
const editBaseline = ref<PptxEditBaselineReport>()
const slideStripRef = ref<HTMLElement>()
const routeTargetSlideIndex = ref(-1)
const routeTargetObjectId = ref('')
const routeTargetLabel = ref('')
const pptxPath = computed(() => String(route.query.path || store.activeTabId || ''))
const fileName = computed(() => pptxPath.value.split(/[\\/]/).pop() || '未命名.pptx')
const profile = computed(() => report.value?.model.compatibility as PptxProfile)
const activeSlide = computed(() => report.value?.model.slides[activeSlideIndex.value])
const slideCount = computed(() => report.value?.model.slides.length || 0)
const slideRatio = computed(() => {
  const model = report.value?.model
  return model?.width && model?.height ? `${model.width} / ${model.height}` : '16 / 9'
})
const mediaByPart = computed<Record<string, string>>(() => Object.fromEntries(
  (report.value?.media || []).map(media => [media.partName, media.dataUrl]),
))
const matches = computed<SearchMatch[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query || !report.value) return []
  const results: SearchMatch[] = []
  report.value.model.slides.forEach((slide, slideIndex) => {
    slide.objects.forEach(object => {
      if (`${object.name}\n${object.text}\n${object.altText || ''}`.toLocaleLowerCase().includes(query)) {
        results.push({ slideIndex, objectId: object.id })
      }
    })
    if (`${slide.title}\n${slide.notes}`.toLocaleLowerCase().includes(query) && !results.some(match => match.slideIndex === slideIndex)) {
      results.push({ slideIndex })
    }
  })
  return results
})
const matchedSlideIndexes = computed(() => new Set(matches.value.map(match => match.slideIndex)))
const matchedObjectIds = computed(() => new Set(
  matches.value.filter(match => match.slideIndex === activeSlideIndex.value).map(match => match.objectId),
))
const allWarnings = computed(() => Array.from(new Set([
  ...(report.value?.model.warnings || []),
  ...(activeSlide.value?.warnings || []),
  ...(report.value?.mediaWarnings || []),
])))

const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KiB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MiB`

const slideStyle = (slide: PptxSlide) => ({
  aspectRatio: slideRatio.value,
  backgroundColor: slide.backgroundColor || '#FFFFFF',
})

const colorWithOpacity = (color: string, opacity?: number) => {
  if (opacity == null || opacity >= 100000 || !/^#[\da-f]{6}$/i.test(color)) return color
  const alpha = Math.max(0, Math.min(1, opacity / 100000))
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const objectStyle = (object: PptxObject) => {
  const model = report.value?.model
  const style: Record<string, string> = {}
  if (model && object.x != null && object.y != null && object.width != null && object.height != null) {
    const minimumSize = object.kind === 'connector' ? 0.1 : 2
    style.left = `${Math.max(0, object.x / model.width * 100)}%`
    style.top = `${Math.max(0, object.y / model.height * 100)}%`
    style.width = `${Math.max(minimumSize, object.width / model.width * 100)}%`
    style.height = `${Math.max(minimumSize, object.height / model.height * 100)}%`
  }
  if (object.rotation != null) style.transform = `rotate(${object.rotation / 60000}deg)`
  if (object.noFill) style.backgroundColor = 'transparent'
  else if (object.fillColor) style.backgroundColor = colorWithOpacity(object.fillColor, object.fillOpacity)
  if (object.lineColor) {
    const lineColor = colorWithOpacity(object.lineColor, object.lineOpacity)
    const lineWidth = `${Math.max(1, Math.min(12, (object.lineWidth || 9525) / 9525))}px`
    style['--connector-color'] = lineColor
    style['--connector-width'] = lineWidth
    if (object.kind !== 'connector') {
      style.borderColor = lineColor
      style.borderStyle = 'solid'
      style.borderWidth = lineWidth
    }
  }
  const text = object.textStyle
  if (!object.mixedTextStyle && text?.fontSizeHundredthPoints && model?.height) {
    const relativeHeight = text.fontSizeHundredthPoints / 100 * 12700 / model.height * 100
    style.fontSize = `clamp(8px, ${relativeHeight}cqh, 72px)`
  }
  if (!object.mixedTextStyle && text?.fontFamily) style.fontFamily = `"${text.fontFamily.replace(/"/g, '')}", sans-serif`
  if (!object.mixedTextStyle && text?.color) style.color = colorWithOpacity(text.color, text.opacity)
  if (!object.mixedTextStyle && text?.bold != null) style.fontWeight = text.bold ? '700' : '400'
  if (!object.mixedTextStyle && text?.italic != null) style.fontStyle = text.italic ? 'italic' : 'normal'
  if (!object.mixedTextStyle && text?.underline != null) style.textDecoration = text.underline ? 'underline' : 'none'
  if (text?.alignment) style.textAlign = text.alignment
  if (text?.verticalAnchor) {
    style.alignItems = text.verticalAnchor === 'top'
      ? 'flex-start'
      : text.verticalAnchor === 'bottom' ? 'flex-end' : 'center'
  }
  return style
}

const clearRouteTarget = () => {
  routeTargetSlideIndex.value = -1
  routeTargetObjectId.value = ''
  routeTargetLabel.value = ''
}
const syncRelationFocus = (index: number) => {
  const slide = report.value?.model.slides[index]
  if (!slide || !pptxPath.value) return
  store.setRelationObjectFocus({
    path: pptxPath.value,
    locatorKind: 'pptx-slide',
    locatorObjectId: slide.id,
    locatorPage: index + 1,
  })
}
const selectSlide = (index: number, preserveRouteTarget = false) => {
  if (!preserveRouteTarget) clearRouteTarget()
  activeSlideIndex.value = Math.max(0, Math.min(index, (report.value?.model.slides.length || 1) - 1))
  syncRelationFocus(activeSlideIndex.value)
}
const previousSlide = () => selectSlide(activeSlideIndex.value - 1)
const nextSlide = () => selectSlide(activeSlideIndex.value + 1)
const routeString = (value: unknown) => typeof value === 'string' ? value : ''
let routeLocatorRun = 0
const applyRouteLocator = async () => {
  const run = ++routeLocatorRun
  clearRouteTarget()
  if (!report.value?.model.slides.length) return
  const slides = report.value.model.slides
  const locatorKind = routeString(route.query.locatorKind)
  const locator = routeString(route.query.locator)
  const target = resolvePptxRouteLocator(slides, {
    slide: routeString(route.query.slide),
    locatorKind,
    locator,
  })
  if (!target) return

  await nextTick()
  if (run !== routeLocatorRun) return
  selectSlide(target.slideIndex, true)
  routeTargetSlideIndex.value = target.slideIndex
  routeTargetObjectId.value = target.objectId
  routeTargetLabel.value = routeString(route.query.locationLabel) || `幻灯片 ${target.slideIndex + 1}`
  if (route.query.matchKind === 'notes') showDetails.value = true
  await nextTick()
  if (run !== routeLocatorRun) return
  slideStripRef.value
    ?.querySelector<HTMLElement>(`[data-slide-index="${target.slideIndex}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}
const moveSearch = (direction: -1 | 1) => {
  if (!matches.value.length) return
  activeMatch.value = (activeMatch.value + direction + matches.value.length) % matches.value.length
  selectSlide(matches.value[activeMatch.value].slideIndex)
}
const prepareEditBaseline = async () => {
  if (!report.value || baselineLoading.value) return
  baselineLoading.value = true
  baselineError.value = ''
  try {
    const baseline = await invoke<PptxEditBaselineReport>('audit_pptx_edit_baseline', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
      expectedSignature: report.value.signature,
    })
    if (
      !baseline.exactPackageCopyVerified
      || !baseline.unchangedPartsVerified
      || !baseline.structuralReparseVerified
      || !baseline.temporaryCopyReopenVerified
      || !baseline.sourceUnchanged
      || baseline.writesUserFile
      || baseline.editingEnabled
      || baseline.changedParts.length
    ) {
      throw new Error('PPTX 编辑隔离基线未通过完整保护门禁')
    }
    editBaseline.value = baseline
    showDetails.value = true
  } catch (error) {
    editBaseline.value = undefined
    baselineError.value = String(error)
    showDetails.value = true
  } finally {
    baselineLoading.value = false
  }
}
const loadPresentation = async () => {
  if (!pptxPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  editBaseline.value = undefined
  baselineError.value = ''
  try {
    report.value = await invoke<PptxReadReport>('read_pptx_presentation', {
      libraryRoot: store.libraryPath,
      path: pptxPath.value,
    })
    activeSlideIndex.value = Math.min(activeSlideIndex.value, Math.max(0, report.value.model.slides.length - 1))
    syncRelationFocus(activeSlideIndex.value)
    await applyRouteLocator()
  } catch (error) {
    report.value = undefined
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}
const handleKeydown = (event: KeyboardEvent) => {
  if (!presenting.value) return
  if (event.key === 'Escape') presenting.value = false
  if (event.key === 'ArrowLeft') previousSlide()
  if (event.key === 'ArrowRight' || event.key === ' ') nextSlide()
}

watch(matches, value => {
  activeMatch.value = 0
  if (value.length) selectSlide(value[0].slideIndex)
})
watch(pptxPath, () => loadPresentation())
watch(
  () => [route.query.slide, route.query.locatorKind, route.query.locator, route.query.locatorToken],
  applyRouteLocator,
)
watch(presenting, async value => {
  if (value) {
    await nextTick()
    document.querySelector<HTMLElement>('.presenter')?.focus()
  }
})
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadPresentation()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  store.clearRelationObjectFocus()
})
</script>

<style scoped>
.pptx-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; }
.pptx-toolbar { min-height: 52px; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.document-identity, .toolbar-actions, .pptx-search, .pptx-details header, .pptx-status { display: flex; align-items: center; }
.document-identity { min-width: 0; gap: 9px; }
.document-identity > div { min-width: 0; display: flex; flex-direction: column; }
.document-identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.document-identity span { color: var(--text-muted); font-size: 10px; }
.toolbar-actions { gap: 4px; }
.toolbar-actions > button { min-width: 30px; height: 30px; padding: 0 7px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid transparent; border-radius: 5px; color: var(--text-secondary); background: transparent; cursor: pointer; font: inherit; }
.toolbar-actions > button:hover:not(:disabled), .toolbar-actions > button.active { border-color: var(--border-color); background: var(--hover-bg); color: var(--text-primary); }
.toolbar-actions > button:disabled { opacity: .38; cursor: default; }
.pptx-search { width: 218px; height: 30px; gap: 6px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-secondary); }
.pptx-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; }
.pptx-search span { color: var(--text-muted); font-size: 10px; }
.pptx-state { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
.pptx-state.error { color: var(--error-color); }
.pptx-state p { max-width: 560px; margin: 4px 0 0; color: var(--text-secondary); }
.pptx-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 190px minmax(0, 1fr); }
.pptx-layout.details-open { grid-template-columns: 190px minmax(0, 1fr) 260px; }
.slide-strip { overflow: auto; padding: 10px 8px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.slide-strip > button { position: relative; width: 100%; padding: 6px 6px 6px 24px; display: block; border: 1px solid transparent; border-radius: 5px; color: inherit; background: transparent; cursor: pointer; }
.slide-strip > button:hover { background: var(--hover-bg); }
.slide-strip > button.active { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
.slide-strip > button.route-target { animation: route-target-pulse 1.15s ease-out; }
.slide-strip > button.hit:not(.active)::after { content: ''; position: absolute; right: 7px; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: #d69b18; }
.slide-number { position: absolute; left: 6px; top: 9px; color: var(--text-muted); font-size: 10px; }
.thumbnail { position: relative; box-sizing: border-box; padding: 0; display: block; overflow: hidden; container-type: size; border: 1px solid var(--border-color); background: #fff; color: #20242b; box-shadow: 0 2px 7px rgba(0,0,0,.08); text-align: left; }
.thumbnail strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.thumbnail > small { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; padding: 8px; font-size: 7px; line-height: 1.35; }
.hidden-mark { position: absolute; right: 10px; bottom: 10px; color: var(--text-muted); }
.pptx-stage { min-width: 0; overflow: auto; padding: 28px; display: grid; place-items: center; background: color-mix(in srgb, var(--bg-secondary) 78%, #526073); }
.slide-canvas, .presenter-slide { position: relative; width: min(100%, 1100px); overflow: hidden; container-type: size; background: #fff; color: #1e232b; box-shadow: 0 12px 38px rgba(0,0,0,.22); }
.slide-object { position: absolute; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: clamp(8px, 3.5cqh, 25px); white-space: pre-wrap; transform-origin: center; }
.slide-object p { width: 100%; margin: 0; padding: 2%; box-sizing: border-box; font: inherit; color: inherit; text-align: inherit; line-height: 1.25; }
.slide-object.shape { border: 1px solid #8b97a8; background: #edf2f8; }
.slide-object.custom { border: 1px dashed #8b97a8; color: #526071; background: #edf2f8; }
.slide-object.picture:not(:has(img)), .slide-object.group { border: 1px dashed #8b97a8; color: #697586; background: #f5f7fa; font-size: 11px; }
.slide-object.connector { overflow: visible; }
.slide-object.group.expanded-group { pointer-events: none; border: 0; background: transparent; }
.slide-object.search-hit { outline: 4px solid rgba(230, 168, 24, .75); outline-offset: 2px; }
.slide-canvas.route-target-slide { animation: route-target-canvas 1.15s ease-out; }
.slide-object.route-target-object { z-index: 2; outline: 4px solid var(--primary-color); outline-offset: 3px; animation: route-target-object 1.15s ease-out; }
.slide-object.route-target-object::after { content: ''; position: absolute; pointer-events: none; inset: 0; border: 3px solid var(--primary-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
.empty-slide { position: absolute; inset: 0; display: grid; place-items: center; color: #8a939e; }
.pptx-details { min-width: 0; overflow: auto; padding: 13px; border-left: 1px solid var(--border-color); background: var(--bg-primary); }
.pptx-details section { padding: 0 0 14px; margin: 0 0 14px; border-bottom: 1px solid var(--border-color); }
.pptx-details header { gap: 7px; margin-bottom: 9px; }
.notes { margin: 0; line-height: 1.6; white-space: pre-wrap; }
.muted { color: var(--text-muted); }
.pptx-details dl { margin: 0; }
.pptx-details dl > div { padding: 4px 0; display: flex; justify-content: space-between; gap: 12px; }
.pptx-details dt { color: var(--text-muted); }
.pptx-details dd { margin: 0; text-align: right; }
.pptx-details ul { margin: 0; padding-left: 17px; color: var(--text-secondary); line-height: 1.55; }
.edit-baseline .verified-badge { margin-left: auto; padding: 2px 6px; border-radius: 999px; color: var(--success-color); background: color-mix(in srgb, var(--success-color) 12%, transparent); font-size: 10px; }
.baseline-digest { margin: 9px 0 6px; color: var(--text-secondary); font-family: var(--font-mono); font-size: 10px; word-break: break-all; }
.baseline-error { margin: 0; color: var(--error-color); line-height: 1.5; }
.baseline-status { color: var(--success-color); }
.pptx-status { min-height: 28px; padding: 0 12px; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-muted); font-size: 10px; }
.route-target-status { overflow: hidden; color: var(--primary-color); text-overflow: ellipsis; white-space: nowrap; }
.presenter { position: fixed; z-index: 10000; inset: 0; display: grid; place-items: center; background: #101215; }
.presenter > button { position: absolute; z-index: 2; top: 14px; right: 14px; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 5px; color: #fff; background: rgba(255,255,255,.12); cursor: pointer; }
.presenter-slide { width: min(92vw, calc(86vh * var(--slide-ratio, 1.777))); max-height: 86vh; box-shadow: none; }
.presenter-controls { position: absolute; bottom: 10px; display: flex; align-items: center; gap: 12px; color: #fff; }
.presenter-controls button { width: 34px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 5px; color: inherit; background: rgba(255,255,255,.1); cursor: pointer; }
.presenter-controls button:disabled { opacity: .3; }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes route-target-pulse {
  0% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 55%, transparent); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes route-target-canvas {
  0% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary-color) 60%, transparent), 0 12px 38px rgba(0,0,0,.22); }
  100% { box-shadow: 0 12px 38px rgba(0,0,0,.22); }
}
@keyframes route-target-object {
  0% { filter: drop-shadow(0 0 10px color-mix(in srgb, var(--primary-color) 75%, transparent)); }
  100% { filter: none; }
}
@media (max-width: 1050px) {
  .pptx-layout.details-open { position: relative; grid-template-columns: 170px minmax(0, 1fr); }
  .pptx-layout.details-open .pptx-details {
    position: absolute;
    z-index: 4;
    inset: 0 0 0 auto;
    width: min(280px, calc(100% - 170px));
    box-sizing: border-box;
    display: block;
    box-shadow: -12px 0 28px rgba(0,0,0,.16);
  }
}
@media (max-width: 760px) {
  .pptx-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; }
  .pptx-search { min-width: 0; flex: 1; }
  .toolbar-actions > button span { display: none; }
  .pptx-layout, .pptx-layout.details-open { grid-template-columns: 118px minmax(0, 1fr); }
  .pptx-layout.details-open .pptx-details { width: min(270px, calc(100% - 118px)); }
  .pptx-stage { padding: 14px; }
}
</style>
