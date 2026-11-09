import { mobileTextPattern, textFileExtension } from './codeFormats.ts'
/** A fixed text snapshot: exporting must never commit or clear the source draft. */
export interface TextExportSnapshot {
  readonly recoveryId: string
  readonly rootId: string
  readonly relativePath: string
  readonly content: string
  readonly expectedSignature: string | null
  readonly revision: number
  readonly dirty: boolean
}
export interface TextExportResult {
  exported?: boolean; cancelled?: boolean; retained?: boolean
  /** Provider display name after exported bytes were verified; never a filesystem path. */
  displayName?: string | null
}

export function textExportName(path: string): string {
  const name = path.split('/').pop() || '笔记.txt'
  const extension = textFileExtension(name).toLowerCase() || '.txt'
  const base = name.replace(mobileTextPattern, '').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').trim()
  const points = Array.from(base).slice(0, 60), encoder = new TextEncoder()
  while (encoder.encode(points.join('')).length > 220) points.pop()
  return `${points.join('') || '笔记'}-导出副本${extension}`
}

export function captureTextExport(input: Omit<TextExportSnapshot, 'recoveryId'>): TextExportSnapshot {
  if (!input.relativePath || !mobileTextPattern.test(input.relativePath)) throw new Error('这个文件暂不支持导出文字副本。')
  if (new TextEncoder().encode(input.content).length > 4 * 1024 * 1024) throw new Error('导出支持 4 MiB 以内的文本')
  return Object.freeze({ ...input, recoveryId: crypto.randomUUID() })
}
