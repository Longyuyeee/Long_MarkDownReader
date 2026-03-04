<template>
  <div class="library-mode" :class="{ 'is-dragging': !!activeResizer }" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- 左侧侧边栏 -->
    <div class="sidebar" :style="{ width: isSidebarCollapsed ? '0px' : sidebarWidth + 'px', opacity: isSidebarCollapsed ? 0 : 1 }" v-if="!store.isZen">
      <div class="sidebar-inner">
        <div class="sidebar-header">
          <div class="search-area">
            <n-input v-model:value="searchQuery" placeholder="搜索文档..." size="small" round clearable>
              <template #prefix><n-icon :component="SearchIcon" /></template>
            </n-input>
          </div>
          <div class="toolbar-area">
            <n-button quaternary circle size="small" @click="handleToolbarAction('file')" title="新建笔记">
              <template #icon><n-icon :component="PlusIcon" /></template>
            </n-button>
            <n-button quaternary circle size="small" @click="handleToolbarAction('folder')" title="新建文件夹">
              <template #icon><n-icon :component="FolderPlusIcon" /></template>
            </n-button>
            <n-button quaternary circle size="small" @click="refreshLibrary" title="刷新列表">
              <template #icon><n-icon :component="RefreshIcon" /></template>
            </n-button>
          </div>
        </div>

        <div class="tree-viewport" :class="{ 'drop-active': virtualDrag.dropTarget === store.libraryPath }">
          <div v-if="!store.libraryPath" class="path-guide">
            <n-empty description="库未就绪" size="small">
              <template #extra>
                <n-button size="tiny" type="primary" @click="openSettings">去配置路径</n-button>
              </template>
            </n-empty>
          </div>
          <n-tree 
            v-else
            :data="treeData" 
            @update:selected-keys="handleNodeSelect" 
            lazy
            :on-load="handleLoadChildren"
            :node-props="nodeProps"
            v-model:selected-keys="selectedKeys"
            v-model:expanded-keys="expandedKeys"
          />
        </div>

        <div class="sidebar-footer" @click="openSettings">
          <n-button quaternary circle size="large" class="settings-trigger" title="设置">
            <template #icon><n-icon :component="SettingsIcon" /></template>
          </n-button>
          <div class="lib-meta">
            <span class="meta-title">当前文件库</span>
            <span class="meta-path" :title="store.libraryPath">{{ store.currentLibraryName }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 虚拟拖拽影子 -->
    <div v-if="virtualDrag.active" class="drag-ghost" :style="{ left: virtualDrag.x + 'px', top: virtualDrag.y + 'px' }">
      <n-icon :component="virtualDrag.dragNode?.isLeaf ? FileIcon : FolderIcon" />
      <span>{{ virtualDrag.ghostText }}</span>
    </div>

    <!-- 左侧分隔条 -->
    <div class="resizer-area" v-if="!store.isZen">
      <div class="drag-handle" @mousedown="startResizing('sidebar')"></div>
      <div class="collapse-btn left" @click="isSidebarCollapsed = !isSidebarCollapsed">
        <n-icon :component="isSidebarCollapsed ? ChevronRightIcon : ChevronLeftIcon" />
      </div>
    </div>

    <!-- 中间编辑区 -->
    <div class="editor-main" :class="{ 'zen-mode': store.isZen }">
      <div class="tabs-bar" v-if="!store.isZen && tabs.length > 0">
        <div class="tab-scroller" ref="tabsScrollRef" @wheel="handleTabsWheel">
          <div 
            v-for="tab in tabs" 
            :key="tab.id" 
            class="tab-pill" 
            :class="{ active: activeTabId === tab.id }" 
            @click="activeTabId = tab.id"
            :ref="(el) => { if (activeTabId === tab.id) activeTabRef = el as HTMLElement }"
          >
            <n-icon :component="FileIcon" class="pill-icon" />
            <span class="pill-text">{{ tab.title }}</span>
            <n-icon :component="CloseIcon" class="pill-close" @click.stop="closeTab(tab.id)" />
          </div>
        </div>
        <div class="tab-actions">
          <!-- 隐藏的调色盘触发器 -->
          <div class="hidden-picker-trigger">
            <n-color-picker 
              v-model:value="store.editorBgColor" 
              :modes="['hex']" 
              @update:value="handleEditorBgChange"
            />
          </div>
          <n-button size="tiny" quaternary round @click="saveCurrentFile" :disabled="!activeTabId">
            <template #icon><n-icon :component="SaveIcon" /></template>
            保存
          </n-button>
        </div>
      </div>
      
      <div class="editor-viewport" :style="{ '--custom-editor-bg': store.editorBgColor || 'transparent' }">
        <div v-if="editorLoading && tabs.length > 0" class="editor-loading">
          <n-spin size="large">
            <template #description>同步中...</template>
          </n-spin>
        </div>
        <div v-show="tabs.length > 0" id="vditor-lib" class="vditor-instance"></div>
        
        <div v-if="tabs.length === 0" class="hero-viewport">
          <div class="hero-content">
            <div class="hero-brand">胧</div>
            <h2>胧编辑 · MD助手</h2>
            <p>选择一个文档或直接将文件拖拽至此</p>
            <div class="hero-actions">
              <n-button secondary type="primary" round @click="handleToolbarAction('file')">创建新笔记</n-button>
              <n-button secondary round @click="openSettings">文件库配置</n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧分隔条 -->
    <div class="resizer-area" v-if="!store.isZen && tabs.length > 0">
      <div class="collapse-btn right" @click="isInspectorCollapsed = !isInspectorCollapsed">
        <n-icon :component="isInspectorCollapsed ? ChevronLeftIcon : ChevronRightIcon" />
      </div>
      <div class="drag-handle" @mousedown="startResizing('inspector')"></div>
    </div>

    <!-- 右侧面板 (大纲 & 历史) -->
    <div 
      class="inspector-sidebar" 
      :style="{ 
        width: (!store.isZen && tabs.length > 0 && !isInspectorCollapsed) ? inspectorWidth + 'px' : '0px', 
        opacity: (!store.isZen && tabs.length > 0 && !isInspectorCollapsed) ? 1 : 0
      }"
    >
      <n-tabs type="segment" animated justify-content="space-evenly" size="small" class="inspector-tabs" display-directive="show">
        <n-tab-pane name="outline" tab="大纲" class="inspector-pane">
          <div class="manual-outline-box">
            <div v-if="outlineItems.length === 0" class="empty-outline">
              <n-empty description="暂无大纲" size="small" />
            </div>
            <div v-else class="outline-list">
              <div 
                v-for="item in outlineItems" 
                :key="item.id" 
                class="outline-item"
                :class="['level-' + item.level]"
                @click="scrollToHeading(item.id)"
              >
                {{ item.text }}
              </div>
            </div>
          </div>
        </n-tab-pane>
        <n-tab-pane name="history" tab="历史" class="inspector-pane">
          <div class="history-box">
            <div class="history-header">
              <span>影子副本 ({{ historyList.length }})</span>
              <n-button quaternary circle size="tiny" @click="clearAllHistory" title="清空全部缓存">
                <template #icon><n-icon :component="TrashIcon" /></template>
              </n-button>
            </div>
            
            <div v-if="historyList.length === 0" class="empty-history">
              <n-empty description="暂无历史快照" size="small" />
            </div>
            
            <div v-else class="history-bubbles-wrapper">
              <div v-for="h in historyList" :key="h.timestamp" class="history-bubble" @click="restoreHistory(h.content)">
                <div class="bubble-content">
                  <div class="bubble-top">
                    <span class="bubble-time">{{ formatTime(h.timestamp) }}</span>
                    <span class="bubble-meta">{{ h.content.length }} 字</span>
                  </div>
                  <div class="bubble-preview">{{ h.content.slice(0, 80).replace(/[\n#*`]/g, ' ') }}...</div>
                </div>
                <div class="bubble-actions">
                  <n-button quaternary circle size="tiny" class="delete-trigger" @click.stop="deleteHistory(h.timestamp)">
                    <template #icon><n-icon :component="CloseIcon" /></template>
                  </n-button>
                </div>
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>

    <HoverPreview :show="preview.show" :title="preview.title" :path="preview.path" :x="preview.x" :y="preview.y" />
    
    <n-dropdown
      placement="bottom-start" trigger="manual" :x="contextMenu.x" :y="contextMenu.y"
      :options="contextMenu.options" :show="contextMenu.show"
      :on-clickoutside="() => contextMenu.show = false" @select="onMenuAction"
    />

    <n-modal v-model:show="renameState.show" preset="dialog" title="项目重命名" positive-text="更新" negative-text="取消" @positive-click="applyRename">
      <n-input v-model:value="renameState.newName" placeholder="请输入新名称（无需后缀）" autofocus @keyup.enter="applyRename" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, computed, reactive, h, onUnmounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMessage, TreeOption, NIcon, NDropdown } from 'naive-ui'
import { 
  Search as SearchIcon, Settings as SettingsIcon, X as CloseIcon, 
  RefreshCw as RefreshIcon, FileText as FileIcon, Folder as FolderIcon,
  Plus as PlusIcon, FolderPlus as FolderPlusIcon, Trash as TrashIcon,
  Edit as EditIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  Save as SaveIcon
} from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore } from '../store/app'
import { storeToRefs } from 'pinia'
import HoverPreview from '../components/HoverPreview.vue'
import { useRouter } from 'vue-router'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface FileEntry { name: string; path: string; is_dir: boolean; }
interface OutlineItem { id: string; text: string; level: number; }

const message = useMessage()
const store = useAppStore()
const { tabs, activeTabId } = storeToRefs(store)
const router = useRouter()

const updateDropTarget = (x: number, y: number, isExternal: boolean) => {
  const el = document.elementFromPoint(x, y)
  const targetEl = el?.closest('[data-key]')
  if (targetEl) {
    const key = targetEl.getAttribute('data-key'); const isDir = targetEl.getAttribute('data-is-dir') === 'true'
    if (key && isDir && (isExternal || key !== virtualDrag.dragNode?.key)) {
      virtualDrag.dropTarget = key
    } else { virtualDrag.dropTarget = null }
  } else {
    const isOverViewport = el?.closest('.tree-viewport')
    if (isOverViewport) {
      if (!isExternal) {
        const sourcePath = virtualDrag.dragNode?.key as string
        const lastSlash = Math.max(sourcePath.lastIndexOf('\\'), sourcePath.lastIndexOf('/'))
        const parentPath = lastSlash !== -1 ? sourcePath.substring(0, lastSlash) : ''
        if (parentPath === store.libraryPath) virtualDrag.dropTarget = null; else virtualDrag.dropTarget = store.libraryPath
      } else { virtualDrag.dropTarget = store.libraryPath }
    } else { virtualDrag.dropTarget = null }
  }
}

// 状态
const editorLoading = ref(false)
const isSidebarCollapsed = ref(false)
const isInspectorCollapsed = ref(false)
const sidebarWidth = ref(260)
const inspectorWidth = ref(300)
const activeResizer = ref<'sidebar' | 'inspector' | null>(null)
const activeTabRef = ref<HTMLElement | null>(null)

// 标签页自动滚动逻辑
watch(activeTabId, () => {
  nextTick(() => {
    if (activeTabRef.value) {
      activeTabRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  })
})

const treeData = ref<TreeOption[]>([])
const searchQuery = ref('')
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
let vditor: any = null
let isVditorReady = false
let lastLoadedPath = '' 
let outlineObserver: MutationObserver | null = null

const outlineItems = ref<OutlineItem[]>([])

const preview = reactive({ show: false, title: '', path: '', x: 0, y: 0 })
const contextMenu = reactive({ show: false, x: 0, y: 0, targetPath: '', isDir: false, options: [] as any[] })
const renameState = reactive({ show: false, oldPath: '', newName: '' })
const historyList = ref<{timestamp: number, content: string}[]>([])

const openSettings = () => router.push('/settings')

const fetchHistory = async () => {
  if (!activeTabId.value) return
  try {
    const res = await invoke<[number, string][]>('list_history', { path: activeTabId.value })
    historyList.value = res.map(([timestamp, content]) => ({ timestamp, content }))
  } catch (e) { console.error('Failed to fetch history', e) }
}

const restoreHistory = (content: string) => {
  if (!vditor || !isVditorReady) return
  vditor.setValue(content)
  message.success('已恢复到该历史版本')
}

const deleteHistory = async (timestamp: number) => {
  if (!activeTabId.value) return
  try {
    await invoke('delete_history_version', { path: activeTabId.value, timestamp })
    await fetchHistory()
    message.success('已移除该备份')
  } catch (e) { message.error('删除失败') }
}

const clearAllHistory = async () => {
  if (!confirm('确定要清除所有文件的历史备份吗？')) return
  try {
    await invoke('clear_all_history')
    historyList.value = []
    message.success('历史缓存已全部清空')
  } catch (e) { message.error('清空失败') }
}

const formatTime = (ts: number) => {
  const date = new Date(ts * 1000)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

let shadowSaveTimer: any = null
const startShadowSaveTimer = () => {
  if (shadowSaveTimer) clearInterval(shadowSaveTimer)
  const interval = store.autoSaveInterval * 60 * 1000
  shadowSaveTimer = setInterval(async () => {
    if (activeTabId.value && activeTabId.value === lastLoadedPath && vditor && isVditorReady) {
      const content = vditor.getValue()
      if (content && content.trim().length > 0) {
        await invoke('save_history_version', { path: activeTabId.value, content, maxCount: store.maxHistoryCount })
        fetchHistory()
      }
    }
  }, interval)
}

watch(() => store.autoSaveInterval, () => {
  startShadowSaveTimer()
  message.info(`保存间隔已重置为 ${store.autoSaveInterval} 分钟`)
})

const libraryName = computed(() => {
  if (!store.libraryPath) return ''
  const normalizedPath = store.libraryPath.replace(/\\/g, '/')
  const parts = normalizedPath.split('/').filter(Boolean)
  return parts[parts.length - 1] || '根目录'
})

const startResizing = (type: 'sidebar' | 'inspector') => { activeResizer.value = type }

const scrollToHeading = (id: string) => {
  if (!vditor) return
  const targetEl = vditor.vditor.wysiwyg.element.querySelector(`[data-id="${id}"]`) || vditor.vditor.wysiwyg.element.querySelector(`#${id}`)
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const syncOutlineManual = () => {
  if (!vditor || !isVditorReady) return
  const contentEl = vditor.vditor.wysiwyg?.element
  if (!contentEl) return
  const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const newItems: OutlineItem[] = []
  headings.forEach((h: HTMLElement, index: number) => {
    if (!h.id) h.id = `heading-${index}`
    const id = h.getAttribute('data-id') || h.id
    newItems.push({ id: id, text: h.innerText.trim() || '未命名标题', level: parseInt(h.tagName.substring(1)) })
  })
  outlineItems.value = newItems
}

const initOutlineObserver = () => {
  if (outlineObserver) outlineObserver.disconnect()
  const contentEl = vditor.vditor.wysiwyg?.element
  if (!contentEl) return
  outlineObserver = new MutationObserver(() => syncOutlineManual())
  outlineObserver.observe(contentEl, { childList: true, subtree: true, characterData: true })
}

const virtualDrag = reactive({ active: false, x: 0, y: 0, startX: 0, startY: 0, dragNode: null as any, dropTarget: null as any, ghostText: '', timer: null as any })

const onMouseUp = async () => {
  activeResizer.value = null
  if (virtualDrag.timer) { clearTimeout(virtualDrag.timer); virtualDrag.timer = null }
  if (virtualDrag.active) {
    const sourcePath = virtualDrag.dragNode?.key; const targetPath = virtualDrag.dropTarget
    if (sourcePath && targetPath && sourcePath !== targetPath) {
      try {
        message.loading('正在移动...', { duration: 1000 })
        await invoke('move_item', { sourcePath, targetDir: targetPath })
        const sourceParentIndex = Math.max(sourcePath.lastIndexOf('\\'), sourcePath.lastIndexOf('/'))
        const sourceParentPath = sourceParentIndex !== -1 ? sourcePath.substring(0, sourceParentIndex) : store.libraryPath
        await refreshNode(sourceParentPath); if (sourceParentPath !== targetPath) await refreshNode(targetPath)
        message.success('移动成功')
      } catch (err: any) { message.error('移动失败') }
    }
    virtualDrag.active = false; virtualDrag.dragNode = null; virtualDrag.dropTarget = null
  }
}

const onMouseMove = (e: MouseEvent) => {
  if (activeResizer.value === 'sidebar') { sidebarWidth.value = Math.max(180, Math.min(e.clientX, 500)) }
  else if (activeResizer.value === 'inspector') { inspectorWidth.value = Math.max(240, Math.min(window.innerWidth - e.clientX, 500)) }
  virtualDrag.x = e.clientX; virtualDrag.y = e.clientY
  if (virtualDrag.active) { updateDropTarget(e.clientX, e.clientY, false) }
}

const loadDirectory = async (path: string): Promise<TreeOption[]> => {
  if (!path) return []
  try {
    const entries = await invoke<FileEntry[]>('scan_directory', { path })
    return entries.map(entry => ({ label: entry.is_dir ? entry.name : entry.name.replace(/\.md$/, ''), key: entry.path, isLeaf: !entry.is_dir, children: entry.is_dir ? undefined : undefined, prefix: () => h(entry.is_dir ? FolderIcon : FileIcon, { size: 14, style: 'opacity: 0.6' }) }))
  } catch (err) { return [] }
}

const refreshLibrary = async () => { if (store.libraryPath) treeData.value = await loadDirectory(store.libraryPath) }

const refreshNode = async (path: string) => {
  if (!path || !store.libraryPath) return
  const newEntries = await loadDirectory(path)
  const syncNodes = (oldNodes: TreeOption[], newNodes: TreeOption[]) => {
    const oldMap = new Map(oldNodes.map(n => [n.key, n]))
    return newNodes.map(newNode => { const matchedOld = oldMap.get(newNode.key as string); if (matchedOld && matchedOld.children !== undefined) return { ...newNode, children: matchedOld.children }; return newNode })
  }
  if (path === store.libraryPath) { treeData.value = syncNodes(treeData.value, newEntries) } else {
    const patch = (nodes: TreeOption[]): boolean => { for (let i = 0; i < nodes.length; i++) { if (nodes[i].key === path) { nodes[i].children = syncNodes(nodes[i].children || [], newEntries); return true } if (nodes[i].children && patch(nodes[i].children)) return true } return false }
    patch(treeData.value); treeData.value = [...treeData.value]
  }
}

const loadFileToEditor = async (path: string) => {
  if (!vditor || !path) return
  lastLoadedPath = '' 
  try {
    const res = await invoke<{content: string}>('read_markdown_file', { path })
    vditor.setValue(res.content)
    fetchHistory()
    nextTick(() => { setTimeout(() => { lastLoadedPath = path; syncOutlineManual(); initOutlineObserver() }, 200) })
  } catch (err) { message.error("读取失败") }
}

const handleNodeSelect = (keys: string[]) => {
  const path = keys[0]; if (!path) return
  selectedKeys.value = keys
  if (path.endsWith('.md')) { 
    const title = path.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '笔记'; 
    store.addTab({ id: path, title, path, isDirty: false }) 
  }
}

const handleLoadChildren = async (option: TreeOption) => { option.children = await loadDirectory(option.key as string) }

const codeThemeOptions = [
  { label: 'GitHub', value: 'github' },
  { label: 'Monokai', value: 'monokai' },
  { label: 'Dracula', value: 'dracula' },
  { label: 'VS Code', value: 'vscode' },
  { label: 'Native', value: 'native' },
  { label: 'One Dark', value: 'one-dark' }
]

const handleCodeThemeChange = async (val: string) => {
  store.codeTheme = val
  await store.updateConfig({ codeTheme: val })
  if (vditor && isVditorReady) {
    const isDark = store.theme === 'dark'
    vditor.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', val)
  }
}

const handleEditorBgChange = async (val: string) => {
  store.editorBgColor = val
  await store.updateConfig({ editorBgColor: val })
}

const deleteAction = async (path: string) => {
  if (!path) return; const displayTitle = path.split(/[\\/]/).pop()?.replace(/\.md$/, '')
  const parentPath = path.substring(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')))
  if (confirm(`确认要物理删除 ${displayTitle}吗？`)) { 
    try { 
      await invoke('delete_item', { path }); 
      if (activeTabId.value === path) store.removeTab(path); 
      await refreshNode(parentPath || store.libraryPath); 
      message.success('已删除') 
    } catch (e) { message.error('删除失败') } 
  }
}

const nodeProps = ({ option }: { option: TreeOption }) => ({
  'data-key': option.key, 'data-is-dir': !option.isLeaf ? 'true' : 'false', class: virtualDrag.dropTarget === option.key ? 'drop-active' : '',
  onMousedown: (e: MouseEvent) => { if (e.button !== 0) return; virtualDrag.startX = e.clientX; virtualDrag.startY = e.clientY; if (virtualDrag.timer) clearTimeout(virtualDrag.timer); virtualDrag.timer = setTimeout(() => { virtualDrag.active = true; virtualDrag.dragNode = option; virtualDrag.ghostText = option.label as string; virtualDrag.timer = null }, 350) },
  onClick: () => { if (virtualDrag.active) return; handleNodeSelect([option.key as string]); if (!option.isLeaf) { const key = option.key as string; const index = expandedKeys.value.indexOf(key); if (index > -1) expandedKeys.value.splice(index, 1); else expandedKeys.value.push(key); expandedKeys.value = [...expandedKeys.value] } },
  onContextmenu: (e: MouseEvent) => { if (virtualDrag.active) return; e.preventDefault(); contextMenu.show = false; setTimeout(() => { contextMenu.x = e.clientX; contextMenu.y = e.clientY; contextMenu.targetPath = option.key as string; contextMenu.isDir = !option.isLeaf; const items = [ { label: '重命名 (F2)', key: 'rename', icon: () => h(NIcon, null, { default: () => h(EditIcon) }) }, { label: '物理删除 (Del)', key: 'delete', icon: () => h(NIcon, { color: '#f5222d' }, { default: () => h(TrashIcon) }) } ]; if (contextMenu.isDir) { items.unshift({ label: '新建子笔记', key: 'add-file', icon: () => h(NIcon, null, { default: () => h(PlusIcon) }) }, { label: '新建子文件夹', key: 'add-folder', icon: () => h(NIcon, null, { default: () => h(FolderPlusIcon) }) }) } contextMenu.options = items; contextMenu.show = true }, 50) }
})

const onMenuAction = async (key: string) => {
  contextMenu.show = false; const path = contextMenu.targetPath
  if (key === 'rename') { renameState.oldPath = path; const parts = path.split(/[\\/]/).filter(Boolean); let name = parts[parts.length - 1] || ''; if (!contextMenu.isDir) { const lastDot = name.lastIndexOf('.'); if (lastDot > 0) name = name.substring(0, lastDot) } renameState.newName = name; renameState.show = true }
  else if (key === 'delete') { await deleteAction(path) }
  else if (key === 'add-file') { const p = await invoke<string>('create_new_file', { libraryRoot: store.libraryPath, targetDir: path }); if (!expandedKeys.value.includes(path)) expandedKeys.value.push(path); await refreshNode(path); handleNodeSelect([p]) }
  else if (key === 'add-folder') { await invoke('create_new_folder', { parentPath: path }); if (!expandedKeys.value.includes(path)) expandedKeys.value.push(path); await refreshNode(path) }
}

const handleToolbarAction = async (type: 'file' | 'folder') => {
  if (!store.libraryPath) { openSettings(); return }
  let target = store.libraryPath; if (selectedKeys.value.length > 0) { const sel = selectedKeys.value[0]; target = sel.endsWith('.md') ? sel.substring(0, Math.max(sel.lastIndexOf('\\'), sel.lastIndexOf('/'))) : sel }
  try { if (type === 'file') { const p = await invoke<string>('create_new_file', { libraryRoot: store.libraryPath, targetDir: target }); await refreshNode(target); handleNodeSelect([p]) } else { await invoke('create_new_folder', { parentPath: target }); await refreshNode(target) } } catch (e) { message.error('操作失败') }
}

const applyRename = async () => {
  try { let finalName = renameState.newName; if (renameState.oldPath.endsWith('.md') && !finalName.endsWith('.md')) finalName += '.md'; await invoke('rename_item', { oldPath: renameState.oldPath, newName: finalName }); const parentPath = renameState.oldPath.substring(0, Math.max(renameState.oldPath.lastIndexOf('\\'), renameState.oldPath.lastIndexOf('/'))); await refreshNode(parentPath || store.libraryPath); renameState.show = false; message.success('修改成功') } catch (e) { message.error('重命名失败') }
}

const closeTab = (id: string) => store.removeTab(id)

let autoSaveTimer: any = null
const triggerAutoSave = (content: string) => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    const cur = tabs.value.find(t => t.id === activeTabId.value)
    if (cur) { try { await invoke('write_markdown_file', { path: cur.path, content }) } catch (e) {} }
  }, 2000)
}

const saveCurrentFile = async () => {
  if (!vditor || !activeTabId.value) return; const t = tabs.value.find(item => item.id === activeTabId.value)
  if (t) { try { const content = vditor.getValue(); await invoke('write_markdown_file', { path: t.path, content }); message.success('已保存'); if (autoSaveTimer) clearTimeout(autoSaveTimer) } catch (e) { message.error('保存失败') } }
}

// 核心：处理 Vditor 模式同步与点击捕获
const syncVditorMode = () => {
  if (!vditor) return
  const currentMode = vditor.getCurrentMode()
  // 增加对分栏预览状态的判定
  let finalMode = currentMode
  if (vditor.vditor.options.preview.mode === 'both') {
    // 如果处于分栏模式，可以根据需要特殊处理，但 Vditor 官方 getCurrentMode 足够覆盖
  }
  
  if (currentMode && currentMode !== store.editorMode) {
    store.updateConfig({ editorMode: currentMode as any })
  }
}

const handleEditorClick = (e: MouseEvent) => {
  const isToolbarBtn = (e.target as HTMLElement).closest('.vditor-toolbar__item')
  if (isToolbarBtn) {
    // 延迟更久一点，确保 Vditor 内部状态机切换完成
    setTimeout(() => {
      syncVditorMode()
      // 如果点击的是代码主题切换
      const themeBtn = (e.target as HTMLElement).closest('[data-type="code-theme"]')
      if (themeBtn) {
        // 主题已在 handleCodeThemeChange 中保存，此处仅为双保险
      }
    }, 300)
  }
}

const initVditor = () => {
  const container = document.getElementById('vditor-lib'); if (!container) return
  container.addEventListener('click', handleEditorClick)
  
  editorLoading.value = true
  try {
    vditor = new Vditor('vditor-lib', {
      cdn: '/vditor', lang: 'zh_CN', height: '100%', 
      mode: store.editorMode || 'wysiwyg', 
      cache: { enable: false }, theme: store.theme === 'dark' ? 'dark' : 'classic',
      preview: { 
        theme: { current: store.theme === 'dark' ? 'dark' : 'light' }, 
        hljs: { enable: true, style: store.codeTheme || 'github' }, 
        anchor: 1 
      },
      // ... 
      // ... (rest of config)
      toolbar: [
        'undo', 'redo', '|', 
        'emoji', 'headings', 'bold', 'italic', 'strike', '|',
        'line', 'quote', 'list', 'ordered-list', 'check', '|',
        'code', 'inline-code', 
        {
          name: 'code-theme',
          tip: '代码高亮风格',
          icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>',
          click: () => {
            const themes = codeThemeOptions.map(o => o.value)
            const currentIdx = themes.indexOf(store.codeTheme)
            const nextTheme = themes[(currentIdx + 1) % themes.length]
            handleCodeThemeChange(nextTheme)
            message.info(`代码风格: ${nextTheme.toUpperCase()}`)
          }
        },
        {
          name: 'editor-bg',
          tip: '修改文章背景色',
          icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>',
          click: () => {
            const trigger = document.querySelector('.hidden-picker-trigger .n-color-picker-trigger') as HTMLElement
            trigger?.click()
          }
        },
        '|',
        'upload', 'link', 'table', '|',
        'both', 'preview', 'edit-mode'
      ],
      toolbarConfig: { hide: false },
      customWysiwygToolbar: () => {}, 
      input: (val) => {
        const cur = tabs.value.find(t => t.id === activeTabId.value)
        if (cur) { triggerAutoSave(val); }
        // 实时同步模式
        const currentMode = vditor.getCurrentMode()
        if (currentMode && currentMode !== store.editorMode) {
          store.updateConfig({ editorMode: currentMode as any })
        }
      },
      after: () => {
        isVditorReady = true; editorLoading.value = false
        // 确保初始化完成后，如果模式不对，进行一次同步
        const actualMode = vditor.getCurrentMode()
        if (actualMode && actualMode !== store.editorMode) {
          store.updateConfig({ editorMode: actualMode as any })
        }
        if (activeTabId.value) { const t = tabs.value.find(item => item.id === activeTabId.value); if (t) loadFileToEditor(t.path) }
      }
    })
  } catch (e) { editorLoading.value = false }
}

// 监听代码主题变化并实时更新编辑器
watch(() => store.codeTheme, (newTheme) => {
  if (vditor && isVditorReady) {
    const isDark = store.theme === 'dark'
    vditor.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', newTheme)
  }
}, { immediate: true })

const handleTabsWheel = (e: WheelEvent) => { if (tabsScrollRef.value) tabsScrollRef.value.scrollLeft += e.deltaY }
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'F2' && selectedKeys.value.length > 0) { const p = selectedKeys.value[0]; renameState.oldPath = p; const parts = p.split(/[\\/]/).filter(Boolean); let name = parts[parts.length - 1] || ''; if (p.endsWith('.md')) { const lastDot = name.lastIndexOf('.'); if (lastDot > 0) name = name.substring(0, lastDot) } renameState.newName = name; renameState.show = true }
  if (e.key === 'Delete' && selectedKeys.value.length > 0) deleteAction(selectedKeys.value[0])
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); e.stopPropagation(); saveCurrentFile() }
}

