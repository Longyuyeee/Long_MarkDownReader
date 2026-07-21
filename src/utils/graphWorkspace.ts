import type { GraphEdge, GraphNode } from '../types/graph'

type StoredPoint = { x: number; y: number }
type StoredLayout = { updatedAt: number; positions: Record<string, StoredPoint> }
type LayoutStore = { version: 1; layouts: Record<string, StoredLayout> }

const STORAGE_KEY = 'longedit.graph.layouts.v1'
const MAX_LAYOUTS = 40
const MAX_POSITIONS = 5000

const finitePoint = (value: unknown): value is StoredPoint => {
  const point = value as StoredPoint
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
}

const readStore = (): LayoutStore => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as LayoutStore
    if (parsed?.version === 1 && parsed.layouts && typeof parsed.layouts === 'object') return parsed
  } catch { /* invalid device state is ignored */ }
  return { version: 1, layouts: {} }
}

const storageId = (libraryRoot: string, layoutId: string) => `${libraryRoot}\n${layoutId}`

export const restoreGraphLayout = (libraryRoot: string, layoutId: string, nodes: GraphNode[]) => {
  const stored = readStore().layouts[storageId(libraryRoot, layoutId)]
  if (!stored) return 0
  let restored = 0
  for (const node of nodes) {
    const point = stored.positions[node.id]
    if (!finitePoint(point)) continue
    node.x = point.x
    node.y = point.y
    node.vx = 0
    node.vy = 0
    restored++
  }
  return restored
}

export const saveGraphLayout = (libraryRoot: string, layoutId: string, nodes: GraphNode[]) => {
  if (!libraryRoot) return
  const positions: Record<string, StoredPoint> = {}
  for (const node of nodes.slice(0, MAX_POSITIONS)) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) positions[node.id] = { x: node.x!, y: node.y! }
  }
  const store = readStore()
  store.layouts[storageId(libraryRoot, layoutId)] = { updatedAt: Date.now(), positions }
  store.layouts = Object.fromEntries(Object.entries(store.layouts).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_LAYOUTS))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch { /* best effort */ }
}

export const clearGraphLayout = (libraryRoot: string, layoutId: string) => {
  const store = readStore()
  delete store.layouts[storageId(libraryRoot, layoutId)]
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch { /* best effort */ }
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character] || character))

export interface GraphSvgOptions {
  mode: 'network' | 'mindmap'
  title: string
  dark: boolean
  rootId?: string
  colors?: { background: string; foreground: string; card: string; primary: string; edge: string }
}

