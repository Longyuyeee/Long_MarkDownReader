<template>
  <div class="log-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" class="log-tabs" />

    <header class="log-toolbar">
      <div class="document-identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="leaveViewer">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <div class="document-title">
          <strong :title="logPath">{{ fileName }}</strong>
          <span>日志 · 只读</span>
        </div>
      </div>

      <div class="toolbar-actions">
        <label class="toggle-control">
          <span>自动刷新</span>
          <n-switch v-model:value="autoRefresh" size="small" />
        </label>
        <label class="toggle-control">
          <span>跟随尾部</span>
          <n-switch v-model:value="followTail" size="small" />
        </label>
        <n-button v-if="tailMode" size="small" secondary @click="loadFromStart">
          读取前段
        </n-button>
        <n-button quaternary circle size="small" title="重新读取日志" :disabled="loading" @click="reload">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
      </div>
    </header>

    <section class="filter-bar" aria-label="日志筛选">
      <n-input
        v-model:value="query"
        clearable
        size="small"
        placeholder="筛选日志内容"
        aria-label="筛选日志内容"
      >
        <template #prefix><n-icon :component="SearchIcon" /></template>
      </n-input>
      <div class="level-filter" role="group" aria-label="日志级别">
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

    <main ref="viewport" class="log-stage" @scroll="handleScroll">
      <div v-if="loading" class="viewer-state">
        <n-spin size="small" />
        <strong>正在读取日志</strong>
      </div>
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

    <footer class="status-bar">
      <div>
        <span>{{ encodingLabel }}</span>
        <span>{{ formatBytes(fileSize) }}</span>
        <span v-if="tailMode">末尾范围</span>
        <span v-if="bufferTrimmed">仅保留最近 {{ parsedLines.length.toLocaleString() }} 行</span>
      </div>
      <div>
        <span v-if="refreshing">正在刷新</span>
        <span v-else>{{ autoRefresh ? '自动刷新已开启' : '自动刷新已暂停' }}</span>
        <n-button v-if="!rangeEof" text size="tiny" :loading="loadingMore" @click="loadMore">
          继续加载
        </n-button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft as ArrowLeftIcon,
  RefreshCw as RefreshIcon,
  Search as SearchIcon,
} from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { findFileFormat } from '../config/fileFormats'
import { useAppStore } from '../store/app'

type LogLevel = 'all' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'other'

interface TextDocumentError {
  message?: string
  suggestion?: string
}

interface TextDocumentRangeSnapshot {
  content: string
  encoding: string
  encodingConfidence: string
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
const viewport = ref<HTMLElement | null>(null)
const logPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => logPath.value.split(/[\\/]/).pop() || '未命名日志')
const format = computed(() => findFileFormat(logPath.value))
const loading = ref(true)
const loadingMore = ref(false)
const refreshing = ref(false)
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
let refreshTimer: ReturnType<typeof setInterval> | null = null
let loadGeneration = 0

const classifyLevel = (line: string): Exclude<LogLevel, 'all'> => (
  LEVEL_PATTERNS.find(([, pattern]) => pattern.test(line))?.[0] || 'other'
)

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
  return parsedLines.value.filter(line => (
    (selectedLevel.value === 'all' || line.level === selectedLevel.value)
    && (!needle || line.text.toLocaleLowerCase().includes(needle))
  ))
})

const levelOptions: Array<{ value: LogLevel; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '错误' },
  { value: 'warn', label: '警告' },
  { value: 'info', label: '信息' },
  { value: 'debug', label: '调试' },
  { value: 'trace', label: '跟踪' },
  { value: 'other', label: '其他' },
]

