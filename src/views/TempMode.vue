<template>
  <div class="temp-mode">
    <div class="temp-header">
      <div class="temp-info">
        <n-tag :bordered="false" type="error" size="small" class="mode-tag">临时编辑</n-tag>
        <span class="file-name">{{ fileName }}</span>
        <n-text depth="3" class="encoding">{{ fileEncoding }}</n-text>
        <div v-if="isDirty" class="dirty-dot"></div>
      </div>
      <div class="actions">
        <n-button-group size="small">
          <n-button secondary type="success" @click="saveFile">保存</n-button>
          <n-button primary type="primary" @click="importToLibrary">导入到库</n-button>
        </n-button-group>
      </div>
    </div>
    <div class="editor-container">
      <div id="vditor"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const filePath = ref(route.query.path as string || '')
const fileName = computed(() => filePath.value ? filePath.value.split(/[\\/]/).pop() : '新文档.md')
const fileEncoding = ref('UTF-8')
const isDirty = ref(false)
let vditor: Vditor | null = null

let autoSaveTimer: any = null
const triggerAutoSave = (content: string) => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    if (filePath.value) {
      try {
        await invoke('write_markdown_file', { path: filePath.value, content })
        isDirty.value = false
      } catch (e) { console.error('Auto-save failed', e) }
    }
  }, 2000)
}

const saveFile = async () => {
  if (!vditor || !filePath.value) return
  try {
    const content = vditor.getValue()
    await invoke('write_markdown_file', { path: filePath.value, content })
    isDirty.value = false
    message.success('已保存')
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
  } catch (err: any) {
    message.error('保存失败: ' + err)
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    e.stopPropagation()
    saveFile()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  let initialContent = ''
  if (filePath.value) {
    try {
      const result = await invoke<{content: string, encoding: string}>('read_markdown_file', { path: filePath.value })
      initialContent = result.content
      fileEncoding.value = result.encoding
    } catch (err: any) {
      message.error('读取失败: ' + err)
    }
  }

  vditor = new Vditor('vditor', {
    cdn: '/vditor',
    height: 'calc(100vh - 74px)',
    mode: 'wysiwyg',
    value: initialContent,
    placeholder: '开始记录胧月下的灵感...',
    theme: 'classic',
    icon: 'ant',
    customWysiwygToolbar: () => {}, 
    input: (val) => { 
      isDirty.value = true 
      triggerAutoSave(val)
    },
    preview: {
      delay: 300,
      actions: []
    }
  })
})

import { onUnmounted } from 'vue'
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
})
</script>

<style scoped>
.temp-mode { height: 100%; display: flex; flex-direction: column; }
.temp-header { height: 40px; background: rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.temp-info { display: flex; align-items: center; gap: 8px; }
.mode-tag { font-weight: bold; }
.file-name { font-size: 13px; font-weight: 500; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding { font-size: 11px; }
.dirty-dot { width: 6px; height: 6px; background: #ff4d4f; border-radius: 50%; }
.editor-container { flex: 1; overflow: hidden; }
:deep(.vditor) { border: none !important; background: transparent !important; }
:deep(.vditor-toolbar) { background: rgba(255, 255, 255, 0.02) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important; padding: 0 12px !important; }
:deep(.vditor-content) { background: transparent !important; }

:deep(.vditor-wysiwyg) {
  padding: 40px 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}

:deep(.vditor-reset) {
  width: 90% !important;
  max-width: 860px !important;
  margin: 0 auto !important;
  padding: 0 !important;
  color: inherit !important;
}
</style>
