<template>
  <div class="log-workspace" @keydown="handleKeydown">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" class="log-tabs" />

    <header class="log-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="leaveViewer">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <div class="document-title">
          <strong :title="logPath">{{ fileName }}</strong>
          <span>{{ workspaceMode === 'viewer' ? '专业日志查看' : `日志编辑 · ${dirty ? '未保存' : '已保存'}` }}</span>
        </div>
      </div>

      <div class="toolbar-actions" data-command-strip data-horizontal-wheel="always">
        <n-button-group size="small" aria-label="日志工作模式">
          <n-button :type="workspaceMode === 'viewer' ? 'primary' : 'default'" @click="requestViewerMode">
            <template #icon><n-icon :component="EyeIcon" /></template>
            查看
          </n-button>
          <n-button :type="workspaceMode === 'editor' ? 'primary' : 'default'" @click="requestEditMode">
            <template #icon><n-icon :component="PencilIcon" /></template>
            编辑
          </n-button>
        </n-button-group>
        <template v-if="workspaceMode === 'viewer'">
          <label class="toggle-control">
            <span>自动刷新</span>
            <n-switch v-model:value="autoRefresh" size="small" />
          </label>
          <label class="toggle-control">
            <span>跟随尾部</span>
            <n-switch v-model:value="followTail" size="small" />
          </label>
          <n-button v-if="tailMode" size="small" secondary @click="loadFromStart">读取前段</n-button>
        </template>
        <n-button
          v-if="workspaceMode === 'editor'"
          size="small"
          type="primary"
          :loading="saving"
          :disabled="!dirty"
          @click="saveLog"
        >
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
        </n-button>
        <n-button quaternary circle size="small" title="重新读取日志" :disabled="loading || saving" @click="reload">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
      </div>
    </header>

    <section v-if="workspaceMode === 'viewer'" class="filter-bar" aria-label="日志筛选">
      <n-input v-model:value="query" clearable size="small" placeholder="筛选日志内容" aria-label="筛选日志内容">
        <template #prefix><n-icon :component="SearchIcon" /></template>
      </n-input>
      <div class="level-filter" role="group" aria-label="日志级别" data-horizontal-wheel="always">
        <button
          v-for="option in levelOptions"
          :key="option.value"
          type="button"
          :class="{ active: selectedLevel === option.value }"
          @click="selectedLevel = option.value"
        >
          {{ option.label }}
          <span>{{ levelCounts[option.value] }}</span>
        </button>
      </div>
      <span class="result-count">{{ filteredLines.length.toLocaleString() }} / {{ parsedLines.length.toLocaleString() }}</span>
    </section>

    <section v-else class="edit-bar" aria-label="日志编辑工具">
      <div class="edit-notice">
        <strong>编辑不会自动写入</strong>
        <span>自动刷新和尾部跟随已暂停；只有点击保存才会覆盖源日志。</span>
      </div>
      <div class="edit-actions">
        <n-button quaternary circle size="small" title="撤销" @click="runUndo">
          <template #icon><n-icon :component="UndoIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重做" @click="runRedo">
          <template #icon><n-icon :component="RedoIcon" /></template>
        </n-button>
      </div>
    </section>

    <main v-if="workspaceMode === 'viewer'" ref="viewport" class="log-stage" @scroll="handleScroll">
      <div v-if="loading" class="viewer-state"><n-spin size="small" /><strong>正在读取日志</strong></div>
      <div v-else-if="loadError" class="viewer-state error">
        <strong>无法读取日志</strong>
        <p>{{ loadError }}</p>
        <n-button size="small" @click="reload">重试</n-button>
      </div>
      <div v-else-if="!filteredLines.length" class="viewer-state">
        <strong>{{ parsedLines.length ? '没有匹配的日志' : '日志为空' }}</strong>
      </div>
      <ol v-else class="log-lines" :start="filteredLines[0]?.number || 1">
        <li
          v-for="line in filteredLines"
          :key="`${bufferGeneration}:${line.number}:${line.text}`"
          :class="`level-${line.level}`"
          :value="line.number"
        >
          <span v-if="line.timestamp" class="timestamp">{{ line.timestamp }}</span>
          <span class="line-text">{{ line.timestamp ? line.text.slice(line.timestamp.length) : line.text }}</span>
        </li>
      </ol>
    </main>

    <main v-else class="log-editor-stage">
      <div v-if="loading" class="viewer-state"><n-spin size="small" /><strong>正在准备日志编辑器</strong></div>
      <div v-else-if="loadError" class="viewer-state error"><strong>无法编辑日志</strong><p>{{ loadError }}</p></div>
      <div v-show="!loading && !loadError" ref="editorHost" class="log-editor-host" />
    </main>

    <footer class="status-bar">
      <div>
        <span>{{ encodingLabel }}</span>
        <span>{{ formatBytes(fileSize) }}</span>
        <template v-if="workspaceMode === 'viewer'">
          <span v-if="tailMode">末尾范围</span>
          <span v-if="bufferTrimmed">仅保留最近 {{ parsedLines.length.toLocaleString() }} 行</span>
        </template>
        <template v-else>
          <span>{{ lineCount.toLocaleString() }} 行</span>
          <span>行 {{ cursorLine }}，列 {{ cursorColumn }}</span>
        </template>
      </div>
      <div>
        <template v-if="workspaceMode === 'viewer'">
          <span v-if="refreshing">正在刷新</span>
          <span v-else>{{ autoRefresh ? '自动刷新已开启' : '自动刷新已暂停' }}</span>
          <n-button v-if="!rangeEof" text size="tiny" :loading="loadingMore" @click="loadMore">继续加载</n-button>
        </template>
        <span v-else>{{ saving ? '正在保存' : dirty ? '有未保存修改' : '源日志已同步' }}</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { basicSetup } from 'codemirror'
