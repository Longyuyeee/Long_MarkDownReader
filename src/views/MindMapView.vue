<template>
  <div class="mindmap-page">
    <header class="mindmap-header">
      <div class="header-main">
        <button class="icon-button" title="返回知识库" @click="router.push('/library')"><n-icon :component="ArrowLeftIcon" /></button>
        <div>
          <input v-if="document" v-model="document.title" class="title-input" maxlength="500" @focus="beginFieldEdit" @change="endFieldEdit" />
          <strong v-else>OPML 思维导图</strong>
          <span>{{ isExternal ? '外部 OPML · 仅点击保存写回' : fileName }} · {{ nodeCount }} 个主题 · {{ maxDepth }} 层</span>
        </div>
      </div>
      <div class="header-actions">
        <button title="撤销" :disabled="!undoStack.length" @click="undo"><n-icon :component="UndoIcon" /></button>
        <button title="重做" :disabled="!redoStack.length" @click="redo"><n-icon :component="RedoIcon" /></button>
        <button v-if="!isExternal" title="投影到 Canvas" :disabled="saving || loading" @click="projectToCanvas"><n-icon :component="NetworkIcon" />投影到 Canvas</button>
        <button class="primary" title="保存" :disabled="!dirty || saving" @click="save"><n-icon :component="SaveIcon" />{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </header>

    <div v-if="document" class="mindmap-toolbar" data-command-strip data-horizontal-wheel="always">
      <div class="view-switch">
        <button :class="{ active: viewMode === 'map' }" @click="viewMode = 'map'"><n-icon :component="NetworkIcon" />思维导图</button>
        <button :class="{ active: viewMode === 'outline' }" @click="viewMode = 'outline'"><n-icon :component="ListTreeIcon" />树形大纲</button>
      </div>
      <span class="divider"></span>
      <button @click="addRoot"><n-icon :component="PlusIcon" />根主题</button>
      <button :disabled="!selectedNode" @click="addChild"><n-icon :component="CornerDownRightIcon" />子主题</button>
      <button :disabled="!selectedNode" @click="addSibling"><n-icon :component="ListPlusIcon" />同级主题</button>
      <button :disabled="!canIndent" @click="indentNode">缩进</button>
      <button :disabled="!canOutdent" @click="outdentNode">减少缩进</button>
      <button :disabled="!selectedNode" class="danger" @click="removeSelected"><n-icon :component="TrashIcon" />删除</button>
      <span class="divider"></span>
      <button @click="setAllCollapsed(true)">全部折叠</button>
      <button @click="setAllCollapsed(false)">全部展开</button>
      <template v-if="viewMode === 'map'">
        <span class="divider"></span>
        <label class="tool-select">布局
          <select v-model="layoutMode" @change="applyLayout">
            <option value="tree">树状</option>
            <option value="organization">组织</option>
            <option value="radial">放射</option>
            <option value="timeline">时间线</option>
          </select>
        </label>
        <label class="tool-select">主题
          <select v-model="mapTheme">
            <option value="professional">专业</option>
            <option value="colorful">多彩</option>
            <option value="focus">专注</option>
          </select>
        </label>
        <button class="icon-tool" title="缩小" @click="changeZoom(0.85)"><n-icon :component="ZoomOutIcon" /></button>
        <button class="zoom-readout" title="恢复 100%" @click="resetViewport">{{ Math.round(mapZoom * 100) }}%</button>
        <button class="icon-tool" title="放大" @click="changeZoom(1.18)"><n-icon :component="ZoomInIcon" /></button>
        <button class="icon-tool" title="适合窗口" @click="fitMap"><n-icon :component="MaximizeIcon" /></button>
      </template>
      <label class="search-box"><n-icon :component="SearchIcon" /><input v-model="query" placeholder="搜索主题或备注" /></label>
    </div>

    <main class="mindmap-main">
      <div v-if="loading" class="state"><div class="loader"></div><strong>正在解析 OPML</strong></div>
      <div v-else-if="error" class="state error"><strong>无法打开思维导图</strong><p>{{ error }}</p><button @click="load">重试</button></div>
      <template v-else-if="document">
        <section v-if="viewMode === 'outline'" class="outline-panel">
          <div class="outline-head"><span>主题</span><span>层级</span></div>
          <div
            v-for="item in visibleItems"
            :key="item.node.id"
            class="outline-row"
            :class="{ selected: item.node.id === selectedId, dragging: item.node.id === draggedId, match: item.matches, collapsed: item.node.collapsed }"
            :style="{ '--depth': item.depth }"
            draggable="true"
            @dragstart="startDrag(item.node.id)"
            @dragover.prevent
            @drop.prevent="dropOn(item.node.id)"
            @click="selectOnly(item.node.id)"
            @contextmenu.prevent="openNodeContextMenu(item.node, $event)"
          >
            <span class="tree-lines"></span>
            <button class="collapse" :class="{ hidden: !item.node.children.length }" @click.stop="toggleCollapsed(item.node)"><n-icon :component="ChevronRightIcon" /></button>
            <input v-model="item.node.text" maxlength="2000" @focus="beginFieldEdit" @change="endFieldEdit" @click.stop="selectedId = item.node.id" />
            <small>{{ item.depth + 1 }}</small>
            <button class="quick-add" title="添加子主题" @click.stop="selectedId = item.node.id; addChild()">+</button>
          </div>
          <div v-if="!visibleItems.length" class="empty-search">没有匹配的主题</div>
        </section>

        <section
          v-else
          ref="mapPanel"
          class="map-panel"
          :class="`map-theme-${mapTheme}`"
          tabindex="0"
          @pointerdown="startCanvasPointer"
          @wheel.prevent="onMapWheel"
          @contextmenu.prevent="openMapContextMenu"
        >
          <div
            class="map-canvas"
            :style="{
              width: `${mapSize.width}px`,
              height: `${mapSize.height}px`,
              transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
            }"
          >
            <svg class="map-edges" :width="mapSize.width" :height="mapSize.height">
              <path v-for="edge in mapEdges" :key="edge.id" :d="edge.path" />
            </svg>
            <article
              v-for="item in mapItems"
              :key="item.node.id"
              class="map-node"
              :class="{ selected: selectedIds.includes(item.node.id), dragging: item.node.id === draggedId, match: item.matches, root: item.depth === 0 }"
              :style="{ left: `${item.x}px`, top: `${item.y}px` }"
              @pointerdown.stop="startNodePointer($event, item.node.id)"
              @dblclick.stop="beginNodeRename(item.node.id)"
              @contextmenu.stop.prevent="openNodeContextMenu(item.node, $event)"
            >
              <button v-if="item.node.children.length" class="map-collapse" @click.stop="toggleCollapsed(item.node)">{{ item.node.collapsed ? `+${descendantCount(item.node)}` : '−' }}</button>
              <input
                v-if="editingId === item.node.id"
                v-model="item.node.text"
                class="map-title-editor"
                maxlength="2000"
                autofocus
                @pointerdown.stop
                @keydown.enter.prevent="finishNodeRename"
                @keydown.escape.prevent="cancelNodeRename"
                @blur="finishNodeRename"
              />
              <strong v-else>{{ item.node.text }}</strong>
              <p v-if="item.node.note">{{ item.node.note }}</p>
              <small>{{ item.node.children.length }} 个子主题</small>
            </article>
          </div>
          <div v-if="selectionBox" class="selection-box" :style="selectionBoxStyle"></div>
          <div class="canvas-help"><n-icon :component="HandIcon" />拖动空白处平移 · Shift 拖动框选 · 滚轮缩放 · 方向键移动</div>
          <div v-if="!mapItems.length" class="empty-search">没有匹配的主题</div>
        </section>

        <aside class="inspector">
          <template v-if="selectedNode">
            <div class="inspector-head"><strong>主题属性</strong><code>{{ selectedNode.id }}</code></div>
            <label>标题<input v-model="selectedNode.text" maxlength="2000" @focus="beginFieldEdit" @change="endFieldEdit" /></label>
            <label>备注<textarea v-model="selectedNode.note" maxlength="20000" rows="8" placeholder="补充描述、上下文或行动说明" @focus="beginFieldEdit" @change="endFieldEdit"></textarea></label>
            <label class="check"><input v-model="selectedNode.collapsed" type="checkbox" @focus="beginFieldEdit" @change="endFieldEdit" />默认折叠子主题</label>
            <div class="inspector-actions">
              <button @click="addChild">添加子主题</button><button @click="addSibling">添加同级</button>
            </div>
            <p class="drag-hint">画布中可自由拖动和多选主题；树形大纲中可把主题拖到另一个主题下改变层级。所有修改只在点击“保存”后写入源文件。</p>
          </template>
          <div v-else class="inspector-empty"><n-icon :component="MousePointerIcon" /><span>选择一个主题进行编辑</span></div>
        </aside>
      </template>
    </main>

    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :options="contextMenuOptions"
      :show="contextMenu.show"
      :on-clickoutside="closeContextMenu"
      @select="handleContextMenuAction"
    />

    <footer v-if="document" class="statusbar">
      <span>{{ dirty ? '有未保存更改' : '已与磁盘同步' }}<template v-if="saveError"> · {{ saveError }}</template></span>
      <span>{{ isExternal ? '外部 OPML · 保存时规范化 XML' : 'OPML 2.0' }} · {{ layoutLabels[layoutMode] }}布局 · {{ selectedIds.length }} 个已选 · 仅点击保存时写入</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { openManagedFile } from '../services/fileNavigation'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { useDialog, useMessage } from 'naive-ui'
