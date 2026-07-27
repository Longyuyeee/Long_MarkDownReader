<template>
  <div class="docx-workspace">
    <header class="docx-toolbar">
      <div class="document-identity">
        <FileTextIcon :size="18" />
        <div class="document-title">
          <strong :title="docxPath">{{ fileName }}</strong>
          <span>Word 文档 · 结构化阅读 · 原文件只读</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <label class="docx-search">
          <SearchIcon :size="14" />
          <input
            v-model="query"
            aria-label="搜索 DOCX 正文"
            placeholder="搜索正文"
            @keydown.enter.prevent="moveSearch(1)"
          />
          <span v-if="query">{{ searchPositionLabel }}</span>
        </label>
        <button type="button" :disabled="!matches.length" title="上一个结果" @click="moveSearch(-1)">
          <ChevronUpIcon :size="15" />
        </button>
        <button type="button" :disabled="!matches.length" title="下一个结果" @click="moveSearch(1)">
          <ChevronDownIcon :size="15" />
        </button>
        <button type="button" :disabled="loading" title="重新读取" @click="load">
          <RefreshIcon :size="15" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="docx-state">
      <n-spin size="small" />
      <strong>正在安全解析 DOCX</strong>
    </div>
    <div v-else-if="loadError" class="docx-state error" role="alert">
      <AlertIcon :size="18" />
      <div><strong>无法读取 DOCX</strong><p>{{ loadError }}</p></div>
      <n-button size="small" @click="load">重试</n-button>
    </div>

    <template v-else-if="report">
      <section v-if="allWarnings.length" class="compatibility-warning">
        <ShieldAlertIcon :size="17" />
        <div>
          <strong>高级对象保持只读</strong>
          <span>{{ allWarnings.join(' · ') }}</span>
        </div>
      </section>

      <div class="docx-layout">
        <aside class="docx-outline">
          <div class="outline-heading">
            <strong>文档目录</strong>
            <span>{{ report.model.headings.length }} 项</span>
          </div>
          <nav v-if="report.model.headings.length" aria-label="DOCX 文档目录">
            <button
              v-for="heading in report.model.headings"
              :key="heading.blockId"
              type="button"
              :style="{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }"
              @click="scrollToBlock(heading.blockId)"
            >
              <span>H{{ heading.level }}</span>
              {{ heading.text }}
            </button>
          </nav>
          <p v-else class="outline-empty">文档没有可识别的标题层级。</p>

          <div class="compatibility-card">
            <strong>兼容画像</strong>
            <span>{{ producerLabel }}</span>
            <div class="metric-grid">
              <span><b>{{ profile.paragraphCount }}</b>段落</span>
              <span><b>{{ profile.listItemCount }}</b>列表</span>
              <span><b>{{ profile.tableCount }}</b>表格</span>
              <span><b>{{ profile.imageCount }}</b>图片</span>
              <span><b>{{ profile.mergedCellCount }}</b>合并单元格</span>
              <span><b>{{ profile.pageBreakCount }}</b>分页符</span>
            </div>
            <div v-if="report.model.sections.length" class="docx-layout-summary">
              <strong>页面布局</strong>
              <span v-for="section in report.model.sections" :key="section.id">
                {{ sectionSummary(section) }}
              </span>
            </div>
            <small>{{ packageFeatureLabel }}</small>
          </div>
        </aside>

        <main class="docx-stage" aria-label="DOCX 结构化正文">
          <article class="docx-page">
            <template v-for="block in report.model.blocks" :key="block.id">
              <component
                :is="headingTag(block.level)"
                v-if="block.kind === 'heading'"
                :id="block.id"
                class="docx-block docx-heading"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >
                {{ block.text }}
              </component>
              <div
                v-else-if="block.kind === 'list-item'"
                :id="block.id"
                class="docx-block docx-list-item"
                :class="{ 'search-hit': matchIds.has(block.id) }"
                :style="{ paddingLeft: `${Math.min(5, block.listLevel || 0) * 20}px` }"
              >
                <span>{{ block.listKind === 'ordered' ? '1.' : '•' }}</span><p>{{ block.text }}</p>
              </div>
              <div
                v-else-if="block.kind === 'table'"
                :id="block.id"
                class="docx-block docx-table-wrap"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >
                <table>
                  <tbody>
                    <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                      <template v-for="(cell, cellIndex) in row.cells" :key="cellIndex">
                        <td
                          v-if="!cell.continuation"
                          :colspan="cell.columnSpan"
                          :rowspan="cell.rowSpan"
                        >
                          {{ cell.text }}
                        </td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div
                v-else-if="block.kind === 'page-break' || block.kind === 'rendered-page-break'"
                :id="block.id"
                class="docx-block docx-page-break"
                :class="{ rendered: block.kind === 'rendered-page-break' }"
              >
                <span>{{ block.kind === 'page-break' ? '分页符' : '渲染分页位置' }}</span>
              </div>
              <div
                v-else-if="block.kind === 'image'"
                :id="block.id"
                class="docx-block docx-image-placeholder"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >
                <template v-if="mediaFor(block).length">
                  <img
                    v-for="media in mediaFor(block)"
                    :key="media.partName"
                    :src="media.dataUrl"
                    :alt="media.partName.split('/').pop() || 'DOCX 图片'"
                  />
                </template>
                <template v-else>
                  <ImageIcon :size="22" />
                  <span>{{ block.imageCount }} 个图片对象</span>
                </template>
              </div>
              <div
                v-else
                :id="block.id"
                class="docx-block docx-paragraph"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >
                <p>{{ block.text }}</p>
                <div v-if="mediaFor(block).length" class="inline-images">
                  <img
                    v-for="media in mediaFor(block)"
                    :key="media.partName"
                    :src="media.dataUrl"
                    :alt="media.partName.split('/').pop() || 'DOCX 图片'"
                  />
                </div>
                <span v-if="block.imageCount > mediaFor(block).length" class="inline-image-note">
                  <ImageIcon :size="13" /> {{ block.imageCount }} 个内嵌图片对象
                </span>
              </div>
              <div v-if="relatedFor(block).length" class="related-links">
                <button
                  v-for="item in relatedFor(block)"
                  :key="item.id"
                  type="button"
                  :title="`定位到${item.label}`"
                  @click="scrollToBlock(item.id)"
                >
                  <MessageSquareTextIcon v-if="item.kind === 'comment'" :size="12" />
                  <BookOpenTextIcon v-else :size="12" />
                  {{ item.label }}
                </button>
              </div>
            </template>
            <div v-if="!report.model.blocks.length" class="empty-document">文档没有可显示的正文块。</div>

            <section v-if="report.model.relatedContent.length" class="docx-related-content">
              <header>
                <h2>附属内容</h2>
                <span>页眉、页脚、脚注、尾注与批注均保持只读</span>
              </header>
              <article
                v-for="item in report.model.relatedContent"
                :id="item.id"
                :key="item.id"
                class="related-item"
                :class="{ 'search-hit': matchIds.has(item.id) }"
              >
                <div class="related-item-heading">
                  <strong>{{ item.label }}</strong>
                  <span>{{ relatedMetadata(item) }}</span>
                </div>
                <p>{{ item.text }}</p>
                <div v-if="item.anchorBlockIds.length" class="related-anchors">
                  <button
                    v-for="(anchorId, anchorIndex) in item.anchorBlockIds"
                    :key="anchorId"
                    type="button"
                    :title="`定位到正文引用 ${anchorIndex + 1}`"
                    @click="scrollToBlock(anchorId)"
                  >
                    <LocateFixedIcon :size="12" />
                    正文引用 {{ anchorIndex + 1 }}
                  </button>
                </div>
              </article>
            </section>
          </article>
        </main>
      </div>

      <footer class="docx-status">
        <div>
          <span>{{ formatBytes(report.size) }}</span>
          <span>{{ report.model.blocks.length }} 个结构块</span>
          <span>{{ report.model.relatedContent.length }} 项附属内容</span>
          <span>{{ report.model.plainText.length.toLocaleString() }} 字符</span>
          <span>{{ report.media.length }}/{{ profile.renderableImageCount }} 张图片已安全预览</span>
        </div>
        <div>
          <LockIcon :size="13" />
          <span>当前不写回 DOCX；C2 仅开放经保真验证的基础编辑子集</span>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRoute } from 'vue-router'
