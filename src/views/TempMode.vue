<template>
  <div class="temp-mode" :class="{ 'is-dark': store.theme === 'dark' }">
    <div class="temp-header">
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
      <div class="temp-sidebar" :style="{ width: sidebarWidth + 'px' }" v-if="showOutline">
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
      <div class="resizer" @mousedown="startResizing" v-if="showOutline"></div>

      <!-- 编辑区 -->
      <div class="editor-container">
        <div id="vditor"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { useMessage, TreeOption, NIcon } from 'naive-ui'
import { List as ListIcon, BookPlus as BookPlusIcon } from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore } from '../store/app'

interface OutlineItem { id: string; text: string; level: number; }

const route = useRoute()
const router = useRouter()
const message = useMessage()
const store = useAppStore()

const filePath = ref(route.query.path as string || '')
const fileName = computed(() => filePath.value ? filePath.value.split(/[\\/]/).pop() : '新文档.md')
const isDirty = ref(false)
const sidebarWidth = ref(240)
const showOutline = ref(true)
const outlineItems = ref<OutlineItem[]>([])
let vditor: Vditor | null = null
let outlineObserver: MutationObserver | null = null

// 大纲逻辑复用
const outlineTreeData = computed(() => {
  const result: TreeOption[] = []
  const stack: { level: number; children: TreeOption[] }[] = [{ level: 0, children: result }]
  outlineItems.value.forEach(item => {
    const node: TreeOption = { label: item.text, key: item.id, level: item.level, children: [] }
    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push({ level: item.level, children: node.children as TreeOption[] })
  })
  const clean = (nodes: TreeOption[]) => {
    nodes.forEach(n => { if (n.children && n.children.length === 0) delete n.children; else if (n.children) clean(n.children) })
  }
  clean(result); return result
})

const handleOutlineSelect = (keys: string[]) => {
  if (keys.length > 0 && vditor) {
    const id = keys[0]
    const targetEl = (vditor as any).vditor.wysiwyg.element.querySelector(`[data-id="${id}"]`) || (vditor as any).vditor.wysiwyg.element.querySelector(`#${id}`)
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const syncOutlineManual = () => {
  if (!vditor) return
  const contentEl = (vditor as any).vditor.wysiwyg?.element; if (!contentEl) return
  const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const newItems: OutlineItem[] = []
  headings.forEach((h: HTMLElement, index: number) => {
    if (!h.id) h.id = `heading-${index}`
    const id = h.getAttribute('data-id') || h.id
    newItems.push({ id: id, text: h.innerText.trim() || '未命名标题', level: parseInt(h.tagName.substring(1)) })
  })
  outlineItems.value = newItems
}

// 核心逻辑：存入知识库
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
    
    // 自动转入库模式并打开该文件
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
  const onMouseMove = (moveEvent: MouseEvent) => {
    sidebarWidth.value = Math.max(150, Math.min(moveEvent.clientX, 400))
  }
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

onMounted(async () => {
  let initialContent = ''
  if (filePath.value) {
    try {
      const result = await invoke<{content: string}>('read_markdown_file', { path: filePath.value })
      initialContent = result.content
    } catch (err: any) { message.error('读取失败') }
  }

  vditor = new Vditor('vditor', {
    cdn: '/vditor',
    lang: 'zh_CN',
    height: 'calc(100vh - 40px)',
    mode: 'wysiwyg',
    value: initialContent,
    theme: store.theme === 'dark' ? 'dark' : 'classic',
    preview: { theme: { current: store.theme === 'dark' ? 'dark' : 'light' } },
    input: () => { isDirty.value = true },
    after: () => {
      syncOutlineManual()
      const contentEl = (vditor as any).vditor.wysiwyg?.element
      if (contentEl) {
        outlineObserver = new MutationObserver(() => syncOutlineManual())
        outlineObserver.observe(contentEl, { childList: true, subtree: true, characterData: true })
      }
    }
  })
})

onUnmounted(() => {
  if (outlineObserver) outlineObserver.disconnect()
})
</script>

<style scoped>
.temp-mode { height: 100vh; display: flex; flex-direction: column; background: var(--theme-bg); color: var(--theme-text); }
.temp-header { height: 40px; background: rgba(0, 0, 0, 0.03); display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid rgba(0, 0, 0, 0.05); z-index: 10; }
.is-dark .temp-header { background: rgba(255, 255, 255, 0.05); border-bottom-color: rgba(255, 255, 255, 0.1); }

.main-content { flex: 1; display: flex; overflow: hidden; }

.temp-sidebar { 
  background: rgba(0, 0, 0, 0.02); 
  border-right: 1px solid rgba(0, 0, 0, 0.05); 
  display: flex; flex-direction: column;
}
.is-dark .temp-sidebar { background: rgba(255, 255, 255, 0.02); border-right-color: rgba(255, 255, 255, 0.05); }

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

.compact-outline-tree :deep(.n-tree-node-content) { 
  font-size: 13px !important; 
  padding: 4px 8px !important; 
  overflow: hidden;
}

.compact-outline-tree :deep(.n-tree-node-content__text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}
</style>
