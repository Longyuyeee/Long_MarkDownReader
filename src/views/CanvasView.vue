<template>
  <div class="canvas-page">
    <header class="canvas-header">
      <div class="header-main">
        <button class="icon-button" title="返回知识库" @click="router.push('/library')">←</button>
        <div>
          <div class="canvas-title">{{ fileName }}</div>
          <div class="canvas-subtitle">开放 JSON Canvas · {{ visibleNodes.length }}/{{ document.nodes.length }} 个节点可见 · 当前渲染 {{ renderedNodes.length }} 节点 / {{ renderedEdges.length }} 连线<template v-if="measuredFps"> · {{ measuredFps }} FPS</template></div>
        </div>
      </div>
      <div class="save-state" :class="saveState" aria-live="polite">
        <span class="state-dot"></span>{{ saveStateLabel }}
      </div>
    </header>

    <div class="canvas-toolbar" role="toolbar" aria-label="Canvas 工具栏">
      <button :class="{ active: tool === 'select' }" :aria-pressed="tool === 'select'" @click="setTool('select')">选择</button>
      <button :disabled="undoStack.length === 0" title="撤销 Ctrl+Z" @click="undo">↶</button>
      <button :disabled="redoStack.length === 0" title="重做 Ctrl+Shift+Z" @click="redo">↷</button>
      <span class="toolbar-divider"></span>
      <button @click="addTextNode">＋ 文本卡片</button>
      <button @click="addFileNode">＋ 文件</button>
      <button @click="addChartNode">＋ 图表</button>
      <button @click="addMermaidNode">＋ Mermaid</button>
      <button @click="addLinkNode">＋ 链接</button>
      <button @click="addGroupNode">＋ 分组</button>
      <button :class="{ active: tool === 'connect' }" :aria-pressed="tool === 'connect'" @click="setTool('connect')">
        {{ connectingFrom ? '选择目标节点' : '连线' }}
      </button>
      <span class="toolbar-divider"></span>
      <button :disabled="selectionCount === 0 && !selectedEdgeId" @click="removeSelection">删除</button>
      <button :disabled="selectionCount === 0" title="复制节点及内部连线 Ctrl+C" @click="copySelection()">复制</button>
      <button :disabled="selectionCount === 0" title="剪切节点及内部连线 Ctrl+X" @click="cutSelection">剪切</button>
      <button title="粘贴到当前视口 Ctrl+V" @click="pasteSelection">粘贴</button>
      <template v-if="selectionCount >= 2">
        <button @click="alignSelection('left')">左对齐</button>
        <button @click="alignSelection('top')">顶对齐</button>
        <button @click="distributeSelection('horizontal')">横向分布</button>
        <button @click="distributeSelection('vertical')">纵向分布</button>
      </template>
      <button
        :class="{ active: snapEnabled }"
        :aria-pressed="snapEnabled"
        title="拖拽吸附到其他节点的边缘或中心；按住 Alt 临时停用"
        @click="snapEnabled = !snapEnabled"
      >吸附</button>
      <template v-if="selectedNode">
        <button :disabled="!nodeHasChildren(selectedNode.id)" title="只整理当前节点的可见子树，根节点和画布其他区域保持不动" @click="layoutSelectedBranch">整理分支</button>
        <button v-if="nodeHasChildren(selectedNode.id)" @click="toggleBranchCollapse(selectedNode.id)">
          {{ collapsedNodeIds.includes(selectedNode.id) ? '展开分支' : '折叠分支' }}
        </button>
      </template>
      <button v-if="layoutBackupCount" :title="`恢复 ${layoutBackupCount} 个节点在自动布局前的位置`" @click="restoreManualPositions">恢复手工位置</button>
      <div v-if="selectedNode" class="color-tools" title="节点颜色">
        <button
          v-for="color in colors"
          :key="color.value"
          class="color-chip"
          :class="{ active: selectedNode.color === color.value }"
          :style="{ background: color.css }"
          :aria-label="color.label"
          @click="setNodeColor(color.value)"
        ></button>
      </div>
      <span class="toolbar-spacer"></span>
      <button title="缩小画布" aria-label="缩小画布" @click="changeZoom(-0.1)">−</button>
      <button title="恢复画布视图" :aria-label="`恢复画布视图，当前缩放 ${Math.round(zoom * 100)}%`" @click="resetView">{{ Math.round(zoom * 100) }}%</button>
      <button title="放大画布" aria-label="放大画布" @click="changeZoom(0.1)">＋</button>
      <button @click="fitToContent">适应内容</button>
      <button class="primary" :disabled="saveState === 'saving' || saveState === 'saved'" aria-live="polite" @click="saveCanvas">
        {{ saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存' }}
      </button>
    </div>

    <main
      ref="viewportRef"
      class="canvas-viewport"
      :class="{ connecting: tool === 'connect', panning: isPanning }"
      @mousedown="startPan"
      @wheel.prevent="handleWheel"
      @dblclick="handleBackgroundDoubleClick"
    >
      <div class="canvas-grid" :style="gridStyle"></div>
      <div class="canvas-world" :style="worldStyle">
        <svg class="edge-layer" aria-label="Canvas 连线">
          <defs>
            <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <g
            v-for="edge in renderedEdges"
            :key="edge.id"
            class="canvas-edge"
            :class="{ selected: selectedEdgeId === edge.id }"
            :style="{ color: edge.renderColor }"
            @mousedown.stop
            @click.stop="selectEdge(edge.id)"
          >
            <path class="edge-hit" :d="edge.path" />
            <path
              class="edge-line"
              :d="edge.path"
              :marker-start="edge.fromEnd === 'arrow' ? 'url(#canvas-arrow)' : undefined"
              :marker-end="edge.toEnd !== 'none' ? 'url(#canvas-arrow)' : undefined"
            />
            <text v-if="edge.label" :x="edge.labelX" :y="edge.labelY">{{ edge.label }}</text>
            <text v-if="edge.relationType" class="edge-relation-type" :x="edge.labelX" :y="edge.labelY + (edge.label ? 16 : 4)">
              {{ relationTypeLabel(edge.relationType) }}
            </text>
          </g>
        </svg>

        <div
          v-for="(guide, index) in alignmentGuides"
          :key="`${guide.axis}-${guide.position}-${index}`"
          class="alignment-guide"
          :class="`guide-${guide.axis}`"
          :style="alignmentGuideStyle(guide)"
        >
          <span>{{ guide.kind }}</span>
        </div>

        <article
          v-for="node in renderedNodes"
          :key="node.id"
          class="canvas-node"
          :class="[`node-${node.type}`, { selected: selectedNodeIds.includes(node.id), collapsed: collapsedNodeIds.includes(node.id), 'connect-source': connectingFrom === node.id, 'chart-node': isChartNode(node), 'diagram-node': isMermaidNode(node) }]"
          :style="nodeStyle(node)"
          @mousedown.stop="startNodeDrag(node, $event)"
          @click.stop
          @dblclick.stop="openNode(node)"
        >
          <template v-if="node.type === 'text'">
            <textarea
              v-model="node.text"
              aria-label="文本卡片内容"
              placeholder="输入 Markdown 文本…"
              @mousedown.stop
              @input="markDirty"
              @focus="beginTextEdit(node)"
              @blur="endTextEdit"
            ></textarea>
          </template>
          <template v-else-if="node.type === 'file'">
            <TableChartEmbed
              v-if="isChartNode(node)"
              compact
              :library-root="store.libraryPath"
              :source="node.file!"
              :view-id="chartViewId(node)"
              :host-path="canvasPath"
              @open="openEmbeddedChart"
            />
            <MermaidDiagramEmbed
              v-else-if="isMermaidNode(node)"
              compact
              :library-root="store.libraryPath"
              :source="node.file!"
              :host-path="canvasPath"
              :dark="isActiveThemeDark(store.theme)"
              @open="openEmbeddedDiagram"
            />
            <template v-else>
              <div class="node-kind">知识库文件</div>
              <div class="node-icon">▤</div>
              <div class="node-label">{{ node.file || '未指定文件' }}</div>
              <div class="node-hint">双击打开原文档</div>
            </template>
          </template>
          <template v-else-if="node.type === 'link'">
            <div class="node-kind">外部链接</div>
            <div class="node-icon">↗</div>
            <div class="node-label">{{ node.url || '未指定链接' }}</div>
            <div class="node-hint">双击在浏览器打开</div>
          </template>
          <template v-else>
            <input
              v-model="node.label"
              aria-label="分组名称"
              placeholder="分组名称"
              @mousedown.stop
              @input="markDirty"
              @focus="beginTextEdit(node)"
              @blur="endTextEdit"
            />
          </template>
          <button
            v-if="nodeHasChildren(node.id)"
            class="branch-toggle"
            :class="{ collapsed: collapsedNodeIds.includes(node.id) }"
            :title="collapsedNodeIds.includes(node.id) ? `展开 ${branchDescendantCount(node.id)} 个分支节点` : `折叠 ${branchDescendantCount(node.id)} 个分支节点`"
            @mousedown.stop
            @click.stop="toggleBranchCollapse(node.id)"
          >{{ collapsedNodeIds.includes(node.id) ? `+${branchDescendantCount(node.id)}` : '−' }}</button>
          <button
            v-if="selectedNodeId === node.id && selectionCount === 1"
            class="resize-handle"
            aria-label="调整节点大小"
            @mousedown.stop="startResize(node, $event)"
          ></button>
        </article>
      </div>

      <div v-if="selectionBox" class="selection-box" :style="selectionBoxStyle"></div>

      <aside
        v-if="selectedEdge"
        class="edge-inspector"
        aria-label="连线属性"
        @mousedown.stop
        @dblclick.stop
        @wheel.stop
      >
        <div class="inspector-header">
          <div><strong>连线属性</strong><span>{{ edgeNodeTitle(selectedEdge.fromNode) }} → {{ edgeNodeTitle(selectedEdge.toNode) }}</span></div>
          <button aria-label="关闭连线属性" @click="selectedEdgeId = null">×</button>
        </div>

        <label class="inspector-field">
          <span>标签</span>
          <input v-model="selectedEdge.label" maxlength="160" placeholder="例如：支持、依赖于…" @focus="beginEdgeEdit" @input="markDirty" @blur="endEdgeEdit" />
        </label>

        <label class="inspector-field">
          <span>关系类型</span>
          <input v-model="selectedEdge.relationType" list="canvas-relation-types" maxlength="80" placeholder="links-to" @focus="beginEdgeEdit" @input="markDirty" @blur="endEdgeEdit" />
          <datalist id="canvas-relation-types">
            <option v-for="type in relationTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
          </datalist>
        </label>

        <label class="inspector-field">
          <span>方向</span>
          <select :value="selectedEdgeDirection" @change="setEdgeDirection(($event.target as HTMLSelectElement).value as EdgeDirection)">
            <option value="forward">正向 →</option><option value="reverse">反向 ←</option><option value="both">双向 ↔</option><option value="none">无方向 —</option>
          </select>
        </label>

        <div class="side-fields">
          <label class="inspector-field">
            <span>起点端口</span>
            <select :value="selectedEdge.fromSide || ''" @change="setEdgeProperty('fromSide', ($event.target as HTMLSelectElement).value || undefined)">
              <option value="">自动</option><option value="top">上</option><option value="right">右</option><option value="bottom">下</option><option value="left">左</option>
            </select>
          </label>
          <label class="inspector-field">
            <span>终点端口</span>
            <select :value="selectedEdge.toSide || ''" @change="setEdgeProperty('toSide', ($event.target as HTMLSelectElement).value || undefined)">
              <option value="">自动</option><option value="top">上</option><option value="right">右</option><option value="bottom">下</option><option value="left">左</option>
            </select>
          </label>
        </div>

        <div class="inspector-field">
          <span>颜色</span>
          <div class="edge-color-tools">
            <button :class="{ active: !selectedEdge.color }" title="默认颜色" @click="setEdgeProperty('color', undefined)">×</button>
            <button v-for="color in colors" :key="color.value" class="edge-color-chip" :class="{ active: selectedEdge.color === color.value }" :style="{ background: color.css }" :aria-label="color.label" @click="setEdgeProperty('color', color.value)"></button>
            <label class="custom-edge-color" title="自定义颜色">
              <input type="color" :value="selectedEdgeHexColor" @change="setEdgeProperty('color', ($event.target as HTMLInputElement).value.toUpperCase())" />
            </label>
          </div>
        </div>
      </aside>

      <div v-if="loading" class="canvas-overlay">正在读取画布…</div>
      <div v-else-if="loadError" class="canvas-overlay error">
        <strong>无法打开画布</strong>
        <span>{{ loadError }}</span>
        <button @click="loadCanvas">重试</button>
      </div>
      <div v-else-if="document.nodes.length === 0" class="empty-canvas">
        <div class="empty-icon">◇</div>
        <h2>这是一张空白画布</h2>
        <p>双击空白区域创建卡片，或从上方工具栏添加文件、链接和分组。</p>
        <button @click.stop="addTextNode">创建第一张卡片</button>
      </div>
    </main>

    <footer class="canvas-statusbar" aria-live="polite">
      <span>{{ hiddenNodeIds.size ? `已折叠 ${hiddenNodeIds.size} 个分支节点` : selectionCount > 1 ? `已选择 ${selectionCount} 个节点` : tool === 'connect' ? '依次点击两个节点建立关系' : '拖拽卡片组织结构 · Shift+拖拽框选' }}</span>
      <span>Ctrl+C/X/V 复制剪切粘贴 · 方向键微调 · Alt 拖拽暂停吸附 · Ctrl+S 保存</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../store/app'
import { isActiveThemeDark } from '../config/themePresets'
import { findFileFormat, opensInLibraryShell, routeForFile } from '../config/fileFormats'
import { openManagedFile } from '../services/fileNavigation'
import TableChartEmbed from '../components/TableChartEmbed.vue'
import MermaidDiagramEmbed from '../components/MermaidDiagramEmbed.vue'

type CanvasNodeType = 'text' | 'file' | 'link' | 'group'
type Tool = 'select' | 'connect'

interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
  [key: string]: unknown
}

interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  label?: string
  color?: string
  relationType?: string
  [key: string]: unknown
}