import { ArrowLeft as ArrowLeftIcon, ChevronRight as ChevronRightIcon, CornerDownRight as CornerDownRightIcon, Hand as HandIcon, ListPlus as ListPlusIcon, ListTree as ListTreeIcon, Maximize2 as MaximizeIcon, MousePointer2 as MousePointerIcon, Network as NetworkIcon, Plus as PlusIcon, Redo2 as RedoIcon, Save as SaveIcon, Search as SearchIcon, Trash2 as TrashIcon, Undo2 as UndoIcon, ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon } from 'lucide-vue-next'
import { useAppStore } from '../store/app'

interface OpmlNode { id: string; text: string; note: string; collapsed: boolean; attributes: Record<string, string>; children: OpmlNode[] }
interface OpmlDocument { title: string; metadata: Record<string, string>; roots: OpmlNode[] }
interface OpmlFile { path: string; signature: string; document: OpmlDocument }
interface LocatedNode { node: OpmlNode; parent: OpmlNode | null; siblings: OpmlNode[]; index: number; grandSiblings: OpmlNode[] | null; parentIndex: number }
interface FlatItem { node: OpmlNode; parentId: string | null; depth: number; matches: boolean }

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const path = computed(() => String(route.query.path || ''))
const isExternal = computed(() => route.query.external === '1')
const fileName = computed(() => path.value.split(/[\\/]/).pop()?.replace(/\.opml$/i, '') || '未命名思维导图')
const document = ref<OpmlDocument | null>(null)
const signature = ref('')
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const error = ref('')
const saveError = ref('')
const selectedId = ref('')
const selectedIds = ref<string[]>([])
const draggedId = ref('')
const query = ref('')
const viewMode = ref<'map' | 'outline'>((localStorage.getItem('opml-view-mode') as 'map' | 'outline') || 'map')
type LayoutMode = 'tree' | 'organization' | 'radial' | 'timeline'
type MapTheme = 'professional' | 'colorful' | 'focus'
const layoutMode = ref<LayoutMode>((localStorage.getItem('opml-layout-mode') as LayoutMode) || 'tree')
const mapTheme = ref<MapTheme>((localStorage.getItem('opml-map-theme') as MapTheme) || 'colorful')
const layoutLabels: Record<LayoutMode, string> = { tree: '树状', organization: '组织', radial: '放射', timeline: '时间线' }
const mapPanel = ref<HTMLElement | null>(null)
const mapZoom = ref(1)
const mapPan = ref({ x: 0, y: 0 })
const selectionBox = ref<{ startX: number; startY: number; x: number; y: number } | null>(null)
const contextMenu = reactive({ show: false, x: 0, y: 0, target: 'background' as 'background' | 'node', nodeId: '' })
const editingId = ref('')
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let fieldSnapshot = ''
let nodeDragSnapshot = ''
let nodeDragOrigin: { clientX: number; clientY: number; positions: Map<string, { x: number; y: number }> } | null = null
let nodeDragMoved = false
let panOrigin: { clientX: number; clientY: number; x: number; y: number } | null = null
let spacePressed = false

