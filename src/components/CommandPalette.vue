<template>
  <transition name="palette-pop">
    <div v-if="show" class="command-palette-overlay" @click.self="close">
      <div class="command-palette-container">
        <n-input
          ref="inputInst"
          v-model:value="query"
          placeholder="搜索笔记 (直接输入) 或执行命令 (输入 >)"
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
              <div class="item-title">{{ item.title }}</div>
              <div class="item-desc">{{ item.description }}</div>
            </div>
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
import { Search as SearchIcon, FileText as FileIcon, Command as CommandIcon } from 'lucide-vue-next'
import { InputInst } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store/app'
import { emit } from '@tauri-apps/api/event'

const props = defineProps<{ show: boolean }>()
const emitEvent = defineEmits(['close', 'execute'])
const store = useAppStore()

const query = ref('')
const selectedIndex = ref(0)
const inputInst = ref<InputInst | null>(null)
const results = ref<any[]>([])

const close = () => { query.value = ''; emitEvent('close') }

watch(() => props.show, (newVal) => {
  if (newVal) { nextTick(() => inputInst.value?.focus()) }
})

const moveSelection = (dir: number) => {
  if (results.value.length === 0) return
  selectedIndex.value = (selectedIndex.value + dir + results.value.length) % results.value.length
}

const handleEnter = () => {
  if (results.value[selectedIndex.value]) { execute(results.value[selectedIndex.value]) }
}

const execute = async (item: any) => {
  if (item.type === 'cmd') {
    if (item.action === 'export-html') {
      await emit('command-export')
    } else {
      emitEvent('execute', item)
    }
  } else {
    emitEvent('execute', item)
  }
  close()
}

watch(query, async (val) => {
  if (val.startsWith('>')) {
    const cmd = val.slice(1).toLowerCase()
    const allCmds = [
      { title: '切换专注模式', description: 'Command: Toggle Zen Mode (F11)', icon: CommandIcon, type: 'cmd', action: 'zen-mode' },
      { title: '导出为 HTML', description: 'Command: Export current file to HTML', icon: CommandIcon, type: 'cmd', action: 'export-html' },
      { title: '刷新库目录', description: 'Command: Refresh Library', icon: CommandIcon, type: 'cmd', action: 'refresh' },
      { title: '浅色主题', description: 'Appearance: Light', icon: CommandIcon, type: 'cmd', action: 'theme-light' },
      { title: '深色主题', description: 'Appearance: Dark', icon: CommandIcon, type: 'cmd', action: 'theme-dark' },
    ]
    results.value = allCmds.filter(c => c.title.includes(cmd))
  } else if (val.length > 0) {
    try {
      const files = await invoke<any[]>('search_library', { libraryRoot: store.libraryPath, query: val })
      results.value = files.map(f => ({
        title: f.name,
        description: f.path,
        icon: FileIcon,
        type: 'file',
        path: f.path
      }))
    } catch (e) { results.value = [] }
  } else { results.value = [] }
  selectedIndex.value = 0
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
.item-icon { font-size: 18px; opacity: 0.6; }
.item-title { font-size: 14px; font-weight: 500; }
.item-desc { font-size: 11px; opacity: 0.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 500px; }
.no-results { padding: 20px; text-align: center; color: #888; font-size: 13px; }

/* 命令面板动效 */
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
