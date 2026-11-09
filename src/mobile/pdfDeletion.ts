import type { PdfAnnotation, PdfAnnotationDocument } from '../types/pdfAnnotations'
import { validateAnnotations } from './pdfAnnotations.ts'

export interface DeletedPdfAnnotation { annotation: PdfAnnotation; sourceSignature: string }
/** Keep the previous undo until a pending native deletion is reconciled. */
export interface PdfDeletionJournal { undo?: DeletedPdfAnnotation; pending?: DeletedPdfAnnotation }
export const storageKey = 'longedit-mobile-pdf-deletions-v1'
function records(): Record<string,PdfDeletionJournal> {
  const value = JSON.parse(localStorage.getItem(storageKey) || '{}')
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('删除恢复记录无法读取，原记录仍保留。')
  return value
}
export function validateDeletionJournal(value: unknown): asserts value is PdfDeletionJournal {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('删除恢复记录格式无效。')
  const journal=value as PdfDeletionJournal
  if (!journal.undo && !journal.pending) throw new Error('删除恢复记录为空。')
  for (const item of [journal.undo,journal.pending]) if (item) {
    if (!/^[a-f0-9]{64}$/.test(item.sourceSignature)) throw new Error('删除恢复记录来源无效。')
    validateAnnotations({schemaVersion:1,source:{pdfFile:'undo.pdf',size:0,modifiedAt:0},annotations:[item.annotation]})
  }
}
export function readDeletionJournal(key: string) {
  const value=records()[key]
  if (value !== undefined) validateDeletionJournal(value)
  return value || null
}
export function saveDeletionJournal(key: string, value: PdfDeletionJournal | null) {
  if (value) validateDeletionJournal(value)
  const all=records()
  if (value) all[key]=value; else delete all[key]
  localStorage.setItem(storageKey,JSON.stringify(all))
}
export function reconcileDeletion(journal: PdfDeletionJournal | null, document: PdfAnnotationDocument, signature: string): PdfDeletionJournal | null {
  if (!journal) return null
  validateDeletionJournal(journal)
  if (journal.pending) {
    const pending=journal.pending, previous=journal.undo
    if (pending.sourceSignature !== signature) return journal
    // Pending writes may have committed before the app stopped. If the ID is
    // still present, retain the previous undo instead of treating it as deleted.
    journal=document.annotations.some(a=>a.id===pending.annotation.id) ? (previous ? {undo:previous} : null) : {undo:pending}
  }
  if (journal?.undo && journal.undo.sourceSignature === signature && document.annotations.some(a=>a.id===journal!.undo!.annotation.id)) return null
  return journal
}
/** Restore just this annotation into a freshly read document, never old peers. */
export function restoreDeletedAnnotation(document: PdfAnnotationDocument, item: DeletedPdfAnnotation, signature: string, pages: number) {
  if (signature !== item.sourceSignature) throw new Error('原 PDF 已变化，恢复摘录仍保留，暂不恢复到这份文件。')
  if (item.annotation.page > pages) throw new Error('原页码超出当前 PDF，恢复摘录仍保留。')
  if (document.annotations.some(a=>a.id===item.annotation.id)) throw new Error('这条批注已在文件中，无需重复恢复。')
  const candidate={...document,annotations:[...document.annotations,JSON.parse(JSON.stringify(item.annotation))]}
  validateAnnotations(candidate)
  return candidate
}
