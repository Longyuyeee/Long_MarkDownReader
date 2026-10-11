import { belongsToLibrary } from '../utils/workSessions'
export interface WorkspaceReference { path: string; title: string; query: string; page?: number; annotationId?: string }
const key = (root: string) => `longedit.reference.v1:${encodeURIComponent(root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())}`
export function readWorkspaceReference(root: string): WorkspaceReference | undefined {
  try {
    const item = JSON.parse(localStorage.getItem(key(root)) || 'null')
    if (!item || !belongsToLibrary(root, item.path)) return undefined
    return { path: item.path, title: typeof item.title === 'string' ? item.title.slice(0, 500) : item.path,
      query: typeof item.query === 'string' ? item.query.slice(0, 500) : '',
      page: Number.isInteger(item.page) && item.page > 0 ? item.page : undefined,
      annotationId: typeof item.annotationId === 'string' ? item.annotationId : undefined }
  } catch { return undefined }
}
export function writeWorkspaceReference(root: string, item?: WorkspaceReference) {
  if (!root) return
  if (!item) { localStorage.removeItem(key(root)); return }
  if (!belongsToLibrary(root, item.path)) throw new Error('参考资料不属于当前资料库')
  const { path, title, query, page, annotationId } = item
  localStorage.setItem(key(root), JSON.stringify({ path, title, query, page, annotationId }))
}
