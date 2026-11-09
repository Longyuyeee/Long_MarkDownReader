import { decodeImportedText, importedFileName } from './textImport.ts'
import { bytesBase64, hashBytes, scanPackReferences } from './portablePack.ts'
import { imageFileInfo } from './imageFile.ts'

export interface ImportedPackAsset { path: string; bytes: number; digest: string; width?: number; height?: number }
export interface PackImportSummary { id: string; name: string; created: number; bytes: number; status: 'preparing' | 'ready' | 'imported' | 'failed'; readable: boolean; error: string; localPath: string | null; count: number; incoming?: boolean; source?: 'picker' | 'open' | 'share-file' }
export interface PackImportRecord extends PackImportSummary { content: string | null; textName: string; assets: ImportedPackAsset[]; archiveDigest: string }
export interface ParsedPack { content: string; textName: string; assets: ImportedPackAsset[]; files: Map<string, Uint8Array> }
export const packImportLimit = 13 * 1024 * 1024
export function packImportName(name: string) {
  if (!/\.(?:textpack(?:\.zip)?|zip)$/i.test(name)) throw new Error('请选择 TextPack（.textpack）或包含单份 TextBundle V2 笔记的 ZIP 文件，原文件不会改动。')
  return Array.from(name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')).slice(0, 120).join('')
}
export function packImportTarget(name: string, id: string, textName: string) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id)) throw new Error('附件包记录编号无效')
  const base = name.replace(/\.(?:textpack(?:\.zip)?|zip)$/i, '').replace(/-附件包$/, ''), note = importedFileName(base + (textName === 'text.txt' ? '.txt' : '.md'))
  const folder = `${note.slice(0, -(/\.md$/.test(note) ? 3 : 4))}-附件-${id}`
  return { folder, note, path: `${folder}/${note}` }
}
export function validatePackContent(content: string, textName: string, assets: ImportedPackAsset[]) {
  if (textName === 'text.txt') return
  for (const ref of scanPackReferences(content, 'text.md')) {
    const asset = assets.find(asset => asset.path === ref.path)
    if (!ref.path.startsWith('assets/') || !asset) throw new Error(`缺少包内附件「${ref.path}」，请在来源中补齐后重新导入。`)
    if (ref.image && (!/\.(png|jpe?g|webp)$/i.test(asset.path) || !asset.width || !asset.height)) throw new Error(`图片「${asset.path}」暂不支持，当前支持 PNG、JPEG 和 WebP。`)
  }
}
export const crc32 = (bytes: Uint8Array) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0) } return (value ^ 0xffffffff) >>> 0 }
interface ZipMember { name: string; size: number; compressed: number; method: number; crc: number; local: number; start: number; end: number }
const problem = (): never => { throw new Error('附件包的 ZIP 结构无效、加密或含有不支持的条目，请重新导出标准 TextPack V2。') }
function safePath(name: string) {
  const parts = name.replace(/\/$/, '').split('/')
  if (!name || new TextEncoder().encode(name).length > 1024 || parts.length > 8 || parts.some(part => !part || part === '.' || part === '..' || /[\\:\x00-\x1f\x7f]/.test(part) || new TextEncoder().encode(part).length > 200)) throw new Error('附件包含有不安全或过长的路径，没有写入任何笔记。')
}
/** Inspect central and local headers before inflating anything. Paths are data,
 * never extraction destinations. Reject aliases, overlaps, ZIP64 and symlinks. */
