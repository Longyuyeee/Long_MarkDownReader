<template>
  <section class="local-graph-card" aria-label="当前笔记局部图谱" data-testid="local-graph-card" :data-current-path="currentPath">
    <div class="local-graph-header">
      <div>
        <span class="local-kicker">局部图谱</span>
        <strong>当前笔记关系</strong>
      </div>
      <div class="depth-switch" aria-label="局部图谱深度">
        <button v-for="level in [1, 2, 3]" :key="level" :class="{ active: depth === level }" @click="depth = level">
          {{ level }} 跳
        </button>
      </div>
    </div>
    <GraphFilterControls :graph="graph" compact />

    <div v-if="loading" class="local-graph-state">
      <span class="graph-spinner"></span>正在分析关系…
    </div>
    <div v-else-if="error" class="local-graph-state error-state">{{ error }}</div>
    <template v-else>
      <svg class="local-graph-canvas" viewBox="0 0 300 240" role="img" :aria-label="`${filteredGraph.nodes.length} 个相关节点`">
        <defs>
          <marker id="local-arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g class="local-edges">
          <line
            v-for="edge in positionedEdges"
            :key="`${edge.source}-${edge.target}`"
            :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
            :class="{ related: !edge.directed }"
            :style="{ stroke: edge.semantic.color, strokeDasharray: edge.semantic.line === 'solid' ? 'none' : edge.semantic.line === 'dashed' ? '5 4' : '2 4' }"
            :marker-end="edge.directed ? 'url(#local-arrow)' : undefined"
          />
        </g>
        <g
          v-for="node in positionedNodes"
          :key="node.id"
          class="local-node"
          :class="{ center: node.id === centerNodeId }"
          :transform="`translate(${node.x} ${node.y})`"
          tabindex="0"
          role="button"
          :aria-label="node.title"
          @click="emit('select', node.path)"
          @keydown.enter="emit('select', node.path)"
        >
          <circle v-if="node.semantic.shape === 'circle'" class="node-mark" :r="node.id === centerNodeId ? 18 : 12" :style="{ fill: nodeColor(node), stroke: nodeColor(node) }" />
          <rect v-else-if="node.semantic.shape === 'square'" class="node-mark" :x="node.id === centerNodeId ? -15 : -10" :y="node.id === centerNodeId ? -15 : -10" :width="node.id === centerNodeId ? 30 : 20" :height="node.id === centerNodeId ? 30 : 20" rx="3" :style="{ fill: nodeColor(node), stroke: nodeColor(node) }" />
          <rect v-else-if="node.semantic.shape === 'diamond'" class="node-mark" :x="node.id === centerNodeId ? -13 : -9" :y="node.id === centerNodeId ? -13 : -9" :width="node.id === centerNodeId ? 26 : 18" :height="node.id === centerNodeId ? 26 : 18" rx="2" transform="rotate(45)" :style="{ fill: nodeColor(node), stroke: nodeColor(node) }" />
          <polygon v-else class="node-mark" :points="node.id === centerNodeId ? '-16,-9 -8,-16 8,-16 16,-9 16,9 8,16 -8,16 -16,9' : '-11,-6 -6,-11 6,-11 11,-6 11,6 6,11 -6,11 -11,6'" :style="{ fill: nodeColor(node), stroke: nodeColor(node) }" />
          <text class="node-glyph" y="3" text-anchor="middle">{{ node.semantic.glyph }}</text>
          <text y="26" text-anchor="middle">{{ shortTitle(node.title) }}</text>
          <title>{{ node.title }}</title>
        </g>
      </svg>

      <div class="local-graph-summary" data-testid="local-graph-summary" :data-node-count="filteredGraph.nodes.length" :data-edge-count="filteredGraph.edges.length">
        <span>{{ filteredGraph.nodes.length }} / {{ graph.nodes.length }} 个节点</span>
        <span>{{ filteredGraph.edges.length }} 条关系</span>
      </div>
      <p v-if="graph.nodes.length <= 1" class="local-graph-tip">当前笔记仍是孤立节点，添加 <code>[[双向链接]]</code> 后会在这里出现关系。</p>
      <p v-else-if="filteredGraph.nodes.length <= 1" class="local-graph-tip">当前筛选条件下没有匹配的关联笔记，可在“筛选”中调整条件。</p>
      <div v-else-if="directRelations.length" class="relation-evidence">
        <div class="relation-evidence-title">
          <strong>关系依据</strong>
          <span>{{ directRelations.length }} 条直接关系</span>
        </div>
        <button
          v-for="relation in directRelations"
          :key="`${relation.edge.source}-${relation.edge.target}`"
          class="relation-card"
          @click="emit('select', relation.other.path)"
        >
          <span class="relation-card-head">
            <strong>{{ relation.other.title }}</strong>
            <span :class="['direction-badge', relation.direction]">
              {{ relation.direction === 'related' ? '相关' : relation.direction === 'outgoing' ? '链出 →' : '← 链入' }}
            </span>
          </span>
          <span class="relation-context">{{ relation.evidence?.context || relation.evidence?.syntax || 'Wikilink 引用' }}</span>
          <span class="relation-meta">
            <code>{{ relation.evidence?.syntax || '[[wikilink]]' }}</code>
            <span>{{ relationTypeLabel(relation.edge.relationType) }}<template v-if="relation.evidence?.line"> · 第 {{ relation.evidence.line }} 行</template><template v-if="relation.edge.mentions.length > 1"> · {{ relation.edge.mentions.length }} 处</template></span>
          </span>
        </button>
      </div>
      <div class="local-actions">
        <button class="mindmap-entry" @click="emit('openMindmap')">打开思维导图</button>
        <button class="mindmap-entry primary" @click="emit('openCanvas', depth)">生成可编辑画布</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import GraphFilterControls from './GraphFilterControls.vue'
