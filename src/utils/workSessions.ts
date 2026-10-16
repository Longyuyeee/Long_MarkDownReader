export interface SessionTab { id: string; path: string; title: string; isDirty: false; pinned?: boolean }
export interface WorkSession {
  version: 1
  id: string
  name: string
  libraryRoot: string
  tabs: SessionTab[]
  activeTabId: string | null
  savedAt: number
  search?: { query: string; types: string[]; selected: string; scroll: number; loadedFiles?: number; sort?: 'relevance' | 'modified' }
  views?: Record<string, { scrollTop: number; scrollLeft: number; section?: string; zoom?: number }>
  reference?: { path: string; title: string; query: string; page?: number; annotationId?: string }
}
const identity = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
// Windows canonicalize returns extended paths even when the configured root is
// ordinary. Normalize only membership checks; retain existing storage keys.
const membershipIdentity = (path: string) => identity(path).replace(/^\/\/\?\/unc\//, '//').replace(/^\/\/\?\//, '')
export const workSessionKey = (root: string) => `longedit.work-sessions.v1:${encodeURIComponent(identity(root))}`
export const libraryTabsKey = (root: string) => `longedit.tabs.v2:${encodeURIComponent(identity(root))}`
export function belongsToLibrary(root: string, path: unknown): path is string {
  if (!root || typeof path !== 'string') return false
  const normalized = membershipIdentity(path)
  return normalized.startsWith(`${membershipIdentity(root)}/`) && !normalized.split('/').some(part => part === '.' || part === '..')
}
export function sessionTabs(root: string, tabs: unknown): SessionTab[] {
  if (!Array.isArray(tabs)) return []
  const seen = new Set<string>()
  return tabs.filter(tab => {
    if (!tab || tab.external || !belongsToLibrary(root, tab.path) || seen.has(identity(tab.path))) return false
    seen.add(identity(tab.path)); return true
  }).map(tab => ({ id: tab.path, path: tab.path, title: typeof tab.title === 'string' ? tab.title : tab.path.split(/[\\/]/).pop()!, isDirty: false, ...(tab.pinned === true ? { pinned: true } : {}) }))
}
export function captureWorkSession(root: string, tabs: unknown, active: string | null, name: string): WorkSession {
  if (!root || !name.trim()) throw new Error('请填写现场名称并选择资料库')
  const entries = sessionTabs(root, tabs)
  return { version: 1, id: crypto.randomUUID(), name: name.trim().slice(0, 60), libraryRoot: root, tabs: entries,
    activeTabId: entries.some(tab => tab.path === active) ? active : entries[0]?.path || null, savedAt: Date.now() }
}
export function readWorkSessions(storage: Pick<Storage, 'getItem'>, root: string): WorkSession[] {
  const raw = storage.getItem(workSessionKey(root))
  if (!raw) return []
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some(item => !item || item.version !== 1 || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.libraryRoot !== 'string' || identity(item.libraryRoot) !== identity(root))) {
    throw new Error('工作现场记录格式不兼容，原记录已保留')
  }
  return parsed.map(item => {
    const tabs = sessionTabs(root, item.tabs)
    return { ...item, tabs, activeTabId: tabs.some(tab => tab.path === item.activeTabId) ? item.activeTabId : tabs[0]?.path || null }
  })
}
export function saveWorkSession(storage: Pick<Storage, 'getItem' | 'setItem'>, session: WorkSession): WorkSession[] {
  const current = readWorkSessions(storage, session.libraryRoot)
  if (current.some(item => item.name.toLowerCase() === session.name.toLowerCase())) throw new Error('已有同名工作现场，请使用不同名称')
  if (current.length >= 32) throw new Error('最多保存 32 个工作现场')
  const next = [session, ...current]
  storage.setItem(workSessionKey(session.libraryRoot), JSON.stringify(next))
  return next
}
export function mergeSessionTabs<T extends { path: string; isDirty: boolean }>(current: T[], restored: SessionTab[]): (T | SessionTab)[] {
  const dirty = current.filter(tab => tab.isDirty)
  const retained = new Set(dirty.map(tab => identity(tab.path)))
  return [...restored.filter(tab => !retained.has(identity(tab.path))), ...dirty]
}
export function editWorkSession(storage: Pick<Storage, 'getItem' | 'setItem'>, root: string, expected: WorkSession, name: string | null): WorkSession[] {
  const current = readWorkSessions(storage, root)
  const found = current.find(item => item.id === expected.id)
  if (!found || JSON.stringify(found) !== JSON.stringify(expected)) throw new Error('工作现场已变化，请重新选择')
  const normalized = name?.trim().slice(0, 60)
  if (name !== null && !normalized) throw new Error('名称不能为空')
  if (normalized && current.some(item => item.id !== expected.id && item.name.toLowerCase() === normalized.toLowerCase())) throw new Error('已有同名工作现场')
  const next = name === null ? current.filter(item => item.id !== expected.id) : current.map(item => item.id === expected.id ? { ...item, name: normalized! } : item)
  storage.setItem(workSessionKey(root), JSON.stringify(next))
  return next
}