import {
  AlertTriangle as AlertIcon,
  BookOpenText as BookOpenTextIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  FileText as FileTextIcon,
  Image as ImageIcon,
  LocateFixed as LocateFixedIcon,
  Lock as LockIcon,
  MessageSquareText as MessageSquareTextIcon,
  RefreshCw as RefreshIcon,
  Search as SearchIcon,
  ShieldAlert as ShieldAlertIcon,
} from 'lucide-vue-next'
import { useAppStore } from '../store/app'

interface DocxBlock {
  id: string
  kind: 'paragraph' | 'heading' | 'list-item' | 'table' | 'image' | 'page-break' | 'rendered-page-break'
  text: string
  level?: number | null
  listLevel?: number | null
  listKind?: 'bullet' | 'ordered' | null
  styleId?: string | null
  rows: Array<{ cells: DocxTableCell[] }>
  imageCount: number
  imageParts: string[]
  relatedContentIds: string[]
}
interface DocxTableCell {
  text: string
  columnSpan: number
  rowSpan: number
  continuation: boolean
  verticalMerge?: 'restart' | 'continue' | null
}
interface DocxSectionSummary {
  id: string
  afterBlockId?: string | null
  breakType: string
  orientation: string
  pageWidthTwips?: number | null
  pageHeightTwips?: number | null
  marginTopTwips?: number | null
  marginRightTwips?: number | null
  marginBottomTwips?: number | null
  marginLeftTwips?: number | null
  headerDistanceTwips?: number | null
  footerDistanceTwips?: number | null
  columnCount: number
}
interface DocxRelatedContent {
  id: string
  kind: 'header' | 'footer' | 'footnote' | 'endnote' | 'comment'
  label: string
  text: string
  sourcePart: string
  referenceId?: string | null
  author?: string | null
  date?: string | null
  anchorBlockIds: string[]
}
interface DocxProfile {
  producer?: string | null
  application?: string | null
  paragraphCount: number
  headingCount: number
  listItemCount: number
  tableCount: number
  imageCount: number
  renderableImageCount: number
  styleCount: number
  numberingDefinitionCount: number
  mergedCellCount: number
  pageBreakCount: number
  renderedPageBreakCount: number
  sectionCount: number
  headerCount: number
  footerCount: number
  footnotes: boolean
  endnotes: boolean
  comments: boolean
  trackedChanges: boolean
  fields: boolean
  contentControls: boolean
  equations: boolean
  embeddedObjects: boolean
  altChunks: boolean
  unknownWordParts: string[]
}
interface DocxMediaPreview {
  partName: string
  mimeType: string
  size: number
  dataUrl: string
}
interface DocxReadReport {
  path: string
  size: number
  modified: number
  signature: string
  readOnly: boolean
  model: {
    blocks: DocxBlock[]
    headings: Array<{ blockId: string; text: string; level: number }>
    relatedContent: DocxRelatedContent[]
    sections: DocxSectionSummary[]
    plainText: string
    compatibility: DocxProfile
    warnings: string[]
  }
  media: DocxMediaPreview[]
  mediaWarnings: string[]
}

