<template>
  <div class="graph-container" ref="containerRef">
    <div class="graph-header">
      <button class="back-btn" @click="$router.push('/library')">← 返回</button>
      <span class="graph-title">知识图谱</span>
    </div>
    <canvas ref="canvasRef" @mousedown="startDrag" @mousemove="onDrag" @mouseup="endDrag" @wheel.prevent="onZoom" @click="onClick"></canvas>
    <div class="graph-info">
      {{ graphData.nodes.length }} 节点 · {{ graphData.edges.length }} 连接
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store/app'

interface GraphNode { id: string; title: string; path: string; size: number; x?: number; y?: number; vx?: number; vy?: number }
interface GraphEdge { source: string; target: string }

const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['selectFile'])

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const store = useAppStore()

const graphData = ref<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] })

let animationId = 0
let dragging: GraphNode | null = null
let offsetX = 0, offsetY = 0
let viewX = 0, viewY = 0, zoom = 1

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
  const nodes = graphData.value.nodes
  const edges = graphData.value.edges

  // 力导向迭代
  for (let iter = 0; iter < 3; iter++) {
    // 斥力
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
    // 引力（边）
    for (const e of edges) {
      const s = nodes.find(n => n.id === e.source)
      const t = nodes.find(n => n.id === e.target)
      if (!s || !t) continue
      const dx = (t.x || 0) - (s.x || 0)
      const dy = (t.y || 0) - (s.y || 0)
      const dist = Math.sqrt(dx * dx + dy * dy)
      const force = dist * 0.01
      s.vx = (s.vx || 0) + (dx / dist) * force; s.vy = (s.vy || 0) + (dy / dist) * force
      t.vx = (t.vx || 0) - (dx / dist) * force; t.vy = (t.vy || 0) - (dy / dist) * force
    }
    // 中心引力
    const cx = (containerRef.value?.clientWidth || 800) / 2 / zoom - viewX / zoom
    const cy = (containerRef.value?.clientHeight || 600) / 2 / zoom - viewY / zoom
    for (const n of nodes) {
      n.vx = (n.vx || 0) + (cx - (n.x || 0)) * 0.001
      n.vy = (n.vy || 0) + (cy - (n.y || 0)) * 0.001
      // 阻尼
      n.vx = (n.vx || 0) * 0.9; n.vy = (n.vy || 0) * 0.9
      n.x = (n.x || 0) + (n.vx || 0)
      n.y = (n.y || 0) + (n.vy || 0)
    }
  }
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

  // 边
  ctx.strokeStyle = 'rgba(128,128,128,0.15)'
  ctx.lineWidth = 1 / zoom
  for (const e of graphData.value.edges) {
    const s = graphData.value.nodes.find(n => n.id === e.source)
    const t = graphData.value.nodes.find(n => n.id === e.target)
    if (!s || !t) continue
    ctx.beginPath()
    ctx.moveTo(s.x || 0, s.y || 0)
    ctx.lineTo(t.x || 0, t.y || 0)
    ctx.stroke()
  }

  // 节点
  const isDark = store.theme === 'dark'
  for (const n of graphData.value.nodes) {
    const r = n.size * 0.6
    ctx.beginPath()
    ctx.arc(n.x || 0, n.y || 0, r, 0, Math.PI * 2)
    ctx.fillStyle = isDark ? 'rgba(66,184,131,0.7)' : 'rgba(0,122,255,0.7)'
    ctx.fill()
    // 标签
    ctx.fillStyle = isDark ? '#ccc' : '#333'
    ctx.font = `${Math.max(10, 12 / zoom)}px sans-serif`
    ctx.textAlign = 'center'
    const display = n.title.length > 8 ? n.title.slice(0, 8) + '..' : n.title
    ctx.fillText(display, n.x || 0, (n.y || 0) + r + 14 / zoom)
  }

  ctx.restore()
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
  // 检查是否点击了节点
  for (const n of graphData.value.nodes) {
    const r = n.size * 0.6
    const dx = mx - (n.x || 0), dy = my - (n.y || 0)
    if (dx * dx + dy * dy < r * r + 100) {
      dragging = n
      offsetX = (n.x || 0) - mx
      offsetY = (n.y || 0) - my
      return
    }
  }
  // 否则拖拽画布
  dragging = { id: '', title: '', path: '', size: 0, x: e.clientX, y: e.clientY } as any
  offsetX = viewX; offsetY = viewY
}

const onDrag = (e: MouseEvent) => {
  if (!dragging) return
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

const endDrag = () => { dragging = null }

const onZoom = (e: WheelEvent) => {
  const newZoom = zoom * (e.deltaY > 0 ? 0.9 : 1.1)
  zoom = Math.max(0.1, Math.min(3, newZoom))
}

const onClick = () => {
  if (dragging && dragging.id) { emit('selectFile', dragging.path) }
}

watch(() => props.show, (v) => { if (v) loadGraph() })
watch(() => store.libraryPath, () => { if (props.show) loadGraph() })

onMounted(() => { loop() })
onUnmounted(() => { cancelAnimationFrame(animationId) })
</script>

<style scoped>
.graph-container {
  width: 100%; height: 100vh; position: relative;
  background: var(--theme-bg); display: flex; flex-direction: column;
}
.graph-header {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px; flex-shrink: 0;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.back-btn {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--theme-primary); padding: 4px 8px;
  border-radius: 6px; transition: background 0.15s;
}
.back-btn:hover { background: rgba(0,0,0,0.05); }
.graph-title { font-size: 16px; font-weight: 700; }
.is-dark .graph-header { border-bottom-color: rgba(255,255,255,0.05); }
.is-dark .back-btn:hover { background: rgba(255,255,255,0.05); }
canvas {
  display: block; cursor: grab;
}
canvas:active { cursor: grabbing; }
.graph-info {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  font-size: 12px; opacity: 0.5; pointer-events: none;
  background: rgba(0,0,0,0.05); padding: 4px 12px; border-radius: 10px;
}
.is-dark .graph-info { background: rgba(255,255,255,0.05); }
</style>
