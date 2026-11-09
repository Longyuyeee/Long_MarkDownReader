import type { PdfImportSummary } from './pdfImport'
import type { PackImportSummary } from './packImport'
import { codeMimeFile, mobileTextPattern, textFileExtension } from './codeFormats.ts'

export interface FileImportSummary {
  id: string; name: string; created: number; bytes: number
  status: 'preparing' | 'ready' | 'imported' | 'failed'
  incoming?: boolean; source?: 'picker' | 'open' | 'share-file' | 'share-text'
  readable: boolean; error: string; localPath: string | null
}
export interface FileImportRecord extends FileImportSummary { content: string | null; digest: string | null }
export const importByteLimit = 4 * 1024 * 1024

export function importedFileName(name: string, mime = ''): string {
  const source = name.trim() || codeMimeFile(mime) || (mime.split(';')[0] === 'text/markdown' ? '导入笔记.md' : mime.split(';')[0] === 'application/json' ? '导入数据.json' : ['application/yaml', 'application/x-yaml', 'text/yaml', 'text/x-yaml'].includes(mime.split(';')[0]) ? '导入配置.yaml' : ['application/xml', 'text/xml'].includes(mime.split(';')[0]) ? '导入文档.xml' : ['application/toml', 'application/x-toml', 'text/toml', 'text/x-toml'].includes(mime.split(';')[0]) ? '导入配置.toml' : mime.split(';')[0] === 'text/plain' ? '导入文字.txt' : '')
  if (!mobileTextPattern.test(source)) throw new Error('请选择 Markdown、TXT、JSON、YAML、XML、TOML 或支持的源码文件，可在导入面板查看格式列表，原文件不会改动。')
  const extension = textFileExtension(source).toLowerCase()
  const points = Array.from(source.replace(mobileTextPattern, '').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').trim()).slice(0, 40)
  while (new TextEncoder().encode(points.join('')).length > 160) points.pop()
  return `${points.join('') || '导入笔记'}${extension}`
}
export function importedCopyName(name: string, id: string): string {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id)) throw new Error('导入记录编号无效')
  const safe = importedFileName(name)
  const extension = textFileExtension(safe)
  return `${safe.slice(0, -extension.length)}-导入-${id}${extension}`
}
export function decodeImportedText(bytes: Uint8Array): string {
  if (bytes.length > importByteLimit) throw new Error('当前支持 4 MiB 以内的文本，原文件未改动。')
  if (bytes.includes(0)) throw new Error('文件含有零字节，请选择 UTF-8 文本；原文件未改动。')
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new Error('当前仅导入 UTF-8 编码的文本，原文件未改动。') }
}

export interface IncomingStatus { entries: FileImportSummary[]; packs?: PackImportSummary[]; pdfs?: PdfImportSummary[]; error: string; errorKind?: 'text' | 'pack' | 'pdf' }
