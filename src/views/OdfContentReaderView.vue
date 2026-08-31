<template>
  <section class="odf-workspace" data-testid="e1c-odf-workspace">
    <WorkspaceTabs v-if="isExternal && !store.isZen && store.tabs.length" />
    <header>
      <div class="identity">
        <button v-if="isExternal" class="identity-back" title="返回资料库" @click="router.push({ name: 'LibraryMode' })"><ArrowLeft :size="15" /></button>
        <component :is="isOds ? Table2 : Presentation" :size="18" aria-hidden="true" />
        <div>
          <strong>{{ fileName }}</strong>
          <span><template v-if="isExternal">外部文件 · </template>{{ isOds ? 'OpenDocument Spreadsheet' : 'OpenDocument Presentation' }} · {{ workspaceCapabilityLabel }}<template v-if="isExternal"> · 不会写回</template></span>
        </div>
      </div>
      <div class="toolbar">
        <button v-if="workspaceEditable" :disabled="!canUndo" :aria-label="undoLabel" :title="`${undoLabel} Ctrl+Z`" @click="undoDraft"><Undo2 :size="15" /></button>
        <button v-if="workspaceEditable" :disabled="!canRedo" :aria-label="redoLabel" :title="`${redoLabel} Ctrl+Y`" @click="redoDraft"><Redo2 :size="15" /></button>
        <button v-if="workspaceEditable" :disabled="!draftDirty || saving" :aria-label="saveLabel" :title="`${saveLabel} Ctrl+S`" @click="saveCopy"><Save :size="15" /></button>
        <label class="search-box">
          <Search :size="14" aria-hidden="true" />
          <input v-model="query" data-testid="e1c-odf-search" type="search" :placeholder="isOds ? '搜索单元格' : '搜索幻灯片'" />
          <span>{{ matches.length ? `${matchIndex + 1}/${matches.length}` : '0' }}</span>
        </label>
        <button :disabled="!matches.length" title="上一个匹配" @click="moveMatch(-1)"><ChevronUp :size="15" /></button>
        <button :disabled="!matches.length" title="下一个匹配" @click="moveMatch(1)"><ChevronDown :size="15" /></button>
        <button :disabled="loading" aria-label="重新读取 ODF" title="重新读取" @click="reloadDocument"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
      </div>
    </header>

    <div v-if="loading && !report" class="state">
      <RefreshCw :size="18" class="spinning" /><span>正在验证并解析 {{ extension.toUpperCase() }}</span>
    </div>
    <div v-else-if="loadError" class="state error">
      <ShieldAlert :size="20" /><div><strong>无法打开文档</strong><p>{{ loadError }}</p></div>
    </div>
    <template v-else-if="report">
      <div v-if="warnings.length" class="risk-banner">
        <ShieldAlert :size="16" />
        <div><strong>文档包含只读或隔离内容</strong><span>{{ warnings.join('；') }}</span></div>
      </div>
      <div v-if="editAvailable" class="edit-banner" data-testid="m1cb-ods-edit-banner">
        <PencilLine :size="15" />
        <span><strong>值与已有样式</strong> 单击选择样式，双击编辑值；公式、合并及复杂内容保持只读。</span>
        <div v-if="styleDraft && namedCellStyles.length" class="style-controls" data-testid="m1cd-ods-style-controls">
          <span>{{ styleDraft.sheetName }} {{ styleDraft.address }}</span>
          <span class="style-swatch" :style="selectedStylePreview" aria-hidden="true"></span>
          <select :value="styleDraft.styleName" aria-label="选择已有单元格样式" @change="updateStyleDraft">
            <option v-for="style in namedCellStyles" :key="style.name" :value="style.name">{{ style.label }}</option>
          </select>
        </div>
        <span v-if="draft || styleDraft" class="draft-status">{{ activeDraftLabel }}{{ draftDirty ? ' · 有未保存修改' : ' · 未修改' }}</span>
      </div>
      <div v-if="odpEditAvailable" class="edit-banner" data-testid="m5-3-odp-edit-banner">
        <PencilLine :size="15" />
        <span><strong>简单正文可靠副本</strong> 仅可选择未含复杂对象的正文段落；源文件、备注、版式、媒体和动画不会写回。</span>
        <span v-if="odpDraft" class="draft-status">第 {{ odpDraft.slideIndex }} 张 · 正文 {{ odpDraft.paragraphIndex }}{{ draftDirty ? ' · 有未保存修改' : ' · 未修改' }}</span>
      </div>

      <div v-if="isOds" class="ods-layout">
        <nav class="sheet-tabs" aria-label="工作表" data-horizontal-wheel="always">
          <button
            v-for="sheet in report.model.sheets"
            :key="sheet.id"
            :class="{ active: selectedSheetId === sheet.id }"
            @click="selectedSheetId = sheet.id"
          >{{ sheet.name }}</button>
        </nav>
        <main ref="sheetStageRef" class="sheet-stage" data-testid="e1c-ods-stage" @scroll="rememberOdfViewState()">
          <table v-if="selectedSheet">
            <thead><tr><th class="corner"></th><th v-for="column in sheetColumnCount" :key="column">{{ columnName(column) }}</th></tr></thead>
            <tbody>
              <tr v-for="row in selectedSheet.rows" :key="row.row">
                <th>{{ row.row }}</th>
                <td
                  v-for="column in sheetColumnCount"
                  :id="`${selectedSheet.id}:${columnName(column)}${row.row}`"
                  :key="column"
                  :class="odsCellClasses(`${selectedSheet.id}:${columnName(column)}${row.row}`, `${columnName(column)}${row.row}`)"
                  :style="odsCellStyle(`${columnName(column)}${row.row}`)"
                  @click="beginStyleEdit(`${columnName(column)}${row.row}`)"
                  @dblclick="beginCellEdit(`${columnName(column)}${row.row}`)"
                >
                  <template v-if="cellAt(row, column)">
                    <input
                      v-if="draft?.sheetName === selectedSheet.name && draft.address === `${columnName(column)}${row.row}`"
                      ref="cellEditorRef"
                      class="cell-editor"
                      data-testid="m1cb-ods-cell-editor"
                      :inputmode="draft.valueType === 'float' ? 'decimal' : 'text'"
                      :value="draft.value"
                      @click.stop
                      @input="updateDraft"
                      @keydown.enter.prevent="saveCopy"
                      @keydown.esc.prevent="resetDraft"
                    />
                    <span v-else>{{ cellAt(row, column)?.text }}</span>
                    <code v-if="cellAt(row, column)?.formula" :title="cellAt(row, column)?.formula">fx</code>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">工作簿没有可显示的非空单元格。</div>
        </main>
      </div>

      <div v-else class="odp-layout">
        <aside>
          <button
            v-for="slide in report.model.slides"
            :key="slide.id"
            :class="{ active: selectedSlideId === slide.id }"
            @click="selectSlide(slide.id)"
          >
            <span>{{ slide.index }}</span>
            <strong>{{ slide.name }}</strong>
            <small>{{ slide.text.split('\n')[0] || '空白幻灯片' }}</small>
          </button>
        </aside>
        <main class="slide-stage" data-testid="e1c-odp-stage">
          <article
            v-if="selectedSlide"
            :id="selectedSlide.id"
            class="slide"
            :class="cellClasses(selectedSlide.id)"
          >
            <div class="slide-number">{{ selectedSlide.index }}</div>
            <p v-for="(paragraph, index) in selectedSlide.text.split('\n').filter(Boolean)" :key="index" :class="{ title: index === 0 }">{{ paragraph }}</p>
            <div v-if="selectedSlide.imageCount" class="media-note"><Image :size="15" />{{ selectedSlide.imageCount }} 个内部图片引用</div>
            <section v-if="selectedSlide.notes"><strong>演讲者备注</strong><p>{{ selectedSlide.notes }}</p></section>
            <div v-if="!selectedSlide.text && !selectedSlide.notes" class="empty">此幻灯片没有可提取文本。</div>
          </article>
          <section v-if="!isExternal && selectedSlide" class="odp-edit-panel" data-testid="m5-3-odp-edit-panel">
            <template v-if="selectedBlockedSlide">
              <div class="odp-blocked" data-testid="m5-3-odp-blocked-slide">
                <ShieldAlert :size="16" />
                <div><strong>此页整体保持只读</strong><p>{{ blockedSlideExplanation }}</p></div>
              </div>
            </template>
            <template v-else-if="selectedOdpTargets.length">
              <header><strong>可另存的简单正文</strong><span>{{ selectedOdpTargets.length }} 段</span></header>
              <div class="odp-target-list" role="list" aria-label="可编辑正文段落">
                <button
                  v-for="target in selectedOdpTargets"
                  :key="target.id"
                  type="button"
                  :class="{ active: odpDraft?.id === target.id }"
                  :data-target-id="target.id"
                  @click="beginOdpTextEdit(target)"
                >
                  <span>正文 {{ target.paragraphIndex }}</span><strong>{{ target.text }}</strong>
                </button>
              </div>
              <label v-if="odpDraft" class="odp-text-editor">
                <span>副本中的新正文</span>
                <textarea
                  data-testid="m5-3-odp-text-editor"
                  maxlength="16384"
                  :value="odpDraft.value"
                  @input="updateOdpDraft"
                  @keydown.esc.prevent="resetDraft"
                ></textarea>
              </label>
              <p class="odp-copy-boundary">保存时只创建同目录新 ODP；已有文件和源文件都不会覆盖。</p>
            </template>
            <div v-else class="odp-blocked">
              <ShieldAlert :size="16" /><div><strong>没有可安全编辑的正文</strong><p>{{ odpInventoryExplanation }}</p></div>
            </div>
          </section>
        </main>
      </div>

      <footer>
        <div>
          <span>{{ formatBytes(report.size) }}</span>
          <span>{{ isOds ? `${report.model.sheets.length} 个工作表` : `${report.model.slides.length} 张幻灯片` }}</span>
          <span v-if="isOds">{{ report.model.formulaCount }} 个公式（仅显示缓存值）</span>
        </div>
        <span>ODF {{ report.model.package.manifestVersion || '1.x' }} · {{ draftDirty ? '修改仅在草稿中' : '源文件未修改' }}</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  ArrowLeft, ChevronDown, ChevronUp, Image, PencilLine, Presentation, Redo2, RefreshCw, Save, Search,
  ShieldAlert, Table2, Undo2,
} from 'lucide-vue-next'
import { useDialog, useMessage } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { useAppStore } from '../store/app'
import { confirmAppAction, promptAppAction } from '../services/appDialog'
import { openManagedFile } from '../services/fileNavigation'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'