interface CanvasDocument { nodes: CanvasNode[]; edges: CanvasEdge[]; [key: string]: unknown }
interface CanvasClipboardPayload { nodes: CanvasNode[]; edges: CanvasEdge[]; sourceCanvas?: string }
interface RenderedCanvasEdge extends CanvasEdge { path: string; labelX: number; labelY: number; renderColor?: string }
interface CachedEdgeGeometry { signature: string; value: RenderedCanvasEdge; left: number; right: number; top: number; bottom: number }
type EdgeDirection = 'forward' | 'reverse' | 'both' | 'none'

interface NodeBounds { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number }
interface AlignmentGuide {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
  kind: '边缘' | '中心'
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const viewportRef = ref<HTMLElement | null>(null)
const document = reactive<CanvasDocument>({ nodes: [], edges: [] })
const loading = ref(true)
const loadError = ref('')
const saveState = ref<'saved' | 'dirty' | 'saving' | 'error'>('saved')
const measuredFps = ref<number | null>(null)
const tool = ref<Tool>('select')
const selectedNodeIds = ref<string[]>([])
const selectedNodeId = computed<string | null>({
  get: () => selectedNodeIds.value[0] || null,
  set: value => { selectedNodeIds.value = value ? [value] : [] }
})
const selectedEdgeId = ref<string | null>(null)
const connectingFrom = ref<string | null>(null)
const zoom = ref(1)
const pan = reactive({ x: 72, y: 72 })
const viewportSize = reactive({ width: 800, height: 600 })
const isPanning = ref(false)
const selectionBox = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const alignmentGuides = ref<AlignmentGuide[]>([])
const snapEnabled = ref(localStorage.getItem('canvas-snap-enabled') !== 'false')
const collapsedNodeIds = ref<string[]>([])
const layoutBackup = ref<Record<string, { x: number; y: number }>>({})
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let textEditSnapshot: string | null = null
let edgeEditSnapshot: string | null = null
let pasteSequence = 0
let isPasting = false
let viewportResizeObserver: ResizeObserver | null = null
let viewportResizeFrame = 0
let pendingViewportSize: { width: number; height: number } | null = null
const edgeGeometryCache = new Map<string, CachedEdgeGeometry>()
let performanceFrameId = 0
let performanceFrameCount = 0
let performanceSampleStarted = 0

const canvasPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => canvasPath.value.split(/[\\/]/).pop()?.replace(/\.canvas$/i, '') || '未命名画布')
const nodeById = computed(() => new Map(document.nodes.map(node => [node.id, node])))
const selectedNode = computed(() => nodeById.value.get(selectedNodeId.value || '') || null)
const selectedEdge = computed(() => document.edges.find(edge => edge.id === selectedEdgeId.value) || null)
const selectionCount = computed(() => selectedNodeIds.value.length)
const saveStateLabel = computed(() => ({ saved: '已保存', dirty: '有未保存修改', saving: '正在保存', error: '保存失败' })[saveState.value])
const colors = [
  { value: '1', label: '红色', css: '#ef4444' }, { value: '2', label: '橙色', css: '#f59e0b' },
  { value: '3', label: '黄色', css: '#eab308' }, { value: '4', label: '绿色', css: '#22c55e' },
  { value: '5', label: '青色', css: '#06b6d4' }, { value: '6', label: '紫色', css: '#8b5cf6' }
]
const colorMap: Record<string, string> = Object.fromEntries(colors.map(item => [item.value, item.css]))
const relationTypes = [
  { value: 'links-to', label: '链接到' }, { value: 'related', label: '相关' },
  { value: 'depends-on', label: '依赖于' }, { value: 'supports', label: '支持' },
  { value: 'contradicts', label: '反驳' }, { value: 'cites', label: '引用' }
]
const relationTypeLabel = (type: string) => relationTypes.find(item => item.value === type)?.label || type
const selectedEdgeDirection = computed<EdgeDirection>(() => {
  const edge = selectedEdge.value
  if (!edge) return 'forward'
  const from = edge.fromEnd || 'none'
  const to = edge.toEnd || 'arrow'
  if (from === 'arrow' && to === 'arrow') return 'both'
  if (from === 'arrow' && to === 'none') return 'reverse'
  if (from === 'none' && to === 'none') return 'none'
  return 'forward'
})
const selectedEdgeHexColor = computed(() => {
  const color = selectedEdge.value?.color
  if (color?.match(/^#[0-9a-f]{6}$/i)) return color
  return colorMap[color || ''] || '#64748B'
})

const hierarchyChildrenMap = computed(() => {
  const result = new Map<string, string[]>()
  for (const edge of document.edges) {
    const reverseOnly = edge.fromEnd === 'arrow' && edge.toEnd === 'none'
    const parentId = reverseOnly ? edge.toNode : edge.fromNode
    const childId = reverseOnly ? edge.fromNode : edge.toNode
    const children = result.get(parentId)
    if (children) children.push(childId)
    else result.set(parentId, [childId])
  }
  return result
})
const hierarchyChildren = (nodeId: string) => hierarchyChildrenMap.value.get(nodeId) || []
const collectBranchDescendants = (rootId: string) => {
  const descendants = new Set<string>()
  const visited = new Set([rootId])
  const pending = [...hierarchyChildren(rootId)]
  while (pending.length) {
    const id = pending.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    descendants.add(id)
    pending.push(...hierarchyChildren(id))
  }
  return descendants
}
const nodeHasChildren = (nodeId: string) => hierarchyChildren(nodeId).some(id => nodeById.value.has(id))
const branchDescendantCount = (nodeId: string) => collectBranchDescendants(nodeId).size
const hiddenNodeIds = computed(() => {
  const hidden = new Set<string>()
  for (const rootId of collapsedNodeIds.value) {
    for (const id of collectBranchDescendants(rootId)) hidden.add(id)
  }
  return hidden
})
const visibleNodes = computed(() => document.nodes.filter(node => !hiddenNodeIds.value.has(node.id)))
const visibleNodeIdSet = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleEdges = computed(() => document.edges.filter(edge => visibleNodeIdSet.value.has(edge.fromNode) && visibleNodeIdSet.value.has(edge.toNode)))
const VIEWPORT_CULL_THRESHOLD = 180
const viewportWorldBounds = computed(() => {
  const overscan = 260 / zoom.value
  return {
    left: -pan.x / zoom.value - overscan,
    top: -pan.y / zoom.value - overscan,
    right: (viewportSize.width - pan.x) / zoom.value + overscan,
    bottom: (viewportSize.height - pan.y) / zoom.value + overscan
  }
})
const nodeIntersectsViewport = (node: CanvasNode) => {
  const bounds = viewportWorldBounds.value
  return node.x + node.width >= bounds.left && node.x <= bounds.right && node.y + node.height >= bounds.top && node.y <= bounds.bottom
}
const renderedNodes = computed(() => {
  const candidates = visibleNodes.value.length > VIEWPORT_CULL_THRESHOLD
    ? visibleNodes.value.filter(nodeIntersectsViewport)
    : visibleNodes.value
  return [...candidates].sort((a, b) => Number(a.type === 'group') - Number(b.type === 'group'))
})
const sampleCanvasPerformance = (timestamp: number) => {
  const active = visibleNodes.value.length > VIEWPORT_CULL_THRESHOLD && globalThis.document.visibilityState === 'visible'
  if (!active) {
    measuredFps.value = null
    performanceFrameCount = 0
    performanceSampleStarted = timestamp
  } else {
    if (!performanceSampleStarted) performanceSampleStarted = timestamp
    performanceFrameCount += 1
    const elapsed = timestamp - performanceSampleStarted
    if (elapsed >= 1000) {
      measuredFps.value = Math.round(performanceFrameCount * 1000 / elapsed)
      performanceFrameCount = 0
      performanceSampleStarted = timestamp
    }
  }
  performanceFrameId = requestAnimationFrame(sampleCanvasPerformance)
}

const COLLAPSE_STORAGE_KEY = 'canvas-collapsed-branches-v1'
const LAYOUT_BACKUP_STORAGE_KEY = 'canvas-layout-backups-v1'
const layoutBackupCount = computed(() => Object.keys(layoutBackup.value).length)
const readCollapseState = (): Record<string, string[]> => {
  try {
    const value = JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}
const loadCollapsedState = () => {
  const existingIds = new Set(document.nodes.map(node => node.id))
  collapsedNodeIds.value = (readCollapseState()[canvasPath.value] || []).filter(id => existingIds.has(id))
}
const persistCollapsedState = () => {
  const state = readCollapseState()
  if (collapsedNodeIds.value.length) state[canvasPath.value] = [...collapsedNodeIds.value]
  else delete state[canvasPath.value]
  localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(state))
}
const readLayoutBackups = (): Record<string, Record<string, { x: number; y: number }>> => {
  try {
    const value = JSON.parse(localStorage.getItem(LAYOUT_BACKUP_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}
const loadLayoutBackup = () => {
  const existingIds = new Set(document.nodes.map(node => node.id))
  const stored = readLayoutBackups()[canvasPath.value] || {}
  layoutBackup.value = Object.fromEntries(Object.entries(stored).filter(([id, point]) =>
    existingIds.has(id) && Number.isFinite(point?.x) && Number.isFinite(point?.y)))
}
const persistLayoutBackup = () => {
  const state = readLayoutBackups()
  if (layoutBackupCount.value) state[canvasPath.value] = layoutBackup.value
  else delete state[canvasPath.value]
  localStorage.setItem(LAYOUT_BACKUP_STORAGE_KEY, JSON.stringify(state))
}
const toggleBranchCollapse = (nodeId: string) => {
  collapsedNodeIds.value = collapsedNodeIds.value.includes(nodeId)
    ? collapsedNodeIds.value.filter(id => id !== nodeId)
    : [...collapsedNodeIds.value, nodeId]
  selectedNodeIds.value = selectedNodeIds.value.filter(id => !hiddenNodeIds.value.has(id))
  selectedEdgeId.value = null
  persistCollapsedState()
}

const worldStyle = computed(() => ({ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom.value})` }))
const gridStyle = computed(() => {
  const size = 24 * zoom.value
  return { backgroundSize: `${size}px ${size}px`, backgroundPosition: `${pan.x % size}px ${pan.y % size}px` }
})
const selectionBoxStyle = computed(() => selectionBox.value ? ({
  left: `${selectionBox.value.x}px`, top: `${selectionBox.value.y}px`,
  width: `${selectionBox.value.width}px`, height: `${selectionBox.value.height}px`
}) : {})
const alignmentGuideStyle = (guide: AlignmentGuide) => guide.axis === 'x'
  ? { left: `${guide.position}px`, top: `${guide.start}px`, height: `${Math.max(1, guide.end - guide.start)}px` }
  : { left: `${guide.start}px`, top: `${guide.position}px`, width: `${Math.max(1, guide.end - guide.start)}px` }

const nodeStyle = (node: CanvasNode) => ({
  left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px`,
  '--node-color': colorMap[node.color || ''] || node.color || 'var(--theme-primary)'
})

const sidePoint = (node: CanvasNode, side: string | undefined, toward: CanvasNode) => {
  const resolved = side || (Math.abs(toward.x - node.x) > Math.abs(toward.y - node.y)
    ? (toward.x > node.x ? 'right' : 'left') : (toward.y > node.y ? 'bottom' : 'top'))
  if (resolved === 'left') return { x: node.x, y: node.y + node.height / 2 }
  if (resolved === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 }
  if (resolved === 'top') return { x: node.x + node.width / 2, y: node.y }
  return { x: node.x + node.width / 2, y: node.y + node.height }
}

const renderedEdges = computed(() => {
  const activeIds = new Set<string>()
  const cull = visibleEdges.value.length > VIEWPORT_CULL_THRESHOLD
  const viewport = viewportWorldBounds.value
  const result: RenderedCanvasEdge[] = []
  for (const edge of visibleEdges.value) {
    const from = nodeById.value.get(edge.fromNode)
    const to = nodeById.value.get(edge.toNode)
    if (!from || !to) continue
    activeIds.add(edge.id)
    const signature = [
      canvasPath.value, edge.fromNode, edge.toNode,
      from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height,
      edge.fromSide, edge.toSide, edge.fromEnd, edge.toEnd, edge.color, edge.label, edge.relationType
    ].join('|')
    let cached = edgeGeometryCache.get(edge.id)
    if (!cached || cached.signature !== signature) {
      const start = sidePoint(from, edge.fromSide, to)
      const end = sidePoint(to, edge.toSide, from)
      const curve = Math.max(48, Math.min(180, Math.hypot(end.x - start.x, end.y - start.y) * 0.28))
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      const path = horizontal
        ? `M ${start.x} ${start.y} C ${start.x + Math.sign(end.x - start.x || 1) * curve} ${start.y}, ${end.x - Math.sign(end.x - start.x || 1) * curve} ${end.y}, ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} C ${start.x} ${start.y + Math.sign(end.y - start.y || 1) * curve}, ${end.x} ${end.y - Math.sign(end.y - start.y || 1) * curve}, ${end.x} ${end.y}`
      cached = {
        signature,
        value: {
          ...edge, fromEnd: edge.fromEnd || 'none', toEnd: edge.toEnd || 'arrow',
          renderColor: colorMap[edge.color || ''] || edge.color || undefined,
          path, labelX: (start.x + end.x) / 2, labelY: (start.y + end.y) / 2 - 8
        },
        left: Math.min(start.x, end.x) - curve,
        right: Math.max(start.x, end.x) + curve,
        top: Math.min(start.y, end.y) - curve,
        bottom: Math.max(start.y, end.y) + curve
      }
      edgeGeometryCache.set(edge.id, cached)
    }
    if (!cull || (cached.right >= viewport.left && cached.left <= viewport.right && cached.bottom >= viewport.top && cached.top <= viewport.bottom)) result.push(cached.value)
  }
  if (edgeGeometryCache.size > activeIds.size + 100) {
    for (const id of edgeGeometryCache.keys()) if (!activeIds.has(id)) edgeGeometryCache.delete(id)
  }
  return result
})

const makeId = (prefix: string) => `${prefix}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
const CANVAS_CLIPBOARD_KEY = 'longedit-canvas-clipboard-v1'
const MAX_CLIPBOARD_CHARS = 5 * 1024 * 1024
const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const parseClipboardPayload = (raw: string): CanvasClipboardPayload => {
  if (!raw.trim()) throw new Error('剪贴板为空')
  if (raw.length > MAX_CLIPBOARD_CHARS) throw new Error('Canvas 剪贴板内容超过 5 MB')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('剪贴板不是有效的 Canvas JSON') }
  if (!value || typeof value !== 'object') throw new Error('剪贴板缺少 Canvas 对象')
  const candidate = value as Partial<CanvasClipboardPayload>
  if (!Array.isArray(candidate.nodes) || candidate.nodes.length === 0) throw new Error('剪贴板中没有可粘贴节点')
  if (candidate.nodes.length > 1000) throw new Error('单次最多粘贴 1,000 个节点')
  const edges = Array.isArray(candidate.edges) ? candidate.edges : []
  if (edges.length > 5000) throw new Error('单次最多粘贴 5,000 条连线')

  const nodeIds = new Set<string>()
  for (const node of candidate.nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id || nodeIds.has(node.id)) throw new Error('剪贴板节点 ID 无效或重复')
    if (!['text', 'file', 'link', 'group'].includes(node.type)) throw new Error(`不支持的 Canvas 节点类型：${String(node.type)}`)
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) throw new Error('剪贴板节点坐标或尺寸无效')
    if (node.type === 'text' && typeof node.text !== 'string') throw new Error('文本节点缺少 text 字段')
    if (node.type === 'file' && typeof node.file !== 'string') throw new Error('文件节点缺少 file 字段')
    if (node.type === 'link' && typeof node.url !== 'string') throw new Error('链接节点缺少 url 字段')
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object' || typeof edge.id !== 'string' || !edge.id || edgeIds.has(edge.id)) throw new Error('剪贴板连线 ID 无效或重复')
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) throw new Error('剪贴板连线引用了片段外节点')
    if (edge.fromSide !== undefined && !['top', 'right', 'bottom', 'left'].includes(edge.fromSide)) throw new Error('剪贴板连线起点端口无效')
    if (edge.toSide !== undefined && !['top', 'right', 'bottom', 'left'].includes(edge.toSide)) throw new Error('剪贴板连线终点端口无效')
    if (edge.fromEnd !== undefined && !['none', 'arrow'].includes(edge.fromEnd)) throw new Error('剪贴板连线起点样式无效')
    if (edge.toEnd !== undefined && !['none', 'arrow'].includes(edge.toEnd)) throw new Error('剪贴板连线终点样式无效')
    if (edge.label !== undefined && (typeof edge.label !== 'string' || edge.label.length > 160)) throw new Error('剪贴板连线标签无效')
    if (edge.relationType !== undefined && (typeof edge.relationType !== 'string' || edge.relationType.length > 80)) throw new Error('剪贴板关系类型无效')
    edgeIds.add(edge.id)
  }
  if (candidate.sourceCanvas !== undefined && (typeof candidate.sourceCanvas !== 'string' || candidate.sourceCanvas.length > 1000 || /^[A-Za-z]:[\\/]/.test(candidate.sourceCanvas) || candidate.sourceCanvas.startsWith('/') || candidate.sourceCanvas.replace(/\\/g, '/').split('/').includes('..'))) throw new Error('剪贴板来源画布路径无效')
  return cloneJson({ nodes: candidate.nodes, edges, sourceCanvas: candidate.sourceCanvas })
}
const normalizeRelativePath = (path: string) => {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (parts.length && parts[parts.length - 1] !== '..') parts.pop(); else parts.push(part) }
    else parts.push(part)
  }
  return parts.join('/')
}
const libraryRelativePath = (path: string) => {
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedRoot = store.libraryPath.replace(/\\/g, '/').replace(/\/$/, '')
  return normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath.split('/').pop() || normalizedPath
}
const rebaseFileReference = (file: string, sourceCanvas: string | undefined) => {
  if (!sourceCanvas || sourceCanvas === libraryRelativePath(canvasPath.value) || /^[A-Za-z]:[\\/]/.test(file) || file.startsWith('/')) return file
  const sourceDir = sourceCanvas.replace(/\\/g, '/').split('/').slice(0, -1)
  const targetDir = libraryRelativePath(canvasPath.value).replace(/\\/g, '/').split('/').slice(0, -1)
  const targetParts = normalizeRelativePath([...sourceDir, ...file.replace(/\\/g, '/').split('/')].join('/')).split('/').filter(Boolean)
  let common = 0
  while (common < targetDir.length && common < targetParts.length && targetDir[common].toLowerCase() === targetParts[common].toLowerCase()) common += 1
  return [...targetDir.slice(common).map(() => '..'), ...targetParts.slice(common)].join('/') || file
}
const writeClipboardPayload = async (payload: CanvasClipboardPayload) => {
  const raw = JSON.stringify(payload)
  if (raw.length > MAX_CLIPBOARD_CHARS) throw new Error('所选内容超过 5 MB，无法复制')
  try { sessionStorage.setItem(CANVAS_CLIPBOARD_KEY, raw) } catch { throw new Error('应用内剪贴板空间不足') }
  let systemClipboard = true
  try { await navigator.clipboard.writeText(raw) } catch { systemClipboard = false }
  return systemClipboard
}
const copySelection = async (notify = true) => {
  const selectedIds = new Set(selectedNodeIds.value.filter(id => visibleNodeIdSet.value.has(id)))
  if (!selectedIds.size) { if (notify) message.info('请先选择要复制的节点'); return null }
  if (selectedIds.size > 1000) { if (notify) message.error('单次最多复制 1,000 个节点'); return null }
  const payload: CanvasClipboardPayload = {
    nodes: cloneJson(document.nodes.filter(node => selectedIds.has(node.id))),
    edges: cloneJson(document.edges.filter(edge => selectedIds.has(edge.fromNode) && selectedIds.has(edge.toNode))),
    sourceCanvas: libraryRelativePath(canvasPath.value)
  }
  if (payload.edges.length > 5000) { if (notify) message.error('单次最多复制 5,000 条内部连线'); return null }
  try {
    const systemClipboard = await writeClipboardPayload(payload)
    pasteSequence = 0
    if (notify) message.success(`已复制 ${payload.nodes.length} 个节点和 ${payload.edges.length} 条内部连线${systemClipboard ? '' : '（应用内）'}`)
    return payload
  } catch (error) {
    if (notify) message.error(`复制失败：${String(error)}`)
    return null
  }
}
const cutSelection = async () => {
  const payload = await copySelection(false)
  if (!payload) return
  const copiedIds = new Set(payload.nodes.map(node => node.id))
  selectedNodeIds.value = document.nodes.filter(node => copiedIds.has(node.id)).map(node => node.id)
  selectedEdgeId.value = null
  removeSelection()
  message.success(`已剪切 ${payload.nodes.length} 个节点和 ${payload.edges.length} 条内部连线`)
}
const readClipboardPayload = async () => {
  let raw: string | null = null
  try { raw = await navigator.clipboard.readText() } catch { raw = sessionStorage.getItem(CANVAS_CLIPBOARD_KEY) }
  if (!raw) raw = sessionStorage.getItem(CANVAS_CLIPBOARD_KEY)
  return parseClipboardPayload(raw || '')
}
const pasteSelection = async () => {
  if (isPasting) return
  isPasting = true
  try {
    const payload = await readClipboardPayload()
    const minX = Math.min(...payload.nodes.map(node => node.x))
    const minY = Math.min(...payload.nodes.map(node => node.y))
    const maxX = Math.max(...payload.nodes.map(node => node.x + node.width))
    const maxY = Math.max(...payload.nodes.map(node => node.y + node.height))
    const target = viewportCenter()
    const cascade = Math.min(pasteSequence, 6) * 24
    const dx = Math.round(target.x - (minX + maxX) / 2 + cascade)
    const dy = Math.round(target.y - (minY + maxY) / 2 + cascade)
    const idMap = new Map(payload.nodes.map(node => [node.id, makeId('node')]))
    const nodes = payload.nodes.map(node => {
      const copy = cloneJson(node)
      if (copy.type === 'file' && copy.file) copy.file = rebaseFileReference(copy.file, payload.sourceCanvas)
      return { ...copy, id: idMap.get(node.id)!, x: Math.round(node.x + dx), y: Math.round(node.y + dy) }
    })
    const edges = payload.edges.map(edge => ({
      ...cloneJson(edge), id: makeId('edge'),
      fromNode: idMap.get(edge.fromNode)!, toNode: idMap.get(edge.toNode)!
    }))
    pushUndoSnapshot()
    document.nodes.push(...nodes)
    document.edges.push(...edges)
    selectedNodeIds.value = nodes.map(node => node.id)
    selectedEdgeId.value = null
    pasteSequence += 1
    markDirty()
    message.success(`已粘贴 ${nodes.length} 个节点和 ${edges.length} 条内部连线`)
  } catch (error) { message.error(`粘贴失败：${String(error)}`) }
  finally { isPasting = false }
}
const screenToWorld = (clientX: number, clientY: number) => {
  const rect = viewportRef.value?.getBoundingClientRect() || { left: 0, top: 0, width: 800, height: 600 }
  return { x: (clientX - rect.left - pan.x) / zoom.value, y: (clientY - rect.top - pan.y) / zoom.value }
}

const boundsForNodes = (nodes: CanvasNode[]): NodeBounds => {
  const left = Math.min(...nodes.map(node => node.x))
  const right = Math.max(...nodes.map(node => node.x + node.width))
  const top = Math.min(...nodes.map(node => node.y))
  const bottom = Math.max(...nodes.map(node => node.y + node.height))
  return { left, right, top, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 }
}

const shiftedBounds = (bounds: NodeBounds, dx: number, dy: number): NodeBounds => ({
  left: bounds.left + dx,
  right: bounds.right + dx,
  top: bounds.top + dy,
  bottom: bounds.bottom + dy,
  centerX: bounds.centerX + dx,
  centerY: bounds.centerY + dy
})

const calculateAlignmentSnap = (moving: NodeBounds, stationary: CanvasNode[], threshold: number) => {
  let bestX: { distance: number; correction: number; guide: AlignmentGuide } | null = null
  let bestY: { distance: number; correction: number; guide: AlignmentGuide } | null = null
  const movingX = [{ value: moving.left, kind: '边缘' as const }, { value: moving.centerX, kind: '中心' as const }, { value: moving.right, kind: '边缘' as const }]
  const movingY = [{ value: moving.top, kind: '边缘' as const }, { value: moving.centerY, kind: '中心' as const }, { value: moving.bottom, kind: '边缘' as const }]

  for (const node of stationary) {
    const target = boundsForNodes([node])
    const targetX = [{ value: target.left, kind: '边缘' as const }, { value: target.centerX, kind: '中心' as const }, { value: target.right, kind: '边缘' as const }]
    const targetY = [{ value: target.top, kind: '边缘' as const }, { value: target.centerY, kind: '中心' as const }, { value: target.bottom, kind: '边缘' as const }]
    for (const sourceAnchor of movingX) for (const targetAnchor of targetX) {
      const correction = targetAnchor.value - sourceAnchor.value
      const distance = Math.abs(correction)
      if (distance <= threshold && (!bestX || distance < bestX.distance)) {
        bestX = {
          distance,
          correction,
          guide: {
            axis: 'x', position: targetAnchor.value,
            start: Math.min(moving.top, target.top) - 18,
            end: Math.max(moving.bottom, target.bottom) + 18,
            kind: sourceAnchor.kind === '中心' && targetAnchor.kind === '中心' ? '中心' : '边缘'
          }
        }
      }
    }
    for (const sourceAnchor of movingY) for (const targetAnchor of targetY) {
      const correction = targetAnchor.value - sourceAnchor.value
      const distance = Math.abs(correction)
      if (distance <= threshold && (!bestY || distance < bestY.distance)) {
        bestY = {
          distance,
          correction,
          guide: {
            axis: 'y', position: targetAnchor.value,
            start: Math.min(moving.left, target.left) - 18,
            end: Math.max(moving.right, target.right) + 18,
            kind: sourceAnchor.kind === '中心' && targetAnchor.kind === '中心' ? '中心' : '边缘'
          }
        }
      }
    }
  }
  return {
    dx: bestX?.correction || 0,
    dy: bestY?.correction || 0,
    guides: [bestX?.guide, bestY?.guide].filter((guide): guide is AlignmentGuide => Boolean(guide))
  }
}
const viewportCenter = () => {
  const rect = viewportRef.value?.getBoundingClientRect()
  return screenToWorld((rect?.left || 0) + (rect?.width || 800) / 2, (rect?.top || 0) + (rect?.height || 600) / 2)
}

type NewCanvasNode = Pick<CanvasNode, 'type' | 'width' | 'height'> & Partial<CanvasNode>
const serializeDocument = () => JSON.stringify(document)
const pushUndoSnapshot = (snapshot = serializeDocument()) => {
  if (undoStack.value[undoStack.value.length - 1] === snapshot) return
  undoStack.value.push(snapshot)
  if (undoStack.value.length > 60) undoStack.value.shift()
  redoStack.value = []
}
const restoreSnapshot = (snapshot: string) => {
  const parsed = JSON.parse(snapshot) as CanvasDocument
  for (const key of Object.keys(document)) delete document[key]
  for (const [key, value] of Object.entries(parsed)) document[key] = value
  selectedNodeIds.value = []; selectedEdgeId.value = null; markDirty()
}
const undo = () => {
  const snapshot = undoStack.value.pop()
  if (!snapshot) return
  redoStack.value.push(serializeDocument())
  restoreSnapshot(snapshot)
}
const redo = () => {
  const snapshot = redoStack.value.pop()
  if (!snapshot) return
  undoStack.value.push(serializeDocument())
  restoreSnapshot(snapshot)
}
const addNode = (node: NewCanvasNode, position = viewportCenter()) => {
  pushUndoSnapshot()
  const created = { ...node, id: makeId('node'), x: Math.round(position.x - node.width / 2), y: Math.round(position.y - node.height / 2) } as CanvasNode
  document.nodes.push(created)
  selectedNodeId.value = created.id
  selectedEdgeId.value = null
  markDirty()
  return created
}
const addTextNode = () => addNode({ type: 'text', text: '# 新想法\n\n开始记录…', width: 280, height: 180 })
const addFileNode = () => {
  const file = window.prompt('输入知识库内的文件路径（相对路径或绝对路径）', '笔记.md')
  if (file?.trim()) addNode({ type: 'file', file: file.trim(), width: 280, height: 150 })
}
interface ChartSourceDocument { views: { id: string; name: string; kind: string }[] }
const addChartNode = async () => {
  const source = window.prompt('输入要引用的 .table.json 路径（相对当前 Canvas 或绝对路径）', 'data.table.json')?.trim()
  if (!source) return
  if (!source.toLocaleLowerCase().endsWith('.table.json')) { message.error('图表源必须是 .table.json 文件'); return }
  try {
    const table = await invoke<ChartSourceDocument>('read_table_file', { libraryRoot: store.libraryPath, path: resolveFilePath(source) })
    const charts = table.views.filter(view => view.kind === 'chart')
    if (!charts.length) { message.warning('该 Table 尚未创建图表视图'); return }
    const suggested = charts[0].id
    const viewId = window.prompt(`输入图表视图 ID\n${charts.map(view => `${view.id} — ${view.name}`).join('\n')}`, suggested)?.trim()
    if (!viewId) return
    if (!charts.some(view => view.id === viewId)) { message.error('输入的 chart 视图不存在'); return }
    addNode({ type: 'file', file: source, longeditViewId: viewId, width: 660, height: 430 })
  } catch (cause) { message.error(`无法读取图表源：${String(cause).replace(/^Error:\s*/, '')}`) }
}
const addMermaidNode = async () => {
  const source = window.prompt('输入要引用的 .mmd / .mermaid 路径（相对当前 Canvas 或绝对路径）', '流程图.mmd')?.trim()
  if (!source) return
  if (!/\.(?:mmd|mermaid)$/i.test(source)) { message.error('Mermaid 源必须是 .mmd 或 .mermaid 文件'); return }
  try {
    await invoke('read_diagram_file', { libraryRoot: store.libraryPath, path: resolveFilePath(source) })
    addNode({ type: 'file', file: source, width: 660, height: 430 })
  } catch (cause) { message.error(`无法读取 Mermaid 源：${String(cause).replace(/^Error:\s*/, '')}`) }
}
const addLinkNode = () => {
  const url = window.prompt('输入网页链接', 'https://')
  if (url?.trim()) addNode({ type: 'link', url: url.trim(), width: 300, height: 150 })
}
const addGroupNode = () => addNode({ type: 'group', label: '主题分组', width: 560, height: 360 })

const setTool = (next: Tool) => { tool.value = next; connectingFrom.value = null }
const clearSelection = () => { selectedNodeIds.value = []; selectedEdgeId.value = null; if (tool.value === 'connect') connectingFrom.value = null }
const selectNode = (node: CanvasNode, event?: MouseEvent) => {
  selectedEdgeId.value = null
  if (tool.value !== 'connect') {
    if (event?.ctrlKey || event?.metaKey) {
      selectedNodeIds.value = selectedNodeIds.value.includes(node.id)
        ? selectedNodeIds.value.filter(id => id !== node.id)
        : [...selectedNodeIds.value, node.id]
    } else if (event?.shiftKey) {
      if (!selectedNodeIds.value.includes(node.id)) selectedNodeIds.value = [...selectedNodeIds.value, node.id]
    } else if (!selectedNodeIds.value.includes(node.id)) selectedNodeIds.value = [node.id]
    return
  }
  selectedNodeIds.value = [node.id]
  if (!connectingFrom.value) { connectingFrom.value = node.id; return }
  if (connectingFrom.value !== node.id && !document.edges.some(edge => edge.fromNode === connectingFrom.value && edge.toNode === node.id)) {
    pushUndoSnapshot()
    document.edges.push({ id: makeId('edge'), fromNode: connectingFrom.value, toNode: node.id, relationType: 'links-to' })
    markDirty()
  }
  connectingFrom.value = null
  tool.value = 'select'
}
const selectEdge = (id: string) => { selectedEdgeId.value = id; selectedNodeId.value = null }
const edgeNodeTitle = (id: string) => {
  const node = nodeById.value.get(id)
  if (!node) return '未知节点'
  if (node.type === 'text') return (node.text || '文本卡片').split('\n')[0].replace(/^#+\s*/, '').slice(0, 24)
  return (node.label || node.file || node.url || node.id).slice(0, 24)
}
const beginEdgeEdit = () => { edgeEditSnapshot = serializeDocument() }
const endEdgeEdit = () => {
  if (edgeEditSnapshot && edgeEditSnapshot !== serializeDocument()) pushUndoSnapshot(edgeEditSnapshot)
  edgeEditSnapshot = null
}
const setEdgeProperty = (key: keyof CanvasEdge, value: string | undefined) => {
  const edge = selectedEdge.value
  if (!edge || edge[key] === value) return
  pushUndoSnapshot()
  if (value) edge[key] = value
  else delete edge[key]
  markDirty()
}
const setEdgeDirection = (direction: EdgeDirection) => {
  const edge = selectedEdge.value
  if (!edge || selectedEdgeDirection.value === direction) return
  pushUndoSnapshot()
  if (direction === 'forward') { delete edge.fromEnd; delete edge.toEnd }
  else if (direction === 'reverse') { edge.fromEnd = 'arrow'; edge.toEnd = 'none' }
  else if (direction === 'both') { edge.fromEnd = 'arrow'; edge.toEnd = 'arrow' }
  else { edge.fromEnd = 'none'; edge.toEnd = 'none' }
  markDirty()
}
const removeSelection = () => {
  if (selectedNodeIds.value.length) {
    pushUndoSnapshot()
    const ids = new Set(selectedNodeIds.value)
    document.nodes = document.nodes.filter(node => !ids.has(node.id))
    document.edges = document.edges.filter(edge => !ids.has(edge.fromNode) && !ids.has(edge.toNode))
  } else if (selectedEdgeId.value) { pushUndoSnapshot(); document.edges = document.edges.filter(edge => edge.id !== selectedEdgeId.value) }
  else return
  collapsedNodeIds.value = collapsedNodeIds.value.filter(id => nodeById.value.has(id))
  persistCollapsedState()
  layoutBackup.value = Object.fromEntries(Object.entries(layoutBackup.value).filter(([id]) => nodeById.value.has(id)))
  persistLayoutBackup()
  selectedNodeIds.value = []; selectedEdgeId.value = null; markDirty()
}
const setNodeColor = (color: string) => {
  if (!selectedNodeIds.value.length) return
  pushUndoSnapshot()
  const ids = new Set(selectedNodeIds.value)
  document.nodes.filter(node => ids.has(node.id)).forEach(node => { node.color = color })
  markDirty()
}

const beginTextEdit = (node: CanvasNode) => { selectNode(node); textEditSnapshot = serializeDocument() }
const endTextEdit = () => {
  if (textEditSnapshot && textEditSnapshot !== serializeDocument()) pushUndoSnapshot(textEditSnapshot)
  textEditSnapshot = null
}

const startNodeDrag = (node: CanvasNode, event: MouseEvent) => {
  if ((event.target as HTMLElement).matches('textarea,input,button')) return
  selectNode(node, event)
  if (tool.value === 'connect') return
  if (!selectedNodeIds.value.includes(node.id)) return
  const before = serializeDocument()
  const selectedIds = new Set(selectedNodeIds.value)
  const movingNodes = document.nodes.filter(item => selectedIds.has(item.id))
  const stationaryNodes = visibleNodes.value.filter(item => !selectedIds.has(item.id))
  const origins = new Map(movingNodes.map(item => [item.id, { x: item.x, y: item.y }]))
  const originalBounds = boundsForNodes(movingNodes)
  const start = { x: event.clientX, y: event.clientY }
  let moved = false
  const move = (e: MouseEvent) => {
    const rawDx = Math.round((e.clientX - start.x) / zoom.value)
    const rawDy = Math.round((e.clientY - start.y) / zoom.value)
    if (Math.abs(rawDx) + Math.abs(rawDy) > 1) moved = true
    const snap = snapEnabled.value && !e.altKey
      ? calculateAlignmentSnap(shiftedBounds(originalBounds, rawDx, rawDy), stationaryNodes, 7 / zoom.value)
      : { dx: 0, dy: 0, guides: [] }
    const dx = rawDx + snap.dx
    const dy = rawDy + snap.dy
    alignmentGuides.value = snap.guides
    movingNodes.forEach(item => {
      const origin = origins.get(item.id)
      if (origin) { item.x = Math.round(origin.x + dx); item.y = Math.round(origin.y + dy) }
    })
  }
  const up = () => {
    alignmentGuides.value = []
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (moved) { pushUndoSnapshot(before); markDirty() }
  }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
}
const startResize = (node: CanvasNode, event: MouseEvent) => {
  const before = serializeDocument()
  const start = { x: event.clientX, y: event.clientY, width: node.width, height: node.height }
  let resized = false
  const move = (e: MouseEvent) => {
    resized = true
    node.width = Math.max(node.type === 'group' ? 240 : 160, Math.round(start.width + (e.clientX - start.x) / zoom.value))
    node.height = Math.max(node.type === 'group' ? 180 : 100, Math.round(start.height + (e.clientY - start.y) / zoom.value))
  }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); if (resized) { pushUndoSnapshot(before); markDirty() } }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
}
const startPan = (event: MouseEvent) => {
  if (event.button !== 0 || (event.target as HTMLElement).closest('.canvas-node,.canvas-edge,.empty-canvas')) return
  const rect = viewportRef.value?.getBoundingClientRect()
  if (event.shiftKey && rect) {
    const startX = event.clientX - rect.left; const startY = event.clientY - rect.top
    selectionBox.value = { x: startX, y: startY, width: 0, height: 0 }
    const move = (e: MouseEvent) => {
      const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left)); const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
      selectionBox.value = { x: Math.min(startX, currentX), y: Math.min(startY, currentY), width: Math.abs(currentX - startX), height: Math.abs(currentY - startY) }
    }
    const up = () => {
      const box = selectionBox.value
      if (box) {
        const topLeft = screenToWorld(rect.left + box.x, rect.top + box.y)
        const bottomRight = screenToWorld(rect.left + box.x + box.width, rect.top + box.y + box.height)
        selectedNodeIds.value = visibleNodes.value.filter(node => node.x < bottomRight.x && node.x + node.width > topLeft.x && node.y < bottomRight.y && node.y + node.height > topLeft.y).map(node => node.id)
        selectedEdgeId.value = null
      }
      selectionBox.value = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return
  }
  clearSelection(); isPanning.value = true
  const start = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
  const move = (e: MouseEvent) => { pan.x = start.panX + e.clientX - start.x; pan.y = start.panY + e.clientY - start.y }
  const up = () => { isPanning.value = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
}

const selectedNodes = () => document.nodes.filter(node => selectedNodeIds.value.includes(node.id))
const layoutSelectedBranch = () => {
  const root = selectedNode.value
  if (!root) return
  if (collapsedNodeIds.value.includes(root.id)) {
    message.info('请先展开当前分支再进行自动布局')
    return
  }
  const levels: CanvasNode[][] = [[root]]
  const visited = new Set([root.id])
  let frontier = [root.id]
  while (frontier.length) {
    const nextIds: string[] = []
    for (const parentId of frontier) {
      if (collapsedNodeIds.value.includes(parentId)) continue
      for (const childId of hierarchyChildren(parentId)) {
        if (visited.has(childId) || hiddenNodeIds.value.has(childId)) continue
        if (!nodeById.value.has(childId)) continue
        visited.add(childId)
        nextIds.push(childId)
      }
    }
    if (!nextIds.length) break
    const nodes = nextIds
      .map(id => nodeById.value.get(id))
      .filter((node): node is CanvasNode => Boolean(node))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    levels.push(nodes)
    frontier = nodes.map(node => node.id)
  }
  if (levels.length === 1) { message.info('当前节点没有可整理的可见子分支'); return }

  const before = serializeDocument()
  const previousBackup = layoutBackup.value
  const backup = { ...layoutBackup.value }
  for (const node of levels.slice(1).flat()) {
    if (!backup[node.id]) backup[node.id] = { x: node.x, y: node.y }
  }
  layoutBackup.value = backup
  persistLayoutBackup()
  const rootCenterY = root.y + root.height / 2
  let columnX = root.x
  for (let depth = 1; depth < levels.length; depth += 1) {
    const previousWidth = Math.max(...levels[depth - 1].map(node => node.width))
    columnX += previousWidth + 88
    const column = levels[depth]
    const totalHeight = column.reduce((sum, node) => sum + node.height, 0) + Math.max(0, column.length - 1) * 42
    let cursorY = rootCenterY - totalHeight / 2
    for (const node of column) {
      node.x = Math.round(columnX)
      node.y = Math.round(cursorY)
      cursorY += node.height + 42
    }
  }
  if (before !== serializeDocument()) {
    pushUndoSnapshot(before)
    markDirty()
    message.success(`已整理 ${visited.size} 个节点，根节点和画布其他区域保持不动`)
  } else {
    layoutBackup.value = previousBackup
    persistLayoutBackup()
    message.info('当前分支已经处于目标布局')
  }
}
const restoreManualPositions = () => {
  if (!layoutBackupCount.value) return
  const before = serializeDocument()
  let restored = 0
  for (const node of document.nodes) {
    const point = layoutBackup.value[node.id]
    if (!point) continue
    node.x = point.x
    node.y = point.y
    restored += 1
  }
  layoutBackup.value = {}
  persistLayoutBackup()
  if (before !== serializeDocument()) {
    pushUndoSnapshot(before)
    markDirty()
  }
  message.success(`已恢复 ${restored} 个节点的手工位置`)
}
const alignSelection = (mode: 'left' | 'top') => {
  const nodes = selectedNodes(); if (nodes.length < 2) return
  pushUndoSnapshot()
  const target = mode === 'left' ? Math.min(...nodes.map(node => node.x)) : Math.min(...nodes.map(node => node.y))
  nodes.forEach(node => { if (mode === 'left') node.x = target; else node.y = target })
  markDirty()
}
const distributeSelection = (axis: 'horizontal' | 'vertical') => {
  const nodes = selectedNodes(); if (nodes.length < 3) { message.info('至少选择 3 个节点才能均匀分布'); return }
  pushUndoSnapshot()
  const sorted = [...nodes].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y)
  if (axis === 'horizontal') {
    const first = sorted[0].x; const last = sorted[sorted.length - 1].x; const step = (last - first) / (sorted.length - 1)
    sorted.forEach((node, index) => { node.x = Math.round(first + step * index) })
  } else {
    const first = sorted[0].y; const last = sorted[sorted.length - 1].y; const step = (last - first) / (sorted.length - 1)
    sorted.forEach((node, index) => { node.y = Math.round(first + step * index) })
  }
  markDirty()
}

const nudgeSelection = (dx: number, dy: number, repeated: boolean) => {
  const nodes = selectedNodes()
  if (!nodes.length) return
  if (!repeated) pushUndoSnapshot()
  nodes.forEach(node => { node.x += dx; node.y += dy })
  alignmentGuides.value = []
  markDirty()
}

const changeZoom = (delta: number, anchor?: { x: number; y: number }) => {
  const old = zoom.value
  const next = Math.min(2.5, Math.max(0.25, Math.round((old + delta) * 100) / 100))
  const rect = viewportRef.value?.getBoundingClientRect()
  const point = anchor || { x: (rect?.width || 800) / 2, y: (rect?.height || 600) / 2 }
  pan.x = point.x - (point.x - pan.x) * (next / old)
  pan.y = point.y - (point.y - pan.y) * (next / old)
  zoom.value = next
}
const handleWheel = (event: WheelEvent) => {
  if (event.ctrlKey || event.metaKey) {
    const rect = viewportRef.value?.getBoundingClientRect()
    changeZoom(event.deltaY > 0 ? -0.1 : 0.1, { x: event.clientX - (rect?.left || 0), y: event.clientY - (rect?.top || 0) })
  } else { pan.x -= event.deltaX; pan.y -= event.deltaY }
}
const resetView = () => { zoom.value = 1; pan.x = 72; pan.y = 72 }
const fitToContent = () => {
  const nodes = visibleNodes.value
  if (!nodes.length) { resetView(); return }
  const rect = viewportRef.value?.getBoundingClientRect()
  const minX = Math.min(...nodes.map(n => n.x)); const minY = Math.min(...nodes.map(n => n.y))
  const maxX = Math.max(...nodes.map(n => n.x + n.width)); const maxY = Math.max(...nodes.map(n => n.y + n.height))
  zoom.value = Math.min(1.5, Math.max(0.25, Math.min(((rect?.width || 800) - 120) / Math.max(1, maxX - minX), ((rect?.height || 600) - 120) / Math.max(1, maxY - minY))))
  pan.x = ((rect?.width || 800) - (maxX - minX) * zoom.value) / 2 - minX * zoom.value
  pan.y = ((rect?.height || 600) - (maxY - minY) * zoom.value) / 2 - minY * zoom.value
}
const handleBackgroundDoubleClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('.canvas-node')) return
  addNode({ type: 'text', text: '', width: 280, height: 180 }, screenToWorld(event.clientX, event.clientY))
}

const resolveFilePath = (file: string) => {
  if (/^[A-Za-z]:[\\/]/.test(file) || file.startsWith('/')) return file
  const separator = canvasPath.value.includes('\\') ? '\\' : '/'
  const parent = canvasPath.value.substring(0, Math.max(canvasPath.value.lastIndexOf('/'), canvasPath.value.lastIndexOf('\\')))
  return `${parent}${separator}${file.replace(/[\\/]/g, separator)}`
}
const isChartNode = (node: CanvasNode) => node.type === 'file'
  && typeof node.file === 'string'
  && node.file.toLocaleLowerCase().endsWith('.table.json')
  && typeof node.longeditViewId === 'string'
  && Boolean(node.longeditViewId)
const chartViewId = (node: CanvasNode) => typeof node.longeditViewId === 'string' ? node.longeditViewId : ''
const isMermaidNode = (node: CanvasNode) => node.type === 'file' && typeof node.file === 'string' && /\.(?:mmd|mermaid)$/i.test(node.file)
const openEmbeddedChart = (path: string) => openManagedFile(router, path)
const openEmbeddedDiagram = (path: string) => openManagedFile(router, path)
const openNode = async (node: CanvasNode) => {
  if (node.type === 'file' && node.file) {
    const path = resolveFilePath(node.file)
    const target = routeForFile(path)
    if (opensInLibraryShell(findFileFormat(path))) {
      openManagedFile(router, path)
    } else if (target) router.push(target)
    else message.warning('该文件格式尚未注册工作面')
  } else if (node.type === 'link' && node.url) {
    try { await openUrl(node.url) } catch { message.error('无法打开该链接') }
  }
}

const markDirty = () => {
  saveState.value = 'dirty'
}
const queueViewportSize = (entry?: ResizeObserverEntry) => {
  const rect = entry?.contentRect ?? viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  const next = {
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  }
  if (next.width === viewportSize.width && next.height === viewportSize.height) return
  pendingViewportSize = next
  if (viewportResizeFrame) return
  viewportResizeFrame = requestAnimationFrame(() => {
    viewportResizeFrame = 0
    const size = pendingViewportSize
    pendingViewportSize = null
    if (!size || (size.width === viewportSize.width && size.height === viewportSize.height)) return
    viewportSize.width = size.width
    viewportSize.height = size.height
  })
}
const saveCanvas = async () => {
  if (!canvasPath.value || !store.libraryPath || !['dirty', 'error'].includes(saveState.value)) return
  saveState.value = 'saving'
  try {
    await invoke('write_canvas_file', { libraryRoot: store.libraryPath, path: canvasPath.value, content: JSON.stringify(document, null, 2) + '\n' })
    saveState.value = 'saved'
  } catch (error) { saveState.value = 'error'; message.error(`Canvas 保存失败：${String(error)}`) }
}
const loadCanvas = async () => {
  loading.value = true; loadError.value = ''; selectedNodeIds.value = []; selectedEdgeId.value = null
  try {
    const result = await invoke<{ content: string }>('read_canvas_file', { libraryRoot: store.libraryPath, path: canvasPath.value })
    const parsed = JSON.parse(result.content) as CanvasDocument
    document.nodes = parsed.nodes || []; document.edges = parsed.edges || []
    edgeGeometryCache.clear()
    for (const key of Object.keys(document)) if (!['nodes', 'edges'].includes(key)) delete document[key]
    for (const [key, value] of Object.entries(parsed)) if (!['nodes', 'edges'].includes(key)) document[key] = value
    undoStack.value = []; redoStack.value = []
    loadCollapsedState()
    loadLayoutBackup()
    saveState.value = 'saved'
    const requestedNode = typeof route.query.node === 'string' ? route.query.node : ''
    if (requestedNode && document.nodes.some(node => node.id === requestedNode)) selectedNodeIds.value = [requestedNode]
    setTimeout(fitToContent, 0)
  } catch (error) { loadError.value = String(error) }
  finally { loading.value = false }
}

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement).matches('textarea,input,select,[contenteditable="true"]')) return
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 's') { event.preventDefault(); saveCanvas() }
  else if (command && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redo() }
  else if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); undo() }
  else if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
  else if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); void copySelection() }
  else if (command && event.key.toLowerCase() === 'x') { event.preventDefault(); void cutSelection() }
  else if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); void pasteSelection() }
  else if (command && event.key.toLowerCase() === 'a') { event.preventDefault(); selectedNodeIds.value = visibleNodes.value.map(node => node.id); selectedEdgeId.value = null }
  else if (!command && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectionCount.value > 0) {
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    nudgeSelection(dx, dy, event.repeat)
  }
  else if (event.key === 'Delete' || event.key === 'Backspace') removeSelection()
  else if (event.key === 'Escape') { setTool('select'); clearSelection() }
}
const mayLeave = () => !['dirty', 'error'].includes(saveState.value)
  || window.confirm('Canvas 还有未保存修改，确定离开并丢弃这些修改吗？')
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (!['dirty', 'error'].includes(saveState.value)) return
  event.preventDefault()
  event.returnValue = ''
}

watch([canvasPath, () => route.query.node], loadCanvas)
watch(snapEnabled, enabled => {
  localStorage.setItem('canvas-snap-enabled', String(enabled))
  if (!enabled) alignmentGuides.value = []
})
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', beforeUnload)
  if (viewportRef.value) {
    viewportResizeObserver = new ResizeObserver(entries => queueViewportSize(entries[entries.length - 1]))
    viewportResizeObserver.observe(viewportRef.value)
    queueViewportSize()
  }
  performanceFrameId = requestAnimationFrame(sampleCanvasPerformance)
  loadCanvas()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
  viewportResizeObserver?.disconnect()
  viewportResizeObserver = null
  if (viewportResizeFrame) cancelAnimationFrame(viewportResizeFrame)
  viewportResizeFrame = 0
  pendingViewportSize = null
  cancelAnimationFrame(performanceFrameId)
  edgeGeometryCache.clear()
})
onBeforeRouteLeave(() => mayLeave())
</script>

<style scoped>
.canvas-page { width: 100%; height: 100%; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto auto 1fr auto; overflow: hidden; color: var(--theme-text); background: var(--theme-bg); }
.canvas-header { min-height: 64px; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: var(--theme-border); background: color-mix(in srgb, var(--theme-surface) 92%, transparent); }
.header-main { display: flex; align-items: center; gap: 12px; min-width: 0; }.canvas-title { font-size: 16px; font-weight: 700; }.canvas-subtitle { margin-top: 2px; color: var(--theme-text-secondary); font-size: 11px; }
.icon-button, .canvas-toolbar button, .empty-canvas button, .canvas-overlay button { border: var(--theme-border); background: var(--theme-surface); color: var(--theme-text); border-radius: 8px; cursor: pointer; }
.icon-button { width: 36px; height: 36px; font-size: 20px; }.icon-button:hover, .canvas-toolbar button:hover { border-color: var(--theme-primary); color: var(--theme-primary); }
.save-state { display: flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; font-size: 12px; color: var(--theme-text-secondary); }.state-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }.save-state.dirty .state-dot { background: #f59e0b; }.save-state.saving .state-dot { background: #3b82f6; animation: pulse 1s infinite; }.save-state.error .state-dot { background: #ef4444; }
.canvas-toolbar { min-height: 48px; padding: 7px 14px; display: flex; gap: 6px; align-items: center; border-bottom: var(--theme-border); background: var(--theme-surface); overflow-x: auto; }.canvas-toolbar button { height: 32px; padding: 0 11px; white-space: nowrap; }.canvas-toolbar button.active, .canvas-toolbar button.primary { background: var(--theme-primary); border-color: var(--theme-primary); color: white; }.canvas-toolbar button:disabled { opacity: .4; cursor: default; }.toolbar-divider { height: 22px; border-left: var(--theme-border); margin: 0 3px; }.toolbar-spacer { flex: 1; }.color-tools { display: flex; gap: 4px; padding-left: 5px; }.canvas-toolbar .color-chip { width: 20px; height: 20px; padding: 0; border: 2px solid transparent; border-radius: 50%; }.canvas-toolbar .color-chip.active { outline: 2px solid var(--theme-text); outline-offset: 1px; }
.canvas-viewport { position: relative; overflow: hidden; cursor: grab; user-select: none; background: color-mix(in srgb, var(--theme-bg) 96%, var(--theme-primary)); }.canvas-viewport.panning { cursor: grabbing; }.canvas-viewport.connecting { cursor: crosshair; }.canvas-grid { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, color-mix(in srgb, var(--theme-text-secondary) 30%, transparent) 1px, transparent 1px); }.canvas-world { position: absolute; inset: 0; transform-origin: 0 0; will-change: transform; }
.selection-box { position: absolute; z-index: 20; box-sizing: border-box; pointer-events: none; border: 1px solid var(--theme-primary); border-radius: 4px; background: color-mix(in srgb, var(--theme-primary) 12%, transparent); }
.alignment-guide { position: absolute; z-index: 30; pointer-events: none; color: var(--theme-primary); background: currentColor; box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-surface) 72%, transparent); }
.alignment-guide.guide-x { width: 1px; transform: translateX(-.5px); }
.alignment-guide.guide-y { height: 1px; transform: translateY(-.5px); }
.alignment-guide span { position: absolute; padding: 2px 5px; border-radius: 999px; background: var(--theme-primary); color: white; font-size: var(--text-compact); font-weight: 700; line-height: 1.3; white-space: nowrap; }
.alignment-guide.guide-x span { left: 5px; top: 4px; }
.alignment-guide.guide-y span { left: 4px; top: 5px; }
.edge-inspector { position: absolute; z-index: 50; top: 16px; right: 16px; width: min(310px, calc(100% - 32px)); box-sizing: border-box; padding: 14px; display: grid; gap: 12px; border: var(--theme-border); border-radius: 14px; background: color-mix(in srgb, var(--theme-surface) 96%, transparent); box-shadow: 0 18px 50px rgba(0,0,0,.16); user-select: none; }
.inspector-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }.inspector-header > div { min-width: 0; display: grid; gap: 2px; }.inspector-header strong { font-size: 14px; }.inspector-header span { overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }.inspector-header button { width: 27px; height: 27px; flex: 0 0 auto; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); cursor: pointer; font-size: 18px; }.inspector-header button:hover { background: color-mix(in srgb, var(--theme-primary) 10%, transparent); color: var(--theme-primary); }
.inspector-field { display: grid; gap: 5px; min-width: 0; }.inspector-field > span { color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 700; }.inspector-field input:not([type="color"]), .inspector-field select { width: 100%; height: 33px; box-sizing: border-box; padding: 0 9px; border: var(--theme-border); border-radius: 8px; outline: 0; background: var(--theme-bg); color: var(--theme-text); font: inherit; font-size: 12px; }.inspector-field input:focus, .inspector-field select:focus { border-color: var(--theme-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-primary) 12%, transparent); }.side-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.edge-color-tools { display: flex; align-items: center; gap: 7px; }.edge-color-tools button { width: 22px; height: 22px; padding: 0; border: 2px solid transparent; border-radius: 50%; cursor: pointer; color: var(--theme-text-secondary); }.edge-color-tools button:first-child { border: var(--theme-border); background: var(--theme-bg); }.edge-color-tools button.active { outline: 2px solid var(--theme-text); outline-offset: 1px; }.custom-edge-color { width: 23px; height: 23px; margin-left: auto; overflow: hidden; border: var(--theme-border); border-radius: 7px; cursor: pointer; }.custom-edge-color input { width: 34px; height: 34px; margin: -6px; padding: 0; border: 0; cursor: pointer; }
.edge-layer { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; color: color-mix(in srgb, var(--theme-text-secondary) 75%, var(--theme-primary)); }.edge-line { fill: none; stroke: currentColor; stroke-width: 2; }.edge-hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }.canvas-edge.selected { color: var(--theme-primary); }.canvas-edge.selected .edge-line { stroke-width: 3; }.canvas-edge text { fill: var(--theme-text-secondary); font-size: 12px; text-anchor: middle; paint-order: stroke; stroke: var(--theme-bg); stroke-width: 4px; }.canvas-edge .edge-relation-type { font-size: var(--text-compact); font-weight: 700; opacity: .78; }
.canvas-node { position: absolute; box-sizing: border-box; overflow: hidden; border: 2px solid color-mix(in srgb, var(--node-color) 52%, var(--theme-border-color, #aaa)); border-radius: 13px; background: color-mix(in srgb, var(--theme-surface) 94%, var(--node-color)); box-shadow: 0 8px 24px rgba(0,0,0,.08); cursor: move; transform-origin: center; }.canvas-node::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--node-color); }.canvas-node.selected { border-color: var(--node-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 20%, transparent), 0 12px 30px rgba(0,0,0,.14); }.canvas-node.connect-source { animation: sourcePulse 1s infinite; }
.canvas-node.collapsed { border-style: double; box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 12%, transparent), 0 10px 26px rgba(0,0,0,.1); }
.branch-toggle { position: absolute; z-index: 5; right: 7px; top: 7px; min-width: 23px; height: 23px; padding: 0 5px; border: 1px solid color-mix(in srgb, var(--node-color) 48%, var(--theme-border-color, #aaa)); border-radius: 999px; background: color-mix(in srgb, var(--theme-surface) 94%, var(--node-color)); color: var(--node-color); cursor: pointer; font-size: 11px; font-weight: 800; line-height: 1; }.branch-toggle:hover, .branch-toggle.collapsed { background: var(--node-color); color: white; }
.canvas-node:not(.node-group) { z-index: 2; }
.node-text { padding: 12px 14px 12px 17px; }.node-text textarea { width: 100%; height: 100%; resize: none; border: 0; outline: 0; background: transparent; color: var(--theme-text); font: 14px/1.55 ui-sans-serif, system-ui; cursor: text; user-select: text; }
.node-file, .node-link { padding: 16px 18px 14px 21px; display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto 1fr auto; column-gap: 10px; }.node-kind { grid-column: 2; color: var(--theme-text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }.node-icon { grid-row: 1 / 4; align-self: center; font-size: 30px; color: var(--node-color); }.node-label { grid-column: 2; align-self: center; overflow: hidden; text-overflow: ellipsis; font-weight: 650; word-break: break-all; }.node-hint { grid-column: 2; color: var(--theme-text-secondary); font-size: 11px; }
.node-file.chart-node, .node-file.diagram-node { display: block; padding: 0; background: var(--theme-surface); }.node-file.chart-node::before, .node-file.diagram-node::before { display: none; }
.node-group { z-index: 0 !important; border-style: dashed; background: color-mix(in srgb, var(--node-color) 5%, transparent); box-shadow: none; overflow: visible; }.node-group::before { inset: 0 0 auto; width: auto; height: 4px; }.node-group input { width: calc(100% - 28px); height: 34px; margin: 10px 14px; padding: 0 8px; border: 0; outline: 0; background: color-mix(in srgb, var(--theme-surface) 82%, transparent); color: var(--theme-text); font-weight: 700; border-radius: 7px; cursor: text; }
.resize-handle { position: absolute; right: 2px; bottom: 2px; width: 15px; height: 15px; border: 0; background: linear-gradient(135deg, transparent 45%, var(--node-color) 46%, var(--node-color) 58%, transparent 59%, transparent 70%, var(--node-color) 71%); cursor: nwse-resize; }
.canvas-overlay, .empty-canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px; border: var(--theme-border); border-radius: 16px; background: color-mix(in srgb, var(--theme-surface) 94%, transparent); box-shadow: 0 18px 50px rgba(0,0,0,.12); text-align: center; }.canvas-overlay.error strong { color: #ef4444; }.canvas-overlay span { max-width: 520px; color: var(--theme-text-secondary); word-break: break-word; }.canvas-overlay button, .empty-canvas button { padding: 8px 14px; }.empty-canvas { pointer-events: none; }.empty-canvas button { pointer-events: auto; }.empty-icon { font-size: 44px; color: var(--theme-primary); }.empty-canvas h2 { margin: 0; font-size: 19px; }.empty-canvas p { margin: 0; max-width: 420px; color: var(--theme-text-secondary); font-size: 13px; }
.canvas-statusbar { min-height: 28px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: var(--theme-border); background: var(--theme-surface); color: var(--theme-text-secondary); font-size: 11px; }
@keyframes pulse { 50% { opacity: .35; } } @keyframes sourcePulse { 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--node-color) 13%, transparent); } }
@media (max-width: 800px) { .canvas-subtitle, .canvas-statusbar span:last-child { display: none; }.canvas-toolbar { padding-inline: 8px; scrollbar-gutter: stable; }.canvas-header { min-height: 52px; padding: 7px 10px; }.canvas-title { max-width: 55vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.save-state { flex: none; padding-inline: 6px; } }
</style>
