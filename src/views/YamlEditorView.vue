<template>
  <div class="yaml-workspace" :data-dirty="dirty" :data-saving="saving" :data-loading="loading" :data-analysis-current="!analysisPending && analyzedSource === sourceContent">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />

    <header class="workspace-document-header yaml-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" :title="isExternal ? '返回资料库' : '返回知识库'" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <n-icon :component="FileCodeIcon" size="22" class="format-icon" />
        <div class="workspace-document-copy document-title">
          <strong class="workspace-file-name">{{ fileName }}</strong>
          <span aria-live="polite"><template v-if="isExternal">外部文件 · </template>YAML · {{ readOnly ? '只读' : dirty ? '有未保存修改' : '已保存' }}<template v-if="isExternal && !readOnly"> · 仅点击保存写回</template></span>
        </div>
      </div>

      <div class="toolbar-actions" data-command-strip data-horizontal-wheel="always">
        <n-button quaternary size="small" title="查找（Ctrl+F）" @click="openSourceSearch">
          <template #icon><n-icon :component="SearchIcon" /></template>
          查找
        </n-button>
        <n-button quaternary circle size="small" title="折叠全部" @click="foldSource">
          <template #icon><n-icon :component="FoldIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="展开全部" @click="unfoldSource">
          <template #icon><n-icon :component="UnfoldIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重新读取" :disabled="loading" @click="reloadFromDisk">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
        <n-button quaternary size="small" :title="inspectorVisible ? '隐藏文档结构与问题' : '显示文档结构与问题'" :aria-pressed="inspectorVisible" @click="toggleInspector">
          <template #icon><n-icon :component="InspectorIcon" /></template>
          结构与问题
        </n-button>
        <StructuredHistoryMenu :session="session" :available="!isExternal" :read-only="readOnly" :busy="loading || saving || !session.hasDocument()" />
        <n-button
          type="primary"
          size="small"
          :loading="saving"
          :disabled="loading || readOnly || !dirty || !session.hasDocument()"
          @click="save()"
        >
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
        </n-button>
      </div>
    </header>

    <main class="yaml-stage" :class="{ 'inspector-hidden': !inspectorVisible }">
      <section class="source-pane">
        <div v-if="loading" class="editor-state">
          <n-spin size="small" />
          <strong>正在读取 YAML</strong>
        </div>
        <div v-else-if="loadError" class="editor-state error">
          <n-icon :component="AlertIcon" size="24" />
          <strong>无法打开 YAML</strong>
          <p>{{ loadError }}</p>
          <n-button size="small" @click="load(true)">重试</n-button>
        </div>
        <div ref="editorHost" class="editor-host" :class="{ hidden: loading || loadError }" />
      </section>

      <aside class="inspector">
        <div class="inspector-heading">
          <div>
            <strong>文档结构与问题</strong>
            <span>{{ analysisPending ? '正在更新结构分析，编辑不受影响' : '点击条目可定位到对应源码' }}</span>
          </div>
          <n-spin v-if="analysisPending" size="small" />
          <n-icon
            v-else
            :component="analysis?.valid ? ValidIcon : AlertIcon"
            :class="analysis?.valid ? 'valid' : 'invalid'"
            size="20"
          />
        </div>

        <div class="metrics">
          <div><strong>{{ analysis?.documentCount ?? 0 }}</strong><span>文档</span></div>
          <div><strong>{{ analysis?.nodeCount?.toLocaleString() ?? 0 }}</strong><span>节点</span></div>
          <div><strong>{{ analysis?.maxDepth ?? 0 }}</strong><span>深度</span></div>
          <div><strong>{{ specialSyntaxCount }}</strong><span>特殊语法</span></div>
        </div>

        <section v-if="analysis?.diagnostics.length" class="diagnostics">
          <h3>诊断</h3>
          <button
            v-for="diagnostic in analysis.diagnostics"
            :key="`${diagnostic.code}:${diagnostic.start}`"
            type="button"
            @click="revealRange(diagnostic)"
          >
            <n-icon :component="AlertIcon" />
            <span>
              <strong>{{ diagnosticTitle(diagnostic.code) }}</strong>
              <small>第 {{ diagnostic.line }} 行，第 {{ diagnostic.column }} 列</small>
              <small>{{ diagnostic.message }}</small>
            </span>
          </button>
        </section>

        <section v-else class="syntax-summary">
          <n-icon :component="ValidIcon" />
          <div>
            <strong>语法有效</strong>
            <span>
              锚点 {{ analysis?.anchorCount ?? 0 }} · 别名 {{ analysis?.aliasCount ?? 0 }} ·
              标签 {{ analysis?.taggedNodeCount ?? 0 }} · 块标量 {{ analysis?.blockScalarCount ?? 0 }}
            </span>
          </div>
        </section>

        <n-input
          v-model:value="outlineQuery"
          clearable
          size="small"
          placeholder="筛选路径或内容"
          aria-label="筛选 YAML 结构提纲" :input-props="{ 'aria-label': '筛选 YAML 结构提纲' }" @keydown.enter.prevent="filteredOutline[0] && revealRange(filteredOutline[0])"
        >
          <template #prefix><n-icon :component="SearchIcon" /></template>
        </n-input>

        <div :ref="outlineNav.element" role="group" aria-label="YAML 结构提纲" class="outline-list" @contextmenu="openEmptyFieldMenu">
          <button
            v-for="entry in filteredOutline"
            :key="`${entry.documentIndex}:${entry.start}:${entry.path}`"
            type="button"
            :style="{ paddingLeft: `${12 + Math.min(entry.depth, 8) * 14}px` }"
            @click="revealRange(entry)" @contextmenu.prevent.stop="nodeMenu.open($event, entry)"
            :aria-current="entry === outlineNav.selected.value ? 'true' : undefined"
            :data-outline-node="outlineNav.key(entry)" :tabindex="outlineNav.tabIndex(entry)" @focus="outlineNav.select(entry)" @keydown="outlineNav.keydown($event, entry)"
          >
            <n-icon :component="kindIcon(entry.kind)" />
            <span class="outline-copy">
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.path }}</small>
              <small v-if="entry.preview">{{ entry.preview }}</small>
            </span>
            <span v-if="analysis && analysis.documentCount > 1" class="document-badge">
              D{{ entry.documentIndex + 1 }}
            </span>
          </button>
          <div v-if="!filteredOutline.length" class="empty-outline">
            {{ analysis?.valid ? (analysis.outline.length ? '没有匹配的结构节点' : '空文档 · 右键新增字段') : '修复语法后显示结构提纲' }}
          </div>
          <div v-if="analysis?.outlineTruncated" class="outline-warning">
            结构过大，提纲仅显示受限范围
          </div>
        </div>
      </aside>
    </main>

    <footer class="yaml-statusbar">
      <span>{{ readOnly ? '只读' : dirty ? '源码已修改' : '源码编辑' }}</span>
      <span>{{ encoding.toUpperCase() }}</span>
      <span>{{ lineCount.toLocaleString() }} 行</span>
      <span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span>
      <span>{{ formatBytes(sourceSize) }}</span>
      <span v-if="readOnlyReason" :title="readOnlyReason">{{ readOnlyReason }}</span>
    </footer>

    <SourceNodeMenu v-if="nodeMenu.menu.value" :x="nodeMenu.menu.value.x" :y="nodeMenu.menu.value.y" :options="nodeMenu.items.value" @select="nodeMenu.select" @close="nodeMenu.close" />
    <n-modal v-model:show="valueEditVisible" preset="card" class="yaml-value-edit-dialog" :title="valueEntry?.folded ? '修改 YAML 段落文字' : valueEntry?.literal ? '修改 YAML 多行文字' : '修改 YAML 值'" :style="{width:'min(560px,94vw)',maxHeight:'calc(100dvh - 24px)'}"
      :mask-closable="!valueEditPending" :closable="!valueEditPending" :close-on-esc="!valueEditPending"
      @after-enter="valueInput?.select()" @after-leave="finishValueDialog">
      <code>{{ valueEntry?.path }}</code>
      <n-input ref="valueInput" v-model:value="valueText" type="textarea" :autosize="{minRows:3,maxRows:8}"
        :disabled="valueEditPending || valueReadFailed" aria-label="YAML 字段值" :input-props="{'aria-label':'YAML 字段值'}" autofocus />
      <p v-if="valueError" role="alert" class="value-edit-error">{{ valueError }} <n-button v-if="valueReadFailed" text :disabled="valueEditPending" @click="valueEntry && openValueEdit(valueEntry)">重新读取</n-button> <n-button text :disabled="valueEditPending" @click="revealValueSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="valueEditPending" @click="valueEditVisible=false">取消</n-button>
        <n-button type="primary" :loading="valueEditPending" :disabled="valueReadFailed" @click="previewValueEdit">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="renameVisible" preset="card" class="yaml-key-rename-dialog" title="重命名 YAML 字段"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!renamePending" :closable="!renamePending" :close-on-esc="!renamePending"
      @after-enter="renameInput?.select()" @after-leave="finishRenameDialog">
      <code>{{ renameEntry?.path }}</code>
      <label for="yaml-key-name">字段名</label>
      <n-input ref="renameInput" v-model:value="renameName" :disabled="renamePending" :input-props="{id:'yaml-key-name','aria-label':'YAML 字段名'}" @keydown.enter="onRenameEnter" />
      <p v-if="renameError" role="alert" class="value-edit-error">{{ renameError }} <n-button text :disabled="renamePending" @click="revealRenameSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="renamePending" @click="renameVisible=false">取消</n-button>
        <n-button type="primary" :loading="renamePending" @click="previewRename">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="duplicateVisible" preset="card" class="yaml-field-copy-dialog yaml-key-rename-dialog" title="复制为新字段"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!duplicatePending" :closable="!duplicatePending" :close-on-esc="!duplicatePending"
      @after-enter="duplicateInput?.select()" @after-leave="finishDuplicateDialog">
      <code>{{ duplicateEntry?.path }}</code>
      <label for="yaml-copy-field-name">新字段名</label>
      <n-input ref="duplicateInput" v-model:value="duplicateName" :disabled="duplicatePending" :input-props="{id:'yaml-copy-field-name','aria-label':'新 YAML 字段名'}" @keydown.enter="onDuplicateEnter" />
      <p v-if="duplicateError" role="alert" class="value-edit-error">{{ duplicateError }} <n-button text :disabled="duplicatePending" @click="revealDuplicateSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="duplicatePending" @click="duplicateVisible=false">取消</n-button><n-button type="primary" :loading="duplicatePending" @click="previewDuplicate">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="fieldVisible" preset="card" class="yaml-field-dialog" :title="fieldMode==='add' ? '新增 YAML 字段' : '删除 YAML 字段'"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!fieldPending" :closable="!fieldPending" :close-on-esc="!fieldPending"
      @after-enter="fieldInput?.select()" @after-leave="finishFieldDialog">
      <code>{{ fieldEntry?.path || '$' }}</code>
      <template v-if="fieldMode==='add'">
        <label for="yaml-new-field">字段名</label><n-input ref="fieldInput" v-model:value="fieldName" :disabled="fieldPending" :input-props="{id:'yaml-new-field','aria-label':'新增 YAML 字段名'}" @keydown.enter="onFieldEnter" />
        <label for="yaml-new-value">值</label><n-input v-model:value="fieldValue" :disabled="fieldPending" placeholder="例如：内容、42、true、null" :input-props="{id:'yaml-new-value','aria-label':'新增 YAML 字段值'}" @keydown.enter="onFieldEnter" />
      </template>
      <p v-if="fieldError" role="alert" class="value-edit-error">{{ fieldError }} <n-button text :disabled="fieldPending" @click="revealFieldSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="fieldPending" @click="fieldVisible=false">取消</n-button><n-button type="primary" :loading="fieldPending" @click="previewFieldChange">预览修改</n-button></div></template>
    </n-modal>
    <n-modal v-model:show="sequenceVisible" preset="card" class="yaml-sequence-dialog" :title="sequenceMode==='remove' ? '删除 YAML 列表项' : '新增 YAML 列表项'"
      :style="{width:'min(520px,94vw)',maxHeight:'calc(100dvh - 24px)'}" :mask-closable="!sequencePending" :closable="!sequencePending" :close-on-esc="!sequencePending"
      @after-enter="sequenceInput?.select()" @after-leave="finishSequenceDialog">
      <code>{{ sequenceEntry?.path || '$' }}</code>
      <template v-if="sequenceMode!=='remove'">
        <label for="yaml-sequence-value">值</label><n-input ref="sequenceInput" v-model:value="sequenceValue" :disabled="sequencePending" placeholder="例如：内容、42、true、null" :input-props="{id:'yaml-sequence-value','aria-label':'新增 YAML 列表项值'}" @keydown.enter="onSequenceEnter" />
      </template>
      <p v-if="sequenceError" role="alert" class="value-edit-error">{{ sequenceError }} <n-button text :disabled="sequencePending" @click="revealSequenceSource">定位源码</n-button></p>
      <template #footer><div class="value-edit-actions"><n-button :disabled="sequencePending" @click="sequenceVisible=false">取消</n-button><n-button type="primary" :loading="sequencePending" @click="previewSequenceChange">预览修改</n-button></div></template>
    </n-modal>
    <TextConflictDialog v-if="session.conflict.value" :path="session.conflict.value.path" :library-root="session.conflict.value.external ? undefined : session.conflict.value.root" :draft="session.conflict.value.source" :format-id="session.conflict.value.format" :is-current="() => session.unchanged(session.conflict.value)" @close="session.closeConflict" @reload="session.applyConflict" @copy="session.finishCopy" />
    <n-modal :show="!!copyError" preset="card" title="暂时无法复制这项" class="yaml-copy-error-dialog" style="width:min(480px,94vw);max-height:calc(100dvh - 24px)" @update:show="(value: boolean)=>{if(!value)copyError=''}" @after-leave="finishCopyError">
      <p role="alert">{{ copyError }}</p>
      <template #footer><div class="value-edit-actions"><n-button @click="copyError=''">关闭</n-button><n-button type="primary" @click="revealCopySource">定位源码</n-button></div></template>
    </n-modal>
    <n-modal :show="!!moveError" preset="card" title="暂时无法移动这项" class="yaml-move-error-dialog" style="width:min(480px,94vw);max-height:calc(100dvh - 24px)" @update:show="(value: boolean)=>{if(!value)moveError=''}" @after-leave="finishMoveError">
      <p role="alert">{{ moveError }}</p>
      <template #footer><div class="value-edit-actions"><n-button @click="moveError=''">关闭</n-button><n-button type="primary" @click="revealMoveSource">定位源码</n-button></div></template>
    </n-modal>
    <StructuredChangeDialog v-if="session.preview.value" :title="session.preview.value.title" :current="session.preview.value.owner.source" :target="session.preview.value.target" :error="session.previewError.value" @apply="session.applyChange" @cancel="session.cancelChange" />
