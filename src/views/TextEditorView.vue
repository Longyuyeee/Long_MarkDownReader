<template>
  <div class="text-workspace">
    <header class="text-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="leaveEditor">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <div class="document-title">
          <strong :title="textPath">{{ fileName }}</strong>
          <span>
            纯文本
            <template v-if="readOnlyReason"> · 只读预览</template>
            <template v-else-if="dirty"> · 未保存</template>
            <template v-else> · 已同步</template>
          </span>
        </div>
      </div>

      <div class="editor-actions">
        <n-button quaternary circle size="small" title="撤销" :disabled="loading || readOnly" @click="runUndo">
          <template #icon><n-icon :component="UndoIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重做" :disabled="loading || readOnly" @click="runRedo">
          <template #icon><n-icon :component="RedoIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="查找与替换" :disabled="loading" @click="openFind">
          <template #icon><n-icon :component="SearchIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="跳转到行" :disabled="loading" @click="openGoToLine">
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

    <section class="format-bar" aria-label="文本保存策略">
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
      <label class="autosave-option">
        <span>自动保存</span>
        <n-switch v-model:value="textAutoSaveEnabled" size="small" :disabled="readOnly" />
      </label>
      <span v-if="encodingConfidence" class="confidence-label">{{ confidenceLabel }}</span>
      <span v-if="readOnlyReason" class="readonly-label">{{ readOnlyLabel }}</span>
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
      <div v-show="!loading && !loadError" ref="editorHost" class="editor-host"></div>
    </main>

    <footer class="status-bar">
      <div>
        <span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span>
        <span>{{ lineCount }} 行</span>
        <span>{{ characterCount.toLocaleString() }} 字符</span>
      </div>
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
import { undo, redo } from '@codemirror/commands'
import { openSearchPanel, gotoLine } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import {
  ArrowLeft as ArrowLeftIcon,
  ListOrdered as ListOrderedIcon,
  Redo2 as RedoIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Undo2 as UndoIcon,
} from 'lucide-vue-next'
import { findFileFormat } from '../config/fileFormats'
import { useAppStore } from '../store/app'

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
const textAutoSaveEnabled = computed({
  get: () => store.textAutoSaveEnabled,
  set: (value: boolean) => { void store.updateConfig({ textAutoSaveEnabled: value }) },
})
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
const rangeNextOffset = ref(0)
const rangeEof = ref(true)
const cursorLine = ref(1)
const cursorColumn = ref(1)
const lineCount = ref(1)
const characterCount = ref(0)
const readOnlyCompartment = new Compartment()
let editor: EditorView | null = null
let applyingDocument = false
let loadGeneration = 0
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

const readOnly = computed(() => Boolean(readOnlyReason.value))
const rangeMode = computed(() => readOnlyReason.value === 'large-file-range')
const readOnlyLabel = computed(() => rangeMode.value ? '大文件范围模式' : '文件只读')
const displayEncoding = computed(() => detectedEncoding.value || saveEncoding.value.toUpperCase())
const confidenceLabel = computed(() => ({
  certain: '编码已确认',
  detected: '编码自动检测',
  'user-selected': '编码由用户指定',
}[encodingConfidence.value] || encodingConfidence.value))

const clearAutoSave = () => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = null
}

const scheduleAutoSave = () => {
  clearAutoSave()
  if (!textAutoSaveEnabled.value || loading.value || readOnly.value) return
  autoSaveTimer = setTimeout(() => { void save(true) }, 1500)
}

const normalizeEncoding = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized === 'utf-8' || normalized === 'gbk' || normalized === 'gb18030') return normalized
  return 'utf-8'
}

const editorExtensions = (isReadOnly: boolean) => [
  basicSetup,
  readOnlyCompartment.of([
    EditorState.readOnly.of(isReadOnly),
    EditorView.editable.of(!isReadOnly),
  ]),
  EditorView.lineWrapping,
  EditorView.updateListener.of(update => {
    if (update.docChanged) {
      characterCount.value = update.state.doc.length
      lineCount.value = update.state.doc.lines
      if (!applyingDocument) {
        dirty.value = true
        scheduleAutoSave()
      }
    }
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
      fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
      lineHeight: '1.65',
    },
    '.cm-content': { padding: '14px 0 48px' },
    '.cm-gutters': {
      color: 'var(--theme-text-secondary)',
      backgroundColor: 'var(--theme-surface-2)',
      borderRight: 'var(--theme-border)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'rgba(var(--theme-primary-rgb), 0.065)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(var(--theme-primary-rgb), 0.2) !important',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-panels': {
      color: 'var(--theme-text)',
      backgroundColor: 'var(--theme-surface)',
      borderColor: 'rgba(var(--theme-primary-rgb), 0.16)',
    },
    '.cm-textfield': {
      color: 'var(--theme-text)',
      backgroundColor: 'var(--theme-bg)',
      border: '1px solid rgba(var(--theme-primary-rgb), 0.2)',
    },
    '.cm-button': {
      color: 'var(--theme-text)',
      backgroundImage: 'none',
      backgroundColor: 'var(--theme-surface-2)',
      border: '1px solid rgba(var(--theme-primary-rgb), 0.18)',
    },
  }),
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
  applyingDocument = false
  characterCount.value = content.length
  lineCount.value = editor.state.doc.lines
  cursorLine.value = 1
  cursorColumn.value = 1
  dirty.value = false
  clearAutoSave()
}

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
  readOnlyReason.value = snapshot.readOnlyReason || ''
  rangeNextOffset.value = snapshot.size
  rangeEof.value = true
  replaceDocument(snapshot.content, Boolean(snapshot.readOnlyReason))
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

