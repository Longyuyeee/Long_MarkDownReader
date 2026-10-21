import {readingNoteMarkdown, type PdfReadingSnapshot} from './pdfReadingNote'

export interface ManagedReadingNote {
  version: 1
  id: string
  grouping: 'page' | 'color'
  comments: boolean
  snapshot: PdfReadingSnapshot
}
export interface ReadingNoteBlock {
  from: number
  to: number
  metadata: ManagedReadingNote
  edited: boolean
}
const prefix = '<!-- longedit:pdf-reading:v1 '
const end = (id: string) => `<!-- longedit:pdf-reading:end ${id} -->`
const clean = (text: string) => text.replace(/\r\n/g, '\n').trimEnd()
const encode = (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let text = ''
  for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192))
  return btoa(text)
}
const decode = (text: string) => JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(text), c => c.charCodeAt(0))))
export function managedReadingMarkdown(snapshot: PdfReadingSnapshot, grouping: 'page'|'color', comments: boolean, id: string = crypto.randomUUID()): string {
  const metadata: ManagedReadingNote = {version: 1, id, grouping, comments, snapshot}
  const result = `${prefix}${encode(metadata)} -->\n\n${readingNoteMarkdown(snapshot, grouping, comments).trimEnd()}\n\n${end(id)}\n`
  if (result.length > 2 * 1024 * 1024) throw Error('这次笔记内容较多，请减少所选批注后分批整理')
  return result
}
function valid(value: any): value is ManagedReadingNote {
  const s = value?.snapshot
  return value?.version === 1 && /^[a-f0-9-]{36}$/.test(value.id) && ['page','color'].includes(value.grouping) && typeof value.comments === 'boolean'
    && s && typeof s.relativePath === 'string' && s.relativePath.length < 4096 && /^[a-f0-9]{64}$/i.test(s.sourceDigest)
    && Array.isArray(s.items) && s.items.length <= 200 && new Set(s.items.map((i: any) => i?.annotation?.id)).size === s.items.length
    && s.items.every((i: any) => i?.annotation && typeof i.annotation.id === 'string' && i.annotation.id.length <= 128 && Number.isInteger(i.annotation.page) && i.annotation.page > 0
      && ['yellow','green','pink','blue'].includes(i.annotation.color) && ['highlight','area','comment'].includes(i.annotation.kind)
      && typeof i.annotation.quote === 'string' && i.annotation.quote.length <= 20000 && typeof i.annotation.comment === 'string' && i.annotation.comment.length <= 20000
      && typeof i.uri === 'string' && typeof i.label === 'string')
    && Array.isArray(s.knownAnnotationIds) && s.knownAnnotationIds.length <= 10000 && s.knownAnnotationIds.every((id: unknown) => typeof id === 'string' && id.length <= 128)
}
// Only standalone markers outside fenced/indented code identify generated text.
// The original snapshot reconstructs the exact generated body; no user prose is
// inferred from headings or source links, including in legacy reading notes.
export function readingNoteBlocks(content: string): ReadingNoteBlock[] {
  if (content.length > 4 * 1024 * 1024) throw Error('这篇笔记较大，请保留原文并从 PDF 分批整理')
  const blocks: ReadingNoteBlock[] = []
  let offset = 0, fence = '', fenceLength = 0, pending: {from:number;body:number;metadata:ManagedReadingNote}|undefined
  for (const line of content.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const text = line.replace(/\r?\n$/, ''), marker = /^ {0,3}(`{3,}|~{3,})/.exec(text)
    if (marker) {
      if (!fence) {fence = marker[1][0]; fenceLength = marker[1].length}
      else if (marker[1][0] === fence && marker[1].length >= fenceLength && /^ {0,3}(?:`+|~+)\s*$/.test(text)) fence = ''
    } else if (!fence && text.startsWith(prefix)) {
      if (pending || !text.endsWith(' -->')) throw Error('阅读笔记的生成标记不完整，请保留原文并重新整理')
      let metadata: unknown
      try {metadata = decode(text.slice(prefix.length, -4))} catch {throw Error('阅读笔记的生成记录无法读取，原文已保留')}
      if (!valid(metadata) || blocks.some(b => b.metadata.id === metadata.id)) throw Error('阅读笔记的生成记录不完整或重复，原文已保留')
      pending = {from:offset, body:offset+line.length, metadata}
    } else if (!fence && text.startsWith('<!-- longedit:pdf-reading:end ')) {
      if (!pending || text !== end(pending.metadata.id)) throw Error('阅读笔记的生成范围无法确认，原文已保留')
      const body = clean(content.slice(pending.body, offset)).replace(/^\n/, '')
      blocks.push({from:pending.from, to:offset+line.length, metadata:pending.metadata, edited:body !== clean(readingNoteMarkdown(pending.metadata.snapshot, pending.metadata.grouping, pending.metadata.comments))})
      pending = undefined
    }
    offset += line.length
  }
  if (pending) throw Error('阅读笔记的生成范围不完整，原文已保留')
  return blocks
}
export function readingUpdateSnapshot(old: PdfReadingSnapshot, fresh: PdfReadingSnapshot, removeDeleted: boolean): PdfReadingSnapshot {
  const missing = new Set(fresh.missingIds || [])
  return {...fresh, items:[...fresh.items, ...(removeDeleted ? [] : old.items.filter(i => missing.has(i.annotation.id)))], missingIds:removeDeleted ? [] : [...missing]}
}
export function readingUpdateChanges(old: PdfReadingSnapshot, fresh: PdfReadingSnapshot) {
  const previous = new Map(old.items.map(i => [i.annotation.id, i]))
  const same = (i: PdfReadingSnapshot['items'][number]) => JSON.stringify([i.annotation.page,i.annotation.kind,i.annotation.color,i.annotation.quote,i.annotation.comment,i.uri])
  return {added:fresh.items.filter(i => !previous.has(i.annotation.id)).length, changed:fresh.items.filter(i => previous.has(i.annotation.id) && same(previous.get(i.annotation.id)!) !== same(i)).length, deleted:(fresh.missingIds || []).length}
}
export function replaceReadingNote(content: string, block: ReadingNoteBlock, snapshot: PdfReadingSnapshot, append = false): string {
  const live = readingNoteBlocks(content).find(b => b.metadata.id === block.metadata.id)
  if (!live || content.slice(live.from,live.to) !== content.slice(block.from,block.to) || (!append && live.edited)) throw Error('生成内容已有补写，未替换；可保留原文并追加新版')
  const next = managedReadingMarkdown(snapshot, block.metadata.grouping, block.metadata.comments, append ? crypto.randomUUID() : block.metadata.id)
  return append ? content + (content.endsWith('\n') ? '\n' : '\n\n') + next : content.slice(0,live.from) + next + content.slice(live.to)
}
