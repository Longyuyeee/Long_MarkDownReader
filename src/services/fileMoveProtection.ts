import { fileStylePathKey } from '../utils/fileDisplayStyles'
import { snapshotWindowDrafts, dirtyDocumentPaths, pendingDocumentSaves } from './windowDrafts'
import { invoke } from './tauriRuntime'
export interface FileMoveNotice { root: string; oldPath: string; newPath: string; documents: string[] }
export const pathsOverlap = (a: string, b: string) => {
  const left = fileStylePathKey(a), right = fileStylePathKey(b)
  return Boolean(left && right && (left === right || left.startsWith(right + '/') || right.startsWith(left + '/')))
}
export const movedPath = (path: string, notice: FileMoveNotice) => {
  const key = fileStylePathKey(path), old = fileStylePathKey(notice.oldPath)
  const clean = (value: string) => value.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').replace(/\/+$/, '')
  return key === old || key.startsWith(old + '/') ? notice.newPath.replace(/[\\/]$/, '') + clean(path).slice(clean(notice.oldPath).length) : path
}
export function createFileMoveProtection(options: { ready: () => boolean; dirtyPaths: () => string[]; retainedDraftPaths?: () => string[]; referenceDrafts?: () => { path: string; content?: string }[]; activePath?: () => string; completed: (notice: FileMoveNotice) => Promise<void> }) {
  const requests = new Map<string, ReturnType<typeof setInterval>>()
  const completing = new Set<string>()
  let oldInert = false, oldCursor = '', focus: HTMLElement | null = null
  let composing = false
  const compositionStart = () => { composing = true }, compositionEnd = () => { composing = false }
  const stopInput = (event: Event) => { if (requests.size) { event.preventDefault(); event.stopImmediatePropagation() } }
  document.addEventListener('compositionstart', compositionStart, true); document.addEventListener('compositionend', compositionEnd, true)
  document.addEventListener('keydown', stopInput, true); document.addEventListener('beforeinput', stopInput, true)
  const release = async (requestId: string, notice?: FileMoveNotice | null) => {
    if (!requests.has(requestId) || completing.has(requestId)) return
    completing.add(requestId)
    try { if (notice) await options.completed(notice) }
    finally {
      clearInterval(requests.get(requestId)); requests.delete(requestId); completing.delete(requestId)
      if (!requests.size) {
        const app = document.body; if (app) app.inert = oldInert
        document.body.style.cursor = oldCursor
        if (focus?.isConnected) focus.focus({ preventScroll: true })
      }
      await invoke('acknowledge_file_move_release', { requestId }).catch(() => {})
    }
  }
  const protect = async (request: { requestId: string; libraryRoot?: string; paths: string[]; rewritePaths?: string[]; sourcePaths?: string[] }) => {
    if (requests.has(request.requestId)) return
    if (!requests.size) {
      focus = document.activeElement as HTMLElement | null; const app = document.body; oldInert = Boolean(app?.inert); if (app) app.inert = true
      oldCursor = document.body.style.cursor; document.body.style.cursor = 'progress'
    }
    requests.set(request.requestId, setInterval(() => {
      void invoke<{ active: boolean; notice: FileMoveNotice | null }>('file_move_protection_status', { requestId: request.requestId })
        .then(result => { if (!result.active) return release(request.requestId, result.notice) }).catch(() => {})
    }, 750))
    snapshotWindowDrafts()
    const rewrites = request.rewritePaths || request.paths, retained = options.retainedDraftPaths?.() || []
    const cached = options.dirtyPaths().filter(path => {
      const key = fileStylePathKey(path)
      const canRetain = retained.some(retained => key === fileStylePathKey(retained)) && (request.sourcePaths || []).some(source => key === fileStylePathKey(source) || key.startsWith(fileStylePathKey(source) + '/'))
      return !canRetain || rewrites.some(affected => pathsOverlap(path, affected))
    })
    const root = fileStylePathKey(request.libraryRoot || '')
    const active = options.activePath?.() || '', activeKey = fileStylePathKey(active)
    const dirty = [...new Set([...cached, ...dirtyDocumentPaths()])].filter(path => request.paths.some(affected => pathsOverlap(path, affected)))
    if (composing && active && (root ? activeKey.startsWith(root + '/') : request.paths.some(path => pathsOverlap(active, path)))) dirty.push(active)
    await invoke('reply_file_move_protection', {
      requestId: request.requestId, ready: options.ready() && pendingDocumentSaves.value === 0,
      dirtyPaths: dirty.map(path => path.split(/[\\/]/).pop() || path),
      drafts: (options.referenceDrafts?.() || []).filter(draft => {
        const root = fileStylePathKey(request.libraryRoot || ''), path = fileStylePathKey(draft.path)
        return root && (path === root || path.startsWith(root + '/'))
      }).map(draft => ({ path: draft.path, content: draft.content && draft.content.length <= 2 * 1024 * 1024 ? draft.content : draft.content === '' ? '' : undefined })),
    })
  }
  return { protect, release: (event: { requestId: string; notice?: FileMoveNotice | null }) => release(event.requestId, event.notice), dispose: () => {
    document.removeEventListener('compositionstart', compositionStart, true); document.removeEventListener('compositionend', compositionEnd, true)
    document.removeEventListener('keydown', stopInput, true); document.removeEventListener('beforeinput', stopInput, true)
    for (const timer of requests.values()) clearInterval(timer)
    if (requests.size) { const app = document.body; if (app) app.inert = oldInert; document.body.style.cursor = oldCursor }
    requests.clear()
  } }
}
