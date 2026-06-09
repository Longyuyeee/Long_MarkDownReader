<template>
  <div class="temp-mode" :class="{ 'is-dark': store.theme === 'dark', 'zen-mode': store.isZen }">
    <div class="temp-header" v-if="!store.isZen">
      <div class="temp-info">
        <n-tag :bordered="false" type="error" size="small" class="mode-tag">临时编辑</n-tag>
        <span class="file-name" :title="filePath">{{ fileName }}</span>
        <div v-if="isDirty" class="dirty-dot"></div>
      </div>
      <div class="actions">
        <n-button-group size="small">
          <n-button secondary type="primary" @click="importToLibrary" :disabled="!store.libraryPath">
            <template #icon><n-icon :component="BookPlusIcon" /></template>
            存入知识库
          </n-button>
          <n-button secondary type="success" @click="saveFile">保存</n-button>
        </n-button-group>
      </div>
    </div>

    <div class="main-content">
      <!-- 侧边大纲栏 -->
      <div class="temp-sidebar" :style="{ width: sidebarWidth + 'px' }" v-if="showOutline && !store.isZen">
        <div class="sidebar-header">
          <n-icon :component="ListIcon" />
          <span>文章目录</span>
        </div>
        <div class="outline-container">
          <div v-if="outlineTreeData.length === 0" class="empty-outline">暂无大纲</div>
          <n-tree
            v-else
            block-line
            expand-on-click
            :data="outlineTreeData"
            :on-update:selected-keys="handleOutlineSelect"
            class="compact-outline-tree"
            default-expand-all
          />
        </div>
      </div>

      <!-- 分隔条 -->
      <div class="resizer" @mousedown="startResizing" v-if="showOutline && !store.isZen"></div>

      <!-- 编辑区 -->
      <div class="editor-container">
        <div id="vditor"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useMessage, NIcon } from 'naive-ui'
import { List as ListIcon, BookPlus as BookPlusIcon } from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore } from '../store/app'
import { useOutline } from '../composables/useOutline'
import { useImageFix } from '../composables/useImageFix'
import { useVditorTheme } from '../composables/useVditorTheme'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const store = useAppStore()

const filePath = ref(route.query.path as string || '')
const fileName = computed(() => filePath.value ? filePath.value.split(/[\\/]/).pop() : '新文档.md')
const isDirty = ref(false)
const sidebarWidth = ref(240)
const showOutline = ref(true)
let vditor: Vditor | null = null

const { outlineTreeData, syncOutlineManual, scrollToHeading, setupOutlineObserver, destroyOutlineObserver } = useOutline(() => vditor)
const { fixEditorImages } = useImageFix(() => vditor, () => filePath.value)
useVditorTheme(() => vditor)

const handleOutlineSelect = (keys: string[]) => {
  if (keys.length > 0) scrollToHeading(keys[0])
}

// 核心修复：监听路径变化
watch(() => route.query.path, async (newPath) => {
  if (newPath && newPath !== filePath.value) {
    filePath.value = newPath as string
    await loadFileContent()
  }
})

const loadFileContent = async () => {
  if (!filePath.value) return
  try {
    const result = await invoke<{content: string}>('read_markdown_file', { path: filePath.value })
    if (vditor) {
      vditor.setValue(result.content)
      isDirty.value = false
      syncOutlineManual()
      nextTick(() => setTimeout(fixEditorImages, 300))
    }
  } catch (err: any) {
    message.error('读取文件失败: ' + filePath.value)
  }
}

const importToLibrary = async () => {
  if (!store.libraryPath || !filePath.value) return
  try {
    message.loading('正在存入知识库...')
    const newPath = await invoke<string>('import_to_library', {
      sourcePath: filePath.value,
      libraryRoot: store.libraryPath,
      targetDir: store.libraryPath
    })
    message.destroyAll()
    message.success('已成功存入知识库')
    const title = newPath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '笔记'
    store.addTab({ id: newPath, title, path: newPath, isDirty: false })
    router.push('/library')
  } catch (err) {
    message.destroyAll()
    message.error('存入失败: ' + err)
  }
}

const saveFile = async () => {
  if (!vditor || !filePath.value) return
  try {
    const content = vditor.getValue()
    await invoke('write_markdown_file', { path: filePath.value, content })
    isDirty.value = false
    message.success('已保存')
  } catch (err: any) { message.error('保存失败: ' + err) }
}

const startResizing = () => {
  const onMouseMove = (moveEvent: MouseEvent) => { sidebarWidth.value = Math.max(150, Math.min(moveEvent.clientX, 400)) }
  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
  document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
}

let unlistenExport: any = null
let shadowSaveTimer: any = null