const snapshot = () => JSON.stringify(document.value)
const restore = (value: string) => { document.value = JSON.parse(value) as OpmlDocument; dirty.value = true; ensureSelection() }
const pushUndo = (before: string) => { if (before === snapshot()) return; undoStack.value.push(before); if (undoStack.value.length > 100) undoStack.value.shift(); redoStack.value = []; dirty.value = true }
const mutate = (callback: () => void) => { const before = snapshot(); callback(); pushUndo(before) }
const beginFieldEdit = () => { fieldSnapshot = snapshot() }
const endFieldEdit = () => { if (fieldSnapshot) pushUndo(fieldSnapshot); fieldSnapshot = '' }

const visitNodes = (callback: (node: OpmlNode, depth: number) => void) => {
  const visit = (nodes: OpmlNode[], depth: number) => { for (const node of nodes) { callback(node, depth); visit(node.children, depth + 1) } }
  visit(document.value?.roots || [], 0)
}
const nodeCount = computed(() => { let count = 0; visitNodes(() => { count += 1 }); return count })
const maxDepth = computed(() => { let depth = 0; visitNodes((_, value) => { depth = Math.max(depth, value + 1) }); return depth })

const locate = (id: string): LocatedNode | null => {
  const search = (siblings: OpmlNode[], parent: OpmlNode | null, grandSiblings: OpmlNode[] | null, parentIndex: number): LocatedNode | null => {
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index]
      if (node.id === id) return { node, parent, siblings, index, grandSiblings, parentIndex }
      const found = search(node.children, node, siblings, index)
      if (found) return found
    }
    return null
  }
  return document.value ? search(document.value.roots, null, null, -1) : null
}
const selectedNode = computed(() => locate(selectedId.value)?.node || null)
const contextMenuOptions = computed(() => {
  if (contextMenu.target === 'background') return [
    { label: '新增根主题', key: 'add-root' },
    { type: 'divider', key: 'background-divider' },
    { label: '适合全部内容', key: 'fit' },
    { label: '恢复 100% 视图', key: 'reset-view' },
    { label: '重新应用当前布局', key: 'apply-layout' },
    { type: 'divider', key: 'collapse-divider' },
    { label: '全部展开', key: 'expand-all' },
    { label: '全部折叠', key: 'collapse-all' },
  ]
  const location = locate(contextMenu.nodeId)
  const node = location?.node
  return [
    { label: '重命名', key: 'rename' },
    { label: '新增子主题', key: 'add-child' },
    { label: '新增同级主题', key: 'add-sibling' },
    ...(location && location.index > 0 ? [{ label: '缩进为上一项的子主题', key: 'indent' }] : []),
    ...(location?.parent ? [{ label: '减少缩进', key: 'outdent' }] : []),
    ...(node?.children.length ? [{ label: node.collapsed ? '展开分支' : '折叠分支', key: 'toggle-collapse' }] : []),
    { type: 'divider', key: 'node-divider' },
    { label: '删除主题', key: 'delete' },
  ]
})
const makeId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const newNode = (text = '新主题'): OpmlNode => ({ id: makeId(), text, note: '', collapsed: false, attributes: {}, children: [] })
const ensureSelection = () => {
  if (!locate(selectedId.value)) selectedId.value = document.value?.roots[0]?.id || ''
  selectedIds.value = selectedIds.value.filter(id => Boolean(locate(id)))
  if (!selectedIds.value.length && selectedId.value) selectedIds.value = [selectedId.value]
}

const selectOnly = (id: string) => { selectedId.value = id; selectedIds.value = id ? [id] : [] }
const beginNodeRename = (id: string) => { selectOnly(id); fieldSnapshot = snapshot(); editingId.value = id; void nextTick(() => mapPanel.value?.querySelector<HTMLInputElement>('.map-title-editor')?.select()) }
const finishNodeRename = () => { if (!editingId.value) return; editingId.value = ''; endFieldEdit() }
const cancelNodeRename = () => { if (fieldSnapshot) restore(fieldSnapshot); fieldSnapshot = ''; editingId.value = '' }
const addRoot = () => mutate(() => { const node = newNode('新根主题'); document.value!.roots.push(node); selectOnly(node.id); void nextTick(() => beginNodeRename(node.id)) })
const addChild = () => { const target = selectedNode.value; if (!target) return; mutate(() => { const node = newNode(); target.collapsed = false; target.children.push(node); selectOnly(node.id); void nextTick(() => beginNodeRename(node.id)) }) }
const addSibling = () => { const location = locate(selectedId.value); if (!location) return; mutate(() => { const node = newNode(); location.siblings.splice(location.index + 1, 0, node); selectOnly(node.id); void nextTick(() => beginNodeRename(node.id)) }) }
const removeSelected = () => {
  const location = locate(selectedId.value)
  if (!location || (!location.parent && document.value!.roots.length === 1)) return void message.warning('思维导图至少需要一个根主题')
  mutate(() => { location.siblings.splice(location.index, 1); selectedId.value = location.siblings[Math.min(location.index, location.siblings.length - 1)]?.id || location.parent?.id || document.value!.roots[0].id })
}
const canIndent = computed(() => { const value = locate(selectedId.value); return Boolean(value && value.index > 0) })
const canOutdent = computed(() => Boolean(locate(selectedId.value)?.parent))
const indentNode = () => { const location = locate(selectedId.value); if (!location || location.index === 0) return; mutate(() => { const [node] = location.siblings.splice(location.index, 1); const parent = location.siblings[location.index - 1]; parent.children.push(node); parent.collapsed = false }) }
const outdentNode = () => { const location = locate(selectedId.value); if (!location?.parent || !location.grandSiblings) return; mutate(() => { const [node] = location.siblings.splice(location.index, 1); location.grandSiblings!.splice(location.parentIndex + 1, 0, node) }) }
const toggleCollapsed = (node: OpmlNode) => mutate(() => { node.collapsed = !node.collapsed })
const setAllCollapsed = (value: boolean) => mutate(() => visitNodes(node => { if (node.children.length) node.collapsed = value }))
const descendantCount = (node: OpmlNode): number => node.children.reduce((total, child) => total + 1 + descendantCount(child), 0)

