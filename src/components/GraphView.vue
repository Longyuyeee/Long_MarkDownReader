<template>
  <div class="graph-container" ref="containerRef" :class="`graph-canvas-theme-${graphCanvasTheme}`">
    <WorkspaceManagementHeader class="graph-header" title="知识图谱" @back="returnToLibrary">
      <template #icon><Network class="graph-header-icon" :size="18" /></template>
      <div class="graph-controls">
        <WorkspaceSegmentedControl class="view-switch" aria-label="图谱布局模式">
          <button :class="{ active: viewMode === 'network' }" @click="switchView('network')">关系网络</button>
          <button :class="{ active: viewMode === 'mindmap' }" @click="switchView('mindmap')">思维导图</button>
        </WorkspaceSegmentedControl>
        <label class="graph-search">
          <Search :size="14" />
          <input v-model="searchQuery" placeholder="搜索节点" @keydown.enter="focusFirstMatch" />
        </label>
        <button class="tutorial-btn" :class="{ active: showTutorial }" @click="showTutorial = !showTutorial" title="如何建立链接">
          <CircleHelp :size="16" />
          <span>如何建立链接</span>
        </button>
        <button class="health-entry" :class="{ active: healthOpen }" @click="healthOpen = !healthOpen">
          <span class="health-dot"></span>知识治理
        </button>
        <button class="graph-export-btn" :disabled="isExporting" @click="exportGraph('svg')">导出 SVG</button>
        <button class="graph-export-btn" :disabled="isExporting" @click="exportGraph('png')">导出 PNG</button>
        <button class="control-btn" @click="resetLayout" title="清除已保存位置并重新布局">
          <RotateCcw :size="16" />
        </button>
        <button class="control-btn" :disabled="!layoutUndoStack.length" @click="undoLayout" title="撤销画布调整">
          <Undo2 :size="16" />
        </button>
        <button class="control-btn" :disabled="!layoutRedoStack.length" @click="redoLayout" title="重做画布调整">
          <Redo2 :size="16" />
        </button>
        <button class="control-btn" @click="changeGraphZoom(1.2)" title="放大">
          <ZoomIn :size="16" />
        </button>
        <button class="control-btn" @click="changeGraphZoom(0.8)" title="缩小">
          <ZoomOut :size="16" />
        </button>
        <button class="control-btn" @click="fitGraph" title="适合窗口">
          <Maximize2 :size="16" />
        </button>
      </div>
    </WorkspaceManagementHeader>
    <div class="graph-options">
      <GraphFilterControls :graph="graphData" :show-search="false" />
      <span class="option-divider"></span>
      <label>布局
        <select v-model="graphLayoutMode" @change="applySelectedLayout">
          <option value="force">自动网络</option>
          <option value="tree">树状</option>
          <option value="organization">组织</option>
          <option value="radial">放射</option>
          <option value="timeline">时间线</option>
        </select>
      </label>
      <label>主题
        <select v-model="graphCanvasTheme">
          <option value="professional">专业</option>
          <option value="colorful">多彩</option>
          <option value="focus">专注</option>
        </select>
      </label>
      <template v-if="viewMode === 'mindmap'">
        <span class="option-divider"></span>
        <label>展开深度
          <select v-model.number="mindmapDepth" @change="refreshMindMap">
            <option :value="1">1 层</option>
            <option :value="2">2 层</option>
            <option :value="3">3 层</option>
            <option :value="4">4 层</option>
          </select>
        </label>
        <span class="mindmap-root">中心：{{ mindmapRoot?.title || '请选择节点' }}</span>
      </template>
      <span v-if="searchQuery" class="match-count">{{ visibleNodes.length }} 个匹配</span>
    </div>
    <div v-if="remediationCopy" class="remediation-banner" data-testid="graph-remediation-focus" :data-remediation-focus="remediationFocus">
      <div class="remediation-copy"><strong>{{ remediationCopy.title }}</strong><span>{{ remediationCopy.detail }}</span></div>
      <div class="remediation-actions">
        <button v-if="remediationCopy.action" @click="runRemediationAction">{{ remediationCopy.action }}</button>
        <button data-testid="knowledge-outcome-entry" @click="openKnowledgeOutcome">复查改善</button>
      </div>
      <button class="remediation-close" aria-label="关闭行动提示" @click="clearRemediation">×</button>
    </div>
    <canvas
      ref="canvasRef"
      tabindex="0"
      aria-label="产品知识图谱画布"
      :data-layout-mode="graphLayoutMode"
      :data-selected-count="selectedNodeIds.length"
      @mousedown="startDrag"
      @mousemove="onDrag"
      @mouseup="endDrag"
      @mouseleave="endDrag"
      @wheel.prevent="onZoom"
      @click="onClick"
      @dblclick="onDblClick"
    ></canvas>
    <GraphHealthPanel
      :open="healthOpen"
      :library-root="store.libraryPath"
      @close="healthOpen = false"
      @open-file="openPath"
      @repaired="handleHealthRepaired"
    />

    <transition name="hint-fade">
      <div v-if="isLoading" class="graph-loading" role="status" aria-live="polite">
        <div class="graph-loader" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <strong>正在构建知识图谱</strong>
        <p>正在分析笔记之间的链接关系...</p>
      </div>
    </transition>

    <!-- 空状态和随时可打开的链接教程 -->
    <transition name="hint-fade">
    <div v-if="!isLoading && (showTutorial || graphData.nodes.length === 0)" class="empty-graph-hint tutorial-card">
      <button v-if="showTutorial && graphData.nodes.length > 0" class="tutorial-close" @click="showTutorial = false" aria-label="关闭教程">×</button>
      <div class="empty-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <circle cx="5" cy="5" r="2"/>
          <circle cx="19" cy="5" r="2"/>
          <circle cx="5" cy="19" r="2"/>
          <circle cx="19" cy="19" r="2"/>
          <line x1="8.5" y1="6.5" x2="10.5" y2="10.5"/>
          <line x1="15.5" y1="6.5" x2="13.5" y2="10.5"/>
          <line x1="8.5" y1="17.5" x2="10.5" y2="13.5"/>
          <line x1="15.5" y1="17.5" x2="13.5" y2="13.5"/>
        </svg>
      </div>
      <h3>{{ graphData.nodes.length === 0 ? '用双向链接点亮知识图谱' : '如何建立笔记链接' }}</h3>
      <p class="tutorial-intro">在任意 Markdown 笔记中输入双方括号语法，保存后即可生成节点与连线。</p>
      <div class="tutorial-steps">
        <div class="tutorial-step">
          <span class="step-number">1</span>
          <div><strong>准备目标笔记</strong><p>例如已有一篇名为“会议记录.md”的笔记</p></div>
        </div>
        <div class="tutorial-step">
          <span class="step-number">2</span>
          <div><strong>在另一篇笔记中输入链接</strong><code>[[会议记录]]</code></div>
        </div>
        <div class="tutorial-step">
          <span class="step-number">3</span>
          <div><strong>保存并返回知识图谱</strong><p>图谱会自动识别链接并建立连线</p></div>
        </div>
      </div>
      <div class="tutorial-note">
        跨目录可写 <code>[[子目录/文件名]]</code>；文件名在知识库中唯一时，也可直接写 <code>[[文件名]]</code>。
      </div>
      <button class="tutorial-action" @click="returnToLibrary">返回编辑器试一试</button>
    </div>
    </transition>

    <WorkspaceStatusBar class="graph-stats">
      <div class="stat-item">
        <Circle :size="14" />
        {{ visibleNodes.length }} / {{ graphData.nodes.length }} 节点
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <Link2 :size="14" />
        {{ visibleEdges.length }} 连接
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <Search :size="14" />
        {{ Math.round(zoomLevel * 100) }}%
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        {{ selectedNodeIds.length }} 个已选
      </div>
    </WorkspaceStatusBar>
    <!-- 节点悬浮提示 -->
    <transition name="tooltip-fade">
      <div v-if="hoveredNode" class="node-tooltip" :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">
        <div class="tooltip-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <strong>{{ hoveredNode.title }}</strong>
          <small>{{ objectTypeLabel(hoveredNode.objectType) }}</small>
        </div>
        <span class="tip-path">{{ hoveredNode.locationLabel || displayWorkspacePath(hoveredNode.path) }}</span>
        <div class="tooltip-hint">双击打开 · 拖拽移动</div>
      </div>
    </transition>
    <transition name="details-slide">
      <aside v-if="selectedNode && selectedNodeIds.length === 1" class="node-details" data-testid="graph-selected-node" :data-node-id="selectedNode.id">
        <button class="details-close" @click="clearSelection" aria-label="关闭节点详情">×</button>
        <span class="details-kicker">节点详情</span>
        <h3>{{ selectedNode.title }}</h3>
        <p class="details-path">{{ displayWorkspacePath(selectedNode.path) }}<template v-if="selectedNode.locationLabel"> · {{ selectedNode.locationLabel }}</template></p>
        <div class="details-metrics">
          <div><strong>{{ nodeDegree(selectedNode.id) }}</strong><span>关系</span></div>
          <div><strong>{{ incomingCount(selectedNode.id) }}</strong><span>反向链接</span></div>
          <div><strong>{{ outgoingCount(selectedNode.id) }}</strong><span>出链</span></div>
        </div>
        <div class="details-actions">
          <button class="primary-action" @click="openNode(selectedNode)">打开{{ objectTypeLabel(selectedNode.objectType) }}</button>
          <button @click="useAsMindmapRoot(selectedNode)">设为思维导图中心</button>
          <button :disabled="isCreatingCanvas || Boolean(selectedNode.parentId)" @click="sendToCanvas(selectedNode)">{{ isCreatingCanvas ? '正在生成…' : '发送到可编辑画布' }}</button>
          <button :disabled="isCreatingProject || !canCreateProjectNote(selectedNode)" @click="createProjectNote(selectedNode)">{{ isCreatingProject ? '正在生成…' : '生成项目笔记' }}</button>
          <button :disabled="isSavingCollection || !canCreateProjectNote(selectedNode)" @click="saveGraphCollection(selectedNode)">{{ isSavingCollection ? '正在保存…' : '保存为智能集合' }}</button>
        </div>
        <div v-if="selectedNode.objectType === 'markdown'" class="relation-editor">
          <span class="neighbor-title">建立语义关系</span>
          <div class="relation-editor-grid">
            <select v-model="relationDraftType" aria-label="关系类型">
              <option v-for="option in relationTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select v-model="relationDraftTarget" aria-label="关系目标">
              <option value="">选择目标笔记</option>
              <option v-for="node in relationCandidates" :key="node.id" :value="node.path">{{ node.title }} · {{ node.directory || '根目录' }}</option>
            </select>
            <button :disabled="relationSaving || !relationDraftTarget" @click="addGraphRelation">{{ relationSaving ? '写入中…' : '添加关系' }}</button>
          </div>
          <small>关系写入源笔记 Frontmatter，Markdown 始终是事实源。</small>
        </div>
        <div v-if="selectedRelations.length" class="details-relations">
          <span class="neighbor-title">关系依据</span>
          <div
            v-for="relation in selectedRelations.slice(0, 12)"
            :key="`${relation.edge.source}-${relation.edge.target}`"
            class="details-relation-card"
          >
            <button class="relation-focus" @click="selectAndCenter(relation.other)">
              <span class="details-relation-head">
                <strong>{{ relation.other.title }}</strong>
                <small>{{ relation.direction === 'related' ? '相关' : relation.direction === 'outgoing' ? '链出 →' : '← 链入' }}</small>
              </span>
              <span class="details-relation-context">{{ relation.evidence?.context || relation.evidence?.syntax || '结构关系' }}</span>
              <span class="details-relation-meta">
                <code>{{ relation.evidence?.syntax || relationTypeLabel(relation.edge.relationType) }}</code>
                <span>{{ relationTypeLabel(relation.edge.relationType) }}<template v-if="relation.evidence?.line"> · 第 {{ relation.evidence.line }} 行</template><template v-if="relation.edge.mentions.length > 1"> · {{ relation.edge.mentions.length }} 处</template></span>
              </span>
            </button>
            <button v-if="canDeleteRelation(relation)" class="relation-delete" :disabled="relationSaving" title="从源笔记删除此语义关系" @click="removeGraphRelation(relation)">删除</button>
          </div>
        </div>
        <div v-if="selectedNeighbors.length" class="neighbor-list">
          <span class="neighbor-title">相关笔记</span>
          <button v-for="node in selectedNeighbors.slice(0, 12)" :key="node.id" @click="selectAndCenter(node)">
            <span>{{ node.title }}</span><small>{{ nodeDegree(node.id) }} 条关系</small>
          </button>
        </div>
      </aside>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRoute, useRouter } from 'vue-router'
