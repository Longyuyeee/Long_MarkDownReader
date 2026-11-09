import { pdfCanvasSize } from './pdfDocument.ts'
export const continuousPageLimit = 8
export const continuousPagePixels = 1_500_000
export const continuousMetricsLimit = 128
export function continuousRenderQueue() {
  const pending: {work:()=>Promise<void>;priority:number;resolve:()=>void;reject:(e:unknown)=>void}[]=[]
  let running=false
  async function drain(){if(running)return;running=true;while(pending.length){pending.sort((a,b)=>a.priority-b.priority);const job=pending.shift()!;try{await job.work();job.resolve()}catch(e){job.reject(e)}}running=false}
  return (work:()=>Promise<void>,priority:number)=>new Promise<void>((resolve,reject)=>{pending.push({work,priority,resolve,reject});queueMicrotask(()=>void drain())})
}
export function continuousCanvasSize(width: number, height: number, available: number, zoom: number, ratio: number) {
  const size = pdfCanvasSize(width, height, available, zoom, ratio)
  size.dpr = Math.min(size.dpr, Math.sqrt(continuousPagePixels / (width * size.scale * height * size.scale)))
  size.width = Math.max(1, Math.floor(width * size.scale * size.dpr)); size.height = Math.max(1, Math.floor(height * size.scale * size.dpr))
  return size
}
export interface ContinuousBox { page: number; top: number; bottom: number; height: number }
/** Current page follows visible paper area, with the first page winning ties. */
export function continuousCurrent(boxes: ContinuousBox[], top: number, height: number) {
  return boxes.reduce((best, box) => {
    const visible = Math.max(0, Math.min(box.bottom, top + height) - Math.max(box.top, top))
    return visible > best.area ? { page: box.page, area: visible } : best
  }, { page: boxes[0]?.page || 1, area: -1 }).page
}
export function continuousOffset(paperTop: number, paperHeight: number, viewportTop: number) {
  const offset = Math.max(0, Math.min(1, (viewportTop - paperTop) / paperHeight))
  return { offset, inset: Math.max(-4096, Math.min(4096, viewportTop - paperTop - offset * paperHeight)) }
}
/** Choose a nearby paper at the reading edge, including its fixed-size gutter. */
export function continuousEdge(boxes: ContinuousBox[], line: number) {
  return boxes.find(b => line >= b.top && line <= b.bottom) || boxes.reduce((best, b) => Math.min(Math.abs(b.top-line), Math.abs(b.bottom-line)) < Math.min(Math.abs(best.top-line), Math.abs(best.bottom-line)) ? b : best, boxes[0])
}
