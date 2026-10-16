<template>
  <transition name="palette-pop">
    <div v-if="show" ref="overlayHost" class="command-palette-overlay" @click.self="close">
      <div class="command-palette-container" role="dialog" aria-modal="true" aria-label="命令与资料">
        <div class="palette-glow-ring"></div>
        <div class="palette-search-row">
        <n-input
          ref="inputInst"
          v-model:value="query"
          placeholder="搜索笔记或执行命令 (> 开头)"
          :input-props="{ 'aria-label': '搜索资料或命令' }"
          :maxlength="500"
          :disabled="opening"
          @keydown.enter="handleEnter"
          @keydown.esc="close"
          @keydown.down.prevent="moveSelection(1)"
          @keydown.up.prevent="moveSelection(-1)"
        >
          <template #prefix>
            <n-icon :component="SearchIcon" />
          </template>
        </n-input>
        <n-select v-if="!query.startsWith('>')" v-model:value="scope" class="palette-scope" aria-label="搜索范围" :to="overlayHost || undefined" :disabled="opening" :options="scopeOptions" size="small" />
        </div>
        <div v-if="searching && !searchPages.files.value.length" class="palette-status" role="status">正在查找资料…</div>
        <div v-if="opening" class="palette-status" role="status">正在打开资料，请稍候…</div>
        <div v-if="error" class="palette-status palette-error" role="alert">{{ error }}<n-button v-if="!opening" size="tiny" @click="scheduleSearch">重试</n-button></div>
        <div class="palette-scroll-content">
        <SearchPageStatus v-if="pagedSearch && (!error || searchPages.status.value)" part="header" :page="searchPages" :sort="sort" :disabled="opening" :loading="searching" @sort="sort = $event" @apply="searchPages.applyPending" @retry="retryPages"/>
        <div class="results-list" v-if="results.length > 0" :aria-busy="opening || (searching && !searchPages.files.value.length)" :role="pagedSearch ? 'list' : 'listbox'" aria-label="资料与命令结果">
          <div
            v-for="(item, index) in results"
            :key="item.path || item.action || index"
            class="result-item"
            :role="pagedSearch ? 'listitem' : 'option'"
            :aria-selected="pagedSearch ? undefined : selectedIndex === index"
            :class="{ active: selectedIndex === index }"
            @click="!item.searchGroup && execute(item)"
            @mouseenter="selectedIndex = index"
          >
            <SearchFileCard v-if="item.searchGroup" :file="item.searchGroup" :query="query" :reference-allowed="canReference(item)" @open="executeMatch(item, $event)" @reference="executeMatch(item, $event, true)"/>
            <n-icon v-if="!item.searchGroup" :component="item.icon" class="item-icon" />
            <div v-if="!item.searchGroup" class="item-info">
              <div class="item-title">
                <SearchHighlight v-if="item.type === 'file' && query.trim()" :text="item.title" :query="query" />
                <template v-else><span v-for="(seg, segIdx) in highlightMatch(item.title, query)" :key="segIdx" :class="{ 'highlight-match': seg.highlight }">{{ seg.text }}</span></template>
              </div>
              <div class="item-desc">{{ item.description }}</div><small v-if="item.context" class="item-context">{{ item.context }}</small>
            </div>
            <span class="item-badge" v-if="item.type === 'cmd'">命令</span>
            <span class="item-badge file-badge" v-else-if="item.type === 'file' && !item.searchGroup">文件</span>
          </div>
        </div>
        <div class="no-results" v-else-if="!pagedSearch && query.trim().length > 0 && !searching && !error">
          无匹配结果
        </div>
        <SearchPageStatus v-if="pagedSearch" part="footer" :page="searchPages" :sort="sort" :disabled="opening" @more="searchPages.loadMore" @continue="searchPages.continueSearch" @apply="searchPages.applyPending" @retry="retryPages"/>
        </div>
        <div v-if="!query.startsWith('>')" class="palette-status palette-help">空格分隔关键词，双引号匹配短语，-排除词；Enter 在主编辑区打开。结果按文件续载，组内位置并非全部出现次数。</div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NSelect } from 'naive-ui'
