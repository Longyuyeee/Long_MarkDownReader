<template>
  <div class="json-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />

    <header class="json-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <FileJsonIcon :size="18" />
        <div class="document-title">
          <strong>{{ fileName }}</strong>
          <span>{{ formatLabel }} · 源码预览</span>
        </div>
      </div>
      <n-button quaternary circle size="small" title="重新读取并分析" :loading="loading" @click="load">
        <template #icon><n-icon :component="RefreshIcon" /></template>
      </n-button>
    </header>

    <div v-if="loadError" class="load-error" role="alert">
      <AlertIcon :size="18" />
      <span>{{ loadError }}</span>
      <n-button size="small" @click="load">重试</n-button>
    </div>

    <main v-else class="json-main">
      <section class="source-pane" aria-label="JSON 源码">
        <div v-if="loading" class="loading-state">
          <n-spin size="small" />
          <span>正在读取并分析</span>
        </div>
        <div ref="editorHost" class="editor-host"></div>
      </section>

      <aside class="analysis-pane" aria-label="JSON 诊断">
        <div class="analysis-header">
          <div>
            <span class="section-label">解析状态</span>
            <strong :class="analysis?.valid ? 'valid' : 'invalid'">
              {{ analysis?.valid ? '语法有效' : '需要修复' }}
            </strong>
          </div>
          <n-tag size="small" :bordered="false">{{ formatLabel }}</n-tag>
        </div>

        <div class="metric-grid">
          <div><span>根节点</span><strong>{{ rootKindLabel }}</strong></div>
          <div><span>节点</span><strong>{{ analysis?.nodeCount ?? 0 }}</strong></div>
          <div><span>属性</span><strong>{{ analysis?.propertyCount ?? 0 }}</strong></div>
          <div><span>最大深度</span><strong>{{ analysis?.maxDepth ?? 0 }}</strong></div>
          <div><span>注释</span><strong>{{ analysis?.commentCount ?? 0 }}</strong></div>
          <div><span>源码大小</span><strong>{{ formatBytes(snapshot?.size ?? 0) }}</strong></div>
        </div>

        <div class="structure-status">
          <ShieldCheckIcon v-if="analysis?.structureEditCandidate" :size="17" />
          <ShieldAlertIcon v-else :size="17" />
          <div>
            <strong>{{ analysis?.structureEditCandidate ? '可安全进入结构编辑' : '暂不进入结构编辑' }}</strong>
            <span>{{ structureStatusText }}</span>
          </div>
        </div>

        <div class="diagnostic-heading">
          <strong>诊断</strong>
          <span>{{ analysis?.diagnostics.length ?? 0 }}</span>
        </div>
        <div v-if="!analysis?.diagnostics.length" class="empty-diagnostics">
          <CircleCheckIcon :size="18" />
          <span>未发现语法或数据保真风险</span>
        </div>
        <button
          v-for="(diagnostic, index) in analysis?.diagnostics"
          :key="`${diagnostic.code}-${diagnostic.start}-${index}`"
          class="diagnostic-item"
          :class="diagnostic.severity"
          type="button"
          @click="revealDiagnostic(diagnostic)"
        >
          <AlertCircleIcon :size="16" />
          <span>
            <strong>{{ diagnosticTitle(diagnostic.code) }}</strong>
            <small>第 {{ diagnostic.line }} 行，第 {{ diagnostic.column }} 列</small>
            <em>{{ diagnostic.message }}</em>
            <code v-if="diagnostic.path">{{ diagnostic.path }}</code>
          </span>
        </button>
      </aside>
    </main>

    <footer class="json-statusbar">
      <span>只读</span>
      <span>{{ snapshot?.encoding?.toUpperCase() || 'UTF-8' }}</span>
      <span>{{ lineCount }} 行</span>
      <span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span>
      <span v-if="format?.id === 'jsonc'">允许注释与尾随逗号</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertCircle as AlertCircleIcon,
  AlertTriangle as AlertIcon,
  ArrowLeft as ArrowLeftIcon,
  CircleCheck as CircleCheckIcon,
  FileJson as FileJsonIcon,
  RefreshCw as RefreshIcon,
  ShieldAlert as ShieldAlertIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-vue-next'
import { findFileFormat } from '../config/fileFormats'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { useAppStore } from '../store/app'

interface TextDocumentSnapshot {
  content: string
  encoding: string
  size: number
  path: string
}

interface JsonDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  start: number
  end: number
  line: number
  column: number
  path?: string
}

