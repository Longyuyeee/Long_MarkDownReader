<template>
  <div class="graph-container" ref="containerRef">
    <div class="graph-header">
      <button class="back-btn" @click="$router.push('/library')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        返回
      </button>
      <div class="header-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
        <span class="graph-title">知识图谱</span>
      </div>
      <div class="graph-controls">
        <div class="view-switch" aria-label="图谱布局模式">
          <button :class="{ active: viewMode === 'network' }" @click="switchView('network')">关系网络</button>
          <button :class="{ active: viewMode === 'mindmap' }" @click="switchView('mindmap')">思维导图</button>
        </div>
        <label class="graph-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input v-model="searchQuery" placeholder="搜索节点" @keydown.enter="focusFirstMatch" />
        </label>
        <button class="tutorial-btn" :class="{ active: showTutorial }" @click="showTutorial = !showTutorial" title="如何建立链接">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/>
            <path d="M12 18h.01"/>
          </svg>
          <span>如何建立链接</span>
        </button>
        <button class="health-entry" :class="{ active: healthOpen }" @click="healthOpen = !healthOpen">
          <span class="health-dot"></span>知识治理
        </button>
        <button class="graph-export-btn" :disabled="isExporting" @click="exportGraph('svg')">导出 SVG</button>
        <button class="graph-export-btn" :disabled="isExporting" @click="exportGraph('png')">导出 PNG</button>
        <button class="control-btn" @click="resetLayout" title="清除已保存位置并重新布局">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        </button>
        <button class="control-btn" @click="zoom = Math.min(3, zoom * 1.2)" title="放大">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
          </svg>
        </button>
        <button class="control-btn" @click="zoom = Math.max(0.1, zoom * 0.8)" title="缩小">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35M8 11h6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="graph-options">
      <GraphFilterControls :graph="graphData" :show-search="false" />
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
    <canvas ref="canvasRef" @mousedown="startDrag" @mousemove="onDrag" @mouseup="endDrag" @wheel.prevent="onZoom" @click="onClick" @dblclick="onDblClick"></canvas>
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
      <button class="tutorial-action" @click="router.push('/library')">返回编辑器试一试</button>
    </div>
    </transition>

    <div class="graph-stats">
      <div class="stat-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        {{ visibleNodes.length }} / {{ graphData.nodes.length }} 节点
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        </svg>
        {{ visibleEdges.length }} 连接
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/>
        </svg>
        {{ Math.round(zoom * 100) }}%
      </div>
    </div>
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
      <aside v-if="selectedNode" class="node-details">
        <button class="details-close" @click="selectedNode = null" aria-label="关闭节点详情">×</button>
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
import { useAppStore } from '../store/app'
import { getActiveThemeTone, isActiveThemeDark } from '../config/themePresets'
import GraphFilterControls from './GraphFilterControls.vue'
import GraphHealthPanel from './GraphHealthPanel.vue'
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

const degreeMap = computed(() => {
  const result = new Map<string, number>()
  for (const edge of graphData.value.edges) {
    result.set(edge.source, (result.get(edge.source) || 0) + 1)
    result.set(edge.target, (result.get(edge.target) || 0) + 1)
  }
  return result
})

const filteredGraph = computed(() => applyGraphFilters(graphData.value, filters))
const visibleNodes = computed(() => {
  return filteredGraph.value.nodes.filter(node =>
    viewMode.value !== 'mindmap' || !mindmapNodeIds.value || mindmapNodeIds.value.has(node.id)
  )
})

const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleEdges = computed(() => filteredGraph.value.edges.filter(edge => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)))
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
  selectedNode.value = null
  await loadGraph()
  const refreshed = graphData.value.nodes.find(node => node.path === selectedPath)
  if (refreshed) selectedNode.value = refreshed
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
let frameCount = 0
let layoutSettled = false
const hoveredNode = ref<GraphNode | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
let mouseX = 0, mouseY = 0
let layoutSaveTimer = 0

const currentLayoutId = () => viewMode.value === 'mindmap'
  ? `mindmap:${mindmapRoot.value?.id || 'none'}:${mindmapDepth.value}`
  : 'network'

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
      selectedNode.value = initialNode
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
  const restored = restoreGraphLayout(store.libraryPath, 'network', nodes)
  nodes.forEach(n => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      n.x = cx + (Math.random() - 0.5) * 400
      n.y = cy + (Math.random() - 0.5) * 400
    }
    n.vx = 0; n.vy = 0
  })
  frameCount = restored === nodes.length && nodes.length > 0 ? LAYOUT_MAX_FRAMES : 0
  layoutSettled = restored === nodes.length && nodes.length > 0
}