import { Search as SearchIcon, FileText as FileIcon, Command as CommandIcon, Clock as ClockIcon } from 'lucide-vue-next'
import { InputInst } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { themePresets } from '../config/themePresets'
import { useAppStore } from '../store/app'
import { parseSearchQuery, searchQueryNeedle } from '../utils/searchQuery'
import { belongsToLibrary } from '../utils/workSessions'
import { snapshotWindowDrafts, windowDraftCount } from '../services/windowDrafts'
import SearchHighlight from './SearchHighlight.vue'
import SearchFileCard from './SearchFileCard.vue'
import SearchPageStatus from './SearchPageStatus.vue'
import { createSearchPages, type SearchMatch, type SearchSort } from '../services/searchPages'

const props = defineProps<{ show: boolean }>()
const emitEvent = defineEmits(['close', 'execute'])

const query = ref('')
const selectedIndex = ref(0)
const inputInst = ref<InputInst | null>(null)
const results = ref<any[]>([])
const overlayHost = ref<HTMLElement | null>(null)
const store = useAppStore(), scope = ref<'current' | 'all'>('current')
const scopeOptions = [{ label: '当前资料库', value: 'current' }, { label: '全部资料库', value: 'all' }]
const searching = ref(false), opening = ref(false), error = ref('')
const searchPages = createSearchPages(invoke), sort = ref<SearchSort>('relevance'), route = useRoute()
const pagedSearch = computed(() => !!query.value.trim() && !query.value.startsWith('>'))
watch(searchPages.files, files => {
  if (!pagedSearch.value) return
  const selected = results.value[selectedIndex.value]?.path
  results.value = files.map(file => ({ ...file.matches[0], title:file.title, path:file.path, type:'file', icon:FileIcon, searchGroup:file }))
  const index = results.value.findIndex(item => item.path === selected)
  selectedIndex.value = index >= 0 ? index : Math.min(selectedIndex.value, Math.max(0, results.value.length - 1))
})
const canReference = (item: { path: string }) => route.name === 'LibraryMode' && !store.isZen && belongsToLibrary(store.libraryPath, item.path)
const executeMatch = (item: any, match: SearchMatch, reference = false) => execute({ ...item, ...match, reference,
  searchNeedle: match.matchKind === 'body' && ['markdown','plain-text'].includes(match.objectType) ? searchQueryNeedle(query.value, match.context) : '' })
const retryPages = async () => {
  if (searchPages.errorCode.value === 'snapshotChanged') await searchPages.refreshAvailable()
  else if (searchPages.status.value?.scanState === 'failed') await searchPages.restart()
  else await searchPages.retry()
}
let generation = 0, disposed = false
let previousFocus: HTMLElement | null = null
let restoreFocusOnClose = true

const close = () => { if (opening.value) return; invalidateSearch(); emitEvent('close') }
const handleEscape = (event: KeyboardEvent) => {
  if (!props.show || event.key !== 'Escape') return
  event.preventDefault(); event.stopPropagation(); close()
}
onMounted(() => window.addEventListener('keydown', handleEscape, true))