interface JsonSourceAnalysis {
  valid: boolean
  mode: 'json' | 'jsonc'
  rootKind?: string
  nodeCount: number
  propertyCount: number
  maxDepth: number
  commentCount: number
  duplicateKeyCount: number
  precisionSensitiveNumberCount: number
  structureEditCandidate: boolean
  diagnostics: JsonDiagnostic[]
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const editorHost = ref<HTMLElement | null>(null)
const jsonPath = computed(() => String(route.query.path || ''))
const format = computed(() => findFileFormat(jsonPath.value))
const formatLabel = computed(() => format.value?.label || 'JSON')
const fileName = computed(() => jsonPath.value.split(/[\\/]/).pop() || '未命名 JSON')
const loading = ref(true)
const loadError = ref('')
const snapshot = ref<TextDocumentSnapshot | null>(null)
const analysis = ref<JsonSourceAnalysis | null>(null)
const cursorLine = ref(1)
const cursorColumn = ref(1)
const lineCount = ref(1)
let editor: EditorView | null = null
let loadGeneration = 0

const rootKindLabel = computed(() => ({
  object: '对象',
  array: '数组',
  string: '字符串',
  number: '数字',
  boolean: '布尔值',
  null: 'Null',
}[analysis.value?.rootKind || ''] || '未解析'))

const structureStatusText = computed(() => {
  if (!analysis.value?.valid) return '语法有效后才能判断结构编辑兼容性'
  const risks: string[] = []
  if (analysis.value.duplicateKeyCount) risks.push(`${analysis.value.duplicateKeyCount} 个重复键`)
  if (analysis.value.precisionSensitiveNumberCount) risks.push(`${analysis.value.precisionSensitiveNumberCount} 个精度敏感数字`)
  return risks.length ? `${risks.join('、')}需要保留原始字面量` : '当前结构没有发现重复键或数字精度风险'
})

const editorExtensions = () => [
  basicSetup,
  json(),
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  EditorView.updateListener.of(update => {
    if (update.docChanged) lineCount.value = update.state.doc.lines
    if (update.docChanged || update.selectionSet) {
      const position = update.state.selection.main.head
      const line = update.state.doc.lineAt(position)
      cursorLine.value = line.number
      cursorColumn.value = position - line.from + 1
    }
  }),
  EditorView.theme({
    '&': {
      height: '100%',
      color: 'var(--theme-text)',
      backgroundColor: 'var(--theme-bg)',
      fontSize: '13px',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      lineHeight: '1.65',
    },
    '.cm-content': { padding: '14px 0 40px' },
    '.cm-gutters': {
      color: 'var(--theme-text-tertiary)',
      backgroundColor: 'var(--theme-surface)',
      borderRight: 'var(--theme-border)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'rgba(var(--theme-primary-rgb), 0.07)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(var(--theme-primary-rgb), 0.22) !important',
    },
  }),
]

const createEditor = () => {
  if (!editorHost.value) return
  editor?.destroy()
  editor = new EditorView({
    state: EditorState.create({ doc: '', extensions: editorExtensions() }),
    parent: editorHost.value,
  })
}

const replaceDocument = (content: string) => {
  if (!editor) return
  editor.setState(EditorState.create({ doc: content, extensions: editorExtensions() }))
  lineCount.value = editor.state.doc.lines
  cursorLine.value = 1
  cursorColumn.value = 1
}

const errorMessage = (cause: unknown) => {
  const value = cause as { message?: string; suggestion?: string }
  const detail = value?.message || String(cause).replace(/^Error:\s*/, '')
  return value?.suggestion ? `${detail} · ${value.suggestion}` : detail
}

const load = async () => {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = ''
  analysis.value = null
  try {
    if (!jsonPath.value || !['json', 'jsonc'].includes(format.value?.id || '')) {
      throw new Error('当前路径不是已注册的 JSON 或 JSONC 文件')
    }
    const loaded = await invoke<TextDocumentSnapshot>('read_text_document', {
      libraryRoot: store.libraryPath,
      path: jsonPath.value,
      formatId: format.value!.id,
      readOptions: undefined,
    })
    const result = await invoke<JsonSourceAnalysis>('analyze_json_source', {
      content: loaded.content,
      jsonc: format.value!.id === 'jsonc',
    })
    if (generation !== loadGeneration) return
    snapshot.value = loaded
    analysis.value = result
    replaceDocument(loaded.content)
    store.addTab({
      id: jsonPath.value,
      title: fileName.value,
      path: jsonPath.value,
      isDirty: false,
    })
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

const revealDiagnostic = (diagnostic: JsonDiagnostic) => {
  if (!editor || !snapshot.value) return
  const from = byteOffsetToCodeUnit(snapshot.value.content, diagnostic.start)
  const to = Math.max(from, byteOffsetToCodeUnit(snapshot.value.content, diagnostic.end))
  editor.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  })
  editor.focus()
}

const diagnosticTitle = (code: string) => ({
  'syntax-error': '语法错误',
  'duplicate-key': '重复对象键',
  'precision-sensitive-number': '数字精度风险',
  'source-too-large': '文件超过分析上限',
  'node-budget-exceeded': '节点超过分析上限',
  'empty-document': '空文档',
}[code] || code)

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

const leaveEditor = () => router.push({ name: 'LibraryMode' })

watch(jsonPath, () => { void load() })
onMounted(async () => {
  await nextTick()
  createEditor()
  await load()
})
onBeforeUnmount(() => editor?.destroy())
</script>

<style scoped>
.json-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--theme-text);
  background: var(--theme-bg);
}