const adjacencyFor = (id: string) => {
  const ids = new Set<string>()
  for (const edge of graphData.value.edges) {
    if (edge.source === id) ids.add(edge.target)
    if (edge.target === id) ids.add(edge.source)
  }
  return [...ids]
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
  restoreGraphLayout(store.libraryPath, `mindmap:${root.id}:${mindmapDepth.value}`, levels.flat())
  layoutSettled = true
  frameCount = LAYOUT_MAX_FRAMES
  viewX = 40
  viewY = 0
  zoom = Math.max(0.55, Math.min(1, 3.2 / Math.max(1, levels.length)))
}

const switchView = (mode: 'network' | 'mindmap') => {
  viewMode.value = mode
  searchQuery.value = ''
  if (mode === 'network') {
    mindmapNodeIds.value = null
    resetView()
    return
  }
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
  selectedNode.value = node
  viewMode.value = 'mindmap'
  searchQuery.value = ''
  applyMindMapLayout(node)
}

const centerOnNode = (node: GraphNode) => {
  const width = containerRef.value?.clientWidth || 800
  const height = containerRef.value?.clientHeight || 600
  viewX = width / 2 - (node.x || 0) * zoom
  viewY = height / 2 - (node.y || 0) * zoom
}

const selectAndCenter = (node: GraphNode) => {
  selectedNode.value = node
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
    return router.push({ name: 'Pdf', query: { path, page: locator?.page, annotation: locator?.objectId } })
  }
  if (node.objectType === 'table' || node.objectType === 'table_view') {
    return router.push({ name: 'Table', query: { path, view: locator?.objectId } })
  }
  if (node.objectType === 'canvas' || node.objectType === 'canvas_node') {
    return router.push({ name: 'Canvas', query: { path, node: locator?.objectId } })
  }
  if (node.objectType === 'opml' || node.objectType === 'opml_node') {
    return router.push({ name: 'MindMap', query: { path, node: locator?.objectId } })
  }
  if (node.objectType === 'pptx_slide') {
    return router.push({
      name: 'LibraryMode',
      query: {
        path,
        slide: locator?.page,
        locatorKind: 'pptx-slide',
        locator: locator?.objectId,
        locationLabel: node.locationLabel || undefined,
        locatorToken: String(Date.now()),
      },
    })
  }
  return router.push({ name: 'LibraryMode', query: { path } })
}
const openPath = (path: string) => router.push({ name: 'LibraryMode', query: { path: displayWorkspacePath(path) } })
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
    router.push({ name: 'Canvas', query: { path } })
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
    router.push({ name: 'LibraryMode', query: { path } })
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
  frameCount = 0
  layoutSettled = false
  if (viewMode.value === 'mindmap' && mindmapRoot.value) applyMindMapLayout(mindmapRoot.value)
  else initLayout()
}

const resetLayout = () => {
  clearGraphLayout(store.libraryPath, currentLayoutId())
  for (const node of graphData.value.nodes) {
    node.x = undefined
    node.y = undefined
    node.vx = 0
    node.vy = 0
  }
  resetView()
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
    const isSelected = selectedNode.value?.id === n.id

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

    if (n.objectType === 'pdf') {
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
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'
    ctx.lineWidth = (isHovered ? 2 : 1) / zoom
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
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - viewX) / zoom
  const my = (e.clientY - rect.top - viewY) / zoom
  const node = findNodeAt(mx, my)
  if (node) {
    dragging = node
    offsetX = (node.x || 0) - mx
    offsetY = (node.y || 0) - my
    return
  }
  dragging = { id: '', title: '', path: '', size: 0, x: e.clientX, y: e.clientY } as any
  offsetX = viewX; offsetY = viewY
}

const onDrag = (e: MouseEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  if (!dragging) return
  if (!wasDragging) wasDragging = true
  if (dragging.id) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - viewX) / zoom
    const my = (e.clientY - rect.top - viewY) / zoom
    dragging.x = mx + offsetX
    dragging.y = my + offsetY
  } else {
    viewX = e.clientX - (dragging.x || 0) + offsetX
    viewY = e.clientY - (dragging.y || 0) + offsetY
  }
}

