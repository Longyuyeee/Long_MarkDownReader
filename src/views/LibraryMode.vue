<template>
  <div class="library-mode" :class="{ 'is-dragging': !!activeResizer }" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- 统一左侧侧边栏 -->
    <div class="sidebar" :style="{ width: isSidebarCollapsed ? '0px' : sidebarWidth + 'px', opacity: isSidebarCollapsed ? 0 : 1 }" v-if="!store.isZen">
      <div class="sidebar-inner">
        <!-- 侧边栏顶部切换 -->
        <div class="sidebar-tabs-header">
          <n-tabs v-model:value="activeSidebarTab" type="segment" size="small" animated class="custom-sidebar-tabs">
            <n-tab name="files">
              <div class="tab-label-inner"><n-icon :component="FileIcon" /><span>文件</span></div>
            </n-tab>
            <n-tab name="outline">
              <div class="tab-label-inner"><n-icon :component="ListIcon" /><span>目录</span></div>
            </n-tab>
            <n-tab name="history">
              <div class="tab-label-inner"><n-icon :component="ClockIcon" /><span>历史</span></div>
            </n-tab>
          </n-tabs>
        </div>

        <div class="sidebar-tab-content">
          <transition name="tab-fade" mode="out-in">
            <!-- 文件 tree 面板 -->
            <div v-if="activeSidebarTab === 'files'" :key="'files'" class="tab-pane files-pane">
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
                  ref="treeInstRef"
                  :data="treeData" 
                  lazy
                  multiple
                  block-line
                  expand-on-click
                  :on-load="handleLoadChildren"
                  :node-props="nodeProps"
                  :selected-keys="selectedKeys"
                  v-model:expanded-keys="expandedKeys"
                  @update:selected-keys="handleNodeSelect"
                />
              </div>
            </div>

            <!-- 大纲面板 -->
            <div v-else-if="activeSidebarTab === 'outline'" :key="'outline'" class="tab-pane outline-pane">
              <div class="manual-outline-box">
                <div v-if="!activeTabId" class="empty-state-hint">
                  <n-empty description="未打开文件" size="small" />
                </div>
                <div v-else-if="outlineTreeData.length === 0" class="empty-state-hint">
                  <n-empty description="暂无大纲" size="small" />
                </div>
                <div v-else class="outline-tree-wrapper">
                  <n-tree
                    block-line
                    expand-on-click
                    :data="outlineTreeData"
                    :on-update:selected-keys="handleOutlineSelect"
                    class="compact-outline-tree"
                    default-expand-all
                  />
                </div>
              </div>
            </div>

            <!-- 历史面板 -->
            <div v-else-if="activeSidebarTab === 'history'" :key="'history'" class="tab-pane history-pane">
              <div class="history-box">
                <div class="history-header">
                  <div class="history-title-row">
                    <n-icon :component="ClockIcon" class="title-icon" />
                    <span>影子副本 ({{ historyList.length }})</span>
                  </div>
                  <n-button quaternary circle size="tiny" @click="clearAllHistory" title="清空全部缓存" class="clear-all-btn">
                    <template #icon><n-icon :component="TrashIcon" /></template>
                  </n-button>
                </div>
                
                <div v-if="!activeTabId" class="empty-state-hint">
                  <n-empty description="未打开文件" size="small" />
                </div>
                <div v-else-if="historyList.length === 0" class="empty-state-hint">
                  <n-empty description="暂无历史快照" size="small" />
                </div>
                
                <div v-else class="history-bubbles-wrapper">
                  <div v-for="h in historyList" :key="h.timestamp" class="history-bubble" @click="restoreHistory(h.content)">
                    <div class="bubble-accent-line"></div>
                    <div class="bubble-content">
                      <div class="bubble-top">
                        <div class="time-box">
                          <span class="bubble-time">{{ formatTime(h.timestamp) }}</span>
                        </div>
                        <div class="bubble-meta">{{ h.content.length }} 字</div>
                      </div>
                      <div class="bubble-preview">{{ h.content.slice(0, 45).replace(/[\n#*`]/g, ' ') }}...</div>
                    </div>
                    <div class="bubble-actions">
                      <n-button quaternary circle size="tiny" class="delete-trigger" @click.stop="deleteHistory(h.timestamp)">
                        <template #icon><n-icon :component="CloseIcon" /></template>
                      </n-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- 侧边栏页脚 -->
        <div class="sidebar-footer-container">
          <div class="sidebar-footer" @click="openSettings">
            <div class="settings-icon-box">
              <n-icon :component="SettingsIcon" class="rotating-settings" />
            </div>
            <div class="lib-info-box">
              <div class="lib-name-row">
                <span class="lib-label">Active Library</span>
                <div class="lib-status-dot"></div>
              </div>
              <span class="meta-path" :title="store.libraryPath">{{ store.currentLibraryName }}</span>
            </div>
            <div class="footer-chevron">
              <n-icon :component="ChevronRightIcon" />
            </div>
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
          <transition-group name="tab-list">
            <div 
              v-for="tab in tabs" 
              :key="tab.id" 
              class="tab-pill" 
              :class="{ active: activeTabId === tab.id }" 
              @click="store.addTab(tab)"
              :ref="(el) => { if (activeTabId === tab.id) activeTabRef = el as HTMLElement }"
            >
              <n-icon :component="FileIcon" class="pill-icon" />
              <span class="pill-text">{{ tab.title }}</span>
              <n-icon :component="CloseIcon" class="pill-close" @click.stop="closeTab(tab.id)" />
            </div>
          </transition-group>
        </div>
        <div class="tab-actions">
          <div class="action-btn-group">
            <n-button quaternary circle size="small" @click="refreshCurrentFile" :disabled="!activeTabId" title="从磁盘同步内容">
              <template #icon><n-icon :component="RefreshIcon" /></template>
            </n-button>
            <n-button quaternary circle size="small" @click="saveCurrentFile" :disabled="!activeTabId" title="保存到磁盘 (Ctrl+S)">
              <template #icon><n-icon :component="SaveIcon" /></template>
            </n-button>
          </div>
          <div class="word-count-info" v-if="activeTabId">
            {{ wordCount }} 字
          </div>
          <div class="hidden-picker-trigger" style="position: absolute; opacity: 0; pointer-events: none;">
            <n-color-picker 
              v-model:value="store.editorBgColor" 
              :modes="['hex']" 
              @update:value="handleEditorBgChange"
            />
          </div>
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
          <div class="ambient-glow">
            <div class="blob blob-1"></div>
            <div class="blob blob-2"></div>
          </div>
          
          <div class="hero-content">
            <div class="hero-brand">
              <n-icon :component="getHeroIcon(store.heroIcon)" />
            </div>
            <h2 class="hero-title">Long编辑 · MD助手</h2>
            <p class="hero-subtitle">选择一个文档或直接将文件拖拽至此</p>
            <div class="hero-actions">
              <n-button secondary type="primary" round size="large" class="hero-btn" @click="handleToolbarAction('file')">创建新笔记</n-button>
              <n-button secondary round size="large" class="hero-btn" @click="openSettings">文件库配置</n-button>
            </div>
          </div>
        </div>
      </div>
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
import { onMounted, ref, watch, reactive, h, onUnmounted, nextTick, computed } from 'vue'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { useMessage, TreeOption, NIcon, NDropdown } from 'naive-ui'
import { 
  Search as SearchIcon, Settings as SettingsIcon, X as CloseIcon, 
  RefreshCw as RefreshIcon, FileText as FileIcon, Folder as FolderIcon,
  Plus as PlusIcon, FolderPlus as FolderPlusIcon, Trash as TrashIcon,
  Edit as EditIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  Save as SaveIcon, BookOpen as BookOpenIcon, List as ListIcon, History as ClockIcon
} from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore } from '../store/app'
import { storeToRefs } from 'pinia'
import HoverPreview from '../components/HoverPreview.vue'
import { useRouter } from 'vue-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'

interface FileEntry { name: string; path: string; is_dir: boolean; }
interface OutlineItem { id: string; text: string; level: number; }

const message = useMessage()
const store = useAppStore()
const { tabs, activeTabId } = storeToRefs(store)
const router = useRouter()

const activeSidebarTab = ref<'files' | 'outline' | 'history'>('files')
const editorLoading = ref(false)
const wordCount = ref(0)
const isSidebarCollapsed = ref(false)
const sidebarWidth = ref(260)
const activeResizer = ref<'sidebar' | null>(null)
const tabsScrollRef = ref<HTMLElement | null>(null)
const activeTabRef = ref<HTMLElement | null>(null)
const treeInstRef = ref<any>(null)

const scrollActiveTabIntoView = () => {
  if (!activeTabRef.value || !tabsScrollRef.value) return
  const container = tabsScrollRef.value
  const tab = activeTabRef.value
  
  const containerRect = container.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  
  // 只有当标签不在可视区域内时才滚动
  if (tabRect.left < containerRect.left) {
    container.scrollTo({ left: container.scrollLeft - (containerRect.left - tabRect.left) - 20, behavior: 'smooth' })
  } else if (tabRect.right > containerRect.right) {
    container.scrollTo({ left: container.scrollLeft + (tabRect.right - containerRect.right) + 20, behavior: 'smooth' })
  }
}

watch(activeTabId, () => {
  nextTick(() => { setTimeout(() => { scrollActiveTabIntoView() }, 50) })
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

const updateWordCount = () => {
  if (vditor && isVditorReady) {
    const val = vditor.getValue()
    wordCount.value = val.length
  }
}

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

const handleOutlineSelect = (keys: string[]) => { if (keys.length > 0) scrollToHeading(keys[0] as string) }
const preview = reactive({ show: false, title: '', path: '', x: 0, y: 0, timer: null as any })
const contextMenu = reactive({ show: false, x: 0, y: 0, targetPath: '', isDir: false, options: [] as any[] })
const renameState = reactive({ show: false, oldPath: '', newName: '' })
const historyList = ref<{timestamp: number, content: string}[]>([])

const openSettings = () => router.push('/settings')
const getHeroIcon = (iconName: string) => {
  switch (iconName) {
    case 'BookOpen': return BookOpenIcon
    case 'FileText': return FileIcon
    case 'Folder': return FolderIcon
    case 'Settings': return SettingsIcon
    default: return BookOpenIcon
  }
}

const fetchHistory = async () => {
  if (!activeTabId.value) return
  try {
    const res = await invoke<[number, string][]>('list_history', { path: activeTabId.value })
    historyList.value = res.map(([timestamp, content]) => ({ timestamp, content }))
  } catch (e) { console.error('Failed to fetch history', e) }
}

const restoreHistory = (content: string) => { if (!vditor || !isVditorReady) return; vditor.setValue(content); message.success('已恢复到该历史版本') }
const deleteHistory = async (timestamp: number) => {
  if (!activeTabId.value) return
  try { await invoke('delete_history_version', { path: activeTabId.value, timestamp }); await fetchHistory(); message.success('已移除该备份') }
  catch (e) { message.error('删除失败') }
}
const clearAllHistory = async () => {
  if (!confirm('确定要清除所有文件的历史备份吗？')) return
  try { await invoke('clear_all_history'); historyList.value = []; message.success('历史缓存已全部清空') }
  catch (e) { message.error('清空失败') }
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
        if (activeSidebarTab.value === 'history') fetchHistory()
      }
    }
  }, interval)
}

const startResizing = (type: 'sidebar') => { activeResizer.value = type }
const scrollToHeading = (id: string) => {
  if (!vditor) return
  const targetEl = vditor.vditor.wysiwyg.element.querySelector(`[data-id="${id}"]`) || vditor.vditor.wysiwyg.element.querySelector(`#${id}`)
  if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const syncOutlineManual = () => {
  if (!vditor || !isVditorReady) return
  const contentEl = vditor.vditor.wysiwyg?.element; if (!contentEl) return
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
  const contentEl = vditor.vditor.wysiwyg?.element; if (!contentEl) return
  outlineObserver = new MutationObserver(() => syncOutlineManual())
  outlineObserver.observe(contentEl, { childList: true, subtree: true, characterData: true })
}

const handleNodeSelect = (keys: string[]) => {
  if (keys.length === 0) return
  const lastKey = keys[keys.length - 1]
  if (lastKey && lastKey.endsWith('.md')) { 
    const title = lastKey.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '笔记'
    store.addTab({ id: lastKey, title, path: lastKey, isDirty: false }) 
  }
}

const handleLoadChildren = async (option: TreeOption) => { option.children = await loadDirectory(option.key as string) }

const handleCodeThemeChange = async (val: string) => {
  store.codeTheme = val; await store.updateConfig({ codeTheme: val })
  if (vditor && isVditorReady) { const isDark = store.theme === 'dark'; vditor.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', val) }
}
const handleEditorBgChange = async (val: string) => { store.editorBgColor = val; await store.updateConfig({ editorBgColor: val }) }

const loadDirectory = async (path: string): Promise<TreeOption[]> => {
  if (!path) return []
  try {
    const entries = await invoke<FileEntry[]>('scan_directory', { path })
    return entries.map(entry => ({ label: entry.is_dir ? entry.name : entry.name.replace(/\.md$/, ''), key: entry.path, isLeaf: !entry.is_dir, prefix: () => h(entry.is_dir ? FolderIcon : FileIcon, { size: 14, style: 'opacity: 0.6' }) }))
  } catch (err) { return [] }
}

const refreshLibrary = async () => { if (store.libraryPath) treeData.value = await loadDirectory(store.libraryPath) }
const refreshNode = async (path: string) => {
  if (!path || !store.libraryPath) return
  const newEntries = await loadDirectory(path)
  const syncNodes = (oldNodes: TreeOption[], newNodes: TreeOption[]) => {
    const oldMap = new Map(oldNodes.map(n => [n.key, n]))
    return newNodes.map(newNode => { const matchedOld = oldMap.get(newNode.key as string); return matchedOld && matchedOld.children !== undefined ? { ...newNode, children: matchedOld.children } : newNode })
  }
  if (path === store.libraryPath) treeData.value = syncNodes(treeData.value, newEntries); else {
    const patch = (nodes: TreeOption[]): boolean => { 
      for (let i = 0; i < nodes.length; i++) { 
        if (nodes[i].key === path) { nodes[i].children = syncNodes(nodes[i].children || [], newEntries); return true } 
        const childNodes = nodes[i].children; if (childNodes && patch(childNodes)) return true 
      } 
      return false 
    }
    patch(treeData.value); treeData.value = [...treeData.value]
  }
}

const loadFileToEditor = async (path: string) => {
  if (!vditor || !path) return; lastLoadedPath = '' 
  const currentTab = tabs.value.find(t => t.path === path)
  
  // 核心优化：利用内存快照实现瞬时加载
  const setEditorValue = (content: string) => {
    // 路径预处理逻辑：在解析 Markdown 前通过正则修复相对路径图片，避免 DOM 扫描延迟
    const parentDir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1).replace(/\\/g, '/')
    
    // 匹配 Markdown 图片语法: ![alt](url)
    const fixedContent = content.replace(/(!\[.*?\]\()(.+?)(\))/g, (match, prefix, url, suffix) => {
      if (url.startsWith('http') || url.startsWith('misty-img:') || url.startsWith('data:')) return match
      const abs = url.startsWith('./') ? parentDir + url.substring(2) : (url.includes(':') ? url : parentDir + url)
      return `${prefix}misty-img://${abs.replace(/\\/g, '/')}${suffix}`
    })

    vditor.setValue(fixedContent)
    fetchHistory()
    nextTick(() => { 
      setTimeout(() => { 
        lastLoadedPath = path; 
        syncOutlineManual(); 
        initOutlineObserver();
        updateWordCount();
        fixEditorImages(); // 后台增强：通过 Base64 进一步提升图片清晰度/稳定性
      }, 50) 
    })
  }

  if (currentTab?.content) {
    setEditorValue(currentTab.content)
  } else {
    try {
      const res = await invoke<{content: string}>('read_markdown_file', { path })
      if (currentTab) currentTab.content = res.content
      setEditorValue(res.content)
    } catch (err) { message.error("读取失败") }
  }
}

const fixEditorImages = async () => {
  if (!vditor || !isVditorReady || !activeTabId.value) return
  const path = activeTabId.value
  const parentDir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const normalizedParent = parentDir.replace(/\\/g, '/')
  
  const contentEl = vditor.vditor.wysiwyg?.element
  if (!contentEl) return

  const imgs = contentEl.querySelectorAll('img')
  const tasks = Array.from(imgs).map(async (img: any) => {
    // 避免重复处理
    if (img.dataset.fixed === 'true') return
    
    const rawSrc = img.getAttribute('src')
    if (!rawSrc || rawSrc.startsWith('http') || rawSrc.startsWith('asset:') || rawSrc.startsWith('data:')) {
      img.dataset.fixed = 'true'
      return
    }

    let absolutePath = ''
    if (rawSrc.startsWith('./')) absolutePath = normalizedParent + rawSrc.substring(2)
    else if (!rawSrc.includes(':') && !rawSrc.startsWith('/')) absolutePath = normalizedParent + rawSrc
    else absolutePath = rawSrc

    try {
      const b64 = await invoke<string>('get_image_base64', { path: absolutePath.replace(/\\/g, '/') })
      if (img.src !== b64) img.src = b64
      img.dataset.fixed = 'true'
    } catch (e) {
      img.src = convertFileSrc(absolutePath.replace(/\\/g, '/'))
      img.dataset.fixed = 'true'
    }
  })
  await Promise.all(tasks)
}

const virtualDrag = reactive({ 
  active: false, x: 0, y: 0, startX: 0, startY: 0, 
  dragNode: null as any, dropTarget: null as any, 
  dropPosition: null as 'before' | 'inside' | 'after' | null,
  ghostText: '', timer: null as any, selectedPaths: [] as string[],
  expandTimer: null as any,
  scrollTimer: null as any
})

const updateDropTarget = (x: number, y: number) => {
  const elements = document.elementsFromPoint(x, y)
  let foundKey = null
  let isViewport = false
  let foundEl: HTMLElement | null = null

  for (const el of elements) {
    if (el.classList.contains('drag-ghost')) continue
    if (el.classList.contains('tree-viewport')) isViewport = true
    
    const node = el.closest('[data-drop-path]') as HTMLElement
    if (node) {
      foundEl = node
      foundKey = node.getAttribute('data-drop-path') as string
      break 
    }
  }

  if (foundKey && foundEl) {
    const rect = foundEl.getBoundingClientRect()
    const relativeY = (y - rect.top) / rect.height
    const isDir = foundEl.getAttribute('data-drop-dir') === 'true'

    // 探测感应区：25% Before, 50% Inside, 25% After
    if (relativeY < 0.25) {
      virtualDrag.dropPosition = 'before'
    } else if (relativeY > 0.75) {
      virtualDrag.dropPosition = 'after'
    } else {
      virtualDrag.dropPosition = 'inside'
    }

    // 文件夹自动展开逻辑优化：只有当目标 Key 变化或不再是 inside 时才重置计时器
    if (isDir && virtualDrag.dropPosition === 'inside') {
      if (virtualDrag.dropTarget !== foundKey) {
        if (virtualDrag.expandTimer) clearTimeout(virtualDrag.expandTimer)
        virtualDrag.expandTimer = setTimeout(() => {
          if (virtualDrag.dropTarget === foundKey && !expandedKeys.value.includes(foundKey!)) {
            expandedKeys.value.push(foundKey!)
            expandedKeys.value = [...expandedKeys.value]
          }
        }, 600)
      }
    } else {
      if (virtualDrag.expandTimer) {
        clearTimeout(virtualDrag.expandTimer)
        virtualDrag.expandTimer = null
      }
    }

    virtualDrag.dropTarget = foundKey
  } else if (isViewport) {
    virtualDrag.dropTarget = store.libraryPath
    virtualDrag.dropPosition = 'inside'
    if (virtualDrag.expandTimer) { clearTimeout(virtualDrag.expandTimer); virtualDrag.expandTimer = null }
  } else {
    virtualDrag.dropTarget = null
    virtualDrag.dropPosition = null
    if (virtualDrag.expandTimer) { clearTimeout(virtualDrag.expandTimer); virtualDrag.expandTimer = null }
  }
}

const onMouseUp = async () => {
  activeResizer.value = null
  if (virtualDrag.timer) { clearTimeout(virtualDrag.timer); virtualDrag.timer = null }
  if (virtualDrag.expandTimer) { clearTimeout(virtualDrag.expandTimer); virtualDrag.expandTimer = null }
  if (virtualDrag.scrollTimer) { clearInterval(virtualDrag.scrollTimer); virtualDrag.scrollTimer = null }
  
  if (virtualDrag.active) {
    const targetPath = virtualDrag.dropTarget
    const sourcePaths = virtualDrag.selectedPaths.length > 0 ? virtualDrag.selectedPaths : (virtualDrag.dragNode ? [virtualDrag.dragNode.key] : [])
    const position = virtualDrag.dropPosition

    if (sourcePaths.length > 0 && targetPath) {
      // 保护：如果目标在源路径中且是前后排序，视为原地操作
      if (sourcePaths.includes(targetPath) && (position === 'before' || position === 'after')) {
        virtualDrag.active = false; virtualDrag.dragNode = null; virtualDrag.dropTarget = null; virtualDrag.dropPosition = null; virtualDrag.selectedPaths = []
        message.destroyAll(); return
      }

      try {
        message.loading(`正在处理移动...`)
        
        // 识别目标目录和目标参考项
        let finalTargetDir = targetPath
        let referenceItem = null
        
        if (position === 'before' || position === 'after') {
          const lastIdx = Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/'))
          finalTargetDir = lastIdx !== -1 ? targetPath.substring(0, lastIdx) : store.libraryPath
          referenceItem = targetPath.split(/[\\/]/).pop() || ''
        }

        // 1. 物理移动逻辑
        const moveTasks = sourcePaths.filter(p => {
          const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
          const parent = idx !== -1 ? p.substring(0, idx) : store.libraryPath
          return parent !== finalTargetDir
        })

        if (moveTasks.length > 0) {
          await invoke('move_items', { sourcePaths: moveTasks, targetDir: finalTargetDir })
        }

        // 2. 逻辑排序逻辑 (Misty Order)
        // 获取目标文件夹的当前顺序
        const order = await invoke<any>('get_folder_order', { path: finalTargetDir })
        let currentItems = (await invoke<FileEntry[]>('scan_directory', { path: finalTargetDir }))
          .map(e => e.name)
        
        // 移除正在移动的项
        const movingNames = sourcePaths.map(p => p.split(/[\\/]/).pop() || '')
        currentItems = currentItems.filter(name => !movingNames.includes(name))

        // 插入到新位置
        if (position === 'inside') {
          currentItems.push(...movingNames)
        } else {
          let refIdx = currentItems.indexOf(referenceItem!)
          if (refIdx === -1) {
            // 如果没找到参考项（例如参考项就在移动列表中且未被原地保护拦截），则追加到末尾
            currentItems.push(...movingNames)
          } else {
            if (position === 'before') {
              currentItems.splice(refIdx, 0, ...movingNames)
            } else {
              currentItems.splice(refIdx + 1, 0, ...movingNames)
            }
          }
        }

        // 保存新顺序
        await invoke('save_folder_order', { 
          path: finalTargetDir, 
          order: { items: currentItems, pinned: order.pinned || [] } 
        })

        // 3. 界面刷新
        const parentsToRefresh = new Set<string>()
        parentsToRefresh.add(finalTargetDir)
        sourcePaths.forEach(p => {
          const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
          parentsToRefresh.add(idx !== -1 ? p.substring(0, idx) : store.libraryPath)
        })
        for (const p of parentsToRefresh) await refreshNode(p)

        selectedKeys.value = []
        message.destroyAll()
        message.success('操作成功')
      } catch (err: any) {
        message.destroyAll()
        message.error('操作失败: ' + err)
      }
    }
    virtualDrag.active = false; virtualDrag.dragNode = null; virtualDrag.dropTarget = null; virtualDrag.dropPosition = null; virtualDrag.selectedPaths = []
  }
}

const onMouseMove = (e: MouseEvent) => {
  if (activeResizer.value === 'sidebar') { sidebarWidth.value = Math.max(220, Math.min(e.clientX, 600)) }
  // 影子偏移，确保不挡住探测
  virtualDrag.x = e.clientX + 10; virtualDrag.y = e.clientY + 10
  
  if (virtualDrag.active) {
    updateDropTarget(e.clientX, e.clientY)

    // 边缘自动滚动逻辑
    const viewport = document.querySelector('.tree-viewport')
    if (viewport) {
      const rect = viewport.getBoundingClientRect()
      const threshold = 40 // 感应区高度
      let scrollSpeed = 0

      if (e.clientY < rect.top + threshold) {
        scrollSpeed = -10 // 向上滚动
      } else if (e.clientY > rect.bottom - threshold) {
        scrollSpeed = 10 // 向下滚动
      }

      if (scrollSpeed !== 0) {
        if (!virtualDrag.scrollTimer) {
          virtualDrag.scrollTimer = setInterval(() => {
            viewport.scrollTop += scrollSpeed
          }, 20)
        }
      } else {
        if (virtualDrag.scrollTimer) {
          clearInterval(virtualDrag.scrollTimer)
          virtualDrag.scrollTimer = null
        }
      }
    }
  }
}

const deleteAction = async (paths: string[]) => {
  if (paths.length === 0) return;
  const isMultiple = paths.length > 1
  const displayTitle = isMultiple ? `选中的 ${paths.length} 个项目` : paths[0].split(/[\\/]/).pop()?.replace(/\.md$/, '')
  if (confirm(`确认要物理删除 ${displayTitle} 吗？`)) { 
    try { 
      await invoke('delete_items', { paths })
      paths.forEach(p => { if (activeTabId.value === p || store.tabs.some(t => t.id === p)) store.removeTab(p) })
      const parentsToRefresh = new Set<string>()
      paths.forEach(p => { const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')); parentsToRefresh.add(idx !== -1 ? p.substring(0, idx) : store.libraryPath) })
      for (const p of parentsToRefresh) await refreshNode(p)
      selectedKeys.value = []; message.success('已物理删除')
    } catch (e) { message.error('删除失败') } 
  }
}

const nodeProps = ({ option }: { option: TreeOption }) => ({
  'data-key': option.key,
  'data-drop-path': option.key, 
  'data-drop-dir': !option.isLeaf ? 'true' : 'false', 
  class: [
    virtualDrag.dropTarget === option.key ? 'drop-active' : '',
    virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'before' ? 'is-drop-before' : '',
    virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'after' ? 'is-drop-after' : '',
    virtualDrag.dropTarget === option.key && virtualDrag.dropPosition === 'inside' ? 'is-drop-inside' : '',
  ].join(' '),
  onMousedown: (e: MouseEvent) => { 
    if (e.button !== 0) return; 
    virtualDrag.startX = e.clientX; virtualDrag.startY = e.clientY; 
    if (virtualDrag.timer) clearTimeout(virtualDrag.timer); 
    virtualDrag.timer = setTimeout(() => { 
      virtualDrag.active = true; virtualDrag.dragNode = option; 
      if (selectedKeys.value.includes(option.key as string)) {
        virtualDrag.selectedPaths = [...selectedKeys.value]
        virtualDrag.ghostText = `移动 ${selectedKeys.value.length} 个项目`
      } else {
        virtualDrag.selectedPaths = [option.key as string]
        virtualDrag.ghostText = option.label as string
      }
      virtualDrag.timer = null 
    }, 350) 
  },
  onMouseenter: (e: MouseEvent) => {
    if (!option.isLeaf || virtualDrag.active) return
    if (preview.timer) clearTimeout(preview.timer)
    preview.timer = setTimeout(() => {
      preview.show = true
      preview.title = option.label as string
      preview.path = option.key as string
      preview.x = e.clientX
      preview.y = e.clientY
    }, 400)
  },
  onMouseleave: () => {
    if (preview.timer) clearTimeout(preview.timer)
    preview.show = false
  },
  onContextmenu: (e: MouseEvent) => { 
    if (virtualDrag.active) return; e.preventDefault(); contextMenu.show = false; 
    if (preview.timer) clearTimeout(preview.timer); preview.show = false;
    setTimeout(() => { 
      contextMenu.x = e.clientX; contextMenu.y = e.clientY; contextMenu.targetPath = option.key as string; contextMenu.isDir = !option.isLeaf; 
      const isMulti = selectedKeys.value.length > 1
      const items = [ 
        { label: isMulti ? '批量重命名不可用' : '重命名 (F2)', key: 'rename', disabled: isMulti, icon: () => h(NIcon, null, { default: () => h(EditIcon) }) }, 
        { label: isMulti ? `物理删除所选 ${selectedKeys.value.length} 项` : '物理删除 (Del)', key: 'delete', icon: () => h(NIcon, { color: '#f5222d' }, { default: () => h(TrashIcon) }) } 
      ]; 
      if (!isMulti && contextMenu.isDir) items.unshift({ label: '新建子笔记', key: 'add-file', icon: () => h(NIcon, null, { default: () => h(PlusIcon) }) }, { label: '新建子文件夹', key: 'add-folder', icon: () => h(NIcon, null, { default: () => h(FolderPlusIcon) }) })
      contextMenu.options = items; contextMenu.show = true 
    }, 50) 
  }
})

const onMenuAction = async (key: string) => {
  contextMenu.show = false; const path = contextMenu.targetPath
  if (key === 'rename') { renameState.oldPath = path; let name = path.split(/[\\/]/).pop() || ''; if (!contextMenu.isDir) name = name.substring(0, name.lastIndexOf('.')); renameState.newName = name; renameState.show = true }
  else if (key === 'delete') await deleteAction(selectedKeys.value)
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
  autoSaveTimer = setTimeout(async () => { const cur = tabs.value.find(t => t.id === activeTabId.value); if (cur) try { await invoke('write_markdown_file', { path: cur.path, content }) } catch (e) {} }, 2000)
}

const refreshCurrentFile = async () => {
  if (!activeTabId.value) return
  const currentTab = tabs.value.find(t => t.id === activeTabId.value)
  if (currentTab) {
    // 强制清除内容缓存，使 loadFileToEditor 重新触发磁盘读取
    currentTab.content = undefined
    await loadFileToEditor(activeTabId.value)
    message.success('已同步磁盘最新内容')
  }
}

const saveCurrentFile = async () => {
  if (!vditor || !activeTabId.value) return; const t = tabs.value.find(item => item.id === activeTabId.value)
  if (t) { 
    try { 
      let content = vditor.getValue(); 
      
      // 路径还原：将 asset 调试路径还原为相对路径 (public/文件名)
      const assetPattern = /https?:\/\/asset\.localhost\/[^"'\)\s]+/g
      content = content.replace(assetPattern, (match: string) => {
        try {
          const decoded = decodeURIComponent(match)
          const fileName = decoded.split('/').pop() || ''
          return `public/${fileName}`
        } catch (e) { return match }
      })

      await invoke('write_markdown_file', { path: t.path, content }); 
      message.success('已安全保存'); 
      if (autoSaveTimer) clearTimeout(autoSaveTimer) 
    } catch (e) { message.error('保存失败') } 
  }
}

const syncVditorMode = () => { if (vditor) { const currentMode = vditor.getCurrentMode(); if (currentMode && currentMode !== store.editorMode) store.updateConfig({ editorMode: currentMode as any }) } }
const handleEditorClick = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('.vditor-toolbar__item')) setTimeout(() => syncVditorMode(), 300) }

const initVditor = () => {
  const container = document.getElementById('vditor-lib'); if (!container) return; 
  container.addEventListener('click', handleEditorClick); 
  editorLoading.value = true
  try {
    vditor = new Vditor('vditor-lib', {
      cdn: '/vditor', 
      lang: 'zh_CN', 
      height: '100%', 
      mode: store.editorMode || 'wysiwyg', 
      cache: { enable: false }, 
      theme: store.theme === 'dark' ? 'dark' : 'classic',
      preview: { 
        theme: { current: store.theme === 'dark' ? 'dark' : 'light' }, 
        hljs: { enable: true, style: store.codeTheme || 'github' },
        transform: (html) => {
          // 在渲染前，将所有相对路径图片转换为 misty-img 协议路径
          if (!activeTabId.value) return html
          const path = activeTabId.value
          const parentDir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1).replace(/\\/g, '/')
          
          return html.replace(/(<img [^>]*src=["'])(.*?)(["'][^>]*>)/g, (match, prefix, url, suffix) => {
            if (url.startsWith('http') || url.startsWith('misty-img:') || url.startsWith('data:')) return match
            let abs = url.startsWith('./') ? parentDir + url.substring(2) : (url.includes(':') ? url : parentDir + url)
            return `${prefix}misty-img://${abs.replace(/\\/g, '/')}${suffix}`
          })
        }
      },
      toolbar: [
        'undo', 'redo', '|', 'emoji', 'headings', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', '|',
        'code', 'inline-code', 
        { name: 'code-theme', tip: '代码高亮风格', icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>', click: () => {
          const themes = ['github', 'monokai', 'dracula', 'vscode', 'native', 'one-dark']
          const nextTheme = themes[(themes.indexOf(store.codeTheme) + 1) % themes.length]
          handleCodeThemeChange(nextTheme); message.info(`代码风格: ${nextTheme.toUpperCase()}`)
        }},
        { name: 'editor-bg', tip: '修改文章背景色', icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>', click: () => { (document.querySelector('.hidden-picker-trigger .n-color-picker-trigger') as HTMLElement)?.click() }},
        '|', 'upload', 'link', 'table', '|', 'both', 'preview', 'edit-mode'
      ],
      input: (val) => { 
        const cur = tabs.value.find(t => t.id === activeTabId.value); 
        if (cur) {
          triggerAutoSave(val); 
          store.updateTabContent(cur.path, val);
        }
        syncVditorMode();
        wordCount.value = val.length;
      },
      after: () => { 
        isVditorReady = true; 
        editorLoading.value = false; 
        syncVditorMode(); 
        if (activeTabId.value) { 
          const t = tabs.value.find(item => item.id === activeTabId.value); 
          if (t) loadFileToEditor(t.path) 
        }
        updateWordCount();
        setTimeout(fixEditorImages, 300); // 启动后修正
      }
    })
  } catch (e) { editorLoading.value = false }
}

const handleTabsWheel = (e: WheelEvent) => { if (tabsScrollRef.value) tabsScrollRef.value.scrollLeft += e.deltaY }
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'F2' && selectedKeys.value.length > 0) { const p = selectedKeys.value[0]; renameState.oldPath = p; let name = p.split(/[\\/]/).pop() || ''; if (p.endsWith('.md')) name = name.substring(0, name.lastIndexOf('.')); renameState.newName = name; renameState.show = true }
  if (e.key === 'Delete' && selectedKeys.value.length > 0) deleteAction(selectedKeys.value)
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentFile() }
}

