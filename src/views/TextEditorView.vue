<template>
  <div class="text-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" class="text-tabs" />
    <header class="text-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <div class="document-title">
          <strong :title="textPath">{{ fileName }}</strong>
          <span>
            {{ format?.label || '文本' }}
            <template v-if="readOnlyReason"> · 只读预览</template>
            <template v-else-if="dirty"> · 未保存</template>
            <template v-else> · 已同步</template>
          </span>
        </div>
      </div>

      <div class="editor-actions">
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
        <n-button v-if="viewMode === 'source'" quaternary circle size="small" title="查找与替换" :disabled="loading" @click="openFind">
          <template #icon><n-icon :component="SearchIcon" /></template>
        </n-button>
        <n-button v-if="viewMode === 'source'" quaternary circle size="small" title="跳转到行" :disabled="loading" @click="openGoToLine">
          <template #icon><n-icon :component="ListOrderedIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重新从磁盘读取" :disabled="loading || saving" @click="reloadCurrentEncoding">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
        <n-button type="primary" size="small" :disabled="loading || saving || readOnly || !dirty" @click="save()">
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ saving ? '保存中' : '保存' }}
        </n-button>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { basicSetup } from 'codemirror'
import { autocompletion } from '@codemirror/autocomplete'
import { undo, redo } from '@codemirror/commands'
import { lintGutter, linter } from '@codemirror/lint'
import { openSearchPanel, gotoLine } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
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
import { type TabInfo, useAppStore } from '../store/app'
import {
  MAX_DIAGNOSTIC_SCAN_CHARS,
  codeCompletionSource,
  collectBasicSourceDiagnostics,
} from '../utils/codeEditingSupport'
import { createSafeHtmlPreview } from '../utils/safeHtmlPreview'

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
    if (update.docChanged) {
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
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = ''
  try {
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
    if (generation === loadGeneration) loading.value = false
  }
}

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

const save = async () => {
  if (!editor || readOnly.value || !dirty.value || saving.value || !format.value) return
  saving.value = true
  const content = editor.state.doc.toString()
  try {
    const snapshot = await invoke<TextDocumentSnapshot>(
      isExternal.value ? 'write_external_text_document' : 'write_text_document',
      {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: textPath.value,
      formatId: format.value.id,
      content,
      expectedSignature: signature.value,
      savePolicy: {
        expectedSignature: signature.value,
        encoding: saveEncoding.value,
        bom: saveBom.value,
        lineEnding: saveLineEnding.value,
        hasFinalNewline: saveFinalNewline.value,
      },
      },
    )
    if (editor.state.doc.toString() === content) {
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
    if (error?.code === 'external-modified') {
      dialog.warning({
        title: '文件已在外部修改',
        content: errorMessage(cause),
        positiveText: '重新加载',
        negativeText: '保留编辑内容',
        onPositiveClick: () => { void load(sourceEncoding.value, true) },
      })
    } else {
      message.error(`保存失败：${errorMessage(cause)}`)
    }
  } finally {
    saving.value = false
  }
}

const reloadCurrentEncoding = async () => {
  if (dirty.value && !window.confirm('重新读取会覆盖当前未保存内容，是否继续？')) {
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
const openFind = () => { if (editor) { openSearchPanel(editor); editor.focus() } }
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
  await nextTick()
  await load()
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
  window.removeEventListener('keydown', handleKeydown)
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
  grid-template-rows: auto 48px 38px minmax(0, 1fr) 28px;
  grid-template-areas:
    "tabs"
    "toolbar"
    "format"
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
  .text-workspace { grid-template-rows: auto 48px auto minmax(0, 1fr) 32px; }
  .format-bar { min-height: 42px; padding: 6px 10px; gap: 8px; overflow-x: auto; }
  .preview-bar { min-height: 42px; padding: 6px 10px; }
  .preview-bar > div span { display: none; }
  .format-bar label > span:first-child, .confidence-label { display: none; }
  .document-title strong { max-width: 32vw; }
  .status-bar { padding: 0 8px; }
  .status-bar > div { gap: 7px; }
}
</style>
