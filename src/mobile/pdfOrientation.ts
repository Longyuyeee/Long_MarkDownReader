import type {PdfAnnotationRect} from '../types/pdfAnnotations'
import type {PdfXY,PdfAnchor} from './pdfGestures'
export type PdfRotation = 0|90|180|270
export function pdfRotation(n:number):PdfRotation {
  if(!Number.isFinite(n)||n%90!==0)throw new Error('页面方向无效。')
  return ((n%360+360)%360) as PdfRotation
}
/** Coordinates are normalized to the default PDF viewport, including its own /Rotate. */
export function rotatePdfPoint(p:PdfXY,rotation:number):PdfXY {
  switch(pdfRotation(rotation)){case 90:return{x:1-p.y,y:p.x};case 180:return{x:1-p.x,y:1-p.y};case 270:return{x:p.y,y:1-p.x};default:return{...p}}
}
export function rotatePdfRect(r:PdfAnnotationRect,rotation:number):PdfAnnotationRect {
  const a=rotatePdfPoint({x:r.x,y:r.y},rotation),b=rotatePdfPoint({x:r.x+r.width,y:r.y+r.height},rotation)
  return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)}
}
export function rotatePdfAnchor(anchor:PdfAnchor,rotation:number):PdfAnchor {
  return {page:rotatePdfPoint(anchor.page,rotation),viewport:{...anchor.viewport}}
}
/** PDF.js lays text out before page rotation, then rotates the complete text layer. */
export function sizePdfTextLayer(host:HTMLElement,view:{scale:number;width:number;height:number;rotation:number}) {
  host.style.width=(view.rotation%180?view.height:view.width)+'px'
  host.style.height=(view.rotation%180?view.width:view.height)+'px'
  host.style.setProperty('--total-scale-factor',String(view.scale))
}