interface OdsCell { address: string; column: number; text: string; valueType?: string; formula?: string }
interface OdsRow { row: number; cells: OdsCell[] }
interface OdsSheet { id: string; name: string; rows: OdsRow[]; formulaCount: number }
interface OdpSlide { id: string; index: number; name: string; text: string; notes: string; imageCount: number }
interface OdsEditableCellTarget {
  id: string; sheetName: string; address: string; text: string; valueType: 'string' | 'float'; expectedValueDigest: string
  currentStyleName: string; expectedStyleDigest: string
}
interface OdsNamedCellStyle {
  name: string; label: string; parentStyleName?: string; backgroundColor?: string; textColor?: string; bold: boolean; italic: boolean
}
interface OdsBlockedCellTarget { sheetName: string; address: string; text: string; reason: string }
interface OdsCellEditInventory {
  status: 'candidate' | 'blocked'
  sourceDigest: string
  editableCells: OdsEditableCellTarget[]
  blockedCells: OdsBlockedCellTarget[]
  namedCellStyles: OdsNamedCellStyle[]
  blockers: string[]
  writesUserFile: boolean
}
interface OdsSavedCopyReport { status: string; targetPath: string; targetDigest: string; sourceUnchanged: boolean; semanticReopenVerified: boolean; saveMode: string }
interface OdsDraft extends OdsEditableCellTarget { originalValue: string; value: string }
interface OdsStyleDraft extends OdsEditableCellTarget { originalStyleName: string; styleName: string }
interface OdpEditableTextTarget {
  id: string; slideIndex: number; slideName: string; paragraphIndex: number; text: string; expectedTextDigest: string
}
interface OdpBlockedSlide { slideIndex: number; slideName: string; reasons: string[] }
interface OdpSlideTextEditInventory {
  status: 'candidate' | 'blocked'; sourceDigest: string; editableTargets: OdpEditableTextTarget[]
  blockedSlides: OdpBlockedSlide[]; blockers: string[]; writesUserFile: boolean
}
interface OdpDraft extends OdpEditableTextTarget { originalValue: string; value: string }
interface OdpSavedCopyReport {
  status: string; targetPath: string; targetDigest: string; sourceUnchanged: boolean; unchangedPartsVerified: boolean
  structuralReopenVerified: boolean; semanticReopenVerified: boolean; changedParts: string[]; saveMode: string
}
interface OdfContentReport {
  path: string
  size: number
  signature: string
  readOnly: boolean
  sourcePreserved: boolean
  editInventory?: OdsCellEditInventory
  odpEditInventory?: OdpSlideTextEditInventory
  model: {
    format: 'ods' | 'odp'
    sheets: OdsSheet[]
    slides: OdpSlide[]
    formulaCount: number
    warnings: string[]
    package: {
      manifestVersion?: string
      entryCount: number
      risks: {
        riskCodes: string[]
        externalLinkCount: number
        embeddedObjectCount: number
        scriptMarkerCount: number
        signaturePartCount: number
      }
    }
  }
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const report = ref<OdfContentReport>()
const loading = ref(false)
const loadError = ref('')
const query = ref('')
const matchIndex = ref(-1)
const selectedSheetId = ref('')
const selectedSlideId = ref('')
const sheetStageRef = ref<HTMLElement | null>(null)
const cellEditorRef = ref<HTMLInputElement[] | null>(null)
const draft = ref<OdsDraft>()
const styleDraft = ref<OdsStyleDraft>()
const odpDraft = ref<OdpDraft>()
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const saving = ref(false)
const documentPath = computed(() => String(route.query.path || store.activeTabId || ''))
const isExternal = computed(() => route.query.external === '1')
const extension = computed(() => /\.odp$/i.test(documentPath.value) ? 'odp' : 'ods')
const isOds = computed(() => report.value?.model.format !== 'odp')
const fileName = computed(() => documentPath.value.split(/[\\/]/).pop() || `未命名.${extension.value}`)
const selectedSheet = computed(() => report.value?.model.sheets.find(sheet => sheet.id === selectedSheetId.value))
const selectedSlide = computed(() => report.value?.model.slides.find(slide => slide.id === selectedSlideId.value))
const editAvailable = computed(() => !isExternal.value && isOds.value && report.value?.editInventory?.status === 'candidate')
const odpEditAvailable = computed(() => !isExternal.value && !isOds.value && report.value?.odpEditInventory?.status === 'candidate')
const workspaceEditable = computed(() => editAvailable.value || odpEditAvailable.value)
const draftDirty = computed(() => (!!draft.value && draft.value.value !== draft.value.originalValue)
  || (!!styleDraft.value && styleDraft.value.styleName !== styleDraft.value.originalStyleName)
  || (!!odpDraft.value && odpDraft.value.value !== odpDraft.value.originalValue))
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
const editableTargetMap = computed(() => new Map(
  (report.value?.editInventory?.editableCells || []).map(target => [`${target.sheetName}:${target.address}`, target]),
))
const namedCellStyles = computed(() => report.value?.editInventory?.namedCellStyles || [])
const selectedOdpTargets = computed(() => (report.value?.odpEditInventory?.editableTargets || [])
  .filter(target => target.slideIndex === selectedSlide.value?.index))
const selectedBlockedSlide = computed(() => report.value?.odpEditInventory?.blockedSlides
  .find(slide => slide.slideIndex === selectedSlide.value?.index))
const blockedSlideExplanation = computed(() => {
  const reasons = selectedBlockedSlide.value?.reasons || []
  if (reasons.some(reason => reason === 'complex-object:custom-shape')) {
    return '检测到自定义形状及其未验证内部结构；为避免部分修改破坏页面语义，本页全部正文保持只读。'
  }
  return [...new Set(reasons.map(reason => odpBlockerLabel(reason)))].join('；')
})
const odpInventoryExplanation = computed(() => {
  const blockers = report.value?.odpEditInventory?.blockers || []
  return blockers.length ? blockers.join('；') : '当前页没有满足直接文本框、单段简单正文边界的目标。'
})
const selectedStyle = computed(() => namedCellStyles.value.find(style => style.name === styleDraft.value?.styleName))
const selectedStylePreview = computed(() => ({
  backgroundColor: selectedStyle.value?.backgroundColor || 'var(--bg-primary)',
  color: selectedStyle.value?.textColor || 'var(--text-primary)',
  fontWeight: selectedStyle.value?.bold ? '700' : '400',
  fontStyle: selectedStyle.value?.italic ? 'italic' : 'normal',
}))
const activeDraftLabel = computed(() => draft.value
  ? `${draft.value.sheetName} · ${draft.value.address} · 值`
  : styleDraft.value ? `${styleDraft.value.sheetName} · ${styleDraft.value.address} · 样式` : '')
const workspaceCapabilityLabel = computed(() => isOds.value
  ? (editAvailable.value ? '基础单元格编辑 · 另存副本' : '只读')
  : (odpEditAvailable.value ? '简单正文编辑 · 可靠另存副本' : '只读'))
const undoLabel = computed(() => isOds.value ? '撤销单元格修改' : '撤销正文修改')
const redoLabel = computed(() => isOds.value ? '重做单元格修改' : '重做正文修改')
const saveLabel = computed(() => isOds.value ? '另存 ODS 副本' : '可靠另存 ODP 副本')
const sheetColumnCount = computed(() => Math.min(256, Math.max(1, ...(selectedSheet.value?.rows.flatMap(row => row.cells.map(cell => cell.column)) || [1]))))
const routeLocator = computed(() => typeof route.query.locator === 'string' ? route.query.locator : '')
const warnings = computed(() => {
  if (!report.value) return []
  const risks = report.value.model.package.risks
  return [
    ...report.value.model.warnings,
    ...(risks.externalLinkCount ? [`${risks.externalLinkCount} 个外部链接未跟随`] : []),
    ...(risks.embeddedObjectCount ? [`${risks.embeddedObjectCount} 个嵌入对象未执行`] : []),
    ...(risks.scriptMarkerCount ? [`${risks.scriptMarkerCount} 个脚本标记未执行`] : []),
    ...(risks.signaturePartCount ? ['文档签名仅识别、未验证'] : []),
  ]
})
const matches = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle || !report.value) return []
  if (isOds.value) {
    return report.value.model.sheets.flatMap(sheet => sheet.rows.flatMap(row => row.cells
      .filter(cell => cell.text.toLocaleLowerCase().includes(needle))
      .map(cell => ({ id: `${sheet.id}:${cell.address}`, parent: sheet.id }))))
  }
  return report.value.model.slides
    .filter(slide => `${slide.text}\n${slide.notes}`.toLocaleLowerCase().includes(needle))
    .map(slide => ({ id: slide.id, parent: slide.id }))
})
const matchIds = computed(() => new Set(matches.value.map(match => match.id)))
const currentMatchId = computed(() => matches.value[matchIndex.value]?.id || '')
const cellClasses = (id: string) => ({
  'search-hit': matchIds.value.has(id),
  'current-hit': currentMatchId.value === id,
  'route-target': routeLocator.value === id,
})
const odsCellClasses = (id: string, address: string) => ({
  ...cellClasses(id),
  editable: !!selectedSheet.value && editableTargetMap.value.has(`${selectedSheet.value.name}:${address}`),
  editing: draft.value?.sheetName === selectedSheet.value?.name && draft.value?.address === address,
  'style-selected': styleDraft.value?.sheetName === selectedSheet.value?.name && styleDraft.value?.address === address,
})
const odsCellStyle = (address: string) => {
  if (!selectedSheet.value) return undefined
  const target = editableTargetMap.value.get(`${selectedSheet.value.name}:${address}`)
  if (!target) return undefined
  const styleName = styleDraft.value?.id === target.id ? styleDraft.value.styleName : target.currentStyleName
  const style = namedCellStyles.value.find(candidate => candidate.name === styleName)
  if (!style) return undefined
  return {
    backgroundColor: style.backgroundColor || undefined,
    color: style.textColor || undefined,
    fontWeight: style.bold ? '700' : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
  }
}
const cellAt = (row: OdsRow, column: number) => row.cells.find(cell => cell.column === column)
const columnName = (column: number) => {
  let value = column
  let name = ''
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }
  return name
}
const formatBytes = (value: number) => value < 1024 * 1024
  ? `${(value / 1024).toFixed(1)} KiB`
  : `${(value / 1024 / 1024).toFixed(1)} MiB`
