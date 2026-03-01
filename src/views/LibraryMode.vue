<template>
  <div class="library-mode" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- 左侧侧边栏 -->
    <div class="sidebar" :style="{ width: sidebarWidth + 'px' }" v-if="!store.isZen">
      <div class="sidebar-inner">
        <!-- 头部工具栏 -->
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

        <!-- 目录树 -->
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
            expand-onclick 
            :data="treeData" 
            :on-update:selected-keys="handleNodeSelect" 
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

        <!-- 底部设置按钮 -->
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

    <!-- 侧边栏调整缝 -->
    <div class="drag-handle" :class="{ dragging: activeResizer === 'sidebar' }" @mousedown="startResizing('sidebar')"></div>

    <!-- 中间编辑器区域 -->
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
      </div>
      <div class="editor-viewport">
        <div v-show="tabs.length > 0" id="vditor-lib" class="vditor-instance"></div>
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

    <!-- 右侧调整缝 -->
    <div class="drag-handle" v-if="!store.isZen && tabs.length > 0" :class="{ dragging: activeResizer === 'inspector' }" @mousedown="startResizing('inspector')"></div>

    <!-- 右侧属性栏 -->
    <div class="inspector-sidebar" :style="{ width: inspectorWidth + 'px' }" v-if="!store.isZen && showInspector && tabs.length > 0">
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
    
    <!-- 右键菜单 -->
    <n-dropdown
      placement="bottom-start" trigger="manual" :x="contextMenu.x" :y="contextMenu.y"
      :options="contextMenu.options" :show="contextMenu.show"
      :on-clickoutside="() => contextMenu.show = false" @select="onMenuAction"
    />

    <!-- 重命名模态框 -->
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
  Edit as EditIcon
} from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore } from '../store/app'
import { storeToRefs } from 'pinia'
import HoverPreview from '../components/HoverPreview.vue'
import { useRouter } from 'vue-router'

interface FileEntry { name: string; path: string; is_dir: boolean; }
const message = useMessage(); const store = useAppStore(); const { tabs, activeTabId } = storeToRefs(store)
const router = useRouter()

const libraryName = computed(() => store.libraryPath ? store.libraryPath.split(/[\\/]/).pop() : '')
const treeData = ref<TreeOption[]>([]); const searchQuery = ref(''); const showInspector = ref(true)
let vditor: Vditor | null = null
const preview = reactive({ show: false, title: '', path: '', x: 0, y: 0 })
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])

// 布局动态调整
const sidebarWidth = ref(260); const inspectorWidth = ref(280); const activeResizer = ref<'sidebar' | 'inspector' | null>(null)
const startResizing = (type: 'sidebar' | 'inspector') => activeResizer.value = type
const onMouseUp = () => activeResizer.value = null
const onMouseMove = (e: MouseEvent) => {
  if (activeResizer.value === 'sidebar') sidebarWidth.value = Math.max(180, Math.min(e.clientX, 500))
  if (activeResizer.value === 'inspector') inspectorWidth.value = Math.max(200, Math.min(window.innerWidth - e.clientX, 500))
}

const openSettings = () => router.push('/settings')

// 右键菜单逻辑
const contextMenu = reactive({ show: false, x: 0, y: 0, targetPath: '', isDir: false, options: [] as any[] })
const renameState = reactive({ show: false, oldPath: '', newName: '' })

const loadDirectory = async (path: string): Promise<TreeOption[]> => {
  if (!path) return []
  try {
    const entries = await invoke<FileEntry[]>('scan_directory', { path })
    return entries.map(entry => ({
      label: entry.name, key: entry.path, isLeaf: !entry.is_dir,
      prefix: () => h(entry.is_dir ? FolderIcon : FileIcon, { size: 14, style: 'opacity: 0.6' }),
      children: entry.is_dir ? [] : undefined
    }))
  } catch (err) { return [] }
}

const refreshLibrary = async () => { if (store.libraryPath) treeData.value = await loadDirectory(store.libraryPath) }

const handleNodeSelect = (keys: string[]) => {
  selectedKeys.value = keys
  const path = keys[0]; if (!path || !path.endsWith('.md')) return
  store.addTab({ id: path, title: path.split(/[\\/]/).pop() || '笔记', path, isDirty: false })
}

const handleAllowDrop = () => true

const handleDrop = async (info: any) => {
  const sourcePath = info.dragNode.key as string
  let targetDir = info.node.key as string
  // 逻辑：如果落在文件夹内部(dropPosition 0)，直接移动。如果落在上方/下方，取目标项所在目录。
  if (info.dropPosition !== 0 || info.node.isLeaf) {
    targetDir = targetDir.substring(0, targetDir.lastIndexOf('\\'))
  }
  
  try {
    // 强制使用 Rust 函数中的参数名以避免映射失败
    await invoke('move_item', { source_path: sourcePath, target_dir: targetDir })
    await refreshLibrary(); message.success('移动成功')
  } catch (err) { message.error('无法移动到该位置') }
}

const handleLoadChildren = async (option: TreeOption) => {
  option.children = await loadDirectory(option.key as string)
}

