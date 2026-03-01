<template>
  <div class="quick-note-window">
    <div class="quick-header" data-tauri-drag-region>
      <div class="title">快速笔记</div>
      <div class="close-btn" @click="close">✕</div>
    </div>
    <div class="quick-content">
      <n-input
        v-model:value="content"
        type="textarea"
        placeholder="写下这一刻的灵感..."
        :autosize="{ minRows: 8, maxRows: 8 }"
        autofocus
      />
    </div>
    <div class="quick-footer">
      <n-button size="small" secondary @click="close">取消</n-button>
      <n-button size="small" type="primary" :loading="saving" @click="save">保存并存入 Inbox</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Window } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'

const content = ref('')
const saving = ref(false)
const message = useMessage()

const close = () => {
  const win = new Window('quick-note')
  win.close()
}

const save = async () => {
  if (!content.value.trim()) return
  saving.value = true
  try {
    const config = await invoke<any>('get_config')
    const libPath = config.library_path
    if (!libPath) {
      message.error('请先设置库路径')
      return
    }
    
    const filePath = await invoke<string>('create_new_file', { libraryRoot: libPath })
    await invoke('write_markdown_file', { path: filePath, content: content.value })
    
    message.success('已保存至库')
    setTimeout(close, 500)
  } catch (err) {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.quick-note-window {
  height: 100vh;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(30px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.is-dark .quick-note-window {
  background: rgba(30, 30, 30, 0.8);
  border-color: rgba(255, 255, 255, 0.1);
}

.quick-header {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: rgba(0, 0, 0, 0.05);
  cursor: move;
}

.title {
  font-size: 12px;
  font-weight: bold;
  opacity: 0.6;
}

.close-btn {
  cursor: pointer;
  opacity: 0.5;
  font-size: 12px;
}

.quick-content {
  flex: 1;
  padding: 12px;
}

:deep(.n-input) {
  background: transparent !important;
  --n-border: none !important;
}

.quick-footer {
  padding: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}
</style>
