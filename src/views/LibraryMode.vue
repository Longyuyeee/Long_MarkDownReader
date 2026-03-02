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

        <div class="tree-viewport">
          <div v-if="!store.libraryPath" class="path-guide">
            <n-empty description="库未就绪" size="small">
              <template #extra>
                <n-button size="tiny" type="primary" @click="openSettings">去配置路径</n-button>
              </template>
            </n-empty>
          </div>
          <n-tree 
            v-else
            block-line 
            expand-on-click
            :data="treeData" 
            @update:selected-keys="handleNodeSelect" 
            virtual-scroll 
            lazy
            :on-load="handleLoadChildren"
            draggable
            :allow-drop="handleAllowDrop"
            @drop="handleDrop"
            :node-props="nodeProps"
            v-model:selected-keys="selectedKeys"
            v-model:expanded-keys="expandedKeys"
          />
        </div>

        <div class="sidebar-footer">
          <n-button quaternary circle size="large" @click="openSettings" class="settings-trigger" title="设置">
            <template #icon><n-icon :component="SettingsIcon" /></template>
          </n-button>
          <div class="lib-meta">
            <span class="meta-title">当前知识库</span>
            <span class="meta-path" :title="store.libraryPath">{{ libraryName || '未关联' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="resizer-area" v-if="!store.isZen">
      <div class="drag-handle" @mousedown="startResizing('sidebar')"></div>
      <div class="collapse-btn left" @click="isSidebarCollapsed = !isSidebarCollapsed">
        <n-icon :component="isSidebarCollapsed ? ChevronRightIcon : ChevronLeftIcon" />
      </div>
    </div>

    <div class="editor-main" :class="{ 'zen-mode': store.isZen }">
      <div class="tab-scroller" v-if="!store.isZen && tabs.length > 0">
        <div 
          v-for="tab in tabs" 
          :key="tab.id" 
          class="tab-pill" 
          :class="{ active: activeTabId === tab.id }" 
          @click="activeTabId = tab.id"
        >
          <n-icon :component="FileIcon" class="pill-icon" />
          <span class="pill-text">{{ tab.title }}</span>
          <n-icon :component="CloseIcon" class="pill-close" @click.stop="closeTab(tab.id)" />
        </div>
        <div class="tab-actions" v-if="tabs.length > 0">
          <n-button size="tiny" quaternary round @click="saveCurrentFile" :disabled="!activeTabId">
            <template #icon><n-icon :component="SaveIcon" /></template>
            保存
          </n-button>
        </div>
      </div>
      <div class="editor-viewport">
        <div v-if="editorLoading && tabs.length > 0" class="editor-loading">
          <n-spin size="large">
            <template #description>同步中...</template>
          </n-spin>
        </div>
        <div v-show="tabs.length > 0" id="vditor-lib" class="vditor-instance" style="flex: 1;"></div>
        <div v-if="tabs.length === 0" class="hero-viewport">
          <div class="hero-content">
            <div class="hero-brand">胧</div>
            <h2>胧编辑 · MD助手</h2>
            <p>选择一个文档或直接将文件拖拽至此</p>
            <div class="hero-actions">
              <n-button secondary type="primary" round @click="handleToolbarAction('file')">创建新笔记</n-button>
              <n-button secondary round @click="openSettings">软件库配置</n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="resizer-area" v-if="!store.isZen && tabs.length > 0">
      <div class="collapse-btn right" @click="isInspectorCollapsed = !isInspectorCollapsed">
        <n-icon :component="isInspectorCollapsed ? ChevronLeftIcon : ChevronRightIcon" />
      </div>
      <div class="drag-handle" @mousedown="startResizing('inspector')"></div>
    </div>

    <div class="inspector-sidebar" :style="{ width: isInspectorCollapsed ? '0px' : inspectorWidth + 'px', opacity: isInspectorCollapsed ? 0 : 1 }" v-if="!store.isZen && tabs.length > 0">
      <n-tabs type="segment" animated justify-content="space-evenly" size="small">
        <n-tab-pane name="outline" tab="大纲"><div id="outline-container" class="outline-box"></div></n-tab-pane>
        <n-tab-pane name="meta" tab="历史">
          <div class="history-box">
            <n-empty description="暂无快照" size="small" />
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
      <n-input v-model:value="renameState.newName" placeholder="请输入新名称（包含后缀）" autofocus @keyup.enter="applyRename" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, computed, reactive, h } from 'vue'
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

interface FileEntry { name: string; path: string; is_dir: boolean; }

const message = useMessage()
const store = useAppStore()
const { tabs, activeTabId } = storeToRefs(store)
const router = useRouter()

const editorLoading = ref(false)
const isSidebarCollapsed = ref(false)
const isInspectorCollapsed = ref(false)
const sidebarWidth = ref(260)
const inspectorWidth = ref(280)
const activeResizer = ref<'sidebar' | 'inspector' | null>(null)

const treeData = ref<TreeOption[]>([])
const searchQuery = ref('')
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
let vditor: Vditor | null = null
let isVditorReady = false

const preview = reactive({ show: false, title: '', path: '', x: 0, y: 0 })
const contextMenu = reactive({ show: false, x: 0, y: 0, targetPath: '', isDir: false, options: [] as any[] })
const renameState = reactive({ show: false, oldPath: '', newName: '' })

const libraryName = computed(() => store.libraryPath ? store.libraryPath.split(/[\\/]/).pop() : '')

const startResizing = (type: 'sidebar' | 'inspector') => { activeResizer.value = type }
const onMouseUp = () => { activeResizer.value = null }
const onMouseMove = (e: MouseEvent) => {
  if (activeResizer.value === 'sidebar') { sidebarWidth.value = Math.max(180, Math.min(e.clientX, 500)) }
  else if (activeResizer.value === 'inspector') { inspectorWidth.value = Math.max(200, Math.min(window.innerWidth - e.clientX, 500)) }
}

const openSettings = () => router.push('/settings')

const loadDirectory = async (path: string): Promise<TreeOption[]> => {
  if (!path) return []
  try {
    const entries = await invoke<FileEntry[]>('scan_directory', { path })
    return entries.map(entry => ({
      label: entry.name,
      key: entry.path,
      isLeaf: !entry.is_dir,
      children: entry.is_dir ? undefined : undefined, 
      prefix: () => h(entry.is_dir ? FolderIcon : FileIcon, { size: 14, style: 'opacity: 0.6' })
    }))
  } catch (err) { return [] }
}

const refreshLibrary = async () => { if (store.libraryPath) treeData.value = await loadDirectory(store.libraryPath) }

const loadFileToEditor = async (path: string) => {
  if (!vditor || !isVditorReady || !path) return
  try {
    const res = await invoke<{content: string}>('read_markdown_file', { path })
    vditor.setValue(res.content)
  } catch (err) { message.error("读取失败") }
}

const handleNodeSelect = (keys: string[]) => {
  const path = keys[0]; if (!path) return
  selectedKeys.value = keys
  if (path.endsWith('.md')) {
    store.addTab({ id: path, title: path.split(/[\\/]/).pop() || '笔记', path, isDirty: false })
  } else {
    // 选中文件夹时自动展开/收起
    if (expandedKeys.value.includes(path)) {
      expandedKeys.value = expandedKeys.value.filter(k => k !== path)
    } else {
      expandedKeys.value.push(path)
    }
  }
}

const handleAllowDrop = () => true
const handleDrop = async (info: any) => {
  const sourcePath = info.dragNode.key as string
  let targetDir = info.node.key as string
  if (info.dropPosition !== 0 || info.node.isLeaf) { targetDir = targetDir.substring(0, targetDir.lastIndexOf('\\')) }
  try {
    await invoke('move_item', { sourcePath, targetDir })
    await refreshLibrary(); message.success('移动成功')
  } catch (err) { message.error('移动失败') }
}

const handleLoadChildren = async (option: TreeOption) => {
  const children = await loadDirectory(option.key as string)
  option.children = children
}

const deleteAction = async (path: string) => {
  if (!path) return
  if (confirm(`确认要物理删除 ${path.split(/[\\/]/).pop()} 吗？`)) {
    try {
      await invoke('delete_item', { path })
      // 局部刷新逻辑：如果删除的是当前打开的 Tab，则关闭它
      if (activeTabId.value === path) store.removeTab(path)
      await refreshLibrary()
      message.success('已删除')
    } catch (e) { message.error('删除失败') }
  }
}

const nodeProps = ({ option }: { option: TreeOption }) => ({
  onContextmenu: (e: MouseEvent) => {
    e.preventDefault(); contextMenu.show = false
    setTimeout(() => {
      contextMenu.x = e.clientX; contextMenu.y = e.clientY; contextMenu.targetPath = option.key as string; contextMenu.isDir = !option.isLeaf
      const items = [
        { label: '重命名 (F2)', key: 'rename', icon: () => h(NIcon, null, { default: () => h(EditIcon) }) },
        { label: '物理删除 (Del)', key: 'delete', icon: () => h(NIcon, { color: '#f5222d' }, { default: () => h(TrashIcon) }) },
      ]
      if (contextMenu.isDir) {
        items.unshift(
          { label: '新建子笔记', key: 'add-file', icon: () => h(NIcon, null, { default: () => h(PlusIcon) }) },
          { label: '新建子文件夹', key: 'add-folder', icon: () => h(NIcon, null, { default: () => h(FolderPlusIcon) }) }
        )
      }
      contextMenu.options = items; contextMenu.show = true
    }, 50)
  }
})

const onMenuAction = async (key: string) => {
  contextMenu.show = false
  const path = contextMenu.targetPath
  if (key === 'rename') { renameState.oldPath = path; renameState.newName = path.split(/[\\/]/).pop() || ''; renameState.show = true }
  else if (key === 'delete') { await deleteAction(path) }
  else if (key === 'add-file') {
    const p = await invoke<string>('create_new_file', { libraryRoot: store.libraryPath, targetDir: path })
    if (!expandedKeys.value.includes(path)) expandedKeys.value.push(path)
    await refreshLibrary(); handleNodeSelect([p])
  } else if (key === 'add-folder') {
    await invoke('create_new_folder', { parentPath: path })
    if (!expandedKeys.value.includes(path)) expandedKeys.value.push(path)
    await refreshLibrary()
  }
}

const handleToolbarAction = async (type: 'file' | 'folder') => {
  if (!store.libraryPath) { openSettings(); return }
  let target = store.libraryPath
  if (selectedKeys.value.length > 0) {
    const sel = selectedKeys.value[0]
    if (!sel.endsWith('.md')) target = sel
    else target = sel.substring(0, sel.lastIndexOf('\\'))
  }
  try {
    if (type === 'file') {
      const p = await invoke<string>('create_new_file', { libraryRoot: store.libraryPath, targetDir: target })
      await refreshLibrary(); handleNodeSelect([p])
    } else {
      await invoke('create_new_folder', { parentPath: target })
      await refreshLibrary()
    }
  } catch (e) { message.error('操作失败') }
}

const applyRename = async () => {
  try {
    await invoke('rename_item', { oldPath: renameState.oldPath, newName: renameState.newName })
    await refreshLibrary(); renameState.show = false; message.success('修改成功')
  } catch (e) { message.error('重命名失败') }
}

const closeTab = (id: string) => store.removeTab(id)

const saveCurrentFile = async () => {
  if (!vditor || !activeTabId.value) return
  const t = tabs.value.find(item => item.id === activeTabId.value)
  if (t) {
    try {
      const content = vditor.getValue()
      await invoke('write_markdown_file', { path: t.path, content })
      message.success('已保存')
    } catch (e) { message.error('保存失败') }
  }
}

const initVditor = () => {
  const container = document.getElementById('vditor-lib')
  if (!container) return
  editorLoading.value = true
  vditor = new Vditor('vditor-lib', {
    cdn: '/vditor',
    lang: 'zh_CN',
    height: 'calc(100% - 2px)',
    mode: 'wysiwyg',
    cache: { enable: false },
    theme: store.theme === 'dark' ? 'dark' : 'classic',
    preview: { theme: { current: store.theme === 'dark' ? 'dark' : 'light' }, hljs: { enable: true } },
    toolbarConfig: { hide: false },
    customWysiwygToolbar: () => {}, 
    input: (val) => {
      const cur = tabs.value.find(t => t.id === activeTabId.value)
      if (cur) invoke('save_shadow_copy', { path: cur.path, content: val })
    },
    after: () => {
      isVditorReady = true
      editorLoading.value = false
      if (activeTabId.value) {
        const t = tabs.value.find(item => item.id === activeTabId.value)
        if (t) loadFileToEditor(t.path)
      }
    }
  })
}

watch(activeTabId, (newId) => { if (newId) { const t = tabs.value.find(item => item.id === newId); if (t) loadFileToEditor(t.path) } })

onMounted(async () => {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && selectedKeys.value.length > 0) {
      const p = selectedKeys.value[0]; renameState.oldPath = p; renameState.newName = p.split(/[\\/]/).pop() || ''; renameState.show = true
    }
    if (e.key === 'Delete' && selectedKeys.value.length > 0) {
      deleteAction(selectedKeys.value[0])
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentFile() }
  })
  await refreshLibrary()
  initVditor()
})
</script>