const levelCounts = computed<Record<LogLevel, number>>(() => {
  const counts: Record<LogLevel, number> = {
    all: parsedLines.value.length,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    trace: 0,
    other: 0,
  }
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
    try {
      return await readRange(target + adjustment)
    } catch (cause) {
      lastError = cause
    }
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

const applySnapshot = async (snapshot: TextDocumentRangeSnapshot, replace: boolean) => {
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
  store.addTab({
    id: logPath.value,
    title: fileName.value,
    path: logPath.value,
    isDirty: false,
  })
}

const load = async () => {
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
    await applySnapshot(snapshot, true)
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
  try {
    await applySnapshot(await readRange(nextOffset.value), false)
  } catch (cause) {
    loadError.value = errorMessage(cause)
  } finally {
    loadingMore.value = false
  }
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
    await applySnapshot(snapshot, true)
  } catch (cause) {
    if (generation === loadGeneration) loadError.value = errorMessage(cause)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

const pollForUpdates = async () => {
  if (!autoRefresh.value
    || loading.value
    || loadingMore.value
    || refreshing.value
    || (!rangeEof.value && !tailMode.value)) return
  refreshing.value = true
  try {
    const previousSize = fileSize.value
    const previousModified = modified.value
    const snapshot = await readRange(nextOffset.value)
    if (snapshot.size < previousSize || snapshot.nextOffset < nextOffset.value) {
      await load()
      return
    }
    if (snapshot.size === previousSize && snapshot.modified !== previousModified) {
      await load()
      return
    }
    if (snapshot.content || snapshot.size !== previousSize) {
      tailMode.value = true
      await applySnapshot(snapshot, false)
    }
  } catch {
    await load()
  } finally {
    refreshing.value = false
  }
}

const reload = () => { void load() }
const leaveViewer = () => { void router.push('/library') }
const handleScroll = () => {
  const element = viewport.value
  if (!element) return
  if (element.scrollHeight - element.scrollTop - element.clientHeight > 40) followTail.value = false
}
const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GiB`
}

watch(logPath, () => { void load() })
watch(followTail, enabled => { if (enabled) void scrollToTail() })
onMounted(async () => {
  await load()
  refreshTimer = setInterval(() => { void pollForUpdates() }, REFRESH_INTERVAL_MS)
})
onBeforeUnmount(() => {
  loadGeneration += 1
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.log-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 48px 46px minmax(0, 1fr) 28px;
  grid-template-areas:
    "tabs"
    "toolbar"
    "filter"
    "viewer"
    "status";
  overflow: hidden;
  color: var(--theme-text);
  background: var(--theme-bg);
}

.log-tabs { grid-area: tabs; }
.log-toolbar { grid-area: toolbar; }
.filter-bar { grid-area: filter; }
.log-stage { grid-area: viewer; }
.status-bar { grid-area: status; }

.log-toolbar,
.filter-bar,
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0 16px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.log-toolbar {
  justify-content: space-between;
}

.document-identity,
.toolbar-actions,
.toggle-control,
.status-bar > div {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.document-title {
  display: grid;
  min-width: 0;
}

.document-title strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title span,
.toggle-control,
.result-count,
.status-bar {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.filter-bar :deep(.n-input) {
  flex: 1 1 260px;
  max-width: 420px;
}

.level-filter {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow-x: auto;
  border: var(--theme-border);
  border-radius: 6px;
}

.level-filter button {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 0;
  border-right: var(--theme-border);
  color: var(--theme-text-secondary);
  background: var(--theme-surface-2);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.level-filter button:last-child {
  border-right: 0;
}

.level-filter button.active {
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.1);
}

.level-filter button span {
  min-width: 14px;
  color: inherit;
  font-size: var(--text-compact);
  text-align: right;
}

.result-count {
  margin-left: auto;
  white-space: nowrap;
}

.log-stage {
  min-height: 0;
  overflow: auto;
  background: var(--theme-bg);
}

.viewer-state {
  height: 100%;
  display: grid;
  place-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--theme-text-secondary);
  text-align: center;
}

.viewer-state p {
  max-width: 620px;
  margin: 0;
}

.viewer-state.error strong {
  color: var(--theme-danger);
}

.log-lines {
  min-width: max-content;
  margin: 0;
  padding: 12px 24px 48px 72px;
  font-family: "Fira Code", "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
}

.log-lines li {
  min-height: 20px;
  padding: 0 12px;
  border-left: 2px solid transparent;
  color: var(--theme-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.log-lines li::marker {
  color: var(--theme-text-secondary);
}

.log-lines li:hover {
  background: var(--theme-surface-2);
}

.log-lines .level-error {
  border-left-color: var(--theme-danger);
  color: var(--theme-danger);
  background: rgba(220, 38, 38, 0.05);
}

.log-lines .level-warn {
  border-left-color: #d97706;
  color: #b45309;
}

.log-lines .level-info {
  border-left-color: var(--theme-primary);
}

.log-lines .level-debug {
  border-left-color: #0f766e;
  color: #0f766e;
}

.log-lines .level-trace {
  border-left-color: #7c3aed;
  color: #6d28d9;
}

.timestamp {
  color: var(--theme-text-secondary);
}

.status-bar {
  justify-content: space-between;
  overflow: hidden;
  border-top: var(--theme-border);
  border-bottom: 0;
  white-space: nowrap;
}

.status-bar > div {
  overflow: hidden;
  white-space: nowrap;
}

.status-bar > div:last-child {
  justify-content: flex-end;
}

@media (max-width: 860px) {
  .log-workspace {
    grid-template-rows: auto 52px auto minmax(0, 1fr) 28px;
  }

  .log-toolbar {
    padding: 0 10px;
  }

  .toggle-control > span {
    display: none;
  }

  .filter-bar {
    flex-wrap: wrap;
    padding: 8px 10px;
  }

  .filter-bar :deep(.n-input) {
    flex-basis: 100%;
    max-width: none;
  }

  .level-filter {
    max-width: calc(100vw - 96px);
  }

  .log-lines {
    padding-left: 56px;
  }
}
</style>