watch(() => props.show, (newVal) => {
  if (newVal) {
    restoreFocusOnClose = true
    const focused = document.activeElement
    if (focused instanceof HTMLElement && !overlayHost.value?.contains(focused)) previousFocus = focused
    query.value = ''; selectedIndex.value = 0; scheduleSearch(); nextTick(() => inputInst.value?.focus())
  } else {
    invalidateSearch()
    nextTick(() => { if (!props.show && restoreFocusOnClose && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
  }
})

const moveSelection = (dir: number) => {
  if (results.value.length === 0) return
  selectedIndex.value = (selectedIndex.value + dir + results.value.length) % results.value.length
  nextTick(() => overlayHost.value?.querySelector('.result-item.active')?.scrollIntoView({ block: 'nearest' }))
}

const handleEnter = () => {
  if (results.value[selectedIndex.value]) { execute(results.value[selectedIndex.value]) }
}

const execute = async (item: any) => {
  if (!props.show || disposed || (searching.value && !searchPages.files.value.length) || opening.value) return
  opening.value = true; error.value = ''
  try {
    if (item.type === 'file') {
      if (item.reference) {
        if (!canReference(item)) throw new Error('请在当前资料库页面使用侧边参考；没有切换资料库或替换草稿。')
        window.dispatchEvent(new CustomEvent('longedit:search-reference', { detail:{ match:item, query:query.value } }))
        restoreFocusOnClose = false; opening.value = false; close(); return
      }
      if (item.searchGroup && !item.searchNeedle && item.matchKind === 'body' && ['markdown','plain-text'].includes(item.objectType)) item = { ...item, searchNeedle:searchQueryNeedle(query.value, item.context || '') }
      const library = belongsToLibrary(store.libraryPath, item.path) ? store.libraries.find(library => library.path === store.libraryPath) : [...store.libraries].sort((a, b) => b.path.length - a.path.length).find(library => belongsToLibrary(library.path, item.path))
      if (!library) throw new Error('这份资料所属的资料库已移除，请先检查资料库设置')
      if (library.path !== store.libraryPath) {
        snapshotWindowDrafts()
        if (store.tabs.some(tab => tab.isDirty) || store.isTempDirty || windowDraftCount.value > 0) throw new Error('有未保存的内容或文件操作正在执行，请先完成后再打开其他资料库的文件')
        await store.updateConfig({ activeLibraryPath: library.path })
      }
    }
    if (disposed || !props.show) return
    restoreFocusOnClose = false; opening.value = false; emitEvent('execute', item); close()
  } catch (cause) { error.value = String(cause).replace(/^Error:\s*/, '') }
  finally { opening.value = false }
}

// 模糊匹配：所有字符按顺序出现即可匹配
const fuzzyMatch = (text: string, query: string): boolean => {
  const t = text.toLowerCase(), q = query.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

// 高亮匹配字符 — 返回安全的分段数组
const highlightMatch = (text: string, query: string): { text: string; highlight: boolean }[] => {
  if (!query) return [{ text, highlight: false }]
  const t = text.toLowerCase(), q = query.toLowerCase()
  const segments: { text: string; highlight: boolean }[] = []
  let qi = 0, inMatch = false, segStart = 0
  for (let ti = 0; ti < text.length; ti++) {
    const matches = qi < q.length && t[ti] === q[qi]
    if (matches && !inMatch) {
      if (ti > segStart) segments.push({ text: text.slice(segStart, ti), highlight: false })
      inMatch = true; segStart = ti
    }
    if (!matches && inMatch) {
      segments.push({ text: text.slice(segStart, ti), highlight: true })
      inMatch = false; segStart = ti
    }
    if (matches) qi++
  }
  if (segStart < text.length) segments.push({ text: text.slice(segStart), highlight: inMatch })
  return segments
}

const themeCommands = themePresets.map(preset => ({
  title: `应用主题：${preset.name}`,
  description: preset.description,
  keywords: ['theme', '主题', preset.mode, preset.scenario, preset.tier, ...preset.keywords].join(' '),
  icon: CommandIcon,
  type: 'cmd',
  action: `theme-preset:${preset.id}`,
}))

const ALL_COMMANDS = [
  { title: '打开外部文件', description: '选择受支持的文本、代码或结构化源码文件', keywords: 'open external text code structured file', icon: FileIcon, type: 'cmd', action: 'open-external-file' },
  { title: '专注模式', description: '切换全屏专注模式  F11', keywords: 'zen f11 fullscreen', icon: CommandIcon, type: 'cmd', action: 'zen-mode' },
  { title: '导出 HTML', description: '导出当前文件为 HTML', keywords: 'export html', icon: CommandIcon, type: 'cmd', action: 'export-html' },
  { title: '保存文件', description: '保存当前编辑的文件  Ctrl+S', keywords: 'save write', icon: CommandIcon, type: 'cmd', action: 'save-file' },
  { title: '刷新目录', description: '重新扫描知识库目录结构', keywords: 'refresh reload', icon: CommandIcon, type: 'cmd', action: 'refresh' },
  ...themeCommands,
  { title: '今日笔记', description: '创建或打开今天日期的日记', keywords: 'daily today journal', icon: CommandIcon, type: 'cmd', action: 'daily-note' },
]

let searchDebounce: ReturnType<typeof setTimeout> | null = null
const invalidateSearch = () => { ++generation; searchPages.reset(); if (searchDebounce) clearTimeout(searchDebounce); searchDebounce = null; searching.value = false }

const loadRecentFiles = (): any[] => {
  try {
    if (store.recentFiles.length) return store.recentFiles.slice(0, 6).map(file => ({ title: file.title, description: file.path, icon: ClockIcon, type: 'file', path: file.path }))
    const raw = localStorage.getItem('longedit_tabs_state')
    if (!raw) return []
    const state = JSON.parse(raw)
    return (state.recentFiles || []).slice(0, 6).map((f: any) => ({
      title: f.title,
      description: f.path,
      icon: ClockIcon,
      type: 'file',
      path: f.path
    }))
  } catch { return [] }
}

function scheduleSearch() {
  invalidateSearch()
  if (!props.show) return
  const val = query.value, token = generation, root = store.libraryPath, selectedScope = scope.value
  error.value = ''; results.value = []
  if (val.startsWith('>')) {
    // 命令模式：模糊匹配
    const cmd = val.slice(1).trim().toLowerCase()
    if (!cmd) {
      results.value = ALL_COMMANDS.map(c => ({ ...c, description: c.description + '  —  ' + c.keywords }))
    } else {
      results.value = ALL_COMMANDS.filter(c =>
        fuzzyMatch(c.title, cmd) || fuzzyMatch(c.keywords, cmd)
      )
    }
    selectedIndex.value = 0
  } else if (val.trim().length > 0) {
    // 文件搜索模式
    selectedIndex.value = 0
    try { parseSearchQuery(val) } catch (cause) { results.value = []; error.value = String(cause).replace(/^Error:\s*/, ''); return }
    searching.value = true
    searchDebounce = setTimeout(async () => {
      const current = () => !disposed && props.show && token === generation && query.value === val && scope.value === selectedScope && store.libraryPath === root
      try {
        if (selectedScope === 'current' && !root) throw new Error('请先选择资料库，或切换到全部资料库')
        await searchPages.start({ libraryRoot:selectedScope === 'current' ? root : null, query:val, sort:sort.value, channel:'palette', kind:'libraries' })
      } catch (cause) { if (current()) { results.value = []; error.value = String(cause).replace(/^Error:\s*/, '') } }
      finally { if (current()) searching.value = false }
    }, 200)
  } else {
    // 空查询：显示最近文件
    results.value = loadRecentFiles()
    selectedIndex.value = 0
  }
}
watch([query, scope, sort, () => store.libraryPath], scheduleSearch)

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscape, true)
  disposed = true; invalidateSearch()
  searchPages.dispose()
})
</script>

<style scoped>
.palette-scroll-content{min-height:0;flex:1 1 auto;overflow-y:auto}.palette-scroll-content>.results-list{max-height:none;overflow:visible}.result-item:has(.search-file-card){padding:3px;display:block;transform:none;cursor:default}.result-item>.search-file-card{width:100%;box-sizing:border-box}.palette-search-row{flex-shrink:0}
.palette-search-row{display:flex;align-items:center;gap:8px;padding-right:16px}.palette-search-row>.n-input{min-width:0;flex:1}.palette-scope{width:138px;flex-shrink:0}.palette-status{padding:8px 20px;color:var(--theme-text-secondary);font-size:var(--text-compact);overflow-wrap:anywhere}.palette-error{color:var(--status-danger);display:flex;align-items:center;gap:8px;justify-content:space-between}.palette-help{border-top:var(--theme-border)}.item-context{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--theme-text-secondary)}.results-list[aria-busy="true"]{opacity:.65;pointer-events:none}@media(max-width:520px){.palette-search-row{padding-right:10px;gap:2px}.palette-scope{width:120px}}
.command-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  justify-content: center;
  padding-top: 14vh;
  background:
    radial-gradient(circle at 50% 8%, rgba(var(--theme-primary-rgb), 0.15), transparent 35%),
    radial-gradient(circle at 30% 60%, rgba(var(--theme-primary-rgb), 0.08), transparent 40%),
    rgba(var(--theme-bg-rgb), 0.68);
  backdrop-filter: none;
}