import { redo, undo } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import {
  ArrowLeft as ArrowLeftIcon,
  Eye as EyeIcon,
  Pencil as PencilIcon,
  Redo2 as RedoIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Undo2 as UndoIcon,
} from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'
import { findFileFormat } from '../config/fileFormats'
import { useAppStore } from '../store/app'

type LogLevel = 'all' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'other'
type WorkspaceMode = 'viewer' | 'editor'

interface TextDocumentError { code?: string; message?: string; suggestion?: string }
interface TextDocumentSnapshot {
  content: string
  encoding: string
  signature: string
  size: number
  modified: number
  readOnlyReason?: string
}
interface TextDocumentRangeSnapshot {
  content: string
  encoding: string
  offset: number
  nextOffset: number
  eof: boolean
  size: number
  modified: number
}
interface ParsedLogLine {
  number: number
  text: string
  timestamp: string
  level: Exclude<LogLevel, 'all'>
}

const RANGE_BYTES = 512 * 1024
const MAX_BUFFER_CHARS = 4 * 1024 * 1024
const MAX_LOG_EDIT_BYTES = 8 * 1024 * 1024
const REFRESH_INTERVAL_MS = 2000
const TIMESTAMP_PATTERN = /^(?:\s*\[?)((?:\d{4}[-/.]\d{2}[-/.]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)|(?:\d{2}:\d{2}:\d{2}(?:[.,]\d+)?))\]?/
const LEVEL_PATTERNS: Array<[Exclude<LogLevel, 'all' | 'other'>, RegExp]> = [
  ['error', /\b(?:error|fatal|panic|critical|crit)\b|失败|错误/i],
  ['warn', /\b(?:warn|warning)\b|警告/i],
  ['info', /\b(?:info|notice)\b|信息/i],
  ['debug', /\bdebug\b|调试/i],
  ['trace', /\b(?:trace|verbose)\b|跟踪/i],
]

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const viewport = ref<HTMLElement | null>(null)
const editorHost = ref<HTMLElement | null>(null)
const logPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => logPath.value.split(/[\\/]/).pop() || '未命名日志')
const format = computed(() => findFileFormat(logPath.value))
const currentTab = computed(() => store.tabs.find(tab => tab.path === logPath.value))
const workspaceMode = ref<WorkspaceMode>('viewer')
const loading = ref(true)
const loadingMore = ref(false)
const refreshing = ref(false)
const saving = ref(false)
const loadError = ref('')
const query = ref('')
const selectedLevel = ref<LogLevel>('all')
const autoRefresh = ref(true)
const followTail = ref(true)
const bufferText = ref('')
const firstLineNumber = ref(1)
const bufferTrimmed = ref(false)
const bufferGeneration = ref(0)
const encoding = ref('')
const fileSize = ref(0)
const modified = ref(0)
const nextOffset = ref(0)
const rangeEof = ref(true)
const tailMode = ref(false)
const dirty = ref(false)
const signature = ref('')
const lineCount = ref(1)
const cursorLine = ref(1)
const cursorColumn = ref(1)
let refreshTimer: ReturnType<typeof setInterval> | null = null
let unlistenSave: UnlistenFn | null = null
let editor: EditorView | null = null
let applyingDocument = false
let loadGeneration = 0