import { Circle, CircleHelp, Link2, Maximize2, Network, Redo2, RotateCcw, Search, Undo2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { managedFileLocation, openManagedFile } from '../services/fileNavigation'
import { useAppStore } from '../store/app'
import { getActiveThemeTone, isActiveThemeDark } from '../config/themePresets'
import GraphFilterControls from './GraphFilterControls.vue'
import GraphHealthPanel from './GraphHealthPanel.vue'
import WorkspaceManagementHeader from './workspace/WorkspaceManagementHeader.vue'
import WorkspaceSegmentedControl from './workspace/WorkspaceSegmentedControl.vue'
import WorkspaceStatusBar from './workspace/WorkspaceStatusBar.vue'
import { applyGraphFilters, useGraphFilters } from '../composables/useGraphFilters'
import { clearGraphLayout, createGraphSvg, graphSvgToPng, restoreGraphLayout, saveGraphLayout } from '../utils/graphWorkspace'
import type { GraphData, GraphNode } from '../types/graph'

const props = defineProps<{ show?: boolean }>()
const emit = defineEmits(['selectFile'])

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const store = useAppStore()
const router = useRouter()
const route = useRoute()

const graphData = ref<GraphData>({ nodes: [], edges: [] })
const isLoading = ref(true)
const showTutorial = ref(false)
const isCreatingCanvas = ref(false)
const isExporting = ref(false)
const healthOpen = ref(false)
const isCreatingProject = ref(false)
const isSavingCollection = ref(false)
const viewMode = ref<'network' | 'mindmap'>('network')
const { filters } = useGraphFilters()
const searchQuery = computed({ get: () => filters.query, set: value => { filters.query = value } })
const selectedNode = ref<GraphNode | null>(null)
const selectedNodeIds = ref<string[]>([])
type GraphLayoutMode = 'force' | 'tree' | 'organization' | 'radial' | 'timeline'
type GraphCanvasTheme = 'professional' | 'colorful' | 'focus'
type LayoutSnapshot = { mode: GraphLayoutMode; positions: Record<string, { x: number; y: number }> }
const graphLayoutMode = ref<GraphLayoutMode>((localStorage.getItem('longedit.graph.layout-mode') as GraphLayoutMode) || 'force')
const graphCanvasTheme = ref<GraphCanvasTheme>((localStorage.getItem('longedit.graph.canvas-theme') as GraphCanvasTheme) || 'colorful')
const zoomLevel = ref(1)
const layoutUndoStack = ref<LayoutSnapshot[]>([])
const layoutRedoStack = ref<LayoutSnapshot[]>([])
const mindmapRoot = ref<GraphNode | null>(null)
const mindmapDepth = ref(3)
const mindmapNodeIds = ref<Set<string> | null>(null)
const relationSaving = ref(false)
const relationDraftType = ref('related')
const relationDraftTarget = ref('')
const relationTypeOptions = [
  { value: 'related', label: '相关' },
  { value: 'parent', label: '父级' },
  { value: 'child', label: '子级' },
  { value: 'depends-on', label: '依赖' },
  { value: 'contains', label: '包含' },
  { value: 'cites', label: '引用文献' },
  { value: 'derived-from', label: '派生自' },
]
const editableRelationTypes = new Set(relationTypeOptions.map(option => option.value))
const remediationFocus = computed(() => typeof route.query.focus === 'string' && ['relations', 'orphans', 'diversity', 'overview'].includes(route.query.focus) ? route.query.focus : '')
const remediationCopy = computed(() => ({
  relations: { title: '建立第一条知识关系', detail: '从链接教程开始，或选中 Markdown 节点建立带语义的关系。', action: '打开链接教程' },
  orphans: { title: '正在聚焦孤立对象', detail: '画布仅显示没有关系的对象；可在治理列表中逐项打开并补充链接。', action: '打开治理列表' },
  diversity: { title: '丰富关系语义', detail: '选择节点后使用“相关、依赖、包含、引用”等关系，避免所有连接表达同一种含义。', action: '' },
  overview: { title: '知识网络状态良好', detail: '继续从核心主题检查关系依据，或切换思维导图查看层级。', action: '' },
} as Record<string, { title: string; detail: string; action: string }>)[remediationFocus.value] || null)

const degreeMap = computed(() => {
  const result = new Map<string, number>()
  for (const edge of graphData.value.edges) {
    result.set(edge.source, (result.get(edge.source) || 0) + 1)
    result.set(edge.target, (result.get(edge.target) || 0) + 1)
  }
  return result
})

const filteredGraph = computed(() => applyGraphFilters(graphData.value, filters))
const remediationGraph = computed(() => {
  if (remediationFocus.value !== 'orphans') return filteredGraph.value
  const connected = new Set(graphData.value.edges.flatMap(edge => [edge.source, edge.target]))
  return { nodes: filteredGraph.value.nodes.filter(node => !connected.has(node.id)), edges: [] }
})
const visibleNodes = computed(() => {
  return remediationGraph.value.nodes.filter(node =>
    viewMode.value !== 'mindmap' || !mindmapNodeIds.value || mindmapNodeIds.value.has(node.id)
  )
})

const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleEdges = computed(() => remediationGraph.value.edges.filter(edge => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)))
const clearRemediation = () => {
  const query = { ...route.query }
  delete query.focus
  router.replace({ name: 'Graph', query })
}
const runRemediationAction = () => {
  if (remediationFocus.value === 'relations') showTutorial.value = true
  if (remediationFocus.value === 'orphans') healthOpen.value = true
}
const openKnowledgeOutcome = () => router.push({ name: 'Settings', query: { focus: 'knowledge-observation' } })
const returnToLibrary = () => store.activeTabId
  ? router.push(managedFileLocation(store.activeTabId))
  : router.push({ name: 'LibraryMode' })