const route = useRoute()
const store = useAppStore()
const report = ref<DocxReadReport | null>(null)
const loading = ref(false)
const loadError = ref('')
const query = ref('')
const matchIndex = ref(-1)

const docxPath = computed(() => String(route.query.path || store.activeTabId || ''))
const routeLocator = computed(() => typeof route.query.locator === 'string' ? route.query.locator : '')
const fileName = computed(() => docxPath.value.split(/[\\/]/).pop() || '未命名.docx')
const profile = computed(() => report.value?.model.compatibility as DocxProfile)
const mediaByPart = computed(() => new Map(
  (report.value?.media || []).map(media => [media.partName, media]),
))
const relatedById = computed(() => new Map(
  (report.value?.model.relatedContent || []).map(item => [item.id, item]),
))
const allWarnings = computed(() => [
  ...(report.value?.model.warnings || []),
  ...(report.value?.mediaWarnings || []),
])
const matches = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle || !report.value) return []
  return [
    ...report.value.model.blocks,
    ...report.value.model.relatedContent,
  ].filter(item => item.text.toLocaleLowerCase().includes(needle))
})
const matchIds = computed(() => new Set(matches.value.map(block => block.id)))
const searchPositionLabel = computed(() => matches.value.length
  ? `${Math.max(1, matchIndex.value + 1)}/${matches.value.length}`
  : '0/0')
const producerLabel = computed(() => {
  const producer = profile.value?.producer
  const application = profile.value?.application
  return [producer, application].filter(Boolean).join(' · ') || '生产者信息未声明'
})
const packageFeatureLabel = computed(() => {
  const value = profile.value
  if (!value) return ''
  const features = []
  if (value.headerCount || value.footerCount) features.push(`已读取页眉/页脚 ${value.headerCount}/${value.footerCount}`)
  if (value.footnotes) features.push('已读取脚注')
  if (value.endnotes) features.push('已读取尾注')
  if (value.comments) features.push('已读取批注')
  if (value.trackedChanges) features.push('修订')
  if (value.fields) features.push('域')
  if (value.contentControls) features.push('内容控件')
  if (value.equations) features.push('公式')
  if (value.embeddedObjects) features.push('嵌入对象')
  const packageSummary = `样式 ${value.styleCount} · 编号 ${value.numberingDefinitionCount} · 节 ${value.sectionCount} · 可预览图片 ${value.renderableImageCount}`
  return features.length
    ? `${packageSummary} · 只读识别：${features.join(' · ')}`
    : `${packageSummary} · 未检测到首批模型外的高风险对象`
})