const startDrag = (id: string) => { draggedId.value = id }
const isDescendant = (node: OpmlNode, id: string): boolean => node.children.some(child => child.id === id || isDescendant(child, id))
const dropOn = (targetId: string) => {
  const source = locate(draggedId.value); const target = locate(targetId)
  draggedId.value = ''
  if (!source || !target || source.node.id === target.node.id || isDescendant(source.node, target.node.id)) return
  mutate(() => { source.siblings.splice(source.index, 1); target.node.children.push(source.node); target.node.collapsed = false; selectedId.value = source.node.id })
}

const matchesQuery = (node: OpmlNode, needle: string) => `${node.text}\n${node.note}`.toLocaleLowerCase().includes(needle)
const matchingIds = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase(); const ids = new Set<string>()
  if (!needle || !document.value) return ids
  const visit = (nodes: OpmlNode[], ancestors: string[]) => { for (const node of nodes) { if (matchesQuery(node, needle)) { ids.add(node.id); ancestors.forEach(id => ids.add(id)) } visit(node.children, [...ancestors, node.id]) } }
  visit(document.value.roots, []); return ids
})
const allItems = computed<FlatItem[]>(() => {
  const result: FlatItem[] = []; const needle = query.value.trim().toLocaleLowerCase()
  const visit = (nodes: OpmlNode[], parentId: string | null, depth: number) => { for (const node of nodes) { const included = !needle || matchingIds.value.has(node.id); if (included) result.push({ node, parentId, depth, matches: Boolean(needle && matchesQuery(node, needle)) }); if ((!node.collapsed || needle) && included) visit(node.children, node.id, depth + 1) } }
  if (document.value) visit(document.value.roots, null, 0); return result
})
const visibleItems = computed(() => allItems.value)
const storedCoordinate = (node: OpmlNode, key: '_longeditX' | '_longeditY') => {
  const value = Number(node.attributes[key])
  return Number.isFinite(value) ? value : null
}
const automaticPositions = computed(() => {
  const result = new Map<string, { x: number; y: number }>()
  const items = allItems.value
  if (layoutMode.value === 'tree') {
    items.forEach((item, index) => result.set(item.node.id, { x: 80 + item.depth * 280, y: 70 + index * 96 }))
  } else if (layoutMode.value === 'organization') {
    const levels = new Map<number, FlatItem[]>()
    items.forEach(item => levels.set(item.depth, [...(levels.get(item.depth) || []), item]))
    levels.forEach((level, depth) => level.forEach((item, index) => result.set(item.node.id, {
      x: 110 + index * 250 + Math.max(0, 520 - level.length * 125),
      y: 60 + depth * 150,
    })))
  } else if (layoutMode.value === 'radial') {
    const levels = new Map<number, FlatItem[]>()
    items.forEach(item => levels.set(item.depth, [...(levels.get(item.depth) || []), item]))
    levels.forEach((level, depth) => level.forEach((item, index) => {
      if (depth === 0 && index === 0) result.set(item.node.id, { x: 600, y: 410 })
      else {
        const angle = (Math.PI * 2 * index) / level.length - Math.PI / 2
        const radius = 210 + depth * 190
        result.set(item.node.id, { x: 600 + Math.cos(angle) * radius, y: 410 + Math.sin(angle) * radius })
      }
    }))
  } else {
    items.forEach((item, index) => result.set(item.node.id, {
      x: 80 + index * 250,
      y: 150 + (item.depth % 3) * 150,
    }))
  }
  return result
})
const mapItems = computed(() => allItems.value.map(item => {
  const automatic = automaticPositions.value.get(item.node.id) || { x: 80, y: 80 }
  return {
    ...item,
    x: storedCoordinate(item.node, '_longeditX') ?? automatic.x,
    y: storedCoordinate(item.node, '_longeditY') ?? automatic.y,
  }
}))
const mapSize = computed(() => {
  const width = Math.max(1300, ...mapItems.value.map(item => item.x + 310))
  const height = Math.max(900, ...mapItems.value.map(item => item.y + 180))
  return { width, height }
})
const mapEdges = computed(() => {
  const positions = new Map(mapItems.value.map(item => [item.node.id, item]))
  return mapItems.value.flatMap(item => { const parent = item.parentId ? positions.get(item.parentId) : null; if (!parent) return []; const x1 = parent.x + 210; const y1 = parent.y + 34; const x2 = item.x; const y2 = item.y + 34; const middle = (x1 + x2) / 2; return [{ id: `${parent.node.id}-${item.node.id}`, path: `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}` }] })
})