const nodeDegree = (id: string) => degreeMap.value.get(id) || 0
const incomingCount = (id: string) => graphData.value.edges.filter(edge => edge.target === id).length
const outgoingCount = (id: string) => graphData.value.edges.filter(edge => edge.source === id).length
const selectedNeighbors = computed(() => {
  if (!selectedNode.value) return []
  const ids = new Set<string>()
  for (const edge of graphData.value.edges) {
    if (edge.source === selectedNode.value.id) ids.add(edge.target)
    if (edge.target === selectedNode.value.id) ids.add(edge.source)
  }
  return graphData.value.nodes.filter(node => ids.has(node.id)).sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))
})
const selectedRelations = computed(() => {
  if (!selectedNode.value) return []
  const nodeMap = new Map(graphData.value.nodes.map(node => [node.id, node]))
  return graphData.value.edges.flatMap(edge => {
    const outgoing = edge.source === selectedNode.value?.id
    const incoming = edge.target === selectedNode.value?.id
    if (!outgoing && !incoming) return []
    const other = nodeMap.get(outgoing ? edge.target : edge.source)
    if (!other) return []
    return [{
      edge,
      other,
      direction: !edge.directed ? 'related' as const : outgoing ? 'outgoing' as const : 'incoming' as const,
      evidence: edge.mentions[0],
    }]
  }).sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'outgoing' ? -1 : 1
    return a.other.title.localeCompare(b.other.title, 'zh-CN')
  })
})
const relationCandidates = computed(() => graphData.value.nodes
  .filter(node => node.objectType === 'markdown' && node.id !== selectedNode.value?.id)
  .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')))
const relationTypeLabel = (type: string) => ({
  'links-to': '普通引用', parent: '父级', child: '子级', 'depends-on': '依赖', related: '相关',
  contains: '包含', cites: '引用文献', annotates: '批注', 'derived-from': '派生自',
}[type] || type || '关系')

type SelectedRelation = (typeof selectedRelations.value)[number]
const relationSourceNode = (relation: SelectedRelation) => graphData.value.nodes.find(node => node.id === relation.edge.source)
const canDeleteRelation = (relation: SelectedRelation) => {
  const source = relationSourceNode(relation)
  return Boolean(source?.objectType === 'markdown'
    && source.contentSignature
    && relation.evidence?.line
    && relation.evidence?.syntax
    && editableRelationTypes.has(relation.edge.relationType))
}

const reloadAfterRelationMutation = async (selectedPath: string) => {
  clearSelection()
  await loadGraph()
  const refreshed = graphData.value.nodes.find(node => node.path === selectedPath)
  if (refreshed) selectOnly(refreshed)
}

const addGraphRelation = async () => {
  const source = selectedNode.value
  if (!source?.contentSignature || !relationDraftTarget.value || relationSaving.value) return
  relationSaving.value = true
  try {
    await invoke('update_graph_relation', {
      libraryRoot: store.libraryPath,
      mutation: {
        sourcePath: source.path,
        targetPath: relationDraftTarget.value,
        relationType: relationDraftType.value,
        action: 'add',
        expectedSignature: source.contentSignature,
      },
    })
    relationDraftTarget.value = ''
    await reloadAfterRelationMutation(source.path)
  } catch (error) {
    window.alert(`添加图谱关系失败：${String(error)}`)
  } finally {
    relationSaving.value = false
  }
}

const removeGraphRelation = async (relation: SelectedRelation) => {
  const source = relationSourceNode(relation)
  const evidence = relation.evidence
  if (!source?.contentSignature || !evidence || relationSaving.value) return
  relationSaving.value = true
  const selectedPath = selectedNode.value?.path || source.path
  try {
    await invoke('update_graph_relation', {
      libraryRoot: store.libraryPath,
      mutation: {
        sourcePath: source.path,
        targetPath: relation.edge.target,
        relationType: relation.edge.relationType,
        action: 'remove',
        expectedSignature: source.contentSignature,
        expectedLine: evidence.line,
        expectedSyntax: evidence.syntax,
      },
    })
    await reloadAfterRelationMutation(selectedPath)
  } catch (error) {
    window.alert(`删除图谱关系失败：${String(error)}`)
  } finally {
    relationSaving.value = false
  }
}

// 图谱布局常量
const LAYOUT_MAX_FRAMES = 120
const LAYOUT_OPTIMIZATION_START_FRAME = 60
const LAYOUT_FRAME_SKIP = 3
const LAYOUT_SETTLE_THRESHOLD = 0.8
const LAYOUT_MIN_FRAMES = 30

let animationId = 0
let dragging: GraphNode | null = null
let wasDragging = false
let offsetX = 0, offsetY = 0
let viewX = 0, viewY = 0, zoom = 1
let dragStartWorldX = 0, dragStartWorldY = 0
let dragStartPositions = new Map<string, { x: number; y: number }>()
let dragSnapshot: LayoutSnapshot | null = null
let selectionBox: { startX: number; startY: number; x: number; y: number } | null = null
let frameCount = 0
let layoutSettled = false
const hoveredNode = ref<GraphNode | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
let mouseX = 0, mouseY = 0
let layoutSaveTimer = 0

const currentLayoutId = () => viewMode.value === 'mindmap'
  ? `mindmap:${mindmapRoot.value?.id || 'none'}:${mindmapDepth.value}:${graphLayoutMode.value}`
  : `network:${graphLayoutMode.value}`

const layoutNodes = () => viewMode.value === 'network' ? graphData.value.nodes : visibleNodes.value
const persistLayout = () => saveGraphLayout(store.libraryPath, currentLayoutId(), layoutNodes())
const scheduleLayoutSave = () => {
  window.clearTimeout(layoutSaveTimer)
  const libraryRoot = store.libraryPath
  const layoutId = currentLayoutId()
  const nodes = layoutNodes()
  layoutSaveTimer = window.setTimeout(() => saveGraphLayout(libraryRoot, layoutId, nodes), 350)
}

const loadGraph = async () => {
  isLoading.value = true
  if (!store.libraryPath) {
    graphData.value = { nodes: [], edges: [] }
    isLoading.value = false
    return
  }
  try {
    graphData.value = await invoke<any>('build_link_graph', { libraryRoot: store.libraryPath })
    const strongest = [...graphData.value.nodes].sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))[0]
    const requestedRoot = typeof route.query.root === 'string'
      ? graphData.value.nodes.find(node => node.id === route.query.root)
      : undefined
    const initialNode = requestedRoot || selectedNode.value || strongest
    const compactViewport = window.matchMedia('(max-width: 900px)').matches
    if (initialNode && (requestedRoot || selectedNode.value || !compactViewport)) {
      selectOnly(initialNode)
    }

    if (route.query.mode === 'mindmap' && initialNode) {
      viewMode.value = 'mindmap'
      applyMindMapLayout(initialNode)
    } else {
      initLayout()
    }
  } catch (e) {
    graphData.value = { nodes: [], edges: [] }
  } finally {
    isLoading.value = false
  }
}

const initLayout = () => {
  const nodes = graphData.value.nodes
  const cx = (containerRef.value?.clientWidth || 800) / 2
  const cy = (containerRef.value?.clientHeight || 600) / 2
  const restored = restoreGraphLayout(store.libraryPath, currentLayoutId(), nodes)
  nodes.forEach(n => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      n.x = cx + (Math.random() - 0.5) * 400
      n.y = cy + (Math.random() - 0.5) * 400
    }
    n.vx = 0; n.vy = 0
  })
  frameCount = restored === nodes.length && nodes.length > 0 ? LAYOUT_MAX_FRAMES : 0
  layoutSettled = restored === nodes.length && nodes.length > 0
  if (!restored && graphLayoutMode.value !== 'force') positionGraphLayout(graphLayoutMode.value)
}

const adjacencyFor = (id: string) => {
  const ids = new Set<string>()
  for (const edge of graphData.value.edges) {
    if (edge.source === id) ids.add(edge.target)
    if (edge.target === id) ids.add(edge.source)
  }
  return [...ids]
}

let activeLayoutMode = graphLayoutMode.value
const captureLayoutSnapshot = (mode: GraphLayoutMode = graphLayoutMode.value): LayoutSnapshot => ({
  mode,
  positions: Object.fromEntries(layoutNodes().filter(node => Number.isFinite(node.x) && Number.isFinite(node.y)).map(node => [node.id, { x: node.x!, y: node.y! }])),
})
const restoreLayoutSnapshot = (snapshot: LayoutSnapshot) => {
  graphLayoutMode.value = snapshot.mode
  activeLayoutMode = snapshot.mode
  const nodes = layoutNodes()
  for (const node of nodes) {
    const point = snapshot.positions[node.id]
    if (!point) continue
    node.x = point.x; node.y = point.y; node.vx = 0; node.vy = 0
  }
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  scheduleLayoutSave()
}
const pushLayoutUndo = (before: LayoutSnapshot) => {
  const after = captureLayoutSnapshot()
  if (JSON.stringify(before.positions) === JSON.stringify(after.positions) && before.mode === after.mode) return
  layoutUndoStack.value.push(before)
  if (layoutUndoStack.value.length > 100) layoutUndoStack.value.shift()
  layoutRedoStack.value = []
}
const undoLayout = () => {
  const previous = layoutUndoStack.value.pop()
  if (!previous) return
  layoutRedoStack.value.push(captureLayoutSnapshot())
  restoreLayoutSnapshot(previous)
}
const redoLayout = () => {
  const next = layoutRedoStack.value.pop()
  if (!next) return
  layoutUndoStack.value.push(captureLayoutSnapshot())
  restoreLayoutSnapshot(next)
}
const graphLevels = (nodes: GraphNode[], root: GraphNode) => {
  const allowed = new Set(nodes.map(node => node.id))
  const visited = new Set<string>([root.id])
  const levels: GraphNode[][] = [[root]]
  let frontier = [root.id]
  while (frontier.length && visited.size < nodes.length) {
    const next: string[] = []
    const level: GraphNode[] = []
    for (const id of frontier) {
      for (const neighborId of adjacencyFor(id)) {
        if (!allowed.has(neighborId) || visited.has(neighborId)) continue
        const node = nodes.find(candidate => candidate.id === neighborId)
        if (!node) continue
        visited.add(neighborId); next.push(neighborId); level.push(node)
      }
    }
    if (!level.length) break
    levels.push(level)
    frontier = next
  }
  const disconnected = nodes.filter(node => !visited.has(node.id))
  if (disconnected.length) levels.push(disconnected)
  return levels
}
const positionGraphLayout = (mode: GraphLayoutMode) => {
  const nodes = layoutNodes()
  if (!nodes.length) return
  const width = Math.max(760, canvasRef.value?.clientWidth || containerRef.value?.clientWidth || 1000)
  const height = Math.max(520, canvasRef.value?.clientHeight || containerRef.value?.clientHeight || 700)
  if (mode === 'force') {
    nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length)
      const radius = Math.min(width, height) * (0.2 + (index % 3) * 0.07)
      node.x = width / 2 + Math.cos(angle) * radius
      node.y = height / 2 + Math.sin(angle) * radius
      node.vx = 0; node.vy = 0
    })
    frameCount = 0
    layoutSettled = false
    return
  }
  const root = (selectedNode.value && nodes.includes(selectedNode.value) ? selectedNode.value : null)
    || (mindmapRoot.value && nodes.includes(mindmapRoot.value) ? mindmapRoot.value : null)
    || [...nodes].sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))[0]
  const levels = graphLevels(nodes, root)
  if (mode === 'tree') {
    levels.forEach((level, depth) => level.forEach((node, index) => {
      node.x = 140 + depth * 260
      node.y = ((index + 1) * height) / (level.length + 1)
    }))
  } else if (mode === 'organization') {
    levels.forEach((level, depth) => level.forEach((node, index) => {
      node.x = ((index + 1) * width) / (level.length + 1)
      node.y = 110 + depth * 150
    }))
  } else if (mode === 'radial') {
    root.x = width / 2; root.y = height / 2
    levels.slice(1).forEach((level, depthIndex) => level.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / level.length - Math.PI / 2
      const radius = 180 + depthIndex * 170
      node.x = width / 2 + Math.cos(angle) * radius
      node.y = height / 2 + Math.sin(angle) * radius
    }))
  } else {
    const ordered = [...nodes].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    ordered.forEach((node, index) => {
      node.x = 120 + index * 220
      node.y = height / 2 + (index % 2 === 0 ? -75 : 75)
    })
  }
  nodes.forEach(node => { node.vx = 0; node.vy = 0 })
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
}
const applySelectedLayout = () => {
  const before = captureLayoutSnapshot(activeLayoutMode)
  activeLayoutMode = graphLayoutMode.value
  positionGraphLayout(graphLayoutMode.value)
  pushLayoutUndo(before)
  scheduleLayoutSave()
  requestAnimationFrame(fitGraph)
}