let searchDebounce: any = null, unlistenRefresh: any = null

onMounted(async () => { 
  await store.loadConfig(); window.addEventListener('keydown', handleKeyDown)
  if (store.libraryPath) await refreshLibrary()
  unlistenRefresh = await listen('refresh-library', () => refreshLibrary())
  nextTick(() => { initVditor(); startShadowSaveTimer() })
  getCurrentWindow().onDragDropEvent(async (event) => {
    if (event.payload.type === 'over') {
      updateDropTarget(event.payload.position.x, event.payload.position.y)
    } else if (event.payload.type === 'drop') {
      const targetPath = virtualDrag.dropTarget || store.libraryPath
      const position = virtualDrag.dropPosition
      
      if (event.payload.paths.length > 0 && targetPath) {
        try {
          message.loading(`正在导入...`)
          
          let finalTargetDir = targetPath
          let referenceItem = null
          if (position === 'before' || position === 'after') {
            const lastIdx = Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/'))
            finalTargetDir = lastIdx !== -1 ? targetPath.substring(0, lastIdx) : store.libraryPath
            referenceItem = targetPath.split(/[\\/]/).pop() || ''
          }

          const importedPaths: string[] = []
          for (const p of event.payload.paths) {
            const newPath = await invoke<string>('import_to_library', { 
              sourcePath: p, 
              libraryRoot: store.libraryPath, 
              targetDir: finalTargetDir 
            })
            importedPaths.push(newPath)
          }

          // 逻辑排序 JSON 更新
          const order = await invoke<any>('get_folder_order', { path: finalTargetDir })
          let currentItems = (await invoke<FileEntry[]>('scan_directory', { path: finalTargetDir }))
            .map(e => e.name)
          
          const newNames = importedPaths.map(p => p.split(/[\\/]/).pop() || '')
          currentItems = currentItems.filter(name => !newNames.includes(name))

          if (position === 'inside' || !referenceItem) {
            currentItems.push(...newNames)
          } else {
            let refIdx = currentItems.indexOf(referenceItem)
            if (position === 'before') currentItems.splice(refIdx, 0, ...newNames)
            else currentItems.splice(refIdx + 1, 0, ...newNames)
          }

          await invoke('save_folder_order', { 
            path: finalTargetDir, 
            order: { items: currentItems, pinned: order.pinned || [] } 
          })

          await refreshNode(finalTargetDir)
          message.destroyAll(); message.success('导入完成')
        } catch (err) { message.destroyAll(); message.error('导入失败') }
      }
      virtualDrag.dropTarget = null; virtualDrag.dropPosition = null
    }
  })
})

