<template>
  <div class="xml-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />
    <header class="toolbar">
      <div class="identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="router.push({ name: 'LibraryMode' })">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <n-icon :component="isSvg ? ImageIcon : FileCodeIcon" size="22" class="accent" />
        <div>
          <strong :title="xmlPath">{{ fileName }}</strong>
          <span aria-live="polite">{{ formatLabel }} · {{ readOnly ? '只读' : dirty ? '有未保存修改' : '已保存' }}</span>
        </div>
      </div>
      <div class="actions">
        <n-button quaternary circle size="small" title="查找" @click="editor && openSearchPanel(editor)">
          <template #icon><n-icon :component="SearchIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="折叠全部" @click="editor && foldAll(editor)">
          <template #icon><n-icon :component="FoldIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="展开全部" @click="editor && unfoldAll(editor)">
          <template #icon><n-icon :component="UnfoldIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重新读取" :disabled="loading" @click="reload">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" :title="inspectorVisible ? '隐藏元素导航与问题' : '显示元素导航与问题'" :aria-pressed="inspectorVisible" @click="toggleInspector">
          <template #icon><n-icon :component="InspectorIcon" /></template>
        </n-button>
        <n-button type="primary" size="small" :loading="saving" :disabled="loading || readOnly || !dirty" @click="save()">
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
        </n-button>
      </div>
    </header>

    <main class="stage" :class="{ 'inspector-hidden': !inspectorVisible }">
      <section class="source">
        <div v-if="loading" class="state"><n-spin size="small" /><strong>正在读取 {{ formatLabel }}</strong></div>
        <div v-else-if="loadError" class="state error">
          <n-icon :component="AlertIcon" size="24" /><strong>无法打开 {{ formatLabel }}</strong><p>{{ loadError }}</p>
          <n-button size="small" @click="load(true)">重试</n-button>
        </div>
        <div ref="editorHost" class="editor-host" :class="{ hidden: loading || loadError }" />
      </section>

      <aside class="inspector">
        <div class="heading">
          <div>
            <strong>{{ isSvg ? '安全预览与元素导航' : '元素导航与问题' }}</strong>
            <span>{{ analysisPending ? '正在更新结构分析，编辑不受影响' : '点击元素可定位，源码是保存依据' }}</span>
          </div>
          <n-spin v-if="analysisPending" size="small" />
          <n-icon v-else :component="analysis?.valid ? ValidIcon : AlertIcon" :class="analysis?.valid ? 'accent' : 'error'" size="20" />
        </div>
        <div class="metrics">
          <div><strong>{{ analysis?.elementCount?.toLocaleString() ?? 0 }}</strong><span>元素</span></div>
          <div><strong>{{ analysis?.attributeCount?.toLocaleString() ?? 0 }}</strong><span>属性</span></div>
          <div><strong>{{ analysis?.namespaceCount ?? 0 }}</strong><span>命名空间</span></div>
          <div><strong>{{ analysis?.maxDepth ?? 0 }}</strong><span>深度</span></div>
        </div>

        <section v-if="isSvg && previewUrl" class="svg-preview">
          <img :src="previewUrl" alt="SVG 净化预览" />
          <span>仅渲染安全白名单子集，不加载外部资源</span>
        </section>
        <section v-else-if="isSvg" class="valid-summary">
          <n-icon :component="ShieldOffIcon" />
          <div><strong>预览已阻断</strong><span>修复根元素、语法或资源上限诊断后恢复</span></div>
        </section>

        <section v-if="analysis?.diagnostics.length" class="diagnostics">
          <button v-for="item in analysis.diagnostics" :key="`${item.code}:${item.start}`" type="button" @click="reveal(item)">
            <n-icon :component="AlertIcon" />
            <span><strong>{{ diagnosticTitle(item.code) }}</strong><small>第 {{ item.line }} 行，第 {{ item.column }} 列</small><small>{{ item.message }}</small></span>
          </button>
        </section>
        <section v-else class="valid-summary">
          <n-icon :component="ValidIcon" />
          <div>
            <strong>安全且语法有效</strong>
            <span>根元素 {{ analysis?.rootName || '—' }} · 注释 {{ analysis?.commentCount ?? 0 }} · CDATA {{ analysis?.cdataCount ?? 0 }} · PI {{ analysis?.processingInstructionCount ?? 0 }}</span>
          </div>
        </section>

        <n-input v-model:value="query" clearable size="small" placeholder="筛选元素、路径或属性">
          <template #prefix><n-icon :component="SearchIcon" /></template>
        </n-input>
        <div class="outline">
          <button
            v-for="item in filteredOutline"
            :key="`${item.start}:${item.path}`"
            type="button"
            :style="{ paddingLeft: `${10 + Math.min(item.depth, 8) * 14}px` }"
            @click="reveal(item)"
          >
            <n-icon :component="TagIcon" />
            <span><strong>{{ item.name }}</strong><small>{{ item.path }}</small><small v-if="item.preview">{{ item.preview }}</small></span>
            <em v-if="item.attributeCount">{{ item.attributeCount }}</em>
          </button>
          <p v-if="!filteredOutline.length">{{ analysis?.valid || analysis?.previewAvailable ? '没有匹配的元素' : '修复诊断后显示结构树' }}</p>
          <p v-if="analysis?.outlineTruncated" class="warning">结构过大，仅显示受限范围</p>
        </div>
      </aside>
    </main>
    <footer>
      <span>{{ readOnly ? '只读' : dirty ? '源码已修改' : '源码编辑' }}</span><span>{{ encoding.toUpperCase() }}</span>
      <span>{{ lineCount.toLocaleString() }} 行</span><span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span><span>{{ formatBytes(sourceSize) }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '../services/tauriRuntime'
import { basicSetup } from 'codemirror'
import { xml } from '@codemirror/lang-xml'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import {
  AlertTriangle as AlertIcon, ArrowLeft as ArrowLeftIcon, CheckCircle2 as ValidIcon, Image as ImageIcon,
  FileCode2 as FileCodeIcon, FoldVertical as FoldIcon, PanelRight as InspectorIcon, RefreshCw as RefreshIcon,
  Save as SaveIcon, Search as SearchIcon, ShieldOff as ShieldOffIcon, Tags as TagIcon, UnfoldVertical as UnfoldIcon,
} from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { useResponsiveInspector } from '../composables/useResponsiveInspector'
import { findFileFormat } from '../config/fileFormats'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import { type TabInfo, useAppStore } from '../store/app'
import { STRUCTURED_ANALYSIS_BUSY_RETRY_MS, structuredAnalysisDelay } from '../utils/structuredAnalysis'

interface Snapshot { content: string; encoding: string; signature: string; size: number; modified: number; readOnlyReason?: string; path: string }
interface Diagnostic { severity: string; code: string; message: string; start: number; end: number; line: number; column: number; path?: string }
interface OutlineEntry { path: string; name: string; depth: number; attributeCount: number; start: number; end: number; line: number; column: number; preview: string }
interface Analysis {
  valid: boolean; rootName?: string; elementCount: number; attributeCount: number; namespaceCount: number; maxDepth: number
  commentCount: number; cdataCount: number; processingInstructionCount: number; doctypeCount: number
  outline: OutlineEntry[]; outlineTruncated: boolean; diagnostics: Diagnostic[]
  sanitizedSvg?: string; previewAvailable?: boolean; blockedElementCount?: number; blockedAttributeCount?: number; externalReferenceCount?: number
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const { inspectorVisible, toggleInspector } = useResponsiveInspector()
const editorHost = ref<HTMLElement | null>(null)
const xmlPath = computed(() => String(route.query.path || ''))
const format = computed(() => findFileFormat(xmlPath.value))
const isSvg = computed(() => format.value?.id === 'svg')
const formatLabel = computed(() => isSvg.value ? 'SVG' : 'XML')
const fileName = computed(() => xmlPath.value.split(/[\\/]/).pop() || `未命名 ${formatLabel.value}`)
const currentTab = computed(() => store.tabs.find(tab => tab.path === xmlPath.value))
const loading = ref(true), saving = ref(false), loadError = ref(''), dirty = ref(false), analysisPending = ref(false)
const sourceContent = ref(''), signature = ref(''), encoding = ref('utf-8'), readOnlyReason = ref(''), query = ref('')
const fileSize = ref(0), modified = ref(0), sourceSize = ref(0), lineCount = ref(1), cursorLine = ref(1), cursorColumn = ref(1)
const analysis = ref<Analysis | null>(null)
const previewUrl = ref('')
const readOnly = computed(() => Boolean(readOnlyReason.value))
const filteredOutline = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  const values = analysis.value?.outline || []
  return (needle ? values.filter(item => `${item.name} ${item.path} ${item.preview}`.toLocaleLowerCase().includes(needle)) : values).slice(0, 500)
})
let editor: EditorView | null = null
let loadGeneration = 0, analysisGeneration = 0, applying = false
let timer: ReturnType<typeof setTimeout> | null = null
let unlistenSave: (() => void) | null = null, unlistenRefresh: (() => void) | null = null