const applyMindMapLayout = (root: GraphNode) => {
  const nodeMap = new Map(graphData.value.nodes.map(node => [node.id, node]))
  const visited = new Set<string>([root.id])
  const levels: GraphNode[][] = [[root]]
  let frontier = [root.id]

  for (let depth = 1; depth <= mindmapDepth.value && frontier.length; depth++) {
    const next: string[] = []
    const level: GraphNode[] = []
    for (const id of frontier) {
      for (const neighborId of adjacencyFor(id)) {
        if (visited.has(neighborId)) continue
        const node = nodeMap.get(neighborId)
        if (!node) continue
        visited.add(neighborId)
        next.push(neighborId)
        level.push(node)
      }
    }
    if (level.length) levels.push(level)
    frontier = next
  }

  const height = Math.max(520, containerRef.value?.clientHeight || 600)
  levels.forEach((level, depth) => {
    level.sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))
    level.forEach((node, index) => {
      node.x = 150 + depth * 260
      node.y = depth === 0 ? height / 2 : ((index + 1) * height) / (level.length + 1)
      node.vx = 0
      node.vy = 0
    })
  })

  mindmapRoot.value = root
  mindmapNodeIds.value = visited
  restoreGraphLayout(store.libraryPath, currentLayoutId(), levels.flat())
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  viewX = 40
  viewY = 0
  zoom = Math.max(0.55, Math.min(1, 3.2 / Math.max(1, levels.length)))
  zoomLevel.value = zoom
}

const switchView = (mode: 'network' | 'mindmap') => {
  viewMode.value = mode
  searchQuery.value = ''
  if (mode === 'network') {
    mindmapNodeIds.value = null
    resetView()
    return
  }
  graphLayoutMode.value = 'tree'
  activeLayoutMode = 'tree'
  const root = selectedNode.value || [...graphData.value.nodes].sort((a, b) => nodeDegree(b.id) - nodeDegree(a.id))[0]
  if (root) applyMindMapLayout(root)
}

const refreshMindMap = () => {
  if (mindmapRoot.value) applyMindMapLayout(mindmapRoot.value)
}

