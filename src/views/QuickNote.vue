<template>
  <div class="quick-note-window">
    <div class="quick-header" data-tauri-drag-region>
      <div class="title">快速笔记 (存入 Inbox)</div>
      <div class="close-btn" @click="close">✕</div>
    </div>
    <div class="quick-content">
      <n-input
        v-model:value="content"
        type="textarea"
        placeholder="写下这一刻的灵感..."
        autofocus
        class="note-input"
      />
    </div>
    <div class="quick-footer">
      <n-button size="small" quaternary @click="close">丢弃</n-button>
      <n-button size="small" type="primary" :loading="saving" @click="save">立即存入文件库</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../store/app'

const content = ref('')
const saving = ref(false)
const message = useMessage()
const store = useAppStore()

onMounted(async () => {
  await store.loadConfig()
})

const close = async () => {
  await getCurrentWindow().destroy()
}

const save = async () => {
  if (!content.value.trim()) return
  saving.value = true
  try {
    const libPath = store.activeLibraryPath
    if (!libPath) {
      message.error('未检测到活跃文件库路径')
      return
    }
    
    // 生成格式：快速笔记_20260304_153022
    const now = new Date()
    const timestamp = now.getFullYear() + 
      String(now.getMonth() + 1).padStart(2, '0') + 
      String(now.getDate()).padStart(2, '0') + "_" +
      String(now.getHours()).padStart(2, '0') + 
      String(now.getMinutes()).padStart(2, '0') + 
      String(now.getSeconds()).padStart(2, '0')
    
    const prefix = `快速笔记_${timestamp}`
    
    const filePath = await invoke<string>('create_new_file', { libraryRoot: libPath, prefix })
    await invoke('write_markdown_file', { path: filePath, content: content.value })
    
    // 发送全局刷新事件
    await emit('refresh-library')
    
    message.success('已保存并同步')
    setTimeout(close, 600)
  } catch (err) {
    message.error('保存失败: ' + err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.quick-note-window {
  height: 100vh;
  background: var(--theme-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quick-header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--theme-card);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  cursor: move;
}

.title { font-size: 13px; font-weight: 700; color: var(--theme-primary); }
.close-btn { cursor: pointer; opacity: 0.6; font-size: 14px; transition: all 0.2s; }
.close-btn:hover { opacity: 1; color: #ff3b30; }

.quick-content {
  flex: 1;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 核心：允许 flex 子项缩小到小于内容高度 */
}

.note-input {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: transparent !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-focus: none !important;
  --n-box-shadow-focus: none !important;
}

:deep(.n-input__textarea-el) {
  padding: 0 !important;
  font-size: 14px !important;
  line-height: 1.6 !important;
  color: var(--theme-text) !important;
}

:deep(.n-input-wrapper) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

:deep(.n-input__textarea) {
  flex: 1;
}

.quick-footer {
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--theme-card);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  flex-shrink: 0; /* 核心：禁止页脚被挤出 */
}
</style>
