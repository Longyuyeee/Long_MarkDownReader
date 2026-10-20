<template>
  <div class="text-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" class="text-tabs" />
    <header class="text-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" :title="isExternal ? '返回资料库' : '返回知识库'" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <div class="document-title">
          <strong :title="textPath">{{ fileName }}</strong>
          <span>
            <template v-if="isExternal">外部文件 · </template>
            {{ format?.label || '文本' }}
            <template v-if="readOnlyReason"> · 只读预览</template>
            <template v-else-if="dirty"> · 未保存</template>
            <template v-else> · 已同步</template>
            <template v-if="isExternal && !readOnlyReason"> · 仅点击保存写回</template>
          </span>
        </div>
      </div>

      <div class="editor-actions" data-command-strip data-horizontal-wheel="always">
        <n-button-group v-if="isHtmlDocument" size="small" aria-label="HTML 工作模式">
          <n-button :type="viewMode === 'source' ? 'primary' : 'default'" @click="viewMode = 'source'">
            <template #icon><n-icon :component="CodeIcon" /></template>
            源码
          </n-button>
          <n-button :type="viewMode === 'preview' ? 'primary' : 'default'" @click="openSafePreview">
            <template #icon><n-icon :component="EyeIcon" /></template>
            安全预览
          </n-button>
        </n-button-group>
        <n-button
          v-if="isSensitiveEnv"
          secondary
          size="small"
          :type="sensitiveValuesHidden ? 'warning' : 'default'"
          :disabled="loading || saving"
          @click="sensitiveValuesHidden ? revealSensitiveValues() : hideSensitiveValues()"
        >
          {{ sensitiveValuesHidden ? '显示并编辑变量值' : '重新遮罩变量值' }}
        </n-button>
        <n-button v-if="viewMode === 'source'" quaternary circle size="small" title="撤销" :disabled="loading || readOnly" @click="runUndo">
          <template #icon><n-icon :component="UndoIcon" /></template>
        </n-button>
        <n-button v-if="viewMode === 'source'" quaternary circle size="small" title="重做" :disabled="loading || readOnly" @click="runRedo">
          <template #icon><n-icon :component="RedoIcon" /></template>
        </n-button>
        <n-button v-if="viewMode === 'source'" quaternary size="small" title="查找与替换" :disabled="loading" @click="openFind">
          <template #icon><n-icon :component="SearchIcon" /></template>
          查找替换
        </n-button>
        <n-button v-if="viewMode === 'source'" quaternary size="small" title="跳转到行" :disabled="loading" @click="openGoToLine">
          <template #icon><n-icon :component="ListOrderedIcon" /></template>
          跳转行
        </n-button>
        <n-button quaternary circle size="small" title="重新从磁盘读取" :disabled="loading || saving" @click="reloadCurrentEncoding">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
        <n-button type="primary" size="small" :disabled="loading || saving || readOnly || !dirty" @click="save()">
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ saving ? '保存中' : '保存' }}
        </n-button>
        <n-button v-if="format?.id === 'plain-text' && !isExternal" size="small" quaternary :disabled="loading || saving || readOnly || rangeMode" @click="showHistory = true">历史与差异</n-button>
      </div>
    </header>

    <section v-if="viewMode === 'source'" class="format-bar" aria-label="文本保存策略" data-horizontal-wheel="always">
      <label>
        <span>读取</span>
        <select v-model="readEncoding" :disabled="loading" @change="reloadCurrentEncoding">
          <option v-for="option in encodingOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label>
        <span>保存</span>
        <select v-model="saveEncoding" :disabled="loading || readOnly" @change="markPolicyDirty">
          <option v-for="option in encodingOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label>
        <span>BOM</span>
        <select v-model="saveBom" :disabled="loading || saveEncoding !== 'utf-8' || readOnly" @change="markPolicyDirty">
          <option value="none">无 BOM</option>
          <option value="utf-8">UTF-8 BOM</option>
        </select>
      </label>
      <label>
        <span>换行</span>
        <select v-model="saveLineEnding" :disabled="loading || readOnly" @change="markPolicyDirty">
          <option value="lf">LF</option>
          <option value="crlf">CRLF</option>
          <option value="cr">CR</option>
        </select>
      </label>
      <label class="newline-option">
        <input v-model="saveFinalNewline" type="checkbox" :disabled="loading || readOnly" @change="markPolicyDirty">
        <span>末尾换行</span>
      </label>
      <span v-if="format?.userCapability.level === 'basic-edit'" class="diagnostic-label">
        {{ sourceDiagnostics.length ? `基础检查 ${sourceDiagnostics.length} 项` : '基础检查通过' }}
      </span>
      <span v-if="encodingConfidence" class="confidence-label">{{ confidenceLabel }}</span>
      <span v-if="readOnlyReason" class="readonly-label">{{ readOnlyLabel }}</span>
    </section>

    <section v-else class="preview-bar" aria-label="安全网页预览说明">
      <div>
        <strong>安全网页预览</strong>
        <span>脚本、内联事件、嵌入页面、表单提交和外部资源已隔离。</span>
      </div>
      <span>预览当前草稿，不会自动保存</span>
    </section>

    <SearchMatchNavigation class="search-navigation" v-if="route.query.searchLocator && !searchNavigationClosed && !loading && !loadError"
      :query="String(route.query.searchNeedle || '')" :index="searchMatchIndex" :count="searchMatchCount" :scope="rangeMode ? '已加载内容' : '当前文档'"
      @move="moveSearchMatch" @refresh="revealSearchMatch(0, true)" @close="searchNavigationClosed = true" />
    <main class="editor-stage">
      <div v-if="loading" class="editor-state">
        <n-spin size="small" />
        <strong>正在读取文本</strong>
      </div>
      <div v-else-if="loadError" class="editor-state error">
        <strong>无法打开文本</strong>
        <p>{{ loadError }}</p>
        <n-button size="small" @click="load">重试</n-button>
      </div>
      <div v-show="!loading && !loadError && viewMode === 'source'" ref="editorHost" class="editor-host"></div>
      <iframe
        v-if="!loading && !loadError && viewMode === 'preview'"
        class="safe-preview-frame"
        title="HTML 安全网页预览"
        sandbox=""
        referrerpolicy="no-referrer"
        :srcdoc="safePreviewHtml"
      />
    </main>

    <TextConflictDialog v-if="conflict" :path="conflict.path" :library-root="conflict.root" :draft="conflict.draft" :format-id="conflict.format" :read-encoding="conflict.encoding" :save-policy="conflict.policy" :is-current="conflict.current" @close="conflict = null" @reload="useConflictDisk" @copy="finishTextConflictCopy" />
    <DocumentFindReplace ref="documentFind" :context-key="store.libraryPath+':'+textPath+':'+isExternal+':'+viewMode" :revision="store.tabs.find(t=>t.path===textPath)?.content" :capture="captureFindDocument" :is-current="isFindCurrent" :apply-change="applyFindChange" :reveal="revealFindMatch" />
    <TextHistoryDialog v-if="showHistory" :key="textPath" :library-root="store.libraryPath" :path="textPath" :draft="historyDraft" :max-count="store.maxHistoryCount" @close="showHistory = false" @replace="applyHistoryDraft" @copy="openHistoryCopy" />
    <footer class="status-bar">
      <div v-if="viewMode === 'source'">
        <span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span>
        <span>{{ lineCount }} 行</span>
        <span>{{ characterCount.toLocaleString() }} 字符</span>
      </div>
      <div v-else><span>安全预览当前内存草稿</span></div>
      <div>
        <span>{{ displayEncoding }}</span>
        <span>{{ saveLineEnding.toUpperCase() }}</span>
        <span>{{ formatBytes(fileSize) }}</span>
        <span v-if="rangeMode">{{ formatBytes(rangeNextOffset) }} / {{ formatBytes(fileSize) }}</span>
        <n-button v-if="rangeMode && !rangeEof" text size="tiny" :loading="loadingRange" @click="loadNextRange">
          继续加载
        </n-button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import TextConflictDialog, { type ConflictSnapshot } from '../components/TextConflictDialog.vue'