onUnmounted(() => { window.removeEventListener('keydown', handleKeyDown); if (autoSaveTimer) clearTimeout(autoSaveTimer); if (shadowSaveTimer) clearInterval(shadowSaveTimer); if (outlineObserver) outlineObserver.disconnect(); if (unlistenRefresh) unlistenRefresh() })
watch(activeSidebarTab, (newTab) => { if (newTab === 'history') fetchHistory() })
watch(() => store.theme, (newTheme) => {
  if (vditor && isVditorReady) {
    const isDark = newTheme === 'dark'
    // 1. 同步编辑器背景色
    const targetBg = isDark ? '#1c1c1e' : '#ffffff'
    if (store.editorBgColor !== targetBg) {
      handleEditorBgChange(targetBg)
    }
    // 2. 同步 Vditor 内部组件主题
    vditor.setTheme(
      isDark ? 'dark' : 'classic', 
      isDark ? 'dark' : 'light', 
      store.codeTheme || 'github'
    )
  }
})

watch(() => store.codeTheme, (newCodeTheme) => {
  if (vditor && isVditorReady) {
    const isDark = store.theme === 'dark'
    vditor.setTheme(
      isDark ? 'dark' : 'classic',
      isDark ? 'dark' : 'light',
      newCodeTheme || 'github'
    )
  }
})

