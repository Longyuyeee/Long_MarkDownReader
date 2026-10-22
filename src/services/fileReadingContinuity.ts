import { belongsToLibrary, readWorkSessions, safeSessionSearch, workSessionKey, type WorkSessionSearch } from '../utils/workSessions'
import { movedPath, type FileMoveNotice } from './fileMoveProtection'
import { relocateViewEntries, relocateWorkspaceViewStates, workspaceViewMetadata, type WorkspaceViewState } from './workspaceViewState'

const rootKey = (root: string) => encodeURIComponent(root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())
const cleanRoot = (root: string) => root.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '')
const basename = (path: string) => path.split(/[\\/]/).pop() || path
export const relocateSearchMetadata = (value: unknown, mapPath: (path: string) => string): WorkSessionSearch | undefined => {
  const search = safeSessionSearch(value)
  if (search?.selection) search.selection = [mapPath(search.selection[0]), ...search.selection.slice(1)] as typeof search.selection
  return search
}

// File bytes and editor drafts remain owned by the existing native move flow.
// Run before changing the live route, so the next editor can recall its view.
export function continueFileReading(notice: FileMoveNotice) {
  if (notice.contentOnly || !belongsToLibrary(notice.root, notice.oldPath) || !belongsToLibrary(notice.root, notice.newPath)) return 0
  const mapPath = (path: string) => belongsToLibrary(notice.root, path) ? movedPath(path, notice) : path
  let issues = relocateWorkspaceViewStates(mapPath)
  const update = (key: string, transform: (value: any) => unknown) => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const next = JSON.stringify(transform(JSON.parse(raw)))
      if (typeof next !== 'string') throw Error('Invalid reading metadata')
      if (next !== raw) localStorage.setItem(key, next)
    } catch { issues++ }
  }
  for (const root of new Map([notice.root, cleanRoot(notice.root)].map(root => [rootKey(root), root])).values()) {
    update(workSessionKey(root), () => readWorkSessions(localStorage, root).map(session => {
      const tabs = session.tabs.map(tab => {
        const path = mapPath(tab.path)
        return path === tab.path ? tab : { ...tab, id: path, path, title: basename(path) }
      })
      if (new Set(tabs.map(tab => rootKey(cleanRoot(tab.path)))).size !== tabs.length) { issues++; return session }
      const views = relocateViewEntries(Object.fromEntries(Object.entries(session.views || {}).map(([path, value]) => [path, workspaceViewMetadata(value as WorkspaceViewState)])), mapPath)
      issues += views.conflicts
      const referencePath = session.reference && mapPath(session.reference.path)
      return { ...session, tabs, activeTabId: session.activeTabId && mapPath(session.activeTabId),
        ...(session.views ? { views: views.entries } : {}), search: relocateSearchMetadata(session.search, mapPath),
        ...(session.reference ? { reference: { ...session.reference, path: referencePath!, title: referencePath === session.reference.path ? session.reference.title : basename(referencePath!) } } : {}),
      }
    }))
    update(`longedit.search.v1:${rootKey(root)}`, value => relocateSearchMetadata(value, mapPath))
    update(`longedit.reference.v1:${rootKey(root)}`, value => {
      if (!value || !belongsToLibrary(notice.root, value.path)) throw Error('Invalid reference metadata')
      const path = mapPath(value.path)
      return path === value.path ? value : { ...value, path, title: basename(path) }
    })
  }
  // Older PDF page bookmarks use root + newline + path rather than view keys.
  update('longedit.pdf.positions.v1', value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid PDF position metadata')
    const result = relocateViewEntries(value, key => {
      const split = key.indexOf('\n')
      if (split < 0 || rootKey(cleanRoot(key.slice(0, split))) !== rootKey(cleanRoot(notice.root))) return key
      return key.slice(0, split + 1) + mapPath(key.slice(split + 1))
    })
    issues += result.conflicts
    return result.entries
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('longedit:reading-paths-changed', { detail: { root: cleanRoot(notice.root), mapPath } }))
  return issues
}