const endDrag = () => {
  if (dragging && dragging.id) {
    // 拖拽节点后重新模拟几秒让布局稳定
    layoutSettled = false; frameCount = 90
    scheduleLayoutSave()
  }
  if (dragging && dragging.id && !wasDragging) {
    selectedNode.value = dragging
    emit('selectFile', dragging.path)
  }
  dragging = null
  wasDragging = false
}

const onZoom = (e: WheelEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const mouseXCanvas = e.clientX - rect.left
  const mouseYCanvas = e.clientY - rect.top

  // 计算鼠标在世界坐标系中的位置（缩放前）
  const worldXBefore = (mouseXCanvas - viewX) / zoom
  const worldYBefore = (mouseYCanvas - viewY) / zoom

  // 缩放
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = zoom * zoomFactor
  zoom = Math.max(0.1, Math.min(3, newZoom))

  // 计算鼠标在世界坐标系中的位置（缩放后）
  const worldXAfter = (mouseXCanvas - viewX) / zoom
  const worldYAfter = (mouseYCanvas - viewY) / zoom

  // 调整视图偏移，使鼠标位置保持不变
  viewX += (worldXAfter - worldXBefore) * zoom
  viewY += (worldYAfter - worldYBefore) * zoom

  layoutSettled = false; frameCount = 100
}

const onClick = () => {
  // 点击逻辑由 endDrag 处理 — 此处不再发射
}

const onDblClick = () => {
  if (hoveredNode.value) {
    openNode(hoveredNode.value)
  }
}

watch(() => props.show, (v) => { if (v !== false) loadGraph() })
watch(() => store.libraryPath, () => { if (props.show !== false) loadGraph() })
watch(() => selectedNode.value?.id, () => { relationDraftTarget.value = '' })
watch(filters, () => {
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
onMounted(() => { loadGraph(); loop(); document.addEventListener('visibilitychange', handleVisibility) })
onUnmounted(() => { persistLayout(); window.clearTimeout(layoutSaveTimer); cancelAnimationFrame(animationId); document.removeEventListener('visibilitychange', handleVisibility) })
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100vh;
  position: relative;
  background: linear-gradient(135deg,
    var(--theme-bg) 0%,
    color-mix(in srgb, var(--theme-bg) 95%, var(--theme-primary)) 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  flex-shrink: 0;
  background: var(--theme-card);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  z-index: 10;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--theme-text);
}

.header-title svg {
  color: var(--theme-primary);
  opacity: 0.9;
}

.graph-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(var(--theme-primary-rgb), 0.08);
  border: 1px solid rgba(var(--theme-primary-rgb), 0.15);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-primary);
  padding: 8px 14px;
  border-radius: var(--theme-radius);
  transition: all 0.3s var(--ease-premium);
}

.back-btn:hover {
  background: var(--theme-primary);
  color: white;
  transform: translateX(-2px);
  box-shadow: 0 2px 8px rgba(var(--theme-primary-rgb), 0.25);
}

.graph-controls {
  display: flex;
  align-items: center;
  gap: 6px;
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
  height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  background: rgba(0, 0, 0, 0.025);
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
  top: 76px;
  left: 18px;
  z-index: 4;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  background: color-mix(in srgb, var(--theme-card) 92%, transparent);
  backdrop-filter: blur(16px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
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
.option-divider { width: 1px; height: 16px; background: rgba(0, 0, 0, 0.1); }
.mindmap-root { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-text); }
.match-count { color: var(--theme-primary); font-weight: 650; }

.tutorial-btn {
  height: 36px;
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
  height: 36px;
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
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.18);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.05);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
}
.graph-export-btn:hover { border-color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.12); }
.graph-export-btn:disabled { cursor: wait; opacity: 0.5; }

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.08);
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

canvas {
  display: block;
  cursor: grab;
  flex: 1;
}

canvas:active {
  cursor: grabbing;
}