const nodeProps = ({ option }: { option: TreeOption }) => ({
  onContextmenu: (e: MouseEvent) => {
    e.preventDefault(); contextMenu.show = false
    setTimeout(() => {
      contextMenu.x = e.clientX; contextMenu.y = e.clientY; contextMenu.targetPath = option.key as string; contextMenu.isDir = !option.isLeaf
      const items = [
        { label: '重命名 (F2)', key: 'rename', icon: () => h(NIcon, null, { default: () => h(EditIcon) }) },
        { label: '物理删除', key: 'delete', icon: () => h(NIcon, { color: '#f5222d' }, { default: () => h(TrashIcon) }) },
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
  else if (key === 'delete') {
    if (confirm('确认物理删除此文件/文件夹吗？操作不可撤销。')) {
      await invoke('delete_item', { path }); await refreshLibrary()
    }
  } else if (key === 'add-file') {
    // 强制使用 Rust 中的参数名
    const p = await invoke<string>('create_new_file', { library_root: store.libraryPath, target_dir: path })
    if (!expandedKeys.value.includes(path)) expandedKeys.value.push(path)
    await refreshLibrary(); handleNodeSelect([p])
  } else if (key === 'add-folder') {
    await invoke('create_new_folder', { parent_path: path }); 
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
      const p = await invoke<string>('create_new_file', { library_root: store.libraryPath, target_dir: target })
      if (target !== store.libraryPath && !expandedKeys.value.includes(target)) expandedKeys.value.push(target)
      await refreshLibrary(); handleNodeSelect([p])
    } else {
      await invoke('create_new_folder', { parent_path: target }); 
      if (target !== store.libraryPath && !expandedKeys.value.includes(target)) expandedKeys.value.push(target)
      await refreshLibrary()
    }
  } catch (e) { message.error('操作失败') }
}

const applyRename = async () => {
  try {
    await invoke('rename_item', { old_path: renameState.oldPath, new_name: renameState.newName })
    await refreshLibrary(); renameState.show = false; message.success('修改成功')
  } catch (e) { message.error('重命名失败') }
}

const closeTab = (id: string) => store.removeTab(id)

const initVditor = () => {
  vditor = new Vditor('vditor-lib', {
    cdn: 'https://cdn.jsdelivr.net/npm/vditor', height: 'calc(100% - 2px)', mode: 'wysiwyg',
    outline: { enable: true, position: 'right' }, cache: { enable: false },
    input: (val) => { 
      const cur = tabs.value.find(t => t.id === activeTabId.value)
      if (cur) invoke('save_shadow_copy', { path: cur.path, content: val })
    },
    after: () => {
      const el = document.querySelector('#vditor-lib .vditor-wysiwyg') as HTMLElement
      if (el) {
        el.addEventListener('mousemove', (e: MouseEvent) => {
          const target = e.target as HTMLElement
          if (target.innerText.startsWith('[[') && target.innerText.endsWith(']]')) {
            const name = target.innerText.slice(2, -2)
            preview.title = name; preview.path = `${store.libraryPath}\\${name}.md`; preview.x = e.clientX; preview.y = e.clientY; preview.show = true
          } else { preview.show = false }
        })
      }
    }
  })
}

watch(activeTabId, async (id) => {
  if (!id || !vditor) return
  const t = tabs.value.find(item => item.id === id)
  if (t) {
    const res = await invoke<{content: string}>('read_markdown_file', { path: t.path })
    vditor.setValue(res.content)
  }
})

watch(() => store.libraryPath, () => refreshLibrary())
onMounted(async () => {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && selectedKeys.value.length > 0) {
      const p = selectedKeys.value[0]; renameState.oldPath = p; renameState.newName = p.split(/[\\/]/).pop() || ''; renameState.show = true
    }
  })
  await refreshLibrary(); initVditor()
})
</script>

<style scoped>
.library-mode { display: flex; height: 100%; width: 100vw; overflow: hidden; background: transparent; user-select: none; box-sizing: border-box; }

/* 侧边栏布局 */
.sidebar { height: 100%; background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(30px); border-right: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-inner { height: 100%; display: flex; flex-direction: column; position: relative; }

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

/* 调整中缝 */
.drag-handle { width: 4px; cursor: col-resize; background: transparent; transition: background 0.2s; z-index: 100; position: relative; }
.drag-handle:hover, .drag-handle.dragging { background: #667eea; }

/* 主编辑区 */
.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; background: transparent; }
.zen-mode { padding: 0 15%; }

.tabs-bar { height: 36px; display: flex; background: rgba(0, 0, 0, 0.05); border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 0 8px; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.tab-pill { height: 30px; padding: 0 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; background: rgba(255, 255, 255, 0.03); border-radius: 6px 6px 0 0; border: 1px solid rgba(255, 255, 255, 0.05); border-bottom: none; transition: all 0.2s; min-width: 100px; max-width: 200px; }
.tab-pill.active { background: rgba(255, 255, 255, 0.1); color: #fff; border-color: rgba(255, 255, 255, 0.1); }
.pill-close { font-size: 12px; opacity: 0.3; }
.pill-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); border-radius: 4px; }

.editor-viewport { flex: 1; position: relative; height: calc(100% - 36px); overflow: hidden; }
.hero-viewport { height: 100%; display: flex; align-items: center; justify-content: center; }
.hero-brand { font-size: 80px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; line-height: 1; text-align: center; }
.hero-content { text-align: center; }
.hero-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }

/* 右侧属性栏 */
.inspector-sidebar { height: 100%; background: rgba(0, 0, 0, 0.02); border-left: 1px solid rgba(255, 255, 255, 0.05); overflow-y: auto; flex-shrink: 0; }
.outline-box { padding: 16px; }

:deep(.n-tree-node-content) { padding: 6px 0 !important; }
:deep(.n-tree-node--selected .n-tree-node-content__text) { color: #667eea; font-weight: bold; }
</style>