watch(() => store.autoSaveInterval, () => { startShadowSaveTimer() })
watch(() => store.libraryPath, (newPath) => { if (newPath) refreshLibrary() })
watch(activeTabId, (newId, oldId) => { 
  if (newId && newId !== oldId) { 
    const t = tabs.value.find(item => item.id === newId); 
    if (t) loadFileToEditor(t.path) 

    // 侧边栏自动同步逻辑
    selectedKeys.value = [newId]
    
    // 路径分隔符自适应处理 (修复 Windows 下无法折叠的问题)
    const separator = newId.includes('\\') ? '\\' : '/'
    const parts = newId.split(separator)
    const newExpanded = [...expandedKeys.value]
    let currentPath = ''
    
    // 排除文件名，逐级还原父目录原始路径
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (i === 0 ? '' : separator) + parts[i]
      if (!newExpanded.includes(currentPath)) {
        newExpanded.push(currentPath)
      }
    }
    expandedKeys.value = newExpanded

    // 利用官方 API 实现精准平滑滚动 (彻底解决自动滚动失效)
    nextTick(() => {
      setTimeout(() => {
        treeInstRef.value?.scrollTo({ key: newId, behavior: 'smooth' })
      }, 300)
    })
  } 
})
watch(searchQuery, (val) => { if (searchDebounce) clearTimeout(searchDebounce); if (!val.trim()) { refreshLibrary(); return }; searchDebounce = setTimeout(async () => { try { const results = await invoke<FileEntry[]>('search_library', { libraryRoot: store.libraryPath, query: val.trim() }); treeData.value = results.map(entry => ({ label: entry.is_dir ? entry.name : entry.name.replace(/\.md$/, ''), key: entry.path, isLeaf: !entry.is_dir, prefix: () => h(entry.is_dir ? FolderIcon : FileIcon, { size: 14, style: 'opacity: 0.6' }) })) } catch (e) {} }, 300) })
</script>

