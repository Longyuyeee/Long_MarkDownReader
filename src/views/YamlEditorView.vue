<template>
  <div class="yaml-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />

    <header class="yaml-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" :title="isExternal ? '返回资料库' : '返回知识库'" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <n-icon :component="FileCodeIcon" size="22" class="format-icon" />
        <div class="document-title">
          <strong :title="yamlPath">{{ fileName }}</strong>
          <span aria-live="polite"><template v-if="isExternal">外部文件 · </template>YAML · {{ readOnly ? '只读' : dirty ? '有未保存修改' : '已保存' }}<template v-if="isExternal && !readOnly"> · 仅点击保存写回</template></span>
        </div>
      </div>

      <div class="toolbar-actions" data-command-strip data-horizontal-wheel="always">
        <n-button quaternary circle size="small" title="查找（Ctrl+F）" @click="openSourceSearch">
          <template #icon><n-icon :component="SearchIcon" /></template>
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
        <n-button quaternary circle size="small" :title="inspectorVisible ? '隐藏文档结构与问题' : '显示文档结构与问题'" :aria-pressed="inspectorVisible" @click="toggleInspector">
          <template #icon><n-icon :component="InspectorIcon" /></template>
        </n-button>
        <n-button
          type="primary"
          size="small"
          :loading="saving"
          :disabled="loading || readOnly || !dirty"
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
          aria-label="筛选 YAML 结构提纲"
        >
          <template #prefix><n-icon :component="SearchIcon" /></template>
        </n-input>

        <div class="outline-list">
          <button
            v-for="entry in filteredOutline"
            :key="`${entry.documentIndex}:${entry.start}:${entry.path}`"
            type="button"
            :style="{ paddingLeft: `${12 + Math.min(entry.depth, 8) * 14}px` }"
            @click="revealRange(entry)"
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
            {{ analysis?.valid ? '没有匹配的结构节点' : '修复语法后显示结构提纲' }}
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '../services/tauriRuntime'
import { basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
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
import { useResponsiveInspector } from '../composables/useResponsiveInspector'
import { findFileFormat } from '../config/fileFormats'
import { type TabInfo, useAppStore } from '../store/app'
import { STRUCTURED_ANALYSIS_BUSY_RETRY_MS, structuredAnalysisDelay } from '../utils/structuredAnalysis'
import { confirmAppAction } from '../services/appDialog'

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
let unlistenSave: (() => void) | null = null
let unlistenRefresh: (() => void) | null = null

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

const syncCurrentTab = (isDirty = dirty.value) => {
  if (!editor || !yamlPath.value) return
  const tab = store.tabs.find(item => item.path === yamlPath.value)
  if (!tab) return
  tab.content = editor.state.doc.toString()
  tab.isDirty = isDirty
  tab.textSignature = signature.value
  tab.textEncoding = encoding.value
  tab.textReadOnlyReason = readOnlyReason.value
  tab.textSize = fileSize.value
  tab.textModified = modified.value
}

const registerCurrentTab = () => {
  store.addTab({
    id: yamlPath.value,
    title: fileName.value,
    path: yamlPath.value,
    isDirty: dirty.value,
    external: isExternal.value,
  })
  syncCurrentTab(dirty.value)
}

const clearAnalysisTimer = () => {
  if (analysisTimer) clearTimeout(analysisTimer)
  analysisTimer = null
}

const analyzeContent = async (content: string) => {
  const generation = ++analysisGeneration
  analysisPending.value = true
  sourceSize.value = new TextEncoder().encode(content).length
  try {
    const result = await invoke<YamlSourceAnalysis>('analyze_yaml_source', { content })
    if (generation === analysisGeneration && sourceContent.value === content) analysis.value = result
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
        dirty.value = true
        syncCurrentTab(true)
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
  sourceContent.value = content
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
  registerCurrentTab()
  await analyzeContent(snapshot.content)
}

const restoreTabDraft = async (tab: TabInfo) => {
  signature.value = tab.textSignature || ''
  encoding.value = tab.textEncoding || 'utf-8'
  fileSize.value = tab.textSize || 0
  modified.value = tab.textModified || 0
  readOnlyReason.value = tab.textReadOnlyReason || ''
  dirty.value = true
  replaceDocument(tab.content || '', Boolean(tab.textReadOnlyReason))
  store.activateTab(tab.id)
  await analyzeContent(tab.content || '')
}

const load = async (discardDraft = false) => {
  const generation = ++loadGeneration
  analysisGeneration += 1
  analysisPending.value = false
  clearAnalysisTimer()
  loading.value = true
  loadError.value = ''
  analysis.value = null
  try {
    if (!yamlPath.value || format.value?.id !== 'yaml') throw new Error('当前路径不是已注册的 YAML 文件')
    const draft = currentTab.value
    if (!discardDraft && draft?.isDirty && draft.content !== undefined) {
      await restoreTabDraft(draft)
      return
    }
    const snapshot = await invoke<TextDocumentSnapshot>(isExternal.value ? 'read_external_text_document' : 'read_text_document', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: yamlPath.value,
      formatId: 'yaml',
      readOptions: undefined,
    })
    if (generation !== loadGeneration) return
    await applySnapshot(snapshot)
  } catch (cause) {
    if (generation === loadGeneration) loadError.value = errorMessage(cause)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

const byteOffsetToCodeUnit = (content: string, byteOffset: number) => {
  const bytes = new TextEncoder().encode(content)
  return new TextDecoder().decode(bytes.slice(0, Math.min(byteOffset, bytes.length))).length
}

const revealRange = (range: Pick<YamlDiagnostic, 'start' | 'end'>) => {
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

const save = async (allowInvalid = false) => {
  if (!editor || readOnly.value || !dirty.value || saving.value) return
  clearAnalysisTimer()
  const content = editor.state.doc.toString()
  saving.value = true
  try {
    const currentAnalysis = await analyzeContent(content)
    if (!currentAnalysis.valid && !allowInvalid) {
      dialog.warning({
        title: '源码存在 YAML 语法错误',
        content: '覆盖保存会让磁盘文件保持非法状态。可以继续编辑修复，或明确按当前源码保存。',
        positiveText: '按源码保存',
        negativeText: '继续编辑',
        onPositiveClick: () => { void save(true) },
      })
      return
    }
    const snapshot = await invoke<TextDocumentSnapshot>(isExternal.value ? 'write_external_yaml_source_document' : 'write_yaml_source_document', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: yamlPath.value,
      content,
      expectedSignature: signature.value,
      allowInvalid,
    })
    if (editor.state.doc.toString() === content) {
      await applySnapshot(snapshot)
    } else {
      signature.value = snapshot.signature
      encoding.value = snapshot.encoding
      fileSize.value = snapshot.size
      modified.value = snapshot.modified
      dirty.value = true
      syncCurrentTab(true)
      scheduleAnalysis()
    }
    message.success(currentAnalysis.valid ? 'YAML 源码已安全保存' : '非法 YAML 已按源码保存')
  } catch (cause) {
    const error = cause as { code?: string }
    if (error?.code === 'external-modified') {
      dialog.warning({
        title: '文件已在外部修改',
        content: errorMessage(cause),
        positiveText: '重新加载',
        negativeText: '保留编辑内容',
        onPositiveClick: () => { void load(true) },
      })
    } else {
      message.error(`保存失败：${errorMessage(cause)}`)
    }
  } finally {
    saving.value = false
  }
}

const reloadFromDisk = async () => {
  if (dirty.value && !await confirmAppAction(dialog, {
    title: '重新读取 YAML？',
    content: '磁盘源码将覆盖当前未保存的 YAML 修改。',
    positiveText: '放弃修改并重新读取',
    danger: true,
  })) return
  await load(true)
}

const leaveEditor = () => router.push({ name: 'LibraryMode' })
const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}

watch([yamlPath, isExternal], (_current, [previousPath]) => {
  if (previousPath) syncCurrentTab(dirty.value)
  void load()
})

onMounted(async () => {
  await nextTick()
  createEditor()
  await load()
  window.addEventListener('keydown', handleKeydown)
  unlistenSave = await listen('command-save', () => { void save() })
  unlistenRefresh = await listen('command-refresh', () => { void reloadFromDisk() })
})

onBeforeUnmount(() => {
  clearAnalysisTimer()
  syncCurrentTab(dirty.value)
  editor?.destroy()
  editor = null
  window.removeEventListener('keydown', handleKeydown)
  unlistenSave?.()
  unlistenRefresh?.()
})
</script>

<style scoped>
.yaml-workspace {
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
  min-height: 54px;
  padding: 0 14px;
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
  min-height: 0;
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

@media (max-width: 900px) {
  .yaml-stage {
    grid-template-columns: minmax(0, 1fr) minmax(240px, 42vw);
  }

  .toolbar-actions :deep(.n-button:nth-child(2)),
  .toolbar-actions :deep(.n-button:nth-child(3)) {
    display: none;
  }
}

@media (max-width: 760px) {
  .yaml-toolbar {
    gap: 8px;
    padding-inline: 9px;
  }

  .document-title strong {
    max-width: 34vw;
  }

  .yaml-stage {
    grid-template-columns: minmax(0, 1fr);
  }

  .yaml-stage:not(.inspector-hidden) .source-pane {
    display: none;
  }

  .inspector {
    border-left: 0;
  }

  .yaml-statusbar {
    gap: 8px;
    padding-inline: 9px;
  }

  .yaml-statusbar span:nth-child(3),
  .yaml-statusbar span:nth-child(5) {
    display: none;
  }
}
</style>
