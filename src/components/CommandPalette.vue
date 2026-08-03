<template>
  <transition name="palette-pop">
    <div v-if="show" class="command-palette-overlay" @click.self="close">
      <div class="command-palette-container">
        <div class="palette-glow-ring"></div>
        <n-input
          ref="inputInst"
          v-model:value="query"
          placeholder="搜索笔记或执行命令 (> 开头)"
          @keydown.enter="handleEnter"
          @keydown.esc="close"
          @keydown.down.prevent="moveSelection(1)"
          @keydown.up.prevent="moveSelection(-1)"
        >
          <template #prefix>
            <n-icon :component="SearchIcon" />
          </template>
        </n-input>
        <div class="results-list" v-if="results.length > 0">
          <div
            v-for="(item, index) in results"
            :key="index"
            class="result-item"
            :class="{ active: selectedIndex === index }"
            @click="execute(item)"
            @mouseenter="selectedIndex = index"
          >
            <n-icon :component="item.icon" class="item-icon" />
            <div class="item-info">
              <div class="item-title">
                <span v-for="(seg, segIdx) in highlightMatch(item.title, query)" :key="segIdx" :class="{ 'highlight-match': seg.highlight }">{{ seg.text }}</span>
              </div>
              <div class="item-desc">{{ item.description }}</div>
            </div>
            <span class="item-badge" v-if="item.type === 'cmd'">命令</span>
            <span class="item-badge file-badge" v-else-if="item.type === 'file'">文件</span>
          </div>
        </div>
        <div class="no-results" v-else-if="query.length > 0">
          无匹配结果
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { Search as SearchIcon, FileText as FileIcon, Command as CommandIcon, Clock as ClockIcon } from 'lucide-vue-next'
import { InputInst } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { themePresets } from '../config/themePresets'

const props = defineProps<{ show: boolean }>()
const emitEvent = defineEmits(['close', 'execute'])

const query = ref('')
const selectedIndex = ref(0)
const inputInst = ref<InputInst | null>(null)
const results = ref<any[]>([])

const close = () => { query.value = ''; emitEvent('close') }

watch(() => props.show, (newVal) => {
  if (newVal) { selectedIndex.value = 0; nextTick(() => inputInst.value?.focus()) }
})

const moveSelection = (dir: number) => {
  if (results.value.length === 0) return
  selectedIndex.value = (selectedIndex.value + dir + results.value.length) % results.value.length
}

const handleEnter = () => {
  if (results.value[selectedIndex.value]) { execute(results.value[selectedIndex.value]) }
}

const execute = async (item: any) => {
  emitEvent('execute', item)
  close()
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
  { title: '打开外部 Markdown', description: '选择并临时编辑一个 Markdown 文件', keywords: 'open external markdown file', icon: FileIcon, type: 'cmd', action: 'open-external-file' },
  { title: '专注模式', description: '切换全屏专注模式  F11', keywords: 'zen f11 fullscreen', icon: CommandIcon, type: 'cmd', action: 'zen-mode' },
  { title: '导出 HTML', description: '导出当前文件为 HTML', keywords: 'export html', icon: CommandIcon, type: 'cmd', action: 'export-html' },
  { title: '保存文件', description: '保存当前编辑的文件  Ctrl+S', keywords: 'save write', icon: CommandIcon, type: 'cmd', action: 'save-file' },
  { title: '刷新目录', description: '重新扫描知识库目录结构', keywords: 'refresh reload', icon: CommandIcon, type: 'cmd', action: 'refresh' },
  ...themeCommands,
  { title: '今日笔记', description: '创建或打开今天日期的日记', keywords: 'daily today journal', icon: CommandIcon, type: 'cmd', action: 'daily-note' },
]

let searchDebounce: any = null

const loadRecentFiles = (): any[] => {
  try {
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

watch(query, (val) => {
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
  } else if (val.length > 0) {
    // 文件搜索模式
    selectedIndex.value = 0
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(async () => {
      try {
        const files = await invoke<any[]>('search_all_libraries', { query: val })
        results.value = files.map(f => ({
          title: f.name,
          description: f.path,
          icon: FileIcon,
          type: 'file',
          path: f.path
        }))
      } catch (e) { results.value = [] }
      selectedIndex.value = 0
    }, 200)
  } else {
    // 空查询：显示最近文件
    results.value = loadRecentFiles()
    selectedIndex.value = 0
  }
})

onUnmounted(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})
</script>

<style scoped>
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

.command-palette-container {
  width: min(640px, calc(100vw - 40px));
  height: fit-content;
  max-height: min(620px, 76vh);
  overflow: hidden;
  background: var(--style-card-gradient);
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
