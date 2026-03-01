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
.library-mode { display: flex; height: 100%; width: 100vw; overflow: hidden; background: transparent; user-select: none; box-sizing: border-box; }
.library-mode.is-dragging .editor-viewport { pointer-events: none; }

.sidebar { height: 100%; background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(30px); border-right: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; overflow: hidden; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s; }
.library-mode.is-dragging .sidebar, .library-mode.is-dragging .inspector-sidebar, .library-mode.is-dragging .resizer-area { transition: none !important; }

.sidebar-inner { width: 100%; height: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.sidebar-header { padding: 16px 12px 10px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }
.toolbar-area { display: flex; gap: 6px; padding: 0 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 10px; }
.tree-viewport { flex: 1; overflow-y: auto; padding: 4px 8px; }
.path-guide { padding: 40px 20px; text-align: center; opacity: 0.6; }
.sidebar-footer { height: 60px; padding: 0 16px; display: flex; align-items: center; gap: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); flex-shrink: 0; }
.settings-trigger { color: #667eea; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.settings-trigger:hover { transform: rotate(60deg); color: #764ba2; }
.lib-meta { display: flex; flex-direction: column; min-width: 0; }
.meta-title { font-size: 9px; opacity: 0.4; text-transform: uppercase; letter-spacing: 1px; }
.meta-path { font-size: 12px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }

.resizer-area { position: relative; width: 4px; height: 100%; z-index: 100; transition: background 0.2s, box-shadow 0.2s; background: rgba(0, 0, 0, 0.05); }
.is-dark .resizer-area { background: rgba(255, 255, 255, 0.05); }
.resizer-area:hover, .library-mode.is-dragging .resizer-area { background: #667eea; box-shadow: 0 0 10px rgba(102, 126, 234, 0.5); }
.drag-handle { position: absolute; top: 0; left: -4px; width: 12px; height: 100%; cursor: col-resize; z-index: 101; }
.resizer-area::after { content: "⋮"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(0, 0, 0, 0.2); font-size: 16px; font-weight: bold; pointer-events: none; transition: color 0.2s; }
.is-dark .resizer-area::after { color: rgba(255, 255, 255, 0.2); }
.resizer-area:hover::after { color: white; }

.collapse-btn { position: absolute; top: calc(50% + 40px); transform: translateY(-50%); width: 20px; height: 40px; background: #667eea; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 6px; font-size: 14px; z-index: 102; transition: all 0.2s; opacity: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.resizer-area:hover .collapse-btn { opacity: 1; }
.collapse-btn.left { left: 6px; border-top-left-radius: 0; border-bottom-left-radius: 0; }
.collapse-btn.right { right: 6px; border-top-right-radius: 0; border-bottom-right-radius: 0; }
.collapse-btn:hover { background: #764ba2; width: 24px; }

.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; background: transparent; }
.zen-mode { padding: 0 15%; }
.tab-scroller { height: 36px; display: flex; background: rgba(0, 0, 0, 0.05); border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 0 8px; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.tab-pill { height: 30px; padding: 0 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; background: rgba(255, 255, 255, 0.03); border-radius: 6px 6px 0 0; border: 1px solid rgba(255, 255, 255, 0.05); border-bottom: none; transition: all 0.2s; min-width: 100px; max-width: 200px; }
.tab-pill.active { background: rgba(255, 255, 255, 0.1); color: #fff; border-color: rgba(255, 255, 255, 0.1); }
.pill-close { font-size: 12px; opacity: 0.3; }
.pill-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
.tab-actions { margin-left: auto; display: flex; align-items: center; height: 100%; padding-bottom: 4px; }

.editor-viewport { flex: 1; position: relative; height: calc(100% - 36px); overflow: hidden; display: flex; flex-direction: column; }
.editor-loading { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); z-index: 10; }
.hero-viewport { height: 100%; display: flex; align-items: center; justify-content: center; }
.hero-brand { font-size: 80px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; line-height: 1; text-align: center; }
.hero-content { text-align: center; }
.hero-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }

.inspector-sidebar { height: 100%; background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border-left: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s; flex-shrink: 0; }
.outline-box { padding: 16px; }

:deep(.n-tree-node-content) { padding: 6px 0 !important; }
:deep(.n-tree-node--selected .n-tree-node-content__text) { color: #667eea; font-weight: bold; }
:deep(.vditor) { border: none !important; background: transparent !important; flex: 1; }
:deep(.vditor-toolbar) { background: rgba(255, 255, 255, 0.02) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important; }
</style>