</div>
</template>

<script setup lang="ts">
import { useSourceOutlineNavigation } from '../composables/useSourceOutlineNavigation'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage, type InputInst } from 'naive-ui'
import {
  AlertTriangle as AlertIcon,
  ArrowLeft as ArrowLeftIcon,
  Braces as MappingIcon,
  CheckCircle2 as ValidIcon,
  FileCode2 as FileCodeIcon,
  FoldVertical as FoldIcon,
  List as SequenceIcon,
  PanelRight as InspectorIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  TextCursorInput as ScalarIcon,
  UnfoldVertical as UnfoldIcon,
} from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import TextConflictDialog from '../components/TextConflictDialog.vue'
import StructuredChangeDialog from '../components/StructuredChangeDialog.vue'
import StructuredHistoryMenu from '../components/StructuredHistoryMenu.vue'
import SourceNodeMenu from '../components/SourceNodeMenu.vue'
import { useSourceNodeMenu } from '../composables/useSourceNodeMenu'
import { useStructuredSession } from '../composables/useStructuredSession'
import { useResponsiveInspector } from '../composables/useResponsiveInspector'
import { findFileFormat } from '../config/fileFormats'
import { type TabInfo, useAppStore } from '../store/app'
import { STRUCTURED_ANALYSIS_BUSY_RETRY_MS, structuredAnalysisDelay } from '../utils/structuredAnalysis'