const classifyLevel = (line: string): Exclude<LogLevel, 'all'> => LEVEL_PATTERNS.find(([, pattern]) => pattern.test(line))?.[0] || 'other'
const parsedLines = computed<ParsedLogLine[]>(() => {
  const values = bufferText.value.split(/\r\n|\n|\r/)
  if (values.length > 1 && values[values.length - 1] === '') values.pop()
  return values.map((text, index) => ({
    number: firstLineNumber.value + index,
    text,
    timestamp: text.match(TIMESTAMP_PATTERN)?.[0] || '',
    level: classifyLevel(text),
  }))
})
const filteredLines = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return parsedLines.value.filter(line => (selectedLevel.value === 'all' || line.level === selectedLevel.value)
    && (!needle || line.text.toLocaleLowerCase().includes(needle)))
})
const levelOptions: Array<{ value: LogLevel; label: string }> = [
  { value: 'all', label: '全部' }, { value: 'error', label: '错误' },
  { value: 'warn', label: '警告' }, { value: 'info', label: '信息' },
  { value: 'debug', label: '调试' }, { value: 'trace', label: '跟踪' },
  { value: 'other', label: '其他' },
]
const levelCounts = computed<Record<LogLevel, number>>(() => {
  const counts: Record<LogLevel, number> = { all: parsedLines.value.length, error: 0, warn: 0, info: 0, debug: 0, trace: 0, other: 0 }
  for (const line of parsedLines.value) counts[line.level] += 1
  return counts
})
const encodingLabel = computed(() => encoding.value ? encoding.value.toUpperCase() : '检测编码中')

const errorMessage = (cause: unknown) => {
  const error = cause as TextDocumentError
  const detail = error?.message || String(cause).replace(/^Error:\s*/, '')
  return error?.suggestion ? `${detail} · ${error.suggestion}` : detail
}
const readRange = (offset: number) => invoke<TextDocumentRangeSnapshot>('read_text_document_range', {
  libraryRoot: store.libraryPath,
  path: logPath.value,
  formatId: 'log',
  offset,
  length: RANGE_BYTES,
  readOptions: offset > 0 && encoding.value ? { encoding: encoding.value } : undefined,
})
const readTailRange = async (size: number) => {
  const target = Math.max(0, size - RANGE_BYTES)
  let lastError: unknown
  for (let adjustment = 0; adjustment <= 8 && target + adjustment <= size; adjustment += 1) {
    try { return await readRange(target + adjustment) } catch (cause) { lastError = cause }
  }
  throw lastError
}
const trimBuffer = () => {
  if (bufferText.value.length <= MAX_BUFFER_CHARS) return
  const overflow = bufferText.value.length - MAX_BUFFER_CHARS
  const boundary = bufferText.value.indexOf('\n', overflow)
  const removeLength = boundary >= 0 ? boundary + 1 : overflow
  const removed = bufferText.value.slice(0, removeLength)
  firstLineNumber.value += removed.split(/\r\n|\n|\r/).length - 1
  bufferText.value = bufferText.value.slice(removeLength)
  bufferTrimmed.value = true
}
const scrollToTail = async () => {
  if (!followTail.value) return
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
}
const applyRangeSnapshot = async (snapshot: TextDocumentRangeSnapshot, replace: boolean) => {
  encoding.value = snapshot.encoding
  fileSize.value = snapshot.size
  modified.value = snapshot.modified
  nextOffset.value = snapshot.nextOffset
  rangeEof.value = snapshot.eof
  if (replace) {
    bufferText.value = snapshot.content
    firstLineNumber.value = 1
    bufferTrimmed.value = false
    bufferGeneration.value += 1
  } else if (snapshot.content) {
    bufferText.value += snapshot.content
    trimBuffer()
  }
  await scrollToTail()
}
const registerTab = () => {
  if (!logPath.value) return
  store.addTab({ id: logPath.value, title: fileName.value, path: logPath.value, isDirty: dirty.value })
}
const syncCurrentTab = () => {
  const tab = currentTab.value
  if (!tab) return
  tab.isDirty = dirty.value
  tab.content = editor?.state.doc.toString()
  tab.textSignature = signature.value
  tab.textEncoding = encoding.value
  tab.textSize = fileSize.value
  tab.textModified = modified.value
}