<style scoped>
.library-mode { display: flex; height: 100%; width: 100vw; overflow: hidden; background: transparent; box-sizing: border-box; animation: fadeIn 0.6s ease-out; }
.is-dragging, .is-dragging * { transition: none !important; user-select: none !important; }

.sidebar { 
  height: 100%; background: rgba(255, 255, 255, 0.4); backdrop-filter: saturate(180%) blur(40px); 
  border-right: 1px solid rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; overflow: hidden; 
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease; z-index: 20; 
}
.is-dark .sidebar { background: rgba(28, 28, 30, 0.5); border-right: 1px solid rgba(255, 255, 255, 0.08); }
.sidebar-inner { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }

/* === 顶部 Tabs 优化 === */
.sidebar-tabs-header { padding: 12px 12px 8px; flex-shrink: 0; }
.custom-sidebar-tabs :deep(.n-tabs-nav) { background: rgba(0, 0, 0, 0.03); border-radius: 10px; padding: 4px; }
.is-dark .custom-sidebar-tabs :deep(.n-tabs-nav) { background: rgba(255, 255, 255, 0.05); }
.custom-sidebar-tabs :deep(.n-tabs-rail) { background: transparent !important; }
.tab-label-inner { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; transition: all 0.3s; }
.tab-label-inner n-icon { font-size: 14px; }

