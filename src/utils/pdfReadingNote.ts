import type { PdfAnnotation } from '../types/pdfAnnotations'
import type { TabInfo } from '../store/app'
export interface PdfReadingItem { annotation: PdfAnnotation; uri: string; label: string }
export interface PdfReadingSnapshot { sourceDigest: string; sourceSignature: string; relativePath: string; items: PdfReadingItem[]; knownAnnotationIds?: string[]; missingIds?: string[] }
export const MAX_READING_SELECTION = 200
export const readingTargetDirectory = (root: string, path: string) => {
  const clean = (value: string) => value.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').replace(/\/+$/, '')
  const base = clean(root), parent = clean(path).replace(/\/[^/]+$/, '')
  if (base.toLowerCase() === parent.toLowerCase()) return '库根目录'
  return parent.toLowerCase().startsWith(base.toLowerCase()+'/') ? parent.slice(base.length+1) : parent
}
const escapeText = (value: string) => value.replace(/([\\`*_[\]<>#!|])/g, '\\$1')
export const readingItemMarkdown = (item: PdfReadingItem, comments = true) => {
  const {annotation: a} = item
  const quote = a.quote.trim() ? `> ${escapeText(a.quote).replace(/\r?\n/g, '\n> ')}\n\n` : ''
  const comment = comments && a.comment.trim() ? `评论：${escapeText(a.comment).replace(/\r?\n/g, '\n\n')}\n\n` : ''
  return `${quote}${comment}[来源：${escapeText(item.label)}](${item.uri})`
}
const colors: Record<string,string> = {yellow:'黄色',green:'绿色',pink:'粉色',blue:'蓝色'}
export const readingNoteMarkdown = (snapshot: PdfReadingSnapshot, grouping: 'page'|'color', comments: boolean) => {
  const items = [...snapshot.items].sort((a,b)=> (grouping === 'color' ? a.annotation.color.localeCompare(b.annotation.color) : 0) || a.annotation.page-b.annotation.page || a.annotation.createdAt-b.annotation.createdAt || a.annotation.id.localeCompare(b.annotation.id))
  let group = ''
  const parts = [`# ${escapeText(snapshot.relativePath.split('/').pop()?.replace(/\.pdf$/i,'') || 'PDF')} · 阅读笔记`]
  for (const item of items) {
    const next = grouping === 'page' ? `第 ${item.annotation.page} 页` : colors[item.annotation.color]
    if(next !== group) { parts.push(`## ${next}`); group=next }
    parts.push((snapshot.missingIds?.includes(item.annotation.id) ? '> 原批注已删除，保留原摘录。\n\n' : '') + readingItemMarkdown(item,comments))
  }
  return parts.join('\n\n')+'\n'
}
export const annotationPageFilter = (value: string, count: number): Set<number>|null => {
  if(!value.trim())return null
  if(value.length>512)throw Error('页码范围过长')
  const pages=new Set<number>()
  for(const part of value.replace(/，/g,',').split(',')){
    const match=/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
    if(!match)throw Error('页码格式如 1-5,8')
    const a=Number(match[1]),b=Number(match[2]||match[1])
    if(a<1||b<a||b>count)throw Error(`页码应在 1–${count} 之间，范围从小到大`)
    for(let n=a;n<=b;n++)pages.add(n)
  }
  return pages
}
export const appendReadingDraft = (tab: TabInfo, markdown: string) => {
  if(tab.external || tab.textReadOnlyReason || tab.textLoadError || tab.content === undefined || !tab.path.toLowerCase().endsWith('.md') || !tab.textSignature)throw Error('目标尚未完整加载或为只读，请先在主编辑区打开目标笔记')
  const separator = tab.content ? (tab.content.endsWith('\n')?'\n':'\n\n') : ''
  tab.content += separator + markdown.trimEnd()+'\n'
  tab.isDirty=true
}