const tabsScrollRef = ref<HTMLElement | null>(null)
let searchDebounce: any = null
onMounted(async () => { 
  await store.loadConfig()
  window.addEventListener('keydown', handleKeyDown); 
  if (store.libraryPath) await refreshLibrary(); 
  nextTick(() => { initVditor(); startShadowSaveTimer() })

  const appWindow = getCurrentWindow()
  appWindow.onDragDropEvent(async (event) => {
    if (event.payload.type === 'over') { updateDropTarget(event.payload.position.x, event.payload.position.y, true) }
    else if (event.payload.type === 'drop') {
      const paths = event.payload.paths; const targetDir = virtualDrag.dropTarget || store.libraryPath
      if (paths.length > 0 && targetDir) {
        try { message.loading(`正在导入...`); for (const p of paths) { await invoke('import_to_library', { sourcePath: p, libraryRoot: store.libraryPath, targetDir }) } await refreshNode(targetDir); message.destroyAll(); message.success('导入完成') }
        catch (err) { message.destroyAll(); message.error('导入失败') }
      }
      virtualDrag.dropTarget = null
    } else { virtualDrag.dropTarget = null }
  })
})

watch(() => store.libraryPath, (newPath) => { if (newPath) refreshLibrary() })
onUnmounted(() => { window.removeEventListener('keydown', handleKeyDown); if (autoSaveTimer) clearTimeout(autoSaveTimer); if (shadowSaveTimer) clearInterval(shadowSaveTimer); if (outlineObserver) outlineObserver.disconnect() })
watch(activeTabId, (newId) => { if (newId) { const t = tabs.value.find(item => item.id === newId); if (t) loadFileToEditor(t.path) } })
watch(searchQuery, (val) => { if (searchDebounce) clearTimeout(searchDebounce); if (!val.trim()) { refreshLibrary(); return }; searchDebounce = setTimeout(async () => { try { const results = await invoke<FileEntry[]>('search_library', { libraryRoot: store.libraryPath, query: val.trim() }); treeData.value = results.map(entry => ({ label: entry.is_dir ? entry.name : entry.name.replace(/\.md$/, ''), key: entry.path, isLeaf: !entry.is_dir, prefix: () => h(entry.is_dir ? FolderIcon : FileIcon, { size: 14, style: 'opacity: 0.6' }) })) } catch (e) {} }, 300) })
</script>

