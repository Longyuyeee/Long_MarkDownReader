export interface GraphLabelBox { left: number; right: number; top: number; bottom: number }
export interface GraphLabelCandidate { id: string; text: string; x: number; y: number; radius: number; priority: number; weight: number }
export interface GraphPlacedLabel extends GraphLabelBox { id: string; text: string; x: number; y: number; emphasized: boolean }
export const graphLabelOverlap = (a: GraphLabelBox, b: GraphLabelBox) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

export const fitGraphLabelText = (text: string, maximumWidth: number, measure: (text: string) => number) => {
  if (measure(text) <= maximumWidth) return text
  const characters = Array.from(text)
  let low = 0, high = characters.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(characters.slice(0, middle).join('') + '…') <= maximumWidth) low = middle
    else high = middle - 1
  }
  return low ? characters.slice(0, low).join('') + '…' : '…'
}

// Labels are screen-space geometry, independent of zoom. Active/hovered names get first choice.
// Four anchors and a fixed budget bound collision work; no graph nodes or relationships are removed.
export const placeGraphLabels = (candidates: GraphLabelCandidate[], viewport: { width: number; height: number }, measure: (text: string, emphasized: boolean) => number, limit = 64): GraphPlacedLabel[] => {
  const placed: GraphPlacedLabel[] = []
  const ordered = [...candidates].sort((a, b) => a.priority - b.priority || b.weight - a.weight || a.id.localeCompare(b.id))
  for (const node of ordered) {
    if (placed.length >= limit) break
    const emphasized = node.priority < 2
    const text = fitGraphLabelText(node.text, Math.min(emphasized ? 260 : 176, Math.max(40, viewport.width - 24)), value => measure(value, emphasized))
    const width = measure(text, emphasized) + 12, height = emphasized ? 23 : 22
    const anchors = [
      { x: node.x - width / 2, y: node.y + node.radius + 6 },
      { x: node.x - width / 2, y: node.y - node.radius - height - 6 },
      { x: node.x + node.radius + 8, y: node.y - height / 2 },
      { x: node.x - node.radius - width - 8, y: node.y - height / 2 },
    ]
    for (const anchor of anchors) {
      const box = { left: anchor.x, right: anchor.x + width, top: anchor.y, bottom: anchor.y + height }
      if (box.left < 4 || box.top < 4 || box.right > viewport.width - 4 || box.bottom > viewport.height - 4 || placed.some(existing => graphLabelOverlap(box, existing))) continue
      placed.push({ ...box, id: node.id, text, x: anchor.x + 6, y: anchor.y + 4, emphasized })
      break
    }
  }
  return placed
}