.graph-stats {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  font-weight: 600;
  background: var(--theme-card);
  backdrop-filter: blur(20px);
  padding: 10px 20px;
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
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
  background: rgba(0, 0, 0, 0.1);
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
  top: 76px;
  right: 18px;
  z-index: 5;
  width: 290px;
  max-height: calc(100vh - 116px);
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.14);
  border-radius: calc(var(--theme-radius) * 1.25);
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-card) 95%, transparent);
  backdrop-filter: blur(22px);
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.14);
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
.details-kicker { color: var(--theme-primary); font-size: 10px; font-weight: 750; letter-spacing: 0.1em; }
.node-details h3 { margin: 7px 26px 4px 0; font-size: 18px; line-height: 1.3; }
.details-path { margin: 0 0 16px; color: var(--theme-text-secondary); font-size: 10px; line-height: 1.45; word-break: break-all; }
.details-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.details-metrics div { display: flex; flex-direction: column; gap: 3px; padding: 10px 6px; border-radius: var(--theme-radius-sm); text-align: center; background: rgba(var(--theme-primary-rgb), 0.06); }
.details-metrics strong { color: var(--theme-primary); font-size: 17px; }
.details-metrics span { color: var(--theme-text-secondary); font-size: 9px; }
.details-actions { display: grid; gap: 7px; margin: 14px 0; }
.details-actions button { min-height: 34px; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: var(--theme-radius-sm); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.06); cursor: pointer; font-size: 11px; font-weight: 650; }
.details-actions .primary-action { color: #fff; background: var(--theme-primary); }
.relation-editor { margin: 4px 0 14px; padding: 10px; border: 1px solid rgba(var(--theme-primary-rgb), 0.14); border-radius: var(--theme-radius-sm); background: rgba(var(--theme-primary-rgb), 0.035); }
.relation-editor .neighbor-title { margin: 0 0 8px; }
.relation-editor-grid { display: grid; gap: 7px; }
.relation-editor select, .relation-editor button { min-height: 32px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-card); font-size: 10px; }
.relation-editor button { color: #fff; background: var(--theme-primary); cursor: pointer; font-weight: 700; }
.relation-editor button:disabled { cursor: not-allowed; opacity: 0.5; }
.relation-editor > small { display: block; margin-top: 7px; color: var(--theme-text-secondary); font-size: 8px; line-height: 1.5; }
.details-relations { display: flex; flex-direction: column; gap: 7px; }
.details-relation-card { position: relative; display: flex; width: 100%; border: 1px solid rgba(var(--theme-primary-rgb), 0.12); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: rgba(var(--theme-primary-rgb), 0.035); text-align: left; }
.details-relation-card:hover { border-color: rgba(var(--theme-primary-rgb), 0.38); background: rgba(var(--theme-primary-rgb), 0.075); }
.relation-focus { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; padding: 9px; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.relation-delete { align-self: stretch; width: 42px; border: 0; border-left: 1px solid rgba(var(--theme-primary-rgb), 0.1); color: #c74848; background: transparent; cursor: pointer; font-size: 9px; }
.relation-delete:hover { background: rgba(199, 72, 72, 0.09); }
.details-relation-head, .details-relation-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.details-relation-head strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.details-relation-head small { flex: none; color: var(--theme-primary); font-size: 8px; }
.details-relation-context { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: 9px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.details-relation-meta { color: var(--theme-text-secondary); font-size: 8px; }
.details-relation-meta code { max-width: 55%; overflow: hidden; color: var(--theme-primary); text-overflow: ellipsis; white-space: nowrap; }
.neighbor-title { display: block; margin: 16px 0 7px; color: var(--theme-text-secondary); font-size: 10px; font-weight: 700; }
.neighbor-list button { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 8px 4px; border: 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05); color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }
.neighbor-list button:hover { color: var(--theme-primary); }
.neighbor-list small { flex: none; color: var(--theme-text-secondary); font-size: 9px; }
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
  font-size: 10px;
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

.is-dark .graph-header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
  .graph-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 12px;
    padding: 10px 12px 8px;
  }

  .back-btn {
    padding: 7px 10px;
  }

  .header-title {
    min-width: 0;
    gap: 7px;
  }

  .header-title svg {
    width: 18px;
    height: 18px;
    flex: none;
  }

  .graph-title,
  .view-switch button,
  .tutorial-btn,
  .health-entry,
  .graph-export-btn {
    white-space: nowrap;
  }

  .graph-title {
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
  }

  .graph-controls {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 3px;
    scrollbar-width: thin;
  }

  .graph-controls > * {
    flex: 0 0 auto;
  }

  .graph-search {
    width: 142px;
  }

  .graph-options {
    top: 102px;
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
  .tutorial-btn span { display: none; }
  .tutorial-btn { width: 36px; padding: 0; justify-content: center; }
  .health-entry { width: 36px; padding: 0; justify-content: center; font-size: 0; }
  .graph-export-btn { display: none; }
  .tutorial-card { padding: 24px 18px; }
  .empty-icon { display: none; }
}
</style>
