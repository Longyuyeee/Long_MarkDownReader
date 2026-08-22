<template>
  <div class="docx-workspace">
    <WorkspaceTabs v-if="isExternal && !store.isZen && store.tabs.length" />
    <header class="docx-toolbar">
      <div class="document-identity">
        <button type="button" class="toolbar-icon" title="返回上一页" aria-label="返回上一页" @click="leaveDocx">
          <ArrowLeftIcon :size="16" />
        </button>
        <FileTextIcon :size="18" />
        <div class="document-title">
          <strong :title="docxPath">{{ fileName }}</strong>
          <span>{{ isExternal ? '外部 Word 文档 · 只读 · 不会写回' : 'Word 页面编辑 · 草稿只驻留内存 · 点击保存才写入' }}</span>
        </div>
      </div>
      <div class="toolbar-actions" data-command-strip data-horizontal-wheel="always">
        <button v-if="!isExternal" type="button" :disabled="!draftUndoStack.length" title="撤销草稿修改" @click="undoDraft">
          <UndoIcon :size="15" />
        </button>
        <button v-if="!isExternal" type="button" :disabled="!draftRedoStack.length" title="重做草稿修改" @click="redoDraft">
          <RedoIcon :size="15" />
        </button>
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
        <button
          v-if="!isExternal"
          type="button"
          :disabled="!editableTargetCount"
          :class="{ active: editorOpen }"
          :aria-pressed="editorOpen"
          title="打开 DOCX 页面编辑"
          @click="editorOpen = !editorOpen"
        >
          <FilePenLineIcon :size="15" />
        </button>
        <button
          v-if="!isExternal"
          type="button"
          :disabled="!previewReport || savingSource"
          title="保存到原文件"
          @click="confirmSaveSource"
        >
          <SaveIcon :size="15" />
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
      <section v-if="allWarnings.length" class="compatibility-warning" role="status">
        <ShieldAlertIcon :size="17" />
        <div>
          <strong>高级对象保持只读</strong>
          <span>{{ allWarnings.join(' · ') }}</span>
        </div>
      </section>

      <div class="docx-layout" :class="{ 'editor-open': editorOpen && !isExternal }">
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

        <main ref="stageRef" class="docx-stage" aria-label="DOCX 分页正文" @scroll.passive="rememberDocxViewState()">
          <article
            v-for="(page, pageIndex) in documentPages"
            :key="page.id"
            class="docx-page"
            :style="pageStyle(page)"
          >
            <span class="page-number" aria-hidden="true">{{ pageIndex + 1 }}</span>
            <template v-for="block in page.blocks" :key="block.id">
              <component
                :is="headingTag(block.level)"
                v-if="block.kind === 'heading'"
                :id="block.id"
                class="docx-block docx-heading"
                :class="blockEditClasses(block)"
                :style="draftStyleForBlock(block)"
                @click="selectTextBlock(block)"
              >
                {{ draftTextForBlock(block) }}
              </component>
              <div
                v-else-if="block.kind === 'list-item'"
                :id="block.id"
                class="docx-block docx-list-item"
                :class="blockEditClasses(block)"
                :style="{ paddingLeft: `${Math.min(5, block.listLevel || 0) * 20}px` }"
                @click="selectTextBlock(block)"
              >
                <span>{{ block.listKind === 'ordered' ? '1.' : '•' }}</span><p>{{ draftTextForBlock(block) }}</p>
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
                          :class="tableCellEditClasses(block, rowIndex, cellIndex)"
                          @click.stop="selectTableCell(block, rowIndex, cellIndex)"
                        >
                          {{ draftTableCellText(block, rowIndex, cellIndex, cell.text) }}
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
                :class="blockEditClasses(block)"
                :style="draftStyleForBlock(block)"
                @click="selectTextBlock(block)"
              >
                <p>{{ draftTextForBlock(block) }}</p>
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

            <section v-if="pageIndex === documentPages.length - 1 && report.model.relatedContent.length" class="docx-related-content">
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

        <aside v-if="editorOpen && !isExternal" class="docx-editor" aria-label="DOCX 页面编辑">
          <header>
            <div>
              <strong>页面编辑</strong>
              <span>修改先留在草稿，验证后才能保存</span>
            </div>
            <button type="button" title="关闭编辑面板" @click="editorOpen = false">
              <XIcon :size="15" />
            </button>
          </header>

          <div class="edit-mode-tabs" role="tablist" aria-label="编辑类型">
            <button
              type="button"
              :class="{ active: editMode === 'text' }"
              :disabled="!report.editableTextTargets.length"
              @click="editMode = 'text'"
            >文本</button>
            <button
              type="button"
              :class="{ active: editMode === 'style' }"
              :disabled="!report.editableStyleTargets.length"
              @click="editMode = 'style'"
            >样式</button>
            <button
              type="button"
              :class="{ active: editMode === 'imageAltText' }"
              :disabled="!report.editableImageTargets.length"
              @click="editMode = 'imageAltText'"
            >图片说明</button>
          </div>

          <label class="edit-field">
            <span>编辑目标</span>
            <select v-model="selectedTargetId">
              <option v-for="target in activeTargets" :key="target.id" :value="target.id">
                {{ targetLabel(target) }}
              </option>
            </select>
          </label>

          <label v-if="editMode === 'text'" class="edit-field">
            <span>{{ selectedTextTarget()?.carrier === 'hyperlink-label' ? '替换链接文字（地址保持不变）' : '替换文本' }}</span>
            <textarea v-model="replacementText" maxlength="32767" rows="7" @beforeinput="captureDraftHistory()"></textarea>
          </label>

          <div v-else-if="editMode === 'style'" class="edit-field">
            <span>字符格式</span>
            <div class="style-controls">
              <button
                type="button"
                :class="{ active: draftBold }"
                title="粗体"
                aria-label="粗体"
                @click="toggleDraftStyle('bold')"
              ><b>B</b></button>
              <button
                type="button"
                :class="{ active: draftItalic }"
                title="斜体"
                aria-label="斜体"
                @click="toggleDraftStyle('italic')"
              ><i>I</i></button>
              <button
                type="button"
                :class="{ active: draftUnderline }"
                title="下划线"
                aria-label="下划线"
                @click="toggleDraftStyle('underline')"
              ><u>U</u></button>
            </div>
            <div class="advanced-style-controls">
              <label>
                <span>字色</span>
                <input
                  type="color"
                  :value="draftFontColor || '#2457a6'"
                  title="选择直接 RGB 字色"
                  @focus="captureDraftHistory(true)"
                  @input="setDraftFontColor"
                />
                <button type="button" :disabled="!draftFontColor" @click="clearDraftFontColor">继承</button>
              </label>
              <label>
                <span>字号</span>
                <select v-model="draftFontSizeHalfPoints" @focus="captureDraftHistory(true)">
                  <option :value="null">继承</option>
                  <option v-for="size in fontSizeOptions" :key="size" :value="size * 2">{{ size }} 磅</option>
                </select>
              </label>
            </div>
          </div>

          <label v-else class="edit-field">
            <span>图片替代文本</span>
            <textarea v-model="replacementAltText" maxlength="1024" rows="5" @beforeinput="captureDraftHistory()"></textarea>
          </label>

          <section class="draft-list" aria-label="DOCX 修改清单">
            <header>
              <strong>修改清单</strong>
              <span :class="{ error: draftLimitExceeded }">{{ draftCount }}/32</span>
            </header>
            <p v-if="!draftCount">修改任一目标后会自动加入清单，切换页面或目标不会丢失。</p>
            <template v-else>
              <article v-for="entry in draftEntryList" :key="entry.anchor">
                <button type="button" class="draft-locate" :title="`定位到${entry.label}`" @click="locateDraftEntry(entry)">
                  <LocateFixedIcon :size="13" />
                  <span><b>{{ entry.operation.kind === 'text' ? '文本' : entry.operation.kind === 'style' ? '样式' : '图片说明' }}</b>{{ entry.label }}</span>
                </button>
                <button type="button" class="draft-remove" title="移除这项修改" @click="removeDraftEntry(entry)">
                  <XIcon :size="13" />
                </button>
              </article>
              <p v-if="draftLimitExceeded" class="draft-limit" role="alert">一次最多验证 32 项，请先移除多余修改。</p>
            </template>
          </section>

          <button
            type="button"
            class="verify-edit"
            :disabled="!draftCount || draftLimitExceeded || previewing"
            @click="previewEdit"
          >
            <ShieldCheckIcon :size="15" />
            {{ previewing ? '正在生成并复读…' : `验证 ${draftCount} 项修改` }}
          </button>

          <div v-if="previewReport || editError" class="edit-verification" :class="{ error: editError }" :role="editError ? 'alert' : 'status'" aria-live="polite">
            <template v-if="previewReport">
              <strong>隔离验证通过</strong>
              <span>{{ previewReport.operationCount || draftCount }} 项 · {{ formatBytes(previewReport.outputBytes) }} · 仅修改 {{ previewReport.changedParts.join('、') }}</span>
              <small>{{ draftCount > 1 ? '批量修改已通过确定性重放与临时副本复读；' : '' }}未编辑 OOXML 部件逐字节保持，源文件未修改。</small>
            </template>
            <template v-else>
              <strong>验证未通过</strong>
              <span>{{ editError }}</span>
            </template>
          </div>

          <div v-if="previewReport" class="copy-save">
            <button type="button" :disabled="savingSource" aria-live="polite" @click="confirmSaveSource">
              <SaveIcon :size="15" />
              {{ savingSource ? '正在可靠保存并重开…' : '保存到原文件' }}
            </button>
            <p class="save-boundary">会覆盖当前 DOCX；保存前再次检查外部修改，失败时恢复原文件。</p>
            <label class="edit-field">
              <span>或者另存副本</span>
              <input v-model="copyFileName" maxlength="255" @keydown.enter.prevent="saveCopy" />
            </label>
            <button type="button" :disabled="saving || !draftCount || !copyFileName.trim()" aria-live="polite" @click="saveCopy">
              <SaveIcon :size="15" />
              {{ saving ? '正在落盘并重开…' : '另存新 DOCX 并打开' }}
            </button>
            <small v-if="saveError" role="alert">{{ saveError }}</small>
          </div>
        </aside>
      </div>

      <footer class="docx-status">
        <div>
          <span>{{ formatBytes(report.size) }}</span>
          <span>{{ report.model.blocks.length }} 个结构块</span>
          <span>{{ report.model.relatedContent.length }} 项附属内容</span>
          <span>{{ report.model.plainText.length.toLocaleString() }} 字符</span>
          <span>{{ report.media.length }}/{{ profile.renderableImageCount }} 张图片已安全预览</span>
          <span>{{ documentPages.length }} 页</span>
        </div>
        <div>
          <ShieldCheckIcon v-if="isExternal" :size="13" />
          <SaveIcon v-else :size="13" />
          <span>{{ isExternal ? '外部文件只读预览；源文件未修改' : '简单文本、列表、单段表格单元格、字符格式和图片说明可编辑；未点击保存不会写盘' }}</span>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { NButton, useDialog, useMessage } from 'naive-ui'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import {
  AlertTriangle as AlertIcon,
  ArrowLeft as ArrowLeftIcon,
  BookOpenText as BookOpenTextIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  FilePenLine as FilePenLineIcon,
  FileText as FileTextIcon,
  Image as ImageIcon,
  LocateFixed as LocateFixedIcon,
  MessageSquareText as MessageSquareTextIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  ShieldCheck as ShieldCheckIcon,
  ShieldAlert as ShieldAlertIcon,
  Redo2 as RedoIcon,
  Undo2 as UndoIcon,
  X as XIcon,
} from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'

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
interface DocxPage {
  id: string
  blocks: DocxBlock[]
  section?: DocxSectionSummary
  breakKind?: 'page-break' | 'rendered-page-break' | 'section'
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
  documentPartDigest: string
  editableTextTargets: Array<{
    id: string
    blockId: string
    kind: 'paragraph' | 'heading' | 'list-item' | 'table-cell'
    carrier: 'plain' | 'hyperlink-label'
    text: string
    expectedTextDigest: string
    rowIndex: number | null
    columnIndex: number | null
  }>
  editableStyleTargets: Array<{
    id: string
    blockId: string
    kind: 'paragraph' | 'heading' | 'list-item' | 'table-cell'
    text: string
    bold: boolean
    italic: boolean
    underline: boolean
    fontColor: string | null
    fontSizeHalfPoints: number | null
    expectedStyleDigest: string
    rowIndex: number | null
    columnIndex: number | null
  }>
  editableImageTargets: Array<{
    id: string
    blockId: string
    imagePart: string
    name: string
    altText: string
    expectedMetadataDigest: string
  }>
  readOnly: boolean
  sourcePreserved: boolean
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
interface DocxPatchPreviewReport {
  status: string
  outputDigest: string
  outputBytes: number
  changedParts: string[]
  unchangedPartsVerified: boolean
  structuralReparseVerified: boolean
  semanticReparseVerified: boolean
  sourceUnchanged: boolean
  operationCount?: number
  deterministicReplayVerified?: boolean
  temporaryCopyReopenVerified?: boolean
}
interface DocxSavedCopyReport {
  status: string
  targetPath: string
  outputBytes: number
  sourceUnchanged: boolean
  unchangedPartsVerified: boolean
  structuralReopenVerified: boolean
  semanticReopenVerified: boolean
  producerEvidence: string[]
}
interface DocxSavedSourceReport {
  status: string
  path: string
  signature: string
  digest: string
  outputBytes: number
  unchangedPartsVerified: boolean
  structuralReopenVerified: boolean
  semanticReopenVerified: boolean
  rollbackProtected: boolean
  producerEvidence: string[]
}
type DocxTextTarget = DocxReadReport['editableTextTargets'][number]
type DocxStyleTarget = DocxReadReport['editableStyleTargets'][number]
type DocxImageTarget = DocxReadReport['editableImageTargets'][number]
type DocxEditableTarget = DocxTextTarget | DocxStyleTarget | DocxImageTarget
type DocxEditMode = 'text' | 'style' | 'imageAltText'
type DocxPatchOperation =
  | { kind: 'text'; targetId: string; expectedTextDigest: string; replacementText: string }
  | { kind: 'style'; targetId: string; expectedStyleDigest: string; bold: boolean; italic: boolean; underline: boolean; fontColor: string | null; fontSizeHalfPoints: number | null }
  | { kind: 'imageAltText'; targetId: string; expectedMetadataDigest: string; replacementAltText: string }
interface DocxDraftEntry {
  anchor: string
  blockId: string
  rowIndex: number | null
  columnIndex: number | null
  label: string
  operation: DocxPatchOperation
}
interface DraftSnapshot {
  entries: DocxDraftEntry[]
  editMode: DocxEditMode
  selectedTargetId: string
  text: string
  altText: string
  bold: boolean
  italic: boolean
  underline: boolean
  fontColor: string
  fontSizeHalfPoints: number | null
}

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const store = useAppStore()
const report = ref<DocxReadReport | null>(null)
const loading = ref(false)
const loadError = ref('')
const stageRef = ref<HTMLElement | null>(null)
const query = ref('')
const matchIndex = ref(-1)
const editorOpen = ref(false)
const editMode = ref<DocxEditMode>('text')
const selectedTargetId = ref('')
const replacementText = ref('')
const replacementAltText = ref('')
const draftBold = ref(false)
const draftItalic = ref(false)
const draftUnderline = ref(false)
const draftFontColor = ref('')
const draftFontSizeHalfPoints = ref<number | null>(null)
const previewing = ref(false)
const previewReport = ref<DocxPatchPreviewReport | null>(null)
const editError = ref('')
const copyFileName = ref('')
const saving = ref(false)
const savingSource = ref(false)
const saveError = ref('')
const draftEntries = ref(new Map<string, DocxDraftEntry>())
const draftUndoStack = ref<DraftSnapshot[]>([])
const draftRedoStack = ref<DraftSnapshot[]>([])
const allowNextLeave = ref(false)
let lastDraftHistoryAt = 0
let restoringDraftSnapshot = false
const fontSizeOptions = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72]