const nodePosition = (id: string) => {
  const item = mapItems.value.find(entry => entry.node.id === id)
  return item ? { x: item.x, y: item.y } : { x: 0, y: 0 }
}
const writeNodePosition = (id: string, x: number, y: number) => {
  const node = locate(id)?.node
  if (!node) return
  node.attributes._longeditX = String(Math.round(x))
  node.attributes._longeditY = String(Math.round(y))
}
const applyLayout = () => mutate(() => {
  visitNodes(node => { delete node.attributes._longeditX; delete node.attributes._longeditY })
  if (document.value) document.value.metadata._longeditLayout = layoutMode.value
  resetViewport()
  void nextTick(fitMap)
})
const changeZoom = (factor: number, clientX?: number, clientY?: number) => {
  const panel = mapPanel.value
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left
  const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top
  const next = Math.max(0.3, Math.min(2.5, mapZoom.value * factor))
  const worldX = (anchorX - mapPan.value.x) / mapZoom.value
  const worldY = (anchorY - mapPan.value.y) / mapZoom.value
  mapPan.value = { x: anchorX - worldX * next, y: anchorY - worldY * next }
  mapZoom.value = next
}
const onMapWheel = (event: WheelEvent) => changeZoom(event.deltaY > 0 ? 0.9 : 1.1, event.clientX, event.clientY)
const resetViewport = () => { mapZoom.value = 1; mapPan.value = { x: 0, y: 0 } }
const fitMap = () => {
  const panel = mapPanel.value
  if (!panel || !mapItems.value.length) return resetViewport()
  const minX = Math.min(...mapItems.value.map(item => item.x))
  const minY = Math.min(...mapItems.value.map(item => item.y))
  const maxX = Math.max(...mapItems.value.map(item => item.x + 210))
  const maxY = Math.max(...mapItems.value.map(item => item.y + 82))
  const zoom = Math.max(0.3, Math.min(1.25, Math.min((panel.clientWidth - 80) / (maxX - minX), (panel.clientHeight - 80) / (maxY - minY))))
  mapZoom.value = zoom
  mapPan.value = {
    x: (panel.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (panel.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom,
  }
}
const rememberMindMapViewState = (filePath = path.value) => {
  if (!filePath || loading.value) return
  rememberWorkspaceViewState(filePath, {
    scrollTop: 0,
    scrollLeft: 0,
    zoom: mapZoom.value,
    panX: mapPan.value.x,
    panY: mapPan.value.y,
    section: layoutMode.value,
    mode: viewMode.value,
    sidebarTab: mapTheme.value,
    selection: selectedIds.value.join(','),
  })
}
const toggleNodeSelection = (id: string, additive: boolean) => {
  if (!additive) return selectOnly(id)
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = [...next]
  selectedId.value = next.has(id) ? id : selectedIds.value[selectedIds.value.length - 1] || ''
}
const startNodePointer = (event: PointerEvent, id: string) => {
  if (event.button !== 0) return
  if (event.ctrlKey || event.metaKey) toggleNodeSelection(id, true)
  else if (!selectedIds.value.includes(id)) selectOnly(id)
  if (!selectedIds.value.includes(id)) return
  draggedId.value = id
  nodeDragSnapshot = snapshot()
  nodeDragMoved = false
  nodeDragOrigin = {
    clientX: event.clientX,
    clientY: event.clientY,
    positions: new Map(selectedIds.value.map(nodeId => [nodeId, nodePosition(nodeId)])),
  }
  window.addEventListener('pointermove', moveNodePointer)
  window.addEventListener('pointerup', endNodePointer, { once: true })
}
const moveNodePointer = (event: PointerEvent) => {
  if (!nodeDragOrigin) return
  const dx = (event.clientX - nodeDragOrigin.clientX) / mapZoom.value
  const dy = (event.clientY - nodeDragOrigin.clientY) / mapZoom.value
  if (!nodeDragMoved && Math.hypot(dx, dy) < 3) return
  nodeDragMoved = true
  nodeDragOrigin.positions.forEach((position, id) => writeNodePosition(id, position.x + dx, position.y + dy))
}
const endNodePointer = () => {
  window.removeEventListener('pointermove', moveNodePointer)
  if (nodeDragOrigin && nodeDragMoved && snapshot() !== nodeDragSnapshot) pushUndo(nodeDragSnapshot)
  nodeDragOrigin = null
  nodeDragMoved = false
  draggedId.value = ''
}
const panelPoint = (event: PointerEvent) => {
  const rect = mapPanel.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}
const startCanvasPointer = (event: PointerEvent) => {
  if (!mapPanel.value) return
  if (event.button !== 0 && event.button !== 1) return
  const point = panelPoint(event)
  if (event.button === 1 || spacePressed || !event.shiftKey) {
    panOrigin = { clientX: event.clientX, clientY: event.clientY, x: mapPan.value.x, y: mapPan.value.y }
    window.addEventListener('pointermove', moveCanvasPan)
    window.addEventListener('pointerup', endCanvasPointer, { once: true })
    if (!event.shiftKey && event.button === 0) selectOnly('')
    return
  }
  selectionBox.value = { startX: point.x, startY: point.y, x: point.x, y: point.y }
  window.addEventListener('pointermove', moveSelectionBox)
  window.addEventListener('pointerup', endSelectionBox, { once: true })
}

const closeContextMenu = () => { contextMenu.show = false }
const showContextMenu = (event: MouseEvent, target: 'background' | 'node', nodeId = '') => {
  contextMenu.show = false
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.target = target
  contextMenu.nodeId = nodeId
  void nextTick(() => { contextMenu.show = true })
}
const openMapContextMenu = (event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('.map-node')) return
  selectOnly('')
  showContextMenu(event, 'background')
}
const openNodeContextMenu = (node: OpmlNode, event: MouseEvent) => {
  selectOnly(node.id)
  showContextMenu(event, 'node', node.id)
}
const handleContextMenuAction = (key: string) => {
  closeContextMenu()
  if (contextMenu.nodeId) selectOnly(contextMenu.nodeId)
  if (key === 'add-root') addRoot()
  else if (key === 'fit') fitMap()
  else if (key === 'reset-view') resetViewport()
  else if (key === 'apply-layout') applyLayout()
  else if (key === 'expand-all') setAllCollapsed(false)
  else if (key === 'collapse-all') setAllCollapsed(true)
  else if (key === 'rename' && contextMenu.nodeId) beginNodeRename(contextMenu.nodeId)
  else if (key === 'add-child') addChild()
  else if (key === 'add-sibling') addSibling()
  else if (key === 'indent') indentNode()
  else if (key === 'outdent') outdentNode()
  else if (key === 'toggle-collapse' && selectedNode.value) toggleCollapsed(selectedNode.value)
  else if (key === 'delete') removeSelected()
}
const moveCanvasPan = (event: PointerEvent) => {
  if (!panOrigin) return
  mapPan.value = { x: panOrigin.x + event.clientX - panOrigin.clientX, y: panOrigin.y + event.clientY - panOrigin.clientY }
}
const endCanvasPointer = () => { window.removeEventListener('pointermove', moveCanvasPan); panOrigin = null }
const moveSelectionBox = (event: PointerEvent) => {
  if (!selectionBox.value || !mapPanel.value) return
  const point = panelPoint(event)
  selectionBox.value = { ...selectionBox.value, x: point.x, y: point.y }
}
const selectionBoxStyle = computed(() => {
  const box = selectionBox.value
  if (!box) return {}
  return { left: `${Math.min(box.startX, box.x)}px`, top: `${Math.min(box.startY, box.y)}px`, width: `${Math.abs(box.x - box.startX)}px`, height: `${Math.abs(box.y - box.startY)}px` }
})
const endSelectionBox = () => {
  window.removeEventListener('pointermove', moveSelectionBox)
  const box = selectionBox.value
  if (!box) return
  const left = (Math.min(box.startX, box.x) - mapPan.value.x) / mapZoom.value
  const top = (Math.min(box.startY, box.y) - mapPan.value.y) / mapZoom.value
  const right = (Math.max(box.startX, box.x) - mapPan.value.x) / mapZoom.value
  const bottom = (Math.max(box.startY, box.y) - mapPan.value.y) / mapZoom.value
  selectedIds.value = mapItems.value.filter(item => item.x + 210 >= left && item.x <= right && item.y + 82 >= top && item.y <= bottom).map(item => item.node.id)
  selectedId.value = selectedIds.value[selectedIds.value.length - 1] || ''
  selectionBox.value = null
}
const moveSelected = (dx: number, dy: number) => {
  if (!selectedIds.value.length) return
  mutate(() => selectedIds.value.forEach(id => { const position = nodePosition(id); writeNodePosition(id, position.x + dx, position.y + dy) }))
}

const undo = () => { const previous = undoStack.value.pop(); if (!previous) return; redoStack.value.push(snapshot()); restore(previous) }
const redo = () => { const next = redoStack.value.pop(); if (!next) return; undoStack.value.push(snapshot()); restore(next) }
const errorText = (cause: unknown) => {
  if (cause && typeof cause === 'object' && 'message' in cause) return String((cause as { message: unknown }).message)
  return String(cause).replace(/^Error:\s*/, '')
}
const save = async () => {
  if (!document.value || !dirty.value || saving.value || (!isExternal.value && !store.libraryPath)) return !dirty.value
  if (isExternal.value) {
    const confirmed = await new Promise<boolean>(resolve => dialog.warning({
      title: '覆盖外部 OPML 源文件？',
      content: '保存将覆盖当前外部 .opml 文件，并按 OPML 2.0 规范化 XML 排版。受支持的头部元数据、节点属性、备注、折叠状态和布局坐标会保留。',
      positiveText: '确认保存',
      negativeText: '取消',
      closable: false,
      maskClosable: false,
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
    }))
    if (!confirmed) return false
  }
  saving.value = true; saveError.value = ''
  try {
    const result = await invoke<OpmlFile>(isExternal.value ? 'write_external_opml_file' : 'write_opml_file', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: path.value,
      expectedSignature: signature.value,
      document: document.value,
    })
    signature.value = result.signature; document.value = result.document; dirty.value = false; return true
  } catch (cause: any) {
    saveError.value = errorText(cause)
    if (isExternal.value && cause?.code === 'external-modified') dialog.warning({
      title: '外部 OPML 已发生变化',
      content: '源文件在编辑期间被其他程序修改。Long编辑没有覆盖这些变化，请重新打开后再编辑。',
      positiveText: '知道了',
    })
    else message.error(`保存失败：${saveError.value}`)
    return false
  }
  finally { saving.value = false }
}
const projectToCanvas = async () => {
  if (isExternal.value) return void message.info('外部 OPML 需要先加入知识库，才能投影到 Canvas')
  if (dirty.value) return void message.warning('请先点击保存，再将当前版本投影到 Canvas')
  try { const canvas = await invoke<string>('create_canvas_from_opml', { libraryRoot: store.libraryPath, path: path.value }); await openManagedFile(router, canvas) }
  catch (cause) { message.error(`Canvas 投影失败：${String(cause)}`) }
}
const load = async () => {
  loading.value = true; error.value = ''; saveError.value = ''
  try {
    if (!/\.opml$/i.test(path.value)) throw new Error('OPML 路径无效')
    if (!isExternal.value && !store.libraryPath) throw new Error('知识库尚未配置')
    const result = await invoke<OpmlFile>(isExternal.value ? 'read_external_opml_file' : 'read_opml_file', {
      ...(isExternal.value ? {} : { libraryRoot: store.libraryPath }),
      path: path.value,
    })
    signature.value = result.signature; document.value = result.document; dirty.value = false; undoStack.value = []; redoStack.value = []
    const savedLayout = result.document.metadata._longeditLayout as LayoutMode
    if (['tree', 'organization', 'radial', 'timeline'].includes(savedLayout)) layoutMode.value = savedLayout
    const requestedNode = typeof route.query.node === 'string' ? route.query.node : ''
    selectedId.value = requestedNode && locate(requestedNode) ? requestedNode : ''
    selectedIds.value = selectedId.value ? [selectedId.value] : []
    ensureSelection()
    const viewState = recallWorkspaceViewState(path.value)
    if (!requestedNode && viewState) {
      if (['tree', 'organization', 'radial', 'timeline'].includes(viewState.section || '')) layoutMode.value = viewState.section as LayoutMode
      if (viewState.mode === 'map' || viewState.mode === 'outline') viewMode.value = viewState.mode
      if (['professional', 'colorful', 'focus'].includes(viewState.sidebarTab || '')) mapTheme.value = viewState.sidebarTab as MapTheme
      mapZoom.value = viewState.zoom || 1
      mapPan.value = { x: viewState.panX || 0, y: viewState.panY || 0 }
      selectedIds.value = (viewState.selection || '').split(',').filter(id => Boolean(locate(id)))
      selectedId.value = selectedIds.value[0] || selectedId.value
    } else void nextTick(fitMap)
  }
  catch (cause) { document.value = null; error.value = errorText(cause) }
  finally { loading.value = false }
}
const handleKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  const editing = target?.matches('input, textarea, select, [contenteditable="true"]')
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
  if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
  if (editing) return
  if (event.code === 'Space') { spacePressed = true; event.preventDefault() }
  if (viewMode.value === 'map' && command && event.key.toLowerCase() === 'a') { event.preventDefault(); selectedIds.value = mapItems.value.map(item => item.node.id); selectedId.value = selectedIds.value[selectedIds.value.length - 1] || '' }
  if (viewMode.value === 'map' && event.key === 'Enter' && selectedId.value) { event.preventDefault(); beginNodeRename(selectedId.value) }
  if (viewMode.value === 'map' && event.key === 'Escape') { selectionBox.value = null; selectOnly('') }
  const distance = event.shiftKey ? 24 : 8
  if (viewMode.value === 'map' && event.key === 'ArrowLeft') { event.preventDefault(); moveSelected(-distance, 0) }
  if (viewMode.value === 'map' && event.key === 'ArrowRight') { event.preventDefault(); moveSelected(distance, 0) }
  if (viewMode.value === 'map' && event.key === 'ArrowUp') { event.preventDefault(); moveSelected(0, -distance) }
  if (viewMode.value === 'map' && event.key === 'ArrowDown') { event.preventDefault(); moveSelected(0, distance) }
}
const handleKeyup = (event: KeyboardEvent) => { if (event.code === 'Space') spacePressed = false }
const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
const mayLeave = () => {
  if (!dirty.value) return Promise.resolve(true)
  return new Promise<boolean>(resolve => dialog.warning({
    title: '思维导图还有未保存修改',
    content: '离开后会丢失当前草稿，源文件不会被修改。',
    positiveText: '放弃修改并离开',
    negativeText: '继续编辑',
    closable: false,
    maskClosable: false,
    onPositiveClick: () => resolve(true),
    onNegativeClick: () => resolve(false),
  }))
}
watch(viewMode, value => localStorage.setItem('opml-view-mode', value))
watch(layoutMode, value => localStorage.setItem('opml-layout-mode', value))
watch(mapTheme, value => localStorage.setItem('opml-map-theme', value))
watch([mapZoom, mapPan, layoutMode, mapTheme, viewMode, selectedIds], () => rememberMindMapViewState(), { deep: true })
watch([path, isExternal, () => route.query.node], () => { void load() })
onMounted(() => { window.addEventListener('keydown', handleKeydown); window.addEventListener('keyup', handleKeyup); window.addEventListener('beforeunload', beforeUnload); void load() })
onBeforeUnmount(() => {
  rememberMindMapViewState()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('pointermove', moveNodePointer)
  window.removeEventListener('pointermove', moveCanvasPan)
  window.removeEventListener('pointermove', moveSelectionBox)
})
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => (to.query.path === from.query.path && to.query.external === from.query.external) || mayLeave())
</script>