.sidebar-tab-content { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.tab-pane { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

.tab-fade-enter-active, .tab-fade-leave-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.tab-fade-enter-from { opacity: 0; transform: translateY(10px); }
.tab-fade-leave-to { opacity: 0; transform: translateY(-10px); }

.sidebar-header { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }

.tree-viewport { flex: 1; overflow-y: auto; padding: 4px 12px; border: 2px solid transparent; transition: all 0.2s; animation: treeContainerFade 0.5s ease-out; }
.tree-viewport.drop-active { background: rgba(0, 122, 255, 0.05); border-color: rgba(0, 122, 255, 0.3); border-radius: 8px; }

:deep(.n-tree-node-content) { flex: 1; min-width: 0; overflow: hidden; }
:deep(.n-tree-node-content__text) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

:deep(.n-tree-node.drop-active .n-tree-node-content) { background: transparent !important; }
:deep(.n-tree-node.is-drop-inside .n-tree-node-content) { background: rgba(var(--theme-primary-rgb), 0.1) !important; box-shadow: 0 0 0 1px var(--theme-primary) inset; border-radius: 6px; }

:deep(.n-tree-node) { position: relative; }
:deep(.n-tree-node.is-drop-before::before),
:deep(.n-tree-node.is-drop-after::after) {
  content: "";
  position: absolute;
  left: 36px;
  right: 12px;
  height: 2px;
  background: var(--theme-primary);
  z-index: 10;
  pointer-events: none;
}

:deep(.n-tree-node.is-drop-before::before) { top: -1px; }
:deep(.n-tree-node.is-drop-after::after) { bottom: -1px; }

/* 指示线两端的圆点装饰 */
:deep(.n-tree-node.is-drop-before::before),
:deep(.n-tree-node.is-drop-after::after) {
  box-shadow: -4px 0 0 var(--theme-primary), 4px 0 0 var(--theme-primary);
  border-radius: 2px;
}

.empty-state-hint { padding: 60px 20px; opacity: 0.6; animation: slideUp 0.6s ease-out both; }

.manual-outline-box { padding: 0; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
.outline-tree-wrapper { flex: 1; overflow-y: auto; padding: 12px 8px; }
/* 极致紧凑样式覆盖 */
.compact-outline-tree :deep(.n-tree-node) { 
  margin-top: 1px; 
  align-items: center; 
  /* 还原入场动效 */
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* 阶梯延迟：前 12 个标题依次滑入 */
.compact-outline-tree :deep(.n-tree-node:nth-child(1)) { animation-delay: 0.02s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(2)) { animation-delay: 0.04s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(3)) { animation-delay: 0.06s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(4)) { animation-delay: 0.08s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(5)) { animation-delay: 0.10s; }
.compact-outline-tree :deep(.n-tree-node:nth-child(n+6)) { animation-delay: 0.12s; }

.compact-outline-tree :deep(.n-tree-node-content) { 
  padding: 2px 6px !important; 
  min-height: 28px !important; 
  font-size: 13px !important; 
  border-radius: 6px; 
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important; 
  overflow: hidden;
}

.compact-outline-tree :deep(.n-tree-node-content__text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.compact-outline-tree :deep(.n-tree-node-content:hover) { 
  background: rgba(var(--theme-primary-rgb), 0.08) !important; 
  /* 还原悬停位移 */
  transform: translateX(4px); 
  color: var(--theme-primary);
}

.compact-outline-tree :deep(.n-tree-node-indent) { width: 12px !important; }
.compact-outline-tree :deep(.n-tree-node-switcher) { width: 16px !important; height: 16px !important; }
/* === 历史面板深度优化 === */
.history-box { padding: 12px 16px; height: 100%; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; min-height: 0; }
.history-header { display: flex; align-items: center; justify-content: space-between; }
.history-title-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #86868b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.clear-all-btn { opacity: 0.6; transition: all 0.3s; }
.clear-all-btn:hover { opacity: 1; color: #f5222d; transform: rotate(15deg); }

.history-bubbles-wrapper { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px 2px 20px; }

.history-bubble { 
  position: relative; padding: 12px 14px; background: rgba(255, 255, 255, 0.6); 
  border: 1px solid rgba(0, 0, 0, 0.04); border-radius: 14px; 
  cursor: pointer; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); 
  display: flex; gap: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02); 
  animation: bubblePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  overflow: hidden; flex-shrink: 0;
}
.is-dark .history-bubble { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.06); }

/* 侧边装饰线 */
.bubble-accent-line { 
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px; 
  background: var(--theme-primary); opacity: 0; transition: all 0.3s;
}

.history-bubble:hover { 
  background: #fff; 
  transform: translateX(4px) scale(1.01); 
  border-color: rgba(var(--theme-primary-rgb), 0.1); 
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.04); 
}
.is-dark .history-bubble:hover { background: rgba(255, 255, 255, 0.08); }
.history-bubble:hover .bubble-accent-line { opacity: 1; height: 100%; }

.bubble-content { flex: 1; min-width: 0; z-index: 2; }
.bubble-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.bubble-time { font-size: 13px; font-weight: 800; color: var(--theme-text); font-variant-numeric: tabular-nums; }
.bubble-meta { 
  font-size: 10px; font-weight: 700; color: var(--theme-primary); 
  background: rgba(var(--theme-primary-rgb), 0.08); padding: 2px 8px; border-radius: 20px;
  backdrop-filter: blur(4px); transition: all 0.3s;
}
.history-bubble:hover .bubble-meta { background: var(--theme-primary); color: #fff; }

.bubble-preview { 
  font-size: 12px; color: var(--theme-text); opacity: 0.5; line-height: 1.5; 
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; 
  overflow: hidden; word-break: break-all; transition: all 0.3s;
}
.history-bubble:hover .bubble-preview { opacity: 0.8; }

.bubble-actions { 
  opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); 
  transform: scale(0.8) rotate(-20deg);
}
.history-bubble:hover .bubble-actions { opacity: 1; transform: scale(1) rotate(0deg); }

/* 阶梯加载动效 */
.history-bubble:nth-child(1) { animation-delay: 0.05s; }
.history-bubble:nth-child(2) { animation-delay: 0.1s; }
.history-bubble:nth-child(3) { animation-delay: 0.15s; }
.history-bubble:nth-child(4) { animation-delay: 0.2s; }

/* === 底部 Footer === */
.sidebar-footer-container { padding: 12px; flex-shrink: 0; }
.sidebar-footer { 
  display: flex; align-items: center; gap: 12px; padding: 12px; 
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 240, 243, 0.9) 100%);
  backdrop-filter: blur(20px); 
  border-radius: 16px; 
  border: 1.2px solid rgba(var(--theme-primary-rgb), 0.65); 
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1);
  cursor: pointer; 
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-dark .sidebar-footer { background: linear-gradient(135deg, rgba(50, 50, 55, 0.95) 0%, rgba(25, 25, 28, 0.98) 100%); border-color: rgba(var(--theme-primary-rgb), 0.7); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15); }
.sidebar-footer:hover { transform: translateY(-5px) scale(1.02); background: #fff; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15), 0 10px 25px rgba(var(--theme-primary-rgb), 0.25), 0 0 0 1px var(--theme-primary); border-color: transparent; }
.is-dark .sidebar-footer:hover { background: #1c1c1e; }

.settings-icon-box { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.03); border-radius: 10px; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); color: var(--theme-text); opacity: 0.8; }
.is-dark .settings-icon-box { background: rgba(255, 255, 255, 0.06); }
.sidebar-footer:hover .settings-icon-box { background: rgba(0, 122, 255, 0.1); color: var(--theme-primary); opacity: 1; }
.rotating-settings { transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
.sidebar-footer:hover .rotating-settings { transform: rotate(180deg); }

.lib-info-box { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lib-name-row { display: flex; align-items: center; gap: 6px; }
.lib-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.3; transition: opacity 0.3s; }
.sidebar-footer:hover .lib-label { opacity: 0.5; }
.lib-status-dot { width: 6px; height: 6px; background: #42b883; border-radius: 50%; box-shadow: 0 0 8px rgba(66, 184, 131, 0.4); }
.meta-path { font-size: 13px; font-weight: 700; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.9; }
.footer-chevron { font-size: 14px; opacity: 0.2; transition: all 0.3s; transform: translateX(-4px); }
.sidebar-footer:hover .footer-chevron { opacity: 0.6; transform: translateX(0); }

.resizer-area { position: relative; width: 1px; height: 100%; z-index: 100; background: rgba(0, 0, 0, 0.03); cursor: col-resize; }
.resizer-area:hover { background: var(--theme-primary); }
.drag-handle { position: absolute; top: 0; left: -8px; right: -8px; bottom: 0; z-index: 101; cursor: col-resize; }
.collapse-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 24px; height: 48px; background: var(--theme-card); color: var(--theme-text); border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 150; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.collapse-btn:hover { background: var(--theme-primary); color: #fff; transform: translateY(-50%) scale(1.1); }
.collapse-btn.left { left: 0px; border-radius: 0 12px 12px 0; }

.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; padding: 0 4px 4px; }
.tabs-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 0; gap: 12px; }
.tab-scroller { flex: 1; height: 40px; display: flex; gap: 8px; align-items: center; overflow-x: auto; scrollbar-width: none; }
.tab-pill { height: 30px; padding: 0 14px; display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; background: rgba(0, 0, 0, 0.03); border-radius: 15px; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap; max-width: 200px; min-width: 0; flex-shrink: 0; }
.tab-pill:hover { background: rgba(0, 0, 0, 0.06); transform: translateY(-1px); }
.tab-pill.active { 
  background: var(--custom-editor-bg); 
  color: var(--theme-primary); 
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.03); 
}
.is-dark .tab-pill.active {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.pill-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 0 8px 4px;
}

