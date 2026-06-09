<template>
  <transition name="palette-pop">
    <div v-if="show" class="command-palette-overlay" @click.self="close">
      <div class="command-palette-container">
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
              <div class="item-title" v-html="highlightMatch(item.title, query)"></div>
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
import { ref, watch, nextTick } from 'vue'
import { Search as SearchIcon, FileText as FileIcon, Command as CommandIcon, Clock as ClockIcon } from 'lucide-vue-next'
import { InputInst } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'

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

// 高亮匹配字符
const highlightMatch = (text: string, query: string): string => {
  if (!query) return text
  const t = text.toLowerCase(), q = query.toLowerCase()
  let result = '', qi = 0, inMatch = false
  for (let ti = 0; ti < text.length; ti++) {
    const matches = qi < q.length && t[ti] === q[qi]
    if (matches && !inMatch) { result += '<b>'; inMatch = true }
    if (!matches && inMatch) { result += '</b>'; inMatch = false }
    result += text[ti]
    if (matches) qi++
  }
  if (inMatch) result += '</b>'
  return result
}

const ALL_COMMANDS = [
  { title: '专注模式', description: '切换全屏专注模式  F11', keywords: 'zen f11 fullscreen', icon: CommandIcon, type: 'cmd', action: 'zen-mode' },
  { title: '导出 HTML', description: '导出当前文件为 HTML', keywords: 'export html', icon: CommandIcon, type: 'cmd', action: 'export-html' },
  { title: '保存文件', description: '保存当前编辑的文件  Ctrl+S', keywords: 'save write', icon: CommandIcon, type: 'cmd', action: 'save-file' },
  { title: '刷新目录', description: '重新扫描知识库目录结构', keywords: 'refresh reload', icon: CommandIcon, type: 'cmd', action: 'refresh' },
  { title: '纯白主题', description: '切换到纯白配色', keywords: 'white light', icon: CommandIcon, type: 'cmd', action: 'theme-white' },
  { title: '深色主题', description: '切换到深色配色', keywords: 'dark night', icon: CommandIcon, type: 'cmd', action: 'theme-dark' },
  { title: '绿色主题', description: '切换到护眼绿配色', keywords: 'green', icon: CommandIcon, type: 'cmd', action: 'theme-green' },
  { title: '蓝色主题', description: '切换到清爽蓝配色', keywords: 'blue', icon: CommandIcon, type: 'cmd', action: 'theme-blue' },
  { title: '粉色主题', description: '切换到浪漫粉配色', keywords: 'pink', icon: CommandIcon, type: 'cmd', action: 'theme-pink' },
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
</script>

<style scoped>
.command-palette-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.2); backdrop-filter: blur(4px); z-index: 10000; display: flex; justify-content: center; padding-top: 15vh; }
.command-palette-container { width: 600px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(30px); border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.25); overflow: hidden; height: fit-content; border: 1px solid rgba(255, 255, 255, 0.4); }
.is-dark .command-palette-container { background: rgba(30, 30, 30, 0.85); border-color: rgba(255, 255, 255, 0.1); }
:deep(.n-input) { --n-border: none !important; --n-border-hover: none !important; --n-border-focus: none !important; --n-box-shadow-focus: none !important; background: transparent !important; padding: 14px 18px; font-size: 16px; }
.results-list { border-top: 1px solid rgba(0, 0, 0, 0.05); max-height: 360px; overflow-y: auto; }
.result-item { padding: 12px 18px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: background 0.1s; }
.result-item.active { background: rgba(0, 0, 0, 0.05); }
.is-dark .result-item.active { background: rgba(255, 255, 255, 0.1); }
.item-icon { font-size: 18px; opacity: 0.6; flex-shrink: 0; }
.item-info { flex: 1; min-width: 0; }
.item-title { font-size: 14px; font-weight: 500; }
.item-title :deep(b) { color: var(--theme-primary, #007aff); }
.item-desc { font-size: 11px; opacity: 0.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 500px; }
.no-results { padding: 20px; text-align: center; color: #888; font-size: 13px; }
.item-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.06); opacity: 0.5; flex-shrink: 0; }
.file-badge { background: rgba(0,122,255,0.08); color: var(--theme-primary, #007aff); }
.is-dark .item-badge { background: rgba(255,255,255,0.08); }
.is-dark .file-badge { background: rgba(0,122,255,0.15); }

.palette-pop-enter-active, .palette-pop-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.palette-pop-enter-active .command-palette-container,
.palette-pop-leave-active .command-palette-container {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.palette-pop-enter-from { opacity: 0; }
.palette-pop-enter-from .command-palette-container {
  transform: scale(0.9) translateY(-20px);
  opacity: 0;
}
.palette-pop-leave-to { opacity: 0; }
.palette-pop-leave-to .command-palette-container {
  transform: scale(0.95);
  opacity: 0;
}
</style>