function odpBlockerLabel(reason: string) {
  if (reason.startsWith('complex-object:')) return `检测到复杂对象（${reason.slice('complex-object:'.length)}）`
  if (reason === 'list-structure') return '包含列表结构'
  if (reason === 'field-structure') return '包含动态字段'
  if (reason === 'rich-text-structure') return '包含多段或富文本结构'
  if (reason === 'animation-structure') return '包含动画结构'
  if (reason.startsWith('non-direct-structure:')) return '包含非直接正文结构'
  return `包含未验证结构（${reason}）`
}
const markTabDirty = (dirty: boolean) => {
  const tab = store.tabs.find(item => item.path === documentPath.value)
  if (tab) tab.isDirty = dirty
}
const clearDraft = () => {
  draft.value = undefined
  styleDraft.value = undefined
  odpDraft.value = undefined
  undoStack.value = []
  redoStack.value = []
  markTabDirty(false)
}
const resetDraft = () => {
  if (draft.value) draft.value.value = draft.value.originalValue
  if (styleDraft.value) styleDraft.value.styleName = styleDraft.value.originalStyleName
  if (odpDraft.value) odpDraft.value.value = odpDraft.value.originalValue
  undoStack.value = []
  redoStack.value = []
  markTabDirty(false)
}
const beginCellEdit = async (address: string) => {
  if (!editAvailable.value || !selectedSheet.value) return
  const target = editableTargetMap.value.get(`${selectedSheet.value.name}:${address}`)
  if (!target) {
    const blocked = report.value?.editInventory?.blockedCells.find(cell => cell.sheetName === selectedSheet.value?.name && cell.address === address)
    if (blocked) message.info(blocked.reason === 'formula-readonly' ? '公式单元格当前保持只读' : '该单元格包含复杂结构，当前保持只读')
    return
  }
  if (draft.value?.id === target.id) {
    await nextTick()
    cellEditorRef.value?.[0]?.focus()
    return
  }
  if (draftDirty.value && (draft.value?.id !== target.id || !!styleDraft.value)) {
    message.warning('当前单元格还有未保存修改，请先另存副本或撤销修改')
    return
  }
  styleDraft.value = undefined
  draft.value = { ...target, originalValue: target.text, value: target.text }
  undoStack.value = []
  redoStack.value = []
  await nextTick()
  cellEditorRef.value?.[0]?.focus()
  cellEditorRef.value?.[0]?.select()
}
const beginStyleEdit = (address: string) => {
  if (!editAvailable.value || !selectedSheet.value || namedCellStyles.value.length < 2) return
  const target = editableTargetMap.value.get(`${selectedSheet.value.name}:${address}`)
  if (!target) return
  if (styleDraft.value?.id === target.id) return
  if (draftDirty.value && (styleDraft.value?.id !== target.id || !!draft.value)) {
    message.warning('当前单元格还有未保存修改，请先另存副本或撤销修改')
    return
  }
  draft.value = undefined
  styleDraft.value = {
    ...target,
    originalStyleName: target.currentStyleName || 'Default',
    styleName: target.currentStyleName || 'Default',
  }
  undoStack.value = []
  redoStack.value = []
  markTabDirty(false)
}
const updateDraft = (event: Event) => {
  if (!draft.value) return
  const next = (event.target as HTMLInputElement).value
  if (next === draft.value.value) return
  undoStack.value.push(draft.value.value)
  draft.value.value = next
  redoStack.value = []
  markTabDirty(draftDirty.value)
}
const updateStyleDraft = (event: Event) => {
  if (!styleDraft.value) return
  const next = (event.target as HTMLSelectElement).value
  if (next === styleDraft.value.styleName) return
  undoStack.value.push(styleDraft.value.styleName)
  styleDraft.value.styleName = next
  redoStack.value = []
  markTabDirty(draftDirty.value)
}
const beginOdpTextEdit = (target: OdpEditableTextTarget) => {
  if (!odpEditAvailable.value) return
  if (odpDraft.value?.id === target.id) return
  if (draftDirty.value) {
    message.warning('当前正文还有未保存修改，请先另存副本或撤销修改')
    return
  }
  draft.value = undefined
  styleDraft.value = undefined
  odpDraft.value = { ...target, originalValue: target.text, value: target.text }
  undoStack.value = []
  redoStack.value = []
  markTabDirty(false)
}
const updateOdpDraft = (event: Event) => {
  if (!odpDraft.value) return
  const next = (event.target as HTMLTextAreaElement).value
  if (next === odpDraft.value.value) return
  undoStack.value.push(odpDraft.value.value)
  odpDraft.value.value = next
  redoStack.value = []
  markTabDirty(draftDirty.value)
}
const undoDraft = () => {
  if (!undoStack.value.length) return
  if (draft.value) {
    redoStack.value.push(draft.value.value)
    draft.value.value = undoStack.value.pop()!
  } else if (styleDraft.value) {
    redoStack.value.push(styleDraft.value.styleName)
    styleDraft.value.styleName = undoStack.value.pop()!
  } else if (odpDraft.value) {
    redoStack.value.push(odpDraft.value.value)
    odpDraft.value.value = undoStack.value.pop()!
  }
  markTabDirty(draftDirty.value)
}
const redoDraft = () => {
  if (!redoStack.value.length) return
  if (draft.value) {
    undoStack.value.push(draft.value.value)
    draft.value.value = redoStack.value.pop()!
  } else if (styleDraft.value) {
    undoStack.value.push(styleDraft.value.styleName)
    styleDraft.value.styleName = redoStack.value.pop()!
  } else if (odpDraft.value) {
    undoStack.value.push(odpDraft.value.value)
    odpDraft.value.value = redoStack.value.pop()!
  }
  markTabDirty(draftDirty.value)
}
const saveCopy = async () => {
  if ((!draft.value && !styleDraft.value && !odpDraft.value) || !draftDirty.value || !report.value || saving.value) return
  const activeDraft = draft.value || styleDraft.value
  const baseName = fileName.value.replace(/\.(ods|odp)$/i, '')
  const odpMode = Boolean(odpDraft.value)
  const targetFileName = (await promptAppAction(dialog, {
    title: odpMode ? '可靠另存 ODP 副本' : '另存 ODS 副本',
    content: odpDraft.value
      ? `只会修改第 ${odpDraft.value.slideIndex} 张幻灯片的正文 ${odpDraft.value.paragraphIndex}；备注、版式和其他正文保持不变，源文件不会被覆盖。`
      : styleDraft.value
      ? `只会把 ${styleDraft.value.sheetName} ${styleDraft.value.address} 切换为已有样式“${selectedStyle.value?.label || styleDraft.value.styleName}”，源文件不会被覆盖。`
      : `只会修改 ${activeDraft!.sheetName} ${activeDraft!.address} 的值，源文件不会被覆盖。副本保存在源文件同一文件夹。`,
    initialValue: `${baseName}-LongEdit副本.${odpMode ? 'odp' : 'ods'}`,
    positiveText: '保存副本',
  }))?.trim()
  if (!targetFileName) return
  saving.value = true
  try {
    const saved = odpDraft.value
      ? await invoke<OdpSavedCopyReport>('save_odp_slide_text_copy', {
          libraryRoot: store.libraryPath,
          path: documentPath.value,
          targetFileName,
          expectedSourceSignature: report.value.signature,
          targetId: odpDraft.value.id,
          expectedTextDigest: odpDraft.value.expectedTextDigest,
          replacementText: odpDraft.value.value,
        })
      : styleDraft.value
      ? await invoke<OdsSavedCopyReport>('save_ods_cell_style_copy', {
          libraryRoot: store.libraryPath,
          path: documentPath.value,
          targetFileName,
          expectedSourceSignature: report.value.signature,
          targetId: styleDraft.value.id,
          expectedStyleDigest: styleDraft.value.expectedStyleDigest,
          styleName: styleDraft.value.styleName,
        })
      : await invoke<OdsSavedCopyReport>('save_ods_cell_value_copy', {
          libraryRoot: store.libraryPath,
          path: documentPath.value,
          targetFileName,
          expectedSourceSignature: report.value.signature,
          targetId: draft.value!.id,
          expectedValueDigest: draft.value!.expectedValueDigest,
          replacementValue: draft.value!.value,
        })
    if (!saved.sourceUnchanged || !saved.semanticReopenVerified || saved.saveMode !== 'new_copy_only') {
      throw new Error(`${odpMode ? 'ODP' : 'ODS'} 副本未返回完整的可靠保存凭据`)
    }
    if (odpMode) {
      const odpSaved = saved as OdpSavedCopyReport
      if (odpSaved.status !== 'saved_verified' || !odpSaved.unchangedPartsVerified
        || !odpSaved.structuralReopenVerified || odpSaved.changedParts.join(',') !== 'content.xml') {
        throw new Error('ODP 副本未通过结构复开和受保护部件检查')
      }
    }
    clearDraft()
    message.success(`已保存并复读验证：${targetFileName}`)
    await openManagedFile(router, saved.targetPath)
  } catch (error) {
    message.error(String(error).replace(/^Error:\s*/, ''))
  } finally {
    saving.value = false
  }
}
const mayLeave = () => !draftDirty.value || confirmAppAction(dialog, {
  title: `${isOds.value ? 'ODS' : 'ODP'} 还有未保存修改`,
  content: '修改目前只在内存草稿中，离开后不会写入源文件。',
  positiveText: '放弃并离开',
  negativeText: '继续编辑',
})
const onKeydown = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || !workspaceEditable.value) return
  const key = event.key.toLowerCase()
  if (key === 's') { event.preventDefault(); void saveCopy() }
  else if (key === 'z' && event.shiftKey) { event.preventDefault(); redoDraft() }
  else if (key === 'z') { event.preventDefault(); undoDraft() }
  else if (key === 'y') { event.preventDefault(); redoDraft() }
}
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (!draftDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
const selectSlide = (id: string) => {
  const targetSlide = report.value?.model.slides.find(slide => slide.id === id)
  if (draftDirty.value && odpDraft.value && targetSlide?.index !== odpDraft.value.slideIndex) {
    message.warning('当前正文还有未保存修改，请先另存副本或撤销修改')
    return
  }
  selectedSlideId.value = id
  void nextTick(() => {
    rememberOdfViewState()
    document.getElementById(id)?.scrollIntoView({ block: 'center' })
  })
}
const reloadDocument = async () => {
  if (!await mayLeave()) return
  await load()
}
const reveal = async (id: string, parent: string) => {
  if (isOds.value) selectedSheetId.value = parent
  else selectedSlideId.value = parent
  await nextTick()
  rememberOdfViewState()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
}
const moveMatch = (direction: number) => {
  if (!matches.value.length) return
  matchIndex.value = (matchIndex.value + direction + matches.value.length) % matches.value.length
  const match = matches.value[matchIndex.value]
  void reveal(match.id, match.parent)
}
const revealRouteLocator = async () => {
  const locator = routeLocator.value
  if (!locator || !report.value) return
  const parent = locator.startsWith('ods-sheet-') ? locator.split(':')[0] : locator
  await reveal(locator, parent)
}
const rememberOdfViewState = (path = documentPath.value) => {
  const format = report.value?.model.format
  if (!path || !format) return
  rememberWorkspaceViewState(path, {
    scrollTop: format === 'ods' ? sheetStageRef.value?.scrollTop || 0 : 0,
    scrollLeft: format === 'ods' ? sheetStageRef.value?.scrollLeft || 0 : 0,
    section: format === 'ods' ? selectedSheetId.value : selectedSlideId.value,
  })
}
const load = async () => {
  if (!documentPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  clearDraft()
  try {
    report.value = await invoke<OdfContentReport>(isExternal.value ? 'read_external_odf_content_document' : 'read_odf_content_document', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: documentPath.value,
    })
    store.addTab({
      id: documentPath.value,
      title: fileName.value,
      path: documentPath.value,
      isDirty: false,
      external: isExternal.value,
    })
    const viewState = recallWorkspaceViewState(documentPath.value)
    selectedSheetId.value = viewState?.section && report.value.model.sheets.some(sheet => sheet.id === viewState.section)
      ? viewState.section
      : report.value.model.sheets[0]?.id || ''
    selectedSlideId.value = viewState?.section && report.value.model.slides.some(slide => slide.id === viewState.section)
      ? viewState.section
      : report.value.model.slides[0]?.id || ''
    await revealRouteLocator()
    if (isOds.value && viewState && !routeLocator.value) {
      await nextTick()
      sheetStageRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
    }
  } catch (error) {
    report.value = undefined
    loadError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    loading.value = false
  }
}

watch([documentPath, isExternal], (_next, previous) => {
  const previousPath = previous?.[0]
  if (previousPath) rememberOdfViewState(previousPath)
  query.value = ''
  matchIndex.value = -1
  void load()
}, { immediate: true })
watch(matches, value => { matchIndex.value = value.length ? 0 : -1 })
watch(() => [route.query.locator, route.query.locatorToken], revealRouteLocator)
watch(selectedSheetId, () => void nextTick(rememberOdfViewState))
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  rememberOdfViewState()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped>
.odf-workspace { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; container-type: inline-size; }
header { display: flex; min-height: 52px; align-items: center; justify-content: space-between; gap: 14px; padding: 7px 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.identity, .toolbar, .search-box, footer > div { display: flex; align-items: center; }
.identity { min-width: 0; gap: 9px; }
.identity-back { display: grid; width: 28px; height: 28px; flex: none; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.identity-back:hover { color: var(--theme-primary); border-color: color-mix(in srgb, var(--theme-primary) 42%, var(--border-color)); }
.identity > div { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.identity span, footer { color: var(--text-muted); font-size: 11px; }
.toolbar { gap: 5px; }
.toolbar button { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.toolbar button:disabled { opacity: .4; cursor: default; }
.search-box { height: 29px; gap: 6px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.search-box input { width: 150px; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; }
.search-box span { color: var(--text-muted); font-size: 11px; }
.state { display: flex; flex: 1; align-items: center; justify-content: center; gap: 10px; }
.state.error { color: var(--error-color); }
.state p { max-width: 620px; margin: 3px 0 0; color: var(--text-secondary); }
.risk-banner { display: flex; align-items: center; gap: 9px; padding: 8px 14px; border-bottom: 1px solid color-mix(in srgb, #d49a28 34%, var(--border-color)); background: color-mix(in srgb, #d49a28 9%, var(--bg-primary)); }
.risk-banner div { display: flex; flex-direction: column; gap: 2px; }
.risk-banner strong { font-size: 12px; }
.risk-banner span { color: var(--text-secondary); font-size: 11px; }
.edit-banner { display: flex; min-height: 34px; align-items: center; gap: 8px; padding: 5px 14px; border-bottom: 1px solid color-mix(in srgb, var(--theme-primary) 34%, var(--border-color)); color: var(--text-secondary); background: color-mix(in srgb, var(--theme-primary) 8%, var(--bg-primary)); }
.edit-banner > svg { flex: none; color: var(--theme-primary); }
.edit-banner strong { color: var(--text-primary); }
.style-controls { display: flex; min-width: 0; align-items: center; gap: 6px; margin-left: auto; }
.style-controls > span:first-child { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.style-controls select { width: 150px; min-width: 0; height: 26px; padding: 0 26px 0 8px; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); background: var(--bg-secondary); font: inherit; }
.style-swatch { width: 18px; height: 18px; flex: none; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 4px; }
.draft-status { margin-left: auto; color: var(--theme-primary); font-size: 11px; white-space: nowrap; }
.ods-layout { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.sheet-tabs { display: flex; min-height: 34px; overflow-x: auto; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.sheet-tabs button { min-width: 110px; padding: 0 12px; border: 0; border-right: 1px solid var(--border-color); color: var(--text-secondary); background: transparent; cursor: pointer; }
.sheet-tabs button.active { color: var(--theme-primary); box-shadow: inset 0 -2px var(--theme-primary); background: var(--bg-secondary); }
.sheet-stage { flex: 1; overflow: auto; }
.sheet-stage table { min-width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
.sheet-stage th, .sheet-stage td { width: 120px; min-width: 120px; height: 30px; padding: 4px 7px; box-sizing: border-box; border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--bg-primary); }
.sheet-stage thead th { position: sticky; z-index: 3; top: 0; color: var(--text-muted); background: var(--theme-surface-2); font-size: 11px; font-weight: 500; }
.sheet-stage tbody th, .corner { position: sticky; z-index: 2; left: 0; width: 48px; min-width: 48px; color: var(--text-muted); background: var(--theme-surface-2); box-shadow: 2px 0 0 color-mix(in srgb, var(--theme-primary) 24%, var(--theme-surface)); font-size: 11px; font-weight: 500; }
.sheet-stage .corner { z-index: 4; }
.sheet-stage td { position: relative; }
.sheet-stage td.editable { cursor: text; }
.sheet-stage td.editable::after { position: absolute; right: 3px; bottom: 2px; width: 4px; height: 4px; border-radius: 50%; background: var(--theme-primary); content: ''; opacity: .55; }
.sheet-stage td.editable:hover { background: color-mix(in srgb, var(--theme-primary) 9%, var(--bg-primary)); }
.sheet-stage td.editing { padding: 2px; outline: 2px solid var(--theme-primary); outline-offset: -2px; overflow: visible; }
.sheet-stage td.style-selected:not(.editing) { outline: 2px solid color-mix(in srgb, var(--theme-primary) 72%, #ffffff); outline-offset: -2px; }
.cell-editor { width: 100%; height: 100%; min-width: 0; padding: 2px 5px; box-sizing: border-box; border: 0; outline: 0; color: var(--text-primary); caret-color: var(--theme-primary); background: color-mix(in srgb, var(--theme-primary) 8%, var(--bg-primary)); font: inherit; }
.sheet-stage td code { position: absolute; top: 2px; right: 3px; color: var(--theme-primary); font-size: var(--text-compact); }
.odp-layout { display: grid; flex: 1; min-height: 0; grid-template-columns: 220px minmax(0, 1fr); }
.odp-layout aside { overflow: auto; padding: 8px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.odp-layout aside button { display: grid; width: 100%; grid-template-columns: 24px minmax(0, 1fr); gap: 2px 7px; margin-bottom: 4px; padding: 8px; border: 1px solid transparent; border-radius: 6px; text-align: left; color: var(--text-secondary); background: transparent; cursor: pointer; }
.odp-layout aside button.active { border-color: var(--theme-primary); background: var(--bg-secondary); }
.odp-layout aside span { grid-row: 1 / 3; color: var(--theme-primary); font-size: 11px; }
.odp-layout aside strong, .odp-layout aside small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.odp-layout aside small { color: var(--text-muted); }
.slide-stage { overflow: auto; padding: 24px; background: color-mix(in srgb, var(--bg-secondary) 88%, #7f8da3); }
.slide { position: relative; width: min(960px, calc(100% - 24px)); aspect-ratio: 16 / 9; margin: 0 auto; padding: 8% 9%; box-sizing: border-box; border: 1px solid var(--border-color); box-shadow: 0 8px 26px rgba(0,0,0,.12); overflow: auto; background: var(--bg-primary); }
.slide > p { margin: .6em 0; line-height: 1.5; font-size: 18px; }
.slide > p.title { margin: 0 0 .8em; font-size: 28px; font-weight: 650; }
.slide-number { position: absolute; right: 12px; bottom: 8px; color: var(--text-muted); font-size: var(--text-compact); }
.slide section { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--border-color); color: var(--text-secondary); }
.slide section p { white-space: pre-wrap; }
.media-note { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 11px; }
.odp-edit-panel { width: min(960px, calc(100% - 24px)); margin: 14px auto 0; padding: 12px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); }
.odp-edit-panel > header { display: flex; min-height: 24px; padding: 0; border: 0; justify-content: space-between; background: transparent; }
.odp-edit-panel > header span, .odp-copy-boundary { color: var(--text-muted); font-size: 11px; }
.odp-target-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 7px; margin: 8px 0; }
.odp-target-list button { display: flex; min-width: 0; flex-direction: column; gap: 3px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; text-align: left; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.odp-target-list button.active { border-color: var(--theme-primary); box-shadow: inset 0 0 0 1px var(--theme-primary); }
.odp-target-list button span { color: var(--theme-primary); font-size: 11px; }
.odp-target-list button strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.odp-text-editor { display: grid; gap: 5px; margin-top: 10px; color: var(--text-muted); font-size: 11px; }
.odp-text-editor textarea { width: 100%; min-height: 78px; resize: vertical; padding: 8px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 6px; outline: 0; color: var(--text-primary); background: var(--bg-secondary); font: inherit; line-height: 1.5; }
.odp-text-editor textarea:focus { border-color: var(--theme-primary); }
.odp-copy-boundary { margin: 8px 0 0; }
.odp-blocked { display: flex; align-items: flex-start; gap: 8px; color: var(--text-secondary); }
.odp-blocked svg { flex: none; color: #d49a28; }
.odp-blocked p { margin: 3px 0 0; color: var(--text-muted); font-size: 11px; }
.search-hit { background: color-mix(in srgb, #f0bd3e 20%, var(--bg-primary)) !important; }
.current-hit, .route-target { outline: 2px solid var(--theme-primary); outline-offset: -2px; }
.empty { display: grid; min-height: 180px; place-items: center; color: var(--text-muted); }
footer { display: flex; min-height: 28px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); }
footer > div { gap: 10px; }
.spinning { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .odp-layout { grid-template-columns: minmax(0, 1fr); }
  .odp-layout aside { display: flex; max-height: 86px; border-right: 0; border-bottom: 1px solid var(--border-color); }
  .odp-layout aside button { min-width: 180px; }
  .slide-stage { padding: 12px; }
  .slide { width: 100%; }
  .odp-edit-panel { width: 100%; }
  .search-box input { width: 100px; }
}
@container (max-width: 700px) {
  header { min-height: auto; align-items: stretch; flex-direction: column; gap: 6px; padding-block: 7px; }
  .toolbar { width: 100%; }
  .search-box { min-width: 0; flex: 1; }
  .search-box input { width: 100%; min-width: 0; }
  footer > span { display: none; }
  .edit-banner { align-items: flex-start; flex-wrap: wrap; }
  .style-controls { width: 100%; margin-left: 23px; }
  .style-controls select { width: min(210px, calc(100% - 80px)); }
  .draft-status { width: 100%; margin-left: 23px; }
}
</style>