.json-toolbar {
  flex: 0 0 48px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.document-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.document-identity > svg {
  flex: 0 0 auto;
  color: var(--theme-primary);
}

.document-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.document-title strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title span,
.section-label,
.metric-grid span,
.structure-status span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.json-main {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
}

.source-pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-host {
  width: 100%;
  height: 100%;
}

.loading-state {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--theme-text-secondary);
  background: var(--theme-bg);
}

.analysis-pane {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  border-left: var(--theme-border);
  background: var(--theme-surface);
}

.analysis-header,
.diagnostic-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.analysis-header > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.analysis-header strong {
  font-size: 15px;
}

.analysis-header .valid { color: var(--theme-success, #27804f); }
.analysis-header .invalid { color: var(--theme-error, #c33f3f); }

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-top: 16px;
  border: var(--theme-border);
  background: var(--theme-border-color);
}

.metric-grid > div {
  min-width: 0;
  height: 54px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 0 10px;
  background: var(--theme-bg);
}

.metric-grid strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-status {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  margin: 14px 0 18px;
  padding: 11px 0;
  border-top: var(--theme-border);
  border-bottom: var(--theme-border);
}

.structure-status > svg {
  margin-top: 1px;
  color: var(--theme-primary);
}

.structure-status > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.structure-status strong {
  font-size: 12px;
}

.structure-status span {
  line-height: 1.5;
}

.diagnostic-heading {
  margin-bottom: 8px;
  font-size: 12px;
}

.diagnostic-heading span {
  min-width: 22px;
  text-align: right;
  color: var(--theme-text-secondary);
}

.empty-diagnostics {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.empty-diagnostics svg {
  color: var(--theme-success, #27804f);
}

.diagnostic-item {
  width: 100%;
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 6px;
  padding: 10px;
  border: var(--theme-border);
  border-left: 3px solid var(--theme-warning, #b77813);
  border-radius: 4px;
  color: var(--theme-text);
  background: var(--theme-bg);
  text-align: left;
  cursor: pointer;
}

.diagnostic-item.error {
  border-left-color: var(--theme-error, #c33f3f);
}

.diagnostic-item:hover,
.diagnostic-item:focus-visible {
  background: var(--theme-surface-2);
  outline: none;
}

.diagnostic-item > svg {
  margin-top: 1px;
  color: var(--theme-warning, #b77813);
}

.diagnostic-item.error > svg {
  color: var(--theme-error, #c33f3f);
}

.diagnostic-item > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.diagnostic-item strong { font-size: 12px; }
.diagnostic-item small { color: var(--theme-text-secondary); font-size: 10px; }
.diagnostic-item em { font-size: 11px; font-style: normal; line-height: 1.45; }
.diagnostic-item code {
  overflow: hidden;
  color: var(--theme-primary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-error {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--theme-error, #c33f3f);
}

.load-error span {
  max-width: 620px;
  line-height: 1.6;
}

.json-statusbar {
  flex: 0 0 26px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 0 12px;
  border-top: var(--theme-border);
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  font-size: 10px;
}

@media (max-width: 780px) {
  .json-main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(260px, 1fr) minmax(180px, 42%);
  }

  .analysis-pane {
    border-top: var(--theme-border);
    border-left: 0;
  }

  .json-statusbar span:nth-child(2),
  .json-statusbar span:last-child {
    display: none;
  }
}
</style>