import SearchMatchNavigation from '../components/SearchMatchNavigation.vue'
import { searchRanges, wrapSearchIndex } from '../utils/searchLocation'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { runTextSave, waitForTextSave } from '../utils/pendingTextSaves'
import { beginWindowSave, recordWindowDraftActivity } from '../services/windowDrafts'
import { basicSetup } from 'codemirror'
import { autocompletion } from '@codemirror/autocomplete'
import { undo, redo, isolateHistory } from '@codemirror/commands'
import { lintGutter, linter } from '@codemirror/lint'
import { openSearchPanel, gotoLine } from '@codemirror/search'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { javascript, typescript } from '@codemirror/legacy-modes/mode/javascript'
import { python } from '@codemirror/legacy-modes/mode/python'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { go } from '@codemirror/legacy-modes/mode/go'
import { c, cpp, csharp, java, kotlin } from '@codemirror/legacy-modes/mode/clike'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { css, less, sCSS } from '@codemirror/legacy-modes/mode/css'
import { html } from '@codemirror/legacy-modes/mode/xml'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import {
  ArrowLeft as ArrowLeftIcon,
  Code2 as CodeIcon,
  Eye as EyeIcon,
  ListOrdered as ListOrderedIcon,
  Redo2 as RedoIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Undo2 as UndoIcon,
} from 'lucide-vue-next'
import { findFileFormat } from '../config/fileFormats'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import TextHistoryDialog from '../components/TextHistoryDialog.vue'
import DocumentFindReplace from '../components/DocumentFindReplace.vue'
import type {FindDocumentSnapshot,Replacement,TextSpan} from '../utils/documentFindReplace'
import { openManagedFile } from '../services/fileNavigation'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { type TabInfo, useAppStore } from '../store/app'
import {
  MAX_DIAGNOSTIC_SCAN_CHARS,
  codeCompletionSource,
  collectBasicSourceDiagnostics,
} from '../utils/codeEditingSupport'
import { createSafeHtmlPreview } from '../utils/safeHtmlPreview'
import { confirmAppAction } from '../services/appDialog'

interface TextDocumentError {
  code?: string
  message?: string
  recoverable?: boolean
  suggestion?: string
}

interface TextDocumentSnapshot {
  content: string
  encoding: string
  encodingConfidence: string
  bom: string
  lineEnding: string
  hasFinalNewline: boolean
  signature: string
  size: number
  modified: number
  readOnlyReason?: string
  path: string
}

interface TextDocumentRangeSnapshot {
  content: string
  encoding: string
  encodingConfidence: string
  bom: string
  lineEnding: string
  offset: number
  nextOffset: number
  eof: boolean
  size: number
  modified: number
  readOnlyReason: string
  path: string
}

