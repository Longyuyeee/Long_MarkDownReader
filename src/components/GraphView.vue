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
        <button class="tutorial-btn" :class="{ active: showTutorial }" @click="showTutorial = !showTutorial" title="如何建立链接">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/>
            <path d="M12 18h.01"/>
          </svg>
          <span>如何建立链接</span>
        </button>
        <button class="control-btn" @click="resetView" title="重置视图">
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
    <canvas ref="canvasRef" @mousedown="startDrag" @mousemove="onDrag" @mouseup="endDrag" @wheel.prevent="onZoom" @click="onClick" @dblclick="onDblClick"></canvas>

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
        {{ graphData.nodes.length }} 节点
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        </svg>
        {{ graphData.edges.length }} 连接
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
        </div>
        <span class="tip-path">{{ hoveredNode.path }}</span>
        <div class="tooltip-hint">双击打开 · 拖拽移动</div>
      </div>
    </transition>
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
const isLoading = ref(true)
const showTutorial = ref(false)

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

const loadGraph = async () => {
  isLoading.value = true
  if (!store.libraryPath) {
    graphData.value = { nodes: [], edges: [] }
    isLoading.value = false
    return
  }
  try {
    graphData.value = await invoke<any>('build_link_graph', { libraryRoot: store.libraryPath })
    initLayout()
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
  if (frameCount > LAYOUT_MAX_FRAMES) { layoutSettled = true; return }

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
  for (const e of edges) {
    const s = nodeMap.get(e.source)
    const t = nodeMap.get(e.target)
    if (!s || !t) continue
    const dx = (t.x || 0) - (s.x || 0)
    const dy = (t.y || 0) - (s.y || 0)
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const f = dist * 0.015
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
  }
}

const resetView = () => {
  viewX = 0
  viewY = 0
  zoom = 1
  frameCount = 0
  layoutSettled = false
  initLayout()
}

const findNodeAt = (mx: number, my: number): GraphNode | null => {
  // 缩放时调整检测范围 - 缩小时扩大点击区域
  const detectionRadius = 100 / Math.max(0.5, zoom)
  for (const n of graphData.value.nodes) {
    const r = n.size * 0.6
    const dx = mx - (n.x || 0), dy = my - (n.y || 0)
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
  const isDark = store.theme === 'dark'

  // 构建节点 Map 加速查找
  const nodeMap = new Map<string, GraphNode>()
  graphData.value.nodes.forEach(n => nodeMap.set(n.id, n))

  // 边 - 渐变效果（小缩放级别时跳过以优化性能）
  if (zoom > 0.3) {
    for (const e of graphData.value.edges) {
      const s = nodeMap.get(e.source)
      const t = nodeMap.get(e.target)
      if (!s || !t) continue

      const isHighlight = hovered && (s === hovered || t === hovered)

      ctx.beginPath()
      ctx.moveTo(s.x || 0, s.y || 0)
      ctx.lineTo(t.x || 0, t.y || 0)

      if (isHighlight) {
        const gradient = ctx.createLinearGradient(s.x || 0, s.y || 0, t.x || 0, t.y || 0)
        gradient.addColorStop(0, isDark ? 'rgba(66,184,131,0.6)' : 'rgba(0,122,255,0.6)')
        gradient.addColorStop(1, isDark ? 'rgba(66,184,131,0.3)' : 'rgba(0,122,255,0.3)')
        ctx.strokeStyle = gradient
        ctx.lineWidth = 2.5 / zoom
      } else {
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
        ctx.lineWidth = 1 / zoom
      }
      ctx.stroke()
    }
  }

  // 节点 - 光晕效果
  for (const n of graphData.value.nodes) {
    const r = n.size * 0.6
    const isHovered = hovered === n

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

    if (isHovered) {
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
  }
  if (dragging && dragging.id && !wasDragging) {
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
  gap: 6px;
}

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

@media (max-width: 640px) {
  .tutorial-btn span { display: none; }
  .tutorial-btn { width: 36px; padding: 0; justify-content: center; }
  .tutorial-card { padding: 24px 18px; }
  .empty-icon { display: none; }
}
</style>
