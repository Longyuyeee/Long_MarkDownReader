import { marked } from 'marked'
import type { Storage } from './storage.ts'
import type { TextExportSnapshot } from './textExport.ts'
import { textExportName } from './textExport.ts'
import { storedZip } from './storedZip.ts'

export interface PackAsset { sourcePath: string; archivePath: string; base64: string; bytes: number; digest: string }
export interface PreparedPack { packId: string; rootId: string; relativePath: string; content: string; assets: PackAsset[] }
export interface PackSummary { id: string; name: string; created: number; bytes: number; count: number; readable: boolean }
export interface PackInfo extends PackSummary { assets: { sourcePath: string; archivePath: string; bytes: number }[] }
export const packName = (path: string) => textExportName(path).replace(/-导出副本\.(md|txt)$/, '-附件包.textpack')
export const bytesBase64 = (bytes: Uint8Array) => { let value = ''; for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(value) }
export const base64Bytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0))
export const hashBytes = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')

/** Decode once, then resolve inside the granted library. Queries/fragments are
 * kept on the rewritten link, never treated as part of the source file name. */
export function packAssetPath(note: string, href: string): { path: string; suffix: string } | null {
  if (/^(https?:|mailto:|tel:)/i.test(href) || href.startsWith('#')) return null
  const at = href.search(/[?#]/), raw = at < 0 ? href : href.slice(0, at), suffix = at < 0 ? '' : href.slice(at)
  let decoded: string
  try { decoded = decodeURIComponent(raw) } catch { throw new Error(`附件地址编码无效：${href}`) }
  if (!decoded || /^(?:[a-z][\w+.-]*:|\/)/i.test(decoded) || /[\\\x00-\x1f\x7f]/.test(decoded)) throw new Error(`附件地址无法打包：${href}`)
  const parts = note.split('/').slice(0, -1)
  for (const part of decoded.split('/')) {
    if (part === '.') continue
    if (part === '..') { if (!parts.length) throw new Error(`附件超出当前资料库：${href}`); parts.pop() }
    else if (!part) throw new Error(`附件地址无效：${href}`)
    else parts.push(part)
  }
  if (!parts.length) throw new Error(`附件地址无效：${href}`)
  return { path: parts.join('/'), suffix }
}
interface Token { type: string; raw: string; href?: string; title?: string | null; tokens?: Token[]; items?: Token[]; header?: { tokens: Token[] }[]; rows?: { tokens: Token[] }[][] }
interface Ref { from: number; to: number; label: string; title: string | null; path: string; suffix: string; image: boolean }
export function scanPackReferences(content: string, note: string): Ref[] {
  const removed: number[] = [], normalized = content.replace(/\r\n?/g, (value, offset: number) => { if (value.length === 2) removed.push(offset - removed.length); return '\n' })
  const originalOffset = (offset: number) => { let low = 0, high = removed.length; while (low < high) { const mid = (low + high) >>> 1; if (removed[mid]! < offset) low = mid + 1; else high = mid } return offset + low }
  const tokens = marked.lexer(normalized) as unknown as Token[], references: Ref[] = []
  let total = 0
  const target = (token: Token) => {
    if (token.type !== 'image' && token.type !== 'link') return null
    const path = packAssetPath(note, token.href || '')
    if (!path && token.type === 'image') throw new Error('含有网络图片或页内图片地址，请先将图片存入资料库再打包。')
    return path
  }
  const count = (items: Token[]) => { for (const token of items) {
    if (target(token)) total++
    if (token.type === 'html' && /<(?:img|a|source|video|audio|object|embed)\b/i.test(token.raw)) throw new Error('含有 HTML 图片或附件语法，请改用普通 Markdown 引用后打包。')
    count(token.items || token.tokens || [])
    if (token.header) count(token.header.flatMap(cell => cell.tokens))
    if (token.rows) count(token.rows.flatMap(row => row.flatMap(cell => cell.tokens)))
  } }; count(tokens)
  const visit = (items: Token[], source: string, base: number) => { let cursor = 0; for (const token of items) {
    if (!token.raw) continue
    const at = source.indexOf(token.raw, cursor); if (at < 0) break
    cursor = at + token.raw.length
    const path = target(token)
    if (path) {
      const from = originalOffset(base + at), to = originalOffset(base + cursor), raw = content.slice(from, to), start = token.type === 'image' ? 2 : 1
      let end = 0, depth = 1
      if (raw.startsWith(token.type === 'image' ? '![' : '[')) for (let i = start; i < raw.length; i++) { if (raw[i] === '\\') { i++; continue }; if (raw[i] === '[') depth++; if (raw[i] === ']' && --depth === 0) { end = i + 1; break } }
      if (end) references.push({ from, to, label: raw.slice(0, end), title: token.title || null, ...path, image: token.type === 'image' })
    } else if (token.items || token.tokens) visit(token.items || token.tokens || [], token.raw, base + at)
  } }; visit(tokens, normalized, 0)
  if (total !== references.length) throw new Error('有无法准确定位的附件语法（例如嵌套链接或复杂表格），请整理为普通 Markdown 引用后打包。')
  return references
}
function assetName(path: string, index: number) {
  const name = path.split('/').pop() || '附件', extension = /\.[a-z0-9]{1,12}$/i.exec(name)?.[0] || ''
  const base = name.slice(0, name.length - extension.length).replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').trim()
  return `assets/${String(index + 1).padStart(3, '0')}-${Array.from(base).slice(0, 40).join('') || '附件'}${extension}`
}
export async function preparePack(storage: Pick<Storage, 'readImage' | 'readAttachment'>, snapshot: TextExportSnapshot): Promise<PreparedPack> {
  const refs = /\.md$/i.test(snapshot.relativePath) ? scanPackReferences(snapshot.content, snapshot.relativePath) : []
  const paths = [...new Set(refs.map(ref => ref.path))], assets: PackAsset[] = []
  if (paths.length > 24) throw new Error('一次最多携带 24 个不同附件，请分批整理。')
  let bytes = 0, pixels = 0
  for (const path of paths) {
    try {
      const identity = { rootId: snapshot.rootId, relativePath: path }
      let base64: string
      if (refs.some(ref => ref.path === path && ref.image)) {
        const image = await storage.readImage(identity); pixels += image.width * image.height
        if (pixels > 12000000) throw new Error('图片总量超过本次 1,200 万像素预算')
        base64 = image.dataUrl.split(',')[1] || ''
      } else base64 = (await storage.readAttachment(identity)).base64
      const data = base64Bytes(base64); bytes += data.length
      if (data.length > 2 * 1024 * 1024 || bytes > 8 * 1024 * 1024) throw new Error('每个附件最多 2 MiB，附件合计最多 8 MiB')
      assets.push({ sourcePath: path, archivePath: assetName(path, assets.length), base64, bytes: data.length, digest: await hashBytes(data) })
    } catch (error) { throw new Error(`无法携带「${path}」：${String(error).replace(/^Error: /, '').replace(/^[A-Z_]+:\s*/, '')}。正文和附件未改动。`) }
  }
  let content = snapshot.content
  for (const ref of [...refs].reverse()) {
    const asset = assets.find(asset => asset.sourcePath === ref.path)!, title = ref.title ? ` "${ref.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')}"` : ''
    content = content.slice(0, ref.from) + `${ref.label}(<${asset.archivePath.split('/').map(encodeURIComponent).join('/')}${ref.suffix}>${title})` + content.slice(ref.to)
  }
  if (new TextEncoder().encode(content).length > 4 * 1024 * 1024) throw new Error('改写引用后正文超过 4 MiB，请精简后重试。')
  return { packId: snapshot.recoveryId, rootId: snapshot.rootId, relativePath: snapshot.relativePath, content, assets }
}
export function packArchive(pack: PreparedPack) {
  const encode = (value: string) => new TextEncoder().encode(value), prefix = 'note.textbundle/'
  return storedZip([{ name: prefix + 'info.json', bytes: encode(JSON.stringify({ version: 2, type: /\.md$/i.test(pack.relativePath) ? 'net.daringfireball.markdown' : 'public.plain-text', creatorIdentifier: 'com.longyuye.mdreader' })) },
    { name: prefix + (/\.md$/i.test(pack.relativePath) ? 'text.markdown' : 'text.txt'), bytes: encode(pack.content) },
    ...pack.assets.map(asset => ({ name: prefix + asset.archivePath, bytes: base64Bytes(asset.base64) }))])
}
