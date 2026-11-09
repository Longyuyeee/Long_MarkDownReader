/** Geometry is in CSS pixels; document anchors are independent of the backing canvas. */
export interface PdfXY { x: number; y: number }
export interface PdfBox extends PdfXY { width: number; height: number }
export interface PdfAnchor { page: PdfXY; viewport: PdfXY }
/** Deliberate, short horizontal swipe; vertical scroll and long-press stay intact. */
export function pdfPageSwipe(dx:number,dy:number,milliseconds:number):-1|0|1{
  if(![dx,dy,milliseconds].every(Number.isFinite)||milliseconds<40||milliseconds>500||Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.5)return 0
  return dx<0?1:-1
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
export const pdfZoom = (n: number) => Number.isFinite(n) ? Math.round(clamp(n, 1, 3) * 1000) / 1000 : 1
export function pdfTouchPair(a: PdfXY, b: PdfXY) {
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) }
}
export function pdfAnchorAt(point: PdfXY, paper: PdfBox, viewport: PdfXY): PdfAnchor {
  if (![point.x, point.y, paper.x, paper.y, paper.width, paper.height, viewport.x, viewport.y].every(Number.isFinite) || paper.width <= 0 || paper.height <= 0) throw new Error('页面位置暂不可用。')
  return { page: { x: clamp((point.x - paper.x) / paper.width, 0, 1), y: clamp((point.y - paper.y) / paper.height, 0, 1) }, viewport: { x: point.x - viewport.x, y: point.y - viewport.y } }
}
export function pdfAnchorScroll(anchor: PdfAnchor, paper: PdfBox, current: PdfXY, viewport: PdfBox, extent: PdfXY): PdfXY {
  return { x: clamp(current.x + paper.x + anchor.page.x * paper.width - viewport.x - anchor.viewport.x, 0, Math.max(0, extent.x - viewport.width)), y: clamp(current.y + paper.y + anchor.page.y * paper.height - viewport.y - anchor.viewport.y, 0, Math.max(0, extent.y - viewport.height)) }
}
export function pdfPinchPreview(anchor: PdfAnchor, paper: PdfBox, point: PdfXY, viewport: PdfXY, scale: number) {
  return { x: viewport.x + point.x - paper.x - anchor.page.x * paper.width * scale, y: viewport.y + point.y - paper.y - anchor.page.y * paper.height * scale }
}
