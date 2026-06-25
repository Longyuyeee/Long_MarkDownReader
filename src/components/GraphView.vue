<template>
  <div class="graph-container" ref="containerRef">
    <div class="graph-header">
      <button class="back-btn" @click="$router.push('/library')">← 返回</button>
      <span class="graph-title">知识图谱</span>
    </div>
    <canvas ref="canvasRef" @mousedown="startDrag" @mousemove="onDrag" @mouseup="endDrag" @wheel.prevent="onZoom" @click="onClick" @dblclick="onDblClick"></canvas>
    <div class="graph-info">
      {{ graphData.nodes.length }} 节点 · {{ graphData.edges.length }} 连接
    </div>
    <!-- 节点悬浮提示 -->
    <div v-if="hoveredNode" class="node-tooltip" :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">
      <strong>{{ hoveredNode.title }}</strong>
      <span class="tip-path">{{ hoveredNode.path }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store/app'

interface GraphNode { id: string; title: string; path: string; size: number; x?: number; y?: number; vx?: number; vy?: number }
interface GraphEdge { source: string; target: string }

const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['selectFile'])

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const store = useAppStore()
const router = useRouter()

const graphData = ref<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] })

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

const loadGraph = async () => {
  if (!store.libraryPath) return
  try {
    graphData.value = await invoke<any>('build_link_graph', { libraryRoot: store.libraryPath })
    initLayout()
  } catch (e) { graphData.value = { nodes: [], edges: [] } }
}

const initLayout = () => {
  const nodes = graphData.value.nodes
  const cx = (containerRef.value?.clientWidth || 800) / 2
  const cy = (containerRef.value?.clientHeight || 600) / 2
  nodes.forEach(n => {
    n.x = cx + (Math.random() - 0.5) * 400
    n.y = cy + (Math.random() - 0.5) * 400
    n.vx = 0; n.vy = 0
  })
}

const simulate = () => {
  if (layoutSettled) return
  const nodes = graphData.value.nodes
  const edges = graphData.value.edges
  if (nodes.length === 0) return

  frameCount++
  if (frameCount > 90) { layoutSettled = true; return }
  if (frameCount > 40 && frameCount % 2 !== 0) return

  // 构建节点索引 Map（加速边查找）
  const nodeMap = new Map<string, GraphNode>(); nodes.forEach(n => nodeMap.set(n.id, n))

  const iters = frameCount < 30 ? 2 : 1
  for (let iter = 0; iter < iters; iter++) {
    let etotal = 0
    // 斥力 — 仅对节点数 ≤200 时用 O(n^2)，超过则跳过
    if (nodes.length <= 200) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[j].x || 0) - (nodes[i].x || 0)
          const dy = (nodes[j].y || 0) - (nodes[i].y || 0)
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = 500 / (dist * dist)
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          nodes[i].vx = (nodes[i].vx || 0) - fx; nodes[i].vy = (nodes[i].vy || 0) - fy
          nodes[j].vx = (nodes[j].vx || 0) + fx; nodes[j].vy = (nodes[j].vy || 0) + fy
        }
      }
    }
    // 引力 — 用 Map 替代 find()
    for (const e of edges) {
      const s = nodeMap.get(e.source), t = nodeMap.get(e.target)
      if (!s || !t) continue
      const dx = (t.x || 0) - (s.x || 0), dy = (t.y || 0) - (s.y || 0)
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const f = dist * 0.01
      s.vx = (s.vx || 0) + (dx / dist) * f; s.vy = (s.vy || 0) + (dy / dist) * f
      t.vx = (t.vx || 0) - (dx / dist) * f; t.vy = (t.vy || 0) - (dy / dist) * f
    }
    // 中心引力 + 能量累计
    const cx = (containerRef.value?.clientWidth || 800) / 2 / zoom - viewX / zoom
    const cy = (containerRef.value?.clientHeight || 600) / 2 / zoom - viewY / zoom
    for (const n of nodes) {
      n.vx = (n.vx || 0) + (cx - (n.x || 0)) * 0.001
      n.vy = (n.vy || 0) + (cy - (n.y || 0)) * 0.001
      n.vx = (n.vx || 0) * 0.88; n.vy = (n.vy || 0) * 0.88
      n.x = (n.x || 0) + (n.vx || 0); n.y = (n.y || 0) + (n.vy || 0)
      etotal += Math.abs(n.vx || 0) + Math.abs(n.vy || 0)
    }
    // 能量收敛 → 提前停止
    if (etotal < 1.0 && frameCount > 20) { layoutSettled = true; return }
  }
}

const findNodeAt = (mx: number, my: number): GraphNode | null => {
  for (const n of graphData.value.nodes) {
    const r = n.size * 0.6
    const dx = mx - (n.x || 0), dy = my - (n.y || 0)
    if (dx * dx + dy * dy < r * r + 100) return n
  }
  return null
}