const RANGE_BYTES = 512 * 1024
const encodingOptions = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' },
  { value: 'gb18030', label: 'GB18030' },
]

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const dialog = useDialog()
const editorHost = ref<HTMLElement | null>(null)
const textPath = computed(() => String(route.query.path || ''))
const isExternal = computed(() => route.query.external === '1')
const fileName = computed(() => textPath.value.split(/[\\/]/).pop() || '未命名文本')
const format = computed(() => findFileFormat(textPath.value))
const isSensitiveEnv = computed(() => format.value?.id === 'env')
const isHtmlDocument = computed(() => /\.html?$/i.test(textPath.value))
const currentTab = computed(() => store.tabs.find(tab => tab.path === textPath.value))
const loading = ref(true)
const showHistory = ref(false)
const historyDraft = computed(() => store.tabs.find(tab => tab.path === textPath.value)?.content || '')
const applyHistoryDraft = (content: string, partial = false) => {
  if (!editor || readOnly.value) return
  if (partial) {
    const before = editor.state.doc.toString(); let prefix = 0, suffix = 0
    while (prefix < before.length && prefix < content.length && before[prefix] === content[prefix]) prefix++
    while (suffix < before.length - prefix && suffix < content.length - prefix && before[before.length - suffix - 1] === content[content.length - suffix - 1]) suffix++
    editor.dispatch({ changes: { from: prefix, to: before.length - suffix, insert: content.slice(prefix, content.length - suffix) } })
  } else replaceDocument(content, false)
  dirty.value = true; syncCurrentTab(true)
}
const openHistoryCopy = (path: string) => { void openManagedFile(router, path) }
let loadedViewPath = '', viewTimer: ReturnType<typeof setTimeout> | undefined
const rememberTextPosition = () => { if (editor && loadedViewPath) rememberWorkspaceViewState(loadedViewPath, { scrollTop: editor.scrollDOM.scrollTop, scrollLeft: editor.scrollDOM.scrollLeft }) }
const queueTextPosition = () => { clearTimeout(viewTimer); viewTimer = setTimeout(rememberTextPosition, 150) }
const saving = ref(false)
const loadingRange = ref(false)
const loadError = ref('')
const dirty = ref(false)
const signature = ref('')
const detectedEncoding = ref('')
const encodingConfidence = ref('')
const readEncoding = ref('utf-8')
const sourceEncoding = ref('utf-8')
const saveEncoding = ref('utf-8')
const saveBom = ref<'none' | 'utf-8'>('none')
const saveLineEnding = ref<'lf' | 'crlf' | 'cr'>('lf')
const saveFinalNewline = ref(false)
const fileSize = ref(0)
const modified = ref(0)
const readOnlyReason = ref('')
const sensitiveRevealed = ref(false)
const rangeNextOffset = ref(0)
const rangeEof = ref(true)
const cursorLine = ref(1)
const cursorColumn = ref(1)
const lineCount = ref(1)
const characterCount = ref(0)
const viewMode = ref<'source' | 'preview'>('source')
const diagnosticSource = ref('')
const previewSource = ref('')
const readOnlyCompartment = new Compartment()
let editor: EditorView | null = null
let applyingDocument = false
let loadGeneration = 0

const readOnly = computed(() => Boolean(readOnlyReason.value))
const sensitiveValuesHidden = computed(() => isSensitiveEnv.value && !sensitiveRevealed.value)
const rangeMode = computed(() => readOnlyReason.value === 'large-file-range')
const readOnlyLabel = computed(() => {
  if (readOnlyReason.value === 'sensitive-values-hidden') return '敏感值已遮罩且不会进入索引'
  return rangeMode.value ? '大文件范围模式' : '文件只读'
})
const displayEncoding = computed(() => detectedEncoding.value || saveEncoding.value.toUpperCase())
const confidenceLabel = computed(() => ({
  certain: '编码已确认',
  detected: '编码自动检测',
  'user-selected': '编码由用户指定',
}[encodingConfidence.value] || encodingConfidence.value))
const sourceDiagnostics = computed(() => collectBasicSourceDiagnostics(diagnosticSource.value, isHtmlDocument.value))
const safePreviewHtml = computed(() => createSafeHtmlPreview(previewSource.value))

const normalizeEncoding = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized === 'utf-8' || normalized === 'gbk' || normalized === 'gb18030') return normalized
  return 'utf-8'
}

const syncCurrentTab = (isDirty = dirty.value) => {
  if (!editor || !textPath.value) return
  const tab = store.tabs.find(item => item.path === textPath.value)
  if (!tab) return
  tab.content = editor.state.doc.toString()
  tab.isDirty = isDirty
  tab.textSignature = signature.value
  tab.textEncoding = detectedEncoding.value
  tab.textEncodingConfidence = encodingConfidence.value
  tab.textReadEncoding = sourceEncoding.value
  tab.textSaveEncoding = saveEncoding.value
  tab.textSaveBom = saveBom.value
  tab.textSaveLineEnding = saveLineEnding.value
  tab.textSaveFinalNewline = saveFinalNewline.value
  tab.textReadOnlyReason = readOnlyReason.value
  tab.textRangeNextOffset = rangeNextOffset.value
  tab.textRangeEof = rangeEof.value
  tab.textSize = fileSize.value
  tab.textModified = modified.value
  recordWindowDraftActivity()
}