const startShadowSaveTimer = () => {
  if (shadowSaveTimer) clearInterval(shadowSaveTimer)
  const interval = store.autoSaveInterval * 60 * 1000
  shadowSaveTimer = setInterval(async () => {
    if (vditor && filePath.value) {
      const content = vditor.getValue()
      if (content && content.trim().length > 0) {
        await invoke('save_history_version', { path: filePath.value, content, maxCount: store.maxHistoryCount }).catch(() => {})
      }
    }
  }, interval)
}

onMounted(async () => {
  let initialContent = ''
  if (filePath.value) {
    try {
      const result = await invoke<{content: string}>('read_markdown_file', { path: filePath.value })
      initialContent = result.content
    } catch (err: any) { message.error('读取失败') }
  }

  unlistenExport = await listen('command-export', async () => {
    if (!vditor || !filePath.value) { message.warning('无可导出的内容'); return }
    const html = vditor.getHTML()
    try { await invoke('export_to_html', { path: filePath.value, htmlContent: html }); message.success('HTML 已导出') } catch (e) { message.error('导出失败') }
  })

  vditor = new Vditor('vditor', {
    cdn: '/vditor',
    lang: 'zh_CN',
    height: '100%',
    mode: store.editorMode || 'wysiwyg',
    value: initialContent,
    cache: { enable: false },
    theme: store.theme === 'dark' ? 'dark' : 'classic',
    preview: {
      theme: { current: store.theme === 'dark' ? 'dark' : 'light' },
      hljs: { enable: true, style: store.codeTheme || 'github' }
    },
    toolbar: [
      'undo', 'redo', '|', 'emoji', 'headings', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', '|',
      'code', 'inline-code', 'upload', 'link', 'table', '|', 'both', 'preview', 'edit-mode'
    ],
    input: () => {
      isDirty.value = true
      fixEditorImages()
    },
    after: () => {
      syncOutlineManual()
      setTimeout(fixEditorImages, 500)
      setupOutlineObserver(fixEditorImages)
      const contentEl = (vditor as any).vditor.wysiwyg?.element
      if (contentEl) {
        contentEl.addEventListener('click', (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('.vditor-toolbar__item')) setTimeout(syncVditorMode, 300)
        })
      }
      startShadowSaveTimer()
    }
  })
})

onUnmounted(() => { destroyOutlineObserver(); if (vditor) vditor.destroy(); if (unlistenExport) unlistenExport(); if (shadowSaveTimer) clearInterval(shadowSaveTimer) })

const syncVditorMode = () => {
  if (vditor) {
    const currentMode = vditor.getCurrentMode()
    if (currentMode && currentMode !== store.editorMode) store.updateConfig({ editorMode: currentMode as any })
  }
}

watch(() => store.autoSaveInterval, () => { startShadowSaveTimer() })
</script>

<style scoped>
.temp-mode { height: 100%; display: flex; flex-direction: column; background: var(--theme-bg); color: var(--theme-text); }
.temp-header { height: 48px; background: var(--theme-bg); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid rgba(0, 0, 0, 0.05); z-index: 10; }
.is-dark .temp-header { background: rgba(255, 255, 255, 0.05); border-bottom-color: rgba(255, 255, 255, 0.1); }
.main-content { flex: 1; display: flex; overflow: hidden; }
.temp-sidebar { background: rgba(0, 0, 0, 0.02); border-right: 1px solid rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; }
.sidebar-header { padding: 12px 16px; font-size: 12px; font-weight: 700; opacity: 0.5; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(0, 0, 0, 0.03); }
.outline-container { flex: 1; overflow-y: auto; padding: 8px; }
.empty-outline { padding: 40px 20px; text-align: center; opacity: 0.3; font-size: 13px; }
.resizer { width: 4px; cursor: col-resize; transition: background 0.2s; }
.resizer:hover { background: var(--theme-primary); }
.editor-container { flex: 1; min-width: 0; background: transparent; }
.temp-info { display: flex; align-items: center; gap: 8px; }
.file-name { font-size: 13px; font-weight: 600; opacity: 0.8; }
.dirty-dot { width: 6px; height: 6px; background: #ff4d4f; border-radius: 50%; }
:deep(.vditor) { border: none !important; background: transparent !important; }
:deep(.vditor-toolbar) { background: transparent !important; border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important; }
:deep(.vditor-content) { background: transparent !important; }
:deep(.vditor-reset) { max-width: 800px !important; margin: 0 auto !important; color: inherit !important; }
.compact-outline-tree :deep(.n-tree-node-content) { font-size: 13px !important; padding: 4px 8px !important; overflow: hidden; }
.compact-outline-tree :deep(.n-tree-node-content__text) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

/* Zen 模式全屏适配 */
.temp-mode.zen-mode .main-content {
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}
.temp-mode.zen-mode :deep(.vditor-reset) {
  max-width: 100% !important;
}
</style>