export const createGraphSvg = (nodes: GraphNode[], edges: GraphEdge[], options: GraphSvgOptions) => {
  if (!nodes.length) throw new Error('当前筛选条件下没有可导出的节点')
  const mindmap = options.mode === 'mindmap'
  const padding = 64
  const extents = nodes.map(node => {
    const root = node.id === options.rootId
    const halfWidth = mindmap ? (root ? 90 : 80) : Math.max(18, node.size * 0.6)
    const halfHeight = mindmap ? (root ? 24 : 21) : Math.max(34, node.size * 0.6 + 22)
    return { left: (node.x || 0) - halfWidth, right: (node.x || 0) + halfWidth, top: (node.y || 0) - halfHeight, bottom: (node.y || 0) + halfHeight }
  })
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const extent of extents) {
    minX = Math.min(minX, extent.left)
    maxX = Math.max(maxX, extent.right)
    minY = Math.min(minY, extent.top)
    maxY = Math.max(maxY, extent.bottom)
  }
  minX -= padding; maxX += padding; minY -= padding; maxY += padding
  const width = Math.max(320, Math.ceil(maxX - minX))
  const height = Math.max(240, Math.ceil(maxY - minY))
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const background = options.colors?.background ?? (options.dark ? '#17191d' : '#f7f9fc')
  const foreground = options.colors?.foreground ?? (options.dark ? '#f2f5f7' : '#18202b')
  const card = options.colors?.card ?? (options.dark ? '#252a30' : '#ffffff')
  const primary = options.colors?.primary ?? (options.dark ? '#42b883' : '#007aff')
  const edgeColor = options.colors?.edge ?? (options.dark ? '#56616d' : '#aab5c2')
  const edgeMarkup = edges.flatMap(edge => {
    const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target)
    if (!source || !target) return []
    const sx = source.x || 0, sy = source.y || 0, tx = target.x || 0, ty = target.y || 0
    const shape = mindmap ? `<path d="M ${sx} ${sy} C ${(sx + tx) / 2} ${sy}, ${(sx + tx) / 2} ${ty}, ${tx} ${ty}"/>` : `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}"/>`
    let arrow = ''
    if (edge.directed) {
      const ratio = 0.72, inverse = 1 - ratio, middle = (sx + tx) / 2
      const ax = mindmap ? inverse ** 3 * sx + 3 * inverse ** 2 * ratio * middle + 3 * inverse * ratio ** 2 * middle + ratio ** 3 * tx : sx + (tx - sx) * ratio
      const ay = mindmap ? inverse ** 3 * sy + 3 * inverse ** 2 * ratio * sy + 3 * inverse * ratio ** 2 * ty + ratio ** 3 * ty : sy + (ty - sy) * ratio
      const dx = mindmap ? 3 * inverse ** 2 * (middle - sx) + 3 * inverse * ratio * (middle - middle) + 3 * ratio ** 2 * (tx - middle) : tx - sx
      const dy = mindmap ? 3 * inverse ** 2 * (sy - sy) + 3 * inverse * ratio * (ty - sy) + 3 * ratio ** 2 * (ty - ty) : ty - sy
      const length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length, px = -uy, py = ux
      arrow = `<polygon points="${ax + ux * 6},${ay + uy * 6} ${ax - ux * 4 + px * 4},${ay - uy * 4 + py * 4} ${ax - ux * 4 - px * 4},${ay - uy * 4 - py * 4}"/>`
    }
    return [`<g class="edge${edge.directed ? ' directed' : ' related'}">${shape}${arrow}</g>`]
  }).join('')
  const nodeMarkup = nodes.map(node => {
    const x = node.x || 0, y = node.y || 0
    const label = escapeXml(node.title.length > 28 ? `${node.title.slice(0, 28)}…` : node.title)
    if (mindmap) {
      const root = node.id === options.rootId, w = root ? 180 : 160, h = root ? 48 : 42
      return `<g class="node mindmap-node${root ? ' root' : ''}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${root ? 16 : 11}"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${label}</text></g>`
    }
    const radius = Math.max(7, node.size * 0.6)
    return `<g class="node network-node"><circle cx="${x}" cy="${y}" r="${radius}"/><text x="${x}" y="${y + radius + 18}" text-anchor="middle">${label}</text></g>`
  }).join('')
  const metadata = escapeXml(`${nodes.length} nodes, ${edges.length} edges`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${escapeXml(options.title)}"><title>${escapeXml(options.title)}</title><desc>${metadata}</desc><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${background}"/><style>.edge path,.edge line{fill:none;stroke:${edgeColor};stroke-width:1.4}.edge polygon{fill:${edgeColor}}.edge.related path,.edge.related line{stroke-dasharray:5 4}.node text{font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:${foreground}}.network-node circle{fill:${primary};stroke:rgba(255,255,255,.55);stroke-width:1.2}.mindmap-node rect{fill:${card};stroke:${edgeColor};stroke-width:1}.mindmap-node.root rect{fill:${primary};stroke:${primary}}.mindmap-node.root text{fill:#fff;font-weight:700}</style><g class="edges">${edgeMarkup}</g><g class="nodes">${nodeMarkup}</g></svg>`
}

export const graphSvgToPng = async (svg: string) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    const scale = Math.min(2, 8192 / image.width, 8192 / image.height, Math.sqrt(32_000_000 / (image.width * image.height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建 PNG 画布')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('PNG 编码失败')
    return new Uint8Array(await png.arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}
