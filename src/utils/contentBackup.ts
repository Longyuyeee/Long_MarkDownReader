import type { PortableWorkSession } from './portableWorkSession'
export interface ContentBackupOptions { directory: string; documents: boolean; attachments: boolean; annotations: boolean; history: boolean }
export interface ContentBackupEntry { path: string; relativePath: string; category: string; bytes: number; sha256: string; modifiedNanos: number; sourceRelative: string | null }
export interface ContentBackupSummary { workSession?: PortableWorkSession | null; planId: string; libraryName: string; createdAt: number; totalBytes: number; entryCount: number; counts: Record<string, number>; entries: ContentBackupEntry[]; previewTruncated: boolean; excludedCount: number; excluded: { path: string; reason: string }[]; boundary: string[]; sha256: string | null; maxTotalBytes: number; maxFileBytes: number; scopeDirectory: string }
export interface ContentBackupReceipt { workSession?: PortableWorkSession | null; path: string; sha256: string; bytes: number; entryCount: number; historyCount: number; status: 'completed'; sourceUnchanged: boolean }
export interface ContentRestoreTarget { path: string; availableBytes: number; requiredBytes: number; historyCount: number }
export const contentCategories = [ ['documents','文档'], ['attachments','附件'], ['annotations','PDF 批注'], ['history','历史条目'] ] as const
export function contentBytes(value: number): string { return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 ** 2).toFixed(1)} MiB` }
export function contentPathKey(value: string): string { return value.replace(/^\\\\\?\\/, '').replace(/\\/g,'/').replace(/\/+$/,'').toLocaleLowerCase() }
export function contentScopeRelative(root: string, selected: string): string {
  const normalized = selected.replace(/^\\\\\?\\/, '').replace(/\\/g,'/').replace(/\/+$/,'')
  const rootPath = root.replace(/^\\\\\?\\/, '').replace(/\\/g,'/').replace(/\/+$/,'')
  if (contentPathKey(normalized) === contentPathKey(rootPath)) return ''
  if (!contentPathKey(normalized).startsWith(contentPathKey(rootPath) + '/')) throw new Error('请选择当前资料库内部的子目录')
  const relative = normalized.slice(rootPath.length + 1)
  if (relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('目录包含无效跳转，请重新选择')
  return relative
}
export function contentRestorePath(parent: string, name: string): string {
  const trimmed = name.trim()
  if (!parent || !trimmed || trimmed !== name || /[<>:"/\\|?*\u0000-\u001f]/.test(trimmed) || /[. ]$/.test(trimmed) || trimmed.startsWith('.')) return ''
  return parent.replace(/[\\/]+$/,'') + '\\' + trimmed
}