const registerCurrentTab = () => {
  store.addTab({
    id: textPath.value,
    title: fileName.value,
    path: textPath.value,
    isDirty: dirty.value,
    external: isExternal.value,
  })
  syncCurrentTab(dirty.value)
}

const restoreTabDraft = (tab: TabInfo) => {
  signature.value = tab.textSignature || ''
  detectedEncoding.value = tab.textEncoding || 'utf-8'
  encodingConfidence.value = tab.textEncodingConfidence || ''
  sourceEncoding.value = normalizeEncoding(tab.textReadEncoding || tab.textEncoding || 'utf-8')
  readEncoding.value = sourceEncoding.value
  saveEncoding.value = normalizeEncoding(tab.textSaveEncoding || sourceEncoding.value)
  saveBom.value = tab.textSaveBom === 'utf-8' ? 'utf-8' : 'none'
  saveLineEnding.value = (tab.textSaveLineEnding || tab.textLineEnding || 'lf') as 'lf' | 'crlf' | 'cr'
  saveFinalNewline.value = tab.textSaveFinalNewline ?? tab.textHasFinalNewline ?? false
  fileSize.value = tab.textSize || 0
  modified.value = tab.textModified || 0
  readOnlyReason.value = tab.textReadOnlyReason || ''
  rangeNextOffset.value = tab.textRangeNextOffset || 0
  rangeEof.value = tab.textRangeEof ?? true
  replaceDocument(tab.content || '', Boolean(tab.textReadOnlyReason))
  dirty.value = true
  store.activateTab(tab.id)
}

const codeLanguage = (): StreamParser<unknown> | null => {
  const lowerPath = textPath.value.toLowerCase()
  const extension = lowerPath.match(/\.[^.\\/]+$/)?.[0] || ''
  if (['.ts', '.tsx', '.mts', '.cts'].includes(extension)) return typescript
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) return javascript
  if (extension === '.py') return python
  if (extension === '.rs') return rust
  if (extension === '.go') return go
  if (extension === '.java') return java
  if (['.kt', '.kts'].includes(extension)) return kotlin
  if (['.cpp', '.cc', '.cxx', '.hpp'].includes(extension)) return cpp
  if (extension === '.cs') return csharp
  if (['.c', '.h'].includes(extension)) return c
  if (extension === '.ps1') return powerShell
  if (['.sh', '.bash', '.zsh'].includes(extension)) return shell
  if (extension === '.sql') return standardSQL
  if (extension === '.scss') return sCSS
  if (extension === '.less') return less
  if (extension === '.css') return css
  if (['.html', '.htm', '.vue'].includes(extension)) return html
  return null
}

