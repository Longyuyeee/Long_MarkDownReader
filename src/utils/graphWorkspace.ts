import type { GraphEdge, GraphNode } from '../types/graph'
import { graphObjectSemantic, graphRelationSemantic } from '../config/graphSemantics'
import { buildGraphEdgeRoutes, graphQuadraticGeometry, graphQuadraticLabelPoint, graphQuadraticPathData, graphQuadraticPoint, graphQuadraticTangent } from './graphEdgeRoutes'

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
  showRelationLabels?: boolean
  colors?: { background: string; foreground: string; card: string; primary: string; edge: string }
}

export const createGraphSvg = (nodes: GraphNode[], edges: GraphEdge[], options: GraphSvgOptions) => {
  if (!nodes.length) throw new Error('当前筛选条件下没有可导出的节点')
  const mindmap = options.mode === 'mindmap'
  const padding = 64
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const nodePoints = new Map(nodes.map(node => [node.id, { x: node.x || 0, y: node.y || 0 }]))
  const edgeRoutes = buildGraphEdgeRoutes(edges)
  const extents = nodes.map(node => {
    const root = node.id === options.rootId
    const halfWidth = mindmap ? (root ? 90 : 80) : Math.max(18, node.size * 0.6)
    const halfHeight = mindmap ? (root ? 24 : 21) : Math.max(34, node.size * 0.6 + 22)
    return { left: (node.x || 0) - halfWidth, right: (node.x || 0) + halfWidth, top: (node.y || 0) - halfHeight, bottom: (node.y || 0) + halfHeight }
  }).concat(mindmap ? [] : edgeRoutes.flatMap(route => {
    const geometry = graphQuadraticGeometry(route, nodePoints)
    return geometry ? [{ left: geometry.control.x, right: geometry.control.x, top: geometry.control.y, bottom: geometry.control.y }] : []
  }))
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
  const background = options.colors?.background ?? (options.dark ? '#17191d' : '#f7f9fc')
  const foreground = options.colors?.foreground ?? (options.dark ? '#f2f5f7' : '#18202b')
  const card = options.colors?.card ?? (options.dark ? '#252a30' : '#ffffff')
  const primary = options.colors?.primary ?? (options.dark ? '#42b883' : '#007aff')
  const edgeColor = options.colors?.edge ?? (options.dark ? '#56616d' : '#aab5c2')
  const edgeMarkup = edgeRoutes.flatMap(route => {
    const edge = route.edge
    const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target)
    if (!source || !target) return []
    const sx = source.x || 0, sy = source.y || 0, tx = target.x || 0, ty = target.y || 0
    const geometry = mindmap ? null : graphQuadraticGeometry(route, nodePoints)
    const shape = mindmap
      ? `<path d="M ${sx} ${sy} C ${(sx + tx) / 2} ${sy}, ${(sx + tx) / 2} ${ty}, ${tx} ${ty}"/>`
      : geometry ? `<path data-route-id="${escapeXml(route.routeId)}" d="${graphQuadraticPathData(geometry)}"/>` : ''
    let arrow = ''
    if (edge.directed) {
      const ratio = 0.72, inverse = 1 - ratio, middle = (sx + tx) / 2
      const point = geometry ? graphQuadraticPoint(geometry, ratio) : null
      const tangent = geometry ? graphQuadraticTangent(geometry, ratio) : null
      const ax = point?.x ?? (mindmap ? inverse ** 3 * sx + 3 * inverse ** 2 * ratio * middle + 3 * inverse * ratio ** 2 * middle + ratio ** 3 * tx : sx + (tx - sx) * ratio)
      const ay = point?.y ?? (mindmap ? inverse ** 3 * sy + 3 * inverse ** 2 * ratio * sy + 3 * inverse * ratio ** 2 * ty + ratio ** 3 * ty : sy + (ty - sy) * ratio)
      const dx = tangent?.x ?? (mindmap ? 3 * inverse ** 2 * (middle - sx) + 3 * inverse * ratio * (middle - middle) + 3 * ratio ** 2 * (tx - middle) : tx - sx)
      const dy = tangent?.y ?? (mindmap ? 3 * inverse ** 2 * (sy - sy) + 3 * inverse * ratio * (ty - sy) + 3 * ratio ** 2 * (ty - ty) : ty - sy)
      const length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length, px = -uy, py = ux
      arrow = `<polygon points="${ax + ux * 6},${ay + uy * 6} ${ax - ux * 4 + px * 4},${ay - uy * 4 + py * 4} ${ax - ux * 4 - px * 4},${ay - uy * 4 - py * 4}"/>`
    }
    const semantic = graphRelationSemantic(edge.relationType)
    const labelPoint = geometry && options.showRelationLabels ? graphQuadraticLabelPoint(geometry, route.curveOffset, 20) : null
    const label = labelPoint ? `<g class="relation-label" data-relation-type="${escapeXml(edge.relationType)}"><rect x="${labelPoint.x - 34}" y="${labelPoint.y - 10}" width="68" height="20" rx="4"/><text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" dominant-baseline="middle">${escapeXml(semantic.label)}</text></g>` : ''
    return [`<g class="edge${edge.directed ? ' directed' : ' related'} ${semantic.line}" style="--edge-color:${semantic.color}">${shape}${arrow}${label}</g>`]
  }).join('')
  const nodeMarkup = nodes.map(node => {
    const x = node.x || 0, y = node.y || 0
    const label = escapeXml(node.title.length > 28 ? `${node.title.slice(0, 28)}…` : node.title)
    const semantic = graphObjectSemantic(node.objectType)
    const semanticColor = options.dark ? semantic.color.dark : semantic.color.light
    if (mindmap) {
      const root = node.id === options.rootId, w = root ? 180 : 160, h = root ? 48 : 42
      return `<g class="node mindmap-node${root ? ' root' : ''}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${root ? 16 : 11}"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${label}</text></g>`
    }
    const radius = Math.max(7, node.size * 0.6)
    const shape = semantic.shape === 'square'
      ? `<rect x="${x - radius}" y="${y - radius}" width="${radius * 2}" height="${radius * 2}" rx="${Math.max(2, radius * 0.22)}"/>`
      : semantic.shape === 'diamond'
        ? `<polygon points="${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}"/>`
        : semantic.shape === 'hexagon'
          ? `<polygon points="${Array.from({ length: 6 }, (_, index) => { const angle = Math.PI / 3 * index - Math.PI / 2; return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}` }).join(' ')}"/>`
          : `<circle cx="${x}" cy="${y}" r="${radius}"/>`
    return `<g class="node network-node" data-object-type="${escapeXml(semantic.id)}" style="--node-color:${semanticColor}">${shape}<text class="glyph" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${escapeXml(semantic.glyph)}</text><text x="${x}" y="${y + radius + 18}" text-anchor="middle">${label}</text></g>`
  }).join('')
  const metadata = escapeXml(`${nodes.length} nodes, ${edges.length} edges`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${escapeXml(options.title)}"><title>${escapeXml(options.title)}</title><desc>${metadata}</desc><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${background}"/><style>.edge>path,.edge>line{fill:none;stroke:var(--edge-color,${edgeColor});stroke-width:1.4}.edge>polygon{fill:var(--edge-color,${edgeColor})}.edge.dashed>path,.edge.dashed>line{stroke-dasharray:6 4}.edge.dotted>path,.edge.dotted>line{stroke-dasharray:2 4}.relation-label rect{fill:${card};stroke:var(--edge-color,${edgeColor});stroke-width:1}.relation-label text{font:700 10px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:${foreground}}.node text{font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:${foreground}}.network-node circle,.network-node rect,.network-node polygon{fill:var(--node-color,${primary});stroke:rgba(255,255,255,.55);stroke-width:1.2}.network-node text.glyph{fill:${options.dark ? '#111827' : '#ffffff'};font-size:8px;font-weight:800}.mindmap-node rect{fill:${card};stroke:${edgeColor};stroke-width:1}.mindmap-node.root rect{fill:${primary};stroke:${primary}}.mindmap-node.root text{fill:#fff;font-weight:700}</style><g class="edges">${edgeMarkup}</g><g class="nodes">${nodeMarkup}</g></svg>`
}

const MAX_GRAPH_PNG_DIMENSION = 8192
const MAX_GRAPH_PNG_PIXELS = 32_000_000

export const boundedGraphRasterSize = (width: number, height: number) => {
  if (!(width > 0) || !(height > 0)) throw new Error('SVG 尺寸无效')
  const scale = Math.min(2, MAX_GRAPH_PNG_DIMENSION / width, MAX_GRAPH_PNG_DIMENSION / height, Math.sqrt(MAX_GRAPH_PNG_PIXELS / (width * height)))
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

export const createGraphPng = async (nodes: GraphNode[], edges: GraphEdge[], options: GraphSvgOptions) => {
  if (!nodes.length) throw new Error('当前筛选条件下没有可导出的节点')
  const mindmap = options.mode === 'mindmap'
  const padding = 64
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const nodePoints = new Map(nodes.map(node => [node.id, { x: node.x || 0, y: node.y || 0 }]))
  const edgeRoutes = buildGraphEdgeRoutes(edges)
  const extents = nodes.map(node => {
    const root = node.id === options.rootId
    const halfWidth = mindmap ? (root ? 90 : 80) : Math.max(18, node.size * 0.6)
    const halfHeight = mindmap ? (root ? 24 : 21) : Math.max(34, node.size * 0.6 + 22)
    return { left: (node.x || 0) - halfWidth, right: (node.x || 0) + halfWidth, top: (node.y || 0) - halfHeight, bottom: (node.y || 0) + halfHeight }
  }).concat(mindmap ? [] : edgeRoutes.flatMap(route => {
    const geometry = graphQuadraticGeometry(route, nodePoints)
    return geometry ? [{ left: geometry.control.x, right: geometry.control.x, top: geometry.control.y, bottom: geometry.control.y }] : []
  }))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const extent of extents) {
    minX = Math.min(minX, extent.left); maxX = Math.max(maxX, extent.right)
    minY = Math.min(minY, extent.top); maxY = Math.max(maxY, extent.bottom)
  }
  minX -= padding; maxX += padding; minY -= padding; maxY += padding
  const logicalWidth = Math.max(320, Math.ceil(maxX - minX))
  const logicalHeight = Math.max(240, Math.ceil(maxY - minY))
  const raster = boundedGraphRasterSize(logicalWidth, logicalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = raster.width; canvas.height = raster.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建 PNG 画布')
  const background = options.colors?.background ?? (options.dark ? '#17191d' : '#f7f9fc')
  const foreground = options.colors?.foreground ?? (options.dark ? '#f2f5f7' : '#18202b')
  const card = options.colors?.card ?? (options.dark ? '#252a30' : '#ffffff')
  const primary = options.colors?.primary ?? (options.dark ? '#42b883' : '#007aff')
  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.scale(raster.width / logicalWidth, raster.height / logicalHeight)
  context.translate(-minX, -minY)

  for (const route of edgeRoutes) {
    const edge = route.edge
    const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target)
    if (!source || !target) continue
    const sx = source.x || 0, sy = source.y || 0, tx = target.x || 0, ty = target.y || 0
    const geometry = mindmap ? null : graphQuadraticGeometry(route, nodePoints)
    const semantic = graphRelationSemantic(edge.relationType)
    context.beginPath()
    context.moveTo(sx, sy)
    if (mindmap) context.bezierCurveTo((sx + tx) / 2, sy, (sx + tx) / 2, ty, tx, ty)
    else if (geometry) context.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.target.x, geometry.target.y)
    else continue
    context.strokeStyle = semantic.color || options.colors?.edge || (options.dark ? '#56616d' : '#aab5c2')
    context.lineWidth = 1.4
    context.setLineDash(semantic.line === 'dashed' ? [6, 4] : semantic.line === 'dotted' ? [2, 4] : [])
    context.stroke()
    context.setLineDash([])
    if (edge.directed) {
      const ratio = 0.72
      const point = geometry ? graphQuadraticPoint(geometry, ratio) : { x: sx + (tx - sx) * ratio, y: sy + (ty - sy) * ratio }
      const tangent = geometry ? graphQuadraticTangent(geometry, ratio) : { x: tx - sx, y: ty - sy }
      const length = Math.hypot(tangent.x, tangent.y) || 1, ux = tangent.x / length, uy = tangent.y / length, px = -uy, py = ux
      context.beginPath()
      context.moveTo(point.x + ux * 6, point.y + uy * 6)
      context.lineTo(point.x - ux * 4 + px * 4, point.y - uy * 4 + py * 4)
      context.lineTo(point.x - ux * 4 - px * 4, point.y - uy * 4 - py * 4)
      context.closePath(); context.fillStyle = context.strokeStyle; context.fill()
    }
    if (geometry && options.showRelationLabels) {
      const labelPoint = graphQuadraticLabelPoint(geometry, route.curveOffset, 20)
      context.fillStyle = card; context.fillRect(labelPoint.x - 34, labelPoint.y - 10, 68, 20)
      context.fillStyle = foreground; context.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(semantic.label, labelPoint.x, labelPoint.y)
    }
  }

  for (const node of nodes) {
    const x = node.x || 0, y = node.y || 0
    const semantic = graphObjectSemantic(node.objectType)
    const semanticColor = options.dark ? semantic.color.dark : semantic.color.light
    const label = node.title.length > 28 ? `${node.title.slice(0, 28)}…` : node.title
    if (mindmap) {
      const root = node.id === options.rootId, width = root ? 180 : 160, height = root ? 48 : 42
      context.beginPath(); context.roundRect(x - width / 2, y - height / 2, width, height, root ? 16 : 11)
      context.fillStyle = root ? primary : card; context.fill(); context.strokeStyle = root ? primary : (options.colors?.edge || '#aab5c2'); context.stroke()
      context.fillStyle = root ? '#ffffff' : foreground; context.font = `${root ? 700 : 600} 13px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, x, y)
      continue
    }
    const radius = Math.max(7, node.size * 0.6)
    context.beginPath()
    if (semantic.shape === 'square') context.roundRect(x - radius, y - radius, radius * 2, radius * 2, Math.max(2, radius * 0.22))
    else if (semantic.shape === 'diamond') { context.moveTo(x, y - radius); context.lineTo(x + radius, y); context.lineTo(x, y + radius); context.lineTo(x - radius, y); context.closePath() }
    else if (semantic.shape === 'hexagon') for (let index = 0; index < 6; index += 1) { const angle = Math.PI / 3 * index - Math.PI / 2; const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius; index ? context.lineTo(px, py) : context.moveTo(px, py) }
    else context.arc(x, y, radius, 0, Math.PI * 2)
    context.fillStyle = semanticColor; context.fill(); context.strokeStyle = 'rgba(255,255,255,.55)'; context.lineWidth = 1.2; context.stroke()
    context.fillStyle = options.dark ? '#111827' : '#ffffff'; context.font = '800 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(semantic.glyph, x, y)
    context.fillStyle = foreground; context.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'; context.textBaseline = 'alphabetic'; context.fillText(label, x, y + radius + 18)
  }
  context.restore()
  const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!png) throw new Error('PNG 编码失败')
  return new Uint8Array(await png.arrayBuffer())
}
