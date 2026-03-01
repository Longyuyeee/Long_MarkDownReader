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

const saveFile = async () => {
  if (!vditor || !filePath.value) return
  try {
    const content = vditor.getValue()
    await invoke('write_markdown_file', { path: filePath.value, content })
    isDirty.value = false
    message.success('已保存')
  } catch (err: any) {
    message.error('保存失败: ' + err)
  }
}

const importToLibrary = async () => {
  if (!filePath.value) return
  try {
    const libraryRoot = 'C:\\Users\\Administrator\\Documents\\MistyLibrary' 
    await invoke('import_to_library', {
      sourcePath: filePath.value,
      libraryRoot,
      targetSubdir: ''
    })
    message.success('导入成功')
    setTimeout(() => router.push({ name: 'LibraryMode' }), 800)
  } catch (err: any) {
    message.error('导入失败: ' + err)
  }
}

onMounted(async () => {
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
    cdn: 'https://cdn.jsdelivr.net/npm/vditor',
    height: 'calc(100vh - 74px)',
    mode: 'wysiwyg',
    value: initialContent,
    placeholder: '开始记录胧月下的灵感...',
    theme: 'classic',
    icon: 'ant',
    input: () => { isDirty.value = true },
    after: () => {
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          saveFile()
        }
      })
    },
    preview: {
      delay: 300,
      actions: []
    }
  })
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
</style>