const draw = () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(viewX, viewY)
  ctx.scale(zoom, zoom)

  const hovered = hoveredNode.value

  // 边
  for (const e of graphData.value.edges) {
    const s = graphData.value.nodes.find(n => n.id === e.source)
    const t = graphData.value.nodes.find(n => n.id === e.target)
    if (!s || !t) continue
    const isHighlight = hovered && (s === hovered || t === hovered)
    ctx.beginPath()
    ctx.moveTo(s.x || 0, s.y || 0)
    ctx.lineTo(t.x || 0, t.y || 0)
    ctx.strokeStyle = isHighlight ? 'rgba(128,128,255,0.4)' : 'rgba(128,128,128,0.12)'
    ctx.lineWidth = isHighlight ? 2 / zoom : 1 / zoom
    ctx.stroke()
  }

  // 节点
  const isDark = store.theme === 'dark'
  for (const n of graphData.value.nodes) {
    const r = n.size * 0.6
    ctx.beginPath()
    ctx.arc(n.x || 0, n.y || 0, r, 0, Math.PI * 2)
    const isHovered = hovered === n
    ctx.fillStyle = isHovered
      ? (isDark ? 'rgba(100,200,150,0.9)' : 'rgba(0,100,255,0.9)')
      : (isDark ? 'rgba(66,184,131,0.7)' : 'rgba(0,122,255,0.7)')
    ctx.fill()
    // 悬停描边
    if (isHovered) {
      ctx.strokeStyle = isDark ? '#fff' : '#000'
      ctx.lineWidth = 2 / zoom
      ctx.stroke()
    }
    // 标签
    ctx.fillStyle = isDark ? '#ccc' : '#333'
    ctx.font = `${Math.max(10, 12 / zoom)}px sans-serif`
    ctx.textAlign = 'center'
    const display = n.title.length > 8 ? n.title.slice(0, 8) + '..' : n.title
    ctx.fillText(display, n.x || 0, (n.y || 0) + r + 14 / zoom)
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
      tooltipX.value = mouseX - canvasRect.left + 16
      tooltipY.value = mouseY - canvasRect.top - 40
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
  }
  if (dragging && dragging.id && !wasDragging) {
    emit('selectFile', dragging.path)
  }
  dragging = null
  wasDragging = false
}

const onZoom = (e: WheelEvent) => {
  mouseX = e.clientX; mouseY = e.clientY
  const newZoom = zoom * (e.deltaY > 0 ? 0.9 : 1.1)
  zoom = Math.max(0.1, Math.min(3, newZoom))
  layoutSettled = false; frameCount = 100
}

const onClick = () => {
  // 点击逻辑由 endDrag 处理 — 此处不再发射
}

const onDblClick = () => {
  if (hoveredNode.value) {
    router.push({ name: 'LibraryMode', query: { path: hoveredNode.value.path } })
  }
}

watch(() => props.show, (v) => { if (v) loadGraph() })
watch(() => store.libraryPath, () => { if (props.show) loadGraph() })

let paused = false
const handleVisibility = () => {
  if (document.hidden) { paused = true; cancelAnimationFrame(animationId) }
  else if (paused) { paused = false; layoutSettled = false; frameCount = 40; loop() }
}
onMounted(() => { loadGraph(); loop(); document.addEventListener('visibilitychange', handleVisibility) })
onUnmounted(() => { cancelAnimationFrame(animationId); document.removeEventListener('visibilitychange', handleVisibility) })
</script>

<style scoped>
.graph-container { width: 100%; height: 100vh; position: relative; background: var(--theme-bg); display: flex; flex-direction: column; }
.graph-header { display: flex; align-items: center; gap: 16px; padding: 12px 20px; flex-shrink: 0; border-bottom: 1px solid rgba(0,0,0,0.05); z-index: 10; }
.back-btn { background: none; border: none; cursor: pointer; font-size: 14px; color: var(--theme-primary); padding: 4px 8px; border-radius: 6px; }
.back-btn:hover { background: rgba(0,0,0,0.05); }
.graph-title { font-size: 16px; font-weight: 700; }
canvas { display: block; cursor: grab; flex: 1; }
canvas:active { cursor: grabbing; }
.graph-info { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); font-size: 12px; opacity: 0.5; pointer-events: none; background: rgba(0,0,0,0.05); padding: 4px 12px; border-radius: 10px; }
.node-tooltip { position: absolute; pointer-events: none; background: var(--theme-bg); border: 1px solid rgba(0,0,0,0.1); padding: 6px 10px; border-radius: 8px; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; display: flex; flex-direction: column; gap: 2px; max-width: 220px; }
.node-tooltip strong { font-size: 13px; }
.tip-path { opacity: 0.5; font-size: 10px; word-break: break-all; }
.is-dark .graph-header { border-bottom-color: rgba(255,255,255,0.05); }
.is-dark .back-btn:hover { background: rgba(255,255,255,0.05); }
.is-dark .graph-info { background: rgba(255,255,255,0.05); }
.is-dark .node-tooltip { border-color: rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
</style>