const errorText = (cause: unknown) => {
  const error = cause as { message?: string; suggestion?: string }
  const text = error?.message || String(cause).replace(/^Error:\s*/, '')
  return error?.suggestion ? `${text} · ${error.suggestion}` : text
}
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(1)} MiB`
const diagnosticTitle = (code: string) => ({
  'syntax-error': '语法错误', 'doctype-blocked': 'DOCTYPE 安全阻断', 'source-too-large': '超过分析上限',
  'analysis-budget-exceeded': '结构超过分析预算', 'root-element-count': '根元素错误', 'attribute-error': '属性错误',
  'svg-source-too-large': '超过 SVG 上限', 'svg-root-required': 'SVG 根元素错误',
  'svg-structure-budget-exceeded': '超过 SVG 结构预算',
  'svg-element-blocked': '元素已阻断', 'svg-attribute-blocked': '属性已阻断',
  'svg-processing-instruction-blocked': '处理指令已阻断', 'svg-sanitizer-failed': '净化失败',
}[code] || `${formatLabel.value} 诊断`)
const clearTimer = () => { if (timer) clearTimeout(timer); timer = null }
const updatePreview = (source?: string) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = source ? URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' })) : ''
}

const syncTab = (isDirty = dirty.value) => {
  const tab = store.tabs.find(item => item.path === xmlPath.value)
  if (!editor || !tab) return
  tab.content = editor.state.doc.toString(); tab.isDirty = isDirty; tab.textSignature = signature.value
  tab.textEncoding = encoding.value; tab.textReadOnlyReason = readOnlyReason.value; tab.textSize = fileSize.value; tab.textModified = modified.value
}
const registerTab = () => {
  store.addTab({ id: xmlPath.value, title: fileName.value, path: xmlPath.value, isDirty: dirty.value })
  syncTab()
}
const analyze = async (content: string) => {
  const generation = ++analysisGeneration
  analysisPending.value = true; sourceSize.value = new TextEncoder().encode(content).length
  try {
    const result = await invoke<Analysis>(isSvg.value ? 'analyze_svg_source' : 'analyze_xml_source', { content })
    if (generation === analysisGeneration && sourceContent.value === content) {
      analysis.value = result
      updatePreview(isSvg.value && result.previewAvailable ? result.sanitizedSvg : undefined)
    }
    return result
  } finally { if (generation === analysisGeneration) analysisPending.value = false }
}
const scheduleAnalysis = () => {
  clearTimer()
  timer = setTimeout(() => {
    timer = null
    if (analysisPending.value) {
      scheduleAnalysis()
      return
    }
    const content = sourceContent.value
    void analyze(content).catch(error => message.error(`实时分析失败：${errorText(error)}`))
  }, analysisPending.value ? STRUCTURED_ANALYSIS_BUSY_RETRY_MS : structuredAnalysisDelay(sourceContent.value.length))
}
const extensions = (locked: boolean) => [
  basicSetup, xml(), EditorState.readOnly.of(locked), EditorView.editable.of(!locked), EditorView.lineWrapping,
  EditorView.updateListener.of(update => {
    if (update.docChanged) {
      sourceContent.value = update.state.doc.toString(); lineCount.value = update.state.doc.lines
      if (!applying) { dirty.value = true; syncTab(true); scheduleAnalysis() }
    }
    if (update.docChanged || update.selectionSet) {
      const position = update.state.selection.main.head, line = update.state.doc.lineAt(position)
      cursorLine.value = line.number; cursorColumn.value = position - line.from + 1
    }
  }),
  ...codeMirrorThemeExtensions,
]
const replaceDocument = (content: string, locked: boolean) => {
  if (!editor) return
  applying = true; editor.setState(EditorState.create({ doc: content, extensions: extensions(locked) })); applying = false
  sourceContent.value = content; sourceSize.value = new TextEncoder().encode(content).length; lineCount.value = editor.state.doc.lines
}
const applySnapshot = async (value: Snapshot) => {
  signature.value = value.signature; encoding.value = value.encoding; fileSize.value = value.size; modified.value = value.modified
  readOnlyReason.value = value.readOnlyReason || ''; dirty.value = false; replaceDocument(value.content, Boolean(value.readOnlyReason)); registerTab()
  await analyze(value.content)
}
const restoreDraft = async (tab: TabInfo) => {
  signature.value = tab.textSignature || ''; encoding.value = tab.textEncoding || 'utf-8'; fileSize.value = tab.textSize || 0
  modified.value = tab.textModified || 0; readOnlyReason.value = tab.textReadOnlyReason || ''; dirty.value = true
  replaceDocument(tab.content || '', Boolean(tab.textReadOnlyReason)); store.activateTab(tab.id); await analyze(tab.content || '')
}
const load = async (discardDraft = false) => {
  const generation = ++loadGeneration
  analysisGeneration++; clearTimer(); loading.value = true; loadError.value = ''; analysis.value = null
  try {
    if (!xmlPath.value || !['xml', 'svg'].includes(format.value?.id || '')) throw new Error('当前路径不是已注册的 XML 或 SVG 文件')
    const draft = currentTab.value
    if (!discardDraft && draft?.isDirty && draft.content !== undefined) { await restoreDraft(draft); return }
    const value = await invoke<Snapshot>('read_text_document', { libraryRoot: store.libraryPath, path: xmlPath.value, formatId: format.value?.id, readOptions: undefined })
    if (generation === loadGeneration) await applySnapshot(value)
  } catch (error) { if (generation === loadGeneration) loadError.value = errorText(error) }
  finally { if (generation === loadGeneration) loading.value = false }
}
const reveal = (range: Pick<Diagnostic, 'start' | 'end'>) => {
  if (!editor) return
  const bytes = new TextEncoder().encode(sourceContent.value)
  const point = (offset: number) => new TextDecoder().decode(bytes.slice(0, Math.min(offset, bytes.length))).length
  const from = point(range.start), to = Math.max(from, point(range.end))
  editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) }); editor.focus()
}
const save = async (allowInvalid = false) => {
  if (!editor || readOnly.value || !dirty.value || saving.value) return
  clearTimer(); const content = editor.state.doc.toString(); saving.value = true
  try {
    const result = await analyze(content)
    if (!result.valid && !allowInvalid) {
      if (isSvg.value) {
        dialog.warning({
          title: 'SVG 不满足安全合同', content: '脚本、事件属性、外部引用或不受控元素不会写入磁盘。请根据诊断修复后再保存。',
          positiveText: '继续编辑',
        })
      } else {
        dialog.warning({
          title: 'XML 不满足安全有效性要求', content: '默认不会覆盖磁盘文件。可以继续修复，或明确按当前源码保存。',
          positiveText: '按源码保存', negativeText: '继续编辑', onPositiveClick: () => { void save(true) },
        })
      }
      return
    }
    const value = await invoke<Snapshot>(isSvg.value ? 'write_svg_source_document' : 'write_xml_source_document', {
      libraryRoot: store.libraryPath, path: xmlPath.value, content, expectedSignature: signature.value,
      ...(isSvg.value ? {} : { allowInvalid }),
    })
    if (editor.state.doc.toString() === content) await applySnapshot(value)
    else { signature.value = value.signature; encoding.value = value.encoding; fileSize.value = value.size; modified.value = value.modified; dirty.value = true; syncTab(true); scheduleAnalysis() }
    message.success(result.valid ? `${formatLabel.value} 源码已安全保存` : 'XML 已按源码保存')
  } catch (cause) {
    const error = cause as { code?: string }
    if (error?.code === 'external-modified') dialog.warning({
      title: '文件已在外部修改', content: errorText(cause), positiveText: '重新加载', negativeText: '保留编辑内容',
      onPositiveClick: () => { void load(true) },
    })
    else message.error(`保存失败：${errorText(cause)}`)
  } finally { saving.value = false }
}
const reload = async () => {
  if (dirty.value && !window.confirm(`重新读取会覆盖当前未保存的 ${formatLabel.value} 源码，是否继续？`)) return
  await load(true)
}
const keydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
}
watch(xmlPath, (_, previous) => { if (previous) syncTab(); void load() })
onMounted(async () => {
  await nextTick()
  if (editorHost.value) editor = new EditorView({ state: EditorState.create({ doc: '', extensions: extensions(true) }), parent: editorHost.value })
  await load(); window.addEventListener('keydown', keydown)
  unlistenSave = await listen('command-save', () => { void save() }); unlistenRefresh = await listen('command-refresh', () => { void reload() })
})
onBeforeUnmount(() => {
  clearTimer(); updatePreview(); syncTab(); editor?.destroy(); editor = null; window.removeEventListener('keydown', keydown); unlistenSave?.(); unlistenRefresh?.()
})
</script>

<style scoped>
.xml-workspace { width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: var(--theme-bg); }
.toolbar { min-height: 54px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: var(--theme-border); background: var(--theme-surface); }
.identity, .actions { min-width: 0; display: flex; align-items: center; gap: 8px; }
.identity > div, .heading > div { min-width: 0; display: flex; flex-direction: column; }
.identity strong { max-width: min(42vw, 520px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.identity span, .heading span, .valid-summary span { color: var(--theme-text-secondary); font-size: 11px; }
.accent { color: var(--theme-primary); }.error { color: var(--theme-danger, #d03050); }
.stage { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); }
.stage.inspector-hidden { grid-template-columns: minmax(0, 1fr); }
.stage.inspector-hidden .inspector { display: none; }
.source { min-width: 0; min-height: 0; position: relative; }.editor-host { width: 100%; height: 100%; }.editor-host.hidden { visibility: hidden; }
.state { position: absolute; inset: 0; z-index: 2; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; }
.state p { max-width: 640px; margin: 0; color: var(--theme-text-secondary); }
.inspector { min-height: 0; padding: 14px; display: flex; flex-direction: column; gap: 12px; border-left: var(--theme-border); background: var(--theme-surface); }
.heading { display: flex; align-items: center; justify-content: space-between; }
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.metrics div { padding: 8px 3px; display: flex; flex-direction: column; align-items: center; border: var(--theme-border); border-radius: 8px; background: var(--theme-bg); }
.metrics span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.svg-preview { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; border: var(--theme-border); border-radius: 8px; overflow: hidden; background: var(--theme-bg); }
.svg-preview img { width: 100%; height: 180px; object-fit: contain; }
.svg-preview span { padding: 0 8px 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); text-align: center; }
.diagnostics button, .outline button { width: 100%; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.diagnostics button { padding: 8px; display: flex; gap: 8px; border-radius: 7px; color: var(--theme-danger, #d03050); background: rgba(208,48,80,.08); }
.diagnostics span, .outline button span { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.diagnostics small, .outline small { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.valid-summary { padding: 9px; display: flex; gap: 8px; align-items: center; border-radius: 8px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); }
.valid-summary div { display: flex; flex-direction: column; }
.outline { min-height: 0; flex: 1; overflow: auto; }.outline button { min-height: 48px; padding-top: 6px; padding-right: 8px; padding-bottom: 6px; display: flex; align-items: center; gap: 7px; border-bottom: var(--theme-border); }
.outline button:hover { background: rgba(var(--theme-primary-rgb),.07); }.outline strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline em { padding: 1px 5px; border-radius: 8px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.1); font-size: var(--text-compact); font-style: normal; }
.outline > p { padding: 14px 6px; color: var(--theme-text-secondary); font-size: 12px; text-align: center; }.outline > p.warning { color: var(--theme-warning, #f0a020); }
footer { min-height: 28px; padding: 0 14px; display: flex; align-items: center; gap: 14px; border-top: var(--theme-border); color: var(--theme-text-secondary); background: var(--theme-surface); font-size: 11px; }
@media (max-width: 900px) { .stage { grid-template-columns: minmax(0, 1fr) minmax(240px, 42vw); } }
@media (max-width: 760px) {
  .toolbar { gap: 8px; padding-inline: 9px; }
  .identity strong { max-width: 34vw; }
  .stage { grid-template-columns: minmax(0, 1fr); }
  .stage:not(.inspector-hidden) .source { display: none; }
  .inspector { border-left: 0; }
  footer { gap: 8px; padding-inline: 9px; }
  footer span:nth-child(3), footer span:nth-child(5) { display: none; }
}
</style>