const headingTag = (level?: number | null) => `h${Math.min(6, Math.max(1, level || 1))}`
const twipsToCentimeters = (twips?: number | null) => twips
  ? `${(twips / 1440 * 2.54).toFixed(1)} cm`
  : '未声明'
const sectionSummary = (section: DocxSectionSummary) => {
  const orientation = section.orientation === 'landscape' ? '横向' : '纵向'
  const size = section.pageWidthTwips && section.pageHeightTwips
    ? `${twipsToCentimeters(section.pageWidthTwips)} × ${twipsToCentimeters(section.pageHeightTwips)}`
    : '默认纸张'
  return `${orientation} · ${size} · ${section.columnCount} 栏 · ${section.breakType}`
}
const mediaFor = (block: DocxBlock) => block.imageParts
  .map(part => mediaByPart.value.get(part))
  .filter((media): media is DocxMediaPreview => Boolean(media))
const relatedFor = (block: DocxBlock) => block.relatedContentIds
  .map(id => relatedById.value.get(id))
  .filter((item): item is DocxRelatedContent => Boolean(item))
const relatedMetadata = (item: DocxRelatedContent) => {
  const details = [item.author, item.date, item.sourcePart].filter(Boolean)
  return details.join(' · ')
}
const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KiB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MiB`
const scrollToBlock = async (id: string) => {
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const scrollToRouteLocator = () => {
  if (routeLocator.value) void scrollToBlock(routeLocator.value)
}
const moveSearch = (direction: -1 | 1) => {
  if (!matches.value.length) return
  matchIndex.value = (matchIndex.value + direction + matches.value.length) % matches.value.length
  scrollToBlock(matches.value[matchIndex.value].id)
}
const load = async () => {
  if (!docxPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    report.value = await invoke<DocxReadReport>('read_docx_document', {
      libraryRoot: store.libraryPath,
      path: docxPath.value,
    })
    scrollToRouteLocator()
  } catch (cause) {
    report.value = null
    loadError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    loading.value = false
  }
}

watch(docxPath, () => {
  query.value = ''
  matchIndex.value = -1
  load()
}, { immediate: true })
watch(matches, value => {
  matchIndex.value = value.length ? 0 : -1
})
watch(() => [route.query.locator, route.query.locatorToken], scrollToRouteLocator)
</script>

<style scoped>
.docx-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; }
.docx-toolbar { min-height: 52px; padding: 7px 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.document-identity, .toolbar-actions, .docx-search, .compatibility-warning, .docx-status > div { display: flex; align-items: center; }
.document-identity { gap: 9px; min-width: 0; }
.document-title { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.document-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.document-title span { color: var(--text-muted); font-size: 11px; }
.toolbar-actions { gap: 5px; }
.toolbar-actions button { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.toolbar-actions button:disabled { opacity: .4; cursor: default; }
.docx-search { height: 29px; gap: 6px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.docx-search input { width: 150px; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; }
.docx-search span { color: var(--text-muted); font-size: 11px; }
.docx-state { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
.docx-state.error { color: var(--error-color); }
.docx-state p { margin: 3px 0 0; color: var(--text-secondary); }
.compatibility-warning { gap: 9px; padding: 8px 14px; border-bottom: 1px solid color-mix(in srgb, #d49a28 34%, var(--border-color)); background: color-mix(in srgb, #d49a28 9%, var(--bg-primary)); }
.compatibility-warning div { display: flex; flex-direction: column; gap: 2px; }
.compatibility-warning strong { font-size: 12px; }
.compatibility-warning span { color: var(--text-secondary); font-size: 11px; }
.docx-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); }
.docx-outline { overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.outline-heading { padding: 0 5px 8px; display: flex; justify-content: space-between; }
.outline-heading span, .outline-empty { color: var(--text-muted); font-size: 11px; }
.docx-outline nav { display: flex; flex-direction: column; gap: 2px; }
.docx-outline nav button { padding: 6px 8px; border: 0; border-radius: 5px; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); background: transparent; cursor: pointer; font: inherit; }
.docx-outline nav button:hover { background: var(--hover-bg); color: var(--text-primary); }
.docx-outline nav button span { margin-right: 5px; color: var(--primary-color); font-size: 10px; }
.compatibility-card { margin-top: 16px; padding: 10px; display: flex; flex-direction: column; gap: 7px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); }
.compatibility-card > span, .compatibility-card small { color: var(--text-muted); font-size: 10px; line-height: 1.5; }
.metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.metric-grid span { padding: 5px; border-radius: 5px; background: var(--bg-primary); color: var(--text-secondary); font-size: 10px; }
.metric-grid b { margin-right: 3px; color: var(--text-primary); font-size: 12px; }
.docx-layout-summary { padding-top: 7px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-color); }
.docx-layout-summary strong { font-size: 11px; }
.docx-layout-summary span { color: var(--text-muted); font-size: 10px; line-height: 1.45; }
.docx-stage { overflow: auto; padding: 24px; background: color-mix(in srgb, var(--bg-secondary) 88%, #7f8da3); }
.docx-page { width: min(760px, calc(100% - 24px)); min-height: 960px; margin: 0 auto; padding: 64px 70px; box-sizing: border-box; border: 1px solid var(--border-color); box-shadow: 0 8px 26px rgba(0,0,0,.12); background: var(--bg-primary); }
.docx-block { scroll-margin: 90px; border-radius: 4px; transition: background .15s ease; }
.docx-block.search-hit { background: color-mix(in srgb, #f0bd3e 23%, transparent); }
.docx-heading { margin: 1.3em 0 .55em; line-height: 1.3; }
h1.docx-heading { font-size: 25px; } h2.docx-heading { font-size: 21px; } h3.docx-heading { font-size: 18px; }
h4.docx-heading, h5.docx-heading, h6.docx-heading { font-size: 15px; }
.docx-paragraph { margin: .55em 0; line-height: 1.75; white-space: pre-wrap; }
.docx-paragraph p { margin: 0; }
.inline-image-note { margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 10px; }
.docx-list-item { margin: .38em 0; display: flex; gap: 8px; line-height: 1.65; }
.docx-list-item > span { color: var(--primary-color); }
.docx-list-item p { margin: 0; }
.docx-table-wrap { margin: 14px 0; overflow: auto; }
.docx-table-wrap table { width: 100%; border-collapse: collapse; }
.docx-table-wrap td { min-width: 80px; padding: 7px 9px; border: 1px solid var(--border-color); vertical-align: top; }
.docx-page-break { height: 32px; margin: 20px 0; display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 10px; }
.docx-page-break::before, .docx-page-break::after { content: ''; flex: 1; border-top: 1px dashed var(--border-color); }
.docx-page-break.rendered { opacity: .68; }
.docx-image-placeholder { min-height: 100px; margin: 14px 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; border: 1px dashed var(--border-color); color: var(--text-muted); background: var(--bg-secondary); }
.docx-image-placeholder img, .inline-images img { display: block; max-width: 100%; max-height: 520px; object-fit: contain; }
.inline-images { margin: 10px 0; display: grid; gap: 8px; justify-items: start; }
.related-links, .related-anchors { display: flex; flex-wrap: wrap; gap: 5px; }
.related-links { margin: 4px 0 10px; }
.related-links button, .related-anchors button { min-height: 24px; padding: 3px 7px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; font: inherit; font-size: 10px; }
.related-links button:hover, .related-anchors button:hover { border-color: var(--primary-color); color: var(--primary-color); }
.docx-related-content { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border-color); }
.docx-related-content > header { margin-bottom: 16px; }
.docx-related-content h2 { margin: 0 0 4px; font-size: 17px; }
.docx-related-content > header span, .related-item-heading span { color: var(--text-muted); font-size: 10px; }
.related-item { scroll-margin: 90px; padding: 11px 0; border-bottom: 1px solid var(--border-color); }
.related-item-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.related-item-heading strong { font-size: 12px; }
.related-item p { margin: 6px 0; line-height: 1.65; white-space: pre-wrap; }
.empty-document { padding: 80px 20px; text-align: center; color: var(--text-muted); }
.docx-status { min-height: 28px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-muted); font-size: 10px; }
.docx-status > div { gap: 10px; }
@media (max-width: 820px) {
  .docx-layout { grid-template-columns: 180px minmax(0, 1fr); }
  .docx-page { padding: 42px 36px; }
  .docx-search input { width: 105px; }
}
</style>
