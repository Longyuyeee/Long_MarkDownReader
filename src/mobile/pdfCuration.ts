import type { PdfAnnotation, PdfAnnotationDocument } from '../types/pdfAnnotations'
import { validateAnnotations, mobileReadingNote } from './pdfAnnotations.ts'
import { READING_BUDGET } from './documentBudget.ts'

export const readingSelectionLimit = 200
export interface PdfAnnotationFilter {
  query: string
  color: PdfAnnotation['color'] | 'all'
  currentPage: number | null
}
export const orderedAnnotations = (annotations: PdfAnnotation[]) => [...annotations].sort((a,b) => a.page-b.page || a.createdAt-b.createdAt || a.id.localeCompare(b.id))
const searchable = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
export function filterAnnotations(annotations: PdfAnnotation[], filter: PdfAnnotationFilter) {
  const words = searchable(filter.query.trim()).split(/\s+/).filter(Boolean)
  return orderedAnnotations(annotations.filter(a => {
    if (filter.color !== 'all' && a.color !== filter.color || filter.currentPage !== null && a.page !== filter.currentPage) return false
    const text = words.length ? searchable(a.quote+'\n'+a.comment) : ''
    return words.every(word => text.includes(word))
  }))
}
/** A bulk choice is atomic: never silently truncate to the first 200 items. */
export function addReadingSelection(current: string[], ids: string[]) {
  const next = [...new Set([...current,...ids])]
  if (next.length > readingSelectionLimit) throw new Error('每份阅读笔记最多选择 200 条，请缩小筛选范围或取消部分选择。')
  return next
}
/** Resolve against a concrete revision; missing IDs require an explicit new choice. */
export function selectedReadingDocument(document: PdfAnnotationDocument, ids: string[]): PdfAnnotationDocument {
  validateAnnotations(document)
  if (!ids.length || ids.length > readingSelectionLimit || new Set(ids).size !== ids.length) throw new Error('请选择 1 到 200 条批注后预览。')
  const selected = new Set(ids)
  const annotations = orderedAnnotations(document.annotations.filter(a => selected.has(a.id)))
  if (annotations.length !== ids.length) throw new Error('部分已选批注已删除，请重新核对选择。')
  return {...document,annotations}
}

export function curatedReadingNote(path: string, document: PdfAnnotationDocument, ids: string[], reference: {rootId:string;sourceSignature:string}) {
  const selected = selectedReadingDocument(document,ids)
  const content = mobileReadingNote(path,selected,reference)
  if (new TextEncoder().encode(content).length > READING_BUDGET.bytes) throw new Error('这份笔记超过 128 KiB，请减少摘录后分批生成。已选内容仍保留。')
  return {document:selected,content}
}