const docxPath = computed(() => String(route.query.path || store.activeTabId || ''))
const isExternal = computed(() => route.query.external === '1')
const routeLocator = computed(() => typeof route.query.locator === 'string' ? route.query.locator : '')
const fileName = computed(() => docxPath.value.split(/[\\/]/).pop() || '未命名.docx')
const rememberDocxViewState = (path = docxPath.value) => {
  const stage = stageRef.value
  if (!path || !stage) return
  rememberWorkspaceViewState(path, {
    scrollTop: stage.scrollTop,
    scrollLeft: stage.scrollLeft,
    panelOpen: editorOpen.value,
    mode: editMode.value,
  })
}
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
const documentPages = computed<DocxPage[]>(() => {
  const blocks = report.value?.model.blocks || []
  const sections = report.value?.model.sections || []
  const pages: DocxPage[] = []
  let sectionIndex = 0
  let current: DocxBlock[] = []
  const pushPage = (breakKind?: DocxPage['breakKind'], force = false) => {
    if (!current.length && !force) return
    pages.push({
      id: `docx-page-${pages.length + 1}`,
      blocks: current,
      section: sections[Math.min(sectionIndex, Math.max(0, sections.length - 1))],
      breakKind,
    })
    current = []
  }
  for (const block of blocks) {
    if (block.kind === 'page-break' || block.kind === 'rendered-page-break') {
      pushPage(block.kind, true)
      continue
    }
    current.push(block)
    const section = sections[sectionIndex]
    if (section?.afterBlockId === block.id && sectionIndex < sections.length - 1) {
      pushPage('section')
      sectionIndex += 1
    }
  }
  pushPage()
  if (!pages.length) pushPage(undefined, true)
  return pages
})
const editableTargetCount = computed(() => {
  const value = report.value
  return value
    ? value.editableTextTargets.length + value.editableStyleTargets.length + value.editableImageTargets.length
    : 0
})
const activeTargets = computed<DocxEditableTarget[]>(() => {
  if (!report.value) return []
  if (editMode.value === 'style') return report.value.editableStyleTargets
  if (editMode.value === 'imageAltText') return report.value.editableImageTargets
  return report.value.editableTextTargets
})
const textTargets = computed(() => report.value?.editableTextTargets || [])
const styleTargets = computed(() => report.value?.editableStyleTargets || [])
const selectedTarget = computed(() => activeTargets.value.find(target => target.id === selectedTargetId.value))
const semanticAnchor = (target: DocxEditableTarget) => 'imagePart' in target
  ? `image:${target.blockId}`
  : `content:${target.blockId}:${target.rowIndex ?? '-'}:${target.columnIndex ?? '-'}`