<style scoped>
.library-mode { display: flex; height: 100%; width: 100vw; overflow: hidden; background: transparent; user-select: auto !important; box-sizing: border-box; animation: fadeIn 0.6s ease-out; }
.is-dragging, .is-dragging * { transition: none !important; }

.sidebar { height: 100%; background: rgba(255, 255, 255, 0.4); backdrop-filter: saturate(180%) blur(40px); border-right: 1px solid rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; overflow: hidden; transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease; z-index: 20; }
.is-dark .sidebar { background: rgba(28, 28, 30, 0.5); border-right: 1px solid rgba(255, 255, 255, 0.08); }
.sidebar-inner { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { padding: 24px 16px 12px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; }
.tree-viewport { flex: 1; overflow-y: auto; padding: 4px 12px; border: 2px solid transparent; transition: all 0.2s; }
/* 核心修复：长文本截断 */
:deep(.n-tree-node-content) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
:deep(.n-tree-node-content__text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}
.tree-viewport.drop-active { background: rgba(0, 122, 255, 0.05); border-color: rgba(0, 122, 255, 0.3); border-radius: 8px; }
:deep(.n-tree-node.drop-active .n-tree-node-content) { background: rgba(0, 122, 255, 0.1) !important; box-shadow: 0 0 0 1px rgba(0, 122, 255, 0.3) inset; border-radius: 6px; }
.sidebar-footer { margin: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; background: rgba(255, 255, 255, 0.5); border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.05); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); cursor: pointer; }
.is-dark .sidebar-footer { background: rgba(255, 255, 255, 0.05); }
.meta-path { font-size: 13px; font-weight: 600; color: #1d1d1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-dark .meta-path { color: #f5f5f7; }

.resizer-area { position: relative; width: 1px; height: 100%; z-index: 100; background: rgba(0, 0, 0, 0.03); cursor: col-resize; }
.resizer-area:hover { background: #007aff; }
.drag-handle { position: absolute; top: 0; left: -8px; right: -8px; bottom: 0; z-index: 101; cursor: col-resize; }
.collapse-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 24px; height: 48px; background: var(--theme-card); color: var(--theme-text); border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 150; transition: all 0.3s ease; }
.is-dark .collapse-btn { border-color: rgba(255, 255, 255, 0.1); background: var(--theme-card); }
.collapse-btn:hover { background: var(--theme-primary); color: #fff; border-color: var(--theme-primary); }
.collapse-btn.left { left: 0px; border-radius: 0 12px 12px 0; }
.collapse-btn.right { right: 0px; border-radius: 12px 0 0 12px; }

.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; padding: 0 4px 4px; }
.tabs-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 0; gap: 12px; }
.tab-scroller { flex: 1; height: 40px; display: flex; gap: 8px; align-items: center; overflow-x: auto; scrollbar-width: none; }
.tab-pill { height: 30px; padding: 0 14px; display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; background: rgba(0, 0, 0, 0.03); border-radius: 15px; transition: all 0.3s; white-space: nowrap; max-width: 200px; }
.pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.tab-pill.active { background: #fff; color: #007aff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); }

/* 隐藏触发器样式 */
.hidden-picker-trigger {
  width: 0;
  height: 0;
  overflow: hidden;
  position: absolute;
}

.editor-viewport { flex: 1; position: relative; background: #fff; border-radius: 12px 12px 0 0; overflow: visible; display: flex; flex-direction: column; min-height: 0; z-index: 10; }
.is-dark .editor-viewport { background: #1c1c1e; }
.vditor-instance { flex: 1; height: 0; overflow: visible !important; }

/* 核心修复：确保自定义背景色穿透应用到 Vditor 内部 */
:deep(.vditor-wysiwyg), 
:deep(.vditor-preview), 
:deep(.vditor-panel),
:deep(.vditor-reset) {
  background-color: var(--custom-editor-bg) !important;
}

/* === 响应式智能气泡对齐 (适配折行布局) === */

/* 1. 基础重置：消除原生位移导致的撕裂，所有气泡默认靠左对齐并向右生长 */
:deep(.vditor-tooltipped::after) {
  background-color: rgba(28, 28, 30, 0.98) !important;
  color: #fff !important;
  font-size: 11px !important;
  padding: 7px 12px !important;
  border-radius: 6px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
  white-space: nowrap !important;
  width: max-content !important;
  left: 0 !important; /* 核心：对齐按钮左边缘 */
  right: auto !important;
  transform: translateY(-5px) !important; /* 仅向上微调，不再进行水平位移 */
  opacity: 0;
  pointer-events: none;
}

:deep(.vditor-tooltipped:hover::after) {
  opacity: 1;
}

/* 2. 箭头（尖尖）定位：始终居中指向按钮 */
:deep(.vditor-tooltipped::before) {
  left: 14px !important; /* 按钮中心位置 */
  transform: translateX(-50%) !important;
  border-top-color: rgba(28, 28, 30, 0.98) !important;
}

/* 3. 针对靠近最右边缘按钮的补偿（可选） */
/* 由于工具栏右侧通常有很大空间（tabs-actions），默认向右生长是最稳健的。
   如果在极窄模式下发生右侧出界，可以使用以下规则让最后的按钮向左展开 */
:deep(.vditor-toolbar__item:nth-last-child(-n+5) .vditor-tooltipped::after) {
  /* 在极窄布局下，最后几个按钮尝试向左生长以防止右侧出界 */
  left: auto !important;
  right: 0 !important;
}
:deep(.vditor-toolbar__item:nth-last-child(-n+5) .vditor-tooltipped::before) {
  left: auto !important;
  right: 14px !important;
}

:deep(.vditor-content) {
  overflow: hidden;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

/* 修正提示气泡样式，确保其不被遮挡 */
:deep(.vditor-tooltipped::after), 
:deep(.vditor-tooltipped::before) {
  z-index: 1000 !important;
}

.hero-viewport { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: inherit; z-index: 5; }
.hero-content { text-align: center; }
.hero-brand { font-size: 64px; font-weight: 800; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 20px; }
.hero-content h2 { font-size: 24px; font-weight: 600; margin-bottom: 8px; color: #1d1d1f; }
.is-dark .hero-content h2 { color: #f5f5f7; }
.hero-content p { color: #86868b; margin-bottom: 24px; }
.hero-actions { display: flex; gap: 12px; justify-content: center; }

.inspector-sidebar { height: 100%; background: rgba(255, 255, 255, 0.4); backdrop-filter: saturate(180%) blur(40px); border-left: 1px solid rgba(0, 0, 0, 0.05); overflow: hidden; transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease; }
.is-dark .inspector-sidebar { background: rgba(28, 28, 30, 0.5); border-left: 1px solid rgba(255, 255, 255, 0.08); }

.inspector-tabs { height: 100%; display: flex; flex-direction: column; }
:deep(.n-tabs-pane-wrapper) { flex: 1; min-height: 0; }
.inspector-pane { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

.manual-outline-box { padding: 12px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
.outline-list { display: flex; flex-direction: column; gap: 4px; padding-bottom: 40px; }
.outline-item { padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #1d1d1f; transition: all 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.is-dark .outline-item { color: #f5f5f7; }
.outline-item:hover { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.level-1 { font-weight: 700; font-size: 14px; }
.level-2 { padding-left: 24px; opacity: 0.9; }
.level-3 { padding-left: 36px; opacity: 0.8; font-size: 12.5px; }
.level-4 { padding-left: 48px; opacity: 0.7; font-size: 12px; }
.level-5 { padding-left: 60px; opacity: 0.6; font-size: 12px; }
.level-6 { padding-left: 72px; opacity: 0.5; font-size: 12px; }

.history-box { padding: 16px; height: 100%; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; }
.history-header { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #86868b; font-weight: 600; }
.history-bubbles-wrapper { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 20px; }
.history-bubble { position: relative; padding: 14px; background: #fff; border: 1px solid rgba(0, 0, 0, 0.06); border-radius: 14px; cursor: pointer; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); display: flex; gap: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02); }
.is-dark .history-bubble { background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.08); }
.history-bubble:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); border-color: #007aff; }
.bubble-content { flex: 1; min-width: 0; }
.bubble-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.bubble-time { font-size: 13px; font-weight: 700; color: #1d1d1f; }
.is-dark .bubble-time { color: #f5f5f7; }
.bubble-meta { font-size: 11px; color: #007aff; background: rgba(0, 122, 255, 0.1); padding: 1px 6px; border-radius: 4px; }
.bubble-preview { font-size: 12px; color: #86868b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }
.bubble-actions { opacity: 0; transition: opacity 0.2s; position: absolute; top: -8px; right: -8px; }
.history-bubble:hover .bubble-actions { opacity: 1; }

.drag-ghost { position: fixed; pointer-events: none; z-index: 9999; padding: 8px 12px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); border: 1px solid #007aff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); display: flex; align-items: center; gap: 8px; font-size: 13px; color: #007aff; }
</style>