const load = async () => {
  if (workspaceMode.value !== 'viewer') return
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = ''
  try {
    if (!logPath.value || format.value?.id !== 'log') throw new Error('当前路径不是已注册的日志文件')
    const head = await readRange(0)
    if (generation !== loadGeneration) return
    encoding.value = head.encoding
    const snapshot = head.eof ? head : await readTailRange(head.size)
    if (generation !== loadGeneration) return
    tailMode.value = !head.eof
    await applyRangeSnapshot(snapshot, true)
    registerTab()
  } catch (cause) {
    if (generation === loadGeneration) loadError.value = errorMessage(cause)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}
const loadMore = async () => {
  if (loadingMore.value || rangeEof.value || tailMode.value) return
  loadingMore.value = true
  try { await applyRangeSnapshot(await readRange(nextOffset.value), false) }
  catch (cause) { loadError.value = errorMessage(cause) }
  finally { loadingMore.value = false }
}
const loadFromStart = async () => {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = ''
  try {
    const snapshot = await readRange(0)
    if (generation !== loadGeneration) return
    tailMode.value = false
    followTail.value = false
    await applyRangeSnapshot(snapshot, true)
  } catch (cause) {
    if (generation === loadGeneration) loadError.value = errorMessage(cause)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}
const pollForUpdates = async () => {
  if (workspaceMode.value !== 'viewer' || !autoRefresh.value || loading.value || loadingMore.value || refreshing.value || (!rangeEof.value && !tailMode.value)) return
  refreshing.value = true
  try {
    const previousSize = fileSize.value
    const previousModified = modified.value
    const snapshot = await readRange(nextOffset.value)
    if (snapshot.size < previousSize || snapshot.nextOffset < nextOffset.value || (snapshot.size === previousSize && snapshot.modified !== previousModified)) {
      await load()
      return
    }
    if (snapshot.content || snapshot.size !== previousSize) {
      tailMode.value = true
      await applyRangeSnapshot(snapshot, false)
    }
  } catch { await load() } finally { refreshing.value = false }
}

const editorExtensions = () => [
  basicSetup,
  EditorView.lineWrapping,
  ...codeMirrorThemeExtensions,
  EditorView.updateListener.of(update => {
    if (update.docChanged && !applyingDocument) {
      dirty.value = true
      lineCount.value = update.state.doc.lines
      syncCurrentTab()
    }
    if (update.selectionSet || update.docChanged) {
      const head = update.state.selection.main.head
      const line = update.state.doc.lineAt(head)
      cursorLine.value = line.number
      cursorColumn.value = head - line.from + 1
    }
  }),
]
const replaceDocument = (content: string) => {
  if (!editorHost.value) return
  applyingDocument = true
  editor?.destroy()
  editor = new EditorView({
    state: EditorState.create({ doc: content, extensions: editorExtensions() }),
    parent: editorHost.value,
  })
  applyingDocument = false
  lineCount.value = editor.state.doc.lines
  cursorLine.value = 1
  cursorColumn.value = 1
}
const enterEditMode = async () => {
  workspaceMode.value = 'editor'
  autoRefresh.value = false
  followTail.value = false
  loading.value = true
  loadError.value = ''
  await nextTick()
  try {
    const tab = currentTab.value
    if (tab?.isDirty && tab.content !== undefined && tab.textSignature) {
      signature.value = tab.textSignature
      encoding.value = tab.textEncoding || encoding.value
      fileSize.value = tab.textSize || fileSize.value
      modified.value = tab.textModified || modified.value
      replaceDocument(tab.content)
      dirty.value = true
      return
    }
    const snapshot = await invoke<TextDocumentSnapshot>('read_text_document', {
      libraryRoot: store.libraryPath,
      path: logPath.value,
      formatId: 'log',
      readOptions: encoding.value ? { encoding: encoding.value } : undefined,
    })
    if (snapshot.readOnlyReason) throw new Error(`日志当前只读：${snapshot.readOnlyReason}`)
    signature.value = snapshot.signature
    encoding.value = snapshot.encoding
    fileSize.value = snapshot.size
    modified.value = snapshot.modified
    replaceDocument(snapshot.content)
    dirty.value = false
    registerTab()
    syncCurrentTab()
  } catch (cause) { loadError.value = errorMessage(cause) } finally { loading.value = false }
}
const requestEditMode = () => {
  if (workspaceMode.value === 'editor') return
  if (fileSize.value > MAX_LOG_EDIT_BYTES) {
    message.warning(`日志超过 ${MAX_LOG_EDIT_BYTES / 1024 / 1024} MiB，只能使用专业查看模式`)
    return
  }
  dialog.warning({
    title: '编辑日志会覆盖源文件',
    content: '进入编辑后将暂停自动刷新和尾部跟随。修改只保留在当前草稿中，只有点击保存才会覆盖源日志；如果其他程序继续写入，保存会因签名冲突而停止。',
    positiveText: '进入编辑模式',
    negativeText: '保持查看',
    onPositiveClick: () => { void enterEditMode() },
  })
}
const switchToViewer = async () => {
  syncCurrentTab()
  workspaceMode.value = 'viewer'
  editor?.destroy()
  editor = null
  await nextTick()
  await load()
}
const requestViewerMode = () => {
  if (workspaceMode.value === 'viewer') return
  if (!dirty.value) { void switchToViewer(); return }
  dialog.warning({
    title: '保留未保存的日志草稿？',
    content: '返回查看模式不会写入源日志。当前修改会保留在文件标签中，之后可再次进入编辑继续处理。',
    positiveText: '保留草稿并返回',
    negativeText: '继续编辑',
    onPositiveClick: () => { void switchToViewer() },
  })
}
const saveLog = async () => {
  if (!editor || !dirty.value || saving.value) return
  saving.value = true
  try {
    const snapshot = await invoke<TextDocumentSnapshot>('write_log_document', {
      libraryRoot: store.libraryPath,
      path: logPath.value,
      content: editor.state.doc.toString(),
      expectedSignature: signature.value,
      acknowledgedOverwrite: true,
    })
    signature.value = snapshot.signature
    encoding.value = snapshot.encoding
    fileSize.value = snapshot.size
    modified.value = snapshot.modified
    dirty.value = false
    syncCurrentTab()
    message.success('日志已保存到源文件')
  } catch (cause) {
    const error = cause as TextDocumentError
    if (error.code === 'external-modified') {
      dialog.warning({
        title: '日志已被其他程序修改',
        content: `${errorMessage(cause)} 当前草稿未丢失。`,
        positiveText: '重新加载最新日志',
        negativeText: '保留当前草稿',
        onPositiveClick: () => { void reloadEditor() },
      })
    } else message.error(`保存失败：${errorMessage(cause)}`)
  } finally { saving.value = false }
}
const reloadEditor = async () => {
  dirty.value = false
  const tab = currentTab.value
  if (tab) tab.isDirty = false
  await enterEditMode()
}
const reload = () => {
  if (workspaceMode.value === 'viewer') { void load(); return }
  if (!dirty.value) { void reloadEditor(); return }
  dialog.warning({
    title: '重新加载最新日志？',
    content: '当前未保存修改会被磁盘中的最新内容替换。',
    positiveText: '重新加载',
    negativeText: '保留修改',
    onPositiveClick: () => { void reloadEditor() },
  })
}
const runUndo = () => { if (editor) { undo(editor); editor.focus() } }
const runRedo = () => { if (editor) { redo(editor); editor.focus() } }
const handleScroll = () => {
  const element = viewport.value
  if (element && element.scrollHeight - element.scrollTop - element.clientHeight > 40) followTail.value = false
}
const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GiB`
}
const leaveViewer = () => {
  if (workspaceMode.value === 'editor' && dirty.value) syncCurrentTab()
  void router.push('/library')
}
const handleKeydown = (event: KeyboardEvent) => {
  if (workspaceMode.value === 'editor' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void saveLog()
  }
}

watch(logPath, async (_path, previousPath) => {
  if (previousPath && workspaceMode.value === 'editor') syncCurrentTab()
  workspaceMode.value = 'viewer'
  editor?.destroy()
  editor = null
  dirty.value = false
  await nextTick()
  await load()
})
watch(followTail, enabled => { if (enabled) void scrollToTail() })
onMounted(async () => {
  await load()
  refreshTimer = setInterval(() => { void pollForUpdates() }, REFRESH_INTERVAL_MS)
  unlistenSave = await listen('command-save', () => { if (workspaceMode.value === 'editor') void saveLog() })
})
onBeforeUnmount(() => {
  if (workspaceMode.value === 'editor') syncCurrentTab()
  loadGeneration += 1
  if (refreshTimer) clearInterval(refreshTimer)
  unlistenSave?.()
  editor?.destroy()
})
</script>

<style scoped>
.log-workspace {
  width: 100%; height: 100%; min-width: 0; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 48px 46px minmax(0, 1fr) 28px;
  grid-template-areas: "tabs" "toolbar" "filter" "viewer" "status";
  overflow: hidden; color: var(--theme-text); background: var(--theme-bg);
}
.log-tabs { grid-area: tabs; }
.log-toolbar { grid-area: toolbar; }
.filter-bar { grid-area: filter; }
.edit-bar { grid-area: filter; }
.log-stage { grid-area: viewer; }
.log-editor-stage { grid-area: viewer; }
.status-bar { grid-area: status; }
.log-toolbar, .filter-bar, .edit-bar, .status-bar {
  display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 16px;
  border-bottom: var(--theme-border); background: var(--theme-surface);
}
.log-toolbar { justify-content: space-between; }
.document-identity, .toolbar-actions, .toggle-control, .status-bar > div, .edit-actions {
  display: flex; align-items: center; gap: 10px; min-width: 0;
}
.document-title { display: grid; min-width: 0; }
.document-title strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.document-title span, .toggle-control, .result-count, .status-bar, .edit-notice span { color: var(--theme-text-secondary); font-size: 11px; }
.filter-bar :deep(.n-input) { flex: 1 1 260px; max-width: 420px; }
.level-filter { display: flex; align-items: center; min-width: 0; overflow-x: auto; border: var(--theme-border); border-radius: 6px; }
.level-filter button {
  height: 28px; display: inline-flex; align-items: center; gap: 5px; padding: 0 9px;
  border: 0; border-right: var(--theme-border); color: var(--theme-text-secondary);
  background: var(--theme-surface-2); font: inherit; white-space: nowrap; cursor: pointer;
}
.level-filter button:last-child { border-right: 0; }
.level-filter button.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.1); }
.level-filter button span { min-width: 14px; color: inherit; font-size: var(--text-compact); text-align: right; }
.result-count { margin-left: auto; white-space: nowrap; }
.edit-bar { justify-content: space-between; background: color-mix(in srgb, var(--theme-primary) 7%, var(--theme-surface)); }
.edit-notice { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.edit-notice strong { color: var(--theme-primary); font-size: 12px; white-space: nowrap; }
.edit-notice span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-stage { min-height: 0; overflow: auto; background: var(--code-editor-surface); }
.log-editor-stage { min-height: 0; overflow: hidden; position: relative; background: var(--code-editor-surface); }
.log-editor-host { width: 100%; height: 100%; min-height: 0; }
.viewer-state { height: 100%; display: grid; place-content: center; gap: 10px; padding: 24px; color: var(--theme-text-secondary); text-align: center; }
.viewer-state p { max-width: 620px; margin: 0; }
.viewer-state.error strong { color: var(--theme-danger); }
.log-lines {
  min-width: max-content; margin: 0; padding: 12px 24px 48px 72px;
  font-family: "Fira Code", "Cascadia Code", Consolas, monospace; font-size: 12px; line-height: 1.65;
}
.log-lines li { min-height: 20px; padding: 0 12px; border-left: 2px solid transparent; color: var(--code-editor-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.log-lines li::marker, .timestamp { color: var(--code-editor-gutter-text); }
.log-lines li:hover { background: var(--code-editor-active-line); }
.log-lines .level-error { border-left-color: var(--theme-danger); color: var(--theme-danger); background: color-mix(in srgb, var(--theme-danger) 7%, transparent); }
.log-lines .level-warn { border-left-color: var(--status-warning); color: var(--status-warning); }
.log-lines .level-info { border-left-color: var(--status-info); color: var(--code-editor-text); }
.log-lines .level-debug { border-left-color: var(--code-editor-string); color: var(--code-editor-string); }
.log-lines .level-trace { border-left-color: var(--code-editor-function); color: var(--code-editor-function); }
.status-bar { justify-content: space-between; overflow: hidden; border-top: var(--theme-border); border-bottom: 0; white-space: nowrap; }
.status-bar > div { overflow: hidden; white-space: nowrap; }
.status-bar > div:last-child { justify-content: flex-end; }
@media (max-width: 860px) {
  .log-workspace { grid-template-rows: auto 54px auto minmax(0, 1fr) 28px; }
  .log-toolbar { padding: 0 10px; }
  .toggle-control > span, .document-title span { display: none; }
  .filter-bar { flex-wrap: wrap; padding: 8px 10px; }
  .filter-bar :deep(.n-input) { flex-basis: 100%; max-width: none; }
  .level-filter { max-width: calc(100vw - 96px); }
  .edit-bar { min-height: 46px; padding: 6px 10px; }
  .edit-notice span { display: none; }
  .log-lines { padding-left: 56px; }
}
</style>