const safeExportName = () => (store.currentLibraryName || '知识图谱').replace(/[\\/:*?"<>|]/g, '-').trim() || '知识图谱'
const exportGraph = async (format: 'svg' | 'png') => {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const tone = getActiveThemeTone(store.theme)
    const svg = createGraphSvg(visibleNodes.value, visibleEdges.value, {
      mode: viewMode.value,
      title: `${store.currentLibraryName} - ${viewMode.value === 'mindmap' ? '思维导图' : '知识图谱'}`,
      dark: isActiveThemeDark(store.theme),
      rootId: mindmapRoot.value?.id,
      colors: {
        background: tone.ui.background,
        foreground: tone.ui.text,
        card: tone.ui.surface,
        primary: tone.ui.primary,
        edge: tone.chartPalette[5],
      },
    })
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: `${safeExportName()}-${viewMode.value === 'mindmap' ? '思维导图' : '知识图谱'}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (!path) return
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const bytes = format === 'svg' ? new TextEncoder().encode(svg) : await graphSvgToPng(svg)
    await writeFile(path, bytes)
  } catch (error) {
    window.alert(`图谱导出失败：${String(error)}`)
  } finally {
    isExporting.value = false
  }
}

const useAsMindmapRoot = (node: GraphNode) => {
  selectOnly(node)
  viewMode.value = 'mindmap'
  graphLayoutMode.value = 'tree'
  activeLayoutMode = 'tree'
  searchQuery.value = ''
  applyMindMapLayout(node)
}

const clearSelection = () => { selectedNode.value = null; selectedNodeIds.value = [] }
const selectOnly = (node: GraphNode | null) => {
  selectedNode.value = node
  selectedNodeIds.value = node ? [node.id] : []
}
const toggleSelection = (node: GraphNode) => {
  const next = new Set(selectedNodeIds.value)
  next.has(node.id) ? next.delete(node.id) : next.add(node.id)
  selectedNodeIds.value = [...next]
  selectedNode.value = next.has(node.id) ? node : graphData.value.nodes.find(candidate => candidate.id === selectedNodeIds.value[selectedNodeIds.value.length - 1]) || null
}

const changeGraphZoom = (factor: number, clientX?: number, clientY?: number) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left
  const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top
  const next = Math.max(0.1, Math.min(3, zoom * factor))
  const worldX = (anchorX - viewX) / zoom
  const worldY = (anchorY - viewY) / zoom
  viewX = anchorX - worldX * next
  viewY = anchorY - worldY * next
  zoom = next
  zoomLevel.value = zoom
}
const fitGraph = () => {
  const canvas = canvasRef.value
  const nodes = visibleNodes.value
  if (!canvas || !nodes.length) return
  const extents = nodes.map(node => {
    const halfWidth = viewMode.value === 'mindmap' ? (node.id === mindmapRoot.value?.id ? 90 : 80) : Math.max(26, node.size * 0.75)
    const halfHeight = viewMode.value === 'mindmap' ? 28 : Math.max(40, node.size * 0.75 + 24)
    return { left: (node.x || 0) - halfWidth, right: (node.x || 0) + halfWidth, top: (node.y || 0) - halfHeight, bottom: (node.y || 0) + halfHeight }
  })
  const minX = Math.min(...extents.map(item => item.left)), maxX = Math.max(...extents.map(item => item.right))
  const minY = Math.min(...extents.map(item => item.top)), maxY = Math.max(...extents.map(item => item.bottom))
  zoom = Math.max(0.15, Math.min(1.35, Math.min((canvas.clientWidth - 100) / Math.max(1, maxX - minX), (canvas.clientHeight - 100) / Math.max(1, maxY - minY))))
  viewX = (canvas.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom
  viewY = (canvas.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom
  zoomLevel.value = zoom
}

const centerOnNode = (node: GraphNode) => {
  const width = containerRef.value?.clientWidth || 800
  const height = containerRef.value?.clientHeight || 600
  viewX = width / 2 - (node.x || 0) * zoom
  viewY = height / 2 - (node.y || 0) * zoom
}

const selectAndCenter = (node: GraphNode) => {
  selectOnly(node)
  centerOnNode(node)
}

const focusFirstMatch = () => {
  const node = visibleNodes.value[0]
  if (node) selectAndCenter(node)
}

const objectTypeLabel = (type: string) => ({
  pdf: 'PDF 资料', pdf_annotation: 'PDF 批注', table: '数据表', table_view: '表格视图',
  canvas: 'Canvas 画布', canvas_node: 'Canvas 节点', opml: '思维导图', opml_node: '思维导图主题',
  pptx: 'PowerPoint 演示', pptx_slide: 'PowerPoint 幻灯片', markdown: 'Markdown 笔记'
}[type] || type)
const canCreateProjectNote = (node: GraphNode) => !node.parentId && ['markdown', 'pdf'].includes(node.objectType)
const displayWorkspacePath = (path: string) => path.replace(/^\\\\\?\\/, '')
const openNode = (node: GraphNode) => {
  const locator = node.locator
  const path = displayWorkspacePath(node.path)
  if (node.objectType === 'pdf' || node.objectType === 'pdf_annotation') {
    return openManagedFile(router, path, { page: locator?.page, annotation: locator?.objectId })
  }
  if (node.objectType === 'table' || node.objectType === 'table_view') {
    return openManagedFile(router, path, { view: locator?.objectId })
  }
  if (node.objectType === 'canvas' || node.objectType === 'canvas_node') {
    return openManagedFile(router, path, { node: locator?.objectId })
  }
  if (node.objectType === 'opml' || node.objectType === 'opml_node') {
    return openManagedFile(router, path, { node: locator?.objectId })
  }
  if (node.objectType === 'pptx_slide') {
    return openManagedFile(router, path, {
        slide: locator?.page,
        locatorKind: 'pptx-slide',
        locator: locator?.objectId,
        locationLabel: node.locationLabel || undefined,
        locatorToken: String(Date.now()),
    })
  }
  return openManagedFile(router, path)
}
const openPath = (path: string) => openManagedFile(router, displayWorkspacePath(path))
const handleHealthRepaired = () => loadGraph()

const sendToCanvas = async (node: GraphNode) => {
  if (isCreatingCanvas.value) return
  isCreatingCanvas.value = true
  try {
    const path = await invoke<string>('create_canvas_from_graph', {
      libraryRoot: store.libraryPath,
      centerPath: node.path,
      depth: mindmapDepth.value
    })
    openManagedFile(router, path)
  } catch (error) {
    window.alert(`生成画布失败：${String(error)}`)
  } finally {
    isCreatingCanvas.value = false
  }
}

const createProjectNote = async (node: GraphNode) => {
  if (isCreatingProject.value) return
  isCreatingProject.value = true
  try {
    const path = await invoke<string>('create_project_note_from_graph', {
      libraryRoot: store.libraryPath,
      centerPath: node.path,
      depth: mindmapDepth.value
    })
    openManagedFile(router, path)
  } catch (error) {
    window.alert(`生成项目笔记失败：${String(error)}`)
  } finally {
    isCreatingProject.value = false
  }
}

const saveGraphCollection = async (node: GraphNode) => {
  if (isSavingCollection.value) return
  isSavingCollection.value = true
  try {
    const collection = await store.addGraphCollection(`${node.title} 关系`, node.path, mindmapDepth.value)
    router.push({ name: 'LibraryMode', query: { collection: collection.id } })
  } catch (error) {
    window.alert(`保存图谱集合失败：${String(error)}`)
  } finally {
    isSavingCollection.value = false
  }
}

const simulate = () => {
  if (layoutSettled || viewMode.value === 'mindmap') return
  const nodes = visibleNodes.value
  const edges = visibleEdges.value
  if (nodes.length === 0) return

  frameCount++
  if (frameCount > LAYOUT_MAX_FRAMES) { layoutSettled = true; scheduleLayoutSave(); return }

  // 降低帧率优化：超过 60 帧后每 3 帧计算一次
  if (frameCount > LAYOUT_OPTIMIZATION_START_FRAME && frameCount % LAYOUT_FRAME_SKIP !== 0) return

  const nodeMap = new Map<string, GraphNode>()
  nodes.forEach(n => nodeMap.set(n.id, n))

  // 使用空间分区优化 O(n²) 斥力计算
  const cellSize = 100
  const grid = new Map<string, GraphNode[]>()

  for (const n of nodes) {
    const cx = Math.floor((n.x || 0) / cellSize)
    const cy = Math.floor((n.y || 0) / cellSize)
    const key = `${cx},${cy}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push(n)
  }

  let etotal = 0

  // 斥力 — 使用空间分区只计算邻近节点，增加距离阈值优化
  const maxRepulsionDist = 300 // 超过此距离不计算斥力
  for (const n of nodes) {
    const cx = Math.floor((n.x || 0) / cellSize)
    const cy = Math.floor((n.y || 0) / cellSize)

    // 检查周围 9 个格子
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cx + dx},${cy + dy}`
        const neighbors = grid.get(key) || []
        for (const m of neighbors) {
          if (n === m) continue
          const vx = (m.x || 0) - (n.x || 0)
          const vy = (m.y || 0) - (n.y || 0)
          const distSq = vx * vx + vy * vy
          if (distSq < 1 || distSq > maxRepulsionDist * maxRepulsionDist) continue
          const dist = Math.sqrt(distSq)
          const force = Math.min(800 / distSq, 50)
          const fx = (vx / dist) * force
          const fy = (vy / dist) * force
          n.vx = (n.vx || 0) - fx
          n.vy = (n.vy || 0) - fy
        }
      }
    }
  }

  // 引力
  const desiredLinkDistance = 120
  for (const e of edges) {
    const s = nodeMap.get(e.source)
    const t = nodeMap.get(e.target)
    if (!s || !t) continue
    const dx = (t.x || 0) - (s.x || 0)
    const dy = (t.y || 0) - (s.y || 0)
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const f = (dist - desiredLinkDistance) * 0.015
    s.vx = (s.vx || 0) + (dx / dist) * f
    s.vy = (s.vy || 0) + (dy / dist) * f
    t.vx = (t.vx || 0) - (dx / dist) * f
    t.vy = (t.vy || 0) - (dy / dist) * f
  }

  // 中心引力 + 阻尼 + 更新位置
  const cx = (containerRef.value?.clientWidth || 800) / 2 / zoom - viewX / zoom
  const cy = (containerRef.value?.clientHeight || 600) / 2 / zoom - viewY / zoom

  for (const n of nodes) {
    n.vx = (n.vx || 0) + (cx - (n.x || 0)) * 0.002
    n.vy = (n.vy || 0) + (cy - (n.y || 0)) * 0.002
    n.vx = (n.vx || 0) * 0.85
    n.vy = (n.vy || 0) * 0.85
    n.x = (n.x || 0) + (n.vx || 0)
    n.y = (n.y || 0) + (n.vy || 0)
    etotal += Math.abs(n.vx || 0) + Math.abs(n.vy || 0)
  }

  // 能量收敛检测
  if (etotal < LAYOUT_SETTLE_THRESHOLD && frameCount > LAYOUT_MIN_FRAMES) {
    layoutSettled = true
    scheduleLayoutSave()
  }
}

const resetView = () => {
  viewX = 0
  viewY = 0
  zoom = 1
  zoomLevel.value = 1
  frameCount = 0
  layoutSettled = false
  if (viewMode.value === 'mindmap' && mindmapRoot.value) applyMindMapLayout(mindmapRoot.value)
  else initLayout()
}

const resetLayout = () => {
  const before = captureLayoutSnapshot()
  clearGraphLayout(store.libraryPath, currentLayoutId())
  for (const node of graphData.value.nodes) {
    node.x = undefined
    node.y = undefined
    node.vx = 0
    node.vy = 0
  }
  resetView()
  pushLayoutUndo(before)
}

const findNodeAt = (mx: number, my: number): GraphNode | null => {
  // 缩放时调整检测范围 - 缩小时扩大点击区域
  const detectionRadius = 100 / Math.max(0.5, zoom)
  for (const n of visibleNodes.value) {
    const dx = mx - (n.x || 0), dy = my - (n.y || 0)
    if (viewMode.value === 'mindmap') {
      const width = n.id === mindmapRoot.value?.id ? 180 : 160
      if (Math.abs(dx) <= width / 2 && Math.abs(dy) <= 24) return n
      continue
    }
    const r = n.size * 0.6
    if (dx * dx + dy * dy < r * r + detectionRadius) return n
  }
  return null
}

const draw = () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const dpr = window.devicePixelRatio || 1
  const width = container.clientWidth
  const height = container.clientHeight

  // 仅在尺寸变化时调整 canvas
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 重置变换矩阵，避免累积缩放
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(viewX, viewY)
  ctx.scale(zoom, zoom)

  const hovered = hoveredNode.value
  const isDark = isActiveThemeDark(store.theme)
  const activeTone = getActiveThemeTone(store.theme)

  // 构建节点 Map 加速查找
  const nodeMap = new Map<string, GraphNode>()
  visibleNodes.value.forEach(n => nodeMap.set(n.id, n))

  // 边 - 渐变效果（小缩放级别时跳过以优化性能）
  if (zoom > 0.3) {
    for (const e of visibleEdges.value) {
      const s = nodeMap.get(e.source)
      const t = nodeMap.get(e.target)
      if (!s || !t) continue

      const isHighlight = hovered && (s === hovered || t === hovered)

      ctx.setLineDash(e.directed ? [] : [5 / zoom, 4 / zoom])
      ctx.beginPath()
      ctx.moveTo(s.x || 0, s.y || 0)
      if (viewMode.value === 'mindmap') {
        const midX = ((s.x || 0) + (t.x || 0)) / 2
        ctx.bezierCurveTo(midX, s.y || 0, midX, t.y || 0, t.x || 0, t.y || 0)
      } else {
        ctx.lineTo(t.x || 0, t.y || 0)
      }

      if (isHighlight) {
        const gradient = ctx.createLinearGradient(s.x || 0, s.y || 0, t.x || 0, t.y || 0)
        gradient.addColorStop(0, `${activeTone.ui.primary}99`)
        gradient.addColorStop(1, `${activeTone.ui.primary}4d`)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 2.5 / zoom
      } else {
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
        ctx.lineWidth = 1 / zoom
      }
      ctx.stroke()
      ctx.setLineDash([])

      if (e.directed) {
        const sx = s.x || 0, sy = s.y || 0, tx = t.x || 0, ty = t.y || 0
        const angle = Math.atan2(ty - sy, tx - sx)
        const arrowX = sx + (tx - sx) * 0.72
        const arrowY = sy + (ty - sy) * 0.72
        const arrowSize = 5 / zoom
        ctx.save()
        ctx.translate(arrowX, arrowY)
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(arrowSize, 0)
        ctx.lineTo(-arrowSize, -arrowSize * 0.7)
        ctx.lineTo(-arrowSize, arrowSize * 0.7)
        ctx.closePath()
        ctx.fillStyle = ctx.strokeStyle
        ctx.fill()
        ctx.restore()
      }
    }
  }

  // 节点 - 光晕效果
  for (const n of visibleNodes.value) {
    const r = n.size * 0.6
    const isHovered = hovered === n
    const isSelected = selectedNodeIds.value.includes(n.id)

    if (viewMode.value === 'mindmap') {
      const isRoot = n.id === mindmapRoot.value?.id
      const width = isRoot ? 180 : 160
      const height = isRoot ? 48 : 42
      const x = (n.x || 0) - width / 2
      const y = (n.y || 0) - height / 2
      ctx.beginPath()
      ctx.roundRect(x, y, width, height, isRoot ? 16 : 11)
      ctx.fillStyle = isRoot
        ? activeTone.ui.primary
        : (isDark ? 'rgba(37,42,48,0.96)' : 'rgba(255,255,255,0.98)')
      ctx.shadowColor = isHovered || isSelected ? `${activeTone.ui.primary}4d` : 'rgba(0,0,0,0.12)'
      ctx.shadowBlur = isHovered || isSelected ? 18 : 8
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = isHovered || isSelected
        ? activeTone.ui.primary
        : (isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.1)')
      ctx.lineWidth = (isHovered || isSelected ? 2 : 1) / zoom
      ctx.stroke()
      ctx.fillStyle = isRoot ? '#fff' : (isDark ? 'rgba(255,255,255,0.92)' : 'rgba(20,24,31,0.9)')
      ctx.font = `${isRoot ? 700 : 600} 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const nodeTitle = n.objectType === 'pdf' ? `PDF · ${n.title}` : n.objectType === 'table' ? `表格 · ${n.title}` : n.title
      const display = nodeTitle.length > 16 ? `${nodeTitle.slice(0, 16)}…` : nodeTitle
      ctx.fillText(display, n.x || 0, n.y || 0, width - 18)
      continue
    }

    // 外层光晕
    if (isHovered) {
      const glowGradient = ctx.createRadialGradient(n.x || 0, n.y || 0, r, n.x || 0, n.y || 0, r * 2)
      glowGradient.addColorStop(0, isDark ? 'rgba(66,184,131,0.3)' : 'rgba(0,122,255,0.3)')
      glowGradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(n.x || 0, n.y || 0, r * 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 主体节点
    ctx.beginPath()
    ctx.arc(n.x || 0, n.y || 0, r, 0, Math.PI * 2)

    const nodeGradient = ctx.createRadialGradient(
      (n.x || 0) - r * 0.3, (n.y || 0) - r * 0.3, 0,
      n.x || 0, n.y || 0, r
    )

    if (graphCanvasTheme.value === 'focus') {
      nodeGradient.addColorStop(0, isDark ? 'rgba(205,214,224,0.96)' : 'rgba(72,84,99,0.92)')
      nodeGradient.addColorStop(1, isDark ? 'rgba(126,139,153,0.9)' : 'rgba(42,52,64,0.86)')
    } else if (graphCanvasTheme.value === 'professional') {
      nodeGradient.addColorStop(0, `${activeTone.ui.primary}f2`)
      nodeGradient.addColorStop(1, `${activeTone.ui.primary}b8`)
    } else if (n.objectType === 'pdf') {
      nodeGradient.addColorStop(0, isDark ? 'rgba(255,190,80,1)' : 'rgba(255,176,48,1)')
      nodeGradient.addColorStop(1, isDark ? 'rgba(217,132,28,0.88)' : 'rgba(221,132,20,0.85)')
    } else if (n.objectType === 'table') {
      nodeGradient.addColorStop(0, isDark ? 'rgba(92,211,211,1)' : 'rgba(22,177,181,1)')
      nodeGradient.addColorStop(1, isDark ? 'rgba(27,135,145,0.9)' : 'rgba(10,126,139,0.88)')
    } else if (isHovered) {
      nodeGradient.addColorStop(0, isDark ? 'rgba(100,220,170,1)' : 'rgba(40,140,255,1)')
      nodeGradient.addColorStop(1, isDark ? 'rgba(66,184,131,0.9)' : 'rgba(0,122,255,0.9)')
    } else {
      nodeGradient.addColorStop(0, isDark ? 'rgba(80,200,150,0.85)' : 'rgba(60,150,255,0.85)')
      nodeGradient.addColorStop(1, isDark ? 'rgba(66,184,131,0.7)' : 'rgba(0,122,255,0.7)')
    }

    ctx.fillStyle = nodeGradient
    ctx.fill()

    // 边缘描边
    ctx.strokeStyle = isSelected ? activeTone.ui.primary : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
    ctx.lineWidth = (isHovered || isSelected ? 3 : 1) / zoom
    ctx.stroke()

    // 标签 - 根据缩放级别动态显示
    if (zoom > 0.4) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)'
      ctx.font = `600 ${Math.max(11, 13 / zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      const maxLen = zoom > 1 ? 10 : Math.floor(10 / (1.5 - zoom * 0.5))
      const display = n.title.length > maxLen ? n.title.slice(0, maxLen) + '…' : n.title

      // 文字阴影
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)'
      ctx.shadowBlur = 3 / zoom
      ctx.fillText(display, n.x || 0, (n.y || 0) + r + 8 / zoom)
      ctx.shadowBlur = 0
    }
  }

  if (selectionBox) {
    const left = Math.min(selectionBox.startX, selectionBox.x)
    const top = Math.min(selectionBox.startY, selectionBox.y)
    const width = Math.abs(selectionBox.x - selectionBox.startX)
    const height = Math.abs(selectionBox.y - selectionBox.startY)
    ctx.fillStyle = `${activeTone.ui.primary}24`
    ctx.strokeStyle = activeTone.ui.primary
    ctx.lineWidth = 1.5 / zoom
    ctx.fillRect(left, top, width, height)
    ctx.strokeRect(left, top, width, height)
  }

  ctx.restore()

  // 更新悬停检测
  const canvasRect = canvas.getBoundingClientRect()
  const worldX = (mouseX - canvasRect.left - viewX) / zoom
  const worldY = (mouseY - canvasRect.top - viewY) / zoom
  const node = findNodeAt(worldX, worldY)
  if (node !== hoveredNode.value) {
    hoveredNode.value = node
    if (node) {
      tooltipX.value = mouseX - canvasRect.left + 20
      tooltipY.value = mouseY - canvasRect.top - 60
    }
  }
}

const loop = () => {
  simulate()
  draw()
  animationId = requestAnimationFrame(loop)
}

const startDrag = (e: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.focus()
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - viewX) / zoom
  const my = (e.clientY - rect.top - viewY) / zoom
  const node = findNodeAt(mx, my)
  if (node) {
    if (e.ctrlKey || e.metaKey) toggleSelection(node)
    else if (!selectedNodeIds.value.includes(node.id)) selectOnly(node)
    if (!selectedNodeIds.value.includes(node.id)) return
    dragging = node
    dragStartWorldX = mx
    dragStartWorldY = my
    dragStartPositions = new Map(selectedNodeIds.value.map(id => {
      const selected = graphData.value.nodes.find(candidate => candidate.id === id)
      return [id, { x: selected?.x || 0, y: selected?.y || 0 }]
    }))
    dragSnapshot = captureLayoutSnapshot()
    wasDragging = false
    return
  }
  if (e.shiftKey && e.button === 0) {
    selectionBox = { startX: mx, startY: my, x: mx, y: my }
    dragging = null
    wasDragging = false
    return
  }
  if (e.button !== 0 && e.button !== 1) return
  clearSelection()
  dragging = { id: '', title: '', path: '', size: 0, x: e.clientX, y: e.clientY } as any
  offsetX = viewX; offsetY = viewY
  wasDragging = false
}

const onDrag = (e: MouseEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  if (selectionBox) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    selectionBox.x = (e.clientX - rect.left - viewX) / zoom
    selectionBox.y = (e.clientY - rect.top - viewY) / zoom
    wasDragging = true
    return
  }
  if (!dragging) return
  if (dragging.id) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - viewX) / zoom
    const my = (e.clientY - rect.top - viewY) / zoom
    const dx = mx - dragStartWorldX
    const dy = my - dragStartWorldY
    if (!wasDragging && Math.hypot(dx, dy) < 3 / zoom) return
    wasDragging = true
    dragStartPositions.forEach((position, id) => {
      const node = graphData.value.nodes.find(candidate => candidate.id === id)
      if (!node) return
      node.x = position.x + dx
      node.y = position.y + dy
      node.vx = 0; node.vy = 0
    })
    layoutSettled = true
    frameCount = LAYOUT_MAX_FRAMES
  } else {
    wasDragging = true
    viewX = e.clientX - (dragging.x || 0) + offsetX
    viewY = e.clientY - (dragging.y || 0) + offsetY
  }
}

const endDrag = () => {
  if (selectionBox) {
    const left = Math.min(selectionBox.startX, selectionBox.x)
    const right = Math.max(selectionBox.startX, selectionBox.x)
    const top = Math.min(selectionBox.startY, selectionBox.y)
    const bottom = Math.max(selectionBox.startY, selectionBox.y)
    const matches = visibleNodes.value.filter(node => {
      const halfWidth = viewMode.value === 'mindmap' ? (node.id === mindmapRoot.value?.id ? 90 : 80) : Math.max(18, node.size * 0.6)
      const halfHeight = viewMode.value === 'mindmap' ? 24 : Math.max(18, node.size * 0.6)
      return (node.x || 0) + halfWidth >= left && (node.x || 0) - halfWidth <= right && (node.y || 0) + halfHeight >= top && (node.y || 0) - halfHeight <= bottom
    })
    selectedNodeIds.value = matches.map(node => node.id)
    selectedNode.value = matches[matches.length - 1] || null
    selectionBox = null
  }
  if (dragging?.id && wasDragging && dragSnapshot) {
    pushLayoutUndo(dragSnapshot)
    scheduleLayoutSave()
  }
  if (dragging && dragging.id && !wasDragging) {
    selectedNode.value = dragging
    emit('selectFile', dragging.path)
  }
  dragging = null
  dragSnapshot = null
  dragStartPositions.clear()
  wasDragging = false
}

const onZoom = (e: WheelEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  const canvas = canvasRef.value
  if (!canvas) return

  changeGraphZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY)
}

const onClick = () => {
  // 点击逻辑由 endDrag 处理 — 此处不再发射
}

const onDblClick = () => {
  if (hoveredNode.value) {
    openNode(hoveredNode.value)
  }
}

const moveSelectedNodes = (dx: number, dy: number) => {
  if (!selectedNodeIds.value.length) return
  const before = captureLayoutSnapshot()
  for (const id of selectedNodeIds.value) {
    const node = graphData.value.nodes.find(candidate => candidate.id === id)
    if (!node) continue
    node.x = (node.x || 0) + dx
    node.y = (node.y || 0) + dy
    node.vx = 0; node.vy = 0
  }
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  pushLayoutUndo(before)
  scheduleLayoutSave()
}
const handleGraphKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoLayout() : undoLayout(); return }
  if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redoLayout(); return }
  if (command && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selectedNodeIds.value = visibleNodes.value.map(node => node.id)
    selectedNode.value = visibleNodes.value[visibleNodes.value.length - 1] || null
    return
  }
  if (event.key === 'Escape') { clearSelection(); return }
  const distance = event.shiftKey ? 24 : 8
  if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelectedNodes(-distance, 0) }
  if (event.key === 'ArrowRight') { event.preventDefault(); moveSelectedNodes(distance, 0) }
  if (event.key === 'ArrowUp') { event.preventDefault(); moveSelectedNodes(0, -distance) }
  if (event.key === 'ArrowDown') { event.preventDefault(); moveSelectedNodes(0, distance) }
}

watch(() => props.show, (v) => { if (v !== false) loadGraph() })
watch(() => store.libraryPath, () => { if (props.show !== false) loadGraph() })
watch(() => selectedNode.value?.id, () => { relationDraftTarget.value = '' })
watch(graphLayoutMode, value => localStorage.setItem('longedit.graph.layout-mode', value))
watch(graphCanvasTheme, value => localStorage.setItem('longedit.graph.canvas-theme', value))
watch(remediationFocus, focus => {
  if (focus === 'relations') showTutorial.value = true
  if (focus === 'orphans') {
    healthOpen.value = true
    clearSelection()
  }
  frameCount = 0
  layoutSettled = false
}, { immediate: true })
watch(filters, () => {
  const visible = new Set(visibleNodes.value.map(node => node.id))
  selectedNodeIds.value = selectedNodeIds.value.filter(id => visible.has(id))
  if (selectedNode.value && !visible.has(selectedNode.value.id)) selectedNode.value = null
  if (viewMode.value === 'network') {
    frameCount = 0
    layoutSettled = false
  }
}, { deep: true })

let paused = false
const handleVisibility = () => {
  if (document.hidden) { paused = true; cancelAnimationFrame(animationId) }
  else if (paused) { paused = false; layoutSettled = false; frameCount = 40; loop() }
}
onMounted(() => { loadGraph(); loop(); document.addEventListener('visibilitychange', handleVisibility); window.addEventListener('keydown', handleGraphKeydown) })
onUnmounted(() => { persistLayout(); window.clearTimeout(layoutSaveTimer); cancelAnimationFrame(animationId); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('keydown', handleGraphKeydown) })
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  background: linear-gradient(135deg,
    var(--theme-bg) 0%,
    color-mix(in srgb, var(--theme-bg) 95%, var(--theme-primary)) 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  flex: 0 0 auto;
  z-index: 10;
}

.graph-header-icon { color: var(--theme-primary); }
.graph-header :deep(.management-actions) { min-width: 0; flex: 1; overflow: hidden; }

.graph-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.view-switch {
  display: flex;
  padding: 3px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.14);
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.045);
}

.view-switch button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: calc(var(--theme-radius-sm) - 3px);
  color: var(--theme-text-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.view-switch button.active {
  color: #fff;
  background: var(--theme-primary);
  box-shadow: 0 3px 10px rgba(var(--theme-primary-rgb), 0.22);
}

.graph-search {
  width: 180px;
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--workspace-border-color);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: var(--workspace-control-bg);
}

.graph-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--theme-text);
  background: transparent;
  font-size: 12px;
}

.graph-options {
  position: absolute;
  top: calc(var(--workspace-management-header-height) + 12px);
  left: var(--workspace-floating-gutter);
  z-index: 4;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--workspace-border-color);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  background: color-mix(in srgb, var(--theme-card) 92%, transparent);
  backdrop-filter: blur(16px);
  box-shadow: var(--workspace-shadow-sm);
  font-size: 11px;
}

.graph-options label { display: flex; align-items: center; gap: 6px; }
.graph-options input { accent-color: var(--theme-primary); }
.graph-options select {
  border: 0;
  outline: 0;
  color: var(--theme-text);
  background: transparent;
  font-size: 11px;
}
.option-divider { width: 1px; height: 16px; background: var(--workspace-border-color); }
.mindmap-root { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-text); }
.match-count { color: var(--theme-primary); font-weight: 650; }
.remediation-banner { position: absolute; top: calc(var(--workspace-management-header-height) + 58px); left: var(--workspace-floating-gutter); right: var(--workspace-floating-gutter); z-index: 3; min-height: 46px; display: grid; grid-template-columns: minmax(0,1fr) auto 24px; align-items: center; gap: 10px; padding: 7px 8px 7px 12px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 94%, transparent); backdrop-filter: blur(16px); box-shadow: var(--workspace-shadow-sm); }.remediation-copy { min-width: 0; display: grid; gap: 2px; }.remediation-banner strong { font-size: 11px; }.remediation-banner span { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.remediation-actions { display: flex; align-items: center; gap: 6px; }.remediation-banner button { min-height: 28px; padding: 0 9px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 6px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.remediation-banner .remediation-close { width: 24px; min-height: 24px; padding: 0; border-color: transparent; color: var(--theme-text-secondary); background: transparent; font-size: 16px; }

.tutorial-btn {
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.07);
  color: var(--theme-primary);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.3s var(--ease-premium);
}

.tutorial-btn:hover,
.tutorial-btn.active {
  color: #fff;
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--theme-primary-rgb), 0.22);
}

.health-entry {
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text);
  background: rgba(var(--theme-primary-rgb), 0.04);
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
}
.health-entry:hover, .health-entry.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb), 0.42); background: rgba(var(--theme-primary-rgb), 0.09); }
.health-dot { width: 7px; height: 7px; border-radius: 50%; background: #d59a35; box-shadow: 0 0 0 3px rgba(213, 154, 53, 0.13); }
.health-entry.active .health-dot { background: var(--theme-primary); box-shadow: 0 0 0 3px rgba(var(--theme-primary-rgb), 0.14); }

.graph-export-btn {
  height: var(--workspace-control-height);
  padding: 0 10px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.05);
  cursor: pointer;
  font-size: var(--text-compact);
  font-weight: 700;
}
.graph-export-btn:hover { border-color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.12); }
.graph-export-btn:disabled { cursor: wait; opacity: 0.5; }

.control-btn {
  width: var(--workspace-control-height);
  height: var(--workspace-control-height);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--workspace-control-bg);
  border: 1px solid var(--workspace-border-color);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.3s var(--ease-premium);
  color: var(--theme-text);
  opacity: 0.7;
}

.control-btn:hover {
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  color: white;
  opacity: 1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--theme-primary-rgb), 0.2);
}
.control-btn:disabled { cursor: default; opacity: .32; transform: none; box-shadow: none; }
.control-btn:disabled:hover { color: var(--theme-text); border-color: var(--workspace-border-color); background: var(--workspace-control-bg); }

canvas {
  display: block;
  cursor: grab;
  flex: 1;
  min-height: 0;
  outline: none;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--theme-text-secondary) 20%, transparent) 1px, transparent 1px);
  background-size: 22px 22px;
}

canvas:active {
  cursor: grabbing;
}
canvas:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--theme-primary) 48%, transparent); }
.graph-canvas-theme-professional canvas { background-color: color-mix(in srgb, var(--theme-bg) 97%, #eef2f6); background-size: 28px 28px; }
.graph-canvas-theme-colorful canvas { background-color: color-mix(in srgb, var(--theme-bg) 95%, #dcecff); }
.graph-canvas-theme-focus canvas { background-color: var(--theme-bg); background-image: none; }

.graph-stats {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--workspace-surface-raised);
  backdrop-filter: blur(20px);
  padding: 0 12px;
  border-radius: 6px;
  box-shadow: var(--workspace-shadow-sm);
  border: 1px solid var(--workspace-border-color);
  pointer-events: none;
  animation: slideUp 0.6s var(--ease-premium);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text);
  opacity: 0.8;
}

.stat-item svg {
  opacity: 0.6;
}

.stat-divider {
  width: 1px;
  height: 14px;
  background: var(--workspace-border-color);
}

.node-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--theme-card);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--theme-primary-rgb), 0.2);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 280px;
  min-width: 180px;
}

.node-details {
  position: absolute;
  top: calc(var(--workspace-management-header-height) + 12px);
  right: var(--workspace-floating-gutter);
  z-index: 5;
  width: var(--workspace-inspector-width);
  max-height: calc(100vh - var(--workspace-management-header-height) - 52px);
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.14);
  border-radius: 6px;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-card) 95%, transparent);
  backdrop-filter: blur(22px);
  box-shadow: var(--workspace-shadow);
}

.details-close {
  position: absolute;
  top: 10px;
  right: 12px;
  border: 0;
  color: var(--theme-text-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 20px;
}
.details-kicker { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 750; letter-spacing: 0.1em; }
.node-details h3 { margin: 7px 26px 4px 0; font-size: 18px; line-height: 1.3; }
.details-path { margin: 0 0 16px; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; word-break: break-all; }
.details-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.details-metrics div { display: flex; flex-direction: column; gap: 3px; padding: 10px 6px; border-radius: var(--theme-radius-sm); text-align: center; background: rgba(var(--theme-primary-rgb), 0.06); }
.details-metrics strong { color: var(--theme-primary); font-size: 17px; }
.details-metrics span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.details-actions { display: grid; gap: 7px; margin: 14px 0; }
.details-actions button { min-height: 34px; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: var(--theme-radius-sm); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.06); cursor: pointer; font-size: 11px; font-weight: 650; }
.details-actions .primary-action { color: #fff; background: var(--theme-primary); }
.relation-editor { margin: 4px 0 14px; padding: 10px; border: 1px solid rgba(var(--theme-primary-rgb), 0.14); border-radius: var(--theme-radius-sm); background: rgba(var(--theme-primary-rgb), 0.035); }
.relation-editor .neighbor-title { margin: 0 0 8px; }
.relation-editor-grid { display: grid; gap: 7px; }
.relation-editor select, .relation-editor button { min-height: 32px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }
.relation-editor button { color: #fff; background: var(--theme-primary); cursor: pointer; font-weight: 700; }
.relation-editor button:disabled { cursor: not-allowed; opacity: 0.5; }
.relation-editor > small { display: block; margin-top: 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.details-relations { display: flex; flex-direction: column; gap: 7px; }
.details-relation-card { position: relative; display: flex; width: 100%; border: 1px solid rgba(var(--theme-primary-rgb), 0.12); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: rgba(var(--theme-primary-rgb), 0.035); text-align: left; }
.details-relation-card:hover { border-color: rgba(var(--theme-primary-rgb), 0.38); background: rgba(var(--theme-primary-rgb), 0.075); }
.relation-focus { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; padding: 9px; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.relation-delete { align-self: stretch; width: 42px; border: 0; border-left: 1px solid rgba(var(--theme-primary-rgb), 0.1); color: #c74848; background: transparent; cursor: pointer; font-size: var(--text-compact); }
.relation-delete:hover { background: rgba(199, 72, 72, 0.09); }
.details-relation-head, .details-relation-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.details-relation-head strong { overflow: hidden; font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }
.details-relation-head small { flex: none; color: var(--theme-primary); font-size: var(--text-compact); }
.details-relation-context { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.details-relation-meta { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.details-relation-meta code { max-width: 55%; overflow: hidden; color: var(--theme-primary); text-overflow: ellipsis; white-space: nowrap; }
.neighbor-title { display: block; margin: 16px 0 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 700; }
.neighbor-list button { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 8px 4px; border: 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05); color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }
.neighbor-list button:hover { color: var(--theme-primary); }
.neighbor-list small { flex: none; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.details-slide-enter-active, .details-slide-leave-active { transition: opacity 0.22s ease, transform 0.3s var(--ease-premium); }
.details-slide-enter-from, .details-slide-leave-to { opacity: 0; transform: translateX(18px); }

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-text);
}

.tooltip-header svg {
  color: var(--theme-primary);
  flex-shrink: 0;
}

.tooltip-header strong {
  font-size: 14px;
  font-weight: 700;
}

.tip-path {
  opacity: 0.5;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.4;
  padding-left: 22px;
}

.tooltip-hint {
  font-size: var(--text-compact);
  opacity: 0.4;
  text-align: center;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  margin-top: 2px;
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: all 0.3s var(--ease-premium);
}

.tooltip-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

/* 空状态提示 */
.empty-graph-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 5;
  width: min(560px, calc(100vw - 48px));
  padding: 28px 32px 30px;
  box-sizing: border-box;
}

.tutorial-card {
  border: 1px solid rgba(var(--theme-primary-rgb), 0.15);
  border-radius: calc(var(--theme-radius) * 1.5);
  background: color-mix(in srgb, var(--theme-card) 94%, transparent);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(22px);
}

.tutorial-close {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  color: var(--theme-text);
  font-size: 20px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.tutorial-close:hover {
  background: rgba(var(--theme-primary-rgb), 0.12);
}

.empty-icon {
  margin: 0 auto 24px;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg,
    rgba(var(--theme-primary-rgb), 0.1) 0%,
    rgba(var(--theme-primary-rgb), 0.05) 100%);
  border: 2px dashed rgba(var(--theme-primary-rgb), 0.3);
}

.empty-icon svg {
  color: var(--theme-primary);
  opacity: 0.6;
}

.empty-graph-hint h3 {
  font-size: 20px;
  font-weight: 700;
  color: var(--theme-text);
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.empty-graph-hint p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  line-height: 1.6;
  margin: 8px 0;
}

.tutorial-intro {
  margin: 0 auto 18px !important;
  max-width: 440px;
}

.tutorial-steps {
  display: grid;
  gap: 9px;
  text-align: left;
}

.tutorial-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: var(--theme-radius-sm);
  background: rgba(var(--theme-primary-rgb), 0.055);
  border: 1px solid rgba(var(--theme-primary-rgb), 0.08);
}

.tutorial-step > div {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 10px;
}

.tutorial-step strong {
  color: var(--theme-text);
  font-size: 13px;
}

.tutorial-step p {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.step-number {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--theme-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 3px 9px rgba(var(--theme-primary-rgb), 0.24);
}

.tutorial-note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  background: rgba(0, 0, 0, 0.025);
  font-size: 12px;
  line-height: 1.6;
}

.tutorial-action {
  margin-top: 16px;
  padding: 9px 18px;
  border: 0;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-primary);
  color: #fff;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 5px 16px rgba(var(--theme-primary-rgb), 0.22);
  transition: transform 0.25s var(--ease-premium), box-shadow 0.25s ease;
}

.tutorial-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(var(--theme-primary-rgb), 0.3);
}

.empty-graph-hint code {
  background: rgba(var(--theme-primary-rgb), 0.1);
  color: var(--theme-primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  font-weight: 600;
}

.graph-loading {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-bg) 78%, transparent);
  backdrop-filter: blur(8px);
}

.graph-loading strong {
  margin-top: 18px;
  font-size: 15px;
}

.graph-loading p {
  margin: 7px 0 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.graph-loader {
  position: relative;
  width: 76px;
  height: 48px;
}

.graph-loader span {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--theme-primary);
  box-shadow: 0 0 16px rgba(var(--theme-primary-rgb), 0.42);
  animation: graphNodePulse 1.35s ease-in-out infinite;
}

.graph-loader span:nth-child(1) { left: 4px; top: 28px; }
.graph-loader span:nth-child(2) { left: 32px; top: 4px; animation-delay: 0.16s; }
.graph-loader span:nth-child(3) { right: 4px; top: 28px; animation-delay: 0.32s; }

.graph-loader::before,
.graph-loader::after {
  content: '';
  position: absolute;
  top: 25px;
  width: 34px;
  height: 2px;
  background: rgba(var(--theme-primary-rgb), 0.35);
  transform-origin: center;
}

.graph-loader::before { left: 11px; transform: rotate(-40deg); }
.graph-loader::after { right: 11px; transform: rotate(40deg); }

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.3s var(--ease-premium);
}

.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
}

/* 深色主题适配 */
.is-dark .graph-container {
  background: linear-gradient(135deg,
    var(--theme-bg) 0%,
    color-mix(in srgb, var(--theme-bg) 97%, var(--theme-primary)) 100%);
}

.is-dark .control-btn {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.is-dark .graph-stats {
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.is-dark .stat-divider {
  background: rgba(255, 255, 255, 0.1);
}

.is-dark .node-tooltip {
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.is-dark .tooltip-hint {
  border-top-color: rgba(255, 255, 255, 0.08);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes graphNodePulse {
  0%, 100% { transform: scale(0.82); opacity: 0.55; }
  50% { transform: scale(1.18); opacity: 1; }
}

@media (max-width: 900px) {
  .view-switch button,
  .tutorial-btn,
  .health-entry,
  .graph-export-btn {
    white-space: nowrap;
  }

  .graph-controls {
    width: 100%;
  }

  .graph-controls > * {
    flex: 0 0 auto;
  }

  .tutorial-btn span,
  .graph-export-btn { display: none; }
  .tutorial-btn { width: var(--workspace-control-height); padding: 0; justify-content: center; }

  .graph-search {
    width: 142px;
  }

  .graph-options {
    right: 12px;
    left: 12px;
    max-width: none;
    overflow-x: auto;
    white-space: nowrap;
  }

  .node-details {
    top: auto;
    right: 12px;
    bottom: 16px;
    left: 12px;
    width: auto;
    max-height: 40vh;
  }
}

@media (max-width: 640px) {
  .view-switch button { padding: 0 7px; }
  .graph-search { display: none; }
  .tutorial-btn { width: var(--workspace-control-height); }
  .health-entry { width: 36px; padding: 0; justify-content: center; font-size: 0; }
  .tutorial-card { padding: 24px 18px; }
  .empty-icon { display: none; }
}
</style>