const currentOperation = computed<DocxPatchOperation | null>(() => {
  const target = selectedTarget.value
  if (!target) return null
  if (editMode.value === 'text' && 'expectedTextDigest' in target) {
    return {
      kind: 'text',
      targetId: target.id,
      expectedTextDigest: target.expectedTextDigest,
      replacementText: replacementText.value,
    }
  }
  if (editMode.value === 'style' && 'expectedStyleDigest' in target) {
    return {
      kind: 'style',
      targetId: target.id,
      expectedStyleDigest: target.expectedStyleDigest,
      bold: draftBold.value,
      italic: draftItalic.value,
      underline: draftUnderline.value,
      fontColor: draftFontColor.value ? draftFontColor.value.slice(1).toUpperCase() : null,
      fontSizeHalfPoints: draftFontSizeHalfPoints.value,
    }
  }
  if (editMode.value === 'imageAltText' && 'expectedMetadataDigest' in target) {
    return {
      kind: 'imageAltText',
      targetId: target.id,
      expectedMetadataDigest: target.expectedMetadataDigest,
      replacementAltText: replacementAltText.value,
    }
  }
  return null
})
const canPreviewEdit = computed(() => {
  const target = selectedTarget.value
  if (!target || !currentOperation.value) return false
  if (editMode.value === 'text' && 'text' in target) return replacementText.value !== target.text
  if (editMode.value === 'style' && 'bold' in target) {
    return draftBold.value !== target.bold
      || draftItalic.value !== target.italic
      || draftUnderline.value !== target.underline
      || (draftFontColor.value ? draftFontColor.value.slice(1).toUpperCase() : null) !== target.fontColor
      || draftFontSizeHalfPoints.value !== target.fontSizeHalfPoints
  }
  return 'altText' in target && replacementAltText.value !== target.altText
})
const draftOperations = computed(() => Array.from(draftEntries.value.values(), entry => entry.operation))
const draftEntryList = computed(() => Array.from(draftEntries.value.values()))
const draftCount = computed(() => draftEntries.value.size)
const draftLimitExceeded = computed(() => draftCount.value > 32)

