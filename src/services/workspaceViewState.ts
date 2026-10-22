export interface WorkspaceViewState {
  pdfAnnotations?: { signature:string; id:string; query:string; pages:string; kind:string; color:string; listPage:number; selection:string[]; scrollTop:number }
  scrollTop: number
  scrollLeft: number
  section?: string
  frozenColumns?: number
  zoom?: number
  fitWidth?: boolean
  sidebarOpen?: boolean
  sidebarTab?: string
  panelOpen?: boolean
  mode?: string
  panX?: number
  panY?: number
  selection?: string
  externalApplication?: string
  draft?: string
}

const MAX_ENTRIES = 24
const states = new Map<string, WorkspaceViewState>()
const VIEW_STORAGE_KEY = 'longedit.view-state.v1'
const SESSION_VIEW_KEY = 'longedit.session-view-state.v1'
const viewIdentity = (path: string) => path.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLowerCase()
let staged: Map<string, WorkspaceViewState> | undefined
// Route watchers/unmount hooks can finish after a successful move. Their old
// owner must not resurrect a stale bookmark (which would also break Undo Move).
const retiredViewOwners = new Set<string>()
const awaitingViewOwners = new Set<string>()
// Reading metadata contains locators only; annotation text and pending comments
// remain owned by the sidecar save flow, never the session/view cache.
const safePdfAnnotations = (value: unknown): WorkspaceViewState['pdfAnnotations'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const v = value as Record<string, unknown>
  if (typeof v.signature !== 'string' || !v.signature || v.signature.length > 1024) return
  const text = (key: string, limit: number) => typeof v[key] === 'string' ? (v[key] as string).slice(0, limit) : ''
  const position = (key: string) => typeof v[key] === 'number' && Number.isFinite(v[key]) ? Math.min(10_000_000, Math.max(0, Math.floor(v[key] as number))) : 0
  return {
    signature: v.signature, id: text('id', 200), query: text('query', 200), pages: text('pages', 512),
    kind: ['highlight', 'area', 'comment'].includes(String(v.kind)) ? String(v.kind) : '',
    color: ['yellow', 'green', 'blue', 'pink'].includes(String(v.color)) ? String(v.color) : '',
    listPage: position('listPage'), scrollTop: position('scrollTop'),
    selection: Array.isArray(v.selection) ? [...new Set(v.selection.slice(0, 200).filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200))] : [],
  }
}
const safeView = (state: WorkspaceViewState): WorkspaceViewState => {
  const view: WorkspaceViewState = { scrollTop: Number.isFinite(state.scrollTop) ? Math.max(0, state.scrollTop) : 0, scrollLeft: Number.isFinite(state.scrollLeft) ? Math.max(0, state.scrollLeft) : 0 }
  for (const key of ['zoom', 'frozenColumns', 'panX', 'panY'] as const) if (typeof state[key] === 'number' && Number.isFinite(state[key])) view[key] = state[key]
  for (const key of ['fitWidth', 'sidebarOpen', 'panelOpen'] as const) if (typeof state[key] === 'boolean') view[key] = state[key]
  for (const key of ['section', 'sidebarTab', 'mode', 'externalApplication'] as const) if (typeof state[key] === 'string') view[key] = state[key].slice(0, 500)
  const pdfAnnotations = safePdfAnnotations(state.pdfAnnotations)
  if (pdfAnnotations) view.pdfAnnotations = pdfAnnotations
  return view
}
export const workspaceViewMetadata = safeView

// Each receipt is applied to the original keys once, never to an already mapped
// destination. Keep destination records when a deleted/replaced file had a view.
export const relocateViewEntries = <T>(entries: Record<string, T>, mapPath: (path: string) => string) => {
  const next = { ...entries }, occupied = new Map(Object.keys(entries).map(path => [viewIdentity(path), path]))
  let conflicts = 0
  for (const [path, value] of Object.entries(entries)) {
    const target = mapPath(path)
    if (target === path) continue
    const existing = occupied.get(viewIdentity(target))
    if (existing && existing !== path) { conflicts++; continue }
    delete next[path]; next[target] = value
    occupied.set(viewIdentity(target), target)
  }
  return { entries: next, conflicts }
}

export const relocateWorkspaceViewStates = (mapPath: (path: string) => string) => {
  let issues = 0
  const retire = (paths: string[]) => {
    for (const path of paths) {
      const target = mapPath(path)
      if (target === path) continue
      retiredViewOwners.add(viewIdentity(path)); retiredViewOwners.delete(viewIdentity(target))
      awaitingViewOwners.add(viewIdentity(target)); awaitingViewOwners.delete(viewIdentity(path))
    }
    while (retiredViewOwners.size > 256) retiredViewOwners.delete(retiredViewOwners.values().next().value!)
    while (awaitingViewOwners.size > 256) awaitingViewOwners.delete(awaitingViewOwners.values().next().value!)
  }
  // Persistent metadata is changed before live state. Corrupt records are kept
  // verbatim, and a quota error must not turn a completed move into a failure.
  for (const key of [VIEW_STORAGE_KEY, SESSION_VIEW_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Invalid reading metadata')
      retire(Object.keys(parsed))
      const result = relocateViewEntries(parsed, mapPath)
      issues += result.conflicts
      if (JSON.stringify(result.entries) !== raw) localStorage.setItem(key, JSON.stringify(result.entries))
    } catch { issues++ }
  }
  retire([...states.keys(), ...(staged?.keys() || [])])
  const live = relocateViewEntries(Object.fromEntries(states), mapPath)
  issues += live.conflicts
  // Moving a location never transfers in-memory conversion drafts/selection.
  for (const path of Object.keys(live.entries)) if (!states.has(path)) live.entries[path] = safeView(live.entries[path])
  const draftOwners = [...states].filter(([path, value]) => mapPath(path) !== path && (value.draft !== undefined || value.selection !== undefined))
  for (const [path, value] of draftOwners) {
    const target = mapPath(path)
    if (!states.has(target)) delete live.entries[target]
    live.entries[path] = value
  }
  states.clear(); for (const [path, value] of Object.entries(live.entries)) states.set(path, value)
  if (staged) {
    const result = relocateViewEntries(Object.fromEntries(staged), mapPath)
    issues += result.conflicts
    staged = new Map(Object.entries(result.entries).map(([path, value]) => [viewIdentity(path), safeView(value)]))
  }
  return issues
}
const readStoredViews = (): Record<string, WorkspaceViewState> => {
  try {
    const raw = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || '{}') : {}
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).slice(-MAX_ENTRIES).filter(([, value]) => value && typeof value === 'object').map(([path, value]) => [path, safeView(value as WorkspaceViewState)]))
  } catch { return {} }
}