import { applyGraphFilters, useGraphFilters } from '../composables/useGraphFilters'
import { graphObjectSemantic, graphRelationSemantic, graphSemanticColor } from '../config/graphSemantics'
import { isActiveThemeDark } from '../config/themePresets'
import { useAppStore } from '../store/app'
import { sameWorkspacePath } from '../utils/savedCollections'
import type { GraphObjectSemantic } from '../config/graphSemantics'
import type { GraphData, GraphNode } from '../types/graph'
interface PositionedNode extends GraphNode { x: number; y: number; level: number; semantic: GraphObjectSemantic }

const props = defineProps<{ libraryRoot: string; currentPath: string }>()
const emit = defineEmits<{ select: [path: string]; openMindmap: []; openCanvas: [depth: number] }>()
const store = useAppStore()

const LOCAL_GRAPH_DEPTH_KEY = 'longedit.localGraph.depth'
const savedDepth = Number(localStorage.getItem(LOCAL_GRAPH_DEPTH_KEY))
const depth = ref([1, 2, 3].includes(savedDepth) ? savedDepth : 2)
const loading = ref(false)
const error = ref('')
const graph = ref<GraphData>({ nodes: [], edges: [] })
const { filters } = useGraphFilters()
const centerNodeId = computed(() => graph.value.nodes.find(node => node.id === props.currentPath || sameWorkspacePath(node.path, props.currentPath))?.id || '')
const filteredGraph = computed(() => applyGraphFilters(graph.value, filters, centerNodeId.value || props.currentPath))

const loadGraph = async () => {
  if (!props.libraryRoot || !props.currentPath) {
    graph.value = { nodes: [], edges: [] }
    return
  }
  loading.value = true
  error.value = ''
  try {
    graph.value = await invoke<GraphData>('build_local_graph', {
      libraryRoot: props.libraryRoot,
      centerPath: props.currentPath,
      depth: depth.value,
    })
  } catch (cause) {
    graph.value = { nodes: [], edges: [] }
    error.value = `关系加载失败：${String(cause)}`
  } finally {
    loading.value = false
  }
}

const positionedNodes = computed<PositionedNode[]>(() => {
  const center = filteredGraph.value.nodes.find(node => node.id === centerNodeId.value)
  if (!center) return []

  const levels = new Map<string, number>([[center.id, 0]])
  let frontier = [center.id]
  for (let level = 1; level <= depth.value && frontier.length; level++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const edge of filteredGraph.value.edges) {
        const neighbor = edge.source === id ? edge.target : edge.target === id ? edge.source : null
        if (neighbor && !levels.has(neighbor)) {
          levels.set(neighbor, level)
          next.push(neighbor)
        }
      }
    }
    frontier = next
  }

  const result: PositionedNode[] = [{ ...center, x: 150, y: 112, level: 0, semantic: graphObjectSemantic(center.objectType) }]
  for (let level = 1; level <= depth.value; level++) {
    const nodes = filteredGraph.value.nodes.filter(node => levels.get(node.id) === level)
    const radius = Math.min(102, 48 + level * 28)
    nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, nodes.length)
      result.push({
        ...node,
        x: 150 + Math.cos(angle) * radius,
        y: 112 + Math.sin(angle) * radius,
        level,
        semantic: graphObjectSemantic(node.objectType),
      })
    })
  }
  return result
})

const positionedEdges = computed(() => {
  const positions = new Map(positionedNodes.value.map(node => [node.id, node]))
  return filteredGraph.value.edges.flatMap(edge => {
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) return []
    return [{ ...edge, semantic: graphRelationSemantic(edge.relationType), x1: source.x, y1: source.y, x2: target.x, y2: target.y }]
  })
})

const directRelations = computed(() => {
  const centerId = centerNodeId.value
  const nodeMap = new Map(filteredGraph.value.nodes.map(node => [node.id, node]))
  return filteredGraph.value.edges.flatMap(edge => {
    const outgoing = edge.source === centerId
    const incoming = edge.target === centerId
    if (!outgoing && !incoming) return []
    const other = nodeMap.get(outgoing ? edge.target : edge.source)
    if (!other) return []
    return [{
      edge,
      other,
      direction: !edge.directed ? 'related' as const : outgoing ? 'outgoing' as const : 'incoming' as const,
      evidence: edge.mentions[0],
    }]
  }).sort((a, b) => a.other.title.localeCompare(b.other.title, 'zh-CN'))
})

