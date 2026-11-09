import { marked } from 'marked'
import { relativeImagePath } from './readingState.ts'
import type { Identity, Storage } from './storage.ts'

export interface ImageReference { from: number; to: number; raw: string; href: string; alt: string; label: string; title: string | null }
interface SourceToken { type: string; raw: string; href?: string; text?: string; title?: string | null; tokens?: SourceToken[]; items?: SourceToken[]; header?: { tokens: SourceToken[] }[]; rows?: { tokens: SourceToken[] }[][] }
const escapeLabel = (value: string) => value.replace(/[\r\n\x00-\x1f]+/g, ' ').replace(/[\\[\]]/g, '\\$&')
export const imageMarkdown = (alt: string, source: string) => `![${escapeLabel(alt.trim() || '图片')}](<${source}>)`
export function imageInsertionText(content: string, from: number, to: number, alt: string, source: string) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > content.length) throw new Error('插入位置已失效')
  const before = content.slice(0, from), after = content.slice(to), newline = content.includes('\r\n') ? '\r\n' : '\n'
  const prefix = !before || before.endsWith(newline + newline) ? '' : before.endsWith(newline) ? newline : newline + newline
  const suffix = !after ? newline : after.startsWith(newline + newline) ? '' : after.startsWith(newline) ? newline : newline + newline
  return prefix + imageMarkdown(alt, source) + suffix
}
export function relativeImageSource(notePath: string, imagePath: string) {
  const note = notePath.split('/').slice(0, -1), image = imagePath.split('/')
  if (image.some(part => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) throw new Error('图片位置无效')
  while (note.length && image.length && note[0] === image[0]) { note.shift(); image.shift() }
  const source = [...note.map(() => '..'), ...image.map(part => encodeURIComponent(part))].join('/')
  if (relativeImagePath(notePath, source) !== imagePath) throw new Error('图片超出当前资料库或格式不支持')
  return source
}
function labelEnd(raw: string) {
  let depth = 1
  for (let i = 2; i < raw.length; i++) {
    if (raw[i] === '\\') { i++; continue }
    if (raw[i] === '[') depth++
    if (raw[i] === ']') { depth--; if (depth === 0) return i + 1 }
  }
  return 0
}
export function scanImageReferences(content: string) {
  const removed: number[] = []
  const normalized = content.replace(/\r\n?/g, (value, offset: number) => { if (value.length === 2) removed.push(offset - removed.length); return '\n' })
  const originalOffset = (offset: number) => { let low = 0, high = removed.length; while (low < high) { const mid = (low + high) >>> 1; if (removed[mid]! < offset) low = mid + 1; else high = mid } return offset + low }
  const tokens = marked.lexer(normalized) as unknown as SourceToken[], references: ImageReference[] = []
  let total = 0, htmlImages = false
  const count = (items: SourceToken[]) => { for (const token of items) {
    if (token.type === 'image') { total++; continue }
    if (token.type === 'html' && /<img\b/i.test(token.raw)) htmlImages = true
    if (token.items || token.tokens) count(token.items || token.tokens || [])
    if (token.header) count(token.header.flatMap(cell => cell.tokens))
    if (token.rows) count(token.rows.flatMap(row => row.flatMap(cell => cell.tokens)))
  } }
  count(tokens)
  const visit = (items: SourceToken[], source: string, base: number) => {
    let cursor = 0
    for (const token of items) {
      if (!token.raw) continue
      const at = source.indexOf(token.raw, cursor)
      // If transformed block syntax cannot be mapped exactly, stop this scope.
      // Never guess a later duplicate or search inside a code block.
      if (at < 0) break
      cursor = at + token.raw.length
      if (token.type === 'image') {
        const from = originalOffset(base + at), to = originalOffset(base + cursor), raw = content.slice(from, to), end = labelEnd(raw)
        if (end && raw.startsWith('![')) references.push({ from, to, raw, href: token.href || '', alt: token.text || '', label: raw.slice(0, end), title: token.title || null })
      } else if (token.items || token.tokens) visit(token.items || token.tokens || [], token.raw, base + at)
    }
  }
  visit(tokens, normalized, 0)
  return { references, unlocated: Math.max(0, total - references.length), htmlImages }
}
export function replaceImageReference(content: string, reference: ImageReference, source: string) {
  if (content.slice(reference.from, reference.to) !== reference.raw) throw new Error('正文已变化，请重新选择要替换的图片')
  const title = reference.title ? ` "${reference.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')}"` : ''
  return content.slice(0, reference.from) + `${reference.label}(<${source}>${title})` + content.slice(reference.to)
}

/** Prepare a portable copy before writing the note; a failed attachment never
 * turns into a successful but broken default copy. The user may choose text-only.
 */
export async function prepareImageCopy(storage: Pick<Storage, 'readImage' | 'copyImage'>, source: Identity, target: Identity, content: string) {
  if (!/\.md$/i.test(source.relativePath)) return content
  const scan = scanImageReferences(content)
  if (scan.unlocated || scan.htmlImages) throw new Error('有无法自动搬迁的图片语法。可以核对源文后重试，或明确选择仅存文字副本。')
  const paths = [...new Set(scan.references.map(ref => relativeImagePath(source.relativePath, ref.href)).filter((path): path is string => !!path))]
  if (paths.length > 24) throw new Error('一次副本最多携带 24 张不同图片，请分批整理，或仅存文字副本。')
  let bytes = 0, pixels = 0
  for (const path of paths) {
    const image = await storage.readImage({ rootId: source.rootId, relativePath: path }); bytes += image.bytes; pixels += image.width * image.height
    if (bytes > 8 * 1024 * 1024 || pixels > 12000000) throw new Error('副本图片超过本次 8 MiB / 1,200 万像素预算，可以仅存文字副本。')
  }
  const migrated = new Map<string, string>()
  for (const path of paths) {
    const imported = await storage.copyImage({ rootId: source.rootId, relativePath: path }, target)
    if (imported.status !== 'ready' || imported.rootId !== target.rootId || imported.notePath !== target.relativePath || !imported.imagePath) throw new Error('图片副本未确认，原文与草稿仍保留。可在图片导入记录中重试。')
    migrated.set(path, relativeImageSource(target.relativePath, imported.imagePath))
  }
  for (const reference of [...scan.references].reverse()) {
    const path = relativeImagePath(source.relativePath, reference.href), replacement = path && migrated.get(path)
    if (replacement) content = replaceImageReference(content, reference, replacement)
  }
  return content
}