const load = async (encoding?: string) => {
  const generation = ++loadGeneration
  clearAutoSave()
  loading.value = true
  loadError.value = ''
  try {
    if (!textPath.value || format.value?.id !== 'plain-text') throw new Error('当前路径不是已注册的纯文本文件')
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
    if (!isExternal.value) store.recordRecentFile({ title: fileName.value, path: textPath.value })
  } catch (cause) {
    const error = cause as TextDocumentError
    if (error?.code === 'read-too-large') {
      try {
        const snapshot = await readRange(0, encoding)
        if (generation !== loadGeneration) return
        applyRangeSnapshot(snapshot, true)
        if (!isExternal.value) store.recordRecentFile({ title: fileName.value, path: textPath.value })
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

const save = async (isAutoSave = false) => {
  if (!editor || readOnly.value || !dirty.value || saving.value || !format.value) return
  clearAutoSave()
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
      scheduleAutoSave()
    }
    if (!isAutoSave) message.success('文本已安全保存')
  } catch (cause) {
    const error = cause as TextDocumentError
    if (error?.code === 'external-modified') {
      dialog.warning({
        title: '文件已在外部修改',
        content: errorMessage(cause),
        positiveText: '重新加载',
        negativeText: '保留编辑内容',
        onPositiveClick: () => { void load(sourceEncoding.value) },
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
  await load(readEncoding.value)
}

const markPolicyDirty = () => {
  if (!loading.value && !readOnly.value) {
    dirty.value = true
    scheduleAutoSave()
  }
}

const runUndo = () => { if (editor) undo(editor) }
const runRedo = () => { if (editor) redo(editor) }
const openFind = () => { if (editor) { openSearchPanel(editor); editor.focus() } }
const openGoToLine = () => { if (editor) { gotoLine(editor); editor.focus() } }
const mayLeave = () => !dirty.value || window.confirm('当前文本有未保存修改，确定离开吗？')
const leaveEditor = () => { void router.push('/library') }
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
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
watch(textAutoSaveEnabled, enabled => {
  if (enabled && dirty.value) scheduleAutoSave()
  else clearAutoSave()
})
watch([textPath, isExternal], () => { void load() })
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => (
  to.query.path === from.query.path && to.query.external === from.query.external
) || mayLeave())
onMounted(async () => {
  createEditor()
  await nextTick()
  await load()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  clearAutoSave()
  editor?.destroy()
  editor = null
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped>
.text-workspace {
  height: 100%;
  display: grid;
  grid-template-rows: 48px 38px minmax(0, 1fr) 28px;
  color: var(--theme-text);
  background: var(--theme-bg);
}

.text-toolbar,
.format-bar,
.status-bar {
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
  font-size: 9px;
}

.format-bar {
  padding: 0 14px;
  gap: 18px;
  background: var(--theme-surface-2);
}

.format-bar label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text-secondary);
  font-size: 9px;
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
  font-size: 9px;
}

.readonly-label {
  padding: 3px 7px;
  border: 1px solid rgba(184, 92, 46, 0.2);
  border-radius: 5px;
  color: #a5542d;
  background: rgba(184, 92, 46, 0.07);
  font-size: 9px;
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
  font-size: 10px;
}

.editor-state.error strong {
  color: #b84d48;
}

.status-bar {
  justify-content: space-between;
  padding: 0 14px;
  border-top: var(--theme-border);
  border-bottom: 0;
  background: var(--theme-surface);
}

.status-bar > div {
  gap: 14px;
}

@media (max-width: 760px) {
  .text-workspace { grid-template-rows: 48px auto minmax(0, 1fr) 32px; }
  .format-bar { min-height: 42px; padding: 6px 10px; gap: 8px; overflow-x: auto; }
  .format-bar label > span:first-child, .confidence-label { display: none; }
  .document-title strong { max-width: 32vw; }
  .status-bar { padding: 0 8px; }
  .status-bar > div { gap: 7px; }
}
</style>