const shortTitle = (title: string) => title.length > 8 ? `${title.slice(0, 8)}…` : title
const relationTypeLabel = (type: string) => graphRelationSemantic(type).label
const nodeColor = (node: PositionedNode) => graphSemanticColor(node.objectType, isActiveThemeDark(store.theme))

watch(depth, value => localStorage.setItem(LOCAL_GRAPH_DEPTH_KEY, String(value)))
watch([() => props.libraryRoot, () => props.currentPath, depth], loadGraph, { immediate: true })
</script>

<style scoped>
.local-graph-card {
  margin: 10px;
  padding: 14px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.13);
  border-radius: calc(var(--theme-radius) * 1.1);
  background: linear-gradient(145deg, rgba(var(--theme-primary-rgb), 0.055), transparent 65%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.045);
}
.local-graph-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.local-graph-header > div:first-child { display: flex; flex-direction: column; gap: 2px; }
.local-kicker { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 800; letter-spacing: 0.13em; }
.local-graph-header strong { color: var(--theme-text); font-size: 13px; }
.graph-filter-control { display: flex; justify-content: flex-end; margin-top: 9px; }
.depth-switch { display: flex; padding: 2px; border-radius: 7px; background: rgba(0, 0, 0, 0.045); }
.depth-switch button { height: 24px; padding: 0 7px; border: 0; border-radius: 5px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: var(--text-compact); }
.depth-switch button.active { color: #fff; background: var(--theme-primary); }
.local-graph-canvas { width: 100%; height: 230px; display: block; overflow: visible; color: var(--theme-primary); }
.local-edges line { stroke: rgba(var(--theme-primary-rgb), 0.28); stroke-width: 1.2; }
.local-edges line.related { stroke-dasharray: 4 3; }
.local-node { cursor: pointer; outline: none; }
.local-node .node-mark { stroke-width: 1.5; transition: filter 0.2s ease; }
.local-node:hover .node-mark, .local-node:focus .node-mark { filter: brightness(1.14); }
.local-node.center .node-mark { stroke: color-mix(in srgb, var(--theme-primary) 55%, white) !important; stroke-width: 3; filter: drop-shadow(0 4px 8px rgba(var(--theme-primary-rgb), 0.3)); }
.local-node .node-glyph { fill: #fff; font-size: 8px; font-weight: 900; pointer-events: none; }
.local-node text { fill: var(--theme-text); font-size: var(--text-compact); font-weight: 600; pointer-events: none; }
.local-node.center text:not(.node-glyph) { fill: var(--theme-primary); font-weight: 750; }
.local-graph-summary { display: flex; justify-content: center; gap: 12px; margin-top: -4px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.local-graph-summary span { padding: 3px 7px; border-radius: 999px; background: rgba(var(--theme-primary-rgb), 0.06); }
.local-graph-state { min-height: 190px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--theme-text-secondary); font-size: 11px; }
.graph-spinner { width: 14px; height: 14px; border: 2px solid rgba(var(--theme-primary-rgb), 0.18); border-top-color: var(--theme-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
.error-state { padding: 14px; box-sizing: border-box; color: #d14d41; text-align: center; }
.local-graph-tip { margin: 10px 0; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.55; text-align: center; }
.local-graph-tip code { color: var(--theme-primary); }
.relation-evidence { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.relation-evidence-title { display: flex; align-items: center; justify-content: space-between; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.relation-evidence-title strong { color: var(--theme-text); font-size: var(--text-compact); }
.relation-card { display: flex; flex-direction: column; gap: 5px; width: 100%; padding: 9px 10px; border: 1px solid rgba(var(--theme-primary-rgb), 0.12); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 88%, transparent); cursor: pointer; text-align: left; }
.relation-card:hover { border-color: rgba(var(--theme-primary-rgb), 0.42); background: rgba(var(--theme-primary-rgb), 0.07); }
.relation-card-head, .relation-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.relation-card-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }
.direction-badge { flex: none; padding: 2px 5px; border-radius: 999px; font-size: var(--text-compact); font-weight: 750; }
.direction-badge.outgoing { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.1); }
.direction-badge.incoming { color: #9b6b16; background: rgba(201, 145, 45, 0.12); }
.direction-badge.related { color: #7a5ca8; background: rgba(122, 92, 168, 0.12); }
.relation-context { display: -webkit-box; overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.relation-meta { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.relation-meta code { max-width: 56%; overflow: hidden; color: var(--theme-primary); text-overflow: ellipsis; white-space: nowrap; }
.local-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
.mindmap-entry { width: 100%; min-height: 32px; border: 1px solid rgba(var(--theme-primary-rgb), 0.2); border-radius: var(--theme-radius-sm); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.07); cursor: pointer; font-size: var(--text-compact); font-weight: 700; }
.mindmap-entry:hover { color: #fff; background: var(--theme-primary); }
.mindmap-entry.primary { color: #fff; background: var(--theme-primary); }
.is-dark .depth-switch { background: rgba(255, 255, 255, 0.06); }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