const draftSnapshot = (): DraftSnapshot => ({
  entries: Array.from(draftEntries.value.values(), entry => ({
    ...entry,
    operation: { ...entry.operation },
  })),
  editMode: editMode.value,
  selectedTargetId: selectedTargetId.value,
  text: replacementText.value,
  altText: replacementAltText.value,
  bold: draftBold.value,
  italic: draftItalic.value,
  underline: draftUnderline.value,
  fontColor: draftFontColor.value,
  fontSizeHalfPoints: draftFontSizeHalfPoints.value,
})
const sameDraftSnapshot = (left: DraftSnapshot, right: DraftSnapshot) => JSON.stringify(left) === JSON.stringify(right)
const clearDraftHistory = () => {
  draftUndoStack.value = []
  draftRedoStack.value = []
  lastDraftHistoryAt = 0
}
const captureDraftHistory = (force = false) => {
  const snapshot = draftSnapshot()
  const previous = draftUndoStack.value[draftUndoStack.value.length - 1]
  const now = performance.now()
  if (!force && now - lastDraftHistoryAt < 650) return
  if (!previous || !sameDraftSnapshot(previous, snapshot)) {
    draftUndoStack.value.push(snapshot)
    if (draftUndoStack.value.length > 80) draftUndoStack.value.shift()
  }
  draftRedoStack.value = []
  lastDraftHistoryAt = now
}
const restoreDraftSnapshot = (snapshot: DraftSnapshot) => {
  restoringDraftSnapshot = true
  draftEntries.value = new Map(snapshot.entries.map(entry => [entry.anchor, {
    ...entry,
    operation: { ...entry.operation },
  }]))
  editMode.value = snapshot.editMode
  selectedTargetId.value = snapshot.selectedTargetId
  replacementText.value = snapshot.text
  replacementAltText.value = snapshot.altText
  draftBold.value = snapshot.bold
  draftItalic.value = snapshot.italic
  draftUnderline.value = snapshot.underline
  draftFontColor.value = snapshot.fontColor
  draftFontSizeHalfPoints.value = snapshot.fontSizeHalfPoints
  invalidatePreview()
  void nextTick(() => { restoringDraftSnapshot = false })
}
const undoDraft = () => {
  const previous = draftUndoStack.value.pop()
  if (!previous) return
  draftRedoStack.value.push(draftSnapshot())
  restoreDraftSnapshot(previous)
  lastDraftHistoryAt = 0
}
const redoDraft = () => {
  const next = draftRedoStack.value.pop()
  if (!next) return
  draftUndoStack.value.push(draftSnapshot())
  restoreDraftSnapshot(next)
  lastDraftHistoryAt = 0
}
const toggleDraftStyle = (property: 'bold' | 'italic' | 'underline') => {
  captureDraftHistory(true)
  if (property === 'bold') draftBold.value = !draftBold.value
  if (property === 'italic') draftItalic.value = !draftItalic.value
  if (property === 'underline') draftUnderline.value = !draftUnderline.value
}
const setDraftFontColor = (event: Event) => {
  draftFontColor.value = (event.target as HTMLInputElement).value
}
const clearDraftFontColor = () => {
  captureDraftHistory(true)
  draftFontColor.value = ''
}

const draftEntryForTarget = (target: DocxEditableTarget | undefined) => target
  ? draftEntries.value.get(semanticAnchor(target))
  : undefined
const makeDraftEntry = (target: DocxEditableTarget, operation: DocxPatchOperation): DocxDraftEntry => ({
  anchor: semanticAnchor(target),
  blockId: target.blockId,
  rowIndex: 'rowIndex' in target ? target.rowIndex : null,
  columnIndex: 'columnIndex' in target ? target.columnIndex : null,
  label: targetLabel(target),
  operation,
})
const syncCurrentDraft = () => {
  if (restoringDraftSnapshot) return
  const target = selectedTarget.value
  const operation = currentOperation.value
  if (!target || !operation) return
  const anchor = semanticAnchor(target)
  const entries = new Map(draftEntries.value)
  if (canPreviewEdit.value) {
    entries.set(anchor, makeDraftEntry(target, operation))
  } else if (entries.get(anchor)?.operation.targetId === target.id) {
    entries.delete(anchor)
  } else {
    return
  }
  draftEntries.value = entries
  invalidatePreview()
}
const removeDraftEntry = (entry: DocxDraftEntry) => {
  captureDraftHistory(true)
  const entries = new Map(draftEntries.value)
  entries.delete(entry.anchor)
  draftEntries.value = entries
  if (entry.operation.targetId === selectedTargetId.value) resetTargetDraft()
  invalidatePreview()
}
const locateDraftEntry = (entry: DocxDraftEntry) => {
  const mode: DocxEditMode = entry.operation.kind === 'imageAltText' ? 'imageAltText' : entry.operation.kind
  editorOpen.value = true
  editMode.value = mode
  selectedTargetId.value = entry.operation.targetId
  void scrollToBlock(entry.blockId)
}

const textTargetForBlock = (blockId: string) => textTargets.value.find(target => (
  target.blockId === blockId && target.kind !== 'table-cell'
))
const tableTargetForCell = (blockId: string, rowIndex: number, columnIndex: number) => textTargets.value.find(target => (
  target.blockId === blockId
  && target.kind === 'table-cell'
  && target.rowIndex === rowIndex
  && target.columnIndex === columnIndex
))
const selectedTextTarget = () => editMode.value === 'text' && selectedTarget.value && 'expectedTextDigest' in selectedTarget.value
  ? selectedTarget.value
  : null