<style scoped>
.mindmap-page{height:100%;container-type:inline-size;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;color:var(--theme-text);background:var(--theme-bg)}
.mindmap-header{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:9px 16px;border-bottom:var(--theme-border);background:var(--theme-surface)}.header-main,.header-actions,.mindmap-toolbar,.view-switch,.inspector-actions{display:flex;align-items:center;gap:8px}.header-main>div{display:flex;min-width:0;flex-direction:column}.header-main span{color:var(--theme-text-secondary);font-size:11px}.title-input{width:min(420px,40vw);border:0;outline:0;color:var(--theme-text);background:transparent;font-size:17px;font-weight:750}.icon-button{width:36px}.header-actions button,.mindmap-toolbar button,.icon-button,.state button,.inspector button{height:34px;padding:0 11px;border:var(--theme-border);border-radius:8px;color:var(--theme-text);background:var(--theme-card);cursor:pointer}.header-actions button{display:flex;align-items:center;gap:5px}.header-actions .primary{color:#fff;border-color:var(--theme-primary);background:var(--theme-primary)}button:disabled{opacity:.4;cursor:default}
.mindmap-toolbar{min-height:48px;gap:6px;padding:7px 10px;overflow-x:auto;border-bottom:var(--theme-border);background:var(--theme-surface)}.mindmap-toolbar>*{flex:none}.mindmap-toolbar button{padding-inline:9px;white-space:nowrap}.mindmap-toolbar button.active{color:#fff;border-color:var(--theme-primary);background:var(--theme-primary)}.mindmap-toolbar button.danger{color:#d64545}.mindmap-toolbar .icon-tool{width:32px;padding:0;display:grid;place-items:center}.mindmap-toolbar .zoom-readout{min-width:50px;padding-inline:4px;font-variant-numeric:tabular-nums}.divider{height:24px;border-left:var(--theme-border)}.tool-select{height:34px;display:flex;align-items:center;gap:4px;padding-left:7px;border:var(--theme-border);border-radius:8px;color:var(--theme-text-secondary);background:var(--theme-card);font-size:var(--text-compact);white-space:nowrap}.tool-select select{width:67px;height:32px;padding:0 18px 0 2px;border:0;outline:0;color:var(--theme-text);background:transparent}.search-box{min-width:168px;margin-left:auto;display:flex;align-items:center;gap:6px;padding:0 8px;border:var(--theme-border);border-radius:8px;background:var(--theme-card)}.search-box input{width:132px;height:30px;border:0;outline:0;color:var(--theme-text);background:transparent}
.mindmap-main{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 290px;overflow:hidden}.outline-panel,.map-panel{position:relative;overflow:auto;background:color-mix(in srgb,var(--theme-bg) 96%,var(--theme-primary))}.outline-panel{padding:12px}.outline-head,.outline-row{display:grid;grid-template-columns:minmax(0,1fr) 50px;align-items:center}.outline-head{height:30px;padding:0 14px;color:var(--theme-text-secondary);font-size:11px}.outline-row{position:relative;min-width:560px;height:42px;margin:2px 0;padding:0 10px 0 calc(12px + var(--depth)*26px);border:1px solid transparent;border-radius:8px;background:var(--theme-surface)}.outline-row.selected{border-color:var(--theme-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--theme-primary) 14%,transparent)}.outline-row.match{background:color-mix(in srgb,var(--theme-surface) 82%,#ffe16b)}.outline-row.dragging,.map-node.dragging{opacity:.4}.outline-row input{min-width:0;height:32px;padding-left:28px;border:0;outline:0;color:var(--theme-text);background:transparent}.outline-row small{text-align:center;color:var(--theme-text-secondary)}.collapse{position:absolute;left:calc(10px + var(--depth)*26px);width:24px;height:24px;border:0;background:transparent;color:var(--theme-text-secondary);transform:rotate(90deg);transition:transform .15s}.outline-row.collapsed .collapse{transform:rotate(0)}.outline-row .collapse.hidden{visibility:hidden}.outline-row .quick-add{position:absolute;right:52px;width:25px;height:25px;border:0;border-radius:6px;opacity:0}.outline-row:hover .quick-add{opacity:1}.tree-lines{position:absolute;left:calc(20px + var(--depth)*26px);top:-4px;bottom:-4px;border-left:1px solid color-mix(in srgb,var(--theme-primary) 30%,transparent);pointer-events:none}
.map-panel{padding:0;overflow:hidden;outline:0;cursor:grab;touch-action:none;background-color:color-mix(in srgb,var(--theme-bg) 94%,var(--theme-primary));background-image:radial-gradient(circle,color-mix(in srgb,var(--theme-text-secondary) 24%,transparent) 1px,transparent 1px);background-size:22px 22px}.map-panel:active{cursor:grabbing}.map-canvas{position:relative;transform-origin:0 0;will-change:transform}.map-edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.map-edges path{fill:none;stroke:color-mix(in srgb,var(--theme-primary) 62%,var(--theme-text-secondary));stroke-width:2.5}.map-node{position:absolute;width:210px;min-height:72px;box-sizing:border-box;padding:13px 15px;border:2px solid color-mix(in srgb,var(--theme-primary) 42%,var(--theme-border-color,#aaa));border-radius:8px;background:var(--theme-surface);box-shadow:0 8px 22px rgba(0,0,0,.1);cursor:grab;user-select:none;transition:border-color .12s,box-shadow .12s}.map-node:active{cursor:grabbing}.map-node.root{border-color:var(--theme-primary);background:color-mix(in srgb,var(--theme-surface) 84%,var(--theme-primary))}.map-node.selected{border-color:var(--theme-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--theme-primary) 20%,transparent),0 11px 26px rgba(0,0,0,.14)}.map-node.match{outline:3px solid #f0bd29}.map-node strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-node p{display:-webkit-box;margin:5px 0;color:var(--theme-text-secondary);font-size:11px;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.map-node small{color:var(--theme-text-secondary);font-size:var(--text-compact)}.map-title-editor{width:100%;height:27px;padding:0 5px;box-sizing:border-box;border:1px solid var(--theme-primary);border-radius:5px;outline:0;color:var(--theme-text);background:var(--theme-card);font:700 13px var(--font-sans)}.map-collapse{position:absolute;right:-11px;top:23px;width:22px;height:22px;border:0;border-radius:50%;color:#fff;background:var(--theme-primary);cursor:pointer;font-size:var(--text-compact)}.selection-box{position:absolute;z-index:20;border:1px solid var(--theme-primary);background:color-mix(in srgb,var(--theme-primary) 14%,transparent);pointer-events:none}.canvas-help{position:absolute;left:14px;bottom:12px;display:flex;align-items:center;gap:6px;padding:7px 9px;border:var(--theme-border);border-radius:7px;color:var(--theme-text-secondary);background:color-mix(in srgb,var(--theme-surface) 90%,transparent);box-shadow:var(--workspace-shadow-sm);font-size:var(--text-compact);pointer-events:none}.map-theme-colorful .map-node:nth-of-type(5n+1){border-color:#3b82f6}.map-theme-colorful .map-node:nth-of-type(5n+2){border-color:#10b981}.map-theme-colorful .map-node:nth-of-type(5n+3){border-color:#f59e0b}.map-theme-colorful .map-node:nth-of-type(5n+4){border-color:#ec4899}.map-theme-colorful .map-node:nth-of-type(5n){border-color:#8b5cf6}.map-theme-focus{background-image:none;background-color:var(--theme-bg)}.map-theme-focus .map-node{box-shadow:none}.map-theme-professional .map-node{border-left-width:5px}
.inspector{min-width:0;padding:16px;border-left:var(--theme-border);overflow:auto;background:var(--theme-surface)}.inspector-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.inspector code{max-width:130px;overflow:hidden;color:var(--theme-text-secondary);font-size: var(--text-compact);text-overflow:ellipsis}.inspector label{display:flex;flex-direction:column;gap:6px;margin:12px 0;color:var(--theme-text-secondary);font-size:11px}.inspector input,.inspector textarea{box-sizing:border-box;width:100%;padding:9px;border:var(--theme-border);border-radius:8px;outline:0;color:var(--theme-text);background:var(--theme-card);font:inherit;resize:vertical}.inspector label.check{flex-direction:row;align-items:center}.inspector .check input{width:auto}.inspector-actions button{flex:1}.drag-hint{margin-top:18px;padding:10px;border-radius:8px;color:var(--theme-text-secondary);background:color-mix(in srgb,var(--theme-card) 85%,var(--theme-primary));font-size: var(--text-compact);line-height:1.6}.inspector-empty,.state,.empty-search{height:100%;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--theme-text-secondary)}.inspector-empty{flex-direction:column}.state{grid-column:1/-1;flex-direction:column}.state.error strong{color:#d64545}.loader{width:28px;height:28px;border:3px solid color-mix(in srgb,var(--theme-primary) 20%,transparent);border-top-color:var(--theme-primary);border-radius:50%;animation:spin .8s linear infinite}.empty-search{min-height:300px}
.statusbar{min-height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-top:var(--theme-border);color:var(--theme-text-secondary);background:var(--theme-surface);font-size: var(--text-compact)}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:850px){.mindmap-main{grid-template-columns:minmax(0,1fr)}.inspector{display:none}.header-main span,.statusbar span:last-child{display:none}.search-box{margin-left:0}.mindmap-toolbar{padding-inline:8px}}
@container(max-width:650px){.mindmap-main{grid-template-columns:minmax(0,1fr)}.inspector{display:none}.mindmap-header{gap:8px;padding-inline:10px}.header-main{min-width:0;flex:1}.title-input{width:100%;min-width:0}.header-actions{flex:none}.header-actions button{width:36px;padding:0;justify-content:center;font-size:0}.header-main span,.statusbar span:last-child{display:none}.search-box{margin-left:0}.mindmap-toolbar{padding-inline:8px}}
</style>
