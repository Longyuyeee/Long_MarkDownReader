import type { PdfAnnotation, PdfAnnotationDocument, PdfAnnotationRect, PdfAnnotationSource } from '../types/pdfAnnotations'
import { mobilePdfReferenceUri } from './pdfReference.ts'

export interface PdfAnnotationState { content: string | null; revision: string; sourceSignature: string }
export interface PdfAnnotationDraft { annotation: PdfAnnotation; revision: string; sourceSignature: string }
export const annotationLimit = 5 * 1024 * 1024
const chars = (v: unknown, max: number) => typeof v === 'string' && Array.from(v).length <= max
const uint = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (): never => { throw new Error('批注文件格式无效，原记录仍保留。') }
export function validateAnnotations(value: unknown): asserts value is PdfAnnotationDocument {
  if (!object(value)) fail()
  const d = value as PdfAnnotationDocument
  if (d.schemaVersion !== 1 || !object(d.source) || !chars(d.source.pdfFile,255) || !d.source.pdfFile.trim() || !uint(d.source.size) || !uint(d.source.modifiedAt) || (d.source.fingerprint !== undefined && !chars(d.source.fingerprint,512)) || !Array.isArray(d.annotations) || d.annotations.length > 5000) fail()
  const ids = new Set<string>()
  for (const a of d.annotations) {
    if (!object(a) || !chars(a.id,128) || !a.id.trim() || ids.has(a.id) || !['highlight','area','comment'].includes(a.kind) || !uint(a.page) || a.page < 1 || a.page > 100000 || !['yellow','green','pink','blue'].includes(a.color) || !Array.isArray(a.rects) || a.rects.length > 200 || !chars(a.quote,20000) || !chars(a.comment,20000) || !uint(a.createdAt) || !uint(a.updatedAt) || a.updatedAt < a.createdAt) fail()
    if ((a.kind === 'highlight' || a.kind === 'area') && !a.rects.length || a.kind === 'highlight' && !a.quote.trim()) fail()
    ids.add(a.id)
    for (const r of a.rects) if (!object(r) || ![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x+r.width > 1.000001 || r.y+r.height > 1.000001) fail()
  }
}
export function parseAnnotations(content: string | null, source: PdfAnnotationSource) {
  if (content === null) return { schemaVersion: 1 as const, source, annotations: [] }
  if (new TextEncoder().encode(content).length > annotationLimit) throw new Error('批注文件超过 5 MiB，原记录仍保留。')
  const value = JSON.parse(content)
  // Desktop v1 permits absent arrays/text. Preserve every other existing field.
  if (object(value)) { value.annotations ??= []; if (object(value.source) && value.source.fingerprint === null) delete value.source.fingerprint }
  if (object(value) && Array.isArray(value.annotations)) for (const a of value.annotations) if (object(a)) { a.rects ??= []; a.quote ??= ''; a.comment ??= '' }
  validateAnnotations(value)
  if (value.source.pdfFile !== source.pdfFile) throw new Error('批注对应的 PDF 名称不匹配，原记录仍保留。')
  return value
}
export function serializeAnnotations(document: PdfAnnotationDocument) {
  validateAnnotations(document)
  const content = JSON.stringify(document,null,2)+'\n'
  if (new TextEncoder().encode(content).length > annotationLimit) throw new Error('批注文件超过 5 MiB，本次输入仍保留。')
  return content
}
/** Same top-left, displayed-page normalized rectangles as desktop PdfPage. */
export function normalizedPdfRects(rects: ArrayLike<{ left: number; top: number; right: number; bottom: number }>, page: { left: number; top: number; width: number; height: number }): PdfAnnotationRect[] {
  if (![page.left,page.top,page.width,page.height].every(Number.isFinite) || page.width <= 0 || page.height <= 0) throw new Error('页面尚未就绪，请重新选文。')
  const result: PdfAnnotationRect[] = []
  for (const r of Array.from(rects)) {
    if (![r.left,r.top,r.right,r.bottom].every(Number.isFinite)) continue
    const x = Math.max(0,(r.left-page.left)/page.width), y = Math.max(0,(r.top-page.top)/page.height), right = Math.min(1,(r.right-page.left)/page.width), bottom = Math.min(1,(r.bottom-page.top)/page.height)
    if (right > x && bottom > y && !result.some(p => Math.abs(p.x-x)<.0001 && Math.abs(p.y-y)<.0001 && Math.abs(p.width-(right-x))<.0001 && Math.abs(p.height-(bottom-y))<.0001)) result.push({x,y,width:right-x,height:bottom-y})
    if (result.length > 200) throw new Error('这次选文较多，请分段标记。')
  }
  return result
}
export const draftKey = 'longedit-mobile-pdf-annotation-drafts-v1'
function drafts(): Record<string,PdfAnnotationDraft> { const v = JSON.parse(localStorage.getItem(draftKey)||'{}'); if (!object(v)) throw new Error('批注草稿无法读取，原记录仍保留。'); return v }
export function validateAnnotationDraft(value:unknown):asserts value is PdfAnnotationDraft {if(!object(value))fail();const draft=value as PdfAnnotationDraft;validateAnnotations({schemaVersion:1,source:{pdfFile:'draft.pdf',size:0,modifiedAt:0},annotations:[draft.annotation]});if(!/^(missing|[a-f0-9]{64})$/.test(draft.revision)||!/^[a-f0-9]{64}$/.test(draft.sourceSignature))fail()}
export function readAnnotationDraft(key: string) { const value = drafts()[key]; if (value!==undefined&&value!==null)validateAnnotationDraft(value);return value??null }
export function saveAnnotationDraft(key: string, draft: PdfAnnotationDraft | null) { const all = drafts(); if (draft) all[key]=draft; else delete all[key]; localStorage.setItem(draftKey,JSON.stringify(all)) }
const escape = (v: string) => v.replace(/([\\`*_[\]<>#!|])/g,'\\$1')
export const pdfReadingTitle = (path:string) => path.split('/').pop()!.replace(/\.pdf$/i,'').replace(/-导入-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,'') || 'PDF'
export function mobileReadingNote(path: string, document: PdfAnnotationDocument, reference?: {rootId:string;sourceSignature:string}) {
  validateAnnotations(document)
  if (!document.annotations.length || document.annotations.length > 200) throw new Error('每份阅读笔记可汇总 1 到 200 条批注。')
  let page = 0
  const parts = [`# ${escape(reference ? pdfReadingTitle(path) : path.split('/').pop()!.replace(/\.pdf$/i,''))} · 阅读笔记`, `来源：${escape(reference ? pdfReadingTitle(path)+'.pdf' : path)}\n\n此笔记为生成时的摘录副本，后续批注修改不会自动更新。`]
  for (const a of [...document.annotations].sort((a,b)=>a.page-b.page || a.createdAt-b.createdAt || a.id.localeCompare(b.id))) {
    if (page !== a.page) { page=a.page; parts.push(`## 第 ${page} 页`) }
    const quote = a.quote.trim() ? `> ${escape(a.quote).replace(/\r?\n/g,'\n> ')}\n\n` : ''
    const label=`原文第 ${a.page} 页`, uri=reference ? mobilePdfReferenceUri({...reference,relativePath:path,page:a.page,annotationId:a.id}) : null
    parts.push(`${quote}${a.comment.trim() ? `评论：${escape(a.comment).replace(/\r?\n/g,'\n\n')}\n\n` : ''}${uri ? `[${label}](${uri})` : `来源：第 ${a.page} 页 · 批注 ${escape(a.id)}`}`)
  }
  return parts.join('\n\n')+'\n'
}