export function zipMembers(bytes: Uint8Array): ZipMember[] {
  if (bytes.length > packImportLimit || bytes.length < 22) throw new Error('附件包支持 13 MiB 以内的完整 ZIP 文件。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = (at: number) => view.getUint16(at, true), u32 = (at: number) => view.getUint32(at, true)
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) { end = at; break }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) problem()
  const count = u16(end + 10), start = u32(end + 16), size = u32(end + 12)
  if (!count || count > 96 || start + size !== end) problem()
  const decoder = new TextDecoder('utf-8', { fatal: true }), members: ZipMember[] = [], names = new Map<string, boolean>()
  let cursor = start, total = 0
  const extra = (from: number, length: number) => { const last = from + length; while (from < last) { if (from + 4 > last || u16(from) === 1) problem(); from += 4 + u16(from + 2); if (from > last) problem() } }
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) problem()
    const flags = u16(cursor + 8), method = u16(cursor + 10), compressed = u32(cursor + 20), size = u32(cursor + 24), nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32), local = u32(cursor + 42), mode = (u32(cursor + 38) >>> 16) & 0xf000
    if (flags & ~0x80e || ![0, 8].includes(method) || u16(cursor + 34) || cursor + 46 + nameLength + extraLength + commentLength > end || compressed === 0xffffffff || size === 0xffffffff || ![0, 0x4000, 0x8000].includes(mode)) problem()
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength), name = decoder.decode(rawName); safePath(name)
    const key = name.replace(/\/$/, '').normalize('NFC').toLowerCase(), directory = name.endsWith('/')
    if (names.has(key) || directory && size !== 0 || mode === 0x4000 && !directory) problem()
    names.set(key, directory); total += size
    if (total > packImportLimit) throw new Error('附件包展开后的内容超过 13 MiB，没有写入任何笔记。')
    extra(cursor + 46 + nameLength, extraLength)
    if (local + 30 > start || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameLength) problem()
    const localExtra = u16(local + 28), data = local + 30 + nameLength + localExtra
    if (data + compressed > start || rawName.some((byte, i) => bytes[local + 30 + i] !== byte)) problem()
    if (!(flags & 8) && (u32(local + 14) !== u32(cursor + 16) || u32(local + 18) !== compressed || u32(local + 22) !== size)) problem()
    extra(local + 30 + nameLength, localExtra)
    members.push({ name, size, compressed, method, crc: u32(cursor + 16), local, start: data, end: data + compressed }); cursor += 46 + nameLength + extraLength + commentLength
  }
  if (cursor !== end) problem()
  const ordered = [...members].sort((a, b) => a.local - b.local)
  if (ordered[0]?.local !== 0) problem()
  for (let index = 1; index < ordered.length; index++) if (ordered[index]!.local < ordered[index - 1]!.end) problem()
  for (const [name, directory] of names) if (!directory && [...names.keys()].some(other => other.startsWith(name + '/'))) problem()
  return members
}
async function inflateMember(archive: Uint8Array, member: ZipMember, maximum: number) {
  if (member.size > maximum) throw new Error(`附件「${member.name}」超过本次大小限制。`)
  const source = archive.subarray(member.start, member.end)
  let result: Uint8Array
  if (member.method === 0) result = source
  else {
    // Small input pulls bound expansion produced by the platform decoder before
    // the consumer gets a chance to reject a lying uncompressed-size header.
    let offset = 0
    const input = new ReadableStream<Uint8Array>({ pull(controller) { if (offset >= source.length) controller.close(); else { controller.enqueue(source.subarray(offset, offset + 512)); offset += 512 } } })
    const reader = input.pipeThrough(new DecompressionStream('deflate-raw' as 'deflate')).getReader(), chunks: Uint8Array[] = []; let length = 0
    try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > maximum || length > member.size) throw new Error('附件包实际展开大小超限，没有写入任何笔记。'); chunks.push(value) } }
    catch (error) { await reader.cancel().catch(() => {}); throw error }
    result = new Uint8Array(length); let at = 0; for (const chunk of chunks) { result.set(chunk, at); at += chunk.length }
  }
  if (result.length !== member.size || crc32(result) !== member.crc) throw new Error(`附件包成员「${member.name}」大小或 CRC 核对失败。`)
  return result
}
export async function parseImportedPack(archive: Uint8Array): Promise<ParsedPack> {
  const members = zipMembers(archive), useful = members.filter(member => !member.name.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(member.name)), files = useful.filter(member => !member.name.endsWith('/'))
  const bundled = files[0]?.name.split('/')[0]?.endsWith('.textbundle'), prefix = bundled ? files[0]!.name.split('/')[0] + '/' : ''
  if (!files.length || useful.some(member => prefix && member.name !== prefix && !member.name.startsWith(prefix))) problem()
  const result = new Map<string, Uint8Array>(); let assetBytes = 0, ignoredBytes = 0
  for (const member of members) {
    const name = member.name.slice(prefix.length), ignored = !useful.includes(member), isAsset = name.startsWith('assets/') && !name.endsWith('/')
    if (ignored) { ignoredBytes += member.size; if (ignoredBytes > 256 * 1024) throw new Error('附件包附带的系统元数据超过限制。'); await inflateMember(archive, member, 64 * 1024); continue }
    if (member.name.endsWith('/')) { await inflateMember(archive, member, 0); continue }
    if (!['info.json', 'text.md', 'text.markdown', 'text.txt'].includes(name) && !isAsset) throw new Error(`附件包包含不支持的文件「${name}」。`)
    const data = await inflateMember(archive, member, name === 'info.json' ? 64 * 1024 : isAsset ? 2 * 1024 * 1024 : 4 * 1024 * 1024)
    if (isAsset) { assetBytes += data.length; if (assetBytes > 8 * 1024 * 1024) throw new Error('附件合计超过 8 MiB。') }
    result.set(name, data)
  }
  const texts = ['text.md', 'text.markdown', 'text.txt'].filter(name => result.has(name)), infoBytes = result.get('info.json')
  if (texts.length !== 1 || !infoBytes) throw new Error('附件包需要一份正文和 info.json，无法导入多个笔记或缺失正文的包。')
  let info: { version?: unknown; type?: unknown }
  try { info = JSON.parse(decodeImportedText(infoBytes).replace(/^\ufeff/, '')); if (!info || typeof info !== 'object' || Array.isArray(info)) throw new Error() }
  catch { throw new Error('附件包 info.json 元信息无法读取，请重新导出标准 TextPack V2。') }
  const textName = texts[0]!, type = info.type ?? 'net.daringfireball.markdown'
  if (info.version !== 2 || type !== (textName === 'text.txt' ? 'public.plain-text' : 'net.daringfireball.markdown')) throw new Error('当前支持 TextBundle V2 的 Markdown / TXT 附件包。')
  const content = decodeImportedText(result.get(textName)!), assets: ImportedPackAsset[] = []; let pixels = 0
  for (const [name, data] of result) if (name.startsWith('assets/')) {
    if (assets.length >= 24) throw new Error('一次最多导入 24 个附件。')
    const asset: ImportedPackAsset = { path: name, bytes: data.length, digest: await hashBytes(data) }
    if (/\.(png|jpe?g|webp)$/i.test(name)) {
      const image = imageFileInfo(data); asset.width = image.width; asset.height = image.height; pixels += image.width * image.height
      if (pixels > 12000000) throw new Error('图片总量超过本次 1,200 万像素预算。')
      if (typeof createImageBitmap === 'function') {
        let decoded: ImageBitmap | undefined
        try { decoded = await createImageBitmap(new Blob([data], { type: image.mime })); if (decoded.width !== image.width || decoded.height !== image.height) throw new Error() }
        catch { throw new Error(`包内图片「${name}」无法正常解码，请重新导出。`) }
        finally { decoded?.close() }
      }
    }
    assets.push(asset)
  }
  validatePackContent(content, textName, assets)
  return { content, textName, assets, files: result }
}
export const importedImageData = (_path: string, bytes: Uint8Array) => `data:${imageFileInfo(bytes).mime};base64,${bytesBase64(bytes)}`