const stagedViews = () => {
  if (staged) return staged
  staged = new Map()
  try {
    const saved = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(SESSION_VIEW_KEY) || 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [path, value] of Object.entries(saved).slice(0, 128)) {
      const view = value as WorkspaceViewState
      if (view && Number.isFinite(view.scrollTop) && Number.isFinite(view.scrollLeft)) staged.set(viewIdentity(path), safeView(view))
    }
  } catch { /* Preserve unreadable storage. Named scenes remain repairable. */ }
  return staged
}

// A bounded metadata queue, not an expanded editor/draft cache. Do not eagerly
// insert 128 positions into the existing 24-item live cache and evict the first.
export const stageWorkspaceViewStates = (views: Record<string, WorkspaceViewState>, paths: string[]) => {
  if (paths.length > 128) throw Error('一次最多恢复 128 份文件的阅读位置')
  const previous = new Map(stagedViews()), live = new Map(states)
  const oldRaw = localStorage.getItem(SESSION_VIEW_KEY)
  const entries = Object.entries(views), next = new Map(stagedViews())
  for (const path of paths) {
    const value = views[path] || entries.find(([key]) => viewIdentity(key) === viewIdentity(path))?.[1]
    if (value && Number.isFinite(value.scrollTop) && Number.isFinite(value.scrollLeft)) {
      next.delete(viewIdentity(path)); next.set(viewIdentity(path), safeView(value))
    }
  }
  while (next.size > 128) next.delete(next.keys().next().value!)
  // Fail before touching live models/cache when storage is unavailable.
  localStorage.setItem(SESSION_VIEW_KEY, JSON.stringify(Object.fromEntries(next)))
  staged = next
  const identities = new Set(paths.map(viewIdentity))
  for (const key of states.keys()) if (identities.has(viewIdentity(key))) states.delete(key)
  return () => {
    try { if (oldRaw === null) localStorage.removeItem(SESSION_VIEW_KEY); else localStorage.setItem(SESSION_VIEW_KEY, oldRaw) }
    finally { staged = previous; states.clear(); for (const [key, value] of live) states.set(key, value) }
  }
}

// Named sessions contain only view metadata, never editor drafts or cell values.
export const captureWorkspaceViewStates = (paths: string[]) => Object.fromEntries(paths.flatMap(path => {
  const state = recallWorkspaceViewState(path)
  if (!state) return []
  return [[path, safeView(state)]]
}))

export const restoreWorkspaceViewStates = (views: Record<string, WorkspaceViewState>, paths: string[]) => {
  for (const path of paths) {
    const view = views[path]
    if (!view || !Number.isFinite(view.scrollTop) || !Number.isFinite(view.scrollLeft)) continue
    retiredViewOwners.delete(viewIdentity(path)); awaitingViewOwners.delete(viewIdentity(path))
    rememberWorkspaceViewState(path, safeView(view))
  }
}

export const rememberWorkspaceViewState = (path: string, state: WorkspaceViewState) => {
  if (!path || retiredViewOwners.has(viewIdentity(path)) || awaitingViewOwners.has(viewIdentity(path))) return
  states.delete(path)
  states.set(path, { ...state, pdfAnnotations: safePdfAnnotations(state.pdfAnnotations) })
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = readStoredViews()
      delete saved[path]; saved[path] = safeView(state)
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-MAX_ENTRIES))))
      if (stagedViews().has(viewIdentity(path))) {
        stagedViews().set(viewIdentity(path), safeView(state))
        localStorage.setItem(SESSION_VIEW_KEY, JSON.stringify(Object.fromEntries(stagedViews())))
      }
    }
  } catch { /* Reading positions must not block editing when storage is unavailable. */ }
  while (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next().value
    if (typeof oldest !== 'string') break
    states.delete(oldest)
  }
}

export const recallWorkspaceViewState = (path: string) => {
  const id = viewIdentity(path)
  // Opening that location again establishes a new owner, including a recreated
  // file or the destination of Undo Move. Old components never call recall.
  retiredViewOwners.delete(id)
  awaitingViewOwners.delete(id)
  const state = states.get(path) || [...states].find(([key]) => viewIdentity(key) === id)?.[1] || stagedViews().get(id) || Object.entries(readStoredViews()).find(([key]) => viewIdentity(key) === id)?.[1]
  return state ? { ...state, pdfAnnotations: safePdfAnnotations(state.pdfAnnotations) } : undefined
}