const draftTextForBlock = (block: DocxBlock) => {
  const target = textTargetForBlock(block.id)
  const entry = draftEntryForTarget(target)
  return entry?.operation.kind === 'text' ? entry.operation.replacementText : block.text
}
const draftTableCellText = (block: DocxBlock, rowIndex: number, columnIndex: number, fallback: string) => {
  const target = tableTargetForCell(block.id, rowIndex, columnIndex)
  const entry = draftEntryForTarget(target)
  return entry?.operation.kind === 'text' ? entry.operation.replacementText : fallback
}
const blockEditClasses = (block: DocxBlock) => ({
  'search-hit': matchIds.value.has(block.id),
  editable: !isExternal.value && Boolean(textTargetForBlock(block.id) || styleTargets.value.some(target => target.blockId === block.id)),
  'edit-selected': selectedTarget.value?.blockId === block.id,
  'has-draft': Array.from(draftEntries.value.values()).some(entry => entry.blockId === block.id),
  'editable-hyperlink': textTargetForBlock(block.id)?.carrier === 'hyperlink-label',
})
const tableCellEditClasses = (block: DocxBlock, rowIndex: number, columnIndex: number) => ({
  editable: !isExternal.value && Boolean(tableTargetForCell(block.id, rowIndex, columnIndex)),
  'edit-selected': selectedTextTarget()?.id === tableTargetForCell(block.id, rowIndex, columnIndex)?.id,
  'has-draft': Boolean(draftEntryForTarget(tableTargetForCell(block.id, rowIndex, columnIndex))),
  'editable-hyperlink': tableTargetForCell(block.id, rowIndex, columnIndex)?.carrier === 'hyperlink-label',
})
const draftStyleForBlock = (block: DocxBlock) => {
  const target = styleTargets.value.find(candidate => candidate.blockId === block.id && candidate.kind !== 'table-cell')
  const entry = draftEntryForTarget(target)
  if (entry?.operation.kind !== 'style') return undefined
  return {
    fontWeight: entry.operation.bold ? '700' : '400',
    fontStyle: entry.operation.italic ? 'italic' : 'normal',
    textDecoration: entry.operation.underline ? 'underline' : 'none',
    color: entry.operation.fontColor ? `#${entry.operation.fontColor}` : undefined,
    fontSize: entry.operation.fontSizeHalfPoints ? `${entry.operation.fontSizeHalfPoints / 2}pt` : undefined,
  }
}
const selectTextTarget = (target?: DocxTextTarget) => {
  if (!target || isExternal.value) return
  editorOpen.value = true
  editMode.value = 'text'
  selectedTargetId.value = target.id
}
const selectTextBlock = (block: DocxBlock) => selectTextTarget(textTargetForBlock(block.id))
const selectTableCell = (block: DocxBlock, rowIndex: number, columnIndex: number) => {
  selectTextTarget(tableTargetForCell(block.id, rowIndex, columnIndex))
}

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
const pageStyle = (page: DocxPage) => {
  const section = page.section
  const width = section?.pageWidthTwips || 11_906
  const height = section?.pageHeightTwips || 16_838
  const margin = (value: number | null | undefined, fallback: number) => `${((value || fallback) / 1440 * 2.54).toFixed(2)}cm`
  return {
    '--page-ratio': `${width} / ${height}`,
    '--page-max-width': width > height ? '1040px' : '794px',
    '--page-padding-top': margin(section?.marginTopTwips, 1440),
    '--page-padding-right': margin(section?.marginRightTwips, 1440),
    '--page-padding-bottom': margin(section?.marginBottomTwips, 1440),
    '--page-padding-left': margin(section?.marginLeftTwips, 1440),
  }
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
const targetLabel = (target: DocxEditableTarget) => {
  if ('imagePart' in target) return target.name || target.imagePart
  const location = 'carrier' in target && target.carrier === 'hyperlink-label'
    ? '链接文字'
    : target.kind === 'table-cell'
    ? `表格 R${(target.rowIndex || 0) + 1}C${(target.columnIndex || 0) + 1}`
    : ({ paragraph: '段落', heading: '标题', 'list-item': '列表' } as const)[target.kind]
  const summary = target.text.trim().replace(/\s+/g, ' ') || '空文本'
  return `${location} · ${summary.slice(0, 42)}`
}
const resetTargetDraft = () => {
  const target = selectedTarget.value
  if (!target) return
  const entry = draftEntryForTarget(target)
  if ('expectedTextDigest' in target) {
    replacementText.value = entry?.operation.kind === 'text' ? entry.operation.replacementText : target.text
  }
  if ('expectedStyleDigest' in target) {
    draftBold.value = entry?.operation.kind === 'style' ? entry.operation.bold : target.bold
    draftItalic.value = entry?.operation.kind === 'style' ? entry.operation.italic : target.italic
    draftUnderline.value = entry?.operation.kind === 'style' ? entry.operation.underline : target.underline
    draftFontColor.value = (entry?.operation.kind === 'style' ? entry.operation.fontColor : target.fontColor)
      ? `#${entry?.operation.kind === 'style' ? entry.operation.fontColor : target.fontColor}`
      : ''
    draftFontSizeHalfPoints.value = entry?.operation.kind === 'style'
      ? entry.operation.fontSizeHalfPoints
      : target.fontSizeHalfPoints
  }
  if ('expectedMetadataDigest' in target) {
    replacementAltText.value = entry?.operation.kind === 'imageAltText'
      ? entry.operation.replacementAltText
      : target.altText
  }
}
const invalidatePreview = () => {
  previewReport.value = null
  editError.value = ''
  saveError.value = ''
}
const previewEdit = async () => {
  const operations = draftOperations.value
  if (!operations.length || operations.length > 32 || !report.value || previewing.value) return
  previewing.value = true
  invalidatePreview()
  try {
    const base = {
      libraryRoot: store.libraryPath,
      path: docxPath.value,
      expectedSignature: report.value.signature,
    }
    const operation = operations[0]
    if (operations.length > 1) {
      previewReport.value = await invoke<DocxPatchPreviewReport>('preview_docx_patch_batch_isolated_copy', {
        ...base,
        operations,
      })
    } else if (operation.kind === 'text') {
      previewReport.value = await invoke<DocxPatchPreviewReport>('preview_docx_text_patch_isolated_copy', {
        ...base,
        targetId: operation.targetId,
        expectedTextDigest: operation.expectedTextDigest,
        replacementText: operation.replacementText,
      })
    } else if (operation.kind === 'style') {
      previewReport.value = await invoke<DocxPatchPreviewReport>('preview_docx_style_patch_isolated_copy', {
        ...base,
        targetId: operation.targetId,
        expectedStyleDigest: operation.expectedStyleDigest,
        bold: operation.bold,
        italic: operation.italic,
        underline: operation.underline,
        fontColor: operation.fontColor,
        fontSizeHalfPoints: operation.fontSizeHalfPoints,
      })
    } else {
      previewReport.value = await invoke<DocxPatchPreviewReport>('preview_docx_image_alt_text_patch_isolated_copy', {
        ...base,
        targetId: operation.targetId,
        expectedMetadataDigest: operation.expectedMetadataDigest,
        replacementAltText: operation.replacementAltText,
      })
    }
    const isBatch = operations.length > 1
    if (
      previewReport.value.status !== (isBatch ? 'batch_isolated_verified' : 'isolated_verified')
      || !previewReport.value.unchangedPartsVerified
      || !previewReport.value.structuralReparseVerified
      || !previewReport.value.semanticReparseVerified
      || !previewReport.value.sourceUnchanged
      || (isBatch && !previewReport.value.deterministicReplayVerified)
      || (isBatch && !previewReport.value.temporaryCopyReopenVerified)
    ) throw new Error('隔离副本未通过完整保真验证')
  } catch (cause) {
    previewReport.value = null
    editError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    previewing.value = false
  }
}
const saveCopy = async () => {
  const preview = previewReport.value
  const operations = draftOperations.value
  if (!preview || !operations.length || operations.length > 32 || !report.value || !copyFileName.value.trim() || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const base = {
      libraryRoot: store.libraryPath,
      path: docxPath.value,
      targetFileName: copyFileName.value.trim(),
      expectedSignature: report.value.signature,
      expectedOutputDigest: preview.outputDigest,
    }
    const saved = operations.length > 1
      ? await invoke<DocxSavedCopyReport>('save_docx_patch_batch_copy', { ...base, operations })
      : await invoke<DocxSavedCopyReport>('save_docx_patch_copy', { ...base, operation: operations[0] })
    if (
      saved.status !== (operations.length > 1 ? 'batch_saved_verified' : 'saved_verified')
      || !saved.sourceUnchanged
      || !saved.unchangedPartsVerified
      || !saved.structuralReopenVerified
      || !saved.semanticReopenVerified
      || saved.producerEvidence.length !== 3
    ) throw new Error('保存结果未通过完整复读与生产者门禁')
    message.success(`已可靠另存并验证 ${operations.length} 项修改：${copyFileName.value.trim()}`)
    const routeName = route.name === 'LibraryMode' ? 'LibraryMode' : 'DocxEditor'
    allowNextLeave.value = true
    await router.replace({ name: routeName, query: { path: saved.targetPath } })
  } catch (cause) {
    allowNextLeave.value = false
    saveError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    saving.value = false
  }
}
const saveSource = async (): Promise<boolean> => {
  const preview = previewReport.value
  const operations = draftOperations.value
  if (!preview || !operations.length || operations.length > 32 || !report.value || savingSource.value) return false
  savingSource.value = true
  saveError.value = ''
  try {
    const base = {
      libraryRoot: store.libraryPath,
      path: docxPath.value,
      expectedSignature: report.value.signature,
      expectedOutputDigest: preview.outputDigest,
    }
    const saved = operations.length > 1
      ? await invoke<DocxSavedSourceReport>('save_docx_patch_batch_source', { ...base, operations })
      : await invoke<DocxSavedSourceReport>('save_docx_patch_source', { ...base, operation: operations[0] })
    if (
      saved.status !== (operations.length > 1 ? 'batch_source_saved_verified' : 'source_saved_verified')
      || !saved.rollbackProtected
      || !saved.unchangedPartsVerified
      || !saved.structuralReopenVerified
      || !saved.semanticReopenVerified
      || saved.producerEvidence.length !== 3
    ) throw new Error('源文件保存结果未通过完整复读与恢复门禁')
    message.success(`DOCX 已可靠保存 ${operations.length} 项修改并重新读取`)
    await load()
    return true
  } catch (cause) {
    saveError.value = String(cause).replace(/^Error:\s*/, '')
    return false
  } finally {
    savingSource.value = false
  }
}
const confirmSaveSource = () => {
  if (!previewReport.value || savingSource.value) return
  dialog.warning({
    title: '覆盖当前 DOCX？',
    content: '只有确认后才会写入源文件。LongEdit 会再次检查外部修改，使用同目录临时文件可靠替换，并在落盘复读失败时恢复原文件。',
    positiveText: '保存到原文件',
    negativeText: '取消',
    onPositiveClick: () => { void saveSource() },
  })
}
const mayLeave = () => {
  if (allowNextLeave.value) {
    allowNextLeave.value = false
    return true
  }
  if (!draftCount.value) return true
  return new Promise<boolean>(resolve => {
    let dialogRef: ReturnType<typeof dialog.warning> | null = null
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      dialogRef?.destroy()
      resolve(value)
    }
    dialogRef = dialog.warning({
      title: 'DOCX 还有未保存修改',
      content: previewReport.value
        ? '草稿已通过隔离验证。可以保存到原文件后离开、放弃草稿，或继续编辑。'
        : '草稿尚未通过隔离验证。请继续编辑并先验证，或者明确放弃草稿。',
      closable: false,
      maskClosable: false,
      action: () => h('div', { class: 'docx-leave-actions' }, [
        h(NButton, { size: 'small', onClick: () => finish(false) }, { default: () => '继续编辑' }),
        h(NButton, { size: 'small', secondary: true, onClick: () => finish(true) }, { default: () => '放弃并离开' }),
        h(NButton, {
          size: 'small',
          type: 'primary',
          disabled: !previewReport.value || savingSource.value,
          loading: savingSource.value,
          onClick: async () => { if (await saveSource()) finish(true) },
        }, { default: () => previewReport.value ? '保存并离开' : '先验证后保存' }),
      ]),
    })
  })
}
const leaveDocx = () => { if (isExternal.value) void router.push({ name: 'LibraryMode' }); else router.back() }
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (draftCount.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
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
let loadRequestId = 0
const load = async () => {
  const requestedPath = docxPath.value
  const requestedExternal = isExternal.value
  if (!requestedPath) return
  const requestId = ++loadRequestId
  const requestedFileName = requestedPath.split(/[\\/]/).pop() || '未命名.docx'
  const viewState = recallWorkspaceViewState(requestedPath)
  loading.value = true
  loadError.value = ''
  report.value = null
  try {
    const nextReport = await invoke<DocxReadReport>(requestedExternal ? 'read_external_docx_document' : 'read_docx_document', {
      ...(requestedExternal ? {} : { libraryRoot: store.libraryPath }),
      path: requestedPath,
    })
    if (requestId !== loadRequestId) return
    report.value = nextReport
    store.addTab({ id: requestedPath, title: requestedFileName, path: requestedPath, isDirty: false, external: requestedExternal })
    const baseName = requestedFileName.replace(/\.docx$/i, '')
    copyFileName.value = `${baseName}-LongEdit副本.docx`
    const availableMode = report.value.editableTextTargets.length
      ? 'text'
      : report.value.editableStyleTargets.length
        ? 'style'
        : 'imageAltText'
    editMode.value = availableMode
    if (viewState?.mode === 'text' && report.value.editableTextTargets.length) editMode.value = 'text'
    if (viewState?.mode === 'style' && report.value.editableStyleTargets.length) editMode.value = 'style'
    if (viewState?.mode === 'imageAltText' && report.value.editableImageTargets.length) editMode.value = 'imageAltText'
    if (!requestedExternal && typeof viewState?.panelOpen === 'boolean') editorOpen.value = viewState.panelOpen
    if (requestedExternal) editorOpen.value = false
    selectedTargetId.value = (
      editMode.value === 'text'
        ? report.value.editableTextTargets[0]
        : editMode.value === 'style'
          ? report.value.editableStyleTargets[0]
          : report.value.editableImageTargets[0]
    )?.id || ''
    draftEntries.value = new Map()
    clearDraftHistory()
    resetTargetDraft()
    invalidatePreview()
  } catch (cause) {
    if (requestId !== loadRequestId) return
    report.value = null
    loadError.value = String(cause).replace(/^Error:\s*/, '')
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
  if (requestId === loadRequestId && report.value) {
    await nextTick()
    if (routeLocator.value) scrollToRouteLocator()
    else if (viewState) stageRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
  }
}

watch([docxPath, isExternal], (_next, previous) => {
  if (previous?.[0]) rememberDocxViewState(previous[0])
  query.value = ''
  matchIndex.value = -1
  load()
}, { immediate: true })
watch(matches, value => {
  matchIndex.value = value.length ? 0 : -1
})
watch(editMode, () => {
  if (restoringDraftSnapshot) return
  if (!activeTargets.value.some(target => target.id === selectedTargetId.value)) {
    selectedTargetId.value = activeTargets.value[0]?.id || ''
  }
  resetTargetDraft()
  invalidatePreview()
})
watch(selectedTargetId, () => {
  if (restoringDraftSnapshot) return
  resetTargetDraft()
  invalidatePreview()
})
watch(
  [replacementText, replacementAltText, draftBold, draftItalic, draftUnderline, draftFontColor, draftFontSizeHalfPoints],
  syncCurrentDraft,
)
watch(() => [route.query.locator, route.query.locatorToken], scrollToRouteLocator)
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  rememberDocxViewState()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped>
.docx-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; container-type: inline-size; }
.docx-toolbar { min-height: 52px; padding: 7px 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.document-identity, .toolbar-actions, .docx-search, .compatibility-warning, .docx-status > div { display: flex; align-items: center; }
.document-identity { gap: 9px; min-width: 0; }
.toolbar-icon { width: 28px; height: 28px; flex: none; display: grid; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.toolbar-icon:hover { color: var(--primary-color); border-color: var(--primary-color); }
.document-title { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.document-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.document-title span { color: var(--text-muted); font-size: 11px; }
.toolbar-actions { gap: 5px; }
.toolbar-actions button { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.toolbar-actions button:disabled { opacity: .4; cursor: default; }
.toolbar-actions button.active { border-color: var(--primary-color); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--bg-primary)); }
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
.docx-layout { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); }
.docx-layout.editor-open { grid-template-columns: 210px minmax(0, 1fr) 310px; }
.docx-outline { overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.outline-heading { padding: 0 5px 8px; display: flex; justify-content: space-between; }
.outline-heading span, .outline-empty { color: var(--text-muted); font-size: 11px; }
.docx-outline nav { display: flex; flex-direction: column; gap: 2px; }
.docx-outline nav button { padding: 6px 8px; border: 0; border-radius: 5px; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); background: transparent; cursor: pointer; font: inherit; }
.docx-outline nav button:hover { background: var(--hover-bg); color: var(--text-primary); }
.docx-outline nav button span { margin-right: 5px; color: var(--primary-color); font-size: var(--text-compact); }
.compatibility-card { margin-top: 16px; padding: 10px; display: flex; flex-direction: column; gap: 7px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); }
.compatibility-card > span, .compatibility-card small { color: var(--text-muted); font-size: var(--text-compact); line-height: 1.5; }
.metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.metric-grid span { padding: 5px; border-radius: 5px; background: var(--bg-primary); color: var(--text-secondary); font-size: var(--text-compact); }
.metric-grid b { margin-right: 3px; color: var(--text-primary); font-size: 12px; }
.docx-layout-summary { padding-top: 7px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-color); }
.docx-layout-summary strong { font-size: 11px; }
.docx-layout-summary span { color: var(--text-muted); font-size: var(--text-compact); line-height: 1.45; }
.docx-stage { overflow: auto; padding: 28px 24px 48px; display: flex; flex-direction: column; align-items: center; gap: 28px; background: color-mix(in srgb, var(--bg-secondary) 88%, #7f8da3); }
.docx-page { position: relative; width: min(var(--page-max-width, 794px), calc(100% - 24px)); min-height: 720px; aspect-ratio: var(--page-ratio, 0.707); padding: var(--page-padding-top, 2.54cm) var(--page-padding-right, 2.54cm) var(--page-padding-bottom, 2.54cm) var(--page-padding-left, 2.54cm); box-sizing: border-box; border: 1px solid var(--border-color); box-shadow: 0 8px 26px rgba(0,0,0,.15); background: var(--bg-primary); }
.page-number { position: absolute; right: 12px; bottom: 8px; color: var(--text-muted); font-size: var(--text-compact); user-select: none; }
.docx-block { scroll-margin: 90px; border-radius: 4px; transition: background .15s ease; }
.docx-block.search-hit { background: color-mix(in srgb, #f0bd3e 23%, transparent); }
.docx-block.editable, .docx-table-wrap td.editable { cursor: text; }
.docx-block.editable:hover, .docx-table-wrap td.editable:hover { outline: 1px solid color-mix(in srgb, var(--primary-color) 55%, transparent); background: color-mix(in srgb, var(--primary-color) 7%, var(--bg-primary)); }
.docx-block.edit-selected, .docx-table-wrap td.edit-selected { outline: 2px solid var(--primary-color); outline-offset: 2px; background: color-mix(in srgb, var(--primary-color) 9%, var(--bg-primary)); }
.docx-block.has-draft, .docx-table-wrap td.has-draft { box-shadow: inset 3px 0 color-mix(in srgb, #d49a28 78%, var(--primary-color)); background: color-mix(in srgb, #d49a28 8%, var(--bg-primary)); }
.docx-block.editable-hyperlink, .docx-table-wrap td.editable-hyperlink { text-decoration: underline; text-decoration-style: dotted; text-decoration-color: color-mix(in srgb, var(--primary-color) 75%, transparent); text-underline-offset: 3px; }
.docx-heading { margin: 1.3em 0 .55em; line-height: 1.3; }
h1.docx-heading { font-size: 25px; } h2.docx-heading { font-size: 21px; } h3.docx-heading { font-size: 18px; }
h4.docx-heading, h5.docx-heading, h6.docx-heading { font-size: 15px; }
.docx-paragraph { margin: .55em 0; line-height: 1.75; white-space: pre-wrap; }
.docx-paragraph p { margin: 0; }
.inline-image-note { margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: var(--text-compact); }
.docx-list-item { margin: .38em 0; display: flex; gap: 8px; line-height: 1.65; }
.docx-list-item > span { color: var(--primary-color); }
.docx-list-item p { margin: 0; }
.docx-table-wrap { margin: 14px 0; overflow: auto; }
.docx-table-wrap table { width: 100%; border-collapse: collapse; }
.docx-table-wrap td { min-width: 80px; padding: 7px 9px; border: 1px solid var(--border-color); vertical-align: top; }
.docx-page-break { height: 32px; margin: 20px 0; display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: var(--text-compact); }
.docx-page-break::before, .docx-page-break::after { content: ''; flex: 1; border-top: 1px dashed var(--border-color); }
.docx-page-break.rendered { opacity: .68; }
.docx-image-placeholder { min-height: 100px; margin: 14px 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; border: 1px dashed var(--border-color); color: var(--text-muted); background: var(--bg-secondary); }
.docx-image-placeholder img, .inline-images img { display: block; max-width: 100%; max-height: 520px; object-fit: contain; }
.inline-images { margin: 10px 0; display: grid; gap: 8px; justify-items: start; }
.related-links, .related-anchors { display: flex; flex-wrap: wrap; gap: 5px; }
.related-links { margin: 4px 0 10px; }
.related-links button, .related-anchors button { min-height: 24px; padding: 3px 7px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; font: inherit; font-size: var(--text-compact); }
.related-links button:hover, .related-anchors button:hover { border-color: var(--primary-color); color: var(--primary-color); }
.docx-related-content { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border-color); }
.docx-related-content > header { margin-bottom: 16px; }
.docx-related-content h2 { margin: 0 0 4px; font-size: 17px; }
.docx-related-content > header span, .related-item-heading span { color: var(--text-muted); font-size: var(--text-compact); }
.related-item { scroll-margin: 90px; padding: 11px 0; border-bottom: 1px solid var(--border-color); }
.related-item-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.related-item-heading strong { font-size: 12px; }
.related-item p { margin: 6px 0; line-height: 1.65; white-space: pre-wrap; }
.empty-document { padding: 80px 20px; text-align: center; color: var(--text-muted); }
.docx-editor { min-width: 0; overflow: auto; padding: 14px; border-left: 1px solid var(--border-color); background: var(--bg-primary); }
.docx-editor > header { margin-bottom: 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.docx-editor > header div { display: flex; flex-direction: column; gap: 2px; }
.docx-editor > header strong { font-size: 13px; }
.docx-editor > header span { color: var(--text-muted); font-size: var(--text-compact); }
.docx-editor > header button { width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 5px; color: var(--text-secondary); background: transparent; cursor: pointer; }
.docx-editor > header button:hover { background: var(--hover-bg); }
.edit-mode-tabs { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; }
.edit-mode-tabs button { min-height: 30px; border: 0; border-right: 1px solid var(--border-color); color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; font: inherit; font-size: 11px; }
.edit-mode-tabs button:last-child { border-right: 0; }
.edit-mode-tabs button.active { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--bg-primary)); }
.edit-mode-tabs button:disabled { opacity: .4; cursor: default; }
.edit-field { margin-top: 13px; display: flex; flex-direction: column; gap: 6px; }
.edit-field > span { color: var(--text-secondary); font-size: 11px; font-weight: 600; }
.edit-field select, .edit-field textarea, .edit-field input { width: 100%; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 6px; outline: 0; color: var(--text-primary); background: var(--bg-secondary); font: inherit; }
.edit-field select, .edit-field input { height: 32px; padding: 0 8px; }
.edit-field textarea { min-height: 92px; padding: 8px; resize: vertical; line-height: 1.55; }
.edit-field select:focus, .edit-field textarea:focus, .edit-field input:focus { border-color: var(--primary-color); }
.style-controls { display: flex; gap: 5px; }
.style-controls button { width: 32px; height: 30px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.style-controls button.active { border-color: var(--primary-color); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--bg-primary)); }
.advanced-style-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.advanced-style-controls label { min-width: 0; display: flex; align-items: center; gap: 5px; color: var(--text-secondary); font-size: 11px; }
.advanced-style-controls input[type="color"] { width: 30px; height: 28px; padding: 2px; flex: none; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-secondary); cursor: pointer; }
.advanced-style-controls button { height: 28px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; font: inherit; font-size: var(--text-compact); }
.advanced-style-controls button:disabled { opacity: .4; cursor: default; }
.advanced-style-controls select { min-width: 0; height: 28px; flex: 1; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-primary); background: var(--bg-secondary); font: inherit; font-size: 11px; }
.draft-list { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color); }
.draft-list > header { display: flex; align-items: center; justify-content: space-between; }
.draft-list > header strong { font-size: 12px; }
.draft-list > header span { min-width: 40px; text-align: right; color: var(--primary-color); font-size: 11px; font-variant-numeric: tabular-nums; }
.draft-list > header span.error, .draft-limit { color: var(--error-color); }
.draft-list > p { margin: 8px 0 0; color: var(--text-muted); font-size: var(--text-compact); line-height: 1.5; }
.draft-list article { min-width: 0; margin-top: 6px; display: flex; align-items: stretch; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-secondary); }
.draft-list button { border: 0; color: var(--text-secondary); background: transparent; cursor: pointer; }
.draft-locate { min-width: 0; flex: 1; padding: 7px 8px; display: flex; align-items: center; gap: 7px; text-align: left; }
.draft-locate > span { min-width: 0; display: flex; flex-direction: column; gap: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }
.draft-locate b { color: var(--primary-color); font-size: var(--text-compact); }
.draft-remove { width: 30px; flex: none; display: grid; place-items: center; border-left: 1px solid var(--border-color) !important; }
.draft-list button:hover { color: var(--primary-color); background: var(--hover-bg); }
.verify-edit, .copy-save > button { width: 100%; min-height: 34px; margin-top: 14px; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--primary-color); border-radius: 6px; color: #fff; background: var(--primary-color); cursor: pointer; font: inherit; font-weight: 600; }
.verify-edit:disabled, .copy-save > button:disabled { opacity: .45; cursor: default; }
.edit-verification { margin-top: 12px; padding: 9px; display: flex; flex-direction: column; gap: 4px; border-left: 3px solid #2c9b68; background: color-mix(in srgb, #2c9b68 8%, var(--bg-primary)); }
.edit-verification.error { border-color: var(--error-color); background: color-mix(in srgb, var(--error-color) 7%, var(--bg-primary)); }
.edit-verification strong { font-size: 11px; }
.edit-verification span, .edit-verification small, .copy-save > small { color: var(--text-muted); font-size: var(--text-compact); line-height: 1.5; }
.copy-save { margin-top: 12px; padding-top: 1px; border-top: 1px solid var(--border-color); }
.save-boundary { margin: 7px 0 2px; color: var(--text-muted); font-size: var(--text-compact); line-height: 1.5; }
.copy-save > small { display: block; margin-top: 7px; color: var(--error-color); }
.docx-status { min-height: 28px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-muted); font-size: var(--text-compact); }
.docx-status > div { gap: 10px; }
@media (max-width: 820px) {
  .docx-layout { grid-template-columns: 180px minmax(0, 1fr); }
  .docx-layout.editor-open { grid-template-columns: minmax(0, 1fr) 280px; }
  .docx-layout.editor-open .docx-outline { display: none; }
  .docx-page { --page-padding-top: 42px !important; --page-padding-right: 36px !important; --page-padding-bottom: 42px !important; --page-padding-left: 36px !important; min-height: 780px; }
  .docx-search input { width: 105px; }
}
@media (min-width: 821px) and (max-width: 1180px) {
  .docx-layout.editor-open { grid-template-columns: minmax(0, 1fr) 300px; }
  .docx-layout.editor-open .docx-outline { display: none; }
}
@container (max-width: 1180px) {
  .docx-layout.editor-open { grid-template-columns: minmax(0, 1fr) 300px; }
  .docx-layout.editor-open .docx-outline { display: none; }
}
@container (max-width: 820px) {
  .docx-layout { grid-template-columns: 180px minmax(0, 1fr); }
  .docx-layout.editor-open { grid-template-columns: minmax(0, 1fr) 280px; }
  .docx-layout.editor-open .docx-outline { display: none; }
  .docx-page { --page-padding-top: 42px !important; --page-padding-right: 36px !important; --page-padding-bottom: 42px !important; --page-padding-left: 36px !important; min-height: 780px; }
  .docx-search input { width: 105px; }
}
@container (max-width: 680px) {
  .docx-toolbar { flex-wrap: wrap; }
  .document-identity { flex: 1 1 100%; }
  .document-title span { display: none; }
  .toolbar-actions { width: 100%; justify-content: flex-end; }
  .docx-layout, .docx-layout.editor-open { grid-template-columns: minmax(0, 1fr); }
  .docx-outline, .docx-layout.editor-open .docx-outline { display: none; }
  .docx-editor { position: absolute; inset: 0 0 0 auto; z-index: 6; width: min(310px, 88%); box-shadow: -8px 0 24px rgba(0,0,0,.16); }
}
</style>