.palette-search-row,.palette-status,.no-results { flex-shrink: 0; }

.command-palette-container {
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 40px));
  height: fit-content;
  max-height: min(620px, 76vh);
  overflow: hidden;
  /* Keep each style's gradient/glow, but never let document text show through
     the search reading surface (especially glass and soft styles). */
  background: var(--style-card-gradient), var(--theme-surface);
  border: var(--theme-border-strong);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--theme-shadow);
  position: relative;
}

.command-palette-container::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius-lg);
  padding: 1px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.2) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 50%,
    rgba(var(--theme-primary-rgb), 0.15) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.6;
}

.palette-glow-ring {
  position: absolute;
  inset: -2px;
  border-radius: calc(var(--theme-radius-lg) + 2px);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.3),
    rgba(var(--theme-primary-rgb), 0.1));
  filter: blur(8px);
  opacity: 0;
  pointer-events: none;
  animation: pulse-glow 3s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.02); }
}

:deep(.n-input) {
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-focus: none !important;
  --n-box-shadow-focus: none !important;
  background: transparent !important;
  padding: 18px 20px 16px;
  font-size: 16px;
  position: relative;
}

:deep(.n-input::after) {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--theme-radius);
  pointer-events: none;
  box-shadow: var(--style-glow);
  opacity: 0;
  transition: opacity var(--motion-base) var(--ease-standard);
}