const editorExtensions = (isReadOnly: boolean) => [
  keymap.of([{key:'Mod-f',run:view=>openSearchPanel(view)}]),
  basicSetup,
  ...(codeLanguage() ? [StreamLanguage.define(codeLanguage()!)] : []),
  readOnlyCompartment.of([
    EditorState.readOnly.of(isReadOnly),
    EditorView.editable.of(!isReadOnly),
  ]),
  EditorView.lineWrapping,
  autocompletion({ override: [codeCompletionSource(format.value?.id || '', isHtmlDocument.value)] }),
  linter(view => collectBasicSourceDiagnostics(
    view.state.sliceDoc(0, Math.min(view.state.doc.length, MAX_DIAGNOSTIC_SCAN_CHARS)),
    isHtmlDocument.value,
  ), { delay: 500 }),
  lintGutter(),
  EditorView.updateListener.of(update => {
    if (update.viewportChanged && !loading.value) queueTextPosition()
    if (update.docChanged) {
      searchMatchCount.value = null
      diagnosticSource.value = update.state.sliceDoc(0, Math.min(update.state.doc.length, MAX_DIAGNOSTIC_SCAN_CHARS))
      characterCount.value = update.state.doc.length
      lineCount.value = update.state.doc.lines
      if (!applyingDocument) {
        dirty.value = true
        syncCurrentTab(true)
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
    state: EditorState.create({ doc: '', extensions: editorExtensions(false) }),
    parent: editorHost.value,
  })
}

const replaceDocument = (content: string, isReadOnly: boolean) => {
  if (!editor) return
  applyingDocument = true
  editor.setState(EditorState.create({ doc: content, extensions: editorExtensions(isReadOnly) }))
  editor.dispatch({ effects: EditorView.scrollIntoView(0, { y: 'start', yMargin: 8 }) })
  applyingDocument = false
  characterCount.value = content.length
  diagnosticSource.value = content.slice(0, MAX_DIAGNOSTIC_SCAN_CHARS)
  lineCount.value = editor.state.doc.lines
  cursorLine.value = 1
  cursorColumn.value = 1
  dirty.value = false
}

const maskEnvValues = (content: string) => content
  .split(/\r?\n/)
  .map(line => {
    if (!line.trim() || line.trimStart().startsWith('#')) return line
    const match = line.match(/^(\s*(?:export\s+)?[^#=\s]+\s*=\s*)(.*)$/)
    if (!match || !match[2].trim()) return line
    return `${match[1]}••••••`
  })
  .join('\n')

const applySnapshot = (snapshot: TextDocumentSnapshot) => {
  signature.value = snapshot.signature
  detectedEncoding.value = snapshot.encoding
  encodingConfidence.value = snapshot.encodingConfidence
  sourceEncoding.value = normalizeEncoding(snapshot.encoding)
  readEncoding.value = sourceEncoding.value
  saveEncoding.value = sourceEncoding.value
  saveBom.value = snapshot.bom === 'utf-8' ? 'utf-8' : 'none'
  saveLineEnding.value = snapshot.lineEnding as 'lf' | 'crlf' | 'cr'
  saveFinalNewline.value = snapshot.hasFinalNewline
  fileSize.value = snapshot.size
  modified.value = snapshot.modified
  readOnlyReason.value = sensitiveValuesHidden.value
    ? 'sensitive-values-hidden'
    : (snapshot.readOnlyReason || '')
  rangeNextOffset.value = snapshot.size
  rangeEof.value = true
  replaceDocument(
    sensitiveValuesHidden.value ? maskEnvValues(snapshot.content) : snapshot.content,
    Boolean(readOnlyReason.value),
  )
  registerCurrentTab()
}

const applyRangeSnapshot = (snapshot: TextDocumentRangeSnapshot, replace: boolean) => {
  if (!replace && modified.value && snapshot.modified !== modified.value) {
    throw new Error('文件在分段读取期间已被外部修改，请重新加载首段')
  }
  detectedEncoding.value = snapshot.encoding
  encodingConfidence.value = snapshot.encodingConfidence
  sourceEncoding.value = normalizeEncoding(snapshot.encoding)
  readEncoding.value = sourceEncoding.value
  saveEncoding.value = sourceEncoding.value
  if (snapshot.offset === 0) {
    saveBom.value = snapshot.bom === 'utf-8' ? 'utf-8' : 'none'
    saveLineEnding.value = snapshot.lineEnding as 'lf' | 'crlf' | 'cr'
    modified.value = snapshot.modified
  }
  signature.value = ''
  fileSize.value = snapshot.size
  readOnlyReason.value = snapshot.readOnlyReason
  rangeNextOffset.value = snapshot.nextOffset
  rangeEof.value = snapshot.eof
  if (replace) {
    replaceDocument(snapshot.content, true)
  } else if (editor) {
    applyingDocument = true
    editor.dispatch({ changes: { from: editor.state.doc.length, insert: snapshot.content } })
    applyingDocument = false
    dirty.value = false
  }
  registerCurrentTab()
}

const errorMessage = (cause: unknown) => {
  const error = cause as TextDocumentError
  const detail = error?.message || String(cause).replace(/^Error:\s*/, '')
  return error?.suggestion ? `${detail} · ${error.suggestion}` : detail
}

const readRange = (offset: number, encoding?: string) => invoke<TextDocumentRangeSnapshot>(
  isExternal.value ? 'read_external_text_document_range' : 'read_text_document_range',
  {
    ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
    path: textPath.value,
    formatId: format.value?.id,
    offset,
    length: RANGE_BYTES,
    readOptions: encoding ? { encoding } : undefined,
  },
)

const load = async (encoding?: string, discardDraft = false) => {
  clearTimeout(viewTimer); rememberTextPosition(); loadedViewPath = ''; showHistory.value = false
  const generation = ++loadGeneration
  const requestedPath = textPath.value
  loading.value = true
  loadError.value = ''
  try {
    await waitForTextSave(requestedPath)
    if (generation !== loadGeneration || textPath.value !== requestedPath) return
    if (
      !textPath.value
      || format.value?.routeName !== 'TextEditor'
      || format.value.adapters.reader !== 'text'
    ) throw new Error('当前路径不是已注册的文本工作区文件')
    const draft = currentTab.value
    if (!discardDraft && draft?.isDirty && draft.content !== undefined) {
      restoreTabDraft(draft)
      return
    }
    const snapshot = await invoke<TextDocumentSnapshot>(
      isExternal.value ? 'read_external_text_document' : 'read_text_document',
      {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: textPath.value,
      formatId: format.value.id,
      readOptions: encoding ? { encoding } : undefined,
      },
    )
    if (generation !== loadGeneration) return
    applySnapshot(snapshot)
  } catch (cause) {
    const error = cause as TextDocumentError
    if (error?.code === 'read-too-large') {
      try {
        const snapshot = await readRange(0, encoding)
        if (generation !== loadGeneration) return
        applyRangeSnapshot(snapshot, true)
        message.warning('文件超过完整编辑上限，已进入只读范围模式')
      } catch (rangeError) {
        if (generation === loadGeneration) loadError.value = errorMessage(rangeError)
      }
    } else if (generation === loadGeneration) {
      loadError.value = errorMessage(cause)
    }
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
      loadedViewPath = requestedPath
      if (!route.query.searchLocator) {
        const view = recallWorkspaceViewState(requestedPath)
        await nextTick(); requestAnimationFrame(() => { if (editor && textPath.value === requestedPath) editor.scrollDOM.scrollTop = view?.scrollTop || 0 })
      }
    }
  }
}

const searchMatchIndex = ref(0)
const searchMatchCount = ref<number | null>(null)
const searchNavigationClosed = ref(false)
const moveSearchMatch = (direction: number) => revealSearchMatch(searchMatchCount.value === null ? 0 : searchMatchIndex.value + direction, true)
let locatedSearchToken = ''
const revealSearchMatch = (requestedIndex = 0, force = false) => {
  const token = String(route.query.searchLocator || '')
  if (!editor || loading.value || loadError.value || !token || (token === locatedSearchToken && !force)) return
  const needle = String(route.query.searchNeedle || '')
  if (!needle) return
  locatedSearchToken = token
  searchNavigationClosed.value = false
  const matches = searchRanges(editor.state.doc.toString(), needle)
  searchMatchCount.value = matches.length
  searchMatchIndex.value = wrapSearchIndex(requestedIndex, matches.length)
  const match = matches[searchMatchIndex.value]
  if (!match) {
    message.info(rangeMode.value
      ? '已加载的内容中未找到关键词，可以继续加载后使用文内查找。'
      : '当前内容中未找到关键词，内容可能已修改。可使用文内查找重新搜索。', { duration: 6000 })
    return
  }
  viewMode.value = 'source'
  editor.dispatch({ selection: { anchor: match.from, head: match.to }, effects: EditorView.scrollIntoView(match.from, { y: 'center' }) })
  editor.focus()
}
watch([() => route.query.searchLocator, loading], () => { void nextTick(() => revealSearchMatch()) })

const loadNextRange = async () => {
  if (!readOnlyReason.value || rangeEof.value || loadingRange.value) return
  loadingRange.value = true
  try {
    const snapshot = await readRange(rangeNextOffset.value, sourceEncoding.value)
    applyRangeSnapshot(snapshot, false)
  } catch (cause) {
    message.error(`继续加载失败：${errorMessage(cause)}`)
  } finally {
    loadingRange.value = false
  }
}

const conflict = ref<{path:string; root?:string; draft:string; format:string; encoding:string; policy:Record<string,unknown>; current:()=>boolean} | null>(null)
const useConflictDisk = (snapshot: ConflictSnapshot, protectedCopy?: string) => {
  if (!conflict.value?.current()) return
  applySnapshot({...snapshot, encodingConfidence:snapshot.encodingConfidence || '', readOnlyReason:snapshot.readOnlyReason || undefined})
  dirty.value = false; syncCurrentTab(false); conflict.value = null
  message.success(protectedCopy ? '已使用磁盘版本，原草稿保存在同目录：' + protectedCopy.split(/[\\/]/).pop() : '已使用磁盘版本，原草稿已保留在历史中')
}
const finishTextConflictCopy = (path:string) => { conflict.value = null; message.success('当前副本已保存：' + path.split(/[\\/]/).pop()) }
watch(textPath, () => { conflict.value = null }, {flush:'sync'})
const save = async () => {
  if (!editor || readOnly.value || !dirty.value || saving.value || !format.value) return
  saving.value = true
  const savedEditor = editor
  const savedPath = textPath.value
  const historyRoot = store.libraryPath, historyEnabled = !isExternal.value && format.value.id === 'plain-text', historyEncoding = sourceEncoding.value, historyMaxCount = store.maxHistoryCount
  const savedGeneration = loadGeneration
  const savedTab = store.tabs.find(item => item.path === savedPath)
  const isCurrent = () => editor === savedEditor && textPath.value === savedPath && loadGeneration === savedGeneration
  const content = editor.state.doc.toString()
  const command = isExternal.value ? 'write_external_text_document' : 'write_text_document'
  const args = {
    ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
    path: savedPath, formatId: format.value.id, content, expectedSignature: signature.value,
    savePolicy: { expectedSignature: signature.value, encoding: saveEncoding.value, bom: saveBom.value, lineEnding: saveLineEnding.value, hasFinalNewline: saveFinalNewline.value },
  }
  const finishWindowSave = beginWindowSave()
  return runTextSave(savedPath, async () => {
  try {
    const keepHistory = historyEnabled
    if (keepHistory) {
      const previous = await invoke<TextDocumentSnapshot>('read_text_document', { libraryRoot: historyRoot, path: savedPath, formatId: 'plain-text', readOptions: { encoding: historyEncoding } })
      await invoke('save_history_version', { libraryRoot: historyRoot, path: savedPath, content: previous.content, maxCount: historyMaxCount })
    }
    const snapshot = await invoke<TextDocumentSnapshot>(command, args)
    if (keepHistory) {
      try { await invoke('save_history_version', { libraryRoot: historyRoot, path: savedPath, content: snapshot.content, maxCount: historyMaxCount }) }
      catch { message.warning('文件已保存，本次历史快照未能创建') }
    }
    if (!isCurrent()) {
      // Only reconcile the original tab, never the newly selected document.
      if (savedTab && store.tabs.includes(savedTab)) {
        const unchanged = savedTab.content === content
          && savedTab.textSaveEncoding === args.savePolicy.encoding
          && savedTab.textSaveBom === args.savePolicy.bom
          && savedTab.textSaveLineEnding === args.savePolicy.lineEnding
          && savedTab.textSaveFinalNewline === args.savePolicy.hasFinalNewline
        savedTab.textSignature = snapshot.signature
        savedTab.textSize = snapshot.size
        savedTab.textModified = snapshot.modified
        if (unchanged) {
          savedTab.content = snapshot.content
          savedTab.isDirty = false
        }
      }
      return
    }
    if (savedEditor.state.doc.toString() === content
      && saveEncoding.value === args.savePolicy.encoding && saveBom.value === args.savePolicy.bom
      && saveLineEnding.value === args.savePolicy.lineEnding && saveFinalNewline.value === args.savePolicy.hasFinalNewline) {
      applySnapshot(snapshot)
    } else {
      signature.value = snapshot.signature
      fileSize.value = snapshot.size
      modified.value = snapshot.modified
      dirty.value = true
      syncCurrentTab(true)
    }
    message.success('文本已安全保存')
  } catch (cause) {
    const error = cause as TextDocumentError
    if (isCurrent() && error?.code === 'external-modified') {
      if (format.value?.id === 'plain-text') {
        const draft = savedEditor.state.doc.toString(), root = isExternal.value ? undefined : historyRoot
        const policy = {encoding:saveEncoding.value,bom:saveBom.value,lineEnding:saveLineEnding.value,hasFinalNewline:saveFinalNewline.value}
        conflict.value = {path:savedPath, root, draft, format:format.value.id, encoding:sourceEncoding.value, policy,
          current:()=>isCurrent() && (!root || store.libraryPath === root) && savedEditor.state.doc.toString() === draft && saveEncoding.value === policy.encoding && saveBom.value === policy.bom && saveLineEnding.value === policy.lineEnding && saveFinalNewline.value === policy.hasFinalNewline}
      } else {
        dialog.warning({title:'文件已在外部修改',content:errorMessage(cause),positiveText:'重新加载',negativeText:'保留编辑内容',onPositiveClick:()=>{if(isCurrent()) void load(sourceEncoding.value, true)}})
      }
    } else {
      message.error(`${savedPath.split(/[\\/]/).pop()} 保存失败：${errorMessage(cause)}`)
    }
  } finally {
    saving.value = false
  }
  }).finally(finishWindowSave)
}

const reloadCurrentEncoding = async () => {
  if (dirty.value && !await confirmAppAction(dialog, {
    title: '重新读取当前文件？',
    content: '磁盘内容将覆盖当前未保存的文本修改。',
    positiveText: '放弃修改并重新读取',
    danger: true,
  })) {
    readEncoding.value = sourceEncoding.value
    return
  }
  await load(readEncoding.value, true)
}

const markPolicyDirty = () => {
  if (!loading.value && !readOnly.value) {
    dirty.value = true
    syncCurrentTab(true)
  }
}

const runUndo = () => { if (editor) undo(editor) }
const runRedo = () => { if (editor) redo(editor) }
const documentFind=ref<InstanceType<typeof DocumentFindReplace>|null>(null)
type FindOwner={editor:EditorView;doc:unknown;path:string;root:string;generation:number;external:boolean;tab?:TabInfo;revision?:string}
const captureFindDocument=():FindDocumentSnapshot=>{
 if(!editor||loading.value||saving.value||loadingRange.value||loadError.value||viewMode.value!=='source')throw Error('正文正在读取或保存，请稍后再查找。')
 const selection=editor.state.selection.main,tab=store.tabs.find(t=>t.path===textPath.value)
 return {path:textPath.value,content:editor.state.doc.toString(),owner:{editor,doc:editor.state.doc,path:textPath.value,root:store.libraryPath,generation:loadGeneration,external:isExternal.value,tab,revision:tab?.content} satisfies FindOwner,
 selection:selection.empty?undefined:{from:selection.from,to:selection.to},label:rangeMode.value?'已加载文本（只读）':'当前文本',readOnlyReason:readOnly.value?'当前文本为只读，仍可查找；请解除只读后再替换。':undefined}
}
const isFindCurrent=(snapshot:FindDocumentSnapshot)=>{const owner=snapshot.owner as FindOwner;return editor===owner.editor&&editor.state.doc===owner.doc&&textPath.value===owner.path&&store.libraryPath===owner.root&&isExternal.value===owner.external&&loadGeneration===owner.generation&&!loading.value&&!saving.value&&!loadingRange.value&&!loadError.value&&viewMode.value==='source'&&(!owner.tab||store.tabs.includes(owner.tab)&&(owner.tab.content===owner.revision||owner.tab.content===snapshot.content))}
const applyFindChange=(snapshot:FindDocumentSnapshot,change:Replacement)=>{
 if(!isFindCurrent(snapshot)||readOnly.value||!editor)throw Error('文档或正文已有变化，当前草稿已保留。')
 if(change.content===snapshot.content)throw Error('替换内容与原文相同，没有修改。')
 recordWindowDraftActivity();editor.dispatch({changes:change.changes,selection:{anchor:change.last.from,head:change.last.to},annotations:[isolateHistory.of('full'),Transaction.userEvent.of('input.replace')]})
 return captureFindDocument()
}
const revealFindMatch=(snapshot:FindDocumentSnapshot,span:TextSpan)=>{if(isFindCurrent(snapshot)&&editor)editor.dispatch({selection:{anchor:span.from,head:span.to},effects:EditorView.scrollIntoView(span.from,{y:'center'})})}
const openFind=()=>documentFind.value?.open()

const openGoToLine = () => { if (editor) { gotoLine(editor); editor.focus() } }
const openSafePreview = () => {
  if (!editor || !isHtmlDocument.value) return
  previewSource.value = editor.state.doc.toString()
  viewMode.value = 'preview'
}
const revealSensitiveValues = () => {
  dialog.warning({
    title: '显示敏感变量值？',
    content: '原值只在当前文件工作面中显示。该文件仍不会进入全文索引或知识图谱，请确认周围环境安全。',
    positiveText: '显示并允许编辑',
    negativeText: '保持遮罩',
    onPositiveClick: () => {
      sensitiveRevealed.value = true
      void load(readEncoding.value)
    },
  })
}
const hideSensitiveValues = () => {
  if (dirty.value) {
    message.warning('请先保存或撤销当前修改，再重新遮罩变量值')
    return
  }
  sensitiveRevealed.value = false
  void load(readEncoding.value)
}
const leaveEditor = () => { void router.push('/library') }
const handleKeydown = (event: KeyboardEvent) => {
  if (!editor?.dom.isConnected) return
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='h'&&viewMode.value==='source'){event.preventDefault();event.stopImmediatePropagation();if(!document.querySelector('.n-modal'))openFind();return}
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}
const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

watch(saveEncoding, value => {
  if (value !== 'utf-8') saveBom.value = 'none'
})
watch([textPath, isExternal], () => {
  viewMode.value = 'source'
  sensitiveRevealed.value = Boolean(
    isSensitiveEnv.value && store.tabs.find(tab => tab.path === textPath.value)?.isDirty,
  )
  void load()
})
onMounted(async () => {
  createEditor()
  window.addEventListener('keydown', handleKeydown,true)
  await nextTick()
  await load()
})
onBeforeUnmount(() => {
  ++loadGeneration
  clearTimeout(viewTimer); rememberTextPosition()
  editor?.destroy()
  editor = null
  window.removeEventListener('keydown', handleKeydown,true)
})
</script>

<style scoped>
.text-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto auto minmax(0, 1fr) 28px;
  grid-template-areas:
    "tabs"
    "toolbar"
    "format"
    "search"
    "editor"
    "status";
  overflow: hidden;
  color: var(--theme-text);
  background: var(--theme-bg);
}

.text-tabs { grid-area: tabs; }
.text-toolbar { grid-area: toolbar; }
.format-bar { grid-area: format; }
.preview-bar { grid-area: format; }
.editor-stage { grid-area: editor; }
.status-bar { grid-area: status; }
.search-navigation { grid-area: search; }

.text-toolbar,
.format-bar,
.preview-bar,
.status-bar {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.text-toolbar {
  min-height: 48px;
  justify-content: space-between;
  padding: 0 12px;
}

.document-identity,
.editor-actions,
.status-bar > div {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.document-identity {
  flex: 1;
}

.editor-actions {
  flex: 0 0 auto;
}

.document-title {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.document-title strong {
  max-width: min(42vw, 520px);
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title span,
.status-bar {
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.format-bar {
  min-height: 38px;
  padding: 0 14px;
  gap: 18px;
  background: var(--theme-surface-2);
}

.preview-bar {
  justify-content: space-between;
  padding: 0 14px;
  color: var(--theme-text-secondary);
  background: color-mix(in srgb, var(--theme-primary) 7%, var(--theme-surface));
  font-size: var(--text-compact);
}

.preview-bar > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.preview-bar strong {
  color: var(--theme-primary);
  font-size: 12px;
}

.preview-bar span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.format-bar label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.format-bar select {
  height: 25px;
  padding: 0 24px 0 7px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.16);
  border-radius: 5px;
  color: var(--theme-text);
  background: var(--theme-surface);
  outline: none;
  font: inherit;
}

.format-bar select:focus {
  border-color: var(--theme-primary);
}

.newline-option input {
  accent-color: var(--theme-primary);
}

.confidence-label {
  margin-left: auto;
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
}

.diagnostic-label {
  margin-left: auto;
  color: var(--theme-text-secondary);
  font-size: var(--text-compact);
  white-space: nowrap;
}

.readonly-label {
  padding: 3px 7px;
  border: 1px solid rgba(184, 92, 46, 0.2);
  border-radius: 5px;
  color: #a5542d;
  background: rgba(184, 92, 46, 0.07);
  font-size: var(--text-compact);
  font-weight: 700;
}

.editor-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.editor-host {
  width: 100%;
  height: 100%;
}

.safe-preview-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.editor-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--theme-text-secondary);
  background: var(--theme-bg);
}

.editor-state strong {
  color: var(--theme-text);
  font-size: 12px;
}

.editor-state p {
  max-width: 560px;
  margin: 0;
  text-align: center;
  font-size: var(--text-compact);
}

.editor-state.error strong {
  color: #b84d48;
}

.status-bar {
  justify-content: space-between;
  padding: 0 14px;
  overflow: hidden;
  border-top: var(--theme-border);
  border-bottom: 0;
  background: var(--theme-surface);
  white-space: nowrap;
}

.status-bar > div {
  gap: 14px;
  overflow: hidden;
  white-space: nowrap;
}

.status-bar > div:last-child {
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .format-bar { min-height: 42px; padding: 6px 10px; gap: 8px; overflow-x: auto; }
  .preview-bar { min-height: 42px; padding: 6px 10px; }
  .document-title strong { max-width: 32vw; }
  .status-bar { padding: 0 8px; }
  .status-bar > div { gap: 7px; }
}
.text-workspace { container-type: inline-size; }
.text-toolbar { flex-wrap: wrap; padding-block: 6px; gap: 6px; }
.editor-actions { max-width: 100%; min-width: 0; overflow-x: auto; padding-block: 2px; }
.editor-actions > * { flex-shrink: 0; }
.format-bar { overflow-x: auto; padding-block: 5px; }
.format-bar > * { flex-shrink: 0; }
.preview-bar { min-height: 38px; padding-block: 6px; flex-wrap: wrap; }
.preview-bar > div { flex-wrap: wrap; }
.preview-bar span { white-space: normal; overflow: visible; }
.status-bar { overflow-x: auto; white-space: nowrap; }
.status-bar > * { flex-shrink: 0; }
@container (max-width: 900px) {
  .document-identity { flex: 1 1 100%; }
  .document-title strong { max-width: 100%; }
  .editor-actions { flex: 1 1 100%; }
  .format-bar { gap: 10px; padding-inline: 10px; }
}
</style>