.action-btn-group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.save-btn {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.save-btn:hover {
  transform: translateY(-1px);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.save-btn:active {
  transform: scale(0.95);
}

.word-count-info {
  font-size: 10px;
  opacity: 0.4;
  font-weight: 700;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 6px;
  border-radius: 8px;
  transition: all 0.3s ease;
  animation: countFadeIn 0.5s ease-out;
}

.is-dark .word-count-info {
  background: rgba(255, 255, 255, 0.08);
}

@keyframes countFadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 0.4; transform: translateY(0); }
}

.editor-viewport { flex: 1; position: relative; background: #fff; border-radius: 12px 12px 0 0; overflow: visible; display: flex; flex-direction: column; min-height: 0; z-index: 10; }
.is-dark .editor-viewport { background: #1c1c1e; }
.vditor-instance { flex: 1; height: 0; overflow: visible !important; }

:deep(.vditor-wysiwyg), :deep(.vditor-preview), :deep(.vditor-panel), :deep(.vditor-reset) { background-color: var(--custom-editor-bg) !important; }

.hero-viewport { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: inherit; z-index: 5; overflow: hidden; }
.ambient-glow { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; filter: blur(80px); opacity: 0.4; }
.blob { position: absolute; width: 400px; height: 400px; border-radius: 50%; animation: blobRotate 20s infinite alternate; }
.blob-1 { background: rgba(102, 126, 234, 0.3); top: -100px; right: -100px; }
.blob-2 { background: rgba(118, 75, 162, 0.2); bottom: -150px; left: -100px; animation-delay: -5s; }

.hero-content { text-align: center; z-index: 10; max-width: 500px; }
.hero-brand { font-size: 84px; display: flex; justify-content: center; margin-bottom: 24px; color: var(--theme-primary); animation: heroFloat 4s ease-in-out infinite, heroGlow 4s ease-in-out infinite, heroEntry 1s cubic-bezier(0.16, 1, 0.3, 1); }
.hero-title { font-size: 32px; font-weight: 800; margin-bottom: 12px; animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both; }
.hero-subtitle { font-size: 16px; opacity: 0.6; margin-bottom: 32px; animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both; }
.hero-actions { display: flex; gap: 16px; justify-content: center; animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both; }

.drag-ghost { position: fixed; pointer-events: none !important; z-index: 9999; padding: 8px 12px; background: rgba(255, 255, 255, 0.9); border: 1px solid var(--theme-primary); border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--theme-primary); }
.drag-ghost * { pointer-events: none !important; }

@keyframes treeContainerFade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes bubblePop { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes heroFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
@keyframes heroEntry { from { opacity: 0; transform: scale(0.8) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes heroGlow { 0%, 100% { filter: drop-shadow(0 0 20px rgba(0, 122, 255, 0.2)); } 50% { filter: drop-shadow(0 0 40px rgba(0, 122, 255, 0.5)); } }
@keyframes blobRotate { from { transform: rotate(0deg) scale(1); } to { transform: rotate(360deg) scale(1.2); } }
</style>