<style scoped>
/* 基础容器 */
.library-mode { 
  display: flex; 
  height: 100%; 
  width: 100vw; 
  overflow: hidden; 
  background: transparent; 
  user-select: none; 
  box-sizing: border-box; 
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 侧边栏样式 */
.sidebar { 
  height: 100%; 
  background: rgba(255, 255, 255, 0.4); 
  backdrop-filter: saturate(180%) blur(40px); 
  border-right: 1px solid rgba(0, 0, 0, 0.05); 
  display: flex; 
  flex-direction: column; 
  overflow: hidden; 
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease; 
  z-index: 20;
}
.is-dark .sidebar {
  background: rgba(28, 28, 30, 0.5);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-inner { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { padding: 24px 16px 12px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; }

.tree-viewport { flex: 1; overflow-y: auto; padding: 4px 12px; }

/* 左下角卡片设计 */
.sidebar-footer { 
  margin: 12px;
  padding: 12px; 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  background: rgba(255, 255, 255, 0.5); 
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
  cursor: pointer;
}
.sidebar-footer:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}
.is-dark .sidebar-footer { 
  background: rgba(255, 255, 255, 0.05); 
  border-color: rgba(255, 255, 255, 0.05); 
}

.settings-trigger { 
  color: #007aff; 
  transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
}
.sidebar-footer:hover .settings-trigger { transform: rotate(90deg); }

.lib-meta { display: flex; flex-direction: column; min-width: 0; }
.meta-title { font-size: 10px; opacity: 0.5; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.meta-path { font-size: 13px; font-weight: 600; color: #1d1d1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-dark .meta-path { color: #f5f5f7; }

/* 增强的分隔条与折叠按钮 */
.resizer-area { 
  position: relative; 
  width: 1px; 
  height: 100%; 
  z-index: 100; 
  background: rgba(0, 0, 0, 0.03); 
  transition: background 0.3s;
}
.resizer-area:hover, .library-mode.is-dragging .resizer-area { 
  background: #007aff; 
  box-shadow: 0 0 10px rgba(0, 122, 255, 0.3);
}

.drag-handle { position: absolute; top: 0; left: -8px; right: -8px; bottom: 0; z-index: 101; cursor: col-resize; }

.collapse-btn { 
  position: absolute; 
  top: 50%; 
  transform: translateY(-50%); 
  width: 24px; 
  height: 48px; 
  background: #fff; 
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex; 
  align-items: center; 
  justify-content: center; 
  cursor: pointer; 
  z-index: 150; 
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.is-dark .collapse-btn { background: #2c2c2e; border-color: rgba(255, 255, 255, 0.1); }

.collapse-btn.left { left: 0px; border-radius: 0 12px 12px 0; }
.collapse-btn.right { right: 0px; border-radius: 12px 0 0 12px; }
.collapse-btn:hover { background: #007aff; color: #fff; transform: translateY(-50%) scale(1.1); }

/* 编辑主区域 - 扩大化 */
.editor-main { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  min-width: 0; 
  height: 100%; 
  background: transparent; 
  padding: 0px 4px 4px; /* 极简边距 */
  box-sizing: border-box;
}
.zen-mode { padding: 0 15% 0px; }

/* 胶囊标签页美化 */
.tab-scroller { 
  height: 40px; 
  display: flex; 
  padding: 8px 12px 0; 
  gap: 8px; 
  align-items: center; 
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-scroller::-webkit-scrollbar { display: none; }

.tab-pill { 
  height: 30px; 
  padding: 0 14px; 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  font-size: 13px; 
  font-weight: 500;
  cursor: pointer; 
  background: rgba(0, 0, 0, 0.03); 
  border-radius: 15px; 
  border: 1px solid transparent; 
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); 
  color: #86868b;
  white-space: nowrap;
}
.is-dark .tab-pill { background: rgba(255, 255, 255, 0.05); color: #8e8e93; }

.tab-pill.active { 
  background: #fff; 
  color: #007aff; 
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); 
  transform: translateY(-2px);
}
.is-dark .tab-pill.active { background: #2c2c2e; color: #0a84ff; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }

/* 编辑器视口 - 撑满屏幕 */
.editor-viewport { 
  flex: 1; 
  position: relative; 
  background: #fff;
  border-radius: 12px 12px 0 0; /* 底部撑满 */
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
  margin-top: 8px;
  overflow: hidden; 
  display: flex; 
  flex-direction: column; 
}
.is-dark .editor-viewport { background: #1c1c1e; box-shadow: 0 10px 60px rgba(0, 0, 0, 0.5); }

/* Vditor 深度全屏化 */
:deep(.vditor) { 
  border: none !important; 
  background: transparent !important; 
  height: 100% !important;
}
:deep(.vditor-toolbar) { 
  background: rgba(255, 255, 255, 0.8) !important; 
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.03) !important; 
  padding: 8px 16px !important;
}
.is-dark :deep(.vditor-toolbar) { background: rgba(28, 28, 30, 0.8) !important; }

:deep(.vditor-wysiwyg) {
  padding: 60px 80px !important;
  transition: opacity 0.4s ease;
}

/* 动效：树节点入场 */
:deep(.n-tree-node) {
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 按钮点击动效 */
.n-button { transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important; }
.n-button:active { transform: scale(0.92); }

.inspector-sidebar { 
  height: 100%; 
  background: rgba(255, 255, 255, 0.4); 
  backdrop-filter: saturate(180%) blur(40px); 
  border-left: 1px solid rgba(0, 0, 0, 0.05); 
  overflow: hidden; 
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease; 
}
.is-dark .inspector-sidebar { background: rgba(28, 28, 30, 0.5); }
</style>