interface TextDocumentSnapshot {
  content: string
  encoding: string
  signature: string
  size: number
  modified: number
  readOnlyReason?: string
  path: string
}

interface YamlDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  start: number
  end: number
  line: number
  column: number
  path?: string
}

interface YamlOutlineEntry {
  literal?: boolean
  folded?: boolean
  field?: { name: string; start: number; end: number; renameUnavailableReason?: string }
  editable?: boolean
  editUnavailableReason?: string
  documentIndex: number
  path: string
  label: string
  kind: string
  depth: number
  childCount: number
  start: number
  end: number
  line: number
  column: number
  preview: string
}

interface YamlSourceAnalysis {
  valid: boolean
  documentCount: number
  nodeCount: number
  maxDepth: number
  anchorCount: number
  aliasCount: number
  taggedNodeCount: number
  blockScalarCount: number
  outline: YamlOutlineEntry[]
  outlineTruncated: boolean
  diagnostics: YamlDiagnostic[]
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const { inspectorVisible, toggleInspector } = useResponsiveInspector()
const editorHost = ref<HTMLElement | null>(null)
const yamlPath = computed(() => String(route.query.path || ''))
const isExternal = computed(() => route.query.external === '1')
const format = computed(() => findFileFormat(yamlPath.value))
const fileName = computed(() => yamlPath.value.split(/[\\/]/).pop() || '未命名 YAML')
const currentTab = computed(() => store.tabs.find(tab => tab.path === yamlPath.value))
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const dirty = ref(false)
const sourceContent = ref('')
const sourceSize = ref(0)
const signature = ref('')
const encoding = ref('utf-8')
const fileSize = ref(0)
const modified = ref(0)
const readOnlyReason = ref('')
const cursorLine = ref(1)
const cursorColumn = ref(1)
const lineCount = ref(1)
const analysis = ref<YamlSourceAnalysis | null>(null)
const analysisPending = ref(false)
const outlineQuery = ref('')
const readOnly = computed(() => Boolean(readOnlyReason.value))
const specialSyntaxCount = computed(() => (
  (analysis.value?.anchorCount || 0)
  + (analysis.value?.aliasCount || 0)
  + (analysis.value?.taggedNodeCount || 0)
  + (analysis.value?.blockScalarCount || 0)
))
const filteredOutline = computed(() => {
  const query = outlineQuery.value.trim().toLocaleLowerCase()
  const entries = analysis.value?.outline || []
  return (query
    ? entries.filter(entry => (
        entry.path.toLocaleLowerCase().includes(query)
        || entry.label.toLocaleLowerCase().includes(query)
        || entry.preview.toLocaleLowerCase().includes(query)
      ))
    : entries
  ).slice(0, 500)
})

let editor: EditorView | null = null
let loadGeneration = 0
let analysisGeneration = 0
let analysisTimer: ReturnType<typeof setTimeout> | null = null
let applyingDocument = false

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

const errorMessage = (cause: unknown) => {
  const value = cause as { message?: string; suggestion?: string }
  const detail = value?.message || String(cause).replace(/^Error:\s*/, '')
  return value?.suggestion ? `${detail} · ${value.suggestion}` : detail
}

const diagnosticTitle = (code: string) => ({
  'syntax-error': '语法错误',
  'source-too-large': '超过分析上限',
  'analysis-budget-exceeded': '结构超过分析预算',
}[code] || 'YAML 诊断')

const kindIcon = (kind: string) => {
  if (kind === 'mapping') return MappingIcon
  if (kind === 'sequence') return SequenceIcon
  return ScalarIcon
}

const analyzedSource = ref('')
const selectedFieldStart = ref<number>()
const outlineNav = useSourceOutlineNavigation({
  entries: () => analysis.value?.outline || [], visible: () => filteredOutline.value,
  identity: () => [yamlPath.value, isExternal.value, store.libraryPath].join('\0'),
  ready: () => !loading.value && !analysisPending.value && analyzedSource.value === sourceContent.value,
  preferredOffset: () => selectedFieldStart.value,
  key: entry => entry.documentIndex + ':' + entry.path,
})
const session = useStructuredSession({
  path: () => yamlPath.value, external: () => isExternal.value, format: () => format.value?.id || '',
  generation: () => loadGeneration, editor: () => editor, store, dialog, message, loading, saving, dirty, signature, encoding, fileSize, modified, readOnlyReason,
  analyze: source => analyzeContent(source), clearAnalysis: () => clearAnalysisTimer(), scheduleAnalysis: () => scheduleAnalysis(),
  applySnapshot: snapshot => applySnapshot(snapshot), load: discard => load(discard),
})
const valueEditVisible = ref(false), valueEditPending = ref(false), valueText = ref(''), valueError = ref('')
const valueInput = ref<InputInst | null>(null), valueEntry = ref<YamlOutlineEntry | null>(null)
let valueOwner: ReturnType<typeof session.capture>, pendingValuePreview: (() => void) | undefined, resumeValue = false
const valueOriginalText = ref('')
const valueReadFailed = ref(false)
const finishValueDialog = () => { const offer = pendingValuePreview; pendingValuePreview = undefined; offer?.() }
const renameVisible = ref(false), renamePending = ref(false), renameName = ref(''), renameError = ref('')
const renameInput = ref<InputInst | null>(null), renameEntry = ref<YamlOutlineEntry | null>(null)
let renameOwner: ReturnType<typeof session.capture>, pendingRename: (() => void) | undefined, resumeRename = false
const finishRenameDialog = () => { const offer = pendingRename; pendingRename = undefined; offer?.() }
const revealRenameSource = () => {
  const owner = renameOwner, field = renameEntry.value?.field
  if (!owner || !field || !session.unchanged(owner)) return
  resumeRename = true; pendingRename = () => { if (session.unchanged(owner)) revealRange(field) }; renameVisible.value = false
}
const openRename = (entry: YamlOutlineEntry) => {
  if (editDisabled.value || !entry.field) return
  if (resumeRename && renameOwner && session.unchanged(renameOwner) && renameEntry.value?.field?.start === entry.field.start) {
    resumeRename = false; renameVisible.value = true; return
  }
  resumeRename = false; renameOwner = session.capture()
  if (!renameOwner) return
  renameEntry.value = entry; renameName.value = entry.field.name
  renameError.value = entry.field.renameUnavailableReason || ''; renameVisible.value = true
}
const onRenameEnter = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault(); void previewRename()
}
const previewRename = async () => {
  const owner = renameOwner, field = renameEntry.value?.field
  if (!owner || !field || renamePending.value) return
  if (!session.unchanged(owner)) { renameError.value = '文件或草稿已变化，请重新选择字段；输入与内容仍保留'; return }
  renamePending.value = true; renameError.value = ''
  try {
    const result = await invoke<{content:string;start:number;end:number}>('rename_yaml_key_source', {content:owner.source,start:field.start,end:field.end,name:renameName.value})
    if (renameOwner !== owner) return
    if (!session.unchanged(owner)) { renameError.value = '草稿已继续编辑，未应用旧结果；输入与内容仍保留'; return }
    const bytes = new TextEncoder().encode(result.content), point = (offset:number) => new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,offset)).length
    pendingRename = () => session.offerChange(owner,'重命名 YAML 字段',result.content,point(result.start),() => {
      outlineQuery.value = ''; selectedFieldStart.value = result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    renameVisible.value = false
  } catch (cause) { if (renameOwner === owner && session.owns(owner)) renameError.value = errorMessage(cause) }
  finally { if (renameOwner === owner && session.owns(owner)) renamePending.value = false }
}
const duplicateVisible=ref(false),duplicatePending=ref(false),duplicateName=ref(''),duplicateError=ref('')
const duplicateInput=ref<InputInst|null>(null),duplicateEntry=ref<YamlOutlineEntry|null>(null)
let duplicateOwner:ReturnType<typeof session.capture>,pendingDuplicate:(()=>void)|undefined,resumeDuplicate=false
const finishDuplicateDialog=()=>{const action=pendingDuplicate;pendingDuplicate=undefined;if(action)void nextTick(action)}
const revealDuplicateSource=()=>{
  const owner=duplicateOwner,field=duplicateEntry.value?.field
  if(!owner||!field||!session.unchanged(owner))return
  resumeDuplicate=true;pendingDuplicate=()=>{if(session.unchanged(owner))revealRange(field)};duplicateVisible.value=false
}
const openDuplicate=(entry:YamlOutlineEntry)=>{
  if(editDisabled.value||!entry.field)return
  if(resumeDuplicate&&duplicateOwner&&session.unchanged(duplicateOwner)&&duplicateEntry.value?.field?.start===entry.field.start){resumeDuplicate=false;duplicateVisible.value=true;return}
  resumeDuplicate=false;duplicateOwner=session.capture();if(!duplicateOwner)return
  const entries=analysis.value?.outline||[],index=entries.indexOf(entry)
  let from=index,to=index+1
  while(from>0&&entries[from-1]!.depth>=entry.depth)from--
  while(to<entries.length&&entries[to]!.depth>=entry.depth)to++
  const names=new Set(entries.slice(from,to).filter(e=>e.depth===entry.depth).map(e=>e.field?.name))
  // Leave room for the suffix even when the original name reaches the byte limit.
  const base=Array.from(entry.field.name).slice(0,900).join('')+'_copy'
  let name=base,n=2;while(names.has(name))name=base+n++
  duplicateEntry.value=entry;duplicateName.value=name;duplicateError.value='';duplicateVisible.value=true
}
const onDuplicateEnter=(event:KeyboardEvent)=>{if(event.isComposing||event.keyCode===229)return;event.preventDefault();void previewDuplicate()}
const previewDuplicate=async()=>{
  const owner=duplicateOwner,field=duplicateEntry.value?.field
  if(!owner||!field||duplicatePending.value)return
  if(!session.unchanged(owner)){duplicateError.value='文件或草稿已变化，请重新选择字段；名称与内容仍保留';return}
  duplicatePending.value=true;duplicateError.value=''
  try{
    const result=await invoke<{content:string;start:number;end:number}>('copy_yaml_field_source',{content:owner.source,start:field.start,end:field.end,name:duplicateName.value})
    if(duplicateOwner!==owner)return
    if(!session.unchanged(owner)){duplicateError.value='草稿已继续编辑，未应用旧结果；名称与内容仍保留';return}
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    pendingDuplicate=()=>session.offerChange(owner,'复制 YAML 字段',result.content,point(result.start),()=>{
      outlineQuery.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    duplicateVisible.value=false
  }catch(cause){if(duplicateOwner===owner&&session.owns(owner))duplicateError.value=errorMessage(cause)}
  finally{if(duplicateOwner===owner&&session.owns(owner))duplicatePending.value=false}
}
const fieldVisible=ref(false), fieldPending=ref(false), fieldMode=ref<'add'|'remove'>('add'), fieldName=ref(''), fieldValue=ref("''"), fieldError=ref('')
const fieldInput=ref<InputInst|null>(null), fieldEntry=ref<YamlOutlineEntry|null>(null)
const openEmptyFieldMenu=(event:MouseEvent)=>{
  if(!analysis.value?.valid||analysis.value.outline.length)return
  event.preventDefault();event.stopPropagation()
  nodeMenu.open(event,{path:'$',label:'文档',kind:'mapping',start:0,end:0,depth:0,documentIndex:0,childCount:0,line:1,column:1,preview:''})
}
let fieldOwner:ReturnType<typeof session.capture>, pendingField:(()=>void)|undefined, resumeField=false
const finishFieldDialog=()=>{const offer=pendingField;pendingField=undefined;if(offer)void nextTick(offer)}
const revealFieldSource=()=>{
  const owner=fieldOwner,entry=fieldEntry.value
  if(!owner||!entry||!session.unchanged(owner))return
  resumeField=true;pendingField=()=>{if(session.unchanged(owner))revealRange(entry.field||entry)};fieldVisible.value=false
}
const openFieldChange=(entry:YamlOutlineEntry,mode:'add'|'remove')=>{
  if(editDisabled.value)return
  if(resumeField&&fieldMode.value===mode&&fieldOwner&&session.unchanged(fieldOwner)&&fieldEntry.value?.path===entry.path){resumeField=false;fieldVisible.value=true;return}
  resumeField=false;fieldOwner=session.capture();if(!fieldOwner)return
  fieldEntry.value=entry;fieldMode.value=mode;fieldName.value='';fieldValue.value="''";fieldError.value=''
  if(mode==='add')fieldVisible.value=true;else void previewFieldChange()
}
const onFieldEnter=(event:KeyboardEvent)=>{if(event.isComposing||event.keyCode===229)return;event.preventDefault();void previewFieldChange()}
const previewFieldChange=async()=>{
  const owner=fieldOwner,entry=fieldEntry.value,mode=fieldMode.value
  if(!owner||!entry||fieldPending.value)return
  if(!session.unchanged(owner)){fieldError.value='文件或草稿已变化，请重新选择；当前输入与内容仍保留';fieldVisible.value=true;return}
  fieldPending.value=true;fieldError.value=''
  try{
    const field=entry.field
    const result=await invoke<{content:string;start:number;end:number;valueType?:string}>(mode==='add'?'add_yaml_field_source':'remove_yaml_field_source',{
      content:owner.source,...(mode==='add'?{start:entry.kind==='mapping'?entry.start:field?.start??0,end:entry.kind==='mapping'?entry.end:field?.end??0,inside:entry.kind==='mapping',name:fieldName.value,value:fieldValue.value}:{start:field?.start,end:field?.end})})
    if(fieldOwner!==owner)return
    if(!session.unchanged(owner)){fieldError.value='草稿已继续编辑，未应用旧结果；当前输入与内容仍保留';fieldVisible.value=true;return}
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    const offer=()=>session.offerChange(owner,mode==='add'?`新增 YAML 字段${result.valueType?' · '+result.valueType:''}`:'删除 YAML 字段',result.content,point(result.start),()=>{
      outlineQuery.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    if(fieldVisible.value){pendingField=offer;fieldVisible.value=false}else offer()
  }catch(cause){if(fieldOwner===owner&&session.owns(owner)){fieldError.value=errorMessage(cause);fieldVisible.value=true}}
  finally{if(fieldOwner===owner&&session.owns(owner))fieldPending.value=false}
}
const sequenceVisible=ref(false), sequencePending=ref(false), sequenceMode=ref<'append'|'after'|'remove'>('append'), sequenceValue=ref("''"), sequenceError=ref('')
const sequenceInput=ref<InputInst|null>(null), sequenceEntry=ref<YamlOutlineEntry|null>(null)
let sequenceOwner:ReturnType<typeof session.capture>, pendingSequence:(()=>void)|undefined, resumeSequence=false
const finishSequenceDialog=()=>{const offer=pendingSequence;pendingSequence=undefined;offer?.()}
const revealSequenceSource=()=>{
  const owner=sequenceOwner,entry=sequenceEntry.value
  if(!owner||!entry||!session.unchanged(owner))return
  resumeSequence=true;pendingSequence=()=>{if(session.unchanged(owner))revealRange(entry)};sequenceVisible.value=false
}
const openSequenceChange=(entry:YamlOutlineEntry,mode:'append'|'after'|'remove')=>{
  if(editDisabled.value)return
  if(resumeSequence&&sequenceMode.value===mode&&sequenceOwner&&session.unchanged(sequenceOwner)&&sequenceEntry.value?.path===entry.path){resumeSequence=false;sequenceVisible.value=true;return}
  resumeSequence=false;sequenceOwner=session.capture();if(!sequenceOwner)return
  sequenceEntry.value=entry;sequenceMode.value=mode;sequenceValue.value="''";sequenceError.value=''
  if(mode!=='remove')sequenceVisible.value=true;else void previewSequenceChange()
}
const onSequenceEnter=(event:KeyboardEvent)=>{if(event.isComposing||event.keyCode===229)return;event.preventDefault();void previewSequenceChange()}
const previewSequenceChange=async()=>{
  const owner=sequenceOwner,entry=sequenceEntry.value,mode=sequenceMode.value
  if(!owner||!entry||sequencePending.value)return
  if(!session.unchanged(owner)){sequenceError.value='文件或草稿已变化，请重新选择；当前输入与内容仍保留';sequenceVisible.value=true;return}
  sequencePending.value=true;sequenceError.value=''
  try{
    const result=await invoke<{content:string;start:number;end:number;valueType?:string}>(mode==='remove'?'remove_yaml_sequence_item_source':'add_yaml_sequence_item_source',{
      content:owner.source,start:entry.start,end:entry.end,...(mode==='remove'?{}:{after:mode==='after',value:sequenceValue.value})})
    if(sequenceOwner!==owner)return
    if(!session.unchanged(owner)){sequenceError.value='草稿已继续编辑，未应用旧结果；当前输入与内容仍保留';sequenceVisible.value=true;return}
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    const offer=()=>session.offerChange(owner,mode!=='remove'?`新增 YAML 列表项${result.valueType?' · '+result.valueType:''}`:'删除 YAML 列表项',result.content,point(result.start),()=>{
      outlineQuery.value='';selectedFieldStart.value=undefined
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
    if(sequenceVisible.value){pendingSequence=offer;sequenceVisible.value=false}else offer()
  }catch(cause){if(sequenceOwner===owner&&session.owns(owner)){sequenceError.value=errorMessage(cause);sequenceVisible.value=true}}
  finally{if(sequenceOwner===owner&&session.owns(owner))sequencePending.value=false}
}
const copyPending=ref(false),copyError=ref(''),copyEntry=ref<YamlOutlineEntry|null>(null)
let copyRequest:object|undefined,pendingCopyReveal:(()=>void)|undefined
let copyOwner:ReturnType<typeof session.capture>
const finishCopyError=()=>{const reveal=pendingCopyReveal;pendingCopyReveal=undefined;if(reveal)void nextTick(reveal)}
const copyItem=async(entry:YamlOutlineEntry)=>{
  if(editDisabled.value)return
  const owner=session.capture();if(!owner)return
  const request={};copyRequest=request;copyOwner=owner;pendingCopyReveal=undefined;copyPending.value=true;copyError.value='';copyEntry.value=entry
  try{
    const result=await invoke<{content:string;start:number;end:number}>('copy_yaml_sequence_item_source',{content:owner.source,start:entry.start,end:entry.end})
    if(copyRequest!==request||!session.unchanged(owner))return
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    session.offerChange(owner,'复制YAML 列表项',result.content,point(result.start),()=>{
      outlineQuery.value='';selectedFieldStart.value=undefined
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
  }catch(cause){if(copyRequest===request&&session.unchanged(owner))copyError.value=errorMessage(cause)}
  finally{if(copyRequest===request&&session.owns(owner))copyPending.value=false}
}
const revealCopySource=()=>{const owner=copyOwner,entry=copyEntry.value;if(owner&&entry&&session.unchanged(owner))pendingCopyReveal=()=>{if(session.unchanged(owner))revealRange(entry)};copyError.value=''}
const movePending=ref(false), moveError=ref(''), moveEntry=ref<YamlOutlineEntry|null>(null)
let moveOwner:ReturnType<typeof session.capture>, moveRequest:object|undefined, pendingMoveReveal:(()=>void)|undefined
const finishMoveError=()=>{const reveal=pendingMoveReveal;pendingMoveReveal=undefined;if(reveal)void nextTick(reveal)}
const canMoveItem=(entry:YamlOutlineEntry,direction:'up'|'down')=>{
  const match=entry.path.match(/^(.*)\[(\d+)\]$/)
  if(entry.field||!match)return false
  const parent=analysis.value?.outline.find(e=>e.documentIndex===entry.documentIndex&&e.path===match[1]&&e.kind==='sequence')
  const index=Number(match[2])
  return !!parent&&index<parent.childCount&&(direction==='up'?index>0:index+1<parent.childCount)
}
const moveItem=async(entry:YamlOutlineEntry,direction:'up'|'down')=>{
  if(editDisabled.value||!canMoveItem(entry,direction))return
  const owner=session.capture();if(!owner)return
  const request={};moveRequest=request;moveOwner=owner;pendingMoveReveal=undefined;movePending.value=true;moveError.value='';moveEntry.value=entry
  try{
    const result=await invoke<{content:string;start:number;end:number}>('move_yaml_sequence_item_source',{content:owner.source,start:entry.start,end:entry.end,direction})
    if(moveRequest!==request||!session.unchanged(owner))return
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    session.offerChange(owner,direction==='up'?'上移 YAML 列表项':'下移 YAML 列表项',result.content,point(result.start),()=>{
      outlineQuery.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
  }catch(cause){if(moveRequest===request&&session.unchanged(owner))moveError.value=errorMessage(cause)}
  finally{if(moveRequest===request&&session.owns(owner))movePending.value=false}
}
const fieldSiblings=(entry:YamlOutlineEntry)=>{
  const entries=analysis.value?.outline||[],i=entries.findIndex(e=>e.documentIndex===entry.documentIndex&&e.field?.start===entry.field?.start&&e.field?.end===entry.field?.end)
  if(i<0||!entry.field)return []
  let from=i,to=i+1
  while(from>0&&entries[from-1]!.depth>=entry.depth)from--
  while(to<entries.length&&entries[to]!.depth>=entry.depth)to++
  return entries.slice(from,to).filter(e=>e.documentIndex===entry.documentIndex&&e.depth===entry.depth&&e.field)
}
const canMoveField=(entry:YamlOutlineEntry,direction:'up'|'down')=>{
  const siblings=fieldSiblings(entry),i=siblings.findIndex(e=>e.field?.start===entry.field?.start)
  return i>=0&&(direction==='up'?i>0:i+1<siblings.length)
}
const moveField=async(entry:YamlOutlineEntry,direction:'up'|'down')=>{
  if(editDisabled.value||!canMoveField(entry,direction))return
  const owner=session.capture();if(!owner)return
  const request={};moveRequest=request;moveOwner=owner;pendingMoveReveal=undefined;movePending.value=true;moveError.value='';moveEntry.value=entry
  try{
    const result=await invoke<{content:string;start:number;end:number}>('move_yaml_field_source',{content:owner.source,start:entry.field!.start,end:entry.field!.end,direction})
    if(moveRequest!==request||!session.unchanged(owner))return
    const bytes=new TextEncoder().encode(result.content),point=(n:number)=>new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0,n)).length
    session.offerChange(owner,direction==='up'?'上移 YAML 字段':'下移 YAML 字段',result.content,point(result.start),()=>{
      outlineQuery.value='';selectedFieldStart.value=result.start
      owner.editor.dispatch({selection:{anchor:point(result.start),head:point(result.end)},scrollIntoView:true})
    })
  }catch(cause){if(moveRequest===request&&session.unchanged(owner))moveError.value=errorMessage(cause)}
  finally{if(moveRequest===request&&session.owns(owner))movePending.value=false}
}
const revealMoveSource=()=>{const owner=moveOwner,entry=moveEntry.value;if(owner&&entry&&session.unchanged(owner))pendingMoveReveal=()=>{if(session.unchanged(owner))revealRange(entry)};moveError.value=''}
const editDisabled = computed(() => loading.value || saving.value || readOnly.value || analysisPending.value || valueEditPending.value || renamePending.value || duplicatePending.value || fieldPending.value || sequencePending.value || copyPending.value || movePending.value || analyzedSource.value !== sourceContent.value || !analysis.value?.valid)
const revealValueSource = () => {
  const owner=valueOwner,entry=valueEntry.value
  if (!owner||!entry||!session.unchanged(owner)) return
  resumeValue=true;pendingValuePreview=()=>{if(session.unchanged(owner))revealRange(entry)};valueEditVisible.value=false
}
const openValueEdit = async (entry: YamlOutlineEntry) => {
  if (editDisabled.value) return
  if (!entry.editable) { message.info(entry.editUnavailableReason || '此内容请在源码中修改'); revealRange(entry); return }
  if(resumeValue&&valueOwner&&session.unchanged(valueOwner)&&valueEntry.value?.start===entry.start&&valueEntry.value.end===entry.end){resumeValue=false;valueEditVisible.value=true;return}
  resumeValue=false;pendingValuePreview=undefined
  const owner=session.capture();valueOwner=owner
  if (!owner) return
  valueEntry.value = entry
  valueError.value='';valueReadFailed.value=false;valueEditPending.value=true
  try {
    const text=entry.literal || entry.folded ? await invoke<string>('inspect_yaml_literal_source',{content:owner.source,start:entry.start,end:entry.end}) : new TextDecoder('utf-8',{ignoreBOM:true}).decode(new TextEncoder().encode(owner.source).slice(entry.start,entry.end))
    if(valueOwner!==owner||!session.unchanged(owner))return
    valueText.value=text;valueOriginalText.value=text;valueEditVisible.value=true
  } catch(cause){if(valueOwner===owner&&session.unchanged(owner)){valueText.value='';valueReadFailed.value=true;valueError.value=errorMessage(cause);valueEditVisible.value=true}}
  finally{if(valueOwner===owner&&session.owns(owner))valueEditPending.value=false}
}
const previewValueEdit = async () => {
  const owner = valueOwner, entry = valueEntry.value
  if (!owner || !entry || valueEditPending.value || valueReadFailed.value) return
  if (!session.unchanged(owner)) { valueError.value = '当前文件或草稿已变化，请重新选择字段；内容未被修改'; return }
  valueEditPending.value = true; valueError.value = ''
  try {
    const target = await invoke<string>('replace_yaml_value_source',{content:owner.source,start:entry.start,end:entry.end,replacement:valueText.value})
    if (valueOwner!==owner||!session.owns(owner))return
    if (!session.unchanged(owner)) { valueError.value = '当前草稿已变化，请重新选择字段；输入与内容仍保留'; return }
    const anchor = new TextDecoder().decode(new TextEncoder().encode(target).slice(0,entry.start)).length
    const trailing=(text:string)=>text.match(/\n*$/)?.[0].length || 0
    const title=entry.literal || entry.folded ? `修改 YAML ${entry.folded ? '段落文字' : '多行文字'} · 结尾换行 ${trailing(valueOriginalText.value)} → ${trailing(valueText.value)}` : '修改 YAML 值'
    pendingValuePreview = () => session.offerChange(owner,title,target,anchor)
    valueEditVisible.value = false
  } catch (cause) { if (valueOwner===owner&&session.owns(owner)) valueError.value = errorMessage(cause) }
  finally { if (valueOwner===owner&&session.owns(owner)) valueEditPending.value = false }
}
const nodeMenu = useSourceNodeMenu<YamlOutlineEntry>(session, { fresh: () => !analysisPending.value && analyzedSource.value === sourceContent.value, reveal: entry => revealRange(entry),
  extra: entry => [...(entry.field ? [{key:'field-up',label:'上移',disabled:editDisabled.value||!canMoveField(entry,'up')},{key:'field-down',label:'下移',disabled:editDisabled.value||!canMoveField(entry,'down')}] : []),...(entry.kind==='sequence' ? [{key:'append-item',label:'追加列表项…',disabled:editDisabled.value}] : []), ...(!entry.field&&/\[\d+\]$/.test(entry.path) ? [{key:'move-up',label:'上移',disabled:editDisabled.value||!canMoveItem(entry,'up')},{key:'move-down',label:'下移',disabled:editDisabled.value||!canMoveItem(entry,'down')},{key:'copy-item',label:'复制为新项…',disabled:editDisabled.value},{key:'after-item',label:'在此项后新增…',disabled:editDisabled.value},{key:'remove-item',label:'删除列表项…',disabled:editDisabled.value}] : []),...(entry.kind==='mapping'||entry.field||entry.path==='$' ? [{key:'add-field',label:'新增字段…',disabled:editDisabled.value}] : []), ...(entry.field ? [{key:'remove-field',label:'删除字段…',disabled:editDisabled.value}] : []), ...(entry.field ? [{key:'duplicate-field',label:'复制为新字段…',disabled:editDisabled.value}] : []), ...(entry.field ? [{key:'rename-key',label:'重命名字段…',disabled:editDisabled.value}] : []), ...(['scalar','alias','tagged'].includes(entry.kind) ? [{key:'edit-value',label:'修改值…',disabled:editDisabled.value}] : [])],
  action: (key,entry) => { if(key==='field-up')void moveField(entry,'up');if(key==='field-down')void moveField(entry,'down');if(key==='move-up')void moveItem(entry,'up');if(key==='move-down')void moveItem(entry,'down');if(key==='copy-item')void copyItem(entry); if(key==='append-item')openSequenceChange(entry,'append');if(key==='after-item')openSequenceChange(entry,'after');if(key==='remove-item')openSequenceChange(entry,'remove');if(key==='edit-value')openValueEdit(entry); if(key==='rename-key')openRename(entry);if(key==='duplicate-field')openDuplicate(entry);if(key==='add-field')openFieldChange(entry,'add');if(key==='remove-field')openFieldChange(entry,'remove') } })
const syncCurrentTab = (isDirty = dirty.value) => session.sync(isDirty)
const registerCurrentTab = (snapshot?: TextDocumentSnapshot) => session.bind(snapshot)

const clearAnalysisTimer = () => {
  if (analysisTimer) clearTimeout(analysisTimer)
  analysisTimer = null
}

const analyzeContent = async (content: string) => { const analysisOwner = session.capture();
  const generation = ++analysisGeneration
  analysisPending.value = true
  sourceSize.value = new TextEncoder().encode(content).length
  try {
    const result = await invoke<YamlSourceAnalysis>('analyze_yaml_source', { content })
    if (session.owns(analysisOwner) && generation === analysisGeneration && sourceContent.value === content) { analysis.value = result; analyzedSource.value = content }
    return result
  } finally {
    if (generation === analysisGeneration) analysisPending.value = false
  }
}

const scheduleAnalysis = () => {
  clearAnalysisTimer()
  analysisTimer = setTimeout(() => {
    analysisTimer = null
    if (analysisPending.value) {
      scheduleAnalysis()
      return
    }
    const content = sourceContent.value
    void analyzeContent(content).catch(cause => message.error(`实时分析失败：${errorMessage(cause)}`))
  }, analysisPending.value ? STRUCTURED_ANALYSIS_BUSY_RETRY_MS : structuredAnalysisDelay(sourceContent.value.length))
}

const editorExtensions = (isReadOnly: boolean) => [
  basicSetup,
  yaml(),
  EditorState.readOnly.of(isReadOnly),
  EditorView.editable.of(!isReadOnly),
  EditorView.lineWrapping,
  EditorView.updateListener.of(update => {
    if (update.docChanged) {
      sourceContent.value = update.state.doc.toString()
      lineCount.value = update.state.doc.lines
      if (!applyingDocument) {
        session.refreshDirty()
        scheduleAnalysis()
      }
    }
    if (update.docChanged || update.selectionSet) {
      const position = update.state.selection.main.head
      const line = update.state.doc.lineAt(position)
      cursorLine.value = line.number
      cursorColumn.value = position - line.from + 1
    }
  }),
  ...codeMirrorThemeExtensions,
]

const createEditor = () => {
  if (!editorHost.value) return
  editor?.destroy()
  editor = new EditorView({
    state: EditorState.create({ doc: '', extensions: editorExtensions(true) }),
    parent: editorHost.value,
  })
}

const replaceDocument = (content: string, isReadOnly: boolean) => {
  if (!editor) return
  applyingDocument = true
  editor.setState(EditorState.create({ doc: content, extensions: editorExtensions(isReadOnly) }))
  applyingDocument = false
  sourceContent.value = editor.state.doc.toString()
  sourceSize.value = new TextEncoder().encode(content).length
  lineCount.value = editor.state.doc.lines
  cursorLine.value = 1
  cursorColumn.value = 1
}

const applySnapshot = async (snapshot: TextDocumentSnapshot) => {
  signature.value = snapshot.signature
  encoding.value = snapshot.encoding
  fileSize.value = snapshot.size
  modified.value = snapshot.modified
  readOnlyReason.value = snapshot.readOnlyReason || ''
  dirty.value = false
  replaceDocument(snapshot.content, Boolean(snapshot.readOnlyReason))
  registerCurrentTab(snapshot)
  await analyzeContent(editor?.state.doc.toString() || '')
}

const restoreTabDraft = async (tab: TabInfo) => {
  signature.value = tab.textSignature || ''
  encoding.value = tab.textEncoding || 'utf-8'
  fileSize.value = tab.textSize || 0
  modified.value = tab.textModified || 0
  readOnlyReason.value = tab.textReadOnlyReason || ''
  dirty.value = true
  replaceDocument(tab.content || '', Boolean(tab.textReadOnlyReason))
  session.bind(); store.activateTab(tab.id)
  await analyzeContent(tab.content || '')
}

const load = async (discardDraft = false) => {
  const hadPrior = session.hasDocument()
  loadGeneration++; analysisGeneration++; clearAnalysisTimer()
  const owner = session.capture()
  if (!owner) return
  session.cancelChange(); session.closeConflict(); nodeMenu.close()
  duplicateVisible.value=false;duplicatePending.value=false;duplicateOwner=undefined;duplicateEntry.value=null;pendingDuplicate=undefined;resumeDuplicate=false
  copyRequest=undefined;copyOwner=undefined;pendingCopyReveal=undefined;copyPending.value=false;copyError.value='';copyEntry.value=null
  moveRequest=undefined;moveOwner=undefined;pendingMoveReveal=undefined;movePending.value=false;moveError.value='';moveEntry.value=null
  sequenceVisible.value=false;sequencePending.value=false;sequenceOwner=undefined;sequenceEntry.value=null;pendingSequence=undefined;resumeSequence=false
  fieldVisible.value=false;fieldPending.value=false;fieldOwner=undefined;fieldEntry.value=null;pendingField=undefined;resumeField=false
  renameVisible.value = false; renamePending.value = false; renameOwner = undefined; renameEntry.value = null; pendingRename = undefined; resumeRename = false; selectedFieldStart.value = undefined
  valueEditVisible.value = false; valueEditPending.value = false; valueOwner = undefined; valueEntry.value = null; pendingValuePreview = undefined; resumeValue=false;valueOriginalText.value='';valueReadFailed.value=false
  loading.value = true; loadError.value = ''
  if (!hadPrior) analysis.value = null

  try {
    if (!owner.path || !['yaml'].includes(owner.format)) throw new Error('当前路径不是已注册的结构化文件')
    await session.waitForWrite(owner)
    if (!session.unchanged(owner)) return
    const draft = currentTab.value
    if (!discardDraft && draft?.isDirty && draft.content !== undefined) { await restoreTabDraft(draft); return }
    const snapshot = await invoke<TextDocumentSnapshot>(owner.external ? 'read_external_text_document' : 'read_text_document', {
      ...(owner.external ? {} : {libraryRoot:owner.root}), path:owner.path, formatId:owner.format })
    if (!session.unchanged(owner)) return
    await applySnapshot(snapshot)
  } catch (error) {
    if (session.owns(owner)) {
      const detail = (error as {message?:string})?.message || String(error)
      if (hadPrior) message.error('重新读取失败，原内容与草稿仍保留：' + detail)
      else loadError.value = detail
    }
  } finally { if (session.owns(owner)) loading.value = false }
}

const byteOffsetToCodeUnit = (content: string, byteOffset: number) => {
  const bytes = new TextEncoder().encode(content)
  return new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(0, Math.min(byteOffset, bytes.length))).length
}

const revealRange = (range: Pick<YamlDiagnostic, 'start' | 'end'>) => {
  outlineNav.selectRange(range)
  if (analyzedSource.value !== sourceContent.value) { message.info('正在更新定位，请稍候再试'); return }
  if (!editor) return
  const from = byteOffsetToCodeUnit(sourceContent.value, range.start)
  const to = Math.max(from, byteOffsetToCodeUnit(sourceContent.value, range.end))
  editor.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  })
  editor.focus()
}

const openSourceSearch = () => editor && openSearchPanel(editor)
const foldSource = () => editor && foldAll(editor)
const unfoldSource = () => editor && unfoldAll(editor)

const save = () => session.save()

const reloadFromDisk = () => session.reload()

const leaveEditor = () => router.push({ name: 'LibraryMode' })
watch([yamlPath, isExternal, () => store.libraryPath], () => { syncCurrentTab(); saving.value = false; void load() }, {flush:'sync'})
onMounted(async () => {
  await nextTick()
  createEditor()
  await load()

})

onBeforeUnmount(() => {
  clearAnalysisTimer()
  syncCurrentTab(dirty.value)
  editor?.destroy()
  editor = null

})
</script>

<style scoped>
.value-edit-actions{display:flex;justify-content:flex-end;gap:10px}
.yaml-value-edit-dialog code{display:block;overflow-wrap:anywhere;margin-bottom:10px}
.yaml-value-edit-dialog :deep(.n-card__content){overflow:auto}
.value-edit-error{color:var(--theme-danger,#d03050)}
.yaml-workspace {
  container-type: inline-size;
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--theme-bg);
  color: var(--theme-text);
}

.yaml-toolbar {
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: 54px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.document-identity,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.format-icon,
.valid {
  color: var(--theme-primary);
}

.yaml-workspace > :deep(.workspace-tabs) {
  flex: 0 0 34px;
}

.document-identity { flex: 1; }
.toolbar-actions { max-width: 100%; overflow-x: auto; padding-block: 2px; }
.toolbar-actions > * { flex-shrink: 0; }

.invalid,
.error {
  color: var(--theme-danger, #d03050);
}

.document-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.document-title strong {
  max-width: min(42vw, 520px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title span,
.inspector-heading span,
.syntax-summary span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.yaml-stage {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
}

.yaml-stage.inspector-hidden {
  grid-template-columns: minmax(0, 1fr);
}

.yaml-stage.inspector-hidden .inspector {
  display: none;
}

.source-pane {
  min-width: 0;
  min-height: 0;
  position: relative;
}

.editor-host {
  width: 100%;
  height: 100%;
}

.editor-host.hidden {
  visibility: hidden;
}

.editor-state {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}

.editor-state p {
  max-width: 640px;
  margin: 0;
  color: var(--theme-text-secondary);
}

.inspector {
  overflow: auto;
  min-height: 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: var(--theme-border);
  background: var(--theme-surface);
}

.inspector-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.inspector-heading > div {
  display: flex;
  flex-direction: column;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.metrics div {
  min-width: 0;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: var(--theme-border);
  border-radius: 8px;
  background: var(--theme-bg);
}

.metrics strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metrics span {
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.diagnostics h3 {
  margin: 0 0 6px;
  font-size: 12px;
}

.diagnostics button,
.outline-list button {
  width: 100%;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.diagnostics button {
  padding: 8px;
  display: flex;
  gap: 8px;
  border-radius: 7px;
  color: var(--theme-danger, #d03050);
  background: rgba(208, 48, 80, 0.08);
}

.diagnostics button span,
.outline-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}

.diagnostics small,
.outline-copy small {
  color: var(--theme-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.syntax-summary {
  padding: 9px;
  display: flex;
  gap: 8px;
  align-items: center;
  border-radius: 8px;
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.08);
}

.syntax-summary div {
  display: flex;
  flex-direction: column;
}

.outline-list {
  min-height: 96px;
  flex: 1;
  overflow: auto;
}

.outline-list button {
  min-height: 48px;
  padding-top: 6px;
  padding-right: 8px;
  padding-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-bottom: var(--theme-border);
}

.outline-list button:hover {
  background: rgba(var(--theme-primary-rgb), 0.07);
}

.outline-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-badge {
  padding: 1px 5px;
  border-radius: 8px;
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.1);
  font-size: var(--text-compact);
}

.empty-outline,
.outline-warning {
  padding: 18px 8px;
  color: var(--theme-text-secondary);
  font-size: 12px;
  text-align: center;
}

.outline-warning {
  color: var(--theme-warning, #f0a020);
}

.yaml-statusbar {
  flex-shrink: 0;
  overflow-x: auto;
  white-space: nowrap;
  min-height: 28px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-top: var(--theme-border);
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  font-size: 11px;
}

.yaml-statusbar > * { flex-shrink: 0; }

@container (max-width: 760px) {
  .yaml-toolbar {
    gap: 8px;
    padding-inline: 9px;
  }

  .document-title strong {
    max-width: 100%;
  }

  .toolbar-actions { width: 100%; }

  .yaml-stage {
    grid-template-columns: minmax(0, 1fr);
  }

  .yaml-stage:not(.inspector-hidden) {
    grid-template-rows: minmax(0, 1fr) minmax(0, 42%);
  }

  .inspector {
    border-left: 0;
    border-top: var(--theme-border);
  }

  .yaml-statusbar {
    gap: 8px;
    padding-inline: 9px;
  }

}

.inspector > :not(.outline-list) { flex-shrink: 0; }
.yaml-key-rename-dialog :deep(.n-card__content) { overflow:auto; }
.yaml-key-rename-dialog code { display:block; overflow-wrap:anywhere; margin-bottom:12px; }
.yaml-key-rename-dialog label { display:block; margin-bottom:6px; }
.outline-list button[aria-current="true"] { background:var(--theme-accent-hover); color:var(--theme-accent); }
.yaml-field-dialog :deep(.n-card__content) { overflow:auto; }
.yaml-field-dialog code { display:block; overflow-wrap:anywhere; margin-bottom:12px; }
.yaml-field-dialog label { display:block; margin:12px 0 6px; }
.yaml-sequence-dialog :deep(.n-card__content) { overflow:auto; }
.yaml-sequence-dialog code { display:block; overflow-wrap:anywhere; margin-bottom:12px; }
.yaml-sequence-dialog label { display:block; margin:12px 0 6px; }
</style>