:deep(.n-input:focus-within::after) {
  opacity: 0.4;
}

:deep(.n-input .n-input__input-el) {
  font-weight: 560;
  letter-spacing: 0;
}

:deep(.n-input__prefix) {
  transition: transform var(--motion-base) var(--ease-emphasized);
}

:deep(.n-input:focus-within .n-input__prefix) {
  transform: scale(1.1);
}

.results-list {
  min-height: 0;
  flex: 1 1 auto;
  max-height: 410px;
  overflow-y: auto;
  padding: 8px;
  border-top: var(--theme-border);
  background: linear-gradient(180deg, rgba(var(--theme-primary-rgb), 0.035), transparent 70px);
}

.result-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 54px;
  padding: 10px 12px;
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  color: var(--theme-text);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-emphasized),
    box-shadow var(--motion-fast) var(--ease-standard);
}

.result-item::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.7) 100%);
  opacity: 0;
  transform: scaleY(0.4);
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-base) var(--ease-emphasized);
}

.result-item:hover {
  background: rgba(var(--theme-primary-rgb), 0.06);
  transform: translateX(2px);
}

.result-item.active {
  background: linear-gradient(90deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.08) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(var(--theme-primary-rgb), 0.15),
    var(--style-glow);
  transform: translateY(var(--style-hover-lift)) scale(var(--style-hover-scale));
}

.result-item.active::before {
  opacity: 1;
  transform: scaleY(0.72);
  box-shadow: 0 0 8px rgba(var(--theme-primary-rgb), 0.5);
}

.item-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--theme-radius-sm);
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.12) 0%,
    rgba(var(--theme-primary-rgb), 0.08) 100%);
  color: var(--theme-primary);
  transition:
    transform var(--motion-fast) var(--ease-emphasized),
    background var(--motion-fast) var(--ease-standard);
}

.result-item.active .item-icon {
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.18) 0%,
    rgba(var(--theme-primary-rgb), 0.12) 100%);
  transform: scale(1.08);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
}

.item-title .highlight-match {
  background: linear-gradient(135deg,
    var(--theme-primary) 0%,
    rgba(var(--theme-primary-rgb), 0.85) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 800;
  position: relative;
}

.item-title .highlight-match::after {
  content: "";
  position: absolute;
  inset: auto 0 -1px 0;
  height: 2px;
  background: linear-gradient(90deg,
    transparent,
    var(--theme-primary) 20%,
    var(--theme-primary) 80%,
    transparent);
  opacity: 0.3;
}

.item-desc {
  margin-top: 2px;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.35;
}

.no-results {
  padding: 28px 20px 32px;
  border-top: var(--theme-border);
  color: var(--text-secondary);
  text-align: center;
  font-size: 13px;
}

.item-badge {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.15) 0%,
    rgba(var(--theme-primary-rgb), 0.08) 100%);
  color: var(--theme-primary);
  font-size: var(--text-compact);
  font-weight: 700;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.12);
  transition:
    transform var(--motion-fast) var(--ease-standard),
    background var(--motion-fast) var(--ease-standard);
}

.result-item.active .item-badge {
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.22) 0%,
    rgba(var(--theme-primary-rgb), 0.15) 100%);
  transform: scale(1.05);
}

.file-badge {
  background: linear-gradient(135deg,
    rgba(var(--text-secondary), 0.12) 0%,
    rgba(var(--text-secondary), 0.06) 100%);
  color: var(--text-secondary);
  border-color: rgba(var(--text-secondary), 0.08);
}

.result-item.active .file-badge {
  background: linear-gradient(135deg,
    rgba(var(--text-secondary), 0.18) 0%,
    rgba(var(--text-secondary), 0.1) 100%);
}

.palette-pop-enter-active,
.palette-pop-leave-active {
  transition: opacity var(--motion-slow) var(--ease-standard);
}

.palette-pop-enter-active .command-palette-container,
.palette-pop-leave-active .command-palette-container {
  transition:
    opacity var(--motion-slow) var(--ease-emphasized),
    transform var(--motion-slow) var(--ease-emphasized);
}

.palette-pop-enter-from {
  opacity: 0;
}

.palette-pop-enter-from .command-palette-container {
  opacity: 0;
  transform: scale(0.94) translateY(-10px);
}

.palette-pop-leave-to {
  opacity: 0;
}

.palette-pop-leave-to .command-palette-container {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
